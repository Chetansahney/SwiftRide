// Shared setup: a throwaway in-memory MongoDB, the app, Google Maps stubbed out.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-checks-0123456789';
process.env.ADMIN_KEY = 'test-admin-key';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const mapsService = require('../services/maps.services');

// Fixed places so tests never call Google.
const PLACES = {
    'Park Street, Kolkata': { latitude: 22.5535, longitude: 88.351 },
    'Salt Lake Sector V, Kolkata': { latitude: 22.5726, longitude: 88.4339 },
};
mapsService.getLocationCoordinates = async (address) => {
    if (PLACES[address]) return PLACES[address];
    throw new Error('Unable to geocode address. Status: ZERO_RESULTS');
};
mapsService.getDistanceTime = async () => ({ distance: '9.8 km', duration: '28 mins' });
// Road times without the network: the same straight-line estimate the app
// falls back to. Tests can replace geo.roadTimes to simulate real roads.
const geo = require('../services/geo');
const realisticRoadTimes = async (sources, destination) =>
    sources.map((point) => {
        const { distanceM, durationS } = geo.estimatedRoute(point, destination);
        return { distanceM, durationS, estimated: true };
    });
geo.roadTimes = realisticRoadTimes;
geo.route = async (from, to) => ({ ...geo.estimatedRoute(from, to), estimated: true });

const app = require('../app');
const captainModel = require('../models/captain.models');
const { currentShiftWindow } = require('../utils/shiftWindow');
const { cellOf } = require('../services/dispatch');

let mongo;
async function start() {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}
async function stop() {
    await mongoose.disconnect();
    await mongo?.stop();
}
async function reset() {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let counter = 0;
async function rider(overrides = {}) {
    counter += 1;
    const body = { name: { firstname: 'Asha', lastname: 'Roy' }, email: `rider${counter}@example.test`, phone: phoneFor(counter), password: 'safe-pass-123', ...overrides };
    const res = await api().post('/users/register').send(body);
    if (res.status !== 201) throw new Error(`rider register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { token: res.body.token, user: res.body.user, password: body.password, email: body.email, phone: res.body.user.phone };
}

// Valid Indian mobiles: 9000000001, 9000000002, ...
const phoneFor = (n) => `9${String(n).padStart(9, '0')}`;

// Unique valid plates: WB01AK0001, WB01AK0002, ...
const plate = (n) => `WB01AK${String(n).padStart(4, '0')}`;
async function captain({ verified = true, vehicleType = 'auto', gender, online = true, confirmedWoman = false, at = { lat: 22.554, lng: 88.352 }, rating, ratingCount = 20 } = {}) {
    counter += 1;
    const res = await api()
        .post('/captains/register')
        .send({
            name: { firstname: 'Priya', lastname: 'Das' },
            email: `captain${counter}@example.test`,
            phone: phoneFor(counter),
            password: 'safe-pass-123',
            gender,
            vehicle: { color: 'Black', model: 'Bajaj RE', plate: plate(counter), capacity: 3, vehicleType },
        });
    if (res.status !== 201) throw new Error(`captain register failed: ${res.status} ${JSON.stringify(res.body)}`);
    const id = res.body.captain._id;
    if (verified) {
        await captainModel.updateOne(
            { _id: id },
            {
                'verification.status': 'verified',
                ...(confirmedWoman ? { gender: 'female', 'genderCheck.status': 'verified' } : {}),
                ...(rating ? { ratingTotal: rating * ratingCount, ratingCount } : {}),
                shiftSelfie: { windowId: currentShiftWindow().id, status: 'verified', takenAt: new Date() },
                ...(online
                    ? { status: 'available', socketId: `socket-${counter}`, lastSeenAt: new Date(), location: { type: 'Point', coordinates: [at.lng, at.lat] }, h3: cellOf(at.lat, at.lng) }
                    : {}),
            }
        );
    }
    return { token: res.body.token, id, phone: phoneFor(counter) };
}

async function bookRide(riderToken, extra = {}) {
    const res = await api()
        .post('/rides/create')
        .set(auth(riderToken))
        .send({ origin: 'Park Street, Kolkata', destination: 'Salt Lake Sector V, Kolkata', vehicleType: 'auto', ...extra });
    return res;
}

module.exports = { start, stop, reset, api, auth, rider, captain, bookRide, mongoose, realisticRoadTimes };
