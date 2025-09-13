const crypto = require('crypto');

class ScoreCache {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.accessTimes = new Map();
    this.computationStats = new Map();
    this.maxCacheSize = this.config.cache?.scoreCache?.maxSize || 5000;
    this.ttl = this.config.cache?.scoreCache?.ttl || 7200000;
    this.cleanupInterval = this.config.cache?.scoreCache?.cleanup || 300000;
    this.hitRate = { hits: 0, misses: 0 };
    
    this.startCleanupTimer();
  }

  generateCacheKey(data, context = {}) {
    const keyData = {
      content: this.normalizeContent(data.content || ''),
      url: data.url || '',
      title: data.title || '',
      jobTitle: context.jobTitle || '',
      keywords: (context.keywords || []).sort().join('|'),
      language: context.language || 'en'
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex')
      .substring(0, 16);
  }

  getRelevanceScore(data, context, calculator) {
    const cacheKey = this.generateCacheKey(data, context);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      this.hitRate.hits++;
      this.accessTimes.set(cacheKey, Date.now());
      
      this.config.smartLog('cache', `Score cache HIT for ${cacheKey}`);
      
      return {
        ...cached.score,
        fromCache: true,
        cacheAge: Date.now() - cached.timestamp
      };
    }
    
    this.hitRate.misses++;
    const startTime = Date.now();
    
    const score = calculator(data, context);
    const computationTime = Date.now() - startTime;
    
    this.cacheScore(cacheKey, score, computationTime);
    
    this.config.smartLog('cache', 
      `Score computed for ${cacheKey} in ${computationTime}ms`
    );
    
    return {
      ...score,
      fromCache: false,
      computationTime
    };
  }

  cacheScore(key, score, computationTime) {
    const entry = {
      score,
      timestamp: Date.now(),
      computationTime,
      accessCount: 1
    };
    
    this.cache.set(key, entry);
    this.accessTimes.set(key, Date.now());
    this.updateComputationStats(computationTime);
    
    if (this.cache.size > this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  getFuzzyMatchScore(str1, str2, context = {}) {
    const cacheKey = this.generateCacheKey({ 
      content: str1 + '|' + str2 
    }, context);
    
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      this.hitRate.hits++;
      return cached.score.value;
    }
    
    this.hitRate.misses++;
    const startTime = Date.now();
    
    const score = this.calculateFuzzyMatch(str1, str2);
    const computationTime = Date.now() - startTime;
    
    this.cacheScore(cacheKey, { value: score }, computationTime);
    
    return score;
  }

  getKeywordMatchScore(content, keywords, context = {}) {
    const cacheKey = this.generateCacheKey({ content }, { 
      ...context, 
      keywords: Array.isArray(keywords) ? keywords : [keywords]
    });
    
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      this.hitRate.hits++;
      return cached.score;
    }
    
    this.hitRate.misses++;
    const startTime = Date.now();
    
    const score = this.calculateKeywordMatch(content, keywords, context);
    const computationTime = Date.now() - startTime;
    
    this.cacheScore(cacheKey, score, computationTime);
    
    return score;
  }

  calculateFuzzyMatch(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const words1 = this.tokenize(str1);
    const words2 = this.tokenize(str2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    const longer = words1.length > words2.length ? words1 : words2;
    const shorter = words1.length <= words2.length ? words1 : words2;
    
    shorter.forEach(word => {
      if (longer.some(w => this.areWordsRelated(word, w))) {
        matches++;
      }
    });
    
    return matches / Math.max(words1.length, words2.length);
  }

  calculateKeywordMatch(content, keywords, context = {}) {
    if (!content || !keywords) return { score: 0, matches: [] };
    
    const contentLower = content.toLowerCase();
    const keywordArray = Array.isArray(keywords) ? keywords : [keywords];
    const matches = [];
    let totalScore = 0;
    
    keywordArray.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      const variants = this.generateKeywordVariants(keywordLower, context.language);
      
      variants.forEach(variant => {
        if (contentLower.includes(variant)) {
          const positions = this.findAllOccurrences(contentLower, variant);
          const score = this.calculatePositionScore(positions, content.length);
          
          matches.push({
            keyword: keyword,
            variant: variant,
            positions: positions,
            score: score
          });
          
          totalScore += score;
        }
      });
    });
    
    return {
      score: Math.min(totalScore, 100),
      matches: matches,
      coverage: matches.length / keywordArray.length
    };
  }

  generateKeywordVariants(keyword, language = 'en') {
    const variants = new Set([keyword]);
    
    if (language === 'en') {
      variants.add(keyword.replace(/s$/, ''));
      variants.add(keyword + 's');
      variants.add(keyword.replace(/ies$/, 'y'));
      variants.add(keyword.replace(/y$/, 'ies'));
      variants.add(keyword.replace(/ed$/, ''));
      variants.add(keyword.replace(/ing$/, ''));
      variants.add(keyword.replace(/er$/, ''));
      variants.add(keyword + 'er');
      variants.add(keyword + 'ed');
      variants.add(keyword + 'ing');
    }
    
    if (language === 'fr') {
      variants.add(keyword.replace(/e$/, ''));
      variants.add(keyword + 'e');
      variants.add(keyword.replace(/s$/, ''));
      variants.add(keyword + 's');
      variants.add(keyword.replace(/eur$/, 'euse'));
      variants.add(keyword.replace(/euse$/, 'eur'));
    }
    
    return Array.from(variants);
  }

  findAllOccurrences(text, pattern) {
    const positions = [];
    let index = text.indexOf(pattern);
    
    while (index !== -1) {
      positions.push(index);
      index = text.indexOf(pattern, index + 1);
    }
    
    return positions;
  }

  calculatePositionScore(positions, textLength) {
    if (positions.length === 0) return 0;
    
    let score = positions.length * 10;
    
    positions.forEach(pos => {
      const relativePos = pos / textLength;
      if (relativePos < 0.1) score += 5;
      else if (relativePos < 0.3) score += 3;
      else if (relativePos < 0.7) score += 1;
    });
    
    return Math.min(score, 50);
  }

  tokenize(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));
  }

  areWordsRelated(word1, word2) {
    if (word1 === word2) return true;
    if (word1.includes(word2) || word2.includes(word1)) return true;
    
    const stem1 = this.stemWord(word1);
    const stem2 = this.stemWord(word2);
    
    return stem1 === stem2;
  }

  stemWord(word) {
    return word
      .replace(/ing$/, '')
      .replace(/ed$/, '')
      .replace(/er$/, '')
      .replace(/s$/, '')
      .replace(/ies$/, 'y')
      .replace(/y$/, 'i');
  }

  isStopWord(word) {
    const stopWords = [
      'the', 'and', 'or', 'but', 'for', 'with', 'at', 'by', 'from', 'to',
      'in', 'on', 'of', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'a', 'an', 'we', 'you', 'they', 'it', 'he', 'she'
    ];
    return stopWords.includes(word);
  }

  normalizeContent(content) {
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 500);
  }

  isCacheValid(entry) {
    return (Date.now() - entry.timestamp) < this.ttl;
  }

  evictLeastRecentlyUsed() {
    const entries = Array.from(this.accessTimes.entries())
      .sort((a, b) => a[1] - b[1]);
    
    const toEvict = entries.slice(0, Math.floor(this.maxCacheSize * 0.2));
    
    toEvict.forEach(([key]) => {
      this.cache.delete(key);
      this.accessTimes.delete(key);
    });
    
    this.config.smartLog('cache', `Evicted ${toEvict.length} cache entries (LRU)`);
  }

  updateComputationStats(time) {
    const stats = this.computationStats.get('overall') || {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0
    };
    
    stats.count++;
    stats.totalTime += time;
    stats.avgTime = stats.totalTime / stats.count;
    stats.minTime = Math.min(stats.minTime, time);
    stats.maxTime = Math.max(stats.maxTime, time);
    
    this.computationStats.set('overall', stats);
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  cleanup() {
    const before = this.cache.size;
    let expiredCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isCacheValid(entry)) {
        this.cache.delete(key);
        this.accessTimes.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      this.config.smartLog('cache', 
        `Cleaned up ${expiredCount} expired score cache entries (${before} → ${this.cache.size})`
      );
    }
  }

  precomputeScores(dataList, contexts, calculator) {
    const startTime = Date.now();
    let precomputed = 0;
    
    dataList.forEach(data => {
      contexts.forEach(context => {
        const cacheKey = this.generateCacheKey(data, context);
        if (!this.cache.has(cacheKey)) {
          const score = calculator(data, context);
          this.cacheScore(cacheKey, score, 0);
          precomputed++;
        }
      });
    });
    
    const totalTime = Date.now() - startTime;
    this.config.smartLog('cache', 
      `Precomputed ${precomputed} scores in ${totalTime}ms`
    );
    
    return precomputed;
  }

  getStats() {
    const totalRequests = this.hitRate.hits + this.hitRate.misses;
    const hitRatePercent = totalRequests > 0 ? 
      (this.hitRate.hits / totalRequests * 100).toFixed(1) : 0;
    
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      hitRate: parseFloat(hitRatePercent),
      totalRequests: totalRequests,
      hits: this.hitRate.hits,
      misses: this.hitRate.misses,
      computationStats: this.computationStats.get('overall') || {},
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  estimateMemoryUsage() {
    const avgEntrySize = 200;
    return Math.round(this.cache.size * avgEntrySize / 1024);
  }

  clear() {
    this.cache.clear();
    this.accessTimes.clear();
    this.hitRate = { hits: 0, misses: 0 };
    this.config.smartLog('cache', 'Score cache cleared');
  }
}

module.exports = ScoreCache;