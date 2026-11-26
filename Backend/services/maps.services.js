const axios = require("axios");
const captainModel = require('../models/captain.models');
const { currentShiftWindow } = require('../utils/shiftWindow');

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

module.exports.getLocationCoordinates = async (address) => {
	if (!address || typeof address !== "string") {
		throw new Error("Address is required.");
	}

	const pair = address.match(COORDINATE_PAIR);
	if (pair) {
		return { latitude: parseFloat(pair[1]), longitude: parseFloat(pair[2]) };
	}

	const apiKey = process.env.GOOGLE_MAPS_API;
	if (!apiKey) {
		throw new Error("GOOGLE_MAPS_API is not set.");
	}

	const url = "https://maps.googleapis.com/maps/api/geocode/json";

	const response = await axios.get(url, {
		params: {
			address: address.trim(),
			key: apiKey,
		},
	});

	const data = response.data;
	if (!data || data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
		const status = data && data.status ? data.status : "UNKNOWN_ERROR";
		throw new Error(`Unable to geocode address. Status: ${status}`);
	}

	const location = data.results[0].geometry.location;
	return {
		latitude: location.lat,
		longitude: location.lng,
	};
};
module.exports.getDistanceTime = async (origin, destination) => {
    if (!origin || !destination) {
        throw new Error("Origin and destination are required.");
    }
    const apiKey = process.env.GOOGLE_MAPS_API;
    if (!apiKey) {
        throw new Error("GOOGLE_MAPS_API is not set.");
    }
    const url = "https://maps.googleapis.com/maps/api/distancematrix/json";
    const response = await axios.get(url, {
        params: {
            origins: origin.trim(),
            destinations: destination.trim(),
            key: apiKey,
        },
    });
    const data = response.data;
    if (!data || data.status !== "OK" || !Array.isArray(data.rows) || data.rows.length === 0) {
        const status = data && data.status ? data.status : "UNKNOWN_ERROR";
        throw new Error(`Unable to calculate distance and time. Status: ${status}`);
    }
    const element = data.rows[0].elements[0];
    if (element.status !== "OK") {
        throw new Error(`Unable to calculate distance and time. Element status: ${element.status}`);
    }
    return {
        distance: element.distance.text,
        duration: element.duration.text,
    };
}
module.exports.getSuggestions = async (input) => {
    if (!input || typeof input !== "string") {
        throw new Error("Input is required.");
    }
    const apiKey = process.env.GOOGLE_MAPS_API; 
    if (!apiKey) {
        throw new Error("GOOGLE_MAPS_API is not set.");
    }
    const url = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
    const response = await axios.get(url, {
        params: {   
            input: input.trim(),
            key: apiKey,
        },  
    });
    const data = response.data;
    if (!data || data.status !== "OK" || !Array.isArray(data.predictions)) {
        const status = data && data.status ? data.status : "UNKNOWN_ERROR";
        throw new Error(`Unable to fetch suggestions. Status: ${status}`);
    }
    return data.predictions.map(prediction => ({
        description: prediction.description,
        place_id: prediction.place_id,
    }));
}


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

function distanceInMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(a));
}
module.exports.distanceInMeters = distanceInMeters;

// Distance in metres to the closest captain of each vehicle type within maxMeters
// of a point, e.g. { moto: 210, auto: 480 }. Types with nobody nearby are left out.
// With womenOnly, only women captains are counted.
module.exports.getNearestCaptainsByType = async (latitude, longitude, maxMeters = 5000, { womenOnly = false } = {}) => {
    const captains = await captainModel
        .find({
            ...dispatchableFilter(),
            ...(womenOnly ? { gender: 'female' } : {}),
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

// Closest landmark of a given kind (e.g. the nearest Metro station) to a point,
// using Places Nearby Search ranked by distance. Returns null if none is found.
module.exports.getNearestPlace = async (latitude, longitude, type) => {
    const apiKey = process.env.GOOGLE_MAPS_API;
    if (!apiKey) {
        throw new Error("GOOGLE_MAPS_API is not set.");
    }
    const response = await axios.get("https://maps.googleapis.com/maps/api/place/nearbysearch/json", {
        params: {
            location: `${latitude},${longitude}`,
            rankby: "distance",
            type,
            key: apiKey,
        },
    });
    const place = response.data?.results?.[0];
    if (!place) {
        return null;
    }
    return {
        name: place.name,
        address: [place.name, place.vicinity].filter(Boolean).join(", "),
        type,
    };
};
