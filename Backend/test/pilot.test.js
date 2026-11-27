// Pilot launch checks: phone numbers, manual captain review, the team's
// safety-alerts screen and its optional chat ping.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { start, stop, reset, api, auth, rider, captain, bookRide, mongoose } = require('./helpers');
const dispatch = require('../services/dispatch');
const faceEngine = require('../services/faceEngine');

before(start);
after(stop);
beforeEach(reset);

const ADMIN = { 'x-admin-key': process.env.ADMIN_KEY };
const post = (path, token, body = {}) => api().post(path).set(auth(token)).send(body);
const PHOTO = 'data:image/jpeg;base64,AAAA';

test('sign-up needs an Indian mobile number, stored as 10 digits', async () => {
    const base = { name: { firstname: 'Asha' }, email: 'p@example.test', password: 'safe-pass-123' };
    assert.equal((await api().post('/users/register').send(base)).status, 400, 'missing');
    assert.equal((await api().post('/users/register').send({ ...base, phone: '12345' })).status, 400, 'too short');
    assert.equal((await api().post('/users/register').send({ ...base, phone: '5876543210' })).status, 400, 'not a mobile');
    const ok = await api().post('/users/register').send({ ...base, phone: '+91 98765-43210' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.user.phone, '9876543210');

    const noPhone = await api()
        .post('/captains/register')
        .send({ ...base, email: 'c@example.test', vehicle: { color: 'Black', model: 'Bajaj RE', plate: 'WB01AK9999', capacity: 3, vehicleType: 'auto' } });
    assert.equal(noPhone.status, 400);
    assert.ok(noPhone.body.errors.some((e) => e.path === 'phone'));
});

test('older accounts can add a phone number later', async () => {
    const r = await rider();
    const changed = await api().patch('/users/profile').set(auth(r.token)).send({ phone: '098300 12345' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.phone, '9830012345');
    assert.equal((await api().patch('/users/profile').set(auth(r.token)).send({ phone: '123' })).status, 400);

    const c = await captain();
    const settings = await api().patch('/captains/settings').set(auth(c.token)).send({ phone: '9830054321' });
    assert.equal(settings.status, 200);
    assert.equal(settings.body.captain.phone, '9830054321');
});

test('phone numbers cross over only while the ride is on', async () => {
    const offers = [];
    dispatch.setNotifier({ toCaptain: (id, event, data) => offers.push({ event, data }), toRider: () => {} });
    try {
        const r = await rider();
        const c = await captain();
        const booked = await bookRide(r.token);
        const rideId = booked.body.ride._id;

        const offer = offers.find((o) => o.event === 'new-ride');
        assert.ok(offer, 'captain was offered the ride');
        assert.equal(offer.data.user.phone, undefined, "offers never carry the rider's number");
        assert.equal(booked.body.ride.captain, undefined);

        const confirmed = await post('/rides/confirm', c.token, { rideId });
        assert.equal(confirmed.body.ride.user.phone, r.phone, 'captain can call the rider at pickup');
        const riderView = await api().get('/rides/active').set(auth(r.token));
        assert.equal(riderView.body.ride.captain.phone, c.phone, 'rider can call the captain');
        assert.equal(riderView.body.ride.captain.email, undefined);

        assert.equal((await post('/rides/start-ride', c.token, { rideId, otp: booked.body.otp })).status, 200);
        const ended = await post('/rides/end-ride', c.token, { rideId });
        assert.equal(ended.body.ride.user.phone, undefined, 'hidden again once the ride ends');
        const history = await api().get('/rides/history').set(auth(r.token));
        assert.equal(history.body[0].captain.phone, undefined);
    } finally {
        dispatch.setNotifier({ toCaptain: () => {}, toRider: () => {} });
    }
});

// The real face engine is tested in faceEngine.test.js; here it is replaced by
// one that is sure the faces match, to check what happens next.
async function submitWithClearMatch(token, gender = { estimate: 'female', pFemale: 0.97 }) {
    const original = faceEngine.verifyIdentity;
    faceEngine.verifyIdentity = async () => ({
        decision: 'verified',
        reasons: [],
        face: { fingerprintScore: 0.93, livenessPassed: true, real: 0.99 },
        gender,
        referenceEmbedding: [0.1],
        referenceDescriptor: [0.1],
        referenceLandmarks: [0.1],
        dlEmbedding: [0.1],
        dlDescriptor: [0.1],
    });
    try {
        const challenge = await post('/captains/liveness-challenge', token, { purpose: 'verification' });
        assert.equal(challenge.status, 201);
        return await post('/captains/verification', token, {
            dlNumber: 'WB0120110012345',
            dob: '1990-01-01',
            dlName: 'Priya Das',
            dlImage: PHOTO,
            selfies: challenge.body.steps.map(() => PHOTO),
            challengeId: challenge.body.challengeId,
        });
    } finally {
        faceEngine.verifyIdentity = original;
    }
}

test('every new captain waits for a person, even with a clear face match', async () => {
    const c = await captain({ verified: false, gender: 'female' });
    const submitted = await submitWithClearMatch(c.token);
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.verification.status, 'in_review');
    assert.equal(submitted.body.verification.genderCheck, 'in_review', 'a person also confirms women captains');

    const queue = await api().get('/admin/verifications').set(ADMIN);
    const item = queue.body.identity.find((i) => String(i.captainId) === c.id);
    assert.equal(item.engineDecision, 'verified');
    assert.equal(item.phone, c.phone, 'reviewer can call them in');
    assert.ok(item.dlImage && item.selfieImage, 'photos kept for the reviewer');
    assert.ok(queue.body.gender.some((g) => String(g.captainId) === c.id && g.reason === 'manual_review'));

    // Approving needs all three in-person document checks.
    const decide = (body) => api().post(`/admin/verifications/${c.id}`).set(ADMIN).send({ kind: 'identity', decision: 'approve', ...body });
    const partial = await decide({ checks: ['licence', 'vehicle'] });
    assert.equal(partial.status, 400);
    assert.equal(partial.body.reason, 'checks_missing');
    assert.equal((await decide({ checks: ['licence', 'vehicle', 'police'] })).status, 200);

    const Captain = mongoose.model('Captain');
    const after = await Captain.findById(c.id).select('+verification.dlImage');
    assert.equal(after.verification.status, 'verified');
    assert.equal(after.verification.decidedBy, 'admin');
    assert.equal(after.verification.documentChecks.police, true);
    assert.equal(after.verification.dlImage, undefined, 'photos deleted after the decision');
});

test('rejecting a captain also drops their pending women-captain check', async () => {
    const c = await captain({ verified: false, gender: 'female' });
    await submitWithClearMatch(c.token);
    const rejected = await api().post(`/admin/verifications/${c.id}`).set(ADMIN).send({ kind: 'identity', decision: 'reject' });
    assert.equal(rejected.status, 200);
    const after = await mongoose.model('Captain').findById(c.id).select('+genderCheck.image');
    assert.equal(after.verification.status, 'rejected');
    assert.equal(after.genderCheck.status, 'not_needed');
    assert.equal(after.genderCheck.image, undefined);
});

test('VERIFICATION_AUTO_APPROVE=true lets a clear match through on its own', async () => {
    process.env.VERIFICATION_AUTO_APPROVE = 'true';
    try {
        const c = await captain({ verified: false, gender: 'female' });
        const submitted = await submitWithClearMatch(c.token);
        assert.equal(submitted.body.verification.status, 'verified');
        assert.equal(submitted.body.verification.genderCheck, 'verified');
    } finally {
        delete process.env.VERIFICATION_AUTO_APPROVE;
    }
});

async function rideWithCaptain() {
    const r = await rider();
    const c = await captain();
    const booked = await bookRide(r.token);
    const rideId = booked.body.ride._id;
    await post('/rides/confirm', c.token, { rideId });
    await post('/rides/start-ride', c.token, { rideId, otp: booked.body.otp });
    return { r, c, rideId };
}

test('safety alerts reach the team screen with everything needed to act', async () => {
    const { r, c, rideId } = await rideWithCaptain();
    await api().patch('/users/safety').set(auth(r.token)).send({ trustedContacts: [{ name: 'Maa', phone: '9830011111' }] });
    const sos = await post(`/rides/${rideId}/sos`, r.token, { silent: true, location: { lat: 22.56, lng: 88.36 } });
    assert.equal(sos.status, 201);

    assert.equal((await api().get('/admin/safety-alerts')).status, 401, 'needs the admin key');
    assert.equal((await api().get('/admin/safety-alerts').set({ 'x-admin-key': 'wrong-key-wrong-k' })).status, 401);

    const list = await api().get('/admin/safety-alerts').set(ADMIN);
    assert.equal(list.status, 200);
    assert.equal(list.body.openCount, 1);
    const [alert] = list.body.alerts;
    assert.equal(alert.label, 'Silent SOS');
    assert.equal(alert.raisedBy, 'rider');
    assert.deepEqual(alert.location, { lat: 22.56, lng: 88.36 });
    assert.equal(alert.rider.phone, r.phone);
    assert.deepEqual(alert.rider.trustedContacts, [{ name: 'Maa', phone: '9830011111' }]);
    assert.equal(alert.captain.phone, c.phone);
    assert.match(alert.ride.trackToken, /^[a-f0-9]{32}$/, 'team can follow the live trip');
    assert.equal((await api().get(`/rides/shared/${alert.ride.trackToken}`)).status, 200);

    const act = (body) => api().post(`/admin/safety-alerts/${alert.id}`).set(ADMIN).send(body);
    assert.equal((await act({ action: 'acknowledge', handledBy: 'Chetan' })).body.status, 'acknowledged');
    assert.equal((await api().get('/admin/safety-alerts').set(ADMIN)).body.openCount, 0, 'no longer "new"');
    const noNote = await act({ action: 'resolve' });
    assert.equal(noNote.status, 400);
    assert.equal(noNote.body.reason, 'note_required');
    assert.equal((await act({ action: 'resolve', note: 'Called rider; she is safe at home.' })).body.status, 'resolved');
    assert.equal((await act({ action: 'resolve', note: 'again' })).status, 409);

    assert.equal((await api().get('/admin/safety-alerts').set(ADMIN)).body.alerts.length, 0, 'resolved ones leave the default list');
    const all = await api().get('/admin/safety-alerts?status=all').set(ADMIN);
    assert.equal(all.body.alerts[0].note, 'Called rider; she is safe at home.');
    assert.equal(all.body.alerts[0].handledBy, 'Chetan');
    assert.equal((await api().post('/admin/safety-alerts/not-an-id').set(ADMIN).send({ action: 'acknowledge' })).status, 404);
});

test('the optional team-chat ping carries no names, numbers or places', async () => {
    let resolveBody;
    const received = new Promise((resolve) => {
        resolveBody = resolve;
    });
    const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', () => {
            res.end('ok');
            resolveBody(JSON.parse(raw));
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.SAFETY_WEBHOOK_URL = `http://127.0.0.1:${server.address().port}/hook`;
    try {
        const { r, c, rideId } = await rideWithCaptain();
        assert.equal((await post(`/rides/${rideId}/captain-sos`, c.token, { silent: false, location: { lat: 22.5, lng: 88.3 } })).status, 201);
        const body = await received;
        assert.match(body.text, /SwiftRide safety alert: SOS button \(captain\)/);
        for (const secret of [r.phone, c.phone, 'Asha', 'Priya', '22.5', '88.3']) {
            assert.ok(!body.text.includes(secret), `ping must not include ${secret}`);
        }
    } finally {
        delete process.env.SAFETY_WEBHOOK_URL;
        server.close();
    }
});
