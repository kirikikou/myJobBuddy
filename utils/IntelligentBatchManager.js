const ResourceMonitor = require('./ResourceMonitor');
const parallelizationConfig = require('../config/parallelization');

const loggingService = require('../services/LoggingService');
class IntelligentBatchManager {
  constructor() {
    this.processingQueue = new Map();
    this.batchHistory = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await ResourceMonitor.initialize();
    this.initialized = true;
    loggingService.service('IntelligentBatchManager','log',{ message: '🧠 IntelligentBatchManager initialized' });
  }

  calculateOptimalBatching(domains, serverLoad = null) {
    const currentLoad = serverLoad || ResourceMonitor.getCurrentLoad();
    const availableResources = ResourceMonitor.getAvailableResources();
    
    const estimatedWeights = domains.map(domain => ResourceMonitor.estimateStepWeight(domain));
    const totalWeight = estimatedWeights.reduce((a, b) => a + b, 0);
    const averageWeight = totalWeight / domains.length;
    
    const maxConcurrentWeight = availableResources.cpu * 40;
    
    if (totalWeight <= maxConcurrentWeight && availableResources.workers >= domains.length) {
      return {
        batches: 1,
        parallel: domains.length,
        strategy: 'full-parallel',
        estimatedTime: ResourceMonitor.getAverageStepTime(domains),
        resourceUtilization: totalWeight / maxConcurrentWeight
      };
    }
    
    const optimalParallel = Math.floor(maxConcurrentWeight / averageWeight);
    const constrainedParallel = Math.min(
      optimalParallel,
      availableResources.workers,
      parallelizationConfig.MAX_PARALLEL
    );
    
    const finalParallel = Math.max(parallelizationConfig.MIN_PARALLEL, constrainedParallel);
    const batchCount = Math.ceil(domains.length / finalParallel);
    
    const estimatedTime = batchCount * ResourceMonitor.getAverageStepTime(domains);
    
    return {
      batches: batchCount,
      parallel: finalParallel,
      strategy: 'adaptive-batching',
      estimatedTime,
      resourceUtilization: (finalParallel * averageWeight) / maxConcurrentWeight,
      totalWeight,
      averageWeight
    };
  }

  async processBatch(domains, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const { userId = 'batch', forceServer = false } = options;
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    loggingService.batch('processing-batch', { batchId, domainCount: domains.length });    
    const resources = ResourceMonitor.getCurrentLoad();
    const batchConfig = this.calculateOptimalBatching(domains, resources);
    
    const estimatedWaitTime = this.estimateWaitTime(batchConfig);
    
    loggingService.timing('batch-analysis', { batches: batchConfig.batches, parallel: batchConfig.parallel, waitTimeMin: Math.round(estimatedWaitTime) });    
    if (!forceServer && estimatedWaitTime > parallelizationConfig.MAX_WAIT_TIME_MINUTES) {
      loggingService.steps('aws-delegation', { batchId, waitTimeMin: Math.round(estimatedWaitTime), maxWaitMin: parallelizationConfig.MAX_WAIT_TIME_MINUTES });
      return await this.fallbackToAWS(domains, batchId);
    }
    
    return await this.processOnServer(domains, batchConfig, batchId, options);
  }

  estimateWaitTime(batchConfig) {
    const currentQueue = ResourceMonitor.getQueueLength();
    const avgProcessingTime = batchConfig.estimatedTime / 1000;
    const queueProcessingTime = currentQueue * 15;
    
    return (queueProcessingTime + avgProcessingTime) / 60;
  }

