const axios = require("axios");
const captainModel = require('../models/captain.models');
module.exports.getLocationCoordinates = async (address) => {
	if (!address || typeof address !== "string") {
		throw new Error("Address is required.");
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
    console.log('Searching near:', longitude, latitude, 'radius:', radius);
    
    // Check ALL captains and their locations
    const allCaptains = await captainModel.find({});
    console.log('Total captains:', allCaptains.length);
    allCaptains.forEach(c => {
        console.log('Captain:', c.email, 'Location:', JSON.stringify(c.location));
    });

    const captains = await captainModel.find({
        location: {
            $geoWithin: {
                $centerSphere: [[longitude, latitude], radius / 6371]
            }
        }
    });
    console.log('Nearby found:', captains.length);
    return captains;
};

function distanceInMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

// Distance in metres to the closest captain of each vehicle type within maxMeters
// of a point, e.g. { moto: 210, auto: 480 }. Types with nobody nearby are left out.
module.exports.getNearestCaptainsByType = async (latitude, longitude, maxMeters = 5000) => {
    const captains = await captainModel
        .find({
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
