const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const { getEmailSearchStatus } = require('../middleware/emailLimitsMiddleware');

router.get('/status', isAuthenticated, getEmailSearchStatus);

module.exports = router;