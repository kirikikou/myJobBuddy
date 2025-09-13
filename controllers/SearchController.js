const EventStream = require('../services/sse/EventStream');

class SearchController {
  constructor(searchCacheService, searchCareerService, jobMatchingService, validationService, responseFormatterService, config, userPreferencesManager) {
    this.searchCacheService = searchCacheService;
    this.searchCareerService = searchCareerService;
    this.jobMatchingService = jobMatchingService;
    this.validationService = validationService;
    this.responseFormatterService = responseFormatterService;
    this.config = config;
    this.userPreferencesManager = userPreferencesManager;
  }

  async searchCareerPages(req, res) {
    const requestId = this.validationService.generateRequestId();
    const { userId, userEmail } = this.validationService.extractUserInfo(req);
    const isStressTest = this.validationService.isStressTest(req);
    
    try {
      const { jobTitles, urls, careerPages, careerPageUrls } = req.body;
      
      const normalizedJobTitles = this.validationService.validateJobTitles(jobTitles);
      const normalizedUrls = this.validationService.validateAndNormalizeUrls(urls, careerPages, careerPageUrls);
      
      const searchParams = {
        jobTitles: normalizedJobTitles,
        urls: normalizedUrls,
        userId,
        userEmail,
        requestId,
        abortSignal: req.abortSignal
      };

      const searchResult = await this.searchCareerService.performSearch(searchParams, isStressTest);
      
      const cacheAnalysis = await this.searchCacheService.analyzeCacheStatus(normalizedUrls);
      const cacheHit = cacheAnalysis.cachedDomains.length > 0;
      const bufferServed = cacheAnalysis.staleOrMissingDomains.length > 0;
      
      this.responseFormatterService.setCacheHeaders(res, cacheHit, bufferServed);

      const responseData = this.responseFormatterService.formatIntelligentParallelResponse(
        searchResult.results,
        {
          searchType: searchResult.searchType,
          domainsProcessed: normalizedUrls.length,
          domainsCached: cacheAnalysis.cachedDomains.length,
          domainsScraped: cacheAnalysis.staleOrMissingDomains.length,
          remainingRequests: searchResult.remainingRequests,
          totalRequests: searchResult.totalRequests,
          remainingCacheSearches: searchResult.remainingCacheSearches,
          totalCacheSearches: searchResult.totalCacheSearches,
          jobTitles: normalizedJobTitles
        },
        searchResult.parallelResult
      );

      const response = this.responseFormatterService.formatSuccessResponse(responseData, requestId);
      res.json(response);

    } catch (error) {
      if (error.name === 'AbortError') return;

      this.responseFormatterService.setCacheHeaders(res, false, false);
      
      const statusCode = error.code && error.code.includes('LIMIT_EXCEEDED') ? 429 : 500;
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      
      res.status(statusCode).json(errorResponse);
    }
  }

