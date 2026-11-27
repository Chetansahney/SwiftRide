const { Server } = require('socket.io');
const userModel = require('./models/user.models');
const captainModel = require('./models/captain.models');
const rideModel = require('./models/ride.model');
const { resolveAccount } = require('./middleware/auth.middleware');
const { isAllowedOrigin } = require('./config/env');
const { verifyToken } = require('./utils/tokens');
const dispatch = require('./services/dispatch');

let io;

const LOCATION_MIN_INTERVAL_MS = 2000; // a captain's phone sends at most one update every 2 s
const isCoordinate = (value, limit) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

// The socket has to prove who it is with the same login token as the API. The
// identity comes only from the token, never from what the client says.
async function authenticate(socket, token, expectedRole) {
    let role;
    try {
        role = verifyToken(token).role;
    } catch {
        return null;
    }
    if (expectedRole && role !== expectedRole) return null;
    const account = await resolveAccount(token, role);
    if (!account) return null;
    socket.data.role = role;
    socket.data.accountId = String(account._id);
    return account;
}

const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
            methods: ['GET', 'POST'],
        },
        maxHttpBufferSize: 16 * 1024, // location updates are tiny
    });

    // Token may come with the connection (handshake auth) or later with "join".
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (token) await authenticate(socket, token).catch(() => null);
        next();
    });

    // How the dispatcher reaches captains and riders.
    const sendTo = (model) => async (id, event, data) => {
        const account = await model.findById(id).select('socketId').catch(() => null);
        if (account?.socketId) io.to(account.socketId).emit(event, data);
    };
    dispatch.setNotifier({ toCaptain: sendTo(captainModel), toRider: sendTo(userModel) });

    io.on('connection', (socket) => {
        socket.on('join', async (data) => {
            try {
                const token = typeof data?.token === 'string' ? data.token : socket.handshake.auth?.token;
                const wanted = data?.userType === 'captain' ? 'captain' : 'user';
                const account = await authenticate(socket, token, wanted);
                if (!account) {
                    socket.emit('auth-error', { message: 'Please log in again.' });
                    return;
                }
                const model = wanted === 'captain' ? captainModel : userModel;
                await model.updateOne({ _id: account._id }, { socketId: socket.id });
            } catch (error) {
                console.error('Socket join failed:', error.message);
            }
        });

        socket.on('update-location-captain', async (data) => {
            if (socket.data.role !== 'captain' || !socket.data.accountId) return;
            const now = Date.now();
            if (now - (socket.data.lastLocationAt || 0) < LOCATION_MIN_INTERVAL_MS) return;
            socket.data.lastLocationAt = now;

            const { location, rideId } = data || {};
            if (!isCoordinate(location?.lat, 90) || !isCoordinate(location?.lng, 180)) return;

            try {
                const captainId = socket.data.accountId;
                // Online again unless they're on a ride.
                await captainModel.updateOne({ _id: captainId }, [
                    {
                        $set: {
                            location: { type: 'Point', coordinates: [location.lng, location.lat] },
                            h3: dispatch.cellOf(location.lat, location.lng),
                            lastSeenAt: '$$NOW',
                            status: { $cond: [{ $eq: ['$status', 'busy'] }, 'busy', 'available'] },
                        },
                    },
                ], { updatePipeline: true });

                // Only forward to the rider of this captain's own active ride.
                if (typeof rideId === 'string' && /^[a-f0-9]{24}$/.test(rideId)) {
                    const ride = await rideModel
                        .findOne({ _id: rideId, captain: captainId, status: { $in: ['accepted', 'ongoing'] } })
                        .populate('user', 'socketId');
                    if (ride?.user?.socketId) {
                        io.to(ride.user.socketId).emit('captain-location', { rideId, location: { lat: location.lat, lng: location.lng } });
                    }
                    // Pickup ETA for both apps (every 15 s / 100 m), in the background.
                    if (ride) dispatch.refreshApproach(ride, { lat: location.lat, lng: location.lng }).catch((error) => console.error('ETA update failed:', error.message));
                }
            } catch (error) {
                console.error('Location update failed:', error.message);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.data.role === 'captain' && socket.data.accountId) {
                // Stop offering rides to a captain whose app has gone away.
                await captainModel
                    .updateOne({ _id: socket.data.accountId, socketId: socket.id, status: { $ne: 'busy' } }, { status: 'unavailable', socketId: null })
                    .catch(() => {});
            }
        });
    });

    return io;
};

const sendMessagetoSocketID = (socketId, messageObject) => {
    if (io && socketId) io.to(socketId).emit(messageObject.event, messageObject.data);
};

module.exports = { initializeSocket, sendMessagetoSocketID };
