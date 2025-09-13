class PerformanceMonitor {
    constructor(config) {
      this.config = config;
      this.metrics = new Map();
      this.alerts = new Map();
      this.benchmarks = new Map();
      this.sessionMetrics = new Map();
      this.optimizationImpact = new Map();
      this.startTime = Date.now();
      
      this.initializeMetrics();
      this.startPerformanceTracking();
    }
  
    initializeMetrics() {
      this.metrics.set('search_cache', {
        totalRequests: 0,
        totalResponseTime: 0,
        avgResponseTime: 0,
        cacheHitRate: 0,
        indexHitRate: 0,
        streamingUsageRate: 0,
        memoryUsageMB: 0,
        errorRate: 0,
        optimizationGains: []
      });
  
      this.metrics.set('job_matching', {
        totalMatches: 0,
        totalMatchTime: 0,
        avgMatchTime: 0,
        scoreCacheHitRate: 0,
        variantCacheHitRate: 0,
        fuzzyMatchPerformance: 0,
        optimizationGains: []
      });
  
      this.metrics.set('response_formatting', {
        totalResponses: 0,
        totalFormatTime: 0,
        avgFormatTime: 0,
        paginationUsageRate: 0,
        compressionRate: 0,
        lazyLoadingRate: 0,
        optimizationGains: []
      });
  
      this.metrics.set('system_overall', {
        cpuUsagePercent: 0,
        memoryUsageMB: 0,
        throughputPerMinute: 0,
        errorCount: 0,
        uptime: 0,
        performanceScore: 0
      });
    }
  
    startPerformanceTracking() {
      if (!this.config.performance?.enableMetrics) return;
  
      const interval = this.config.performance.metricsInterval || 30000;
      
      setInterval(() => {
        this.collectSystemMetrics();
        this.calculateOptimizationImpact();
        this.checkAlertThresholds();
        this.logPerformanceSummary();
      }, interval);
  
      this.config.smartLog('performance', `Performance monitoring started (${interval}ms interval)`);
    }
  
    trackSearchCacheOperation(operationType, startTime, endTime, metadata = {}) {
      const responseTime = endTime - startTime;
      const metrics = this.metrics.get('search_cache');
      
      metrics.totalRequests++;
      metrics.totalResponseTime += responseTime;
      metrics.avgResponseTime = metrics.totalResponseTime / metrics.totalRequests;
      
      if (metadata.cacheHit) {
        metrics.cacheHitRate = (metrics.cacheHitRate * (metrics.totalRequests - 1) + 1) / metrics.totalRequests;
      } else {
        metrics.cacheHitRate = (metrics.cacheHitRate * (metrics.totalRequests - 1)) / metrics.totalRequests;
      }
      
      if (metadata.indexUsed) {
        metrics.indexHitRate = (metrics.indexHitRate * (metrics.totalRequests - 1) + 1) / metrics.totalRequests;
      }
      
      if (metadata.streamingUsed) {
        metrics.streamingUsageRate = (metrics.streamingUsageRate * (metrics.totalRequests - 1) + 1) / metrics.totalRequests;
      }
      
      if (metadata.memoryUsage) {
        metrics.memoryUsageMB = metadata.memoryUsage;
      }
      
      if (metadata.error) {
        metrics.errorRate = (metrics.errorRate * (metrics.totalRequests - 1) + 1) / metrics.totalRequests;
      }
  
      this.recordOptimizationGain('search_cache', operationType, responseTime, metadata);
      
      this.config.smartLog('performance', 
        `SearchCache ${operationType}: ${responseTime}ms (cache:${metadata.cacheHit ? 'hit' : 'miss'}, index:${metadata.indexUsed ? 'yes' : 'no'})`
      );
    }
  
    trackJobMatchingOperation(operationType, startTime, endTime, metadata = {}) {
      const matchTime = endTime - startTime;
      const metrics = this.metrics.get('job_matching');
      
      metrics.totalMatches++;
      metrics.totalMatchTime += matchTime;
      metrics.avgMatchTime = metrics.totalMatchTime / metrics.totalMatches;
      
      if (metadata.scoreCacheHit) {
        metrics.scoreCacheHitRate = (metrics.scoreCacheHitRate * (metrics.totalMatches - 1) + 1) / metrics.totalMatches;
      }
      
      if (metadata.variantCacheHit) {
        metrics.variantCacheHitRate = (metrics.variantCacheHitRate * (metrics.totalMatches - 1) + 1) / metrics.totalMatches;
      }
      
      if (metadata.fuzzyMatchTime) {
        const avgFuzzy = metrics.fuzzyMatchPerformance || 0;
        metrics.fuzzyMatchPerformance = (avgFuzzy + metadata.fuzzyMatchTime) / 2;
      }
  
      this.recordOptimizationGain('job_matching', operationType, matchTime, metadata);
      
      this.config.smartLog('performance', 
        `JobMatching ${operationType}: ${matchTime}ms (score_cache:${metadata.scoreCacheHit ? 'hit' : 'miss'})`
      );
    }
  
    trackResponseFormattingOperation(operationType, startTime, endTime, metadata = {}) {
      const formatTime = endTime - startTime;
      const metrics = this.metrics.get('response_formatting');
      
      metrics.totalResponses++;
      metrics.totalFormatTime += formatTime;
      metrics.avgFormatTime = metrics.totalFormatTime / metrics.totalResponses;
      
      if (metadata.paginationUsed) {
        metrics.paginationUsageRate = (metrics.paginationUsageRate * (metrics.totalResponses - 1) + 1) / metrics.totalResponses;
      }
      
      if (metadata.compressionUsed) {
        metrics.compressionRate = (metrics.compressionRate * (metrics.totalResponses - 1) + 1) / metrics.totalResponses;
      }
      
      if (metadata.lazyLoadingUsed) {
        metrics.lazyLoadingRate = (metrics.lazyLoadingRate * (metrics.lazyLoadingRate - 1) + 1) / metrics.totalResponses;
      }
  
      this.recordOptimizationGain('response_formatting', operationType, formatTime, metadata);
      
      this.config.smartLog('performance', 
        `ResponseFormatting ${operationType}: ${formatTime}ms (pagination:${metadata.paginationUsed ? 'yes' : 'no'})`
      );
    }
  
    recordOptimizationGain(service, operation, actualTime, metadata) {
      const estimatedOldTime = this.estimateOldAlgorithmTime(service, operation, metadata);
      
      if (estimatedOldTime > 0) {
        const gain = ((estimatedOldTime - actualTime) / estimatedOldTime) * 100;
        const metrics = this.metrics.get(service);
        
        metrics.optimizationGains.push({
          operation,
          actualTime,
          estimatedOldTime,
          gainPercent: Math.round(gain),
          timestamp: Date.now()
        });
        
        if (metrics.optimizationGains.length > 100) {
          metrics.optimizationGains.shift();
        }
        
        if (gain > 20) {
          this.config.smartLog('performance', 
            `Optimization gain detected: ${service}.${operation} improved by ${Math.round(gain)}% (${estimatedOldTime}ms → ${actualTime}ms)`
          );
        }
      }
    }
  
    estimateOldAlgorithmTime(service, operation, metadata) {
      switch (service) {
        case 'search_cache':
          if (metadata.filesProcessed && metadata.avgLinksPerFile) {
            return metadata.filesProcessed * metadata.avgLinksPerFile * 0.5;
          }
          return metadata.filesProcessed ? metadata.filesProcessed * 10 : 100;
        
        case 'job_matching':
          if (metadata.jobTitles && metadata.links) {
            return metadata.jobTitles * metadata.links * 2;
          }
          return metadata.complexity ? metadata.complexity * 50 : 50;
        
        case 'response_formatting':
          if (metadata.resultCount) {
            return Math.max(metadata.resultCount * 0.1, 10);
          }
          return 20;
        
        default:
          return 0;
      }
    }
  
    collectSystemMetrics() {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      const systemMetrics = this.metrics.get('system_overall');
      systemMetrics.memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      systemMetrics.uptime = Date.now() - this.startTime;
      
      const totalRequests = this.getTotalRequests();
      const uptimeMinutes = systemMetrics.uptime / (1000 * 60);
      systemMetrics.throughputPerMinute = Math.round(totalRequests / Math.max(uptimeMinutes, 1));
      
      systemMetrics.performanceScore = this.calculatePerformanceScore();
      
      this.config.smartLog('performance', 
        `System metrics: ${systemMetrics.memoryUsageMB}MB RAM, ${systemMetrics.throughputPerMinute}/min throughput, score: ${systemMetrics.performanceScore}/100`
      );
    }
  
    calculateOptimizationImpact() {
      const services = ['search_cache', 'job_matching', 'response_formatting'];
      
      services.forEach(service => {
        const metrics = this.metrics.get(service);
        if (metrics.optimizationGains.length > 0) {
          const recentGains = metrics.optimizationGains.slice(-20);
          const avgGain = recentGains.reduce((sum, g) => sum + g.gainPercent, 0) / recentGains.length;
          
          this.optimizationImpact.set(service, {
            avgGainPercent: Math.round(avgGain),
            totalOptimizations: metrics.optimizationGains.length,
            recentGains: recentGains.length
          });
        }
      });
    }
  
    calculatePerformanceScore() {
      const searchMetrics = this.metrics.get('search_cache');
      const matchingMetrics = this.metrics.get('job_matching');
      const formattingMetrics = this.metrics.get('response_formatting');
      const systemMetrics = this.metrics.get('system_overall');
      
      let score = 100;
      
      if (searchMetrics.avgResponseTime > this.config.performance.targetResponseTimeMs) {
        score -= 20;
      }
      
      if (systemMetrics.memoryUsageMB > this.config.performance.maxMemoryUsageMB) {
        score -= 15;
      }
      
      if (systemMetrics.throughputPerMinute < this.config.performance.targetThroughputPerMin) {
        score -= 15;
      }
      
      if (searchMetrics.cacheHitRate < 0.5) {
        score -= 10;
      }
      
      if (searchMetrics.errorRate > 0.05) {
        score -= 20;
      }
      
      if (matchingMetrics.scoreCacheHitRate > 0.7) {
        score += 10;
      }
      
      if (searchMetrics.indexHitRate > 0.8) {
        score += 5;
      }
      
      return Math.max(0, Math.min(100, score));
    }
  
    checkAlertThresholds() {
      if (!this.config.monitoring?.enableAlerts) return;
      
      const thresholds = this.config.monitoring.alertThresholds;
      const searchMetrics = this.metrics.get('search_cache');
      const systemMetrics = this.metrics.get('system_overall');
      
      if (searchMetrics.avgResponseTime > thresholds.responseTime) {
        this.triggerAlert('response_time', {
          current: searchMetrics.avgResponseTime,
          threshold: thresholds.responseTime,
          severity: 'warning'
        });
      }
      
      if (searchMetrics.errorRate > thresholds.errorRate) {
        this.triggerAlert('error_rate', {
          current: searchMetrics.errorRate,
          threshold: thresholds.errorRate,
          severity: 'critical'
        });
      }
      
      if (systemMetrics.memoryUsageMB > thresholds.memoryUsage) {
        this.triggerAlert('memory_usage', {
          current: systemMetrics.memoryUsageMB,
          threshold: thresholds.memoryUsage,
          severity: 'warning'
        });
      }
      
      if (searchMetrics.cacheHitRate < thresholds.cacheHitRate) {
        this.triggerAlert('cache_hit_rate', {
          current: searchMetrics.cacheHitRate,
          threshold: thresholds.cacheHitRate,
          severity: 'info'
        });
      }
    }
  
    triggerAlert(alertType, details) {
      const alertKey = `${alertType}_${Date.now()}`;
      this.alerts.set(alertKey, {
        type: alertType,
        details,
        timestamp: Date.now(),
        acknowledged: false
      });
      
      this.config.smartLog('performance', 
        `ALERT [${details.severity}] ${alertType}: ${details.current} exceeds ${details.threshold}`
      );
      
      if (this.alerts.size > 50) {
        const oldestAlert = this.alerts.keys().next().value;
        this.alerts.delete(oldestAlert);
      }
    }
  
    logPerformanceSummary() {
      if (!this.config.monitoring?.logPerformanceMetrics) return;
      
      const summary = this.getPerformanceSummary();
      
      this.config.smartLog('performance', 
        `Performance Summary: ${summary.overallScore}/100 score, ` +
        `${summary.avgResponseTime}ms avg response, ` +
        `${summary.cacheHitRate}% cache hits, ` +
        `${summary.throughput}/min throughput`
      );
    }
  
    getPerformanceSummary() {
      const searchMetrics = this.metrics.get('search_cache');
      const systemMetrics = this.metrics.get('system_overall');
      
      return {
        overallScore: systemMetrics.performanceScore,
        avgResponseTime: Math.round(searchMetrics.avgResponseTime),
        cacheHitRate: Math.round(searchMetrics.cacheHitRate * 100),
        throughput: systemMetrics.throughputPerMinute,
        memoryUsage: systemMetrics.memoryUsageMB,
        errorRate: Math.round(searchMetrics.errorRate * 100),
        uptime: Math.round(systemMetrics.uptime / (1000 * 60)),
        optimizationGains: this.getOptimizationSummary()
      };
    }
  
    getOptimizationSummary() {
      const summary = {};
      
      for (const [service, impact] of this.optimizationImpact.entries()) {
        summary[service] = {
          avgGain: impact.avgGainPercent,
          totalOptimizations: impact.totalOptimizations
        };
      }
      
      return summary;
    }
  
    getTotalRequests() {
      const searchRequests = this.metrics.get('search_cache').totalRequests;
      const matchRequests = this.metrics.get('job_matching').totalMatches;
      const formatRequests = this.metrics.get('response_formatting').totalResponses;
      
      return searchRequests + matchRequests + formatRequests;
    }
  
    benchmarkOperation(service, operation, fn, metadata = {}) {
      const startTime = Date.now();
      
      return Promise.resolve(fn()).then(result => {
        const endTime = Date.now();
        
        switch (service) {
          case 'search_cache':
            this.trackSearchCacheOperation(operation, startTime, endTime, metadata);
            break;
          case 'job_matching':
            this.trackJobMatchingOperation(operation, startTime, endTime, metadata);
            break;
          case 'response_formatting':
            this.trackResponseFormattingOperation(operation, startTime, endTime, metadata);
            break;
        }
        
        return result;
      }).catch(error => {
        const endTime = Date.now();
        const errorMetadata = { ...metadata, error: true };
        
        switch (service) {
          case 'search_cache':
            this.trackSearchCacheOperation(operation, startTime, endTime, errorMetadata);
            break;
          case 'job_matching':
            this.trackJobMatchingOperation(operation, startTime, endTime, errorMetadata);
            break;
          case 'response_formatting':
            this.trackResponseFormattingOperation(operation, startTime, endTime, errorMetadata);
            break;
        }
        
        throw error;
      });
    }
  
    getDetailedMetrics() {
      const metrics = {};
      
      for (const [service, data] of this.metrics.entries()) {
        metrics[service] = { ...data };
      }
      
      return {
        metrics,
        optimizationImpact: Object.fromEntries(this.optimizationImpact),
        alerts: Array.from(this.alerts.values()).slice(-10),
        summary: this.getPerformanceSummary()
      };
    }
  
    resetMetrics() {
      this.initializeMetrics();
      this.alerts.clear();
      this.optimizationImpact.clear();
      this.startTime = Date.now();
      
      this.config.smartLog('performance', 'Performance metrics reset');
    }
  }
  
  module.exports = PerformanceMonitor;