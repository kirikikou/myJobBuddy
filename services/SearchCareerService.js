class SearchCareerService {
    constructor(cacheService, matchingService, scrapingCoordinator, scrapingService, config, userPreferencesManager) {
      this.cacheService = cacheService;
      this.matchingService = matchingService;
      this.scrapingCoordinator = scrapingCoordinator;
      this.scrapingService = scrapingService;
      this.config = config;
      this.userPreferencesManager = userPreferencesManager;
    }
  
    async performSearch(searchParams, isStressTest = false) {
      const { jobTitles, urls, userId, userEmail, requestId } = searchParams;
      
      let userPrefs, userPlan;
      
      if (isStressTest) {
        userPrefs = {
          subscription: { plan: 'pro' },
          limits: { maxScrapingRequests: 999999, maxCacheSearches: 999999 }
        };
        userPlan = 'pro';
      } else {
        userPrefs = await this.userPreferencesManager.getUserPreferences(userId);
        userPlan = userPrefs.subscription?.plan || 'free';
      }
  
      const cacheAnalysis = await this.cacheService.analyzeCacheStatus(urls);
      const domainsNeedingCache = cacheAnalysis.cachedDomains;
      const domainsNeedingScraping = cacheAnalysis.staleOrMissingDomains;
  
      await this.validateLimits(domainsNeedingCache, domainsNeedingScraping, userId, isStressTest, userPlan);
  
      const searchResults = [];
      const profileOptimizations = [];
  
      await this.processCachedDomains(domainsNeedingCache, jobTitles, searchResults, profileOptimizations);
  
      if (domainsNeedingScraping.length > 0) {
        await this.processScrapingDomains(domainsNeedingScraping, jobTitles, userId, userEmail, searchResults, searchParams.abortSignal);
      }
  
      return this.formatSearchResults(searchResults, {
        domainsProcessed: urls.length,
        domainsCached: domainsNeedingCache.length,
        domainsScraped: domainsNeedingScraping.length,
        userPlan,
        isStressTest
      });
    }
  
    async validateLimits(cachedDomains, scrapingDomains, userId, isStressTest, userPlan) {
      if (isStressTest) return;
  
      const cacheLimit = await this.userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
      const scrapingLimit = await this.userPreferencesManager.checkUserLimit(userId, 'maxScrapingRequests');
  
      if (cacheLimit.remaining < cachedDomains.length) {
        throw {
          code: 'CACHE_LIMIT_EXCEEDED',
          message: `Insufficient cache search credits. Need ${cachedDomains.length}, have ${cacheLimit.remaining}.`,
          needed: cachedDomains.length,
          available: cacheLimit.remaining,
          upgradeRecommended: userPlan !== 'pro',
          currentPlan: userPlan
        };
      }
  
      if (scrapingLimit.remaining < scrapingDomains.length) {
        throw {
          code: 'SCRAPING_LIMIT_EXCEEDED',
          message: `Insufficient scraping credits. Need ${scrapingDomains.length}, have ${scrapingLimit.remaining}.`,
          needed: scrapingDomains.length,
          available: scrapingLimit.remaining,
          upgradeRecommended: userPlan !== 'pro',
          currentPlan: userPlan
        };
      }
  
      if (cachedDomains.length > 0) {
        await this.userPreferencesManager.incrementUsage(userId, 'cacheSearches', cachedDomains.length);
      }
  
      if (scrapingDomains.length > 0) {
        await this.userPreferencesManager.incrementUsage(userId, 'scrapingRequests', scrapingDomains.length);
      }
    }
  
    async processCachedDomains(domains, jobTitles, searchResults, profileOptimizations) {
      for (const url of domains) {
        try {
          const profile = await this.getDomainProfile(url);
          if (profile) {
            profileOptimizations.push({
              url,
              step: profile.step,
              language: profile.language,
              platform: profile.platform,
              fastTrackEligible: profile.successRate >= 70 && profile.step,
              usedOptimization: 'cache'
            });
          }
  
          const pageData = await this.cacheService.getOptimizedCachedPageData(url);
          
          if (pageData) {
            const matches = this.matchingService.findJobMatches(pageData, jobTitles);
            
            if (matches.jobTitles.length > 0) {
              this.addMatchesToResults(matches, pageData, url, searchResults);
            }
          }
        } catch (error) {
          this.config.smartLog('fail', `Error processing cached URL ${url}: ${error.message}`);
        }
      }
    }
  
    async processScrapingDomains(domains, jobTitles, userId, userEmail, searchResults, abortSignal) {
      const parallelResult = await this.scrapingService.scrapeMultipleCareerPages(
        userId, 
        userEmail, 
        `Search: ${jobTitles.join(', ')}`, 
        domains,
        {
          useCache: false,
          saveCache: true,
          maxRetries: this.config.retries?.maxRetries || 3,
          timeout: this.config.timeouts?.globalJobMs || 120000,
          abortSignal
        }
      );
  
      if (parallelResult.success && parallelResult.results) {
        for (const urlResult of parallelResult.results) {
          if (urlResult.success && urlResult.result) {
            const matches = this.matchingService.findJobMatches(urlResult.result, jobTitles);
            
            if (matches.jobTitles.length > 0) {
              this.addMatchesToResults(matches, urlResult.result, urlResult.url, searchResults, true);
            }
          }
        }
      }
  
      return parallelResult;
    }
  
    addMatchesToResults(matches, pageData, url, searchResults, isParallel = false) {
      if (matches.links.length > 0) {
        for (const link of matches.links) {
          searchResults.push({
            title: link.text || link.title || matches.jobTitles[0],
            url: link.url,
            description: link.text || link.title || '',
            date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
            source: this.cacheService.extractShortDomain(url),
            confidence: matches.relevance?.confidence || 0,
            parallelProcessed: isParallel
          });
        }
      } else {
        searchResults.push({
          title: `${matches.jobTitles[0]} - ${this.cacheService.extractShortDomain(url)}`,
          url: url,
          description: this.extractJobDescription(pageData.text || ''),
          date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
          source: this.cacheService.extractShortDomain(url),
          confidence: matches.relevance?.confidence || 0,
          parallelProcessed: isParallel
        });
      }
    }
  
    async formatSearchResults(searchResults, metadata) {
      searchResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  
      let updatedLimits = {};
      if (!metadata.isStressTest) {
        const cacheLimit = await this.userPreferencesManager.checkUserLimit(metadata.userId, 'maxCacheSearches');
        const scrapingLimit = await this.userPreferencesManager.checkUserLimit(metadata.userId, 'maxScrapingRequests');
        
        updatedLimits = {
          remainingCacheSearches: cacheLimit.remaining,
          totalCacheSearches: cacheLimit.limit,
          remainingRequests: scrapingLimit.remaining,
          totalRequests: scrapingLimit.limit
        };
      }
  
      return {
        success: true,
        results: searchResults,
        searchType: metadata.domainsScraped > 0 ? 'intelligent_parallel' : 'cache_only',
        ...updatedLimits,
        domainsProcessed: metadata.domainsProcessed,
        domainsCached: metadata.domainsCached,
        domainsScraped: metadata.domainsScraped
      };
    }
  
    async getDomainProfile(url) {
      try {
        const profiler = require('../scrapers/DomainProfiler').getInstance();
        return await profiler.getDomainProfile(url);
      } catch (error) {
        return null;
      }
    }
  
    extractJobDescription(text) {
      if (!text) return '';
      const cleanText = text.replace(/\s+/g, ' ').trim();
      return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText;
    }
  }
  
  module.exports = SearchCareerService;