const config = require('../config');

const idempotencyMiddleware = (ttl = null) => {
  return async (req, res, next) => {
    const key = config.createIdempotencyKey(req);
    const apiContext = config.createApiContext(req);
    const logger = config.getContextualLogger(req.sessionID, apiContext);
    
    const cached = config.getIdempotentResponse(key);
    if (cached) {
      logger.idempotent('replay', key.slice(-8));
      res.set('X-Idempotent-Replay', '1');
      return res.status(cached.status || 200).json(cached.body);
    }
    
    const originalJson = res.json;
    const originalStatus = res.status;
    let statusCode = 200;
    
    res.status = function(code) {
      statusCode = code;
      return originalStatus.call(this, code);
    };
    
    res.json = function(body) {
      config.storeIdempotentResponse(key, { status: statusCode, body }, ttl);
      logger.idempotent('store', key.slice(-8));
      return originalJson.call(this, body);
    };
    
    next();
  };
};

module.exports = idempotencyMiddleware;