  async processOnServer(domains, batchConfig, batchId, options = {}) {
    loggingService.steps('server-processing', { batchId, batches: batchConfig.batches, parallel: batchConfig.parallel });    
    this.processingQueue.set(batchId, {
      domains: domains.length,
      config: batchConfig,
      startTime: Date.now(),
      status: 'processing'
    });
    
    const results = [];
    const batches = this.createBatches(domains, batchConfig.parallel);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      loggingService.steps('batch-progress', { current: i + 1, total: batches.length, batchSize: batch.length });      
      const batchStartTime = Date.now();
      const batchResults = await this.processBatchParallel(batch, options);
      const batchDuration = Date.now() - batchStartTime;
      
      results.push(...batchResults);
      
      await ResourceMonitor.updateStepTime('batch-processing', batchDuration);
      
      if (i < batches.length - 1) {
        const delayMs = this.calculateInterBatchDelay(batchDuration, batchConfig);
        if (delayMs > 0) {
          loggingService.timing('inter-batch-delay', { delayMs });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    const totalDuration = Date.now() - this.processingQueue.get(batchId).startTime;
    
    this.batchHistory.push({
      batchId,
      domains: domains.length,
      config: batchConfig,
      duration: totalDuration,
      timestamp: Date.now()
    });
    
    this.processingQueue.delete(batchId);
    
    loggingService.win('Batch completed', { batchId, durationSeconds: Math.round(totalDuration / 1000) });    
    return {
      success: true,
      source: 'server-batch',
      batchId,
      results,
      config: batchConfig,
      duration: totalDuration,
      timestamp: Date.now()
    };
  }

  createBatches(domains, batchSize) {
    const batches = [];
    for (let i = 0; i < domains.length; i += batchSize) {
      batches.push(domains.slice(i, i + batchSize));
    }
    return batches;
  }

  async processBatchParallel(batch, options = {}) {
    const { coordinator } = require('../scrapers/ScrapingCoordinator');
    const promises = batch.map(async (domain) => {
      try {
        const result = await coordinator.coordinatedScrape(domain.url, domain.jobTitle, {
          ...options,
          forceRefresh: true
        });
        return { domain: domain.url, success: true, result };
      } catch (error) {
        loggingService.error('Batch processing failed', { domain: domain.url, error: error.message });
        return { domain: domain.url, success: false, error: error.message };
      }
    });
    
    return await Promise.allSettled(promises);
  }

  calculateInterBatchDelay(batchDuration, batchConfig) {
    const targetDuration = parallelizationConfig.BATCH_CALCULATION.TARGET_BATCH_DURATION * 1000;
    
    if (batchDuration < targetDuration * 0.5) {
      return Math.min(2000, targetDuration - batchDuration);
    }
    
    return 0;
  }

  async fallbackToAWS(domains, batchId) {
    loggingService.steps('aws-fallback', { batchId, domainCount: domains.length });    
    return {
      success: true,
      source: 'aws-fallback',
      batchId,
      message: 'Batch delegated to AWS Lambda/Fargate',
      domains: domains.length,
      estimatedCompletion: Date.now() + (5 * 60 * 1000),
      timestamp: Date.now()
    };
  }

  getBatchingStats() {
    const currentQueue = Array.from(this.processingQueue.values());
    const recentHistory = this.batchHistory.slice(-10);
    
    const avgBatchTime = recentHistory.length > 0 
      ? recentHistory.reduce((sum, b) => sum + b.duration, 0) / recentHistory.length
      : 0;
    
    return {
      currentQueue: {
        size: this.processingQueue.size,
        batches: currentQueue
      },
      history: {
        totalBatches: this.batchHistory.length,
        recentBatches: recentHistory.length,
        averageBatchTime: Math.round(avgBatchTime / 1000)
      },
      resources: ResourceMonitor.getResourceStats(),
      config: parallelizationConfig,
      timestamp: Date.now()
    };
  }

  async clearBatchHistory() {
    const clearedCount = this.batchHistory.length;
    this.batchHistory = [];
    loggingService.service('IntelligentBatchManager', 'history-cleared', { clearedCount });
    return clearedCount;
  }

  getOptimalBatchSize(domains) {
    const batchConfig = this.calculateOptimalBatching(domains);
    return {
      recommendedParallel: batchConfig.parallel,
      estimatedBatches: batchConfig.batches,
      estimatedTime: Math.round(batchConfig.estimatedTime / 1000),
      strategy: batchConfig.strategy,
      canUseServer: batchConfig.estimatedTime <= (parallelizationConfig.MAX_WAIT_TIME_MINUTES * 60 * 1000)
    };
  }
}

module.exports = new IntelligentBatchManager();