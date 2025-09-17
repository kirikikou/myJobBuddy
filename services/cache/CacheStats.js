const config = require('../../config');
class CacheStats {
  constructor() {
    this.metrics = {
      hits: { L1: 0, L2: 0, total: 0 },
      misses: { total: 0 },
      sets: { L1: 0, L2: 0, total: 0 },
      deletes: { total: 0 },
      evictions: { L1: 0, L2: 0, total: 0 },
      errors: { get: 0, set: 0, delete: 0, eviction: 0, total: 0 },
      responseTimes: { get: [], set: [], delete: [] },
      throughput: { requests: 0, startTime: Date.now() },
      memory: { l1SizeBytes: 0, l2SizeBytes: 0 },
      namespaces: new Map()
    };
    
    this.alerts = [];
    this.maxAlerts = 100;
    this.alertThresholds = {
      hitRatio: 80,
      avgResponseTime: 100,
      errorRate: 5,
      memoryUsage: 90
    };
    
    this.samplingRate = 0.1;
    this.maxSamples = 1000;
    
    this.startTime = Date.now();
    this.lastReset = Date.now();
    
    this.setupPeriodicReporting();
  }

  init() {
    config.smartLog('cache', 'Cache stats monitoring initialized');
  }

  recordHit(level, key, responseTime) {
    this.metrics.hits[level]++;
    this.metrics.hits.total++;
    this.metrics.throughput.requests++;
    
    if (this.shouldSample()) {
      this.addResponseTime('get', responseTime);
    }
    
    this.updateNamespaceStats(key, 'hit');
    this.checkAlertConditions();
  }

  recordMiss(key, responseTime) {
    this.metrics.misses.total++;
    this.metrics.throughput.requests++;
    
    if (this.shouldSample()) {
      this.addResponseTime('get', responseTime);
    }
    
    this.updateNamespaceStats(key, 'miss');
    this.checkAlertConditions();
  }

  recordSet(key, size, responseTime) {
    this.metrics.sets.total++;
    this.metrics.throughput.requests++;
    
    if (this.shouldSample()) {
      this.addResponseTime('set', responseTime);
    }
    
    this.updateNamespaceStats(key, 'set', size);
  }

  recordDelete(key) {
    this.metrics.deletes.total++;
    this.updateNamespaceStats(key, 'delete');
  }

  recordEviction(policy, count) {
    this.metrics.evictions.total += count;
    
    this.addAlert('eviction', `${policy} eviction removed ${count} entries`, 'info');
    
    config.smartLog('cache', `Eviction recorded: ${policy} policy removed ${count} entries`);
  }

  recordClear(namespace, pattern) {
    const clearKey = `${namespace}:${pattern || 'all'}`;
    this.updateNamespaceStats(clearKey, 'clear');
    
    config.smartLog('cache', `Clear recorded: namespace=${namespace}, pattern=${pattern || 'all'}`);
  }

  recordError(operation, key, error) {
    this.metrics.errors[operation]++;
    this.metrics.errors.total++;
    
    this.addAlert('error', `${operation} error for ${key}: ${error.message}`, 'error');
    
    this.checkAlertConditions();
  }

  addResponseTime(operation, time) {
    const responseArray = this.metrics.responseTimes[operation];
    
    responseArray.push(time);
    
    if (responseArray.length > this.maxSamples) {
      responseArray.splice(0, responseArray.length - this.maxSamples);
    }
  }

  updateNamespaceStats(key, operation, size = 0) {
    const namespace = this.extractNamespace(key);
    
    if (!this.metrics.namespaces.has(namespace)) {
      this.metrics.namespaces.set(namespace, {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        clears: 0,
        totalSize: 0,
        avgSize: 0,
        lastActivity: Date.now()
      });
    }
    
    const namespaceStats = this.metrics.namespaces.get(namespace);
    namespaceStats[operation]++;
    namespaceStats.lastActivity = Date.now();
    
    if (operation === 'set' && size > 0) {
      namespaceStats.totalSize += size;
      const totalSets = namespaceStats.sets;
      namespaceStats.avgSize = Math.round(namespaceStats.totalSize / totalSets);
    }
    
    this.metrics.namespaces.set(namespace, namespaceStats);
  }

  extractNamespace(key) {
    const colonIndex = key.indexOf(':');
    return colonIndex > 0 ? key.substring(0, colonIndex) : 'default';
  }

  shouldSample() {
    return Math.random() < this.samplingRate;
  }

  addAlert(type, message, severity = 'warning') {
    const alert = {
      timestamp: Date.now(),
      type,
      message,
      severity,
      id: this.generateAlertId()
    };
    
    this.alerts.unshift(alert);
    
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }
    
