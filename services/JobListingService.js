const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const cacheConfig = require('../config/cache');
const { getCacheFilename, determineCacheQuality, CACHE_QUALITY_TYPES } = require('../cacheManager');
const { checkLimit, canPerformLiveSearch } = require('../subscriptionPlans');

class JobListingService {
  constructor() {
    this.jobsCache = new Map();
    this.cacheIndex = new Map();
    this.lastRefresh = 0;
    this.lastIndexUpdate = 0;
    this.refreshLock = false;
    this.indexLock = false;
    this.serviceMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      indexRebuilds: 0,
      jobsServed: 0,
      avgResponseTime: 0
    };
    
    this.REFRESH_INTERVAL_MS = cacheConfig.HOUSEKEEPING.INTERVAL_HOURS * 60 * 60 * 1000;
    this.INDEX_INTERVAL_MS = 30 * 60 * 1000;
    this.MAX_CACHE_AGE_MS = cacheConfig.FRESHNESS.MILLISECONDS;
    this.MAX_INDEX_ENTRIES = 10000;
    this.BATCH_SIZE = 100;
    
    this._initializePeriodicRefresh();
    config.smartLog('service', 'JobListingService initialized with intelligent caching');
  }

  static getInstance() {
    if (!JobListingService.instance) {
      JobListingService.instance = new JobListingService();
    }
    return JobListingService.instance;
  }

  async _initializePeriodicRefresh() {
    try {
      await this._buildJobIndex();
      
      setInterval(async () => {
        if (!this.refreshLock) {
          await this._refreshJobsCache();
        }
      }, this.REFRESH_INTERVAL_MS);
      
      setInterval(async () => {
        if (!this.indexLock) {
          await this._incrementalIndexUpdate();
        }
      }, this.INDEX_INTERVAL_MS);
      
      config.smartLog('service', `Periodic refresh scheduled: cache=${this.REFRESH_INTERVAL_MS/1000}s, index=${this.INDEX_INTERVAL_MS/1000}s`);
    } catch (error) {
      config.smartLog('fail', `Failed to initialize periodic refresh: ${error.message}`);
    }
  }

  async _buildJobIndex() {
    if (this.indexLock) {
      config.smartLog('service', 'Index build already in progress, skipping');
      return;
    }
    
    this.indexLock = true;
    const startTime = Date.now();
    
    try {
      config.smartLog('service', 'Building job index from cache directory');
      
      const cacheDir = config.CACHE_DIR;
      
      try {
        await fs.access(cacheDir);
      } catch (error) {
        config.smartLog('service', 'Cache directory not found, creating empty index');
        this.lastIndexUpdate = Date.now();
        this.indexLock = false;
        return;
      }
      
      const cacheFiles = await fs.readdir(cacheDir);
      const jsonFiles = cacheFiles.filter(file => file.endsWith('.json'));
      
      config.smartLog('service', `Found ${jsonFiles.length} cache files to index`);
      
      this.cacheIndex.clear();
      let processedCount = 0;
      let validJobsCount = 0;
      
      for (let i = 0; i < jsonFiles.length; i += this.BATCH_SIZE) {
        const batch = jsonFiles.slice(i, i + this.BATCH_SIZE);
        
        await Promise.allSettled(batch.map(async (file) => {
          try {
            const filePath = path.join(cacheDir, file);
            const stats = await fs.stat(filePath);
            const fileAge = Date.now() - stats.mtime.getTime();
            
            if (fileAge > cacheConfig.TTL.SECONDS * 1000) {
              return;
            }
            
            const cacheContent = await fs.readFile(filePath, 'utf8');
            const cacheData = JSON.parse(cacheContent);
            
            if (!cacheData.timestamp || !cacheData.data) {
              return;
            }
            
            const cacheAge = Date.now() - cacheData.timestamp;
            const isStale = cacheAge > this.MAX_CACHE_AGE_MS;
            const quality = cacheData.quality || determineCacheQuality(cacheData.data);
            
            if (quality === CACHE_QUALITY_TYPES.MINIMUM) {
              return;
            }
            
            const jobCount = this._extractJobCount(cacheData.data);
            
            if (jobCount > 0) {
              this.cacheIndex.set(file, {
                url: cacheData.url,
                timestamp: cacheData.timestamp,
                jobCount: jobCount,
                quality: quality,
                isStale: isStale,
                filePath: filePath,
                fileSize: stats.size,
                lastModified: stats.mtime.getTime()
              });
              validJobsCount += jobCount;
            }
            
            processedCount++;
          } catch (error) {
            config.smartLog('cache', `Failed to index ${file}: ${error.message}`);
          }
        }));
        
        if (i % (this.BATCH_SIZE * 5) === 0) {
          config.smartLog('service', `Indexed ${Math.min(i + this.BATCH_SIZE, jsonFiles.length)}/${jsonFiles.length} files`);
        }
      }
      
      this.lastIndexUpdate = Date.now();
      this.serviceMetrics.indexRebuilds++;
      
      const duration = Date.now() - startTime;
      config.smartLog('win', `Job index built: ${this.cacheIndex.size} valid cache entries, ${validJobsCount} jobs total (${duration}ms)`);
      
    } catch (error) {
      config.smartLog('fail', `Failed to build job index: ${error.message}`);
    } finally {
      this.indexLock = false;
    }
  }

  async _incrementalIndexUpdate() {
    try {
      const cacheDir = config.CACHE_DIR;
      const cacheFiles = await fs.readdir(cacheDir);
      const jsonFiles = cacheFiles.filter(file => file.endsWith('.json'));
      
      let newEntries = 0;
      let updatedEntries = 0;
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath);
          
          const existing = this.cacheIndex.get(file);
          
          if (!existing || stats.mtime.getTime() > existing.lastModified) {
            const cacheContent = await fs.readFile(filePath, 'utf8');
            const cacheData = JSON.parse(cacheContent);
            
            if (cacheData.timestamp && cacheData.data) {
              const quality = cacheData.quality || determineCacheQuality(cacheData.data);
              
              if (quality !== CACHE_QUALITY_TYPES.MINIMUM) {
                const jobCount = this._extractJobCount(cacheData.data);
                
                if (jobCount > 0) {
                  const cacheAge = Date.now() - cacheData.timestamp;
                  
                  this.cacheIndex.set(file, {
                    url: cacheData.url,
                    timestamp: cacheData.timestamp,
                    jobCount: jobCount,
                    quality: quality,
                    isStale: cacheAge > this.MAX_CACHE_AGE_MS,
                    filePath: filePath,
                    fileSize: stats.size,
                    lastModified: stats.mtime.getTime()
                  });
                  
                  if (existing) {
                    updatedEntries++;
                  } else {
                    newEntries++;
                  }
                }
              }
            }
          }
        } catch (error) {
          config.smartLog('cache', `Failed to update index for ${file}: ${error.message}`);
        }
      }
      
      if (newEntries > 0 || updatedEntries > 0) {
        config.smartLog('service', `Index updated: ${newEntries} new, ${updatedEntries} updated entries`);
      }
      
    } catch (error) {
      config.smartLog('cache', `Incremental index update failed: ${error.message}`);
    }
  }

  _extractJobCount(cacheData) {
    if (!cacheData) return 0;
    
    let jobCount = 0;
    
    if (cacheData.jobsFound && typeof cacheData.jobsFound === 'number') {
      jobCount = cacheData.jobsFound;
    } else if (cacheData.links && Array.isArray(cacheData.links)) {
      jobCount = cacheData.links.filter(link => link.isJobPosting).length;
    }
    
    return jobCount;
  }

  async _refreshJobsCache() {
    if (this.refreshLock) {
      config.smartLog('service', 'Cache refresh already in progress, skipping');
      return;
    }
    
    this.refreshLock = true;
    const startTime = Date.now();
    
    try {
      const shouldRefresh = (Date.now() - this.lastRefresh) > this.REFRESH_INTERVAL_MS;
      
      if (!shouldRefresh) {
        config.smartLog('service', 'Cache refresh not needed yet');
        return;
      }
      
      config.smartLog('service', 'Refreshing jobs cache');
      
      const currentCacheSize = this.jobsCache.size;
      let validEntries = 0;
      let expiredEntries = 0;
      
      for (const [key, value] of this.jobsCache.entries()) {
        const age = Date.now() - value.cachedAt;
        
        if (age > this.MAX_CACHE_AGE_MS) {
          this.jobsCache.delete(key);
          expiredEntries++;
        } else {
          validEntries++;
        }
      }
      
      if (this.jobsCache.size > this.MAX_INDEX_ENTRIES) {
        const entriesToRemove = this.jobsCache.size - this.MAX_INDEX_ENTRIES;
        const sortedEntries = Array.from(this.jobsCache.entries())
          .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
        
        for (let i = 0; i < entriesToRemove; i++) {
          this.jobsCache.delete(sortedEntries[i][0]);
        }
        
        config.smartLog('service', `Evicted ${entriesToRemove} oldest cache entries`);
      }
      
      this.lastRefresh = Date.now();
      
      const duration = Date.now() - startTime;
      config.smartLog('service', `Cache refreshed: ${currentCacheSize}→${this.jobsCache.size} entries, ${expiredEntries} expired (${duration}ms)`);
      
    } catch (error) {
      config.smartLog('fail', `Failed to refresh jobs cache: ${error.message}`);
    } finally {
      this.refreshLock = false;
    }
  }

  async getJobsForUser(userId, userPlan, jobTitles = [], options = {}) {
    const startTime = Date.now();
    
    try {
      config.smartLog('service', `Job listing request: user=${userId.slice(-8)}, plan=${userPlan}, titles=${jobTitles.length}`);
      
      const cacheKey = this._generateCacheKey(userId, jobTitles, options);
      
      const cached = this.jobsCache.get(cacheKey);
      if (cached && (Date.now() - cached.cachedAt) < this.MAX_CACHE_AGE_MS) {
        this.serviceMetrics.cacheHits++;
        
        const responseTime = Date.now() - startTime;
        this._updateMetrics(responseTime);
        
        config.smartLog('win', `Served ${cached.jobs.length} jobs from service cache (${responseTime}ms)`);
        return this._formatResponse(cached.jobs, cached.meta, true);
      }
      
      this.serviceMetrics.cacheMisses++;
      
      if (this.cacheIndex.size === 0) {
        await this._buildJobIndex();
      }
      
      const planLimits = this._getPlanLimits(userPlan);
      const filteredJobs = await this._searchJobsFromIndex(jobTitles, planLimits, options);
      
      const result = {
        jobs: filteredJobs.jobs,
        cachedAt: Date.now(),
        meta: filteredJobs.meta
      };
      
      this.jobsCache.set(cacheKey, result);
      
      const responseTime = Date.now() - startTime;
      this._updateMetrics(responseTime);
      this.serviceMetrics.jobsServed += filteredJobs.jobs.length;
      
      config.smartLog('win', `Served ${filteredJobs.jobs.length} jobs from index search (${responseTime}ms)`);
      return this._formatResponse(filteredJobs.jobs, filteredJobs.meta, false);
      
    } catch (error) {
      config.smartLog('fail', `Failed to get jobs for user: ${error.message}`);
      return this._formatResponse([], { error: error.message }, false);
    }
  }

  async _searchJobsFromIndex(jobTitles, planLimits, options) {
    const startTime = Date.now();
    const allJobs = [];
    const processedDomains = new Set();
    const errors = [];
    
    try {
      const sortedEntries = Array.from(this.cacheIndex.entries())
        .sort((a, b) => {
          if (a[1].isStale !== b[1].isStale) {
            return a[1].isStale ? 1 : -1;
          }
          return b[1].timestamp - a[1].timestamp;
        })
        .slice(0, planLimits.maxFiles);
      
      config.smartLog('service', `Searching ${sortedEntries.length} indexed cache files`);
      
      for (let i = 0; i < sortedEntries.length; i += this.BATCH_SIZE) {
        const batch = sortedEntries.slice(i, i + this.BATCH_SIZE);
        
        const batchResults = await Promise.allSettled(
          batch.map(([file, indexEntry]) => this._processIndexEntry(file, indexEntry, jobTitles))
        );
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.jobs.length > 0) {
            allJobs.push(...result.value.jobs);
            processedDomains.add(result.value.domain);
          } else if (result.status === 'rejected') {
            errors.push(result.reason.message);
          }
        }
        
        if (allJobs.length >= planLimits.maxResults) {
          break;
        }
      }
      
      const uniqueJobs = this._deduplicateJobs(allJobs);
      const filteredJobs = this._applyPlanFiltering(uniqueJobs, planLimits);
      
      const duration = Date.now() - startTime;
      
      return {
        jobs: filteredJobs,
        meta: {
          searchTime: duration,
          totalFound: allJobs.length,
          uniqueJobs: uniqueJobs.length,
          afterPlanFilter: filteredJobs.length,
          domainsProcessed: processedDomains.size,
          indexEntriesChecked: sortedEntries.length,
          errors: errors.length,
          planLimits: planLimits
        }
      };
      
    } catch (error) {
      config.smartLog('fail', `Index search failed: ${error.message}`);
      return { jobs: [], meta: { error: error.message } };
    }
  }

  async _processIndexEntry(file, indexEntry, jobTitles) {
    try {
      const cacheContent = await fs.readFile(indexEntry.filePath, 'utf8');
      const cacheData = JSON.parse(cacheContent);
      
      if (!cacheData.data || !cacheData.data.links) {
        return { jobs: [], domain: this._extractDomain(indexEntry.url) };
      }
      
      const pageData = cacheData.data;
      const domain = this._extractDomain(indexEntry.url);
      const jobs = [];
      
      for (const link of pageData.links) {
        if (!link.isJobPosting) continue;
        
        const jobMatch = this._matchesJobTitles(link, jobTitles);
        if (jobMatch.matches) {
          jobs.push({
            title: link.text || link.title || 'Unknown Position',
            url: link.url,
            description: this._extractDescription(link.text || link.title || ''),
            date: pageData.scrapedAt ? pageData.scrapedAt.split('T')[0] : new Date().toISOString().split('T')[0],
            source: domain,
            confidence: jobMatch.confidence,
            cacheAge: indexEntry.isStale ? 'stale' : 'fresh',
            matchedTitles: jobMatch.matchedTitles
          });
        }
      }
      
      return { jobs, domain };
      
    } catch (error) {
      throw new Error(`Failed to process ${file}: ${error.message}`);
    }
  }

  _matchesJobTitles(link, jobTitles) {
    if (!jobTitles || jobTitles.length === 0) {
      return { matches: true, confidence: 50, matchedTitles: [] };
    }
    
    const linkText = (link.text || link.title || '').toLowerCase();
    const matchedTitles = [];
    let confidence = 0;
    
    for (const jobTitle of jobTitles) {
      const titleLower = jobTitle.toLowerCase();
      const titleWords = titleLower.split(/\s+/).filter(word => word.length > 2);
      
      if (linkText.includes(titleLower)) {
        matchedTitles.push(jobTitle);
        confidence = Math.max(confidence, 95);
      } else if (titleWords.length >= 2) {
        const matchedWords = titleWords.filter(word => linkText.includes(word));
        const matchRatio = matchedWords.length / titleWords.length;
        
        if (matchRatio >= 0.8) {
          matchedTitles.push(jobTitle);
          confidence = Math.max(confidence, Math.round(matchRatio * 85));
        }
      }
    }
    
    return {
      matches: matchedTitles.length > 0,
      confidence: confidence,
      matchedTitles: matchedTitles
    };
  }

  _deduplicateJobs(jobs) {
    const seen = new Set();
    const unique = [];
    
    for (const job of jobs) {
      const key = `${job.url}|${job.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(job);
      }
    }
    
    return unique;
  }

  _applyPlanFiltering(jobs, planLimits) {
    let filtered = jobs;
    
    filtered = filtered.sort((a, b) => {
      if (a.cacheAge !== b.cacheAge) {
        return a.cacheAge === 'fresh' ? -1 : 1;
      }
      return (b.confidence || 0) - (a.confidence || 0);
    });
    
    if (planLimits.filterStaleJobs) {
      const originalCount = filtered.length;
      filtered = filtered.filter(job => {
        if (planLimits.maxCacheAgeDays === 0) return true;
        
        const jobDate = new Date(job.date);
        const ageInDays = (Date.now() - jobDate.getTime()) / (1000 * 60 * 60 * 24);
        return ageInDays <= planLimits.maxCacheAgeDays;
      });
      
      if (filtered.length < originalCount) {
        config.smartLog('service', `Filtered ${originalCount - filtered.length} jobs older than ${planLimits.maxCacheAgeDays} days`);
      }
    }
    
    return filtered.slice(0, planLimits.maxResults);
  }

  _getPlanLimits(userPlan) {
    const planData = checkLimit(userPlan, 'maxOpportunities', 0);
    const maxOpportunities = planData.limit || 3;
    
    switch (userPlan) {
      case 'free':
        return {
          maxResults: Math.min(maxOpportunities, 50),
          maxFiles: 100,
          filterStaleJobs: true,
          maxCacheAgeDays: 7
        };
      case 'standard':
        return {
          maxResults: Math.min(maxOpportunities, 200),
          maxFiles: 500,
          filterStaleJobs: true,
          maxCacheAgeDays: 3
        };
      case 'pro':
        return {
          maxResults: Math.min(maxOpportunities, 1000),
          maxFiles: 2000,
          filterStaleJobs: false,
          maxCacheAgeDays: 0
        };
      default:
        return {
          maxResults: 10,
          maxFiles: 50,
          filterStaleJobs: true,
          maxCacheAgeDays: 7
        };
    }
  }

  _generateCacheKey(userId, jobTitles, options) {
    const titlesKey = jobTitles.sort().join('|');
    const optionsKey = JSON.stringify(options);
    return `${userId}_${titlesKey}_${optionsKey}`;
  }

  _extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  _extractDescription(text) {
    if (!text) return '';
    
    const cleanText = text.replace(/\s+/g, ' ').trim();
    return cleanText.length > 150 ? cleanText.substring(0, 150) + '...' : cleanText;
  }

  _updateMetrics(responseTime) {
    this.serviceMetrics.avgResponseTime = 
      (this.serviceMetrics.avgResponseTime + responseTime) / 2;
  }

  _formatResponse(jobs, meta, fromServiceCache) {
    return {
      success: true,
      jobs: jobs,
      totalJobs: jobs.length,
      searchTime: meta.searchTime || 0,
      fromServiceCache: fromServiceCache,
      meta: {
        ...meta,
        serviceMetrics: {
          cacheHitRatio: this.serviceMetrics.cacheHits / (this.serviceMetrics.cacheHits + this.serviceMetrics.cacheMisses) * 100,
          avgResponseTime: Math.round(this.serviceMetrics.avgResponseTime)
        }
      }
    };
  }

  async getServiceStats() {
    return {
      service: {
        ...this.serviceMetrics,
        cacheSize: this.jobsCache.size,
        indexSize: this.cacheIndex.size,
        lastRefresh: new Date(this.lastRefresh).toISOString(),
        lastIndexUpdate: new Date(this.lastIndexUpdate).toISOString()
      },
      cache: {
        hitRatio: this.serviceMetrics.cacheHits / (this.serviceMetrics.cacheHits + this.serviceMetrics.cacheMisses) * 100 || 0,
        totalHits: this.serviceMetrics.cacheHits,
        totalMisses: this.serviceMetrics.cacheMisses
      }
    };
  }

  async clearServiceCache() {
    this.jobsCache.clear();
    this.serviceMetrics.cacheHits = 0;
    this.serviceMetrics.cacheMisses = 0;
    this.lastRefresh = 0;
    
    config.smartLog('service', 'Service cache cleared');
    return { cleared: true };
  }

  async rebuildIndex() {
    config.smartLog('service', 'Manual index rebuild requested');
    this.cacheIndex.clear();
    await this._buildJobIndex();
    return { rebuilt: true, indexSize: this.cacheIndex.size };
  }
}

module.exports = JobListingService;