const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

class ErrorLogger {
  constructor() {
    this.errorBuffer = [];
    this.maxBufferSize = 1000;
    this.errorTypes = {
      NO_RESULT: 'NoResult',
      TIMEOUT: 'Timeout', 
      PLATFORM_ERROR: 'PlatformError',
      NETWORK_ERROR: 'NetworkError',
      PARSING_ERROR: 'ParsingError',
      EMPTY_DOMAIN: 'EmptyDomain',
      AUTHENTICATION_ERROR: 'AuthenticationError',
      RATE_LIMIT: 'RateLimit',
      UNKNOWN: 'Unknown'
    };
    this.errorDir = path.join(__dirname, '../debug/errors');
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.errorDir, { recursive: true });
      await this.loadRecentErrors();
    } catch (error) {
      config.smartLog('fail','Failed to initialize ErrorLogger:', error.message);
    }
  }

  async loadRecentErrors() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const errorFile = path.join(this.errorDir, `errors-${today}.json`);
      const content = await fs.readFile(errorFile, 'utf8');
      const data = JSON.parse(content);
      this.errorBuffer = data.errors || [];
    } catch (error) {
      this.errorBuffer = [];
    }
  }

  logError(errorData) {
    const enrichedError = this.enrichErrorData(errorData);
    this.errorBuffer.unshift(enrichedError);
    
    if (this.errorBuffer.length > this.maxBufferSize) {
      this.errorBuffer = this.errorBuffer.slice(0, this.maxBufferSize);
    }
    
    this.persistError(enrichedError);
    this.updateErrorStats(enrichedError);
    
    if (this.shouldAlert(enrichedError)) {
      this.triggerAlert(enrichedError);
    }
  }

  enrichErrorData(errorData) {
    const timestamp = new Date().toISOString();
    const domain = this.extractDomain(errorData.url);
    const errorType = this.classifyError(errorData);
    
    return {
      id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      domain,
      url: errorData.url,
      step: errorData.step,
      errorType,
      message: errorData.message,
      executionTime: errorData.executionTime || 0,
      userId: errorData.userId,
      userEmail: errorData.userEmail,
      sessionId: errorData.sessionId,
      stackTrace: errorData.stackTrace,
      context: {
        platform: errorData.platform,
        language: errorData.language,
        jobTitle: errorData.jobTitle,
        cacheStatus: errorData.cacheStatus,
        retryCount: errorData.retryCount || 0
      },
      severity: this.determineSeverity(errorData),
      tags: this.generateTags(errorData)
    };
  }

  extractDomain(url) {
    if (!url) return 'unknown';
    try {
      return new URL(url).hostname;
    } catch (error) {
      return 'invalid-url';
    }
  }

  classifyError(errorData) {
    const message = (errorData.message || '').toLowerCase();
    const step = (errorData.step || '').toLowerCase();
    
    if (message.includes('no result') || message.includes('no data') || message.includes('empty')) {
      return this.errorTypes.NO_RESULT;
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return this.errorTypes.TIMEOUT;
    }
    if (message.includes('network') || message.includes('connection')) {
      return this.errorTypes.NETWORK_ERROR;
    }
    if (message.includes('parsing') || message.includes('parse error')) {
      return this.errorTypes.PARSING_ERROR;
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return this.errorTypes.RATE_LIMIT;
    }
    if (message.includes('authentication') || message.includes('unauthorized')) {
      return this.errorTypes.AUTHENTICATION_ERROR;
    }
    if (step.includes('platform') || message.includes('platform')) {
      return this.errorTypes.PLATFORM_ERROR;
    }
    
    return this.errorTypes.UNKNOWN;
  }

  determineSeverity(errorData) {
    const errorType = this.classifyError(errorData);
    const executionTime = errorData.executionTime || 0;
    
    if (errorType === this.errorTypes.NO_RESULT && executionTime < 1000) {
      return 'low';
    }
    if (errorType === this.errorTypes.EMPTY_DOMAIN) {
      return 'info';
    }
    if (errorType === this.errorTypes.TIMEOUT || executionTime > 30000) {
      return 'high';
    }
    if (errorType === this.errorTypes.NETWORK_ERROR || errorType === this.errorTypes.RATE_LIMIT) {
      return 'high';
    }
    
    return 'medium';
  }

  shouldIgnoreError(message) {
    const ignoredPatterns = [
      /ErrorLogger/i,
      /Failed to update error stats/i,
      /ERROR ALERT/i,
      /Stats update failed silently/i
    ];

    return ignoredPatterns.some(pattern => pattern.test(message));
  }

  generateTags(errorData) {
    const tags = [];
    const domain = this.extractDomain(errorData.url);
    const step = errorData.step;
    
    if (domain && domain !== 'unknown') {
      tags.push(`domain:${domain}`);
    }
    if (step) {
      tags.push(`step:${step}`);
    }
    if (errorData.platform) {
      tags.push(`platform:${errorData.platform}`);
    }
    if (errorData.language && errorData.language !== 'en') {
      tags.push(`language:${errorData.language}`);
    }
    if (errorData.retryCount > 0) {
      tags.push(`retry:${errorData.retryCount}`);
    }
    
    return tags;
  }

  async persistError(errorData) {
    try {
      const date = errorData.timestamp.split('T')[0];
      const errorFile = path.join(this.errorDir, `errors-${date}.json`);
      
      let dailyErrors = [];
      try {
        const content = await fs.readFile(errorFile, 'utf8');
        const data = JSON.parse(content);
        dailyErrors = data.errors || [];
      } catch (error) {
        dailyErrors = [];
      }
      
      dailyErrors.unshift(errorData);
      
      if (dailyErrors.length > 5000) {
        dailyErrors = dailyErrors.slice(0, 5000);
      }
      
      const fileData = {
        date,
        totalErrors: dailyErrors.length,
        lastUpdated: new Date().toISOString(),
        errors: dailyErrors
      };
      
      await fs.writeFile(errorFile, JSON.stringify(fileData, null, 2));
    } catch (error) {
      config.smartLog('fail','Failed to persist error:', error.message);
    }
  }

  async updateErrorStats(errorData) {
    try {
      const statsFile = path.join(this.errorDir, 'error-stats.json');
      
      let stats = {};
      try {
        const content = await fs.readFile(statsFile, 'utf8');
        stats = JSON.parse(content);
      } catch (error) {
        stats = {
          byDomain: {},
          byStep: {},
          byType: {},
          bySeverity: {},
          daily: {},
          lastUpdated: null
        };
      }
      
      const domain = errorData.domain;
      const step = errorData.step;
      const errorType = errorData.errorType;
      const severity = errorData.severity;
      const date = errorData.timestamp.split('T')[0];
      
      if (!stats.byDomain[domain]) {
        stats.byDomain[domain] = { count: 0, lastError: null, types: {} };
      }
      stats.byDomain[domain].count++;
      stats.byDomain[domain].lastError = errorData.timestamp;
      stats.byDomain[domain].types[errorType] = (stats.byDomain[domain].types[errorType] || 0) + 1;
      
      if (!stats.byStep[step]) {
        stats.byStep[step] = { count: 0, domains: new Set(), types: {} };
      }
      stats.byStep[step].count++;
      
      if (!(stats.byStep[step].domains instanceof Set)) {
        stats.byStep[step].domains = new Set(Array.isArray(stats.byStep[step].domains) ? stats.byStep[step].domains : []);
      }
      stats.byStep[step].domains.add(domain);
      stats.byStep[step].types[errorType] = (stats.byStep[step].types[errorType] || 0) + 1;
      
      stats.byType[errorType] = (stats.byType[errorType] || 0) + 1;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
      
      if (!stats.daily[date]) {
        stats.daily[date] = { count: 0, types: {}, domains: new Set() };
      }
      stats.daily[date].count++;
      stats.daily[date].types[errorType] = (stats.daily[date].types[errorType] || 0) + 1;
      
      if (!(stats.daily[date].domains instanceof Set)) {
        stats.daily[date].domains = new Set(Array.isArray(stats.daily[date].domains) ? stats.daily[date].domains : []);
      }
      stats.daily[date].domains.add(domain);
      
      stats.lastUpdated = new Date().toISOString();
      
      const serializedStats = {
        ...stats,
        byStep: Object.fromEntries(
          Object.entries(stats.byStep).map(([key, value]) => [
            key,
            { ...value, domains: Array.from(value.domains) }
          ])
        ),
        daily: Object.fromEntries(
          Object.entries(stats.daily).map(([key, value]) => [
            key,
            { ...value, domains: Array.from(value.domains) }
          ])
        )
      };
      
      await fs.writeFile(statsFile, JSON.stringify(serializedStats, null, 2));
    } catch (error) {
      config.smartLog('buffer',`⚠️ [ErrorLogger] Stats update failed silently: ${error.message}`);
    }
  }

  shouldAlert(errorData) {
    if (errorData.severity === 'high') return true;
    if (errorData.errorType === this.errorTypes.RATE_LIMIT) return true;
    
    const domain = errorData.domain;
    const recentErrors = this.errorBuffer.filter(e => 
      e.domain === domain && 
      new Date(e.timestamp) > new Date(Date.now() - 5 * 60 * 1000)
    );
    
    return recentErrors.length >= 5;
  }

  triggerAlert(errorData) {
    config.smartLog('buffer',`🚨 ERROR ALERT - ${errorData.severity.toUpperCase()} SEVERITY`);
    config.smartLog('buffer',`Domain: ${errorData.domain}`);
    config.smartLog('buffer',`Type: ${errorData.errorType}`);
    config.smartLog('buffer',`Message: ${errorData.message}`);
    config.smartLog('buffer',`Step: ${errorData.step}`);
    config.smartLog('buffer',`Time: ${errorData.timestamp}`);
    
    if (errorData.userId) {
      config.smartLog('buffer',`User: ${errorData.userId} (${errorData.userEmail || 'No email'})`);
    }
  }

  async getErrorSummary(filters = {}) {
    const {
      startDate = null,
      endDate = null,
      domain = null,
      step = null,
      errorType = null,
      severity = null,
      limit = 100
    } = filters;
    
    let errors = [...this.errorBuffer];
    
    if (startDate || endDate) {
      errors = await this.loadErrorsFromDateRange(startDate, endDate);
    }
    
    if (domain) {
      errors = errors.filter(e => e.domain.includes(domain));
    }
    if (step) {
      errors = errors.filter(e => e.step && e.step.includes(step));
    }
    if (errorType) {
      errors = errors.filter(e => e.errorType === errorType);
    }
    if (severity) {
      errors = errors.filter(e => e.severity === severity);
    }
    
    errors = errors.slice(0, limit);
    
    const summary = {
      totalErrors: errors.length,
      errors,
      aggregations: {
        byDomain: this.aggregateBy(errors, 'domain'),
        byStep: this.aggregateBy(errors, 'step'),
        byType: this.aggregateBy(errors, 'errorType'),
        bySeverity: this.aggregateBy(errors, 'severity'),
        byHour: this.aggregateByHour(errors)
      },
      filters,
      generatedAt: new Date().toISOString()
    };
    
    return summary;
  }

  async loadErrorsFromDateRange(startDate, endDate) {
    const errors = [];
    const start = new Date(startDate || Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date(endDate || Date.now());
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      try {
        const errorFile = path.join(this.errorDir, `errors-${dateStr}.json`);
        const content = await fs.readFile(errorFile, 'utf8');
        const data = JSON.parse(content);
        errors.push(...(data.errors || []));
      } catch (error) {
        continue;
      }
    }
    
    return errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  aggregateBy(errors, field) {
    const aggregated = {};
    errors.forEach(error => {
      const value = error[field] || 'unknown';
      if (!aggregated[value]) {
        aggregated[value] = { count: 0, lastSeen: null };
      }
      aggregated[value].count++;
      if (!aggregated[value].lastSeen || new Date(error.timestamp) > new Date(aggregated[value].lastSeen)) {
        aggregated[value].lastSeen = error.timestamp;
      }
    });
    
    return Object.entries(aggregated)
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.count - a.count);
  }

  aggregateByHour(errors) {
    const hourly = {};
    errors.forEach(error => {
      const hour = new Date(error.timestamp).toISOString().substr(0, 13);
      hourly[hour] = (hourly[hour] || 0) + 1;
    });
    
    return Object.entries(hourly)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }

  async detectEmptyDomains() {
    try {
      const statsFile = path.join(this.errorDir, 'error-stats.json');
      const content = await fs.readFile(statsFile, 'utf8');
      const stats = JSON.parse(content);
      
      const emptyDomains = [];
      
      Object.entries(stats.byDomain).forEach(([domain, domainStats]) => {
        const noResultCount = domainStats.types[this.errorTypes.NO_RESULT] || 0;
        const totalErrors = domainStats.count;
        
        if (noResultCount >= 3 && (noResultCount / totalErrors) >= 0.8) {
          emptyDomains.push({
            domain,
            noResultCount,
            totalErrors,
            ratio: noResultCount / totalErrors,
            lastError: domainStats.lastError,
            status: 'likely_empty'
          });
        }
      });
      
      return emptyDomains.sort((a, b) => b.noResultCount - a.noResultCount);
    } catch (error) {
      config.smartLog('fail','Failed to detect empty domains:', error.message);
      return [];
    }
  }

  async generateErrorReport(filters = {}) {
    const summary = await this.getErrorSummary(filters);
    const emptyDomains = await this.detectEmptyDomains();
    
    return {
      ...summary,
      emptyDomains,
      insights: {
        mostProblematicDomains: summary.aggregations.byDomain.slice(0, 10),
        mostFailedSteps: summary.aggregations.byStep.slice(0, 10),
        errorDistribution: summary.aggregations.byType,
        severityDistribution: summary.aggregations.bySeverity,
        hourlyTrends: summary.aggregations.byHour.slice(-24)
      }
    };
  }

  getCurrentStats() {
    const recentErrors = this.errorBuffer.filter(e => 
      new Date(e.timestamp) > new Date(Date.now() - 60 * 60 * 1000)
    );
    
    return {
      totalBuffered: this.errorBuffer.length,
      recentHour: recentErrors.length,
      byType: this.aggregateBy(recentErrors, 'errorType'),
      bySeverity: this.aggregateBy(recentErrors, 'severity'),
      topDomains: this.aggregateBy(recentErrors, 'domain').slice(0, 5)
    };
  }
}

module.exports = new ErrorLogger();