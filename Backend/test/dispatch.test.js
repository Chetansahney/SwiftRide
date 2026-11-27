// Wave dispatch: H3 rings, ranking, women's-safety filters, decline/timeout handover.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, reset, api, auth, rider, captain, bookRide, mongoose } = require('./helpers');
const dispatch = require('../services/dispatch');

// Record what the dispatcher tells people instead of using real sockets.
const events = [];
dispatch.setNotifier({
    toCaptain: (id, event, data) => events.push({ to: String(id), event, data }),
    toRider: (id, event, data) => events.push({ to: String(id), event, data }),
});

before(start);
after(stop);
beforeEach(async () => {
    await reset();
    events.length = 0;
});

const offeredTo = () => events.filter((e) => e.event === 'new-ride').map((e) => e.to);
const Ride = () => mongoose.model('ride');
// Pickup "Park Street, Kolkata" is at 22.5535, 88.351 (see helpers).
const near = (metresNorth) => ({ lat: 22.5535 + metresNorth / 111000, lng: 88.351 });
const post = (path, token, body = {}) => api().post(path).set(auth(token)).send(body);

// Makes the current wave's offers time out and runs the next wave.
async function nextWave(rideId) {
    await Ride().updateOne(
        { _id: rideId },
        { 'dispatch.nextAt': new Date(0), $set: { 'offers.$[o].expiresAt': new Date(0) } },
        { arrayFilters: [{ 'o.status': 'offered' }] }
    );
    return dispatch.runWave(rideId);
}

test('the nearest ring is tried first; the search widens only when it is empty', async () => {
    const far = await captain({ at: near(3000) }); // ~3 km away
    const r = await rider();
    const { body } = await bookRide(r.token);
    assert.equal(body.notifiedCaptains, 1, 'found by widening');
    const ride = await Ride().findById(body.ride._id);
    assert.ok(ride.dispatch.radiusM > 2500, `searched out to ${ride.dispatch.radiusM} m`);
    assert.deepEqual(offeredTo(), [far.id]);
    const progress = events.find((e) => e.event === 'dispatch-progress');
    assert.ok(progress.data.radiusKm >= 2.5);
});

test('captains outside the largest ring are never offered the ride', async () => {
    await captain({ at: near(9000) }); // ~9 km: beyond auto range (~5.5 km)
    const r = await rider();
    const { body } = await bookRide(r.token);
    assert.equal(body.notifiedCaptains, 0);
});

test('closer captains rank first, and a captain whose rating matches the rider wins a near-tie', async () => {
    const r = await rider();
    await mongoose.model('User').updateOne({ _id: r.user._id }, { ratingTotal: 4.9 * 40, ratingCount: 40 });
    const close = await captain({ at: near(300), rating: 4.2 });
    const matching = await captain({ at: near(500), rating: 4.9 });
    const farther = await captain({ at: near(1500), rating: 4.9 });
    await captain({ at: near(1700), rating: 4.9 });
    const { body } = await bookRide(r.token);
    // Wave 1 stays in the nearest ring (~0.9 km): the two close captains only.
    assert.equal(body.notifiedCaptains, 2);
    const ride = await Ride().findById(body.ride._id);
    const order = [...ride.offers].sort((a, b) => a.score - b.score).map((o) => String(o.captain));
    assert.equal(order[0], matching.id, 'a 4.9 rider gets the 4.9 captain 200 m further away first');
    assert.equal(order[1], close.id);
    // Nobody accepts: the next ring is searched.
    events.length = 0;
    await nextWave(body.ride._id);
    assert.ok(offeredTo().includes(farther.id), 'wider ring in wave 2');
});

test('women-only requests reach only CONFIRMED women captains, even if a man is closer', async () => {
    const r = await rider();
    await captain({ at: near(100), gender: 'male' });
    await captain({ at: near(150), gender: 'female' }); // declared, not confirmed
    const woman = await captain({ at: near(800), confirmedWoman: true });
    const { body } = await bookRide(r.token, { preferWomenCaptain: true });
    assert.deepEqual(offeredTo(), [woman.id]);
    assert.equal(body.notifiedCaptains, 1);
});

