const express = require('express');
const config = require('../config');
const userPreferencesManager = require('../userPreferencesManager');
const { isAuthenticated } = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimit');
const idempotencyMiddleware = require('../middleware/idempotency');

const router = express.Router();

router.post('/save-user-preferences', 
  isAuthenticated,
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  async (req, res) => {
    try {
      const userId = req.user._id.toString();
      const success = await userPreferencesManager.saveUserPreferences(userId, req.body);
      
      if (success) {
        config.smartLog('win', `User preferences saved for ${userId}`);
        res.json({
          success: true,
          message: 'User preferences saved successfully'
        });
      } else {
        config.smartLog('fail', `Failed to save preferences for ${userId}`);
        res.status(500).json({
          success: false,
          message: 'Failed to save user preferences'
        });
      }
    } catch (error) {
      config.smartLog('fail', `Error saving user preferences: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error saving user preferences',
        error: error.message
      });
    }
  }
);

module.exports = router;