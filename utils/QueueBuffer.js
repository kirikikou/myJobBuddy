const config = require('../config');
const ResourceMonitor = require('./ResourceMonitor');
const IntelligentBatchManager = require('./IntelligentBatchManager');
const parallelizationConfig = require('../config/parallelization');

class QueueBuffer {
  constructor() {
    this.serverQueue = [];
    this.awsQueue = [];
    this.processingHistory = new Map();
    this.queueMetrics = {
      totalRequests: 0,
      serverProcessed: 0,
      awsFallbacks: 0,
      averageWaitTime: 0
    };
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await ResourceMonitor.initialize();
    await IntelligentBatchManager.initialize();
    this.initialized = true;
    config.smartLog('buffer','🗂️ QueueBuffer initialized');
  }

  async addToQueue(request) {
    if (!this.initialized) await this.initialize();
    
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    request.id = requestId;
    request.timestamp = Date.now();
    
    this.queueMetrics.totalRequests++;
    
    const estimatedWaitTime = this.calculateWaitTime();
    
    config.smartLog('buffer',`📥 Request ${requestId} queued (estimated wait: ${Math.round(estimatedWaitTime)}min)`);
    
    if (estimatedWaitTime <= parallelizationConfig.MAX_WAIT_TIME_MINUTES) {
      return await this.addToServerQueue(request);
    } else {
      return await this.processWithAWS(request);
    }
  }

  async addToServerQueue(request) {
    this.serverQueue.push(request);
    
    config.smartLog('buffer',`🖥️ Added to server queue (position: ${this.serverQueue.length})`);
    
    this.processingHistory.set(request.id, {
      ...request,
      queueType: 'server',
      queuePosition: this.serverQueue.length
    });
    
    setTimeout(() => this.processServerQueue(), 100);
    
    return {
      success: true,
      queueType: 'server',
      requestId: request.id,
      queuePosition: this.serverQueue.length,
      estimatedWaitTime: this.calculateWaitTime(),
      message: 'Added to server processing queue'
    };
  }

  async processWithAWS(request) {
    this.awsQueue.push(request);
    this.queueMetrics.awsFallbacks++;
    
    config.smartLog('buffer',`☁️ Delegated to AWS (queue position: ${this.awsQueue.length})`);
    
    this.processingHistory.set(request.id, {
      ...request,
      queueType: 'aws',
      queuePosition: this.awsQueue.length
    });
    
    return {
      success: true,
      queueType: 'aws',
      requestId: request.id,
      queuePosition: this.awsQueue.length,
      estimatedWaitTime: 2,
      message: 'Delegated to AWS for faster processing'
    };
  }

  calculateWaitTime() {
    if (this.serverQueue.length === 0) return 0;
    
    const averageProcessingTime = this.getAverageProcessingTime();
    const currentParallelCapacity = this.getCurrentParallelCapacity();
    
    const queueWaitTime = (this.serverQueue.length * averageProcessingTime) / currentParallelCapacity;
    
    return queueWaitTime / 60;
  }

  getAverageProcessingTime() {
    const recentProcessing = Array.from(this.processingHistory.values())
      .filter(req => req.completedAt && Date.now() - req.completedAt < 3600000)
      .map(req => req.processingTime || 30000);
    
    if (recentProcessing.length === 0) return 30000;
    
    return recentProcessing.reduce((sum, time) => sum + time, 0) / recentProcessing.length;
  }

  getCurrentParallelCapacity() {
    const resources = ResourceMonitor.getAvailableResources();
    const optimalParallel = Math.min(
      Math.floor(resources.cpu * 40 / 3),
      resources.workers,
      parallelizationConfig.MAX_PARALLEL
    );
    
    return Math.max(parallelizationConfig.MIN_PARALLEL, optimalParallel);
  }

