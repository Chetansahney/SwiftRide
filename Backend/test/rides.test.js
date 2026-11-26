const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, reset, api, auth, rider, captain, bookRide, mongoose } = require('./helpers');

before(start);
after(stop);
beforeEach(reset);

const Ride = () => mongoose.model('ride');
const post = (path, token, body = {}) => api().post(path).set(auth(token)).send(body);

test('a full ride: book → accept → arrive → PIN → start → end → pay', async () => {
    const r = await rider();
    const c = await captain();
    const booked = await bookRide(r.token);
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    assert.equal(booked.body.notifiedCaptains, 1);
    assert.equal(booked.body.ride.otp, undefined, 'PIN hash never sent');
    const rideId = booked.body.ride._id;

    assert.equal((await post('/rides/confirm', c.token, { rideId })).status, 200);
    assert.equal((await post('/rides/arrived', c.token, { rideId })).status, 200);
    assert.equal((await post('/rides/start-ride', c.token, { rideId, otp: booked.body.otp })).status, 200);
    assert.equal((await post('/rides/end-ride', c.token, { rideId })).status, 200);

    const paid = await post('/rides/complete-payment', r.token, { rideId, tip: 20 });
    assert.equal(paid.status, 200);
    const again = await post('/rides/complete-payment', r.token, { rideId, tip: 200 });
    assert.equal(again.status, 200);
    assert.equal(again.body.ride.fareBreakdown.tip, 20, 'paying twice adds nothing');
    assert.equal(again.body.ride.fare, booked.body.ride.fare + 20);
});

test('steps out of order are refused', async () => {
    const r = await rider();
    const c = await captain();
    const { body } = await bookRide(r.token);
    const rideId = body.ride._id;
    assert.equal((await post('/rides/start-ride', c.token, { rideId, otp: body.otp })).status, 404, 'not their ride yet');
    assert.equal((await post('/rides/complete-payment', r.token, { rideId })).status, 409, "can't pay before the ride");
    await post('/rides/confirm', c.token, { rideId });
    assert.equal((await post('/rides/end-ride', c.token, { rideId })).status, 409, "can't end before starting");
    await post('/rides/start-ride', c.token, { rideId, otp: body.otp });
    assert.equal((await post('/rides/start-ride', c.token, { rideId, otp: body.otp })).status, 409, "can't start twice");
    assert.equal((await post(`/rides/${rideId}/cancel`, r.token)).status, 409, "can't cancel a started ride");
});

test('only one captain gets the ride; others and strangers are refused', async () => {
    const r = await rider();
    const c1 = await captain();
    const c2 = await captain();
    const { body } = await bookRide(r.token);
    const results = await Promise.all([c1, c2].map((c) => post('/rides/confirm', c.token, { rideId: body.ride._id })));
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409]);

    const stranger = await rider();
    assert.equal((await api().get(`/rides/${body.ride._id}`).set(auth(stranger.token))).status, 404);
    assert.equal((await post(`/rides/${body.ride._id}/cancel`, stranger.token)).status, 404);
});

test('captains must be verified with a face check for this shift to accept', async () => {
    const r = await rider();
    const unverified = await captain({ verified: false });
    const { body } = await bookRide(r.token);
    assert.equal(body.notifiedCaptains, 0);
    const res = await post('/rides/confirm', unverified.token, { rideId: body.ride._id });
    assert.equal(res.status, 403);
});

test('women-only preferences are enforced at accept time too', async () => {
    const r = await rider();
    const man = await captain({ gender: 'male' });
    const woman = await captain({ gender: 'female' });
    const { body } = await bookRide(r.token, { preferWomenCaptain: true });
    assert.equal(body.notifiedCaptains, 1);
    assert.equal((await post('/rides/confirm', man.token, { rideId: body.ride._id })).status, 403);
    assert.equal((await post('/rides/confirm', woman.token, { rideId: body.ride._id })).status, 200);
});

