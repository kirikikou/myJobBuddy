const config = require('../config');
const parallelization = require('../config/parallelization');
const dictionaries = require('../dictionaries');

class QueueGate {
  constructor() {
    this.activeRequests = 0;
    this.level = config.gate?.defaultLevel || 'LOW';
    this.updateLimits();
  }

  updateLimits() {
    const limits = parallelization.RESOURCE_LIMITS || {};
    const defaultLow = config.gate?.limits?.low || 5;
    const defaultMid = config.gate?.limits?.mid || 10;
    const defaultHigh = config.gate?.limits?.high || 15;
    const maxLow = config.gate?.limits?.maxLow || 15;
    const maxMid = config.gate?.limits?.maxMid || 50;
    const maxHigh = config.gate?.limits?.maxHigh || 100;
    const timeoutLow = config.gate?.timeouts?.low || 30000;
    const timeoutMid = config.gate?.timeouts?.mid || 60000;
    const timeoutHigh = config.gate?.timeouts?.high || 120000;
    
    this.thresholds = {
      LOW: {
        maxRequests: Math.min(limits.MAX_CONCURRENT_SCRAPERS || defaultLow, maxLow),
        timeout: timeoutLow,
        description: config.gate?.descriptions?.low || 'Conservative limits'
      },
      MID: {
        maxRequests: Math.min(limits.MAX_CONCURRENT_SCRAPERS || defaultMid, maxMid),
        timeout: timeoutMid,
        description: config.gate?.descriptions?.mid || 'Moderate limits'
      },
      HIGH: {
        maxRequests: Math.min(limits.MAX_CONCURRENT_SCRAPERS || defaultHigh, maxHigh),
        timeout: timeoutHigh,
        description: config.gate?.descriptions?.high || 'Aggressive limits'
      }
    };

    const current = this.getCurrentLevel();
    config.smartLog(dictionaries.logCategories.GATE, `Queue gate limits updated for ${current.level}: ${current.maxRequests} max requests`);
  }

  setLevel(level) {
    const validLevels = config.gate?.validLevels || ['LOW', 'MID', 'HIGH'];
    const fallbackLevel = config.gate?.fallbackLevel || 'LOW';
    
    if (!this.thresholds[level] || !validLevels.includes(level)) {
      config.smartLog(dictionaries.logCategories.FAIL, `Invalid queue gate level: ${level}. Using ${fallbackLevel}.`);
      level = fallbackLevel;
    }
    
    this.level = level;
    this.updateLimits();
    config.smartLog(dictionaries.logCategories.GATE, `Queue gate level set to ${level}`);
  }

  getCurrentLevel() {
    const fallbackLevel = config.gate?.fallbackLevel || 'LOW';
    const current = this.thresholds[this.level] || this.thresholds[fallbackLevel];
    return {
      level: this.level,
      maxRequests: current.maxRequests,
      timeout: current.timeout,
      activeRequests: this.activeRequests
    };
  }

  middleware(req, res, next) {
    const current = this.getCurrentLevel();
    const path = req.path || req.route?.path || '';
    
    const shouldBypass = dictionaries.shouldBypassGate(path);
    
    if (shouldBypass) {
      config.smartLog(dictionaries.logCategories.GATE, `Gate bypass for light endpoint: ${path}`);
      return next();
    }
    
    const statusCode = config.gate?.overloadStatusCode || 429;
    const errorMessage = config.gate?.overloadMessage || 'Server temporarily overloaded';
    const reasonCode = config.gate?.reasonCode || 'queue-capacity';
    
    if (this.activeRequests >= current.maxRequests) {
      config.smartLog(dictionaries.logCategories.GATE, `Request rejected - ${this.activeRequests}/${current.maxRequests} active (level: ${current.level}) for ${path}`);
      
      return res.status(statusCode).json({
        success: false,
        error: errorMessage,
        reason: reasonCode,
        level: current.level,
        activeRequests: this.activeRequests,
        maxRequests: current.maxRequests,
        endpoint: path
      });
    }

    this.activeRequests++;
    
    const cleanup = () => {
      const minRequests = config.gate?.minActiveRequests || 0;
      this.activeRequests = Math.max(minRequests, this.activeRequests - 1);
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    config.smartLog(dictionaries.logCategories.GATE, `Gate passed: ${path} (${this.activeRequests}/${current.maxRequests})`);
    next();
  }

  selectiveMiddleware(req, res, next) {
    const path = req.path || req.route?.path || '';
    const current = this.getCurrentLevel();
    
    if (dictionaries.isSystemEndpoint(path)) {
      config.smartLog(dictionaries.logCategories.GATE, `System bypass: ${path}`);
      return next();
    }
    
    if (dictionaries.isLightEndpoint(path)) {
      config.smartLog(dictionaries.logCategories.GATE, `Light endpoint bypass: ${path}`);
      return next();
    }
    
    if (!dictionaries.isHeavyEndpoint(path)) {
      config.smartLog(dictionaries.logCategories.GATE, `Non-heavy endpoint bypass: ${path}`);
      return next();
    }
    
    const statusCode = config.gate?.heavyOverloadStatusCode || 429;
    const errorMessage = config.gate?.heavyOverloadMessage || 'Server temporarily overloaded for heavy operations';
    const reasonCode = config.gate?.heavyReasonCode || 'queue-capacity-heavy';
    const categoryLabel = config.gate?.heavyCategoryLabel || 'heavy';
    
    if (this.activeRequests >= current.maxRequests) {
      config.smartLog(dictionaries.logCategories.GATE, `Heavy endpoint rejected - ${this.activeRequests}/${current.maxRequests} active (level: ${current.level}) for ${path}`);
      
      return res.status(statusCode).json({
        success: false,
        error: errorMessage,
        reason: reasonCode,
        level: current.level,
        activeRequests: this.activeRequests,
        maxRequests: current.maxRequests,
        endpoint: path,
        category: categoryLabel
      });
    }

    this.activeRequests++;
    
    const cleanup = () => {
      const minRequests = config.gate?.minActiveRequests || 0;
      this.activeRequests = Math.max(minRequests, this.activeRequests - 1);
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    config.smartLog(dictionaries.logCategories.GATE, `Heavy endpoint gate passed: ${path} (${this.activeRequests}/${current.maxRequests})`);
    next();
  }

  getStats() {
    const current = this.getCurrentLevel();
    const utilizationPrecision = config.gate?.utilizationPrecision || 1;
    const utilizationSuffix = config.gate?.utilizationSuffix || '%';
    
    return {
      level: current.level,
      activeRequests: this.activeRequests,
      maxRequests: current.maxRequests,
      utilization: (this.activeRequests / current.maxRequests * 100).toFixed(utilizationPrecision) + utilizationSuffix,
      timeout: current.timeout
    };
  }
}

const queueGateInstance = new QueueGate();

const queueGateMiddleware = queueGateInstance.middleware.bind(queueGateInstance);
const selectiveQueueGate = queueGateInstance.selectiveMiddleware.bind(queueGateInstance);

queueGateMiddleware.setLevel = (level) => queueGateInstance.setLevel(level);
queueGateMiddleware.updateLimits = () => queueGateInstance.updateLimits();
queueGateMiddleware.getStats = () => queueGateInstance.getStats();
queueGateMiddleware.selective = selectiveQueueGate;

selectiveQueueGate.setLevel = (level) => queueGateInstance.setLevel(level);
selectiveQueueGate.updateLimits = () => queueGateInstance.updateLimits();
selectiveQueueGate.getStats = () => queueGateInstance.getStats();

module.exports = queueGateMiddleware;