  async processServerQueue() {
    if (this.serverQueue.length === 0) return;
    
    const currentCapacity = this.getCurrentParallelCapacity();
    const batchSize = Math.min(currentCapacity, this.serverQueue.length);
    
    if (batchSize === 0) {
      config.smartLog('buffer','⏳ Server at capacity, delaying queue processing');
      setTimeout(() => this.processServerQueue(), 5000);
      return;
    }
    
    const batch = this.serverQueue.splice(0, batchSize);
    config.smartLog('buffer',`🔄 Processing server queue batch: ${batch.length} requests`);
    
    const domains = batch.map(req => ({
      url: req.url,
      jobTitle: req.jobTitle
    }));
    
    try {
      const result = await IntelligentBatchManager.processBatch(domains, {
        userId: 'queue-batch',
        forceServer: true
      });
      
      for (let i = 0; i < batch.length; i++) {
        const request = batch[i];
        const requestResult = result.results[i];
        
        this.completeRequest(request.id, requestResult, result.duration / batch.length);
      }
      
      this.queueMetrics.serverProcessed += batch.length;
      
    } catch (error) {
      config.smartLog('fail',`❌ Server queue batch failed: ${error.message}`);
      
      for (const request of batch) {
        this.completeRequest(request.id, { success: false, error: error.message }, 0);
      }
    }
    
    if (this.serverQueue.length > 0) {
      setTimeout(() => this.processServerQueue(), 1000);
    }
  }

  completeRequest(requestId, result, processingTime) {
    const request = this.processingHistory.get(requestId);
    if (request) {
      request.completedAt = Date.now();
      request.processingTime = processingTime;
      request.result = result;
      
      const totalTime = request.completedAt - request.timestamp;
      this.updateAverageWaitTime(totalTime);
      
      config.smartLog('buffer',`✅ Request ${requestId} completed in ${Math.round(totalTime / 1000)}s`);
    }
  }

  updateAverageWaitTime(waitTime) {
    const alpha = 0.1;
    this.queueMetrics.averageWaitTime = 
      (this.queueMetrics.averageWaitTime * (1 - alpha)) + (waitTime * alpha);
  }

  getQueueStats() {
    const resources = ResourceMonitor.getCurrentLoad();
    
    return {
      queues: {
        server: {
          length: this.serverQueue.length,
          capacity: this.getCurrentParallelCapacity(),
          estimatedWaitTime: this.calculateWaitTime()
        },
        aws: {
          length: this.awsQueue.length,
          estimatedWaitTime: 2
        }
      },
      metrics: {
        ...this.queueMetrics,
        averageWaitTime: Math.round(this.queueMetrics.averageWaitTime / 1000)
      },
      resources,
      config: {
        maxWaitTimeMinutes: parallelizationConfig.MAX_WAIT_TIME_MINUTES,
        maxParallel: parallelizationConfig.MAX_PARALLEL
      },
      timestamp: Date.now()
    };
  }

  async getRequestStatus(requestId) {
    const request = this.processingHistory.get(requestId);
    if (!request) {
      return { found: false, message: 'Request not found' };
    }
    
    const status = request.completedAt ? 'completed' : 'processing';
    const waitTime = request.completedAt 
      ? request.completedAt - request.timestamp
      : Date.now() - request.timestamp;
    
    return {
      found: true,
      requestId,
      status,
      queueType: request.queueType,
      queuePosition: request.queuePosition,
      waitTime: Math.round(waitTime / 1000),
      result: request.result,
      timestamp: request.timestamp
    };
  }

  async clearQueues() {
    const serverCleared = this.serverQueue.length;
    const awsCleared = this.awsQueue.length;
    const historyCleared = this.processingHistory.size;
    
    this.serverQueue = [];
    this.awsQueue = [];
    this.processingHistory.clear();
    
    config.smartLog('buffer',`🧹 Cleared queues: ${serverCleared} server, ${awsCleared} aws, ${historyCleared} history`);
    
    return { serverCleared, awsCleared, historyCleared };
  }

  async optimizeQueue() {
    if (this.serverQueue.length === 0) return;
    
    const resources = ResourceMonitor.getCurrentLoad();
    const capacity = this.getCurrentParallelCapacity();
    
    config.smartLog('buffer',`🔧 Queue optimization: ${this.serverQueue.length} requests, capacity: ${capacity}`);
    
    const domains = this.serverQueue.map(req => req.url);
    const batchConfig = IntelligentBatchManager.calculateOptimalBatching(domains, resources);
    
    if (batchConfig.estimatedTime > parallelizationConfig.MAX_WAIT_TIME_MINUTES * 60 * 1000) {
      const moveToAws = Math.ceil(this.serverQueue.length * 0.5);
      const moved = this.serverQueue.splice(-moveToAws, moveToAws);
      
      this.awsQueue.push(...moved);
      this.queueMetrics.awsFallbacks += moved.length;
      
      config.smartLog('buffer',`⚡ Moved ${moved.length} requests to AWS queue for optimization`);
      
      return { optimized: true, movedToAws: moved.length };
    }
    
    return { optimized: false, reason: 'Server can handle current load' };
  }
}

module.exports = new QueueBuffer();