test('a confirmed woman captain on "women riders only" is never offered a man\'s ride', async () => {
    const womenOnly = await captain({ at: near(100), confirmedWoman: true });
    await mongoose.model('Captain').updateOne({ _id: womenOnly.id }, { womenRidersOnly: true });
    const other = await captain({ at: near(600) });
    const man = await rider();
    await bookRide(man.token);
    assert.deepEqual(offeredTo(), [other.id]);
});

test('declining hands the ride to the next best captain straight away', async () => {
    const a = await captain({ at: near(100) });
    const r = await rider();
    const { body } = await bookRide(r.token);
    const b = await captain({ at: near(400) }); // comes online after wave 1
    events.length = 0;
    assert.equal((await post(`/rides/${body.ride._id}/decline`, a.token)).status, 200);
    assert.deepEqual(offeredTo(), [b.id]);
    // The decliner can't accept it any more, and won't be asked again.
    assert.equal((await post('/rides/confirm', a.token, { rideId: body.ride._id })).status, 403);
});

test('an ignored offer times out and the next captains are asked; only offered captains can accept', async () => {
    dispatch.CONFIG.WAVE_SIZE = 1;
    try {
        const first = await captain({ at: near(100) });
        const second = await captain({ at: near(700) });
        const r = await rider();
        const { body } = await bookRide(r.token);
        assert.deepEqual(offeredTo(), [first.id]);
        assert.equal((await post('/rides/confirm', second.token, { rideId: body.ride._id })).status, 410, 'not offered yet');
        events.length = 0;
        await nextWave(body.ride._id);
        assert.deepEqual(offeredTo(), [second.id]);
        assert.ok(events.some((e) => e.event === 'ride-offer-withdrawn' && e.to === first.id), 'first captain told the offer expired');
        assert.equal((await post('/rides/confirm', second.token, { rideId: body.ride._id })).status, 200);
    } finally {
        dispatch.CONFIG.WAVE_SIZE = 3;
    }
});

test('when one captain accepts, the others in the wave are told it is gone', async () => {
    const a = await captain({ at: near(100) });
    const b = await captain({ at: near(200) });
    const r = await rider();
    const { body } = await bookRide(r.token);
    events.length = 0;
    assert.equal((await post('/rides/confirm', a.token, { rideId: body.ride._id })).status, 200);
    assert.ok(events.some((e) => e.event === 'ride-offer-withdrawn' && e.to === b.id));
    const ride = await Ride().findById(body.ride._id);
    assert.equal(ride.offers.find((o) => String(o.captain) === a.id).status, 'accepted');
    const stats = await mongoose.model('Captain').findById(a.id);
    assert.equal(stats.offersAccepted, 1);
});

test('nobody found for long enough: a woman-only rider is asked, and can open it to any verified captain', async () => {
    const r = await rider();
    const man = await captain({ at: near(200), gender: 'male' });
    const { body } = await bookRide(r.token, { preferWomenCaptain: true });
    assert.equal(body.notifiedCaptains, 0);
    await Ride().updateOne({ _id: body.ride._id }, { 'dispatch.startedAt': new Date(Date.now() - 2 * 60 * 1000) });
    await nextWave(body.ride._id);
    assert.ok(events.some((e) => e.event === 'dispatch-no-women'));
    const res = await post(`/rides/${body.ride._id}/allow-any-captain`, r.token);
    assert.equal(res.status, 200);
    assert.ok(offeredTo().includes(man.id));
});

test('a request nobody accepts for 10 minutes is closed and the rider told', async () => {
    const r = await rider();
    const { body } = await bookRide(r.token);
    await Ride().updateOne({ _id: body.ride._id }, { 'dispatch.startedAt': new Date(Date.now() - 11 * 60 * 1000) });
    await nextWave(body.ride._id);
    const ride = await Ride().findById(body.ride._id);
    assert.equal(ride.status, 'cancelled');
    assert.ok(events.some((e) => e.event === 'ride-expired'));
});

test('dispatch details are never sent to apps', async () => {
    await captain({ at: near(100) });
    const r = await rider();
    const { body } = await bookRide(r.token);
    const seen = await api().get(`/rides/${body.ride._id}`).set(auth(r.token));
    assert.equal(seen.body.offers, undefined);
    assert.equal(seen.body.declinedBy, undefined);
    const offer = events.find((e) => e.event === 'new-ride');
    assert.equal(offer.data.offers, undefined);
    assert.ok(offer.data.offer.etaMin >= 1);
    assert.equal(offer.data.user.name.firstname, 'Asha', 'captain sees the rider first name only');
    assert.equal(offer.data.user.email, undefined);
});

