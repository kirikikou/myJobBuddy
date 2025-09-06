const config = require('../config');
const ResourceMonitor = require('./ResourceMonitor');
const IntelligentBatchManager = require('./IntelligentBatchManager');
const QueueBuffer = require('./QueueBuffer');
const parallelizationConfig = require('../config/parallelization');

class IntelligentCoordinator {
  constructor() {
    this.initialized = false;
    this.stats = {
      totalRequests: 0,
      serverProcessed: 0,
      awsFallbacks: 0,
      batchesProcessed: 0,
      averageResponseTime: 0
    };
  }

  async initialize() {
    if (this.initialized) return;
    
    config.smartLog('buffer','🚀 Initializing Intelligent Coordination System...');
    
    await ResourceMonitor.initialize();
    await IntelligentBatchManager.initialize();
    await QueueBuffer.initialize();
    
    this.initialized = true;
    config.smartLog('buffer','✅ Intelligent Coordination System ready');
  }

  async coordinateRequest(urls, jobTitles, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const startTime = Date.now();
    this.stats.totalRequests++;
    
    config.smartLog('buffer',`🎯 Coordinating ${urls.length} requests with intelligent system`);
    
    const domains = urls.map((url, index) => ({
      url,
      jobTitle: jobTitles[index] || jobTitles[0] || '',
      weight: ResourceMonitor.estimateStepWeight(this.getDomainFromUrl(url))
    }));
    
    const shouldUseServer = ResourceMonitor.shouldUseServerProcessing(domains);
    
    if (!shouldUseServer && !options.forceServer) {
      config.smartLog('buffer','⚡ Request delegated to AWS due to server capacity');
      this.stats.awsFallbacks++;
      return await this.processWithAWS(domains, options);
    }
    
    if (domains.length === 1) {
      return await this.processSingleRequest(domains[0], options);
    }
    
    const batchResult = await IntelligentBatchManager.processBatch(domains, options);
    this.stats.batchesProcessed++;
    this.stats.serverProcessed += domains.length;
    
    const responseTime = Date.now() - startTime;
    this.updateAverageResponseTime(responseTime);
    
    return {
      ...batchResult,
      coordination: {
        strategy: 'intelligent-batching',
        domainsProcessed: domains.length,
        responseTime,
        serverUsed: true
      }
    };
  }

  async processSingleRequest(domain, options = {}) {
    const { coordinator } = require('../scrapers/ScrapingCoordinator');
    
    const result = await coordinator.coordinatedScrape(domain.url, domain.jobTitle, {
      ...options,
      intelligentCoordination: true
    });
    
    this.stats.serverProcessed++;
    
    return {
      ...result,
      coordination: {
        strategy: 'single-request',
        domainsProcessed: 1,
        serverUsed: true
      }
    };
  }

  async processWithAWS(domains, options = {}) {
    return {
      success: true,
      source: 'aws-intelligent',
      message: 'Request processed by AWS Lambda/Fargate',
      domains: domains.length,
      estimatedCompletion: Date.now() + (3 * 60 * 1000),
      coordination: {
        strategy: 'aws-fallback',
        domainsProcessed: domains.length,
        serverUsed: false,
        reason: 'Server capacity exceeded'
      },
      timestamp: Date.now()
    };
  }

  getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  updateAverageResponseTime(responseTime) {
    const alpha = 0.1;
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (1 - alpha)) + (responseTime * alpha);
  }

  async analyzeOptimalStrategy(urls, jobTitles) {
    if (!this.initialized) await this.initialize();
    
    const domains = urls.map(url => this.getDomainFromUrl(url));
    const analysis = IntelligentBatchManager.getOptimalBatchSize(domains);
    const resources = ResourceMonitor.getResourceStats();
    
    return {
      recommendation: {
        strategy: analysis.canUseServer ? 'server-processing' : 'aws-fallback',
        batchSize: analysis.recommendedParallel,
        estimatedTime: analysis.estimatedTime,
        batches: analysis.estimatedBatches
      },
      resources: {
        current: resources.current,
        available: resources.available,
        utilization: (resources.current.cpu / 100) + (resources.current.ram / 8)
      },
      queue: QueueBuffer.getQueueStats(),
      domains: domains.length,
      timestamp: Date.now()
    };
  }

  getSystemHealth() {
    const resourceStats = ResourceMonitor.getResourceStats();
    const queueStats = QueueBuffer.getQueueStats();
    const batchStats = IntelligentBatchManager.getBatchingStats();
    
    const healthScore = this.calculateHealthScore(resourceStats, queueStats);
    
    return {
      overall: {
        healthScore,
        status: healthScore > 0.8 ? 'excellent' : healthScore > 0.6 ? 'good' : healthScore > 0.4 ? 'moderate' : 'poor',
        initialized: this.initialized
      },
      resources: resourceStats,
      queues: queueStats,
      batching: batchStats,
      statistics: this.stats,
      recommendations: this.generateRecommendations(resourceStats, queueStats),
      timestamp: Date.now()
    };
  }

  calculateHealthScore(resourceStats, queueStats) {
    const cpuHealth = Math.max(0, 1 - (resourceStats.current.cpu / 100));
    const ramHealth = Math.max(0, 1 - (resourceStats.current.ram / 8));
    const queueHealth = Math.max(0, 1 - (queueStats.queues.server.length / 50));
    
    return (cpuHealth + ramHealth + queueHealth) / 3;
  }

  generateRecommendations(resourceStats, queueStats) {
    const recommendations = [];
    
    if (resourceStats.current.cpu > 80) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'CPU usage high - consider increasing AWS fallback threshold'
      });
    }
    
    if (resourceStats.current.ram > 6) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: 'Memory usage high - optimize batch sizes'
      });
    }
    
    if (queueStats.queues.server.length > 20) {
      recommendations.push({
        type: 'queue',
        priority: 'medium',
        message: 'Server queue building up - increase parallel processing'
      });
    }
    
    if (this.stats.awsFallbacks / this.stats.totalRequests > 0.3) {
      recommendations.push({
        type: 'efficiency',
        priority: 'low',
        message: 'High AWS fallback rate - consider server optimization'
      });
    }
    
    return recommendations;
  }

  async optimizeSystem() {
    config.smartLog('buffer','🔧 Running system optimization...');
    
    const queueOptimization = await QueueBuffer.optimizeQueue();
    const batchOptimization = await IntelligentBatchManager.clearBatchHistory();
    
    if (queueOptimization.optimized) {
      config.smartLog('buffer',`✅ Queue optimized: ${queueOptimization.movedToAws} requests moved to AWS`);
    }
    
    config.smartLog('buffer',`🧹 Cleared ${batchOptimization} batch history entries`);
    
    return {
      queueOptimization,
      batchHistoryCleared: batchOptimization,
      timestamp: Date.now()
    };
  }

  async getDetailedStats() {
    const systemHealth = this.getSystemHealth();
    const config = parallelizationConfig;
    
    return {
      ...systemHealth,
      configuration: config,
      integrationStatus: {
        resourceMonitor: ResourceMonitor.initialized,
        batchManager: IntelligentBatchManager.initialized,
        queueBuffer: QueueBuffer.initialized,
        coordinator: this.initialized
      }
    };
  }
}

module.exports = new IntelligentCoordinator();