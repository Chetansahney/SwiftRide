const mapservice = require('../services/maps.services');

// Optional nearLat/nearLng (the rider's position) to rank nearby places first.
function nearFrom(query) {
    const lat = parseFloat(query.nearLat);
    const lng = parseFloat(query.nearLng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

module.exports.getcoordinates = async (req, res) => {
    res.json(await mapservice.getLocationCoordinates(req.query.address, nearFrom(req.query)));
};

module.exports.getDistanceTime = async (req, res) => {
    res.json(await mapservice.getDistanceTime(req.query.origin, req.query.destination, nearFrom(req.query)));
};

module.exports.getRoute = async (req, res) => {
    // "fastest" for a captain heading to a pickup (that is the ETA riders see);
    // the default is the shortest sensible route (the rider's trip and fare).
    const prefer = req.query.prefer === 'fastest' ? 'fastest' : 'shortest';
    res.json(await mapservice.getRoute(req.query.origin, req.query.destination, nearFrom(req.query), prefer));
};

module.exports.getSuggestions = async (req, res) => {
    res.json(await mapservice.getSuggestions(req.query.input, nearFrom(req.query)));
};

// Readable address for a GPS position (the "current location" pickup).
module.exports.reverseGeocode = async (req, res) => {
    const address = await mapservice.reverseGeocode(parseFloat(req.query.lat), parseFloat(req.query.lng));
    res.json({ address });
};

// Nearest Metro station (or railway station where a city has no Metro), for the
// one-tap "Nearest Metro" shortcut on the rider home screen.
module.exports.getNearestTransit = async (req, res) => {
    res.json(await mapservice.getNearestTransit(parseFloat(req.query.lat), parseFloat(req.query.lng)));
};
