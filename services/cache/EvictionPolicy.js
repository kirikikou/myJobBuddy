const config = require('../../config');
class EvictionPolicy {
  constructor() {
    this.policies = {
      lru: this.applyLRU.bind(this),
      lfu: this.applyLFU.bind(this),
      priority: this.applyPriority.bind(this),
      hybrid: this.applyHybrid.bind(this),
      size: this.applySize.bind(this),
      ttl: this.applyTTL.bind(this),
      adaptive: this.applyAdaptive.bind(this)
    };
    
    this.weights = {
      recency: 0.3,
      frequency: 0.25,
      priority: 0.25,
      size: 0.1,
      age: 0.1
    };
    
    this.adaptiveThresholds = {
      hitRatioLow: 70,
      hitRatioHigh: 85,
      memoryUsageHigh: 85
    };
  }

  async apply(cache, policy, percentage = 20, namespace = null) {
    if (!this.policies[policy]) {
      config.smartLog('fail', `Unknown eviction policy: ${policy}`);
      return 0;
    }
    
    const startTime = Date.now();
    const evictedCount = await this.policies[policy](cache, percentage, namespace);
    const evictionTime = Date.now() - startTime;
    
    config.smartLog('cache', 
      `Eviction completed: ${policy} policy removed ${evictedCount} entries in ${evictionTime}ms`
    );
    
    return evictedCount;
  }

  async applyLRU(cache, percentage, namespace) {
    const candidates = await this.getCandidates(cache, namespace);
    if (candidates.length === 0) return 0;
    
    const sortedCandidates = candidates.sort((a, b) => {
      const aAccess = this.getLastAccess(a, cache);
      const bAccess = this.getLastAccess(b, cache);
      return aAccess - bAccess;
    });
    
    return await this.evictCandidates(cache, sortedCandidates, percentage);
  }

  async applyLFU(cache, percentage, namespace) {
    const candidates = await this.getCandidates(cache, namespace);
    if (candidates.length === 0) return 0;
    
    const sortedCandidates = candidates.sort((a, b) => {
      const aFreq = this.getAccessFrequency(a, cache);
      const bFreq = this.getAccessFrequency(b, cache);
      return aFreq - bFreq;
    });
    
    return await this.evictCandidates(cache, sortedCandidates, percentage);
  }

  async applyPriority(cache, percentage, namespace) {
    const candidates = await this.getCandidates(cache, namespace);
    if (candidates.length === 0) return 0;
    
    const sortedCandidates = candidates.sort((a, b) => {
      const aPriority = this.getPriority(a, cache);
      const bPriority = this.getPriority(b, cache);
      return aPriority - bPriority;
    });
    
    return await this.evictCandidates(cache, sortedCandidates, percentage);
  }

  async applyHybrid(cache, percentage, namespace) {
    const candidates = await this.getCandidates(cache, namespace);
    if (candidates.length === 0) return 0;
    
    const scoredCandidates = candidates.map(key => ({
      key,
      score: this.calculateHybridScore(key, cache)
    }));
    
    const sortedCandidates = scoredCandidates
      .sort((a, b) => a.score - b.score)
      .map(item => item.key);
    
    return await this.evictCandidates(cache, sortedCandidates, percentage);
  }

  async applySize(cache, percentage, namespace) {
    const candidates = await this.getCandidates(cache, namespace);
    if (candidates.length === 0) return 0;
    
    const sortedCandidates = candidates.sort((a, b) => {
      const aSize = this.getEntrySize(a, cache);
      const bSize = this.getEntrySize(b, cache);
      return bSize - aSize;
    });
    
    return await this.evictCandidates(cache, sortedCandidates, percentage);
  }

