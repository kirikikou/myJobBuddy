const express = require('express');
const config = require('../config');
const userPreferencesManager = require('../userPreferencesManager');
const { isAuthenticated } = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimit');
const idempotencyMiddleware = require('../middleware/idempotency');
const { createPreferencesJSONValidator } = require('../middleware/jsonValidationMiddleware');
const loggingService = require('../services/LoggingService');

const router = express.Router();

const preferencesJSONValidator = createPreferencesJSONValidator();

router.post('/save-user-preferences', 
  isAuthenticated,
  preferencesJSONValidator,
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  async (req, res) => {
    const startTime = Date.now();
    const userId = req.user._id.toString();
    const requestId = req.headers['x-request-id'] || Date.now().toString();
    
    try {
      loggingService.buffer('save-user-preferences-start', {
        userId: userId.slice(-8),
        requestId,
        bodySize: JSON.stringify(req.body).length
      });

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        loggingService.fail('Invalid preferences payload structure', {
          userId: userId.slice(-8),
          bodyType: typeof req.body,
          isArray: Array.isArray(req.body)
        });
        
        return res.status(400).json({
          success: false,
          message: 'Invalid preferences data structure',
          code: 'INVALID_PAYLOAD_STRUCTURE'
        });
      }

      const sanitizedBody = JSON.parse(JSON.stringify(req.body));
      
      const success = await userPreferencesManager.saveUserPreferences(userId, sanitizedBody);
      
      const duration = Date.now() - startTime;
      
      if (success) {
        loggingService.win('User preferences saved successfully', {
          userId: userId.slice(-8),
          requestId,
          duration
        });
        
        res.status(200).json({
          success: true,
          message: 'User preferences saved successfully',
          metadata: {
            requestId,
            duration,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        loggingService.fail('Failed to save user preferences', {
          userId: userId.slice(-8),
          requestId,
          duration
        });
        
        res.status(500).json({
          success: false,
          message: 'Failed to save user preferences',
          code: 'SAVE_OPERATION_FAILED',
          metadata: {
            requestId,
            duration,
            timestamp: new Date().toISOString()
          }
        });
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      loggingService.fail('Error in save-user-preferences route', {
        error: error.message,
        userId: userId.slice(-8),
        requestId,
        duration,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });

      res.status(500).json({
        success: false,
        message: 'Error saving user preferences',
        error: error.message,
        code: 'ROUTE_EXECUTION_ERROR',
        metadata: {
          requestId,
          duration,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

module.exports = router;