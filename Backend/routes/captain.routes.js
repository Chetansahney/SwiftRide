const express = require('express');
const { body } = require('express-validator');
const captainController = require('../controllers/captain.controller');
const verificationController = require('../controllers/verification.controller');
const { authCaptain } = require('../middleware/auth.middleware');
const { authLimiter, faceLimiter } = require('../middleware/security.middleware');
const { passwordRule, emailRule, nameRule, loginRules, validate } = require('../utils/validators');
const { PLATE_PATTERN, normalise } = require('../services/verificationProvider');

const router = express.Router();

router.post('/register',
    authLimiter,
    nameRule('name.firstname'),
    nameRule('name.lastname', { optional: true }),
    emailRule(),
    passwordRule(),
    body('vehicle.color').isString().trim().isLength({ min: 2, max: 30 }).withMessage('Vehicle color is required'),
    body('vehicle.model').isString().trim().isLength({ min: 2, max: 40 }).withMessage('Vehicle model is required'),
    body('vehicle.plate').isString().custom((plate) => PLATE_PATTERN.test(normalise(plate))).withMessage('Enter a vehicle number like WB02AK4417'),
    body('vehicle.capacity').isInt({ min: 1, max: 8 }).withMessage('Vehicle capacity must be 1 to 8').toInt(),
    body('vehicle.vehicleType').isIn(['car', 'bike', 'moto', 'auto']).withMessage('Vehicle type must be car, bike, moto or auto'),
    body('gender').optional({ values: 'falsy' }).isIn(['female', 'male', 'other']),
    validate,
    captainController.register
);
router.post('/login', authLimiter, loginRules, validate, captainController.loginCaptain);

router.get('/profile', authCaptain, captainController.getCaptainProfile);
router.post('/logout', authCaptain, captainController.logoutCaptain);
router.get('/logout', authCaptain, captainController.logoutCaptain);
router.post('/logout-all', authCaptain, captainController.logoutAll);
router.post('/password', authLimiter, authCaptain, body('currentPassword').isString().isLength({ min: 1, max: 72 }), passwordRule('newPassword'), validate, captainController.changePassword);
router.delete('/profile', authCaptain, captainController.deleteAccount);

// Identity check (licence + vehicle + face) and the face check for each shift window.
router.get('/verification', authCaptain, verificationController.getVerification);
router.post('/liveness-challenge', authCaptain, body('purpose').optional().isIn(['verification', 'shift']), validate, verificationController.createChallenge);
router.post('/verification', faceLimiter, authCaptain, verificationController.submitVerification);
router.post('/shift-selfie', faceLimiter, authCaptain, verificationController.uploadShiftSelfie);

router.patch('/settings',
    authCaptain,
    body('gender').optional({ values: 'null' }).isIn(['female', 'male', 'other', '']).withMessage('Gender must be female, male or other'),
    body('womenRidersOnly').optional().isBoolean(),
    validate,
    captainController.updateSettings
);

module.exports = router;
