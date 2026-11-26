const express = require('express');
const router = express.Router();
const { authAdmin } = require('../middleware/admin.middleware');
const { authLimiter } = require('../middleware/security.middleware');

// Wrong keys count towards the login limiter, so the admin key can't be guessed.
router.use(authLimiter);
const verificationController = require('../controllers/verification.controller');

router.get('/verifications', authAdmin, verificationController.listReviews);
router.post('/verifications/:captainId', authAdmin, verificationController.decideReview);

module.exports = router;
