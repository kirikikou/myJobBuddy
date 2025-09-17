const config = require('../config');

class QueueGate {
  constructor() {
    this.activeRequests = new Map();
    this.queueStats = {
      totalRequests: 0,
      activeCount: 0,
      rejectedCount: 0,
      maxConcurrent: config.queue?.maxConcurrent || 100
    };
    this.enabled = config.queue?.enabled !== false;
  }

  middleware() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next();
      }

      const requestId = this.generateRequestId();
      const startTime = Date.now();
      
      this.queueStats.totalRequests++;
      
      if (this.queueStats.activeCount >= this.queueStats.maxConcurrent) {
        this.queueStats.rejectedCount++;
        config.smartLog('queue', `Request rejected - queue full (${this.queueStats.activeCount}/${this.queueStats.maxConcurrent})`);
        
        return res.status(429).json({
          success: false,
          error: {
            code: 'QUEUE_FULL',
            message: 'Server queue is full. Please try again later.',
            type: 'rate_limit'
          },
          queueStats: {
            active: this.queueStats.activeCount,
            max: this.queueStats.maxConcurrent
          }
        });
      }

      this.queueStats.activeCount++;
      this.activeRequests.set(requestId, {
        startTime,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent') || 'unknown'
      });

      req.queueRequestId = requestId;
      
      config.smartLog('queue', `Request queued: ${req.method} ${req.path} (${this.queueStats.activeCount}/${this.queueStats.maxConcurrent})`);

      const originalEnd = res.end;
      const originalSend = res.send;
      const originalJson = res.json;

      const cleanup = () => {
        if (this.activeRequests.has(requestId)) {
          const requestInfo = this.activeRequests.get(requestId);
          const duration = Date.now() - requestInfo.startTime;
          
          this.activeRequests.delete(requestId);
          this.queueStats.activeCount--;
          
          config.smartLog('queue', `Request completed: ${req.method} ${req.path} (${duration}ms) - ${this.queueStats.activeCount} active`);
        }
      };

      res.end = function(...args) {
        cleanup();
        return originalEnd.apply(this, args);
      };

      res.send = function(...args) {
        cleanup();
        return originalSend.apply(this, args);
      };

      res.json = function(...args) {
        cleanup();
        return originalJson.apply(this, args);
      };

      res.on('close', cleanup);
      res.on('finish', cleanup);

      next();
    };
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats() {
    return {
      ...this.queueStats,
      activeRequests: Array.from(this.activeRequests.entries()).map(([id, info]) => ({
        id,
        duration: Date.now() - info.startTime,
        path: info.path,
        method: info.method
      }))
    };
  }

  setMaxConcurrent(max) {
    this.queueStats.maxConcurrent = Math.max(1, max);
    config.smartLog('queue', `Max concurrent requests updated to ${this.queueStats.maxConcurrent}`);
  }

  enable() {
    this.enabled = true;
    config.smartLog('queue', 'Queue gate enabled');
  }

  disable() {
    this.enabled = false;
    config.smartLog('queue', 'Queue gate disabled');
  }

  reset() {
    this.queueStats.totalRequests = 0;
    this.queueStats.rejectedCount = 0;
    config.smartLog('queue', 'Queue stats reset');
  }
}

const queueGateInstance = new QueueGate();

module.exports = queueGateInstance.middleware();