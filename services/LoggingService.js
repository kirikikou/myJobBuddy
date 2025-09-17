const config = require('../config');

class LoggingService {
  constructor() {
    this.config = config;
    this.asyncBuffer = [];
    this.bufferFlushInterval = null;
    this.maxBufferSize = 100;
    this.flushIntervalMs = 1000;
    this.highFrequencyCategories = new Set(['timing', 'parallel', 'batch', 'polling']);
    this.sessionContexts = new Map();
    
    this.startAsyncBuffering();
  }

  startAsyncBuffering() {
    if (this.bufferFlushInterval) return;
    
    this.bufferFlushInterval = setInterval(() => {
      this.flushAsyncBuffer();
    }, this.flushIntervalMs);
  }

  flushAsyncBuffer() {
    if (this.asyncBuffer.length === 0) return;
    
    const toFlush = this.asyncBuffer.splice(0, this.maxBufferSize);
    
    toFlush.forEach(logEntry => {
      this.config.smartLog(logEntry.category, logEntry.message, logEntry.data);
    });
  }

  log(category, message, data = null, options = {}) {
    const { async = false, sessionId = null, context = {} } = options;
    
    let finalMessage = message;
    let finalData = data;
    
    if (sessionId && this.sessionContexts.has(sessionId)) {
      const sessionContext = this.sessionContexts.get(sessionId);
      finalMessage = this.buildContextualMessage(message, sessionContext, context);
      finalData = { ...data, ...sessionContext, ...context };
    }
    
    if (async || this.highFrequencyCategories.has(category)) {
      this.asyncBuffer.push({ category, message: finalMessage, data: finalData });
      
      if (this.asyncBuffer.length >= this.maxBufferSize) {
        this.flushAsyncBuffer();
      }
    } else {
      this.config.smartLog(category, finalMessage, finalData);
    }
  }

  buildContextualMessage(message, sessionContext, extraContext) {
    const parts = [];
    
    if (sessionContext.sessionId) parts.push(`s:${sessionContext.sessionId.slice(-4)}`);
    if (sessionContext.userId) parts.push(`u:${sessionContext.userId.slice(-8)}`);
    if (sessionContext.domain) parts.push(sessionContext.domain);
    if (sessionContext.step) parts.push(sessionContext.step);
    if (sessionContext.attempt > 1) parts.push(`attempt=${sessionContext.attempt}`);
    if (extraContext.correlationId) parts.push(`c:${extraContext.correlationId}`);
    
    const prefix = parts.length > 0 ? `[${parts.join('|')}]` : '';
    return prefix ? `${prefix} ${message}` : message;
  }

  setSessionContext(sessionId, context) {
    this.sessionContexts.set(sessionId, {
      sessionId,
      userId: context.userId || 'anonymous',
      domain: context.domain || this.extractDomain(context.url),
      step: context.step || 'unknown',
      attempt: context.attempt || 1,
      timestamp: Date.now()
    });
  }

  updateSessionContext(sessionId, updates) {
    if (this.sessionContexts.has(sessionId)) {
      const existing = this.sessionContexts.get(sessionId);
      this.sessionContexts.set(sessionId, { ...existing, ...updates });
    }
  }

  clearSessionContext(sessionId) {
    this.sessionContexts.delete(sessionId);
  }