test('wrong PIN is limited to 5 tries', async () => {
    const r = await rider();
    const c = await captain();
    const { body } = await bookRide(r.token);
    const rideId = body.ride._id;
    await post('/rides/confirm', c.token, { rideId });
    const wrong = body.otp === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i += 1) {
        const res = await post('/rides/start-ride', c.token, { rideId, otp: wrong });
        assert.equal(res.status, 400);
        assert.equal(res.body.attemptsLeft, 4 - i);
    }
    assert.equal((await post('/rides/start-ride', c.token, { rideId, otp: body.otp })).status, 423, 'locked even with the right PIN');
});

test('one active ride per rider; cancelling frees them to book again', async () => {
    const r = await rider();
    const first = await bookRide(r.token);
    const second = await bookRide(r.token);
    assert.equal(second.status, 409);
    assert.equal(second.body.rideId, first.body.ride._id);
    assert.equal((await post(`/rides/${first.body.ride._id}/cancel`, r.token, { reason: 'changed plans' })).status, 200);
    assert.equal((await bookRide(r.token)).status, 201);
});

test('unanswered requests expire after 10 minutes', async () => {
    const r = await rider();
    const c = await captain();
    const { body } = await bookRide(r.token);
    await Ride().updateOne({ _id: body.ride._id }, { requestedAt: new Date(Date.now() - 11 * 60 * 1000), createdAt: new Date(Date.now() - 11 * 60 * 1000) });
    assert.equal((await post('/rides/confirm', c.token, { rideId: body.ride._id })).status, 409);
    const active = await api().get('/rides/active').set(auth(r.token));
    assert.equal(active.body.ride, null);
    assert.equal((await bookRide(r.token)).status, 201);
});

test('a captain dropping a ride sends it back to others, never to them again', async () => {
    const r = await rider();
    const c1 = await captain();
    const c2 = await captain();
    const { body } = await bookRide(r.token);
    const rideId = body.ride._id;
    await post('/rides/confirm', c1.token, { rideId });
    const dropped = await post(`/rides/${rideId}/captain-cancel`, c1.token, { reason: 'flat tyre' });
    assert.equal(dropped.status, 200);
    assert.equal(dropped.body.notifiedCaptains, 1, 'offered to the other captain only');
    assert.equal((await post('/rides/confirm', c1.token, { rideId })).status, 403);
    assert.equal((await post('/rides/confirm', c2.token, { rideId })).status, 200);
    const ride = await Ride().findById(rideId);
    assert.ok(ride.createdAt < ride.requestedAt, 'booking time kept');
});

test('a captain can only hold one ride at a time', async () => {
    const r1 = await rider();
    const r2 = await rider();
    const c = await captain();
    const a = await bookRide(r1.token);
    const b = await bookRide(r2.token);
    assert.equal((await post('/rides/confirm', c.token, { rideId: a.body.ride._id })).status, 200);
    assert.equal((await post('/rides/confirm', c.token, { rideId: b.body.ride._id })).status, 409);
});

test('"driver asked for extra" refunds once, capped at the fare', async () => {
    const r = await rider();
    const c = await captain();
    const { body } = await bookRide(r.token);
    const rideId = body.ride._id;
    await post('/rides/confirm', c.token, { rideId });
    const first = await post(`/rides/${rideId}/report`, r.token, { type: 'extra_fare', amount: 1000 });
    assert.equal(first.status, 201);
    assert.equal(first.body.creditIssued, Math.min(200, body.ride.fare));
    const repeats = await Promise.all([1, 2, 3].map(() => post(`/rides/${rideId}/report`, r.token, { type: 'extra_fare', amount: 100 })));
    assert.deepEqual(repeats.map((res) => res.status), [409, 409, 409]);
    const profile = await api().get('/users/profile').set(auth(r.token));
    assert.equal(profile.body.walletCredit, first.body.creditIssued);
    const cap = await mongoose.model('Captain').findById(c.id);
    assert.equal(cap.strikes, 1);
});

test('"wrong driver" can only be said once, at pickup', async () => {
    const r = await rider();
    const c = await captain();
    const { body } = await bookRide(r.token);
    const rideId = body.ride._id;
    assert.equal((await post(`/rides/${rideId}/verify-driver`, r.token, { match: false })).status, 409, 'no captain yet');
    await post('/rides/confirm', c.token, { rideId });
    assert.equal((await post(`/rides/${rideId}/verify-driver`, r.token, { match: true })).status, 200);
    const later = await post(`/rides/${rideId}/verify-driver`, r.token, { match: false });
    assert.equal(later.body.driverConfirmed, true, 'first answer stands');
    const cap = await mongoose.model('Captain').findById(c.id);
    assert.equal(cap.suspended, false);
});

