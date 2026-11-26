const express = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/user.controllers');
const { authUser } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/security.middleware');
const { passwordRule, emailRule, nameRule, loginRules, validate } = require('../utils/validators');

const router = express.Router();

router.post('/register', authLimiter, nameRule('name.firstname'), nameRule('name.lastname', { optional: true }), emailRule(), passwordRule(), validate, userController.register);
router.post('/login', authLimiter, loginRules, validate, userController.login);

router.get('/profile', authUser, userController.getUserProfile);
router.patch('/profile', authUser, nameRule('name.firstname', { optional: true }), nameRule('name.lastname', { optional: true }), emailRule().optional(), validate, userController.updateUserProfile);
router.delete('/profile', authUser, userController.deleteAccount);

// POST is the safe method; GET stays for the existing app until it's updated.
router.post('/logout', authUser, userController.logout);
router.get('/logout', authUser, userController.logout);
router.post('/logout-all', authUser, userController.logoutAll);
router.post('/password', authLimiter, authUser, body('currentPassword').isString().isLength({ min: 1, max: 72 }), passwordRule('newPassword'), validate, userController.changePassword);

const placeText = (field) => body(field).optional({ values: 'falsy' }).isString().trim().isLength({ max: 200 });
router.put('/places',
    authUser,
    placeText('home'),
    placeText('work'),
    body('custom').optional().isArray({ max: 10 }).withMessage('Up to 10 saved places'),
    body('custom.*.id').isString().matches(/^[a-z0-9]{1,20}$/i),
    body('custom.*.label').isString().trim().isLength({ min: 1, max: 30 }),
    body('custom.*.address').isString().trim().isLength({ min: 1, max: 200 }),
    validate,
    userController.updatePlaces
);

// "+91 98765 43210" / "098765 43210" → "9876543210"
const normalizePhone = (value) => String(value || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

router.patch('/safety',
    authUser,
    body('trustedContacts').optional().isArray({ max: 3 }).withMessage('You can add up to 3 trusted contacts'),
    body('trustedContacts.*.name').isString().trim().notEmpty().withMessage('Contact name is required').isLength({ max: 40 }),
    body('trustedContacts.*.phone').customSanitizer(normalizePhone).matches(/^[6-9]\d{9}$/).withMessage('Enter a 10-digit Indian mobile number'),
    body('safetyPrefs.travellingAsWoman').optional().isBoolean(),
    body('safetyPrefs.shareAtNight').optional().isBoolean(),
    validate,
    userController.updateSafety
);

module.exports = router;
