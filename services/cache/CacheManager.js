const MemoryCache = require('./MemoryCache');
const FileCache = require('./FileCache');
const CacheStats = require('./CacheStats');
const EvictionPolicy = require('./EvictionPolicy');
const CacheWarmer = require('./CacheWarmer');
const config = require('../../config');

class CacheManager {
  constructor(options = {}) {
    this.config = {
      ...require('../../config/cache'),
      ...options
    };
    
    this.l1Cache = new MemoryCache({
      maxSizeMB: this.config.LEVELS.L1.maxSizeMB,
      evictionPolicy: this.config.LEVELS.L1.evictionPolicy,
      ttl: this.config.MEMORY_CACHE.DEFAULT_TTL_MS
    });
    
    this.l2Cache = new FileCache({
      basePath: this.config.CACHE_DIR || './cache',
      maxSizeMB: this.config.LEVELS.L2.maxSizeMB,
      compression: this.config.LEVELS.L2.compression,
      namespace: this.config.NAMESPACES.DEFAULT
    });
    
    this.stats = new CacheStats();
    this.warmer = new CacheWarmer(this);
    this.evictionPolicy = new EvictionPolicy();
    
    this.namespaces = new Map();
    this.initialized = false;
    
    this.setupCleanupScheduler();
  }

  async init() {
    if (this.initialized) return;
    
    config.smartLog('cache', 'Initializing unified cache manager');
    
    await this.l2Cache.init();
    await this.l1Cache.init();
    
    this.stats.init();
    
    await this.warmer.warmupCriticalData();
    
    this.initialized = true;
    config.smartLog('cache', `Cache manager initialized - L1: ${this.l1Cache.getStats().maxSizeMB}MB, L2: ${this.l2Cache.getStats().maxSizeMB}MB`);
  }

  async get(key, options = {}) {
    const {
      namespace = this.config.NAMESPACES.DEFAULT,
      allowStale = false,
      skipL1 = false,
      skipL2 = false
    } = options;
    
    const fullKey = this.buildKey(key, namespace);
    const startTime = Date.now();
    
    try {
      if (!skipL1) {
        const l1Result = await this.l1Cache.get(fullKey);
        if (l1Result !== null) {
          this.stats.recordHit('L1', fullKey, Date.now() - startTime);
          config.smartLog('cache', `L1 HIT: ${fullKey}`);
          return this.unwrapValue(l1Result);
        }
      }
      
      if (!skipL2) {
        const l2Result = await this.l2Cache.get(fullKey, { allowStale });
        if (l2Result !== null) {
          this.stats.recordHit('L2', fullKey, Date.now() - startTime);
          
          const unwrapped = this.unwrapValue(l2Result);
          
          if (!skipL1 && this.shouldPromoteToL1(unwrapped, options)) {
            await this.l1Cache.set(fullKey, l2Result, this.config.MEMORY_CACHE.DEFAULT_TTL_MS);
            config.smartLog('cache', `Promoted to L1: ${fullKey}`);
          }
          
          config.smartLog('cache', `L2 HIT: ${fullKey}`);
          return unwrapped;
        }
      }
      
      this.stats.recordMiss(fullKey, Date.now() - startTime);
      config.smartLog('cache', `MISS: ${fullKey}`);
      return null;
      
    } catch (error) {
      this.stats.recordError('get', fullKey, error);
      config.smartLog('fail', `Cache get error for ${fullKey}: ${error.message}`);
      return null;
    }
  }

  async set(key, value, ttl = null, options = {}) {
    const {
      namespace = this.config.NAMESPACES.DEFAULT,
      priority = 5,
      skipL1 = false,
      skipL2 = false,
      compression = null
    } = options;
    
    const fullKey = this.buildKey(key, namespace);
    const startTime = Date.now();
    const effectiveTtl = ttl || this.config.TTL.SECONDS * 1000;
    
    try {
      const wrappedValue = this.wrapValue(value, priority, effectiveTtl);
      
      if (!skipL2) {
        await this.l2Cache.set(fullKey, wrappedValue, effectiveTtl, { compression });
      }
      
      if (!skipL1 && this.shouldStoreInL1(wrappedValue, options)) {
        const l1Ttl = Math.min(effectiveTtl, this.config.MEMORY_CACHE.DEFAULT_TTL_MS);
        await this.l1Cache.set(fullKey, wrappedValue, l1Ttl);
      }
      
      this.stats.recordSet(fullKey, this.getValueSize(wrappedValue), Date.now() - startTime);
      config.smartLog('cache', `SET: ${fullKey} (TTL: ${effectiveTtl}ms, Priority: ${priority})`);
      
      return true;
      
    } catch (error) {
      this.stats.recordError('set', fullKey, error);
      config.smartLog('fail', `Cache set error for ${fullKey}: ${error.message}`);
      return false;
    }
  }

