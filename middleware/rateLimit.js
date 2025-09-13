const config = require('../config');

const rateLimitMiddleware = (windowMs = null, max = null) => {
  const rateLimiter = config.createRateLimit(
    windowMs || config.RATE_LIMIT_WINDOW_MS,
    max || config.RATE_LIMIT_MAX
  );
  
  return (req, res, next) => {
    const userId = req.user?._id?.toString() || req.sessionID || 'anonymous';
    const route = req.route?.path || req.path;
    const key = `${userId}|${req.method}|${route}`;
    
    const apiContext = config.createApiContext(req);
    const logger = config.getContextualLogger(req.sessionID, apiContext);
    
    const result = rateLimiter(key);
    
    if (!result.allowed) {
      logger.rateLimit('block', key.slice(-16));
      return res.status(429).json({
        success: false,
        error: 'rate_limit_exceeded',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }
    
    res.set({
      'X-RateLimit-Remaining': result.remaining,
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
    });
    
    next();
  };
};

module.exports = rateLimitMiddleware;