  async applyTTL(cache, percentage, namespace) {
    const candidates = await this.getCandidates(cache, namespace);
    if (candidates.length === 0) return 0;
    
    const expiredCandidates = [];
    const soonToExpireCandidates = [];
    const now = Date.now();
    
    for (const key of candidates) {
      const ttl = this.getTTL(key, cache);
      if (ttl && ttl <= now) {
        expiredCandidates.push(key);
      } else if (ttl && ttl - now < 300000) {
        soonToExpireCandidates.push(key);
      }
    }
    
    const prioritizedCandidates = [
      ...expiredCandidates,
      ...soonToExpireCandidates.sort((a, b) => {
        const aTtl = this.getTTL(a, cache);
        const bTtl = this.getTTL(b, cache);
        return aTtl - bTtl;
      })
    ];
    
    return await this.evictCandidates(cache, prioritizedCandidates, percentage);
  }

  async applyAdaptive(cache, percentage, namespace) {
    const cacheStats = await cache.getStats();
    const hitRatio = cacheStats.hitRatio || 0;
    const usagePercent = cacheStats.usagePercent || 0;
    
    let selectedPolicy = 'hybrid';
    let adjustedPercentage = percentage;
    
    if (hitRatio < this.adaptiveThresholds.hitRatioLow) {
      selectedPolicy = 'lfu';
      adjustedPercentage = Math.min(percentage * 1.5, 40);
      config.smartLog('cache', `Adaptive eviction: Low hit ratio (${hitRatio}%), using LFU with ${adjustedPercentage}%`);
    } else if (hitRatio > this.adaptiveThresholds.hitRatioHigh) {
      selectedPolicy = 'lru';
      adjustedPercentage = Math.max(percentage * 0.7, 10);
      config.smartLog('cache', `Adaptive eviction: High hit ratio (${hitRatio}%), using LRU with ${adjustedPercentage}%`);
    } else if (usagePercent > this.adaptiveThresholds.memoryUsageHigh) {
      selectedPolicy = 'size';
      adjustedPercentage = Math.min(percentage * 1.3, 35);
      config.smartLog('cache', `Adaptive eviction: High memory usage (${usagePercent}%), using size-based with ${adjustedPercentage}%`);
    }
    
    return await this.apply(cache, selectedPolicy, adjustedPercentage, namespace);
  }

  calculateHybridScore(key, cache) {
    const lastAccess = this.getLastAccess(key, cache);
    const frequency = this.getAccessFrequency(key, cache);
    const priority = this.getPriority(key, cache);
    const size = this.getEntrySize(key, cache);
    const age = this.getAge(key, cache);
    
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    const maxSize = 1024 * 1024;
    
    const recencyScore = Math.max(0, 100 - ((now - lastAccess) / 60000));
    const frequencyScore = Math.min(100, Math.log(frequency + 1) * 20);
    const priorityScore = priority * 10;
    const sizeScore = Math.max(0, 100 - ((size / maxSize) * 100));
    const ageScore = Math.max(0, 100 - ((age / maxAge) * 100));
    
    const hybridScore = 
      (recencyScore * this.weights.recency) +
      (frequencyScore * this.weights.frequency) +
      (priorityScore * this.weights.priority) +
      (sizeScore * this.weights.size) +
      (ageScore * this.weights.age);
    
    return Math.round(hybridScore);
  }

  async getCandidates(cache, namespace) {
    const candidates = [];
    
    if (cache.cache && cache.cache instanceof Map) {
      for (const key of cache.cache.keys()) {
        if (!namespace || key.startsWith(`${namespace}:`)) {
          candidates.push(key);
        }
      }
    } else if (cache.index && cache.index instanceof Map) {
      for (const key of cache.index.keys()) {
        if (!namespace || key.startsWith(`${namespace}:`)) {
          candidates.push(key);
        }
      }
    }
    
    return candidates;
  }

  async evictCandidates(cache, candidates, percentage) {
    const totalCandidates = candidates.length;
    const targetCount = Math.ceil(totalCandidates * (percentage / 100));
    const toEvict = candidates.slice(0, Math.min(targetCount, totalCandidates));
    
    let evictedCount = 0;
    
    for (const key of toEvict) {
      try {
        const success = await cache.delete(key);
        if (success) {
          evictedCount++;
        }
      } catch (error) {
        config.smartLog('fail', `Eviction error for key ${key}: ${error.message}`);
      }
    }
    
    return evictedCount;
  }

