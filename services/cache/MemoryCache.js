const config = require('../../config');
class MemoryCache {
  constructor(options = {}) {
    this.maxSizeMB = options.maxSizeMB || 100;
    this.maxSizeBytes = this.maxSizeMB * 1024 * 1024;
    this.evictionPolicy = options.evictionPolicy || 'lru';
    this.defaultTtl = options.ttl || 30000;
    
    this.cache = new Map();
    this.accessOrder = new Map();
    this.accessCount = new Map();
    this.priorities = new Map();
    this.sizes = new Map();
    this.ttls = new Map();
    
    this.currentSizeBytes = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
    this.setCount = 0;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  async init() {
    config.smartLog('cache', `Memory cache initialized: ${this.maxSizeMB}MB, policy: ${this.evictionPolicy}`);
  }

  async get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.missCount++;
      return null;
    }
    
    if (this.isExpired(key)) {
      this.delete(key);
      this.missCount++;
      return null;
    }
    
    this.updateAccessMetrics(key);
    this.hitCount++;
    
    return entry;
  }

  async set(key, value, ttl = null) {
    const effectiveTtl = ttl || this.defaultTtl;
    const size = this.calculateSize(value);
    const priority = value.metadata?.priority || 5;
    
    if (size > this.maxSizeBytes) {
      config.smartLog('cache', `Value too large for memory cache: ${key} (${Math.round(size/1024)}KB)`);
      return false;
    }
    
    const existingSize = this.sizes.get(key) || 0;
    const newTotalSize = this.currentSizeBytes - existingSize + size;
    
    if (newTotalSize > this.maxSizeBytes) {
      const bytesToEvict = newTotalSize - (this.maxSizeBytes * 0.8);
      await this.evictBytes(bytesToEvict);
    }
    
    if (this.cache.has(key)) {
      this.currentSizeBytes -= this.sizes.get(key);
    }
    
    this.cache.set(key, value);
    this.sizes.set(key, size);
    this.ttls.set(key, Date.now() + effectiveTtl);
    this.priorities.set(key, priority);
    this.updateAccessMetrics(key);
    
    this.currentSizeBytes += size;
    this.setCount++;
    
    return true;
  }

  async delete(key) {
    if (!this.cache.has(key)) return false;
    
    const size = this.sizes.get(key) || 0;
    
    this.cache.delete(key);
    this.sizes.delete(key);
    this.ttls.delete(key);
    this.priorities.delete(key);
    this.accessOrder.delete(key);
    this.accessCount.delete(key);
    
    this.currentSizeBytes -= size;
    
    return true;
  }

  async exists(key) {
    if (!this.cache.has(key)) return false;
    if (this.isExpired(key)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  async clear(pattern = null, namespace = null) {
    let cleared = 0;
    
    if (!pattern && !namespace) {
      cleared = this.cache.size;
      this.cache.clear();
      this.sizes.clear();
      this.ttls.clear();
      this.priorities.clear();
      this.accessOrder.clear();
      this.accessCount.clear();
      this.currentSizeBytes = 0;
    } else {
      const keysToDelete = [];
      
      for (const key of this.cache.keys()) {
        let shouldDelete = false;
        
        if (namespace && key.startsWith(`${namespace}:`)) {
          shouldDelete = true;
        }
        
        if (pattern && key.includes(pattern)) {
          shouldDelete = true;
        }
        
        if (shouldDelete) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        await this.delete(key);
        cleared++;
      }
    }
    
    config.smartLog('cache', `Memory cache cleared: ${cleared} entries`);
    return cleared;
  }

  async setMultiple(entries, options = {}) {
    let setCount = 0;
    
    for (const [key, value] of entries) {
      const success = await this.set(key, value, options.ttl);
      if (success) setCount++;
    }
    
    return setCount;
  }

  async evictBytes(bytesToEvict) {
    const candidates = this.getEvictionCandidates();
    let evictedBytes = 0;
    let evictedCount = 0;
    
    for (const key of candidates) {
      if (evictedBytes >= bytesToEvict) break;
      
      const size = this.sizes.get(key) || 0;
      await this.delete(key);
      
      evictedBytes += size;
      evictedCount++;
      this.evictionCount++;
    }
    
    config.smartLog('cache', `Memory eviction: ${evictedCount} entries, ${Math.round(evictedBytes/1024)}KB freed`);
    return evictedCount;
  }

  getEvictionCandidates() {
    const entries = Array.from(this.cache.keys());
    
    switch (this.evictionPolicy) {
      case 'lru':
        return this.getLRUCandidates(entries);
      case 'lfu':
        return this.getLFUCandidates(entries);
      case 'priority':
        return this.getPriorityCandidates(entries);
      case 'hybrid':
        return this.getHybridCandidates(entries);
      default:
        return this.getLRUCandidates(entries);
    }
  }

  getLRUCandidates(entries) {
    return entries.sort((a, b) => {
      const aAccess = this.accessOrder.get(a) || 0;
      const bAccess = this.accessOrder.get(b) || 0;
      return aAccess - bAccess;
    });
  }

  getLFUCandidates(entries) {
    return entries.sort((a, b) => {
      const aCount = this.accessCount.get(a) || 0;
      const bCount = this.accessCount.get(b) || 0;
      return aCount - bCount;
    });
  }

  getPriorityCandidates(entries) {
    return entries.sort((a, b) => {
      const aPriority = this.priorities.get(a) || 5;
      const bPriority = this.priorities.get(b) || 5;
      return aPriority - bPriority;
    });
  }

  getHybridCandidates(entries) {
    return entries.sort((a, b) => {
      const aScore = this.calculateHybridScore(a);
      const bScore = this.calculateHybridScore(b);
      return aScore - bScore;
    });
  }

  calculateHybridScore(key) {
    const priority = this.priorities.get(key) || 5;
    const accessCount = this.accessCount.get(key) || 1;
    const lastAccess = this.accessOrder.get(key) || 0;
    const age = Date.now() - lastAccess;
    
    const priorityScore = priority * 20;
    const frequencyScore = Math.log(accessCount + 1) * 10;
    const recencyScore = Math.max(0, 100 - (age / 60000));
    
    return priorityScore + frequencyScore + recencyScore;
  }

  updateAccessMetrics(key) {
    this.accessOrder.set(key, Date.now());
    this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
  }

  isExpired(key) {
    const ttl = this.ttls.get(key);
    return ttl && Date.now() > ttl;
  }

  cleanupExpired() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, ttl] of this.ttls.entries()) {
      if (now > ttl) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      config.smartLog('cache', `Memory cleanup: ${expiredKeys.length} expired entries removed`);
    }
  }

  calculateSize(value) {
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1000;
    }
  }

  async getStats() {
    const totalRequests = this.hitCount + this.missCount;
    const hitRatio = totalRequests > 0 ? (this.hitCount / totalRequests * 100) : 0;
    const usageRatio = (this.currentSizeBytes / this.maxSizeBytes * 100);
    
    return {
      type: 'memory',
      entries: this.cache.size,
      maxSizeMB: this.maxSizeMB,
      usedSizeMB: Math.round(this.currentSizeBytes / (1024 * 1024) * 100) / 100,
      usagePercent: Math.round(usageRatio * 100) / 100,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRatio: Math.round(hitRatio * 100) / 100,
      evictionCount: this.evictionCount,
      setCount: this.setCount,
      evictionPolicy: this.evictionPolicy,
      avgEntrySize: this.cache.size > 0 ? Math.round(this.currentSizeBytes / this.cache.size) : 0
    };
  }

  async healthCheck() {
    const stats = await this.getStats();
    
    return {
      healthy: stats.usagePercent < 95 && stats.hitRatio > 70,
      usagePercent: stats.usagePercent,
      hitRatio: stats.hitRatio,
      entries: stats.entries
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    this.sizes.clear();
    this.ttls.clear();
    this.priorities.clear();
    this.accessOrder.clear();
    this.accessCount.clear();
  }
}

module.exports = MemoryCache;