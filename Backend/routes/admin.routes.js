const express = require('express');
const router = express.Router();
const { authAdmin } = require('../middleware/admin.middleware');
const verificationController = require('../controllers/verification.controller');

router.get('/verifications', authAdmin, verificationController.listReviews);
router.post('/verifications/:captainId', authAdmin, verificationController.decideReview);

module.exports = router;