  getLastAccess(key, cache) {
    if (cache.accessOrder && cache.accessOrder.has(key)) {
      return cache.accessOrder.get(key);
    }
    
    if (cache.index && cache.index.has(key)) {
      const metadata = cache.index.get(key);
      return metadata.lastAccessed || metadata.createdAt || 0;
    }
    
    return 0;
  }

  getAccessFrequency(key, cache) {
    if (cache.accessCount && cache.accessCount.has(key)) {
      return cache.accessCount.get(key);
    }
    
    if (cache.index && cache.index.has(key)) {
      const metadata = cache.index.get(key);
      return metadata.accessCount || 1;
    }
    
    return 1;
  }

  getPriority(key, cache) {
    if (cache.priorities && cache.priorities.has(key)) {
      return cache.priorities.get(key);
    }
    
    if (cache.cache && cache.cache.has(key)) {
      const entry = cache.cache.get(key);
      if (entry && entry.metadata) {
        return entry.metadata.priority || 5;
      }
    }
    
    if (cache.index && cache.index.has(key)) {
      const metadata = cache.index.get(key);
      return metadata.priority || 5;
    }
    
    return 5;
  }

  getEntrySize(key, cache) {
    if (cache.sizes && cache.sizes.has(key)) {
      return cache.sizes.get(key);
    }
    
    if (cache.index && cache.index.has(key)) {
      const metadata = cache.index.get(key);
      return metadata.size || metadata.originalSize || 1000;
    }
    
    if (cache.cache && cache.cache.has(key)) {
      try {
        const entry = cache.cache.get(key);
        return JSON.stringify(entry).length;
      } catch {
        return 1000;
      }
    }
    
    return 1000;
  }

  getAge(key, cache) {
    const now = Date.now();
    
    if (cache.index && cache.index.has(key)) {
      const metadata = cache.index.get(key);
      return now - (metadata.createdAt || now);
    }
    
    if (cache.cache && cache.cache.has(key)) {
      const entry = cache.cache.get(key);
      if (entry && entry.metadata) {
        return now - (entry.metadata.createdAt || now);
      }
    }
    
    return 0;
  }

  getTTL(key, cache) {
    if (cache.ttls && cache.ttls.has(key)) {
      return cache.ttls.get(key);
    }
    
    if (cache.index && cache.index.has(key)) {
      const metadata = cache.index.get(key);
      return metadata.ttl;
    }
    
    if (cache.cache && cache.cache.has(key)) {
      const entry = cache.cache.get(key);
      if (entry && entry.metadata) {
        const createdAt = entry.metadata.createdAt || Date.now();
        const ttl = entry.metadata.ttl || 3600000;
        return createdAt + ttl;
      }
    }
    
    return null;
  }

  updateWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
    
