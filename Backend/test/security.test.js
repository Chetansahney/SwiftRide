const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { start, stop, reset, api, auth, rider, captain } = require('./helpers');

before(start);
after(stop);
beforeEach(reset);

test('missing or malformed Authorization header is a clean 401, not a crash', async () => {
    for (const header of [undefined, 'Bearer', 'Basic abc', 'Bearer not-a-jwt']) {
        const req = api().get('/users/profile');
        if (header) req.set('Authorization', header);
        const res = await req;
        assert.equal(res.status, 401, `header ${header}`);
    }
});

test("a rider's token can't open captain routes, and vice versa", async () => {
    const r = await rider();
    const c = await captain();
    assert.equal((await api().get('/captains/profile').set(auth(r.token))).status, 401);
    assert.equal((await api().get('/users/profile').set(auth(c.token))).status, 401);
    assert.equal((await api().get('/users/profile').set(auth(r.token))).status, 200);
});

test('forged tokens are refused: wrong secret, alg "none", wrong role claim', async () => {
    const r = await rider();
    const id = r.user._id;
    const wrongSecret = jwt.sign({ _id: id, role: 'user', tv: 0 }, 'some-other-secret');
    const none = jwt.sign({ _id: id, role: 'user', tv: 0 }, null, { algorithm: 'none' });
    const asCaptain = jwt.sign({ _id: id, role: 'captain', tv: 0 }, process.env.JWT_SECRET);
    for (const token of [wrongSecret, none]) {
        assert.equal((await api().get('/users/profile').set(auth(token))).status, 401);
    }
    assert.equal((await api().get('/captains/profile').set(auth(asCaptain))).status, 401);
});

test('logout revokes the token; password change revokes every older token', async () => {
    const r = await rider();
    assert.equal((await api().post('/users/logout').set(auth(r.token))).status, 200);
    assert.equal((await api().get('/users/profile').set(auth(r.token))).status, 401);

    const login = await api().post('/users/login').send({ email: r.email, password: r.password });
    const second = await api().post('/users/login').send({ email: r.email, password: r.password });
    const changed = await api()
        .post('/users/password')
        .set(auth(login.body.token))
        .send({ currentPassword: r.password, newPassword: 'new-pass-456' });
    assert.equal(changed.status, 200);
    assert.equal((await api().get('/users/profile').set(auth(second.body.token))).status, 401, 'other device logged out');
    assert.equal((await api().get('/users/profile').set(auth(changed.body.token))).status, 200, 'new token works');
    assert.equal((await api().post('/users/login').send({ email: r.email, password: r.password })).status, 401, 'old password refused');
});

test("login doesn't reveal whether an email has an account", async () => {
    const r = await rider();
    const wrongEmail = await api().post('/users/login').send({ email: 'nobody@example.test', password: 'whatever-123' });
    const wrongPassword = await api().post('/users/login').send({ email: r.email, password: 'whatever-123' });
    assert.equal(wrongEmail.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongEmail.body, wrongPassword.body);
});

test('MongoDB operator injection is rejected', async () => {
    await rider();
    const res = await api().post('/users/login').send({ email: { $ne: null }, password: { $ne: null } });
    assert.equal(res.status, 400);
    const res2 = await api().post('/users/login').send({ email: 'a@b.c', password: 'x', 'constructor': { prototype: {} } });
    assert.equal(res2.status, 400);
});

test('sign-up: weak passwords refused, duplicate email is 409, emails are case-insensitive', async () => {
    const weak = await api().post('/users/register').send({ name: { firstname: 'Asha' }, email: 'w@example.test', password: 'short' });
    assert.equal(weak.status, 400);
    const noDigit = await api().post('/users/register').send({ name: { firstname: 'Asha' }, email: 'w@example.test', password: 'longbutnodigits' });
    assert.equal(noDigit.status, 400);
    const r = await rider({ email: 'Mixed.Case@Example.test' });
    assert.equal(r.user.email, 'mixed.case@example.test');
    const dup = await api().post('/users/register').send({ name: { firstname: 'Asha' }, email: 'MIXED.case@example.test', password: 'safe-pass-123' });
    assert.equal(dup.status, 409);
});

test('profiles never include password hashes, socket ids or token versions', async () => {
    const r = await rider();
    const res = await api().get('/users/profile').set(auth(r.token));
    for (const field of ['password', 'socketId', 'tokenVersion', '__v']) assert.equal(field in res.body, false, field);
    const c = await captain();
    const cres = await api().get('/captains/profile').set(auth(c.token));
    for (const field of ['password', 'socketId', 'tokenVersion']) assert.equal(field in cres.body.captain, false, field);
});

test('security headers are set and the server is not fingerprinted', async () => {
    const res = await api().get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['strict-transport-security']);
    assert.ok(res.headers['content-security-policy']);
});

test('CORS only answers allowed websites', async () => {
    const evil = await api().get('/health').set('Origin', 'https://evil.example');
    assert.equal(evil.headers['access-control-allow-origin'], undefined);
    const local = await api().get('/health').set('Origin', 'http://localhost:5173');
    assert.equal(local.headers['access-control-allow-origin'], 'http://localhost:5173');
});

test('unknown routes are 404 JSON; invalid JSON is 400 without a stack trace', async () => {
    const res = await api().get('/nope');
    assert.equal(res.status, 404);
    const bad = await api().post('/users/login').set('Content-Type', 'application/json').send('{"email":');
    assert.equal(bad.status, 400);
    assert.doesNotMatch(JSON.stringify(bad.body), /at .*\.js/);
});

test('admin routes need the admin key', async () => {
    assert.equal((await api().get('/admin/verifications')).status, 401);
    assert.equal((await api().get('/admin/verifications').set('x-admin-key', 'wrong-key-wrong-key')).status, 401);
    assert.equal((await api().get('/admin/verifications').set('x-admin-key', 'test-admin-key')).status, 200);
});

test('captain can delete their account; rider history stays without the link', async () => {
    const c = await captain();
    const res = await api().delete('/captains/profile').set(auth(c.token));
    assert.equal(res.status, 200);
    assert.equal((await api().get('/captains/profile').set(auth(c.token))).status, 401);
});

test('saved places sync: validated, limited, private to the rider', async () => {
    const r = await rider();
    const ok = await api().put('/users/places').set(auth(r.token)).send({ home: 'Park Street, Kolkata', custom: [{ id: 'gym1', label: 'Gym', address: 'Salt Lake' }] });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.home, 'Park Street, Kolkata');
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, label: 'X', address: 'Y' }));
    assert.equal((await api().put('/users/places').set(auth(r.token)).send({ custom: tooMany })).status, 400);
    const profile = await api().get('/users/profile').set(auth(r.token));
    assert.equal(profile.body.savedPlaces.custom[0].label, 'Gym');
});