  async searchCacheOnly(req, res) {
    const requestId = this.validationService.generateRequestId();
    const { userId, userEmail } = this.validationService.extractUserInfo(req);
    const isStressTest = this.validationService.isStressTest(req);
    
    try {
      const { jobTitles, urls, careerPages, careerPageUrls } = req.body;
      
      const normalizedJobTitles = this.validationService.validateJobTitles(jobTitles);
      const normalizedUrls = this.validationService.validateAndNormalizeUrls(urls, careerPages, careerPageUrls);

      const cacheAnalysis = await this.searchCacheService.analyzeCacheStatus(normalizedUrls);
      const domainsWithCache = cacheAnalysis.cachedDomains;

      if (domainsWithCache.length === 0) {
        const responseData = this.responseFormatterService.formatCacheOnlyResponse([], {
          searchType: 'cache_only',
          domainsProcessed: normalizedUrls.length,
          domainsCached: 0,
          message: 'No cached data available for selected URLs'
        });

        return res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      }

      if (!isStressTest) {
        const cacheLimit = await this.userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
        
        if (cacheLimit.remaining < domainsWithCache.length) {
          const error = {
            code: 'CACHE_LIMIT_EXCEEDED',
            message: `Insufficient cache search credits. Need ${domainsWithCache.length}, have ${cacheLimit.remaining}.`,
            needed: domainsWithCache.length,
            available: cacheLimit.remaining
          };
          return res.status(429).json(this.responseFormatterService.formatErrorResponse(error, requestId));
        }

        await this.userPreferencesManager.incrementUsage(userId, 'cacheSearches', domainsWithCache.length);
      }

      const searchResults = [];
      const profileOptimizations = [];

      for (const url of domainsWithCache) {
        try {
          const pageData = await this.searchCacheService.getOptimizedCachedPageData(url);
          
          if (pageData) {
            const matches = this.jobMatchingService.findJobMatches(pageData, normalizedJobTitles);
            
            if (matches.jobTitles.length > 0) {
              this.addMatchesToResults(matches, pageData, url, searchResults);
            }
          }
        } catch (error) {
          this.config.smartLog('fail', `Error processing cached URL ${url}: ${error.message}`);
        }
      }

      const filteredResults = this.jobMatchingService.filterJobResultsWithFuzzyMatching(
        searchResults, 
        normalizedJobTitles, 
        this.config.search.fuzzyThreshold
      );
      
      const updatedCacheLimit = isStressTest ? 
        { remaining: 999999, limit: 999999 } :
        await this.userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');

      const responseData = this.responseFormatterService.formatCacheOnlyResponse(filteredResults, {
        searchType: 'cache_only',
        domainsProcessed: domainsWithCache.length,
        domainsCached: domainsWithCache.length,
        remainingCacheSearches: updatedCacheLimit.remaining,
        totalCacheSearches: updatedCacheLimit.limit,
        profileOptimizations: profileOptimizations.length,
        jobTitles: normalizedJobTitles
      });

      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));

    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  async searchCareerPagesStream(req, res) {
    const jobTitles = JSON.parse(req.query.jobTitles || '[]');
    const careerPages = JSON.parse(req.query.careerPages || '[]');
    const { userId, userEmail } = this.validationService.extractUserInfo(req);
    
    const eventStream = new EventStream(req, res, this.config);
    
    try {
      const normalizedJobTitles = this.validationService.validateJobTitles(jobTitles);
      const normalizedUrls = this.validationService.validateAndNormalizeUrls(careerPages, [], []);

      const userPrefs = await this.userPreferencesManager.getUserPreferences(userId);
      const cacheAnalysis = await this.searchCacheService.analyzeCacheStatus(normalizedUrls);
      
      const cachedDomains = cacheAnalysis.cachedDomains;
      const toScrapeDomains = cacheAnalysis.staleOrMissingDomains;
      
      const cacheLimit = await this.userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
      const scrapingLimit = await this.userPreferencesManager.checkUserLimit(userId, 'maxScrapingRequests');
      
      if (cacheLimit.remaining < cachedDomains.length) {
        eventStream.sendError('CACHE_LIMIT_EXCEEDED', {
          needed: cachedDomains.length,
          available: cacheLimit.remaining
        });
        eventStream.sendDone({ cached: 0, scraped: 0, error: 'CACHE_LIMIT_EXCEEDED' });
        return;
      }
      
      if (scrapingLimit.remaining < toScrapeDomains.length) {
        eventStream.sendError('SCRAPING_LIMIT_EXCEEDED', {
          needed: toScrapeDomains.length,
          available: scrapingLimit.remaining
        });
        eventStream.sendDone({ cached: 0, scraped: 0, error: 'SCRAPING_LIMIT_EXCEEDED' });
        return;
      }

      if (cachedDomains.length > 0) {
        await this.userPreferencesManager.incrementUsage(userId, 'cacheSearches', cachedDomains.length);
      }
      if (toScrapeDomains.length > 0) {
        await this.userPreferencesManager.incrementUsage(userId, 'scrapingRequests', toScrapeDomains.length);
      }

      await this.processCachedDomainsForStream(cachedDomains, normalizedJobTitles, eventStream);

      if (toScrapeDomains.length === 0) {
        eventStream.sendDone({ cached: cachedDomains.length, scraped: 0 });
        return;
      }

      await this.processScrapingDomainsForStream(toScrapeDomains, normalizedJobTitles, userId, userEmail, eventStream);
      
      eventStream.sendDone({ cached: cachedDomains.length, scraped: toScrapeDomains.length });

    } catch (error) {
      if (!eventStream.isClientConnected()) return;
      eventStream.sendError('INTERNAL_ERROR', { message: error.message });
      eventStream.sendDone({ cached: 0, scraped: 0, error: error.message });
    }
  }

