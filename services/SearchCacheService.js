const fs = require('fs');
const path = require('path');
const { getCacheFilename } = require('../cacheManager');
const CacheIndexer = require('../utils/CacheIndexer');
const StreamProcessor = require('../utils/StreamProcessor');

class SearchCacheService {
  constructor(cacheManager, domainProfiler, config) {
    this.cacheManager = cacheManager;
    this.domainProfiler = domainProfiler;
    this.config = config;
    this.cacheIndexer = new CacheIndexer(config);
    this.streamProcessor = new StreamProcessor(config);
    this.cacheDir = path.join(__dirname, '../cache');
    this.indexBuilt = false;
    this.lastIndexBuild = 0;
    this.indexRebuildThreshold = this.config.cache?.indexRebuildThreshold || 3600000;
    this.paginationDefaults = {
      limit: this.config.search?.defaultLimit || 100,
      maxLimit: this.config.search?.maxLimit || 1000
    };
  }

  async ensureIndexBuilt() {
    const now = Date.now();
    if (!this.indexBuilt || (now - this.lastIndexBuild) > this.indexRebuildThreshold) {
      try {
        await this.cacheIndexer.buildIndex(this.cacheDir);
        this.indexBuilt = true;
        this.lastIndexBuild = now;
        this.config.smartLog('cache', 'Cache index built successfully');
      } catch (error) {
        this.config.smartLog('fail', `Failed to build cache index: ${error.message}`);
        this.indexBuilt = false;
      }
    }
  }