  async delete(key, options = {}) {
    const {
      namespace = this.config.NAMESPACES.DEFAULT
    } = options;
    
    const fullKey = this.buildKey(key, namespace);
    
    try {
      await Promise.all([
        this.l1Cache.delete(fullKey),
        this.l2Cache.delete(fullKey)
      ]);
      
      this.stats.recordDelete(fullKey);
      config.smartLog('cache', `DELETE: ${fullKey}`);
      return true;
      
    } catch (error) {
      this.stats.recordError('delete', fullKey, error);
      config.smartLog('fail', `Cache delete error for ${fullKey}: ${error.message}`);
      return false;
    }
  }

  async exists(key, options = {}) {
    const {
      namespace = this.config.NAMESPACES.DEFAULT
    } = options;
    
    const fullKey = this.buildKey(key, namespace);
    
    try {
      const l1Exists = await this.l1Cache.exists(fullKey);
      if (l1Exists) return true;
      
      const l2Exists = await this.l2Cache.exists(fullKey);
      return l2Exists;
      
    } catch (error) {
      config.smartLog('fail', `Cache exists error for ${fullKey}: ${error.message}`);
      return false;
    }
  }

  async clear(pattern = null, options = {}) {
    const {
      namespace = this.config.NAMESPACES.DEFAULT,
      clearL1 = true,
      clearL2 = true
    } = options;
    
    try {
      const promises = [];
      
      if (clearL1) {
        promises.push(this.l1Cache.clear(pattern, namespace));
      }
      
      if (clearL2) {
        promises.push(this.l2Cache.clear(pattern, namespace));
      }
      
      await Promise.all(promises);
      
      this.stats.recordClear(namespace, pattern);
      config.smartLog('cache', `CLEAR: namespace=${namespace}, pattern=${pattern || 'all'}`);
      
      return true;
      
    } catch (error) {
      config.smartLog('fail', `Cache clear error: ${error.message}`);
      return false;
    }
  }

  async getMultiple(keys, options = {}) {
    const {
      namespace = this.config.NAMESPACES.DEFAULT
    } = options;
    
    const results = new Map();
    const l2Keys = [];
    
    for (const key of keys) {
      const fullKey = this.buildKey(key, namespace);
      const l1Result = await this.l1Cache.get(fullKey);
      
      if (l1Result !== null) {
        results.set(key, this.unwrapValue(l1Result));
        this.stats.recordHit('L1', fullKey, 0);
      } else {
        l2Keys.push({ key, fullKey });
      }
    }
    
    if (l2Keys.length > 0) {
      const l2Results = await this.l2Cache.getMultiple(
        l2Keys.map(k => k.fullKey), 
        options
      );
      
      for (const { key, fullKey } of l2Keys) {
        const l2Result = l2Results.get(fullKey);
        if (l2Result !== null) {
          const unwrapped = this.unwrapValue(l2Result);
          results.set(key, unwrapped);
          this.stats.recordHit('L2', fullKey, 0);
          
          if (this.shouldPromoteToL1(unwrapped, options)) {
            await this.l1Cache.set(fullKey, l2Result, this.config.MEMORY_CACHE.DEFAULT_TTL_MS);
          }
        } else {
          this.stats.recordMiss(fullKey, 0);
        }
      }
    }
    
    return results;
  }

  async setMultiple(entries, options = {}) {
    const {
      namespace = this.config.NAMESPACES.DEFAULT,
      ttl = null
    } = options;
    
    const l1Entries = new Map();
    const l2Entries = new Map();
    
    for (const [key, value] of entries) {
      const fullKey = this.buildKey(key, namespace);
      const effectiveTtl = ttl || this.config.TTL.SECONDS * 1000;
      const wrappedValue = this.wrapValue(value, 5, effectiveTtl);
      
      l2Entries.set(fullKey, wrappedValue);
      
      if (this.shouldStoreInL1(wrappedValue, options)) {
        l1Entries.set(fullKey, wrappedValue);
      }
    }
    
    await Promise.all([
      l1Entries.size > 0 ? this.l1Cache.setMultiple(l1Entries, options) : Promise.resolve(),
      l2Entries.size > 0 ? this.l2Cache.setMultiple(l2Entries, options) : Promise.resolve()
    ]);
    
    config.smartLog('cache', `SET_MULTIPLE: ${entries.size} entries in namespace ${namespace}`);
    return true;
  }

  async evictByPolicy(policy = 'lru', options = {}) {
    const {
      percentage = 20,
      namespace = null
    } = options;
    
    try {
      const l1Evicted = await this.evictionPolicy.apply(this.l1Cache, policy, percentage, namespace);
      const l2Evicted = await this.evictionPolicy.apply(this.l2Cache, policy, percentage, namespace);
      
      this.stats.recordEviction(policy, l1Evicted + l2Evicted);
      config.smartLog('cache', `EVICTION: ${policy} evicted ${l1Evicted + l2Evicted} entries`);
      
      return l1Evicted + l2Evicted;
      
    } catch (error) {
      config.smartLog('fail', `Eviction error: ${error.message}`);
      return 0;
    }
  }