// ---- one road-based ETA everywhere ----

test('ranking uses road time: a captain across the river loses to one further away in a straight line', async () => {
    const geo = require('../services/geo');
    const { realisticRoadTimes } = require('./helpers');
    const acrossRiver = await captain({ at: near(250) });
    const sameSide = await captain({ at: near(700) });
    // Simulated roads: the 250 m captain needs a 15-minute detour over a bridge.
    geo.roadTimes = async (sources, destination) =>
        sources.map((p) =>
            Math.abs(p.lat - near(250).lat) < 1e-6 ? { durationS: 900, distanceM: 6200, estimated: false } : { durationS: 170, distanceM: 950, estimated: false }
        );
    try {
        const r = await rider();
        const { body } = await bookRide(r.token);
        const ride = await Ride().findById(body.ride._id);
        const order = [...ride.offers].sort((a, b) => a.score - b.score).map((o) => String(o.captain));
        assert.deepEqual(order, [sameSide.id, acrossRiver.id]);
        // The offer card shows the road time and road distance.
        const offer = events.find((e) => e.event === 'new-ride' && e.to === sameSide.id).data.offer;
        assert.equal(offer.etaMin, 3, '170 s rounds to 3 min, exactly like the rider\'s chip');
        assert.equal(offer.distanceM, 950);
    } finally {
        geo.roadTimes = realisticRoadTimes;
    }
});

test('the offer card and the rider\'s "X min away" use the same rounding', () => {
    const geo = require('../services/geo');
    const { formatDuration } = require('../services/maps.services');
    for (const seconds of [10, 59, 89, 90, 149, 150, 1745]) {
        assert.equal(formatDuration(seconds), `${geo.etaMinutes(seconds)} min${geo.etaMinutes(seconds) === 1 ? '' : 's'}`);
    }
});

test('the ETA on the captain\'s offer card becomes the rider\'s first "X min away"', async () => {
    const c = await captain({ at: near(600) });
    const r = await rider();
    const { body } = await bookRide(r.token);
    const offer = events.find((e) => e.event === 'new-ride' && e.to === c.id).data.offer;
    assert.ok(offer.etaS > 0 && offer.estimated === true, 'offline tests use the estimate, and say so');
    const accepted = await post('/rides/confirm', c.token, { rideId: body.ride._id });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.ride.approach.etaS, offer.etaS, 'same seconds the captain saw');
    const seen = await api().get(`/rides/${body.ride._id}`).set(auth(r.token));
    assert.equal(seen.body.approach.etaS, offer.etaS, 'the rider gets the same ETA');
});

test('if the router stops answering mid-approach, the ETA shrinks smoothly from the last real one', async () => {
    const geo = require('../services/geo');
    const { realisticRoadTimes } = require('./helpers');
    const c = await captain({ at: near(2000) });
    const r = await rider();
    const { body } = await bookRide(r.token);
    await post('/rides/confirm', c.token, { rideId: body.ride._id });
    const ride = await Ride().findById(body.ride._id).populate('user', 'socketId');
    try {
        // A real road answer first: 600 s at 2 km straight-line.
        geo.roadTimes = async () => [{ durationS: 600, distanceM: 2700, estimated: false }];
        await dispatch.refreshApproach(ride, near(2000), { force: true });
        // Then the router is down; the captain is now 1 km away in a straight line.
        geo.roadTimes = realisticRoadTimes;
        events.length = 0;
        await dispatch.refreshApproach(ride, near(1000), { force: true });
        const eta = events.find((e) => e.event === 'captain-eta').data;
        assert.equal(eta.estimated, true);
        assert.ok(Math.abs(eta.etaS - 300) <= 5, `half the distance → about half of 600 s, got ${eta.etaS}`);
        assert.equal(eta.minutes, 5);
    } finally {
        geo.roadTimes = realisticRoadTimes;
        dispatch.forgetApproach(body.ride._id);
    }
});