  async searchCacheOpportunities(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const { jobTitle } = req.body;
      
      if (!jobTitle) {
        const error = this.validationService.createValidationError('jobTitle required');
        return res.status(400).json(this.responseFormatterService.formatErrorResponse(error, requestId));
      }

      const opportunities = await this.searchCacheService.searchCacheOpportunities(jobTitle);
      const filteredOpportunities = this.jobMatchingService.filterJobResultsWithFuzzyMatching(
        opportunities, 
        [jobTitle], 
        this.config.search.fuzzyThreshold
      );

      const responseData = {
        opportunities: filteredOpportunities,
        totalCount: filteredOpportunities.length,
        totalBeforeFilter: opportunities.length,
        excludedCount: opportunities.length - filteredOpportunities.length
      };

      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));

    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  async checkCacheStatus(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const { url } = req.body;
      
      if (!url) {
        const error = this.validationService.createValidationError('URL required');
        return res.status(400).json(this.responseFormatterService.formatErrorResponse(error, requestId));
      }

      const status = await this.searchCacheService.checkCacheStatus(url);
      const responseData = this.responseFormatterService.formatCacheStatusResponse(status.cached, status.ageInHours);
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));

    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  async refreshCache(req, res) {
    const requestId = this.validationService.generateRequestId();
    const { userId, userEmail } = this.validationService.extractUserInfo(req);
    
    try {
      const { url } = req.body;
      const validatedUrl = this.validationService.validateSingleUrl(url);

      await this.searchCacheService.refreshCache(validatedUrl);

      const coordinator = require('../scrapers/ScrapingCoordinator').getInstance();
      const result = await coordinator.coordinatedScrape(validatedUrl, '', {
        userId,
        userEmail,
        forceRefresh: true
      });

      if (!result.success) {
        const error = this.validationService.createValidationError('Page scraping failed');
        return res.status(500).json(this.responseFormatterService.formatErrorResponse(error, requestId));
      }

      const responseData = {
        message: 'Cache refreshed successfully',
        timestamp: new Date().toISOString(),
        notificationReceived: result.source === 'cache-shared'
      };

      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));

    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  addMatchesToResults(matches, pageData, url, searchResults) {
    if (matches.links.length > 0) {
      for (const link of matches.links) {
        searchResults.push({
          title: link.text || link.title || matches.jobTitles[0],
          url: link.url,
          description: link.text || link.title || '',
          date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
          source: this.searchCacheService.extractShortDomain(url),
          confidence: matches.relevance?.confidence || 0
        });
      }
    } else {
      searchResults.push({
        title: `${matches.jobTitles[0]} - ${this.searchCacheService.extractShortDomain(url)}`,
        url: url,
        description: this.jobMatchingService.extractJobDescription(pageData.text || ''),
        date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        source: this.searchCacheService.extractShortDomain(url),
        confidence: matches.relevance?.confidence || 0
      });
    }
  }

  async processCachedDomainsForStream(domains, jobTitles, eventStream) {
    eventStream.sendProgress('cache', `Processing ${domains.length} cached domains...`);
    
    const cacheResults = [];
    for (const url of domains) {
      if (!eventStream.isClientConnected()) break;

      const pageData = await this.searchCacheService.getOptimizedCachedPageData(url);
      if (!pageData) continue;

      const matches = this.jobMatchingService.findJobMatches(pageData, jobTitles);
      if (matches.links?.length > 0) {
        const results = matches.links.map(link => ({
          title: link.text || link.title || matches.jobTitles[0],
          url: link.url,
          description: link.text || link.title || '',
          source: this.searchCacheService.extractShortDomain(url)
        }));

        cacheResults.push(...results);

        if (this.config.flags?.enablePartialEmit && results.length > 0) {
          eventStream.sendPartialResult({
            domain: this.searchCacheService.extractShortDomain(url),
            url: url,
            status: 'from-cache',
            cacheLevel: 'full',
            results: results,
            totalBeforeFilter: results.length,
            excludedCount: 0
          });
        }
      }
    }

    const filteredResults = this.jobMatchingService.filterJobResultsWithFuzzyMatching(
      cacheResults, 
      jobTitles, 
      this.config.search.fuzzyThreshold
    );
    
    eventStream.sendCacheComplete(filteredResults, cacheResults.length, cacheResults.length - filteredResults.length);
  }

  async processScrapingDomainsForStream(domains, jobTitles, userId, userEmail, eventStream) {
    eventStream.sendProgress('scraping', `Starting scraping for ${domains.length} domains...`);
    
    const scrapingService = require('../scrapingService');
    const onPartialResult = eventStream.createPartialResultHandler();
    
    const parallelResult = await scrapingService.scrapeMultipleCareerPages(
      userId, 
      userEmail, 
      `Search: ${jobTitles.join(', ')}`, 
      domains,
      {
        useCache: false,
        saveCache: true,
        maxRetries: this.config.retries?.maxRetries || 3,
        timeout: this.config.timeouts?.globalJobMs || 120000
      },
      null,
      onPartialResult
    );

    let completedCount = 0;
    for (const result of parallelResult.results || []) {
      if (!eventStream.isClientConnected()) break;

      completedCount++;
      let results = [];

      if (result.success && result.result) {
        const matches = this.jobMatchingService.findJobMatches(result.result, jobTitles);
        if (matches.links?.length > 0) {
          results = matches.links.map(link => ({
            title: link.text || link.title || matches.jobTitles[0],
            url: link.url,
            description: link.text || link.title || '',
            date: result.result.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
            source: this.searchCacheService.extractShortDomain(result.url),
            confidence: matches.relevance?.confidence || 0
          }));
        }
      }

      const filteredResults = this.jobMatchingService.filterJobResultsWithFuzzyMatching(
        results, 
        jobTitles, 
        this.config.search.fuzzyThreshold
      );

      eventStream.sendScrapingProgress({
        url: result.url,
        source: result.source || 'error',
        results: filteredResults,
        totalBeforeFilter: results.length,
        excludedCount: results.length - filteredResults.length
      }, completedCount, domains.length);
    }
  }
}

module.exports = SearchController;