  async analyzeCacheStatus(urls) {
    const cachedDomains = [];
    const staleOrMissingDomains = [];
    
    const promises = urls.map(async url => {
      try {
        const cacheFile = getCacheFilename(url);
        const stats = await fs.promises.stat(cacheFile);
        const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        
        return {
          url,
          cached: ageInHours < this.config.cache.freshnessHours,
          ageInHours
        };
      } catch (error) {
        return { url, cached: false, ageInHours: null };
      }
    });
    
    const results = await Promise.allSettled(promises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const { url, cached } = result.value;
        if (cached) {
          cachedDomains.push(url);
        } else {
          staleOrMissingDomains.push(url);
        }
      } else {
        staleOrMissingDomains.push(result.reason?.url || 'unknown');
      }
    });
    
    return { cachedDomains, staleOrMissingDomains };
  }

  async getCachedPageData(url) {
    try {
      const cacheFile = getCacheFilename(url);
      const cacheContent = await fs.promises.readFile(cacheFile, 'utf8');
      const cacheData = JSON.parse(cacheContent);
      return cacheData.data;
    } catch (error) {
      this.config.smartLog('fail', `Error reading cache for ${url}: ${error.message}`);
      return null;
    }
  }

  async getOptimizedCachedPageData(url) {
    try {
      await this.domainProfiler.recordHit(url, 'cache');
      return await this.getCachedPageData(url);
    } catch (error) {
      this.config.smartLog('fail', `Error in optimized cache read for ${url}: ${error.message}`);
      return null;
    }
  }

  async checkCacheStatus(url) {
    try {
      const cacheFile = getCacheFilename(url);
      const stats = await fs.promises.stat(cacheFile);
      const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      return { 
        cached: ageInHours < this.config.cache.freshnessHours,
        ageInHours: Math.round(ageInHours * 10) / 10
      };
    } catch (error) {
      return { cached: false, ageInHours: null };
    }
  }

  async refreshCache(url) {
    try {
      const cacheFile = getCacheFilename(url);
      await fs.promises.unlink(cacheFile);
      this.config.smartLog('cache', `Cache deleted for ${url}`);
      return true;
    } catch (error) {
      this.config.smartLog('cache', `No existing cache for ${url}`);
      return false;
    }
  }

  async searchCacheOpportunities(jobTitle, options = {}) {
    const startTime = Date.now();
    const {
      language = null,
      domains = null,
      limit = this.paginationDefaults.limit,
      offset = 0,
      fuzzyThreshold = 0.8,
      useStreaming = null,
      sortBy = 'relevance'
    } = options;

    const normalizedLimit = Math.min(limit, this.paginationDefaults.maxLimit);
    
    try {
      await this.ensureIndexBuilt();
      
      if (this.indexBuilt) {
        return await this.searchCacheOpportunitiesIndexed(
          jobTitle, language, domains, normalizedLimit, offset, fuzzyThreshold, sortBy
        );
      } else {
        return await this.searchCacheOpportunitiesStreaming(
          jobTitle, language, domains, normalizedLimit, offset, fuzzyThreshold, sortBy, useStreaming
        );
      }
    } catch (error) {
      this.config.smartLog('fail', `Cache search failed: ${error.message}`);
      return this.createEmptyResult();
    }
  }

  async searchCacheOpportunitiesIndexed(jobTitle, language, domains, limit, offset, fuzzyThreshold, sortBy) {
    const startTime = Date.now();
    
    let searchResult;
    if (domains && domains.length > 0) {
      searchResult = await this.searchByMultipleDomains(domains, language, jobTitle, limit * 2, offset);
    } else {
      searchResult = this.cacheIndexer.searchByJobTitle(
        jobTitle, language, fuzzyThreshold, limit * 2, offset
      );
    }
    
    const filteredResults = this.applyJobTitleFiltering(searchResult.results, jobTitle, fuzzyThreshold);
    const sortedResults = this.sortResults(filteredResults, sortBy);
    const paginatedResults = sortedResults.slice(0, limit);
    
    const searchTime = Date.now() - startTime;
    
    this.config.smartLog('cache', 
      `Indexed search completed: ${paginatedResults.length}/${searchResult.total} results in ${searchTime}ms`
    );
    
    return {
      results: paginatedResults,
      pagination: {
        limit,
        offset,
        total: filteredResults.length,
        hasMore: offset + limit < filteredResults.length,
        nextOffset: offset + limit < filteredResults.length ? offset + limit : null
      },
      searchTime,
      method: 'indexed',
      indexStats: this.cacheIndexer.getIndexStats()
    };
  }

  async searchCacheOpportunitiesStreaming(jobTitle, language, domains, limit, offset, fuzzyThreshold, sortBy, useStreaming) {
    const startTime = Date.now();
    
    const cacheFiles = await this.getCacheFilesList();
    const shouldStream = useStreaming !== null ? 
      useStreaming : 
      this.streamProcessor.shouldUseStreaming(cacheFiles.length);
    
    let results;
    if (shouldStream) {
      results = await this.processFilesWithStreaming(
        cacheFiles, jobTitle, language, domains, limit, offset, fuzzyThreshold
      );
    } else {
      results = await this.processFilesBatch(
        cacheFiles, jobTitle, language, domains, limit, offset, fuzzyThreshold
      );
    }
    
    const filteredResults = this.applyJobTitleFiltering(results.opportunities, jobTitle, fuzzyThreshold);
    const sortedResults = this.sortResults(filteredResults, sortBy);
    const paginatedResults = sortedResults.slice(offset, offset + limit);
    
    const searchTime = Date.now() - startTime;
    
    this.config.smartLog('cache', 
      `${shouldStream ? 'Streaming' : 'Batch'} search completed: ${paginatedResults.length} results in ${searchTime}ms`
    );
    
    return {
      results: paginatedResults,
      pagination: {
        limit,
        offset,
        total: filteredResults.length,
        hasMore: offset + limit < filteredResults.length,
        nextOffset: offset + limit < filteredResults.length ? offset + limit : null
      },
      searchTime,
      method: shouldStream ? 'streaming' : 'batch',
      processedFiles: results.processedFiles || cacheFiles.length
    };
  }

  async searchByMultipleDomains(domains, language, jobTitle, limit, offset) {
    const results = [];
    let totalCount = 0;
    
    for (const domain of domains) {
      const domainResult = this.cacheIndexer.searchByDomain(domain, language, limit, 0);
      results.push(...domainResult.results);
      totalCount += domainResult.total;
    }
    
    const uniqueResults = this.deduplicateByUrl(results);
    
    return {
      results: uniqueResults,
      total: totalCount,
      hasMore: uniqueResults.length >= limit
    };
  }

  async processFilesWithStreaming(cacheFiles, jobTitle, language, domains, limit, offset, fuzzyThreshold) {
    const jobTitleLower = jobTitle.toLowerCase();
    const domainSet = domains ? new Set(domains.map(d => d.toLowerCase())) : null;
    const opportunities = [];
    let processedFiles = 0;
    
    const fileProcessor = async (filePath) => {
      const opportunities = await this.extractOpportunitiesFromFile(
        filePath, jobTitleLower, language, domainSet, fuzzyThreshold
      );
      return opportunities;
    };
    
    const streamResult = await this.streamProcessor.processFilesStream(
      cacheFiles.map(f => path.join(this.cacheDir, f)),
      fileProcessor,
      {
        maxConcurrency: 5,
        targetResults: limit * 3,
        enableEarlyStop: true
      }
    );
    
    streamResult.results.forEach(fileResults => {
      if (Array.isArray(fileResults)) {
        opportunities.push(...fileResults);
      }
    });
    
    return {
      opportunities: this.deduplicateByUrl(opportunities),
      processedFiles: streamResult.stats.processedFiles,
      stats: streamResult.stats
    };
  }

  async processFilesBatch(cacheFiles, jobTitle, language, domains, limit, offset, fuzzyThreshold) {
    const jobTitleLower = jobTitle.toLowerCase();
    const domainSet = domains ? new Set(domains.map(d => d.toLowerCase())) : null;
    const opportunities = [];
    
    const maxFiles = Math.min(cacheFiles.length, 200);
    const filesToProcess = cacheFiles.slice(0, maxFiles);
    
    const chunks = this.streamProcessor.createChunks(filesToProcess, 20);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(file => 
        this.extractOpportunitiesFromFile(
          path.join(this.cacheDir, file),
          jobTitleLower, language, domainSet, fuzzyThreshold
        ).catch(error => {
          this.config.smartLog('cache', `Error processing ${file}: ${error.message}`);
          return [];
        })
      );
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      chunkResults.forEach(result => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          opportunities.push(...result.value);
        }
      });
      
      if (opportunities.length >= limit * 3) {
        break;
      }
    }
    
    return {
      opportunities: this.deduplicateByUrl(opportunities),
      processedFiles: filesToProcess.length
    };
  }

  async extractOpportunitiesFromFile(filePath, jobTitleLower, language, domainSet, fuzzyThreshold) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      if (!data.data || !data.data.links) return [];
      
      const domain = this.extractShortDomain(data.data.url);
      if (domainSet && !domainSet.has(domain.toLowerCase())) return [];
      
      if (language && data.data.language && data.data.language !== language) return [];
      
      const opportunities = [];
      
      for (const link of data.data.links) {
        if (!link.isJobPosting) continue;
        
        const title = (link.title || link.text || '').trim();
        if (!title) continue;
        
        const fuzzyScore = this.calculateQuickFuzzyMatch(jobTitleLower, title.toLowerCase());
        if (fuzzyScore < fuzzyThreshold) continue;
        
        opportunities.push({
          title,
          url: link.url,
          description: (link.text || title).substring(0, 150),
          date: data.data.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
          source: domain,
          confidence: Math.round(fuzzyScore * 100),
          language: data.data.language || 'en'
        });
      }
      
      return opportunities;
    } catch (error) {
      return [];
    }
  }

  calculateQuickFuzzyMatch(jobTitle, candidateTitle) {
    const jobWords = jobTitle.split(/\s+/).filter(w => w.length > 2);
    const candidateWords = candidateTitle.split(/\s+/).filter(w => w.length > 2);
    
    if (jobWords.length === 0 || candidateWords.length === 0) return 0;
    
    let matches = 0;
    jobWords.forEach(jobWord => {
      if (candidateWords.some(candWord => 
        candWord.includes(jobWord) || jobWord.includes(candWord)
      )) {
        matches++;
      }
    });
    
    return matches / Math.max(jobWords.length, candidateWords.length);
  }

  applyJobTitleFiltering(opportunities, jobTitle, threshold) {
    const jobTitleLower = jobTitle.toLowerCase();
    
    return opportunities.filter(opp => {
      const score = this.calculateQuickFuzzyMatch(jobTitleLower, (opp.title || '').toLowerCase());
      return score >= threshold;
    });
  }

  sortResults(results, sortBy) {
    switch (sortBy) {
      case 'relevance':
        return results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      case 'date':
        return results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      case 'title':
        return results.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      default:
        return results;
    }
  }

  deduplicateByUrl(opportunities) {
    const uniqueOpportunities = [];
    const seenUrls = new Set();
    
    opportunities
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .forEach(opp => {
        if (opp.url && !seenUrls.has(opp.url)) {
          seenUrls.add(opp.url);
          uniqueOpportunities.push(opp);
        }
      });
    
    return uniqueOpportunities;
  }

  async getCacheFilesList() {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      return files
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a));
    } catch (error) {
      this.config.smartLog('fail', `Error reading cache directory: ${error.message}`);
      return [];
    }
  }

  createEmptyResult() {
    return {
      results: [],
      pagination: {
        limit: this.paginationDefaults.limit,
        offset: 0,
        total: 0,
        hasMore: false,
        nextOffset: null
      },
      searchTime: 0,
      method: 'fallback'
    };
  }

  extractShortDomain(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname;
      
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      
      const pathParts = urlObj.pathname.split('/').filter(part => part && part.length > 0);
      if (pathParts.length > 0) {
        domain += '/' + pathParts[0];
        if (pathParts.length > 1) {
          domain += '/';
        }
      }
      
      return domain;
    } catch (e) {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  getSearchStats() {
    return {
      indexBuilt: this.indexBuilt,
      lastIndexBuild: this.lastIndexBuild,
      indexStats: this.indexBuilt ? this.cacheIndexer.getIndexStats() : null,
      paginationDefaults: this.paginationDefaults
    };
  }
}

module.exports = SearchCacheService;