  extractDomain(url) {
    if (!url) return 'unknown';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  cache(action, domain, details = {}) {
    this.log('cache', `${action} for ${domain}`, details, { async: true });
  }

  scraper(action, domain, details = {}, sessionId = null) {
    this.log('scraper', `${action}: ${domain}`, details, { sessionId });
  }

  service(serviceName, action, details = {}) {
    this.log('service', `${serviceName}: ${action}`, details);
  }

  buffer(action, details = {}) {
    this.log('buffer', action, details);
  }

  error(errorMessage, details = {}, sessionId = null) {
    this.log('fail', errorMessage, details, { sessionId });
  }

  timing(operation, duration, details = {}) {
    this.log('timing', `${operation}: ${duration}ms`, details, { async: true });
  }

  win(message, details = {}, sessionId = null) {
    this.log('win', message, details, { sessionId });
  }

  fastTrack(message, details = {}, sessionId = null) {
    this.log('fast-track', message, details, { sessionId });
  }

  language(action, language, details = {}, sessionId = null) {
    this.log('langue', `${action}: ${language}`, details, { sessionId });
  }

  platform(platformName, action, details = {}, sessionId = null) {
    this.log('platform', `${platformName}: ${action}`, details, { sessionId });
  }

  steps(stepName, action, details = {}, sessionId = null) {
    this.log('steps', `${stepName}: ${action}`, details, { sessionId });
  }

  retry(message, attempt, maxAttempts, details = {}, sessionId = null) {
    this.log('retry', `${message} (${attempt}/${maxAttempts})`, details, { sessionId });
  }

  queue(action, domain, details = {}) {
    this.log('queue', `${action}: ${domain}`, details);
  }

  parallel(action, details = {}) {
    this.log('parallel', action, details, { async: true });
  }

  batch(action, details = {}) {
    this.log('batch', action, details, { async: true });
  }

  domainProfile(domain, action, details = {}) {
    this.log('domain-profile', `${domain}: ${action}`, details);
  }

  logScrapingStart(url, method, sessionId = null) {
    const domain = this.extractDomain(url);
    this.setSessionContext(sessionId, { url, step: method });
    this.scraper('started', domain, { method, url }, sessionId);
  }

  logScrapingSuccess(url, method, jobCount, duration, sessionId = null) {
    const domain = this.extractDomain(url);
    this.scraper('completed', domain, { 
      method, 
      jobCount, 
      duration, 
      success: true 
    }, sessionId);
    this.timing(`scraping-${method}`, duration, { domain, jobCount });
  }

  logScrapingFailure(url, method, error, sessionId = null) {
    const domain = this.extractDomain(url);
    this.scraper('failed', domain, { 
      method, 
      error: error.message, 
      success: false 
    }, sessionId);
  }

  logScrapingProgress(url, step, progress, sessionId = null) {
    const domain = this.extractDomain(url);
    this.updateSessionContext(sessionId, { step });
    this.steps(step, 'progress', { domain, progress }, sessionId);
  }

  logScrapingRetry(url, attempt, maxAttempts, reason, sessionId = null) {
    const domain = this.extractDomain(url);
    this.updateSessionContext(sessionId, { attempt });
    this.retry(`${domain} retry`, attempt, maxAttempts, { reason }, sessionId);
  }

  logSoftFail(error, resolvedBy, sessionId = null) {
    this.log('retry', `${error.message} → resolved by ${resolvedBy}`, {
      softFail: true,
      resolvedBy,
      cacheQuality: 'minimum',
      retryAdvice: 'defer_step_tuning'
    }, { sessionId });
  }

  logCacheOperation(operation, domain, success, duration = null) {
    const details = { success };
    if (duration) details.duration = duration;
    this.cache(operation, domain, details);
  }

  logCacheHit(domain, ageHours) {
    this.cache('hit', domain, { ageHours, fresh: ageHours < 24 });
  }

  logCacheMiss(domain) {
    this.cache('miss', domain);
  }

  logCacheEviction(domain, reason) {
    this.cache('eviction', domain, { reason });
  }

  logServiceInitialization(serviceName, success, duration = null) {
    const details = { success };
    if (duration) details.duration = duration;
    this.service(serviceName, 'initialized', details);
  }

  logServiceError(serviceName, operation, error) {
    this.service(serviceName, `error-${operation}`, { error: error.message });
  }

  logQueueOperation(operation, domain, queueSize, waitTime = null) {
    const details = { queueSize };
    if (waitTime) details.waitTime = waitTime;
    this.queue(operation, domain, details);
  }

  logBufferOperation(operation, details = {}) {
    this.buffer(operation, details);
  }

  logParallelBatch(batchIndex, totalBatches, batchSize, duration, successCount) {
    this.parallel(`BATCH ${batchIndex + 1}/${totalBatches} completed`, {
      batchSize,
      duration,
      successCount,
      efficiency: Math.round((successCount / batchSize) * 100)
    });
  }

  logParallelSummary(totalUrls, totalDuration, speedupRatio) {
    this.parallel('execution completed', {
      totalUrls,
      totalDuration,
      speedupRatio: speedupRatio.toFixed(1),
      efficiency: Math.round((speedupRatio - 1) * 100)
    });
  }

  getLoggingStats() {
    return {
      asyncBufferSize: this.asyncBuffer.length,
      activeSessionsCount: this.sessionContexts.size,
      bufferFlushInterval: this.flushIntervalMs,
      highFrequencyCategories: Array.from(this.highFrequencyCategories),
      timestamp: new Date().toISOString()
    };
  }

  shutdown() {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }
    
    this.flushAsyncBuffer();
    this.sessionContexts.clear();
    this.asyncBuffer.length = 0;
  }
}

const loggingService = new LoggingService();

module.exports = loggingService;