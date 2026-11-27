// Free, key-less geography: no Google Maps billing.
//   Search & reverse lookup – Photon (OpenStreetMap data)   PHOTON_URL
//   Roads, distance, time   – OSRM (FOSSGIS servers)        OSRM_URL
// The public servers are free "fair use" services: we identify ourselves,
// cache answers and keep request rates low. At scale, run your own copies
// (all open source) and point the env vars at them.
const axios = require('axios');

const PHOTON_URL = process.env.PHOTON_URL || 'https://photon.komoot.io';
const OSRM_URL = process.env.OSRM_URL || 'https://routing.openstreetmap.de/routed-car';
// OSRM's free-flow times are optimistic for Indian city traffic.
const TRAFFIC_FACTOR = Number(process.env.ROUTE_TRAFFIC_FACTOR) || 1.6;
// Used when routing is unavailable: straight line × typical road detour, at city speed.
const ROAD_DETOUR = 1.35;
// ~25 km/h matches OSRM × traffic factor on typical city trips.
const CITY_KMPH = 25;
// India's bounding box, so a search never jumps to another country.
const INDIA_BBOX = '68.1,6.5,97.4,35.7';

const http = axios.create({
    timeout: 6000,
    headers: { 'User-Agent': 'SwiftRide/1.0 (ride-hailing app)' },
});

// ---------- small helpers ----------

const quietWarn = (...args) => {
    if (process.env.NODE_ENV !== 'test') console.warn(...args);
};

// In-memory cache with expiry and a size cap (oldest entries dropped first).
function createCache(maxEntries, ttlMs) {
    const map = new Map();
    return {
        get(key) {
            const hit = map.get(key);
            if (!hit) return undefined;
            if (hit.expires < Date.now()) {
                map.delete(key);
                return undefined;
            }
            return hit.value;
        },
        set(key, value) {
            if (map.size >= maxEntries) map.delete(map.keys().next().value);
            map.set(key, { value, expires: Date.now() + ttlMs });
        },
    };
}

// Spaces requests to one provider at least `intervalMs` apart.
function createThrottle(intervalMs) {
    let next = 0;
    return async () => {
        const now = Date.now();
        const wait = Math.max(0, next - now);
        next = Math.max(now, next) + intervalMs;
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    };
}

const DAY = 24 * 60 * 60 * 1000;
const placeCache = createCache(5000, 7 * DAY); // text → { lat, lng, label }
const suggestCache = createCache(3000, DAY);
const reverseCache = createCache(5000, DAY);
const routeCache = createCache(3000, 6 * 60 * 60 * 1000);
const transitCache = createCache(2000, 7 * DAY);
const photonThrottle = createThrottle(120);
const osrmThrottle = createThrottle(150);

// Minutes as shown everywhere (offer card, rider chip, captain banner):
// nearest minute, never below 1.
const etaMinutes = (seconds) => Math.max(1, Math.round(seconds / 60));

const normalise = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

function distanceInMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

// "Park Street Station, Kolkata, West Bengal"
function labelOf(properties) {
    const p = properties || {};
    const isStation = p.osm_key === 'railway' && p.osm_value === 'station' && p.name && !/station/i.test(p.name);
    const parts = [isStation ? `${p.name} Station` : p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.district || p.locality, p.city || p.county, p.state];
    const seen = new Set();
    return parts
        .filter(Boolean)
        .filter((part) => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(', ');
}

function rememberPlace(label, lat, lng) {
    if (label && Number.isFinite(lat) && Number.isFinite(lng)) placeCache.set(normalise(label), { lat, lng, label });
}

// ---------- search ----------

// Autocomplete, biased towards `near` (the rider's position) and limited to India.
async function suggest(input, near) {
    const text = String(input || '').trim();
    if (text.length < 2) return [];
    const bias = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : '';
    const key = `${normalise(text)}|${bias}`;
    const cached = suggestCache.get(key);
    if (cached) return cached;
    const search = async (q, extra = {}) => {
        await photonThrottle();
        const params = { q, limit: 6, lang: 'en', bbox: INDIA_BBOX, ...extra };
        if (near) Object.assign(params, { lat: near.lat, lon: near.lng, location_bias_scale: 0.1, zoom: 12 });
        const { data } = await http.get(`${PHOTON_URL}/api/`, { params });
        return data?.features || [];
    };
    // "park street metro" → also look for stations named "park street" (station
    // names rarely contain the word "metro"), and list those first.
    const transitWords = /\b(metro|station|stn|railway|rly)\b/gi;
    const stripped = text.replace(transitWords, '').replace(/\s+/g, ' ').trim();
    const features = [];
    if (stripped !== text && stripped.length >= 2) features.push(...(await search(stripped, { osm_tag: 'railway:station' })));
    features.push(...(await search(text)));
    const seen = new Set();
    const results = [];
    for (const feature of features) {
        if (results.length >= 6) break;
        const [lng, lat] = feature.geometry?.coordinates || [];
        const label = labelOf(feature.properties);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        // Picking a suggestion later geocodes to exactly this point.
        rememberPlace(label, lat, lng);
        results.push({ description: label, place_id: `${feature.properties.osm_type}${feature.properties.osm_id}`, lat, lng });
    }
    suggestCache.set(key, results);
    return results;
}

// Text → coordinates. Suggestions the rider picked are already cached exactly.
async function geocode(address, near) {
    const key = normalise(address);
    const cached = placeCache.get(key);
    if (cached) return cached;
    const [first] = await suggest(address, near);
    if (!first) return null;
    const place = { lat: first.lat, lng: first.lng, label: first.description };
    placeCache.set(key, place);
    return place;
}

// Coordinates → a short readable address (for "current location" pickups).
async function reverse(lat, lng) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = reverseCache.get(key);
    if (cached !== undefined) return cached;
    await photonThrottle();
    const { data } = await http.get(`${PHOTON_URL}/reverse`, { params: { lat, lon: lng, limit: 1, lang: 'en' } });
    const feature = data?.features?.[0];
    const label = feature ? labelOf(feature.properties) : null;
    if (label) rememberPlace(label, lat, lng);
    reverseCache.set(key, label);
    return label;
}

