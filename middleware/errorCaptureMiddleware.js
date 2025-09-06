const config = require('../config');
const ErrorLogger = require('../utils/ErrorLogger');

class ErrorCaptureService {
  constructor() {
    this.samplingRate = parseFloat(process.env.ERROR_SAMPLING_RATE) || 0.05;
    this.enabled = process.env.ERROR_CAPTURE_ENABLED !== 'false';
    
    if (this.enabled) {
      config.smartLog('buffer',`ErrorCaptureService ENABLED - Sampling: ${this.samplingRate * 100}%`);
      this.setupProcessHandlers();
    } else {
      config.smartLog('buffer','ErrorCaptureService DISABLED - Performance mode');
    }
  }

  shouldSample() {
    return Math.random() < this.samplingRate;
  }

  setupProcessHandlers() {
    process.on('uncaughtException', (error) => {
      if (this.shouldSample()) {
        this.logError({
          type: 'uncaughtException',
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
      }
    });

    process.on('unhandledRejection', (reason, promise) => {
      if (this.shouldSample()) {
        this.logError({
          type: 'unhandledRejection',
          message: reason?.message || reason,
          stack: reason?.stack,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return 'https://' + url;
  }

  extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (error) {
      const domainMatch = url.match(/(?:https?:\/\/)?([^\/\s\)\,\;]+)/);
      return domainMatch ? domainMatch[1] : null;
    }
  }

  logError(errorData) {
    if (!this.enabled || !this.shouldSample()) return;
    
    try {
      config.smartLog('fail','[ERROR_CAPTURE]', JSON.stringify({
        ...errorData,
        sampled: true,
        rate: this.samplingRate
      }));
    } catch (e) {
      config.smartLog('fail','[ERROR_CAPTURE] Failed to log error:', e.message);
    }
  }

  logScrapingError(options) {
    if (!this.enabled || !this.shouldSample()) return;
    
    this.logError({
      type: 'scraping_error',
      url: this.normalizeUrl(options.url),
      domain: this.extractDomain(options.url),
      step: options.step,
      error: options.error?.message,
      attempt: options.attempt,
      timestamp: new Date().toISOString()
    });
  }

  logSoftFail(stepName, error, fallbackStep = null) {
    if (!this.enabled || !this.shouldSample()) return;
    
    this.logError({
      type: 'soft_fail',
      step: stepName,
      error: error?.message,
      fallback: fallbackStep,
      resolved: !!fallbackStep,
      timestamp: new Date().toISOString()
    });
  }

  getStats() {
    return {
      captureActive: this.enabled,
      samplingRate: this.samplingRate,
      timestamp: new Date().toISOString()
    };
  }

  createMiddleware() {
    return (req, res, next) => {
      const apiContext = config.createApiContext(req);
      const logger = config.getContextualLogger(req.sessionID, apiContext);
      
      req.errorCapture = {
        logError: (errorData) => this.logError(errorData),
        logScrapingError: (options) => this.logScrapingError(options),
        logSoftFail: (stepName, error, fallback) => this.logSoftFail(stepName, error, fallback)
      };
      
      const originalNext = next;
      next = (error) => {
        if (error && this.shouldSample()) {
          this.logError({
            type: 'middleware_error',
            message: error.message,
            stack: error.stack,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
          });
        }
        originalNext(error);
      };
      
      next();
    };
  }
}

const errorCaptureService = new ErrorCaptureService();

module.exports = errorCaptureService.createMiddleware();