const config = require('../config');
const loggingService = require('./LoggingService');

class MonitoringService {
  constructor() {
    this.metrics = new Map();
    this.alerts = new Map();
    this.eventCounters = new Map();
    this.performanceMetrics = new Map();
    this.systemHealth = {
      lastCheck: null,
      status: 'unknown',
      components: new Map()
    };
    
    this.alertThresholds = {
      errorRate: 0.05,
      responseTime: 30000,
      queueLength: 100,
      memoryUsage: 0.8,
      cacheHitRate: 0.3
    };
    
    this.metricsBuffer = [];
    this.maxBufferSize = 1000;
    this.flushInterval = 60000;
    
    this.setupPeriodicTasks();
    this.initializeEventCounters();
  }

  setupPeriodicTasks() {
    setInterval(() => {
      this.flushMetricsBuffer();
    }, this.flushInterval);
    
    setInterval(() => {
      this.performHealthCheck();
    }, 30000);
    
    setInterval(() => {
      this.calculateDerivedMetrics();
    }, 15000);
  }

  initializeEventCounters() {
    const categories = [
      'cache-hit', 'cache-miss', 'cache-eviction',
      'scraper-success', 'scraper-failure', 'scraper-degraded',
      'queue-granted', 'queue-denied', 'queue-buffered',
      'platform-detected', 'language-detected',
      'fast-track-success', 'fast-track-failure',
      'service-error', 'system-error'
    ];
    
    categories.forEach(category => {
      this.eventCounters.set(category, 0);
    });
  }

  recordEvent(category, details = {}) {
    const timestamp = Date.now();
    const eventKey = `${category}-${timestamp}`;
    
    this.eventCounters.set(category, (this.eventCounters.get(category) || 0) + 1);
    
    const metric = {
      timestamp,
      category,
      details,
      value: 1
    };
    
    this.metricsBuffer.push(metric);
    
    if (this.metricsBuffer.length >= this.maxBufferSize) {
      this.flushMetricsBuffer();
    }
    
    this.checkAlertThresholds(category, details);
    
    loggingService.log('timing', `Event recorded: ${category}`, details, { async: true });
  }

  recordTiming(operation, duration, details = {}) {
    const metric = {
      timestamp: Date.now(),
      category: 'timing',
      operation,
      duration,
      details
    };
    
    this.metricsBuffer.push(metric);
    
    const existingTimings = this.performanceMetrics.get(operation) || [];
    existingTimings.push({ duration, timestamp: Date.now() });
    
    if (existingTimings.length > 100) {
      existingTimings.splice(0, existingTimings.length - 100);
    }
    
    this.performanceMetrics.set(operation, existingTimings);
    
    if (duration > this.alertThresholds.responseTime) {
      this.triggerAlert('slow-operation', {
        operation,
        duration,
        threshold: this.alertThresholds.responseTime
      });
    }
    
    loggingService.timing(operation, duration, details);
  }

  recordCacheOperation(operation, domain, success, ageHours = null) {
    const eventType = success ? 
      (operation === 'get' ? 'cache-hit' : 'cache-operation') : 
      'cache-miss';
    
    this.recordEvent(eventType, {
      operation,
      domain,
      success,
      ageHours
    });
    
    loggingService.cache(operation, domain, { success, ageHours });
  }

  recordScrapingOperation(domain, method, success, duration, jobsFound = 0) {
    const eventType = success ? 'scraper-success' : 'scraper-failure';
    
    this.recordEvent(eventType, {
      domain,
      method,
      duration,
      jobsFound,
      success
    });
    
    this.recordTiming(`scraping-${method}`, duration, {
      domain,
      jobsFound,
      success
    });
  }

  recordQueueOperation(operation, domain, granted, waitTime = null, queueSize = null) {
    const eventType = granted ? 'queue-granted' : 'queue-denied';
    
    this.recordEvent(eventType, {
      domain,
      operation,
      waitTime,
      queueSize
    });
    
    if (queueSize > this.alertThresholds.queueLength) {
      this.triggerAlert('high-queue-length', {
        queueSize,
        threshold: this.alertThresholds.queueLength,
        domain
      });
    }
  }

  recordServiceError(serviceName, operation, error, severity = 'medium') {
    this.recordEvent('service-error', {
      serviceName,
      operation,
      error: error.message,
      severity,
      stack: error.stack
    });
    
    loggingService.error(`${serviceName} error in ${operation}: ${error.message}`, {
      serviceName,
      operation,
      severity
    });
  }

  recordSystemHealth(component, status, details = {}) {
    this.systemHealth.components.set(component, {
      status,
      lastCheck: Date.now(),
      details
    });
    
    this.systemHealth.lastCheck = Date.now();
    
    const allComponents = Array.from(this.systemHealth.components.values());
    const healthyComponents = allComponents.filter(c => c.status === 'healthy').length;
    const totalComponents = allComponents.length;
    
    if (totalComponents > 0) {
      const healthRatio = healthyComponents / totalComponents;
      this.systemHealth.status = healthRatio > 0.8 ? 'healthy' : 
                                  healthRatio > 0.5 ? 'degraded' : 'unhealthy';
    }
    
    if (status !== 'healthy') {
      this.triggerAlert('component-unhealthy', {
        component,
        status,
        details
      });
    }
    
    loggingService.log('service', `Health check: ${component} → ${status}`, details);
  }