    const total = Object.values(this.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1.0) > 0.01) {
      config.smartLog('cache', `Warning: Eviction weights sum to ${total}, expected 1.0`);
    }
    
    config.smartLog('cache', `Eviction weights updated: ${JSON.stringify(this.weights)}`);
  }

  updateAdaptiveThresholds(newThresholds) {
    this.adaptiveThresholds = { ...this.adaptiveThresholds, ...newThresholds };
    config.smartLog('cache', `Adaptive thresholds updated: ${JSON.stringify(this.adaptiveThresholds)}`);
  }

  async analyzeEvictionEffectiveness(cache, policy, namespace = null) {
    const beforeStats = await cache.getStats();
    const beforeEntries = beforeStats.entries || 0;
    const beforeHitRatio = beforeStats.hitRatio || 0;
    
    const evicted = await this.apply(cache, policy, 20, namespace);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const afterStats = await cache.getStats();
    const afterEntries = afterStats.entries || 0;
    const afterHitRatio = afterStats.hitRatio || 0;
    
    const effectiveness = {
      policy,
      evictedCount: evicted,
      entriesReduction: beforeEntries - afterEntries,
      hitRatioChange: afterHitRatio - beforeHitRatio,
      memoryFreed: beforeStats.usedSizeMB - afterStats.usedSizeMB,
      efficiency: evicted > 0 ? (beforeStats.usedSizeMB - afterStats.usedSizeMB) / evicted : 0
    };
    
    config.smartLog('cache', 
      `Eviction analysis: ${policy} policy - ` +
      `${effectiveness.evictedCount} evicted, ` +
      `${effectiveness.memoryFreed.toFixed(2)}MB freed, ` +
      `hit ratio: ${beforeHitRatio}% → ${afterHitRatio}%`
    );
    
    return effectiveness;
  }

  async benchmarkPolicies(cache, namespace = null) {
    const policies = ['lru', 'lfu', 'priority', 'hybrid', 'size'];
    const results = [];
    
    config.smartLog('cache', 'Starting eviction policy benchmark');
    
    for (const policy of policies) {
      try {
        const effectiveness = await this.analyzeEvictionEffectiveness(cache, policy, namespace);
        results.push(effectiveness);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        config.smartLog('fail', `Benchmark failed for ${policy}: ${error.message}`);
      }
    }
    
    const bestPolicy = results.reduce((best, current) => {
      const bestScore = this.calculatePolicyScore(best);
      const currentScore = this.calculatePolicyScore(current);
      return currentScore > bestScore ? current : best;
    }, results[0]);
    
    config.smartLog('cache', 
      `Benchmark completed. Best policy: ${bestPolicy?.policy} ` +
      `(score: ${this.calculatePolicyScore(bestPolicy)})`
    );
    
    return {
      results,
      bestPolicy: bestPolicy?.policy,
      recommendations: this.generatePolicyRecommendations(results)
    };
  }

  calculatePolicyScore(effectiveness) {
    if (!effectiveness) return 0;
    
    const memoryScore = Math.max(0, effectiveness.memoryFreed * 10);
    const hitRatioScore = Math.max(0, effectiveness.hitRatioChange * 5);
    const efficiencyScore = Math.max(0, effectiveness.efficiency * 20);
    
    return memoryScore + hitRatioScore + efficiencyScore;
  }

  generatePolicyRecommendations(results) {
    const recommendations = [];
    
    const highMemoryUsage = results.some(r => r.memoryFreed > 50);
    const lowHitRatio = results.some(r => r.hitRatioChange < -5);
    const highEfficiency = results.filter(r => r.efficiency > 1).length;
    
    if (highMemoryUsage) {
      recommendations.push('Consider more aggressive eviction with size-based policy');
    }
    
    if (lowHitRatio) {
      recommendations.push('Hit ratio degradation detected - consider hybrid or priority-based eviction');
    }
    
    if (highEfficiency > 2) {
      recommendations.push('Multiple efficient policies available - adaptive eviction recommended');
    }
    
    recommendations.push('Regular benchmarking recommended to adapt to changing access patterns');
    
    return recommendations;
  }

  getAvailablePolicies() {
    return Object.keys(this.policies);
  }

  getPolicyInfo(policy) {
    const descriptions = {
      lru: 'Least Recently Used - Evicts entries accessed longest ago',
      lfu: 'Least Frequently Used - Evicts entries with lowest access frequency',
      priority: 'Priority-based - Evicts entries with lowest priority first',
      hybrid: 'Hybrid scoring - Combines recency, frequency, priority, size, and age',
      size: 'Size-based - Evicts largest entries first',
      ttl: 'TTL-based - Evicts expired and soon-to-expire entries first',
      adaptive: 'Adaptive - Dynamically selects best policy based on cache performance'
    };
    
    return {
      name: policy,
      description: descriptions[policy] || 'Unknown policy',
      available: this.policies.hasOwnProperty(policy),
      weights: policy === 'hybrid' ? this.weights : null,
      thresholds: policy === 'adaptive' ? this.adaptiveThresholds : null
    };
  }
}

module.exports = EvictionPolicy;