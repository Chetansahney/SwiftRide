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
const CITY_KMPH = 20;
// India's bounding box, so a search never jumps to another country.
const INDIA_BBOX = '68.1,6.5,97.4,35.7';

const http = axios.create({
    timeout: 6000,
    headers: { 'User-Agent': 'SwiftRide/1.0 (ride-hailing app)' },
});

// ---------- small helpers ----------

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

// Road route between two points: distance, traffic-adjusted time, and the line
// to draw. Falls back to a straight-line estimate if the router is down, so
// fares and ETAs always work.
async function route(from, to) {
    const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
    const cached = routeCache.get(key);
    if (cached) return cached;
    let result;
    try {
        await osrmThrottle();
        const { data } = await http.get(`${OSRM_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`, {
            params: { overview: 'simplified', geometries: 'geojson', alternatives: false, steps: false },
        });
        const best = data?.routes?.[0];
        if (data?.code !== 'Ok' || !best) throw new Error(data?.code || 'NoRoute');
        result = {
            distanceM: Math.round(best.distance),
            durationS: Math.round(best.duration * TRAFFIC_FACTOR),
            coordinates: best.geometry?.coordinates || [],
            estimated: false,
        };
    } catch (error) {
        console.warn('[geo] routing unavailable, using an estimate:', error.message);
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
        console.warn('[geo] station lookup unavailable:', error.message);
    }
    transitCache.set(key, best);
    return best;
}

module.exports = { suggest, geocode, reverse, route, nearestStation, distanceInMeters, labelOf, createCache, INDIA_BBOX };