    if (severity === 'error') {
      config.smartLog('fail', `Cache Alert: ${message}`);
    } else if (severity === 'warning') {
      config.smartLog('cache', `Cache Alert: ${message}`);
    }
  }

  checkAlertConditions() {
    const metrics = this.getMetrics();
    
    if (metrics.hitRatio < this.alertThresholds.hitRatio) {
      this.addAlert('performance', 
        `Hit ratio dropped to ${metrics.hitRatio}% (threshold: ${this.alertThresholds.hitRatio}%)`, 
        'warning'
      );
    }
    
    if (metrics.avgResponseTime > this.alertThresholds.avgResponseTime) {
      this.addAlert('performance', 
        `Average response time increased to ${metrics.avgResponseTime}ms (threshold: ${this.alertThresholds.avgResponseTime}ms)`, 
        'warning'
      );
    }
    
    if (metrics.errorRate > this.alertThresholds.errorRate) {
      this.addAlert('reliability', 
        `Error rate increased to ${metrics.errorRate}% (threshold: ${this.alertThresholds.errorRate}%)`, 
        'error'
      );
    }
  }

  getMetrics() {
    const totalRequests = this.metrics.hits.total + this.metrics.misses.total;
    const hitRatio = totalRequests > 0 ? Math.round((this.metrics.hits.total / totalRequests) * 100) : 0;
    
    const l1HitRatio = this.metrics.hits.total > 0 ? 
      Math.round((this.metrics.hits.L1 / this.metrics.hits.total) * 100) : 0;
    const l2HitRatio = this.metrics.hits.total > 0 ? 
      Math.round((this.metrics.hits.L2 / this.metrics.hits.total) * 100) : 0;
    
    const avgResponseTime = this.calculateAverageResponseTime();
    const errorRate = totalRequests > 0 ? 
      Math.round((this.metrics.errors.total / totalRequests) * 100) : 0;
    
    const throughputPerSecond = this.calculateThroughput();
    
    return {
      performance: {
        hitRatio,
        l1HitRatio,
        l2HitRatio,
        avgResponseTime,
        throughputPerSecond,
        errorRate
      },
      counters: {
        totalRequests,
        hits: this.metrics.hits,
        misses: this.metrics.misses.total,
        sets: this.metrics.sets.total,
        deletes: this.metrics.deletes.total,
        evictions: this.metrics.evictions.total,
        errors: this.metrics.errors.total
      },
      responseTimes: {
        get: this.calculateResponseTimeStats('get'),
        set: this.calculateResponseTimeStats('set'),
        delete: this.calculateResponseTimeStats('delete')
      },
      namespaces: this.getNamespaceMetrics(),
      alerts: {
        total: this.alerts.length,
        recent: this.alerts.slice(0, 10),
        byType: this.groupAlertsByType(),
        bySeverity: this.groupAlertsBySeverity()
      },
      uptime: Date.now() - this.startTime,
      lastReset: this.lastReset
    };
  }

  calculateAverageResponseTime() {
    const allTimes = [
      ...this.metrics.responseTimes.get,
      ...this.metrics.responseTimes.set,
      ...this.metrics.responseTimes.delete
    ];
    
    if (allTimes.length === 0) return 0;
    
    const sum = allTimes.reduce((acc, time) => acc + time, 0);
    return Math.round(sum / allTimes.length);
  }

  calculateResponseTimeStats(operation) {
    const times = this.metrics.responseTimes[operation];
    if (times.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0, samples: 0 };
    }
    
    const sorted = [...times].sort((a, b) => a - b);
    const avg = Math.round(times.reduce((acc, t) => acc + t, 0) / times.length);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index] || max;
    
    return { avg, min, max, p95, samples: times.length };
  }

  calculateThroughput() {
    const elapsedSeconds = (Date.now() - this.metrics.throughput.startTime) / 1000;
    return elapsedSeconds > 0 ? 
      Math.round(this.metrics.throughput.requests / elapsedSeconds) : 0;
  }

  getNamespaceMetrics() {
    const namespaceMetrics = {};
    
    for (const [namespace, stats] of this.metrics.namespaces.entries()) {
      const totalOperations = stats.hits + stats.misses + stats.sets + stats.deletes;
      const hitRatio = (stats.hits + stats.misses) > 0 ? 
        Math.round((stats.hits / (stats.hits + stats.misses)) * 100) : 0;
      
      namespaceMetrics[namespace] = {
        ...stats,
        totalOperations,
        hitRatio,
        avgSizeKB: Math.round(stats.avgSize / 1024)
      };
    }
    
    return namespaceMetrics;
  }

  groupAlertsByType() {
    const grouped = {};
    
    this.alerts.forEach(alert => {
      if (!grouped[alert.type]) {
        grouped[alert.type] = 0;
      }
      grouped[alert.type]++;
    });
    
    return grouped;
  }

  groupAlertsBySeverity() {
    const grouped = { error: 0, warning: 0, info: 0 };
    
    this.alerts.forEach(alert => {
      if (grouped.hasOwnProperty(alert.severity)) {
        grouped[alert.severity]++;
      }
    });
    
    return grouped;
  }

  generateAlertId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  getEvictionStats() {
    return {
      total: this.metrics.evictions.total,
      l1: this.metrics.evictions.L1,
      l2: this.metrics.evictions.L2,
      rate: this.calculateEvictionRate()
    };
  }

  calculateEvictionRate() {
    const totalSets = this.metrics.sets.total;
    return totalSets > 0 ? 
      Math.round((this.metrics.evictions.total / totalSets) * 100) : 0;
  }

  reset() {
    const oldMetrics = { ...this.metrics };
    
    this.metrics = {
      hits: { L1: 0, L2: 0, total: 0 },
      misses: { total: 0 },
      sets: { L1: 0, L2: 0, total: 0 },
      deletes: { total: 0 },
      evictions: { L1: 0, L2: 0, total: 0 },
      errors: { get: 0, set: 0, delete: 0, eviction: 0, total: 0 },
      responseTimes: { get: [], set: [], delete: [] },
      throughput: { requests: 0, startTime: Date.now() },
      memory: { l1SizeBytes: 0, l2SizeBytes: 0 },
      namespaces: new Map()
    };
    
    this.lastReset = Date.now();
    
    config.smartLog('cache', 'Cache stats reset');
    return oldMetrics;
  }

  setupPeriodicReporting() {
    setInterval(() => {
      this.generatePeriodicReport();
    }, 300000);
  }

  generatePeriodicReport() {
    const metrics = this.getMetrics();
    
    config.smartLog('cache', 
      `Cache Report - Hit Ratio: ${metrics.performance.hitRatio}%, ` +
      `Avg Response: ${metrics.performance.avgResponseTime}ms, ` +
      `Throughput: ${metrics.performance.throughputPerSecond}/s, ` +
      `Errors: ${metrics.counters.errors}`
    );
    
    if (metrics.performance.hitRatio < 70) {
      config.smartLog('cache', 
        `Performance concern: Hit ratio (${metrics.performance.hitRatio}%) below optimal threshold`
      );
    }
  }

  exportMetrics(format = 'json') {
    const metrics = this.getMetrics();
    
    switch (format) {
      case 'json':
        return JSON.stringify(metrics, null, 2);
        
      case 'prometheus':
        return this.formatPrometheusMetrics(metrics);
        
      case 'csv':
        return this.formatCSVMetrics(metrics);
        
      default:
        return metrics;
    }
  }

  formatPrometheusMetrics(metrics) {
    const lines = [];
    
    lines.push(`cache_hit_ratio ${metrics.performance.hitRatio}`);
    lines.push(`cache_hits_total ${metrics.counters.hits.total}`);
    lines.push(`cache_misses_total ${metrics.counters.misses}`);
    lines.push(`cache_sets_total ${metrics.counters.sets}`);
    lines.push(`cache_evictions_total ${metrics.counters.evictions}`);
    lines.push(`cache_errors_total ${metrics.counters.errors}`);
    lines.push(`cache_response_time_avg_ms ${metrics.performance.avgResponseTime}`);
    lines.push(`cache_throughput_per_second ${metrics.performance.throughputPerSecond}`);
    
    return lines.join('\n');
  }

  formatCSVMetrics(metrics) {
    const headers = [
      'timestamp', 'hit_ratio', 'hits_total', 'misses_total', 
      'avg_response_time', 'throughput', 'errors_total'
    ];
    
    const row = [
      Date.now(),
      metrics.performance.hitRatio,
      metrics.counters.hits.total,
      metrics.counters.misses,
      metrics.performance.avgResponseTime,
      metrics.performance.throughputPerSecond,
      metrics.counters.errors
    ];
    
    return headers.join(',') + '\n' + row.join(',');
  }

  updateMemoryStats(l1SizeBytes, l2SizeBytes) {
    this.metrics.memory.l1SizeBytes = l1SizeBytes;
    this.metrics.memory.l2SizeBytes = l2SizeBytes;
  }

  getAlerts(severity = null, limit = 50) {
    let filtered = this.alerts;
    
    if (severity) {
      filtered = this.alerts.filter(alert => alert.severity === severity);
    }
    
    return filtered.slice(0, limit);
  }

  clearAlerts(severity = null) {
    if (severity) {
      this.alerts = this.alerts.filter(alert => alert.severity !== severity);
    } else {
      this.alerts = [];
    }
    
    config.smartLog('cache', `Alerts cleared: ${severity || 'all'}`);
  }
}

module.exports = CacheStats;