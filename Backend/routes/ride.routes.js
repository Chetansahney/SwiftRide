const express = require('express');
const { body, query, param } = require('express-validator');
const rideController = require('../controllers/ride.controller');
const safetyController = require('../controllers/safety.controller');
const ratingController = require('../controllers/rating.controller');
const { authUser, authCaptain } = require('../middleware/auth.middleware');
const { expensiveLimiter, publicLimiter } = require('../middleware/security.middleware');
const { validate } = require('../utils/validators');

const router = express.Router();

const place = (field, where = body) => where(field).isString().trim().isLength({ min: 3, max: 200 }).withMessage(`${field} is required`);
const nearQuery = [query('nearLat').optional().isFloat({ min: -90, max: 90 }), query('nearLng').optional().isFloat({ min: -180, max: 180 })];
const nearBody = [body('nearLat').optional().isFloat({ min: -90, max: 90 }), body('nearLng').optional().isFloat({ min: -180, max: 180 })];
const rideIdBody = body('rideId').isMongoId().withMessage('Ride ID is required');
const rideIdParam = param('rideId').isMongoId().withMessage('Invalid ride');
const reason = body('reason').optional().isString().trim().isLength({ max: 200 });
const point = (field) => [
    body(`${field}.lat`).optional().isFloat({ min: -90, max: 90 }).toFloat(),
    body(`${field}.lng`).optional().isFloat({ min: -180, max: 180 }).toFloat(),
];

// ---- booking (rider) ----
router.post('/create',
    authUser,
    expensiveLimiter,
    place('origin'),
    place('destination'),
    body('vehicleType').isIn(['moto', 'bike', 'auto', 'car']).withMessage('Vehicle type is required'),
    body('preferWomenCaptain').optional().isBoolean().toBoolean(),
    ...nearBody,
    validate,
    rideController.createRide
);
router.get('/calculate-fare', authUser, expensiveLimiter, place('origin', query), place('destination', query), ...nearQuery, validate, rideController.calculateFare);
// Distance from the pickup to the nearest available driver of each vehicle type.
router.get('/nearby', authUser, expensiveLimiter, place('origin', query), ...nearQuery, validate, rideController.getNearbyDrivers);
router.get('/active', authUser, rideController.getActiveRide);
router.get('/nearby-vehicles',
    authUser,
    query('lat').isFloat({ min: -90, max: 90 }),
    query('lng').isFloat({ min: -180, max: 180 }),
    validate,
    rideController.nearbyVehicles
);
router.get('/history', authUser, rideController.getRideHistory);
router.post('/complete-payment',
    authUser,
    rideIdBody,
    body('tip').optional().isInt({ min: 0, max: 200 }).withMessage('Tip must be between 0 and 200').toInt(),
    validate,
    rideController.completePayment
);

// ---- driving (captain) ----
router.get('/captain/active', authCaptain, rideController.getCaptainActiveRide);
router.post('/confirm', authCaptain, rideIdBody, validate, rideController.confirmRide);
router.post('/arrived', authCaptain, rideIdBody, validate, rideController.markArrived);
router.post('/start-ride', authCaptain, rideIdBody, body('otp').isString().trim().matches(/^\d{4,6}$/).withMessage('Enter the 4-digit PIN'), validate, rideController.startRide);
router.post('/end-ride', authCaptain, rideIdBody, validate, rideController.endRide);

// Public: what a trusted contact sees when they open a shared trip link.
router.get('/shared/:token', publicLimiter, param('token').isHexadecimal().isLength({ min: 32, max: 32 }), validate, safetyController.getSharedRide);

// ---- per ride ----
const stars = body('stars').isInt({ min: 1, max: 5 }).withMessage('Choose 1 to 5 stars').toInt();
router.post('/:rideId/rate', authUser, rideIdParam, stars, body('comment').optional().isString().trim().isLength({ max: 300 }), validate, ratingController.rateCaptain);
router.post('/:rideId/rate-rider', authCaptain, rideIdParam, stars, validate, ratingController.rateRider);
router.get('/captain/stats', authCaptain, ratingController.captainStats);
router.get('/captain/history', authCaptain, ratingController.captainHistory);

router.post('/:rideId/cancel', authUser, rideIdParam, reason, validate, rideController.cancelByRider);
router.post('/:rideId/decline', authCaptain, rideIdParam, validate, rideController.declineOffer);
router.post('/:rideId/allow-any-captain', authUser, rideIdParam, validate, rideController.allowAnyCaptain);
router.post('/:rideId/captain-cancel', authCaptain, rideIdParam, reason, validate, rideController.cancelByCaptain);

router.post('/:rideId/report',
    authUser,
    rideIdParam,
    body('type').isIn(['extra_fare', 'harassment', 'unsafe_driving', 'wrong_driver', 'other']).withMessage('Choose what happened'),
    body('amount').optional().isInt({ min: 0, max: 1000 }).toInt(),
    body('note').optional().isString().trim().isLength({ max: 500 }),
    validate,
    safetyController.reportRide
);
router.post('/:rideId/check-in', authUser, rideIdParam, body('response').isIn(['ok', 'help', 'no_response']), ...point('location'), validate, safetyController.checkIn);
router.post('/:rideId/sos', authUser, rideIdParam, body('silent').optional().isBoolean().toBoolean(), ...point('location'), validate, safetyController.riderSos);
router.post('/:rideId/captain-sos', authCaptain, rideIdParam, body('silent').optional().isBoolean().toBoolean(), ...point('location'), validate, safetyController.captainSos);
router.post('/:rideId/share', authUser, rideIdParam, validate, safetyController.shareRide);
router.post('/:rideId/verify-driver', authUser, rideIdParam, body('match').isBoolean().toBoolean(), ...point('location'), validate, safetyController.verifyDriver);
router.post('/:rideId/reached', authUser, rideIdParam, body('safe').isBoolean().toBoolean(), ...point('location'), validate, safetyController.reachedSafely);

router.get('/:rideId', authUser, rideIdParam, validate, rideController.getRideById);

module.exports = router;
