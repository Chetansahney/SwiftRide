const express=require('express');
const router=express.Router();
const {body,query,param}=require('express-validator');
const rideController=require('../controllers/ride.controller');
const safetyController=require('../controllers/safety.controller');
const authMiddleware=require('../middleware/auth.middleware');

router.post('/create',
    authMiddleware.authUser,
    body('origin').not().isEmpty().withMessage('Origin is required'),
    body('destination').not().isEmpty().withMessage('Destination is required'),
    body('vehicleType').isIn(['moto', 'bike', 'auto', 'car']).withMessage('Vehicle type is required'),
    body('preferWomenCaptain').optional().isBoolean(),
    rideController.createRide
)

router.get('/calculate-fare',
    authMiddleware.authUser,
    query('origin').not().isEmpty().withMessage('Origin is required'),
    query('destination').not().isEmpty().withMessage('Destination is required'),
    rideController.calculateFare
)

// Distance from the pickup to the nearest available driver of each vehicle type.
router.get('/nearby',
    authMiddleware.authUser,
    query('origin').not().isEmpty().withMessage('Origin is required'),
    rideController.getNearbyDrivers
)

router.post('/confirm',
    authMiddleware.authCaptain,
    body('rideId').not().isEmpty().withMessage('Ride ID is required'),
    rideController.confirmRide
)

router.post('/arrived',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Ride ID is required'),
    rideController.markArrived
)

router.post('/start-ride',
    authMiddleware.authCaptain,
    body('rideId').not().isEmpty().withMessage('Ride ID is required'),
    body('otp').not().isEmpty().withMessage('OTP is required'),
    rideController.startRide
)

router.post('/end-ride',
    authMiddleware.authCaptain,
    body('rideId').not().isEmpty().withMessage('Ride ID is required'),
    rideController.endRide
)

router.post('/complete-payment',
    authMiddleware.authUser,
    body('rideId').not().isEmpty().withMessage('Ride ID is required'),
    body('tip').optional().isInt({ min: 0, max: 200 }).withMessage('Tip must be between 0 and 200'),
    rideController.completePayment
)

router.get('/history',
    authMiddleware.authUser,
    rideController.getRideHistory
)

// Public: what a trusted contact sees when they open a shared trip link.
router.get('/shared/:token', safetyController.getSharedRide)

const rideIdParam = param('rideId').isMongoId().withMessage('Invalid ride');
const point = (field) => [
    body(`${field}.lat`).optional().isFloat({ min: -90, max: 90 }),
    body(`${field}.lng`).optional().isFloat({ min: -180, max: 180 }),
];

router.post('/:rideId/report',
    authMiddleware.authUser,
    rideIdParam,
    body('type').isIn(['extra_fare', 'harassment', 'unsafe_driving', 'wrong_driver', 'other']).withMessage('Choose what happened'),
    body('amount').optional().isInt({ min: 0, max: 1000 }),
    body('note').optional().isString().isLength({ max: 500 }),
    safetyController.reportRide
)

router.post('/:rideId/check-in',
    authMiddleware.authUser,
    rideIdParam,
    body('response').isIn(['ok', 'help', 'no_response']),
    ...point('location'),
    safetyController.checkIn
)

router.post('/:rideId/sos',
    authMiddleware.authUser,
    rideIdParam,
    body('silent').optional().isBoolean(),
    ...point('location'),
    safetyController.riderSos
)

router.post('/:rideId/captain-sos',
    authMiddleware.authCaptain,
    rideIdParam,
    body('silent').optional().isBoolean(),
    ...point('location'),
    safetyController.captainSos
)

router.post('/:rideId/share', authMiddleware.authUser, rideIdParam, safetyController.shareRide)

router.post('/:rideId/verify-driver',
    authMiddleware.authUser,
    rideIdParam,
    body('match').isBoolean(),
    safetyController.verifyDriver
)

router.post('/:rideId/reached',
    authMiddleware.authUser,
    rideIdParam,
    body('safe').isBoolean(),
    ...point('location'),
    safetyController.reachedSafely
)

router.get('/:rideId',
    authMiddleware.authUser,
    rideController.getRideById
)



module.exports=router;