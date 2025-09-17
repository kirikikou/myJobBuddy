const config = require('../../config');

class CacheWarmer {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    this.config = config.cache || {};
    
    this.warmupStrategies = {
      domainProfiles: this.warmupDomainProfiles.bind(this),
      popularSearches: this.warmupPopularSearches.bind(this),
      userPreferences: this.warmupUserPreferences.bind(this),
      criticalData: this.warmupCriticalData.bind(this),
      recentlyAccessed: this.warmupRecentlyAccessed.bind(this)
    };
    
    this.warmupHistory = new Map();
    this.isWarming = false;
    this.warmupQueue = [];
    this.maxConcurrentWarmups = 3;
    this.currentWarmups = 0;
  }

  async warmupCriticalData() {
    if (this.isWarming) {
      config.smartLog('cache', 'Cache warming already in progress, skipping');
      return;
    }
    
    this.isWarming = true;
    const startTime = Date.now();
    
    try {
      config.smartLog('cache', 'Starting critical data warmup');
      
      const warmupTasks = [
        { name: 'domainProfiles', priority: 10 },
        { name: 'userPreferences', priority: 8 },
        { name: 'popularSearches', priority: 6 },
        { name: 'recentlyAccessed', priority: 4 }
      ];
      
      const results = await this.executeWarmupTasks(warmupTasks);
      
      const totalTime = Date.now() - startTime;
      const totalWarmed = results.reduce((sum, r) => sum + r.count, 0);
      
      config.smartLog('cache', 
        `Critical data warmup completed: ${totalWarmed} entries in ${totalTime}ms`
      );
      
      return {
        success: true,
        totalEntries: totalWarmed,
        duration: totalTime,
        results
      };
      
    } catch (error) {
      config.smartLog('fail', `Cache warmup error: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      this.isWarming = false;
    }
  }

  async executeWarmupTasks(tasks) {
    const sortedTasks = tasks.sort((a, b) => b.priority - a.priority);
    const results = [];
    
    for (const task of sortedTasks) {
      if (this.currentWarmups >= this.maxConcurrentWarmups) {
        await this.waitForSlot();
      }
      
      this.currentWarmups++;
      
      try {
        const taskResult = await this.executeWarmupTask(task);
        results.push(taskResult);
        
        this.recordWarmupHistory(task.name, taskResult);
        
      } catch (error) {
        config.smartLog('fail', `Warmup task ${task.name} failed: ${error.message}`);
        results.push({ name: task.name, count: 0, error: error.message });
      } finally {
        this.currentWarmups--;
      }
    }
    
    return results;
  }

  async executeWarmupTask(task) {
    const strategy = this.warmupStrategies[task.name];
    if (!strategy) {
      throw new Error(`Unknown warmup strategy: ${task.name}`);
    }
    
    const startTime = Date.now();
    const result = await strategy();
    const duration = Date.now() - startTime;
    
    return {
      name: task.name,
      count: result.count || 0,
      duration,
      details: result.details || {}
    };
  }

  async warmupDomainProfiles() {
    config.smartLog('cache', 'Warming up domain profiles');
    
    try {
      const DomainProfiler = require('../../scrapers/DomainProfiler');
      const profiler = new DomainProfiler();
      await profiler.loadCurrentProfiles();
      
      const profiles = await profiler.getMostPopularDomains(100);
      let warmedCount = 0;
      
      for (const profile of profiles) {
        if (profile.hitCount >= 5) {
          const cacheKey = `profiles:${profile.domain}`;
          
          const profileData = {
            domain: profile.domain,
            step: profile.step,
            language: profile.language,
            platform: profile.platform,
            successRate: profile.successRate,
            avgTime: profile.avgTime,
            aws: profile.aws,
            lastUpdated: Date.now()
          };
          
          await this.cacheManager.set(
            cacheKey, 
            profileData, 
            this.config.TTL?.DOMAIN_PROFILE_DAYS * 24 * 60 * 60 * 1000,
            { 
              namespace: this.config.NAMESPACES?.PROFILES,
              priority: 9
            }
          );
          
          warmedCount++;
        }
      }
      
      config.smartLog('cache', `Domain profiles warmed: ${warmedCount} entries`);
      
      return {
        count: warmedCount,
        details: { totalProfiles: profiles.length }
      };
      
    } catch (error) {
      config.smartLog('fail', `Domain profiles warmup error: ${error.message}`);
      return { count: 0, error: error.message };
    }
  }

  async warmupUserPreferences() {
    config.smartLog('cache', 'Warming up user preferences');
    
    try {
      const User = require('../../models/User');
      const users = await User.find({
        lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }).select('_id preferences jobTitles locations').limit(50);
      
      let warmedCount = 0;
      
      for (const user of users) {
        if (user.preferences || user.jobTitles?.length > 0) {
          const cacheKey = `user_prefs:${user._id}`;
          
          const prefsData = {
            userId: user._id,
            preferences: user.preferences || {},
            jobTitles: user.jobTitles || [],
            locations: user.locations || [],
            lastUpdated: Date.now()
          };
          
          await this.cacheManager.set(
            cacheKey,
            prefsData,
            this.config.TTL?.SECONDS * 1000,
            {
              namespace: this.config.NAMESPACES?.DEFAULT,
              priority: 8
            }
          );
          
          warmedCount++;
        }
      }
      
      config.smartLog('cache', `User preferences warmed: ${warmedCount} entries`);
      
      return {
        count: warmedCount,
        details: { totalUsers: users.length }
      };
      
    } catch (error) {
      config.smartLog('fail', `User preferences warmup error: ${error.message}`);
      return { count: 0, error: error.message };
    }
  }

  async warmupPopularSearches() {
    config.smartLog('cache', 'Warming up popular searches');
    
    try {
      const popularQueries = await this.getPopularSearchQueries();
      let warmedCount = 0;
      
      for (const query of popularQueries) {
        if (query.frequency >= 5) {
          const cacheKey = `popular_search:${this.normalizeSearchKey(query.terms)}`;
          
          const searchData = {
            terms: query.terms,
            frequency: query.frequency,
            lastUsed: query.lastUsed,
            avgResults: query.avgResults || 0,
            domains: query.domains || [],
            preloaded: true,
            warmupTime: Date.now()
          };
          
          await this.cacheManager.set(
            cacheKey,
            searchData,
            this.config.MEMORY_CACHE?.DEFAULT_TTL_MS,
            {
              namespace: this.config.NAMESPACES?.SCRAPING,
              priority: 7
            }
          );
          
          warmedCount++;
        }
      }
      
      config.smartLog('cache', `Popular searches warmed: ${warmedCount} entries`);
      
      return {
        count: warmedCount,
        details: { totalQueries: popularQueries.length }
      };
      
    } catch (error) {
      config.smartLog('fail', `Popular searches warmup error: ${error.message}`);
      return { count: 0, error: error.message };
    }
  }

  async warmupRecentlyAccessed() {
    config.smartLog('cache', 'Warming up recently accessed data');
    
    try {
      const recentCacheFiles = await this.getRecentCacheFiles();
      let warmedCount = 0;
      
      for (const file of recentCacheFiles) {
        if (this.shouldWarmupFile(file)) {
          const success = await this.warmupCacheFile(file);
          if (success) warmedCount++;
        }
      }
      
      config.smartLog('cache', `Recently accessed data warmed: ${warmedCount} entries`);
      
      return {
        count: warmedCount,
        details: { totalFiles: recentCacheFiles.length }
      };
      
    } catch (error) {
      config.smartLog('fail', `Recently accessed warmup error: ${error.message}`);
      return { count: 0, error: error.message };
    }
  }

  async getPopularSearchQueries() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const logPath = path.join(__dirname, '../../logs/app.log');
      const logContent = await fs.readFile(logPath, 'utf8');
      
      const searchLines = logContent
        .split('\n')
        .filter(line => line.includes('search-career-pages') || line.includes('job title'))
        .slice(-1000);
      
      const queryMap = new Map();
      
      searchLines.forEach(line => {
        const jobTitleMatch = line.match(/job[Tt]itle["\s]*[:=]\s*["']([^"']+)["']/);
        if (jobTitleMatch) {
          const terms = jobTitleMatch[1].toLowerCase().trim();
          if (terms.length > 2) {
            const existing = queryMap.get(terms) || { 
              terms, frequency: 0, lastUsed: 0, domains: [] 
            };
            existing.frequency++;
            existing.lastUsed = Date.now();
            queryMap.set(terms, existing);
          }
        }
      });
      
      return Array.from(queryMap.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 50);
        
    } catch (error) {
      config.smartLog('cache', `Could not analyze search logs: ${error.message}`);
      return [];
    }
  }

  async getRecentCacheFiles() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const cacheDir = this.config.CACHE_DIR || './cache';
      const files = await fs.readdir(cacheDir);
      
      const recentFiles = [];
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() > threeDaysAgo) {
            recentFiles.push({
              path: filePath,
              name: file,
              size: stats.size,
              modified: stats.mtime.getTime()
            });
          }
        }
      }
      
      return recentFiles
        .sort((a, b) => b.modified - a.modified)
        .slice(0, 100);
        
    } catch (error) {
      config.smartLog('cache', `Could not scan cache directory: ${error.message}`);
      return [];
    }
  }

  shouldWarmupFile(file) {
    return file.size < 500000 && file.size > 1000;
  }

  async warmupCacheFile(file) {
    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(file.path, 'utf8');
      const data = JSON.parse(content);
      
      if (data.data && data.data.url) {
        const domain = this.extractDomain(data.data.url);
        const cacheKey = `warmup:${domain}:${this.hashUrl(data.data.url)}`;
        
        const warmupData = {
          url: data.data.url,
          domain,
          jobsFound: data.data.links?.length || 0,
          language: data.data.language || 'en',
          platform: data.data.detectedPlatform,
          warmedAt: Date.now(),
          originalTimestamp: data.timestamp
        };
        
        await this.cacheManager.set(
          cacheKey,
          warmupData,
          this.config.MEMORY_CACHE?.DEFAULT_TTL_MS,
          {
            namespace: this.config.NAMESPACES?.TEMP,
            priority: 5
          }
        );
        
        return true;
      }
      
      return false;
      
    } catch (error) {
      return false;
    }
  }

  async scheduleWarmup(strategy, delay = 0) {
    const task = {
      strategy,
      scheduledAt: Date.now() + delay,
      id: this.generateTaskId()
    };
    
    this.warmupQueue.push(task);
    
    if (delay === 0) {
      await this.processWarmupQueue();
    } else {
      setTimeout(() => {
        this.processWarmupQueue();
      }, delay);
    }
    
    return task.id;
  }

  async processWarmupQueue() {
    if (this.isWarming || this.warmupQueue.length === 0) return;
    
    const now = Date.now();
    const readyTasks = this.warmupQueue.filter(task => task.scheduledAt <= now);
    
    if (readyTasks.length === 0) return;
    
    this.warmupQueue = this.warmupQueue.filter(task => task.scheduledAt > now);
    
    for (const task of readyTasks) {
      try {
        const strategy = this.warmupStrategies[task.strategy];
        if (strategy) {
          await strategy();
          config.smartLog('cache', `Scheduled warmup completed: ${task.strategy}`);
        }
      } catch (error) {
        config.smartLog('fail', `Scheduled warmup failed: ${task.strategy} - ${error.message}`);
      }
    }
  }

  async waitForSlot() {
    while (this.currentWarmups >= this.maxConcurrentWarmups) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  recordWarmupHistory(strategy, result) {
    const history = this.warmupHistory.get(strategy) || [];
    
    history.unshift({
      timestamp: Date.now(),
      count: result.count,
      duration: result.duration,
      success: !result.error
    });
    
    if (history.length > 10) {
      history.splice(10);
    }
    
    this.warmupHistory.set(strategy, history);
  }

  normalizeSearchKey(terms) {
    return terms
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  hashUrl(url) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }

  generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  getWarmupStats() {
    const stats = {
      isWarming: this.isWarming,
      queueLength: this.warmupQueue.length,
      currentWarmups: this.currentWarmups,
      maxConcurrentWarmups: this.maxConcurrentWarmups,
      strategies: Object.keys(this.warmupStrategies),
      history: {}
    };
    
    for (const [strategy, history] of this.warmupHistory.entries()) {
      const recent = history.slice(0, 5);
      const successRate = recent.length > 0 ? 
        (recent.filter(h => h.success).length / recent.length * 100) : 0;
      const avgDuration = recent.length > 0 ? 
        Math.round(recent.reduce((sum, h) => sum + h.duration, 0) / recent.length) : 0;
      
      stats.history[strategy] = {
        totalRuns: history.length,
        successRate: Math.round(successRate),
        avgDuration,
        lastRun: recent[0]?.timestamp,
        recentRuns: recent.length
      };
    }
    
    return stats;
  }

  async clearWarmupCache() {
    const cleared = await this.cacheManager.clear('warmup', {
      namespace: this.config.NAMESPACES?.TEMP
    });
    
    config.smartLog('cache', `Cleared warmup cache: ${cleared} entries`);
    return cleared;
  }
}

module.exports = CacheWarmer;