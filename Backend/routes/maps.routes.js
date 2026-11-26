const express = require('express');
const { query } = require('express-validator');
const mapController = require('../controllers/map.controller');
const { authUser } = require('../middleware/auth.middleware');
const { expensiveLimiter } = require('../middleware/security.middleware');
const { validate } = require('../utils/validators');

const router = express.Router();
// Every call here costs Google Maps money: logged-in riders only, and rate limited.
const place = (field) => query(field).isString().trim().isLength({ min: 1, max: 200 }).withMessage(`${field} is required`);

router.get('/get-coordinates', authUser, expensiveLimiter, place('address'), validate, mapController.getcoordinates);
router.get('/get-distance-time', authUser, expensiveLimiter, place('origin'), place('destination'), validate, mapController.getDistanceTime);
router.get('/get-suggestions', authUser, expensiveLimiter, query('input').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Type at least 2 letters'), validate, mapController.getSuggestions);
router.get('/nearest-transit',
    authUser,
    expensiveLimiter,
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    validate,
    mapController.getNearestTransit
);

module.exports = router;