  calculateDerivedMetrics() {
    try {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      const recentMetrics = this.metricsBuffer.filter(m => m.timestamp > oneHourAgo);
      
      const errorRate = this.calculateErrorRate(recentMetrics);
      const cacheHitRate = this.calculateCacheHitRate(recentMetrics);
      const averageResponseTime = this.calculateAverageResponseTime();
      
      this.metrics.set('error-rate', { value: errorRate, timestamp: now });
      this.metrics.set('cache-hit-rate', { value: cacheHitRate, timestamp: now });
      this.metrics.set('avg-response-time', { value: averageResponseTime, timestamp: now });
      
      if (errorRate > this.alertThresholds.errorRate) {
        this.triggerAlert('high-error-rate', {
          errorRate,
          threshold: this.alertThresholds.errorRate,
          period: '1h'
        });
      }
      
      if (cacheHitRate < this.alertThresholds.cacheHitRate) {
        this.triggerAlert('low-cache-hit-rate', {
          cacheHitRate,
          threshold: this.alertThresholds.cacheHitRate,
          period: '1h'
        });
      }
      
      loggingService.log('timing', 'Derived metrics calculated', {
        errorRate,
        cacheHitRate,
        averageResponseTime
      }, { async: true });
      
    } catch (error) {
      loggingService.error(`Error calculating derived metrics: ${error.message}`);
    }
  }

  calculateErrorRate(recentMetrics) {
    const errorEvents = recentMetrics.filter(m => 
      m.category.includes('failure') || m.category.includes('error')
    ).length;
    
    const totalEvents = recentMetrics.length;
    return totalEvents > 0 ? errorEvents / totalEvents : 0;
  }

  calculateCacheHitRate(recentMetrics) {
    const cacheHits = recentMetrics.filter(m => m.category === 'cache-hit').length;
    const cacheMisses = recentMetrics.filter(m => m.category === 'cache-miss').length;
    const totalCacheRequests = cacheHits + cacheMisses;
    
    return totalCacheRequests > 0 ? cacheHits / totalCacheRequests : 0;
  }

  calculateAverageResponseTime() {
    const allTimings = Array.from(this.performanceMetrics.values()).flat();
    if (allTimings.length === 0) return 0;
    
    const recentTimings = allTimings.filter(t => 
      Date.now() - t.timestamp < 60 * 60 * 1000
    );
    
    if (recentTimings.length === 0) return 0;
    
    const sum = recentTimings.reduce((acc, t) => acc + t.duration, 0);
    return sum / recentTimings.length;
  }

  triggerAlert(alertType, details) {
    const alertKey = `${alertType}-${Date.now()}`;
    const alert = {
      type: alertType,
      timestamp: Date.now(),
      details,
      severity: this.getAlertSeverity(alertType),
      acknowledged: false
    };
    
    this.alerts.set(alertKey, alert);
    
    loggingService.log('fail', `ALERT: ${alertType}`, details);
    
    if (config.logging.auditEvents) {
      config.smartLog('fail', `ALERT TRIGGERED: ${alertType}`, {
        alert,
        environment: config.meta.environment
      });
    }
  }

  getAlertSeverity(alertType) {
    const severityMap = {
      'high-error-rate': 'critical',
      'component-unhealthy': 'high',
      'slow-operation': 'medium',
      'high-queue-length': 'medium',
      'low-cache-hit-rate': 'low'
    };
    
    return severityMap[alertType] || 'medium';
  }

  checkAlertThresholds(category, details) {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    const recentEvents = this.metricsBuffer
      .filter(m => m.timestamp > fiveMinutesAgo && m.category === category)
      .length;
    
    if (category.includes('error') && recentEvents > 10) {
      this.triggerAlert('error-burst', {
        category,
        eventCount: recentEvents,
        period: '5min'
      });
    }
  }

  performHealthCheck() {
    try {
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
      
      this.recordSystemHealth('memory', 
        memoryUsagePercent < this.alertThresholds.memoryUsage ? 'healthy' : 'unhealthy',
        {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          usagePercent: Math.round(memoryUsagePercent * 100)
        }
      );
      
      const uptime = process.uptime();
      this.recordSystemHealth('process', 'healthy', {
        uptime: Math.round(uptime),
        pid: process.pid
      });
      
      const bufferHealth = this.metricsBuffer.length < this.maxBufferSize * 0.9 ? 'healthy' : 'degraded';
      this.recordSystemHealth('metrics-buffer', bufferHealth, {
        bufferSize: this.metricsBuffer.length,
        maxSize: this.maxBufferSize
      });
      
    } catch (error) {
      this.recordSystemHealth('health-check', 'unhealthy', {
        error: error.message
      });
    }
  }

