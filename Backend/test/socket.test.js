const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { io: connect } = require('socket.io-client');
const { start, stop, reset, rider, captain, bookRide, api, auth, mongoose } = require('./helpers');
const app = require('../app');
const { initializeSocket } = require('../socket');

let server;
let url;
before(async () => {
    await start();
    server = http.createServer(app);
    initializeSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
});
after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await stop();
});
beforeEach(reset);

const open = () => connect(url, { transports: ['websocket'], forceNew: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const Captain = () => mongoose.model('Captain');
const User = () => mongoose.model('User');

test("joining without a valid token doesn't attach the socket to anyone", async () => {
    const r = await rider();
    const socket = open();
    const authError = new Promise((resolve) => socket.on('auth-error', resolve));
    socket.emit('join', { userId: r.user._id, userType: 'user' }); // old, spoofable style
    await authError;
    const user = await User().findById(r.user._id);
    assert.equal(user.socketId, null);
    socket.close();
});

test("a rider token can't join as a captain", async () => {
    const r = await rider();
    const socket = open();
    const authError = new Promise((resolve) => socket.on('auth-error', resolve));
    socket.emit('join', { token: r.token, userType: 'captain' });
    await authError;
    socket.close();
});

test('location updates only move the authenticated captain, and are throttled', async () => {
    const c = await captain();
    const victim = await captain();
    const socket = open();
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.emit('join', { token: c.token, userType: 'captain' });
    await wait(200);
    // Tries to move another captain by passing their id: ignored, identity comes from the token.
    socket.emit('update-location-captain', { userId: victim.id, location: { lat: 22.6, lng: 88.4 } });
    socket.emit('update-location-captain', { location: { lat: 0, lng: 0 } }); // within 2 s → dropped
    await wait(300);
    const me = await Captain().findById(c.id);
    const other = await Captain().findById(victim.id);
    assert.deepEqual(me.location.coordinates, [88.4, 22.6]);
    assert.deepEqual(other.location.coordinates, [88.352, 22.554], "victim didn't move");
    socket.emit('update-location-captain', { location: { lat: 'x', lng: 999 } });
    socket.close();
});

test("a captain's location reaches only the rider of their own active ride", async () => {
    const r = await rider();
    const c = await captain();
    const intruder = await captain();
    const { body } = await bookRide(r.token);
    await api().post('/rides/confirm').set(auth(c.token)).send({ rideId: body.ride._id });

    const riderSocket = open();
    await new Promise((resolve) => riderSocket.on('connect', resolve));
    riderSocket.emit('join', { token: r.token, userType: 'user' });
    const updates = [];
    riderSocket.on('captain-location', (data) => updates.push(data));

    const intruderSocket = open();
    await new Promise((resolve) => intruderSocket.on('connect', resolve));
    intruderSocket.emit('join', { token: intruder.token, userType: 'captain' });
    const captainSocket = open();
    await new Promise((resolve) => captainSocket.on('connect', resolve));
    captainSocket.emit('join', { token: c.token, userType: 'captain' });
    await wait(300);

    intruderSocket.emit('update-location-captain', { rideId: body.ride._id, location: { lat: 1, lng: 1 } });
    captainSocket.emit('update-location-captain', { rideId: body.ride._id, location: { lat: 22.56, lng: 88.36 } });
    await wait(400);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].location, { lat: 22.56, lng: 88.36 });
    [riderSocket, intruderSocket, captainSocket].forEach((s) => s.close());
});

test('a captain going offline stops getting ride offers', async () => {
    const c = await captain();
    const socket = open();
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.emit('join', { token: c.token, userType: 'captain' });
    await wait(200);
    socket.close();
    await wait(300);
    const me = await Captain().findById(c.id);
    assert.equal(me.status, 'unavailable');
    const r = await rider();
    const { body } = await bookRide(r.token);
    assert.equal(body.notifiedCaptains, 0);
});
