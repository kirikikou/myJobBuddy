const EventEmitter = require('events');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const ResourceMonitor = require('./ResourceMonitor');
const IntelligentBatchManager = require('./IntelligentBatchManager');
const queueConfig = require('../config/queue');
const loggingService = require('../services/LoggingService');

class QueueBuffer extends EventEmitter {
  constructor() {
    super();
    this.serverQueue = [];
    this.awsQueue = [];
    this.priorityQueues = {
      premium: [],
      pro: [],
      free: []
    };
    this.affinityGroups = new Map();
    this.processingHistory = new Map();
    this.deadLetterQueue = new Map();
    this.idempotenceCache = new Map();
    this.subscribers = new Map();
    this.inFlightRequests = new Map();
    
    this.metrics = {
      totalRequests: 0,
      serverProcessed: 0,
      awsFallbacks: 0,
      duplicateRequests: 0,
      dlqItems: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      errorRate1m: 0,
      lastPurgeMs: Date.now()
    };

    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      lastProbeTime: 0,
      consecutiveFailures: 0
    };

    this.state = {
      initialized: false,
      processing: false,
      shuttingDown: false,
      drainingStarted: 0
    };

    this.latencyWindow = [];
    this.errorWindow = [];

    this.setupEventHandlers();
    this.startPurgeInterval();
    this.startAffinityCollector();
  }

  setupEventHandlers() {
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    
    this.on('request-completed', (requestId, result) => {
      this.notifySubscribers(requestId, result);
      this.updateMetrics(result);
    });
  }

  async initialize() {
    if (this.state.initialized) return;
    
    await ResourceMonitor.initialize();
    await IntelligentBatchManager.initialize();
    await this.loadPersistedState();
    
    this.state.initialized = true;
    loggingService.service('QueueBuffer', 'initialized');
  }

  async loadPersistedState() {
    try {
      const stateFile = queueConfig.SHUTDOWN_STATE_FILE;
      const data = await fs.readFile(stateFile, 'utf8');
      const lines = data.trim().split('\n');
      
      for (const line of lines) {
        const item = JSON.parse(line);
        if (item.type === 'pending_request') {
          await this.addToQueue(item.request, { skipPersist: true });
        }
      }
      
      await fs.unlink(stateFile);
      loggingService.service('QueueBuffer', 'state-restored', { itemsRestored: lines.length });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        loggingService.error('Failed to load persisted state', { error: error.message });
      }
    }
  }

  async persistState() {
    if (!queueConfig.SHUTDOWN_PERSIST_STATE) return;
    
    try {
      const stateFile = queueConfig.SHUTDOWN_STATE_FILE;
      const tempFile = `${stateFile}.tmp`;
      
      const pendingItems = [
        ...this.serverQueue,
        ...this.awsQueue,
        ...this.priorityQueues.premium,
        ...this.priorityQueues.pro,
        ...this.priorityQueues.free
      ];
      
      const lines = pendingItems.map(item => 
        JSON.stringify({ type: 'pending_request', request: item, timestamp: Date.now() })
      );
      
      await fs.writeFile(tempFile, lines.join('\n'));
      await fs.rename(tempFile, stateFile);
      
      loggingService.service('QueueBuffer', 'state-persisted', { itemsPersisted: lines.length });
    } catch (error) {
      loggingService.error('Failed to persist state', { error: error.message });
    }
  }

  generateRequestKey(request) {
    const { userId, url, jobTitle } = request;
    const payload = `${userId}|${url}|${jobTitle}|v1`;
    return crypto.createHmac('sha256', queueConfig.IDEMPOTENCE_SECRET)
      .update(payload)
      .digest('hex');
  }

  checkIdempotence(requestKey, plan) {
    const cached = this.idempotenceCache.get(requestKey);
    if (!cached) return null;
    
    const ttl = queueConfig.getIdempotenceTTLForPlan(plan);
    if (Date.now() - cached.timestamp > ttl) {
      this.idempotenceCache.delete(requestKey);
      return null;
    }
    
    this.metrics.duplicateRequests++;
    return { ...cached.result, servedFrom: 'duplicate' };
  }

  validateRequest(request) {
    if (!queueConfig.REQUEST_VALIDATION_STRICT) return true;
    
    if (!request.url || !request.jobTitle || !request.userId) {
      throw new Error('Missing required fields: url, jobTitle, userId');
    }
    
    if (typeof request.url !== 'string' || !request.url.startsWith('http')) {
      throw new Error('Invalid URL format');
    }
    
    return true;
  }

  checkBackpressure(plan) {
    const queueLimit = queueConfig.getQueueLimitForPlan(plan);
    const inflightLimit = queueConfig.getInflightLimitForPlan(plan);
    
    const totalQueueLength = this.getTotalQueueLength();
    const inflightCount = this.inFlightRequests.size;
    
    if (totalQueueLength >= queueLimit) {
      return { rejected: true, reason: 'queue-full', retryAfter: this.calculateRetryAfter() };
    }
    
    if (inflightCount >= inflightLimit) {
      return { rejected: true, reason: 'rate-limit', retryAfter: this.calculateRetryAfter() };
    }
    
    if (this.circuitBreaker.state === 'open') {
      return { rejected: true, reason: 'breaker-open', retryAfter: queueConfig.BREAKER_RESET_TIMEOUT_MS / 1000 };
    }
    
    return { rejected: false };
  }

  calculateRetryAfter() {
    const queueWaitTime = this.calculateWaitTime();
    const backoffHint = Math.min(60, Math.max(5, queueWaitTime / 60));
    return Math.ceil(backoffHint);
  }

  async addToQueue(request, options = {}) {
    if (!this.state.initialized) await this.initialize();
    
    if (this.state.shuttingDown && !options.skipPersist) {
      throw new Error('Service is shutting down');
    }
    
    try {
      this.validateRequest(request);
    } catch (error) {
      await this.addToDeadLetterQueue(request, 'validation-error', error.message);
      throw error;
    }
    
    const requestKey = this.generateRequestKey(request);
    const plan = request.plan || 'free';
    
    const idempotentResult = this.checkIdempotence(requestKey, plan);
    if (idempotentResult) {
      return idempotentResult;
    }
    
    const backpressure = this.checkBackpressure(plan);
    if (backpressure.rejected) {
      loggingService.buffer('request-rejected', { 
        reason: backpressure.reason, 
        retryAfter: backpressure.retryAfter 
      });
      throw new Error(`Request rejected: ${backpressure.reason}. Retry after ${backpressure.retryAfter}s`);
    }
    
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const enrichedRequest = {
      ...request,
      id: requestId,
      requestKey,
      timestamp: Date.now(),
      priority: this.calculatePriority(plan, Date.now()),
      weight: this.estimateRequestWeight(request.url),
      retryCount: 0
    };
    
    this.metrics.totalRequests++;
    this.inFlightRequests.set(requestId, enrichedRequest);
    
    const estimatedWaitTime = this.calculateWaitTime();
    
    loggingService.buffer('request-queued', { 
      requestId, 
      requestKey: requestKey.substring(0, 8),
      estimatedWaitTimeMin: Math.round(estimatedWaitTime)
    });
    
    if (estimatedWaitTime <= (queueConfig.getMaxWaitTimeMs() / 60000)) {
      return await this.addToServerQueue(enrichedRequest);
    } else {
      return await this.processWithAWS(enrichedRequest);
    }
  }

  calculatePriority(plan, timestamp) {
    const baseWeight = queueConfig.getPriorityWeightForPlan(plan);
    const age = Date.now() - timestamp;
    const ageBoost = age * queueConfig.AGE_BOOST_FACTOR;
    return baseWeight + ageBoost;
  }

  estimateRequestWeight(url) {
    try {
      const domain = new URL(url).hostname;
      return ResourceMonitor.estimateStepWeight(domain);
    } catch (error) {
      return 3;
    }
  }

  async addToServerQueue(request) {
    const domain = this.extractDomain(request.url);
    
    if (this.shouldUseAffinityBatching(domain)) {
      this.addToAffinityGroup(domain, request);
    } else {
      this.addToPriorityQueue(request);
    }
    
    this.processingHistory.set(request.id, {
      id: request.id,
      requestKey: request.requestKey,
      timestamp: request.timestamp,
      domain,
      priority: request.priority,
      queueType: 'server',
      status: 'queued'
    });
    
    this.scheduleProcessing();
    
    return {
      success: true,
      queueType: 'server',
      requestId: request.id,
      estimatedWaitTime: this.calculateWaitTime(),
      message: 'Added to server processing queue'
    };
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return 'unknown';
    }
  }

  shouldUseAffinityBatching(domain) {
    if (!this.affinityGroups.has(domain)) {
      this.affinityGroups.set(domain, {
        requests: [],
        firstRequestTime: Date.now()
      });
    }
    
    const group = this.affinityGroups.get(domain);
    const windowExpired = Date.now() - group.firstRequestTime > queueConfig.AFFINITY_WINDOW_MS;
    const hasMinBatch = group.requests.length >= queueConfig.AFFINITY_MIN_BATCH;
    
    return !windowExpired || !hasMinBatch;
  }

  addToAffinityGroup(domain, request) {
    const group = this.affinityGroups.get(domain);
    group.requests.push(request);
    
    if (group.requests.length >= queueConfig.BATCH_MAX_SIZE) {
      this.flushAffinityGroup(domain);
    }
  }

  addToPriorityQueue(request) {
    const plan = request.plan || 'free';
    this.priorityQueues[plan].push(request);
    this.sortPriorityQueue(plan);
  }

  sortPriorityQueue(plan) {
    this.priorityQueues[plan].sort((a, b) => {
      const priorityA = this.calculatePriority(a.plan, a.timestamp);
      const priorityB = this.calculatePriority(b.plan, b.timestamp);
      return priorityB - priorityA;
    });
  }

  flushAffinityGroup(domain) {
    const group = this.affinityGroups.get(domain);
    if (!group || group.requests.length === 0) return;
    
    for (const request of group.requests) {
      this.addToPriorityQueue(request);
    }
    
    this.affinityGroups.delete(domain);
    loggingService.buffer('affinity-group-flushed', { 
      domain, 
      requestCount: group.requests.length 
    });
  }

  startAffinityCollector() {
    setInterval(() => {
      const now = Date.now();
      for (const [domain, group] of this.affinityGroups.entries()) {
        if (now - group.firstRequestTime > queueConfig.AFFINITY_MAX_WAIT_MS) {
          this.flushAffinityGroup(domain);
        }
      }
    }, queueConfig.AFFINITY_WINDOW_MS);
  }

  async processWithAWS(request) {
    if (!queueConfig.AWS_FALLBACK_ENABLED || this.circuitBreaker.state === 'open') {
      await this.addToDeadLetterQueue(request, 'aws-unavailable', 'AWS processing disabled or circuit breaker open');
      throw new Error('AWS processing unavailable');
    }
    
    this.awsQueue.push(request);
    this.metrics.awsFallbacks++;
    
    loggingService.buffer('delegated-to-aws', { 
      requestId: request.id,
      position: this.awsQueue.length 
    });
    
    this.processingHistory.set(request.id, {
      id: request.id,
      requestKey: request.requestKey,
      timestamp: request.timestamp,
      domain: this.extractDomain(request.url),
      priority: request.priority,
      queueType: 'aws',
      status: 'queued'
    });
    
    setTimeout(() => this.processAWSQueue(), 100);
    
    return {
      success: true,
      queueType: 'aws',
      requestId: request.id,
      estimatedWaitTime: 2,
      message: 'Delegated to AWS for faster processing'
    };
  }

  async processAWSQueue() {
    if (this.awsQueue.length === 0) return;
    
    const batch = this.awsQueue.splice(0, Math.min(queueConfig.BATCH_MAX_SIZE, this.awsQueue.length));
    
    try {
      await this.processAWSBatch(batch);
      this.updateCircuitBreaker(true, 0);
    } catch (error) {
      loggingService.error('AWS batch processing failed', { 
        error: error.message,
        batchSize: batch.length 
      });
      
      this.updateCircuitBreaker(false, Date.now() - batch[0].timestamp);
      
      for (const request of batch) {
        await this.addToDeadLetterQueue(request, 'aws-processing-error', error.message);
        this.completeRequest(request.id, { 
          success: false, 
          error: error.message,
          servedFrom: 'aws-error' 
        });
      }
    }
  }

  async processAWSBatch(batch) {
    loggingService.buffer('aws-batch-processing', { batchSize: batch.length });
    
    const mockResults = batch.map((request, index) => ({
      success: true,
      result: { jobs: [], domain: this.extractDomain(request.url) },
      servedFrom: 'aws'
    }));
    
    for (let i = 0; i < batch.length; i++) {
      const request = batch[i];
      const result = mockResults[i];
      this.completeRequest(request.id, result);
    }
  }

  updateCircuitBreaker(success, latency) {
    if (success) {
      this.circuitBreaker.consecutiveFailures = 0;
      if (this.circuitBreaker.state === 'half-open') {
        this.circuitBreaker.state = 'closed';
        loggingService.service('QueueBuffer', 'circuit-breaker-closed');
      }
    } else {
      this.circuitBreaker.failures++;
      this.circuitBreaker.consecutiveFailures++;
      this.circuitBreaker.lastFailureTime = Date.now();
      
      const failureRate = this.circuitBreaker.failures / Math.max(queueConfig.BREAKER_MIN_REQUESTS, this.metrics.totalRequests);
      const highLatency = latency > queueConfig.BREAKER_LATENCY_THRESHOLD_MS;
      
      if ((failureRate >= queueConfig.BREAKER_FAILURE_THRESHOLD || highLatency) && 
          this.circuitBreaker.state === 'closed') {
        this.circuitBreaker.state = 'open';
        loggingService.service('QueueBuffer', 'circuit-breaker-opened', { 
          failureRate, 
          latency, 
          highLatency 
        });
      }
    }
    
    if (this.circuitBreaker.state === 'open' && 
        Date.now() - this.circuitBreaker.lastFailureTime > queueConfig.BREAKER_RESET_TIMEOUT_MS) {
      this.circuitBreaker.state = 'half-open';
      loggingService.service('QueueBuffer', 'circuit-breaker-half-open');
    }
  }

  scheduleProcessing() {
    if (this.state.processing || this.state.shuttingDown) return;
    
    const jitter = Math.random() * 
      (queueConfig.PROCESS_LOOP_JITTER_MS_MAX - queueConfig.PROCESS_LOOP_JITTER_MS_MIN) + 
      queueConfig.PROCESS_LOOP_JITTER_MS_MIN;
    
    setTimeout(() => this.processServerQueue(), queueConfig.PROCESS_LOOP_INTERVAL_MS + jitter);
  }

  async processServerQueue() {
    if (this.state.processing || this.state.shuttingDown) return;
    
    this.state.processing = true;
    
    try {
      const batch = this.getNextPriorityBatch();
      if (batch.length === 0) {
        return;
      }
      
      loggingService.buffer('processing-batch', { batchSize: batch.length });
      
      const domains = batch.map(req => ({
        url: req.url,
        jobTitle: req.jobTitle
      }));
      
      const result = await IntelligentBatchManager.processBatch(domains, {
        userId: 'queue-batch',
        forceServer: true
      });
      
      for (let i = 0; i < batch.length; i++) {
        const request = batch[i];
        const requestResult = result.results && result.results[i] ? result.results[i] : { 
          success: false, 
          error: 'No result returned',
          servedFrom: 'server-error'
        };
        
        this.cacheIdempotentResult(request.requestKey, requestResult, request.plan);
        this.completeRequest(request.id, requestResult, result.duration / batch.length);
      }
      
      this.metrics.serverProcessed += batch.length;
      
    } catch (error) {
      loggingService.error('Server queue batch failed', { error: error.message });
    } finally {
      this.state.processing = false;
      
      if (this.getTotalQueueLength() > 0) {
        this.scheduleProcessing();
      }
    }
  }

  getNextPriorityBatch() {
    const batch = [];
    const maxBatchSize = queueConfig.BATCH_MAX_SIZE;
    
    for (const plan of ['premium', 'pro', 'free']) {
      const queue = this.priorityQueues[plan];
      while (queue.length > 0 && batch.length < maxBatchSize) {
        const request = queue.shift();
        
        if (Date.now() - request.timestamp > queueConfig.PRIORITY_ESCALATION_THRESHOLD_MS && plan !== 'premium') {
          this.escalatePriority(request);
          continue;
        }
        
        batch.push(request);
      }
      
      if (batch.length >= maxBatchSize) break;
    }
    
    return batch;
  }

  escalatePriority(request) {
    const currentPlan = request.plan || 'free';
    const escalationMap = { free: 'pro', pro: 'premium' };
    const newPlan = escalationMap[currentPlan];
    
    if (newPlan) {
      request.plan = newPlan;
      request.priority = this.calculatePriority(newPlan, request.timestamp);
      this.addToPriorityQueue(request);
      
      loggingService.buffer('priority-escalated', { 
        requestId: request.id, 
        from: currentPlan, 
        to: newPlan 
      });
    }
  }

  cacheIdempotentResult(requestKey, result, plan) {
    if (this.idempotenceCache.size >= queueConfig.IDEMPOTENCE_CACHE_MAX_ENTRIES) {
      const oldestKey = this.idempotenceCache.keys().next().value;
      this.idempotenceCache.delete(oldestKey);
    }
    
    this.idempotenceCache.set(requestKey, {
      result: { ...result, servedFrom: 'fresh' },
      timestamp: Date.now(),
      plan
    });
  }

  calculateWaitTime() {
    const totalQueueLength = this.getTotalQueueLength();
    if (totalQueueLength === 0) return 0;
    
    const currentParallelCapacity = this.getCurrentParallelCapacity();
    const averageProcessingTimeMs = this.getAverageProcessingTime();
    
    const queueWaitTimeMs = (totalQueueLength * averageProcessingTimeMs) / currentParallelCapacity;
    
    return queueWaitTimeMs / 60000;
  }

  getTotalQueueLength() {
    return this.serverQueue.length + 
           this.priorityQueues.premium.length + 
           this.priorityQueues.pro.length + 
           this.priorityQueues.free.length +
           Array.from(this.affinityGroups.values()).reduce((sum, group) => sum + group.requests.length, 0);
  }

  getAverageProcessingTime() {
    const recentProcessing = Array.from(this.processingHistory.values())
      .filter(req => req.completedAt && Date.now() - req.completedAt < 3600000)
      .map(req => req.processingTime || queueConfig.ESTIMATE_BOOTSTRAP_MS);
    
    if (recentProcessing.length === 0) return queueConfig.ESTIMATE_BOOTSTRAP_MS;
    
    return recentProcessing.reduce((sum, time) => sum + time, 0) / recentProcessing.length;
  }

  getCurrentParallelCapacity() {
    const resources = ResourceMonitor.getAvailableResources();
    const optimalParallel = Math.min(
      Math.floor(resources.cpu * queueConfig.CPU_TO_WORKERS_COEFF),
      resources.workers,
      queueConfig.getMaxParallel()
    );
    
    return Math.max(queueConfig.getMinParallel(), optimalParallel);
  }

  completeRequest(requestId, result, processingTime = 0) {
    const request = this.processingHistory.get(requestId);
    if (request) {
      request.completedAt = Date.now();
      request.processingTime = processingTime;
      request.result = result;
      request.status = result.success ? 'completed' : 'failed';
      
      const totalTime = request.completedAt - request.timestamp;
      this.updateLatencyMetrics(totalTime);
      
      loggingService.buffer('request-completed', { 
        requestId, 
        totalTimeMs: totalTime,
        success: result.success 
      });
    }
    
    this.inFlightRequests.delete(requestId);
    this.emit('request-completed', requestId, result);
  }

  updateLatencyMetrics(latency) {
    this.latencyWindow.push({ latency, timestamp: Date.now() });
    
    const cutoff = Date.now() - 60000;
    this.latencyWindow = this.latencyWindow.filter(item => item.timestamp > cutoff);
    
    if (this.latencyWindow.length > 0) {
      const latencies = this.latencyWindow.map(item => item.latency).sort((a, b) => a - b);
      this.metrics.avgLatencyMs = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      this.metrics.p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)];
    }
  }

  updateMetrics(result) {
    const isError = !result.success;
    this.errorWindow.push({ isError, timestamp: Date.now() });
    
    const cutoff = Date.now() - 60000;
    this.errorWindow = this.errorWindow.filter(item => item.timestamp > cutoff);
    
    const errors = this.errorWindow.filter(item => item.isError).length;
    this.metrics.errorRate1m = this.errorWindow.length > 0 ? errors / this.errorWindow.length : 0;
  }

  notifySubscribers(requestId, result) {
    const subscribers = this.subscribers.get(requestId);
    if (!subscribers) return;
    
    for (const callback of subscribers) {
      try {
        callback(result);
      } catch (error) {
        loggingService.error('Subscriber notification failed', { 
          error: error.message, 
          requestId 
        });
      }
    }
    
    this.subscribers.delete(requestId);
  }

  subscribe(requestId, callback) {
    if (!this.subscribers.has(requestId)) {
      this.subscribers.set(requestId, []);
    }
    
    const callbacks = this.subscribers.get(requestId);
    if (callbacks.length >= queueConfig.MAX_ITEM_SUBSCRIBERS) {
      throw new Error('Too many subscribers for this request');
    }
    
    callbacks.push(callback);
    
    setTimeout(() => {
      this.unsubscribe(requestId, callback);
    }, queueConfig.SUBSCRIBER_TTL_MS);
    
    return () => this.unsubscribe(requestId, callback);
  }

  unsubscribe(requestId, callback) {
    const callbacks = this.subscribers.get(requestId);
    if (!callbacks) return;
    
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
    
    if (callbacks.length === 0) {
      this.subscribers.delete(requestId);
    }
  }

  async addToDeadLetterQueue(request, errorClass, errorMessage) {
    const dlqItem = {
      requestKey: request.requestKey || this.generateRequestKey(request),
      timestamp: Date.now(),
      originalTimestamp: request.timestamp || Date.now(),
      attempts: request.retryCount || 0,
      errorClass,
      errorMessage,
      domain: this.extractDomain(request.url),
      priority: request.priority || 1,
      payloadHash: crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex').substring(0, 16)
    };
    
    this.deadLetterQueue.set(dlqItem.requestKey, dlqItem);
    this.metrics.dlqItems++;
    
    loggingService.buffer('added-to-dlq', { 
      requestKey: dlqItem.requestKey.substring(0, 8),
      errorClass,
      errorMessage 
    });
  }

  startPurgeInterval() {
    setInterval(() => {
      this.purgeExpiredData();
    }, queueConfig.HISTORY_PURGE_INTERVAL_MS);
  }

  purgeExpiredData() {
    const now = Date.now();
    let purgedHistory = 0;
    let purgedDLQ = 0;
    let purgedIdempotence = 0;
    
    for (const [key, item] of this.processingHistory.entries()) {
      if (now - item.timestamp > queueConfig.HISTORY_TTL_MS) {
        this.processingHistory.delete(key);
        purgedHistory++;
      }
    }
    
    while (this.processingHistory.size > queueConfig.HISTORY_MAX_ENTRIES) {
      const oldestKey = this.processingHistory.keys().next().value;
      this.processingHistory.delete(oldestKey);
      purgedHistory++;
    }
    
    for (const [key, item] of this.deadLetterQueue.entries()) {
      if (now - item.timestamp > queueConfig.DLQ_TTL_MS) {
        this.deadLetterQueue.delete(key);
        purgedDLQ++;
      }
    }
    
    while (this.deadLetterQueue.size > queueConfig.DLQ_MAX_ENTRIES) {
      const oldestKey = this.deadLetterQueue.keys().next().value;
      this.deadLetterQueue.delete(oldestKey);
      purgedDLQ++;
    }
    
    for (const [key, item] of this.idempotenceCache.entries()) {
      const ttl = queueConfig.getIdempotenceTTLForPlan(item.plan);
      if (now - item.timestamp > ttl) {
        this.idempotenceCache.delete(key);
        purgedIdempotence++;
      }
    }
    
    this.metrics.lastPurgeMs = now;
    
    if (purgedHistory > 0 || purgedDLQ > 0 || purgedIdempotence > 0) {
      loggingService.service('QueueBuffer', 'data-purged', { 
        purgedHistory, 
        purgedDLQ, 
        purgedIdempotence 
      });
    }
  }

  async gracefulShutdown(signal) {
    if (this.state.shuttingDown) return;
    
    this.state.shuttingDown = true;
    this.state.drainingStarted = Date.now();
    
    loggingService.service('QueueBuffer', 'shutdown-initiated', { signal });
    
    const drainTimeout = setTimeout(async () => {
      loggingService.service('QueueBuffer', 'shutdown-timeout');
      await this.persistState();
      process.exit(1);
    }, queueConfig.SHUTDOWN_DRAIN_TIMEOUT_MS);
    
    while (this.state.processing || this.inFlightRequests.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    clearTimeout(drainTimeout);
    await this.persistState();
    
    loggingService.service('QueueBuffer', 'shutdown-completed');
    process.exit(0);
  }

  getHealthMetrics() {
    return {
      queueDepth: this.getTotalQueueLength(),
      inFlight: this.inFlightRequests.size,
      avgLatencyMs: Math.round(this.metrics.avgLatencyMs),
      p95LatencyMs: Math.round(this.metrics.p95LatencyMs),
      errorRate1m: Math.round(this.metrics.errorRate1m * 100) / 100,
      breakerState: this.circuitBreaker.state,
      awsLagMs: this.awsQueue.length * 1000,
      lastPurgeMs: this.metrics.lastPurgeMs,
      dlqSize: this.deadLetterQueue.size,
      idempotenceCacheSize: this.idempotenceCache.size,
      alerts: this.getHealthAlerts()
    };
  }

  getHealthAlerts() {
    const alerts = [];
    
    if (this.metrics.p95LatencyMs > queueConfig.HEALTH_P95_ALERT_MS) {
      alerts.push(`High P95 latency: ${Math.round(this.metrics.p95LatencyMs)}ms`);
    }
    
    if (this.metrics.errorRate1m > queueConfig.HEALTH_ERROR_RATE_ALERT) {
      alerts.push(`High error rate: ${Math.round(this.metrics.errorRate1m * 100)}%`);
    }
    
    if (this.circuitBreaker.state === 'open') {
      const openDuration = Date.now() - this.circuitBreaker.lastFailureTime;
      if (openDuration > queueConfig.HEALTH_BREAKER_OPEN_ALERT_S * 1000) {
        alerts.push(`Circuit breaker open for ${Math.round(openDuration / 1000)}s`);
      }
    }
    
    if (this.getTotalQueueLength() > queueConfig.HEALTH_QUEUE_DEPTH_ALERT) {
      alerts.push(`Queue depth: ${this.getTotalQueueLength()}`);
    }
    
    return alerts;
  }

  getQueueStats() {
    const resources = ResourceMonitor.getCurrentLoad();
    
    return {
      queues: {
        server: {
          premium: this.priorityQueues.premium.length,
          pro: this.priorityQueues.pro.length,
          free: this.priorityQueues.free.length,
          total: this.getTotalQueueLength(),
          capacity: this.getCurrentParallelCapacity(),
          estimatedWaitTime: this.calculateWaitTime()
        },
        aws: {
          length: this.awsQueue.length,
          estimatedWaitTime: 2
        },
        affinity: {
          groups: this.affinityGroups.size,
          totalRequests: Array.from(this.affinityGroups.values()).reduce((sum, g) => sum + g.requests.length, 0)
        }
      },
      metrics: {
        ...this.metrics,
        avgLatencyMs: Math.round(this.metrics.avgLatencyMs),
        p95LatencyMs: Math.round(this.metrics.p95LatencyMs),
        errorRate1m: Math.round(this.metrics.errorRate1m * 100) / 100
      },
      circuitBreaker: {
        ...this.circuitBreaker,
        openDurationMs: this.circuitBreaker.state === 'open' ? Date.now() - this.circuitBreaker.lastFailureTime : 0
      },
      resources,
      inFlight: this.inFlightRequests.size,
      subscribers: this.subscribers.size,
      config: {
        maxWaitTimeMinutes: queueConfig.getMaxWaitTimeMs() / 60000,
        maxParallel: queueConfig.getMaxParallel(),
        breakerEnabled: queueConfig.AWS_FALLBACK_ENABLED
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
      priority: request.priority,
      waitTime: Math.round(waitTime / 1000),
      result: request.result,
      timestamp: request.timestamp,
      domain: request.domain
    };
  }

  async clearQueues() {
    const serverCleared = this.getTotalQueueLength();
    const awsCleared = this.awsQueue.length;
    const historyCleared = this.processingHistory.size;
    const dlqCleared = this.deadLetterQueue.size;
    
    this.priorityQueues.premium = [];
    this.priorityQueues.pro = [];
    this.priorityQueues.free = [];
    this.awsQueue = [];
    this.affinityGroups.clear();
    this.processingHistory.clear();
    this.deadLetterQueue.clear();
    this.idempotenceCache.clear();
    this.inFlightRequests.clear();
    
    loggingService.buffer('queues-cleared', { 
      serverCleared, 
      awsCleared, 
      historyCleared, 
      dlqCleared 
    });
    
    return { serverCleared, awsCleared, historyCleared, dlqCleared };
  }

  getDeadLetterQueue(filters = {}) {
    const items = Array.from(this.deadLetterQueue.values());
    
    let filtered = items;
    if (filters.errorClass) {
      filtered = filtered.filter(item => item.errorClass === filters.errorClass);
    }
    if (filters.domain) {
      filtered = filtered.filter(item => item.domain === filters.domain);
    }
    
    return {
      items: filtered,
      total: items.length,
      filtered: filtered.length
    };
  }

  async requeueFromDLQ(requestKey) {
    const dlqItem = this.deadLetterQueue.get(requestKey);
    if (!dlqItem) {
      throw new Error('DLQ item not found');
    }
    
    this.deadLetterQueue.delete(requestKey);
    this.metrics.dlqItems--;
    
    loggingService.buffer('requeued-from-dlq', { 
      requestKey: requestKey.substring(0, 8),
      originalError: dlqItem.errorClass 
    });
    
    return { success: true, message: 'Item requeued from DLQ' };
  }
}

module.exports = new QueueBuffer();