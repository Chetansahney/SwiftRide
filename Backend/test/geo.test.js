// Route choice and the approximate "vehicles around you" view.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, reset, api, auth, rider, captain, mongoose } = require('./helpers');
const { pickRoute, distanceInMeters } = require('../services/geo');

before(start);
after(stop);
beforeEach(reset);

test('route choice: shortest distance, unless it is much slower than the fastest', () => {
    const route = (km, min) => ({ distance: km * 1000, duration: min * 60 });
    assert.equal(pickRoute([route(13.1, 17.2), route(12.1, 16.6)]).distance, 12100, 'shorter and faster');
    assert.equal(pickRoute([route(9, 10), route(8.5, 11.7)]).distance, 8500, 'shorter, 17% slower: still chosen');
    assert.equal(pickRoute([route(9, 10), route(8, 13.5)]).distance, 9000, 'shorter but 35% slower: avoid the jam');
    assert.equal(pickRoute([]), null);
});

test('vehicles around the rider: online captains only, positions blurred, no ids exposed', async () => {
    const r = await rider();
    const online = await captain({ at: { lat: 22.5545, lng: 88.3515 } });
    await captain({ at: { lat: 22.5545, lng: 88.3515 }, online: false });
    await captain({ at: { lat: 22.64, lng: 88.4 } }); // ~10 km away
    const res = await api().get('/rides/nearby-vehicles').query({ lat: 22.5535, lng: 88.351 }).set(auth(r.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1, 'only the nearby online captain');
    const [vehicle] = res.body;
    assert.deepEqual(Object.keys(vehicle).sort(), ['id', 'lat', 'lng', 'type']);
    assert.notEqual(vehicle.id, online.id);
    const actual = (await mongoose.model('Captain').findById(online.id)).location.coordinates;
    const offset = distanceInMeters(vehicle.lat, vehicle.lng, actual[1], actual[0]);
    assert.ok(offset >= 15 && offset <= 65, `shifted by ${offset.toFixed(0)} m`);
    // Same captain, same day: same token and offset, so the dot moves smoothly.
    const again = await api().get('/rides/nearby-vehicles').query({ lat: 22.5535, lng: 88.351 }).set(auth(r.token));
    assert.equal(again.body[0].id, vehicle.id);
    assert.equal(again.body[0].lat, vehicle.lat);
});

test('vehicles around needs a rider login', async () => {
    assert.equal((await api().get('/rides/nearby-vehicles').query({ lat: 22.5, lng: 88.3 })).status, 401);
});

test('a captain heading to a pickup takes the fastest route, not the shortest', () => {
    const route = (km, min) => ({ distance: km * 1000, duration: min * 60 });
    const routes = [route(2.4, 6), route(2.1, 7.2)];
    assert.equal(pickRoute(routes).distance, 2100, 'trip preview: shorter, only 20% slower');
    assert.equal(pickRoute(routes, 'fastest').distance, 2400, 'approach: quickest');
});
