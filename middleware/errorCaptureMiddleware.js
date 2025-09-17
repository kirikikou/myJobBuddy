const ErrorLogger = require('../utils/ErrorLogger');

const loggingService = require('../services/LoggingService');
class ErrorCaptureMiddleware {
  constructor() {
    this.samplingRate = parseFloat(process.env.ERROR_SAMPLING_RATE) || 0.05;
    this.enabled = process.env.ERROR_CAPTURE_ENABLED !== 'false';
    
    if (this.enabled) {
      loggingService.service('ErrorCaptureMiddleware', 'enabled', { samplingRate: this.samplingRate * 100 }); 
      this.setupProcessHandlers();
    } else {
      loggingService.service('errorCaptureMiddleware','log',{ message: '🔕 ErrorCaptureMiddleware DISABLED - Performance mode' });
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
      loggingService.error('[ERROR_CAPTURE]',{ error: JSON.stringify({
        ...errorData,
        sampled: true,
        rate: this.samplingRate
      } )});
    } catch (e) {
      loggingService.error('[ERROR_CAPTURE] Failed to log error:',{ error: e.message });
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
}

const errorCaptureMiddleware = new ErrorCaptureMiddleware();

module.exports = errorCaptureMiddleware;