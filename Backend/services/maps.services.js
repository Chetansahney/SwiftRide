const geo = require('./geo');
const captainModel = require('../models/captain.models');
const { currentShiftWindow } = require('../utils/shiftWindow');
const { CONFIRMED_WOMAN_FILTER } = require('../utils/womenSafety');

// "22.5726,88.3639" — the rider's current location sent as a pickup.
const COORDINATE_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
module.exports.COORDINATE_PAIR = COORDINATE_PAIR;

// Captains only get rides if they're not paused for review, passed identity
// verification, and their face check for the current shift window
// (6 AM–2 PM, 2 PM–10 PM, 10 PM–6 AM India time) matched.
function dispatchableFilter() {
    return {
        suspended: { $ne: true },
        // Online right now: app connected, sent a location in the last 2 minutes, not on a ride.
        status: 'available',
        socketId: { $ne: null },
        lastSeenAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
        'verification.status': 'verified',
        'shiftSelfie.windowId': currentShiftWindow().id,
        'shiftSelfie.status': 'verified',
    };
}
module.exports.dispatchableFilter = dispatchableFilter;

const toPoint = (value) => {
    const pair = String(value || '').match(COORDINATE_PAIR);
    return pair ? { lat: parseFloat(pair[1]), lng: parseFloat(pair[2]) } : null;
};

// Address or "lat,lng" -> { latitude, longitude }. Uses free OpenStreetMap search.
module.exports.getLocationCoordinates = async (address, near) => {
    if (!address || typeof address !== 'string') throw new Error('Address is required.');
    const point = toPoint(address);
    if (point) return { latitude: point.lat, longitude: point.lng };
    const place = await geo.geocode(address, near);
    if (!place) throw new Error('Unable to find that place.');
    return { latitude: place.lat, longitude: place.lng };
};

const formatKm = (meters) => (meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`);
function formatDuration(seconds) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} hour${hours > 1 ? 's' : ''}${rest ? ` ${rest} mins` : ''}`;
}
module.exports.formatDuration = formatDuration;

// Road distance and traffic-adjusted time between two places.
module.exports.getDistanceTime = async (origin, destination, near) => {
    if (!origin || !destination) throw new Error('Origin and destination are required.');
    const [from, to] = await Promise.all([
        module.exports.getLocationCoordinates(origin, near),
        module.exports.getLocationCoordinates(destination, near),
    ]);
    const result = await geo.route({ lat: from.latitude, lng: from.longitude }, { lat: to.latitude, lng: to.longitude });
    return {
        distance: formatKm(result.distanceM),
        duration: formatDuration(result.durationS),
        distanceM: result.distanceM,
        durationS: result.durationS,
        estimated: result.estimated,
    };
};

// Road line to draw on the map, between two places (addresses or "lat,lng").
module.exports.getRoute = async (origin, destination, near) => {
    const [from, to] = await Promise.all([
        module.exports.getLocationCoordinates(origin, near),
        module.exports.getLocationCoordinates(destination, near),
    ]);
    const result = await geo.route({ lat: from.latitude, lng: from.longitude }, { lat: to.latitude, lng: to.longitude });
    return {
        from: { lat: from.latitude, lng: from.longitude },
        to: { lat: to.latitude, lng: to.longitude },
        coordinates: result.coordinates,
        distance: formatKm(result.distanceM),
        duration: formatDuration(result.durationS),
        distanceM: result.distanceM,
        durationS: result.durationS,
    };
};

// Place suggestions while typing, nearest to the rider first.
module.exports.getSuggestions = async (input, near) => {
    if (!input) throw new Error('Input is required.');
    return geo.suggest(input, near);
};

module.exports.reverseGeocode = (lat, lng) => geo.reverse(lat, lng);

module.exports.getCaptainsNearby = async (latitude, longitude, radius) => {
    return captainModel.find({
        ...dispatchableFilter(),
        location: {
            $geoWithin: {
                $centerSphere: [[longitude, latitude], radius / 6371]
            }
        }
    });
};

// How many captains who could take a ride are within `meters` of a point —
// used to tell whether a drop is somewhere drivers usually return from empty.
module.exports.countCaptainsNear = async (latitude, longitude, meters) => {
    return captainModel.countDocuments({
        ...dispatchableFilter(),
        location: {
            $geoWithin: {
                $centerSphere: [[longitude, latitude], meters / 6371000]
            }
        }
    });
};

const { distanceInMeters } = geo;
module.exports.distanceInMeters = distanceInMeters;

// Distance in metres to the closest captain of each vehicle type within maxMeters
// of a point, e.g. { moto: 210, auto: 480 }. Types with nobody nearby are left out.
// With womenOnly, only women captains are counted.
module.exports.getNearestCaptainsByType = async (latitude, longitude, maxMeters = 5000, { womenOnly = false } = {}) => {
    const captains = await captainModel
        .find({
            ...dispatchableFilter(),
            ...(womenOnly ? CONFIRMED_WOMAN_FILTER : {}),
            location: {
                $near: {
                    $geometry: { type: 'Point', coordinates: [longitude, latitude] },
                    $maxDistance: maxMeters,
                },
            },
        })
        .select('vehicle.vehicleType location')
        .limit(100);

    const nearest = {};
    for (const captain of captains) {
        const rawType = captain.vehicle?.vehicleType;
        const type = rawType === 'bike' ? 'moto' : rawType;
        if (!type || nearest[type] !== undefined) continue;
        const [lng, lat] = captain.location.coordinates;
        nearest[type] = Math.round(distanceInMeters(latitude, longitude, lat, lng));
    }
    return nearest;
};

// Nearest Metro station (or railway station) to a point, or null.
module.exports.getNearestTransit = (latitude, longitude) => geo.nearestStation(latitude, longitude);
