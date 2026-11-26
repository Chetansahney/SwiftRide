const rideservice = require('../services/ride.services');
const mapservice = require('../services/maps.services');
const userModel = require('../models/user.models');
const captainModel = require('../models/captain.models');
const rideModel = require('../models/ride.model');
const { sendMessagetoSocketID } = require('../socket');
const { publicRide, publicCaptain } = require('../utils/publicViews');
const { HttpError } = require('../utils/httpError');

const DISPATCH_RADIUS_KM = 10;

// Load a ride with both parties populated, including the captain's shift selfie
// (riders compare it with the person who turns up).
function findRide(id) {
    return rideModel.findById(id).populate('user').populate({ path: 'captain', select: '+shiftSelfie.image' });
}

async function notify(model, id, event, data) {
    if (!id) return;
    const account = await model.findById(id).select('socketId');
    if (account?.socketId) sendMessagetoSocketID(account.socketId, { event, data });
}
const notifyUser = (id, event, data) => notify(userModel, id, event, data);
const notifyCaptain = (id, event, data) => notify(captainModel, id, event, data);

// Offers a requested ride to every nearby captain who can take it.
async function dispatch(ride) {
    if (!ride.pickupPoint?.lat) return 0;
    const nearby = await mapservice.getCaptainsNearby(ride.pickupPoint.lat, ride.pickupPoint.lng, DISPATCH_RADIUS_KM);
    const eligible = nearby.filter((captain) => captain.socketId && rideservice.canTake(captain, ride));
    const payload = publicRide(await findRide(ride._id));
    eligible.forEach((captain) => sendMessagetoSocketID(captain.socketId, { event: 'new-ride', data: payload }));
    return eligible.length;
}

module.exports.createRide = async (req, res) => {
    const { origin, destination, vehicleType, preferWomenCaptain } = req.body;
    const riderIsWoman = Boolean(req.user.safetyPrefs?.travellingAsWoman || preferWomenCaptain);
    const { ride, otp } = await rideservice.createRide({
        origin,
        destination,
        user: req.user._id,
        vehicleType,
        preferWomenCaptain: Boolean(preferWomenCaptain),
        riderIsWoman,
    });
    const notifiedCaptains = await dispatch(ride);
    res.status(201).json({ message: 'Ride created successfully', ride: publicRide(ride), otp, notifiedCaptains });
};

module.exports.calculateFare = async (req, res) => {
    res.json(await rideservice.calculateFare(req.query.origin, req.query.destination));
};

module.exports.getNearbyDrivers = async (req, res) => {
    const point = await mapservice.getLocationCoordinates(req.query.origin);
    const [nearest, nearestWomen] = await Promise.all([
        mapservice.getNearestCaptainsByType(point.latitude, point.longitude),
        mapservice.getNearestCaptainsByType(point.latitude, point.longitude, 5000, { womenOnly: true }),
    ]);
    res.json({
        moto: nearest.moto ?? null,
        auto: nearest.auto ?? null,
        car: nearest.car ?? null,
        women: { moto: nearestWomen.moto ?? null, auto: nearestWomen.auto ?? null, car: nearestWomen.car ?? null },
    });
};

module.exports.confirmRide = async (req, res) => {
    const confirmed = await rideservice.confirmRide(req.body.rideId, req.captain);
    const ride = publicRide(await findRide(confirmed._id));
    await notifyUser(confirmed.user._id, 'ride-confirmed', ride);
    res.json({ message: 'Ride confirmed successfully', ride });
};

// Captain reached the pickup: the rider is told and 3 free minutes of waiting start.
module.exports.markArrived = async (req, res) => {
    const arrived = await rideservice.markArrived(req.body.rideId, req.captain._id);
    const ride = publicRide(await findRide(arrived._id));
    await notifyUser(arrived.user, 'captain-arrived', ride);
    res.json({ message: 'Arrival recorded', ride });
};

module.exports.startRide = async (req, res) => {
    const started = await rideservice.startRide(req.body.rideId, req.captain._id, req.body.otp);
    const ride = publicRide(await findRide(started._id));
    await notifyUser(started.user, 'ride-started', ride);
    res.json({ message: 'Ride started successfully', ride });
};

module.exports.endRide = async (req, res) => {
    const ended = await rideservice.endRide(req.body.rideId, req.captain._id);
    const ride = publicRide(await findRide(ended._id));
    await notifyUser(ended.user, 'ride-ended', ride);
    res.json({ message: 'Ride ended successfully', ride });
};

module.exports.completePayment = async (req, res) => {
    const paid = await rideservice.completePayment(req.body.rideId, req.user._id, req.body.tip);
    const ride = publicRide(paid);
    if (paid.captain?.socketId) sendMessagetoSocketID(paid.captain.socketId, { event: 'payment-completed', data: ride });
    res.json({ message: 'Payment completed successfully', ride });
};

module.exports.cancelByRider = async (req, res) => {
    const { ride, before } = await rideservice.cancelRide({ rideId: req.params.rideId, by: 'rider', actorId: req.user._id, reason: req.body.reason });
    if (before?.captain) await notifyCaptain(before.captain, 'ride-cancelled', { rideId: String(ride._id), by: 'rider' });
    res.json({ message: 'Ride cancelled', ride: publicRide(ride) });
};

// The rider isn't left stranded: the ride goes straight back to other captains.
module.exports.cancelByCaptain = async (req, res) => {
    const { ride, guaranteeCredit } = await rideservice.cancelRide({ rideId: req.params.rideId, by: 'captain', actorId: req.captain._id, reason: req.body.reason });
    const notifiedCaptains = await dispatch(ride);
    await notifyUser(ride.user, 'ride-requeued', { ...publicRide(ride), notifiedCaptains, guaranteeCredit });
    res.json({ message: 'Ride released', notifiedCaptains });
};

// The signed-in rider's past rides, newest first, for the Account page.
module.exports.getRideHistory = async (req, res) => {
    const rides = await rideModel.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).populate('captain', 'name vehicle');
    res.json(
        rides.map((ride) => {
            const plain = ride.toObject();
            delete plain.shareToken;
            delete plain.declinedBy;
            return { ...plain, captain: publicCaptain(plain.captain) };
        })
    );
};

// Riders can only read their own rides.
module.exports.getRideById = async (req, res) => {
    const ride = await findRide(req.params.rideId);
    if (!ride || String(ride.user?._id) !== String(req.user._id)) throw new HttpError(404, 'Ride not found.');
    res.json(publicRide(ride));
};

// The rider's current ride, if any — lets the app resume after a reload.
module.exports.getActiveRide = async (req, res) => {
    await rideservice.expireStaleRequests({ user: req.user._id });
    const ride = await rideModel
        .findOne({ user: req.user._id, status: { $in: ['requested', 'accepted', 'ongoing'] } })
        .populate('user')
        .populate({ path: 'captain', select: '+shiftSelfie.image' });
    res.json({ ride: ride ? publicRide(ride) : null });
};

module.exports.getCaptainActiveRide = async (req, res) => {
    const ride = await rideModel.findOne({ captain: req.captain._id, status: { $in: ['accepted', 'ongoing'] } }).populate('user').populate('captain');
    res.json({ ride: ride ? publicRide(ride) : null });
};