// ---------- routes ----------

// Shortest distance among the routes, unless it is much slower than the
// fastest (then a jam is likely): saves the rider distance and fare without
// sending them into traffic.
const MAX_SLOWER = 1.25;
// prefer "fastest": a captain driving to a pickup takes the quickest way, and
// that is the time riders are told.
function pickRoute(routes, prefer = 'shortest') {
    if (!routes?.length) return null;
    const fastest = Math.min(...routes.map((r) => r.duration));
    if (prefer === 'fastest') return routes.find((r) => r.duration === fastest);
    return routes.filter((r) => r.duration <= fastest * MAX_SLOWER).sort((a, b) => a.distance - b.distance)[0];
}

function estimatedRoute(from, to) {
    const meters = distanceInMeters(from.lat, from.lng, to.lat, to.lng) * ROAD_DETOUR;
    return {
        distanceM: Math.round(meters),
        durationS: Math.round((meters / 1000 / CITY_KMPH) * 3600),
        coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
        ],
        estimated: true,
    };
}

const ROUTE_TIMEOUT_MS = 10000;

// Fair use: after "429 Too Many Requests" (or a timeout) the router is left
// alone for a while and estimates are used instead.
let osrmPausedUntil = 0;
async function osrmGet(url, options) {
    if (Date.now() < osrmPausedUntil) throw new Error('router paused (fair-use back-off)');
    await osrmThrottle();
    try {
        return await http.get(url, { timeout: ROUTE_TIMEOUT_MS, ...options });
    } catch (error) {
        if (error.response?.status === 429) osrmPausedUntil = Date.now() + 30000;
        else if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message)) osrmPausedUntil = Date.now() + 10000;
        throw error;
    }
}
const SNAP_RADIUS_M = 60;
const snapCache = createCache(5000, DAY);
const roadTimeCache = createCache(5000, 30 * 1000);
const pointKey = (p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

// The road points a vehicle could stop at for a place: up to 3 distinct points
// within ~60 m. A pickup beside a flyover snaps both to the flyover deck and to
// the street below, and the router then uses whichever is quicker to reach —
// instead of sending a driver 2.5 km round to the flyover's start.
async function snapCandidates(point) {
    const key = pointKey(point);
    const cached = snapCache.get(key);
    if (cached) return cached;
    let points = [point];
    try {
        const { data } = await osrmGet(`${OSRM_URL}/nearest/v1/driving/${point.lng},${point.lat}`, { params: { number: 5 } });
        const seen = new Set();
        const near = (data?.waypoints || [])
            .filter((w) => w.distance <= SNAP_RADIUS_M)
            .map((w) => ({ lng: w.location[0], lat: w.location[1] }))
            .filter((p) => {
                // Flyover deck and the street below can be ~3 m apart: compare precisely.
                const k = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .slice(0, 3);
        if (near.length) points = near;
    } catch (error) {
        quietWarn('[geo] snapping unavailable:', error.message);
    }
    snapCache.set(key, points);
    return points;
}

// For each source, the quickest of the destination's road points: { j, durationS, distanceM } (raw, not traffic-adjusted).
function bestPerSource(durations, distances) {
    return durations.map((row, i) => {
        let best = null;
        (row || []).forEach((seconds, j) => {
            if (seconds == null) return;
            if (!best || seconds < best.seconds) best = { j, seconds, metres: distances?.[i]?.[j] };
        });
        return best;
    });
}

// One OSRM "table" request: road time from each source to each target.
async function table(sources, targets) {
    const coords = [...sources, ...targets].map((p) => `${p.lng},${p.lat}`).join(';');
    const { data } = await osrmGet(`${OSRM_URL}/table/v1/driving/${coords}`, {
        params: {
            sources: sources.map((_, i) => i).join(';'),
            destinations: targets.map((_, j) => sources.length + j).join(';'),
            annotations: 'duration,distance',
        },
    });
    if (data?.code !== 'Ok') throw new Error(data?.code || 'NoTable');
    return data;
}

// Road time and distance from many points to one destination in ONE request
// (OSRM "table"), traffic-adjusted. This is THE pickup ETA: the captain's
// offer card, the rider's "X min away" and the captain's banner all come from
// it. Answers are cached for 30 s; if the router is down or slow, a
// straight-line estimate is used and marked `estimated`.
async function roadTimes(sources, destination) {
    if (!sources.length) return [];
    const estimate = (point) => {
        const { distanceM, durationS } = estimatedRoute(point, destination);
        return { distanceM, durationS, estimated: true };
    };
    const results = sources.map((point) => roadTimeCache.get(`${pointKey(point)}>${pointKey(destination)}`));
    const missing = sources.map((point, i) => (results[i] ? null : i)).filter((i) => i != null);
    if (!missing.length) return results;
    try {
        const targets = await snapCandidates(destination);
        const data = await table(missing.map((i) => sources[i]), targets);
        bestPerSource(data.durations, data.distances).forEach((best, k) => {
            const i = missing[k];
            const value = best
                ? { durationS: Math.round(best.seconds * TRAFFIC_FACTOR), distanceM: Math.round(best.metres ?? estimate(sources[i]).distanceM), estimated: false }
                : estimate(sources[i]);
            results[i] = value;
            if (!value.estimated) roadTimeCache.set(`${pointKey(sources[i])}>${pointKey(destination)}`, value);
        });
    } catch (error) {
        quietWarn('[geo] road times unavailable, using estimates:', error.message);
        for (const i of missing) results[i] = estimate(sources[i]);
    }
    return results;
}

// Road route between two points: distance, traffic-adjusted time, and the line
// to draw. Both ends snap to their quickest nearby road point (see above).
// Falls back to a straight-line estimate if the router is down, so fares and
// ETAs always work.
async function route(from, to, { prefer = 'shortest' } = {}) {
    const key = `${pointKey(from)}>${pointKey(to)}:${prefer}`;
    const cached = routeCache.get(key);
    if (cached) return cached;
    let result;
    try {
        const [starts, ends] = await Promise.all([snapCandidates(from), snapCandidates(to)]);
        let start = starts[0];
        let end = ends[0];
        if (starts.length > 1 || ends.length > 1) {
            // Quickest pair of road points (one small table request).
            const data = await table(starts, ends);
            let best = null;
            data.durations.forEach((row, i) =>
                (row || []).forEach((seconds, j) => {
                    if (seconds != null && (!best || seconds < best.seconds)) best = { i, j, seconds };
                })
            );
            if (best) {
                start = starts[best.i];
                end = ends[best.j];
            }
        }
        const { data } = await osrmGet(`${OSRM_URL}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}`, {
            params: { overview: 'full', geometries: 'geojson', alternatives: 3, steps: false },
        });
        const best = pickRoute(data?.routes, prefer);
        if (data?.code !== 'Ok' || !best) throw new Error(data?.code || 'NoRoute');
        result = {
            distanceM: Math.round(best.distance),
            durationS: Math.round(best.duration * TRAFFIC_FACTOR),
            coordinates: best.geometry?.coordinates || [],
            alternatives: data.routes.length,
            estimated: false,
        };
    } catch (error) {
        quietWarn('[geo] routing unavailable, using an estimate:', error.message);
        result = estimatedRoute(from, to);
    }
    routeCache.set(key, result);
    return result;
}

// ---------- nearby transit ----------

// Closest stations within 4 km (Metro and railway), nearest first.
async function nearestStation(lat, lng) {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = transitCache.get(key);
    if (cached !== undefined) return cached;
    let best = null;
    try {
        await photonThrottle();
        const { data } = await http.get(`${PHOTON_URL}/reverse`, {
            params: { lat, lon: lng, osm_tag: 'railway:station', radius: 4, limit: 5, lang: 'en' },
        });
        const feature = (data?.features || [])
            .map((f) => ({ f, meters: distanceInMeters(lat, lng, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
            .sort((a, b) => a.meters - b.meters)[0]?.f;
        if (feature) {
            const [stationLng, stationLat] = feature.geometry.coordinates;
            const address = labelOf(feature.properties);
            rememberPlace(address, stationLat, stationLng);
            best = { name: feature.properties.name, address, type: 'station', lat: stationLat, lng: stationLng };
        }
    } catch (error) {
        quietWarn('[geo] station lookup unavailable:', error.message);
    }
    transitCache.set(key, best);
    return best;
}

module.exports = { suggest, geocode, reverse, route, roadTimes, snapCandidates, bestPerSource, estimatedRoute, etaMinutes, pickRoute, nearestStation, distanceInMeters, labelOf, createCache, INDIA_BBOX };
