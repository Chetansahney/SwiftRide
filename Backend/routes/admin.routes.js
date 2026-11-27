const express = require('express');
const router = express.Router();
const { authAdmin } = require('../middleware/admin.middleware');
const { authLimiter } = require('../middleware/security.middleware');

// Wrong keys count towards the login limiter, so the admin key can't be guessed.
router.use(authLimiter);
const verificationController = require('../controllers/verification.controller');
const safetyController = require('../controllers/safety.controller');

router.get('/verifications', authAdmin, verificationController.listReviews);
router.post('/verifications/:captainId', authAdmin, verificationController.decideReview);

// SOS presses, missed check-ins, wrong-driver reports, "I don't feel safe".
router.get('/safety-alerts', authAdmin, safetyController.listAlerts);
router.post('/safety-alerts/:alertId', authAdmin, safetyController.updateAlert);

module.exports = router;