  async getStats() {
    const l1Stats = await this.l1Cache.getStats();
    const l2Stats = await this.l2Cache.getStats();
    const globalStats = this.stats.getMetrics();
    
    return {
      unified: {
        hitRatio: this.calculateGlobalHitRatio(globalStats),
        totalRequests: globalStats.hits + globalStats.misses,
        totalHits: globalStats.hits,
        totalMisses: globalStats.misses,
        avgResponseTime: globalStats.avgResponseTime,
        memoryUsage: l1Stats.usedSizeMB,
        diskUsage: l2Stats.usedSizeMB,
        totalSizeMB: l1Stats.usedSizeMB + l2Stats.usedSizeMB,
        maxSizeMB: l1Stats.maxSizeMB + l2Stats.maxSizeMB
      },
      l1: l1Stats,
      l2: l2Stats,
      global: globalStats,
      eviction: this.stats.getEvictionStats(),
      health: this.calculateHealthScore(l1Stats, l2Stats, globalStats)
    };
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      checks: {
        l1Cache: false,
        l2Cache: false,
        eviction: false,
        hitRatio: false
      },
      metrics: {}
    };
    
    try {
      health.checks.l1Cache = await this.l1Cache.healthCheck();
      health.checks.l2Cache = await this.l2Cache.healthCheck();
      
      const stats = await this.getStats();
      health.metrics = stats.unified;
      
      health.checks.hitRatio = stats.unified.hitRatio >= this.config.MONITORING.ALERT_THRESHOLDS.hitRatio;
      health.checks.eviction = stats.unified.totalSizeMB / stats.unified.maxSizeMB <= this.config.MONITORING.ALERT_THRESHOLDS.memoryUsage;
      
      const healthyChecks = Object.values(health.checks).filter(Boolean).length;
      const totalChecks = Object.keys(health.checks).length;
      
      if (healthyChecks === totalChecks) {
        health.status = 'healthy';
      } else if (healthyChecks >= totalChecks * 0.75) {
        health.status = 'degraded';
      } else {
        health.status = 'unhealthy';
      }
      
      return health;
      
    } catch (error) {
      health.status = 'error';
      health.error = error.message;
      return health;
    }
  }

  buildKey(key, namespace) {
    return `${namespace}:${key}`;
  }

  wrapValue(value, priority, ttl) {
    return {
      value,
      metadata: {
        priority,
        createdAt: Date.now(),
        ttl,
        size: this.getValueSize(value),
        accessCount: 0,
        lastAccessed: Date.now()
      }
    };
  }

  unwrapValue(wrappedValue) {
    if (wrappedValue && wrappedValue.metadata) {
      wrappedValue.metadata.accessCount++;
      wrappedValue.metadata.lastAccessed = Date.now();
      return wrappedValue.value;
    }
    return wrappedValue;
  }

  shouldPromoteToL1(value, options) {
    if (options.priority >= 8) return true;
    if (this.getValueSize(value) > 100000) return false;
    return true;
  }

  shouldStoreInL1(wrappedValue, options) {
    if (options.priority >= 8) return true;
    if (wrappedValue.metadata.size > 100000) return false;
    return true;
  }

  getValueSize(value) {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1000;
    }
  }

  calculateGlobalHitRatio(stats) {
    const total = stats.hits + stats.misses;
    return total > 0 ? Math.round((stats.hits / total) * 100) : 0;
  }

  calculateHealthScore(l1Stats, l2Stats, globalStats) {
    let score = 100;
    
    if (globalStats.hitRatio < 80) score -= 20;
    if (l1Stats.usedSizeMB / l1Stats.maxSizeMB > 0.9) score -= 10;
    if (l2Stats.usedSizeMB / l2Stats.maxSizeMB > 0.9) score -= 10;
    if (globalStats.avgResponseTime > 100) score -= 15;
    if (globalStats.errors > 10) score -= 25;
    
    return Math.max(score, 0);
  }

  setupCleanupScheduler() {
    setInterval(async () => {
      try {
        const evicted = await this.evictByPolicy('lru', { percentage: 10 });
        if (evicted > 0) {
          config.smartLog('cache', `Scheduled cleanup evicted ${evicted} entries`);
        }
      } catch (error) {
        config.smartLog('fail', `Scheduled cleanup error: ${error.message}`);
      }
    }, this.config.EVICTION.CHECK_INTERVAL_MS);
  }

  getNamespace(name) {
    if (!this.namespaces.has(name)) {
      this.namespaces.set(name, new CacheNamespace(this, name));
    }
    return this.namespaces.get(name);
  }
}

class CacheNamespace {
  constructor(cacheManager, namespace) {
    this.cacheManager = cacheManager;
    this.namespace = namespace;
  }

  async get(key, options = {}) {
    return this.cacheManager.get(key, { ...options, namespace: this.namespace });
  }

  async set(key, value, ttl, options = {}) {
    return this.cacheManager.set(key, value, ttl, { ...options, namespace: this.namespace });
  }

  async delete(key, options = {}) {
    return this.cacheManager.delete(key, { ...options, namespace: this.namespace });
  }

  async exists(key, options = {}) {
    return this.cacheManager.exists(key, { ...options, namespace: this.namespace });
  }

  async clear(pattern = null, options = {}) {
    return this.cacheManager.clear(pattern, { ...options, namespace: this.namespace });
  }
}

module.exports = CacheManager;