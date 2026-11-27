const express = require('express');
const { query } = require('express-validator');
const mapController = require('../controllers/map.controller');
const { authUser, resolveAccount } = require('../middleware/auth.middleware');
const { expensiveLimiter } = require('../middleware/security.middleware');
const { tokenFromRequest } = require('../utils/tokens');
const { validate } = require('../utils/validators');

const router = express.Router();
// Free OpenStreetMap services (fair use): logged-in users only, rate limited and cached.
const place = (field) => query(field).isString().trim().isLength({ min: 1, max: 200 }).withMessage(`${field} is required`);
const near = [query('nearLat').optional().isFloat({ min: -90, max: 90 }), query('nearLng').optional().isFloat({ min: -180, max: 180 })];
const point = [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
];

// Riders and captains both draw routes and turn GPS into an address.
async function anyone(req, res, next) {
    const token = tokenFromRequest(req);
    const account = (await resolveAccount(token, 'user')) || (await resolveAccount(token, 'captain'));
    if (!account) return res.status(401).json({ message: 'Please log in again.' });
    return next();
}

router.get('/get-coordinates', authUser, expensiveLimiter, place('address'), ...near, validate, mapController.getcoordinates);
router.get('/get-distance-time', authUser, expensiveLimiter, place('origin'), place('destination'), ...near, validate, mapController.getDistanceTime);
router.get('/get-suggestions', authUser, expensiveLimiter, query('input').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Type at least 2 letters'), ...near, validate, mapController.getSuggestions);
router.get('/nearest-transit', authUser, expensiveLimiter, ...point, validate, mapController.getNearestTransit);
router.get('/route', anyone, expensiveLimiter, place('origin'), place('destination'), ...near, validate, mapController.getRoute);
router.get('/reverse', anyone, expensiveLimiter, ...point, validate, mapController.reverseGeocode);

module.exports = router;