test('bad ride ids and oversized inputs are rejected before reaching the database', async () => {
    const r = await rider();
    assert.equal((await api().get('/rides/not-an-id').set(auth(r.token))).status, 400);
    const huge = await bookRide(r.token, { origin: 'x'.repeat(5000) });
    assert.equal(huge.status, 400);
});

async function completedRide() {
    const r = await rider();
    const c = await captain();
    const { body } = await bookRide(r.token);
    const rideId = body.ride._id;
    await post('/rides/confirm', c.token, { rideId });
    await post('/rides/start-ride', c.token, { rideId, otp: body.otp });
    await post('/rides/end-ride', c.token, { rideId });
    return { r, c, rideId, fare: body.ride.fare };
}

test('ratings: each side rates once, only after the ride, averages update', async () => {
    const { r, c, rideId } = await completedRide();
    const stranger = await rider();
    assert.equal((await post(`/rides/${rideId}/rate`, stranger.token, { stars: 1 })).status, 404);
    assert.equal((await post(`/rides/${rideId}/rate`, r.token, { stars: 6 })).status, 400);
    assert.equal((await post(`/rides/${rideId}/rate`, r.token, { stars: 4, comment: 'Smooth ride' })).status, 200);
    assert.equal((await post(`/rides/${rideId}/rate`, r.token, { stars: 1 })).status, 409, 'no second rating');
    assert.equal((await post(`/rides/${rideId}/rate-rider`, c.token, { stars: 5 })).status, 200);

    const stats = await api().get('/rides/captain/stats').set(auth(c.token));
    assert.equal(stats.body.rating, 4);
    assert.equal(stats.body.today.rides, 1);
    assert.ok(stats.body.today.earnings > 0);
    const profile = await api().get('/users/profile').set(auth(r.token));
    assert.equal(profile.body.ratingCount, 1);
});

test('rating before the ride ends is refused', async () => {
    const r = await rider();
    const { body } = await bookRide(r.token);
    assert.equal((await post(`/rides/${body.ride._id}/rate`, r.token, { stars: 5 })).status, 409);
});

test('Ride Guarantee: ₹50 once per ride when a captain drops it, spent at the next payment', async () => {
    const r = await rider();
    const c1 = await captain();
    const c2 = await captain();
    const c3 = await captain();
    const { body } = await bookRide(r.token);
    const rideId = body.ride._id;
    await post('/rides/confirm', c1.token, { rideId });
    await post(`/rides/${rideId}/captain-cancel`, c1.token);
    await post('/rides/confirm', c2.token, { rideId });
    await post(`/rides/${rideId}/captain-cancel`, c2.token);
    let profile = await api().get('/users/profile').set(auth(r.token));
    assert.equal(profile.body.walletCredit, 50, 'credited once, not per captain');

    await post('/rides/confirm', c3.token, { rideId });
    await post('/rides/start-ride', c3.token, { rideId, otp: body.otp });
    await post('/rides/end-ride', c3.token, { rideId });
    const paid = await post('/rides/complete-payment', r.token, { rideId });
    assert.equal(paid.body.ride.fareBreakdown.creditUsed, 50);
    assert.equal(paid.body.ride.fare, body.ride.fare, 'captain still sees the full fare');
    profile = await api().get('/users/profile').set(auth(r.token));
    assert.equal(profile.body.walletCredit, 0);
});

test('every third drop is a strike for the captain', async () => {
    const c = await captain();
    for (let i = 0; i < 3; i += 1) {
        const r = await rider();
        const { body } = await bookRide(r.token);
        await post('/rides/confirm', c.token, { rideId: body.ride._id });
        await post(`/rides/${body.ride._id}/captain-cancel`, c.token);
    }
    const cap = await mongoose.model('Captain').findById(c.id);
    assert.equal(cap.cancellations, 3);
    assert.equal(cap.strikes, 1);
});