  flushMetricsBuffer() {
    if (this.metricsBuffer.length === 0) return;
    
    const metricsToFlush = this.metricsBuffer.splice(0, this.maxBufferSize);
    
    if (config.telemetry.metricsEnabled) {
      this.writeMetricsToSink(metricsToFlush);
    }
    
    loggingService.log('timing', `Metrics buffer flushed: ${metricsToFlush.length} metrics`, {
      bufferSize: this.metricsBuffer.length
    }, { async: true });
  }

  writeMetricsToSink(metrics) {
    const sinks = config.telemetry.sinks;
    
    if (sinks.includes('file')) {
      this.writeMetricsToFile(metrics);
    }
    
    if (sinks.includes('console') && config.meta.environment !== 'production') {
      this.writeMetricsToConsole(metrics);
    }
  }

  writeMetricsToFile(metrics) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const metricsFile = path.join(config.paths.logsDir, 'metrics.jsonl');
      const metricsData = metrics.map(m => JSON.stringify(m)).join('\n') + '\n';
      
      fs.appendFileSync(metricsFile, metricsData);
    } catch (error) {
      loggingService.error(`Failed to write metrics to file: ${error.message}`);
    }
  }

  writeMetricsToConsole(metrics) {
    const summary = this.summarizeMetrics(metrics);
    loggingService.log('timing', 'Metrics summary', summary);
  }

  summarizeMetrics(metrics) {
    const categoryCounts = {};
    const totalDuration = metrics
      .filter(m => m.duration)
      .reduce((sum, m) => sum + m.duration, 0);
    
    metrics.forEach(m => {
      categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
    });
    
    return {
      totalMetrics: metrics.length,
      categories: categoryCounts,
      totalDuration: Math.round(totalDuration),
      timespan: {
        start: Math.min(...metrics.map(m => m.timestamp)),
        end: Math.max(...metrics.map(m => m.timestamp))
      }
    };
  }

  getMetricsSummary() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const recentMetrics = this.metricsBuffer.filter(m => m.timestamp > oneHourAgo);
    
    return {
      eventCounters: Object.fromEntries(this.eventCounters),
      derivedMetrics: Object.fromEntries(this.metrics),
      systemHealth: {
        status: this.systemHealth.status,
        lastCheck: this.systemHealth.lastCheck,
        components: Object.fromEntries(this.systemHealth.components)
      },
      alerts: {
        total: this.alerts.size,
        unacknowledged: Array.from(this.alerts.values()).filter(a => !a.acknowledged).length,
        recent: Array.from(this.alerts.values())
          .filter(a => a.timestamp > oneHourAgo)
          .map(a => ({ type: a.type, severity: a.severity, timestamp: a.timestamp }))
      },
      performance: {
        bufferSize: this.metricsBuffer.length,
        recentMetricsCount: recentMetrics.length,
        averageResponseTime: this.calculateAverageResponseTime(),
        errorRate: this.calculateErrorRate(recentMetrics),
        cacheHitRate: this.calculateCacheHitRate(recentMetrics)
      },
      timestamp: now
    };
  }

  getAlertsForDashboard() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    return Array.from(this.alerts.values())
      .filter(a => a.timestamp > oneHourAgo)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }

  acknowledgeAlert(alertKey) {
    if (this.alerts.has(alertKey)) {
      const alert = this.alerts.get(alertKey);
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      
      loggingService.log('service', `Alert acknowledged: ${alert.type}`, {
        alertKey,
        acknowledgedAt: alert.acknowledgedAt
      });
    }
  }

  clearOldAlerts() {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [key, alert] of this.alerts.entries()) {
      if (alert.timestamp < twentyFourHoursAgo) {
        this.alerts.delete(key);
      }
    }
  }

  getTopPerformers() {
    const domainPerformance = new Map();
    
    this.metricsBuffer
      .filter(m => m.category === 'scraper-success' && m.details.domain)
      .forEach(m => {
        const domain = m.details.domain;
        const existing = domainPerformance.get(domain) || { 
          totalJobs: 0, 
          totalDuration: 0, 
          scrapingCount: 0 
        };
        
        existing.totalJobs += m.details.jobsFound || 0;
        existing.totalDuration += m.details.duration || 0;
        existing.scrapingCount += 1;
        
        domainPerformance.set(domain, existing);
      });
    
    return Array.from(domainPerformance.entries())
      .map(([domain, stats]) => ({
        domain,
        averageJobs: Math.round(stats.totalJobs / stats.scrapingCount),
        averageDuration: Math.round(stats.totalDuration / stats.scrapingCount),
        totalScrapes: stats.scrapingCount,
        efficiency: Math.round((stats.totalJobs / stats.scrapingCount) / (stats.totalDuration / stats.scrapingCount) * 1000)
      }))
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 10);
  }

  shutdown() {
    this.flushMetricsBuffer();
    this.clearOldAlerts();
    
    loggingService.log('service', 'MonitoringService shutdown completed', {
      metricsProcessed: this.eventCounters.size,
      alertsGenerated: this.alerts.size
    });
  }
}

const monitoringService = new MonitoringService();

module.exports = monitoringService;