const EventStream = require('../services/sse/EventStream');
const ProfileQueueManager = require('../scrapers/ProfileQueueManager');

class SearchController {
  constructor(searchCacheService, searchCareerService, jobMatchingService, validationService, responseFormatterService, config, userPreferencesManager) {
    this.searchCacheService = searchCacheService;
    this.searchCareerService = searchCareerService;
    this.jobMatchingService = jobMatchingService;
    this.validationService = validationService;
    this.responseFormatterService = responseFormatterService;
    this.config = config;
    this.userPreferencesManager = userPreferencesManager;
    this.activeStreamSessions = new Map();
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
    const sessionId = `stream_${Date.now()}_${userId}`;
    
    await this.closeUserStreamSessions(userId);
    
    const eventStream = new EventStream(req, res, this.config);
    this.activeStreamSessions.set(sessionId, { 
      eventStream, 
      startTime: Date.now(), 
      userId: userId,
      domains: careerPages 
    });
    
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
        await this.finishStreamGracefully(eventStream, sessionId, { cached: 0, scraped: 0, error: 'CACHE_LIMIT_EXCEEDED' });
        return;
      }
      
      if (scrapingLimit.remaining < toScrapeDomains.length) {
        eventStream.sendError('SCRAPING_LIMIT_EXCEEDED', {
          needed: toScrapeDomains.length,
          available: scrapingLimit.remaining
        });
        await this.finishStreamGracefully(eventStream, sessionId, { cached: 0, scraped: 0, error: 'SCRAPING_LIMIT_EXCEEDED' });
        return;
      }

      if (cachedDomains.length > 0) {
        await this.userPreferencesManager.incrementUsage(userId, 'cacheSearches', cachedDomains.length);
        await this.processCachedDomainsForStream(cachedDomains, normalizedJobTitles, eventStream);
      }

      if (toScrapeDomains.length > 0) {
        await this.userPreferencesManager.incrementUsage(userId, 'scrapingRequests', toScrapeDomains.length);
        await this.processScrapingDomainsWithBuffer(toScrapeDomains, normalizedJobTitles, userId, userEmail, eventStream, sessionId);
      }
      
      await this.finishStreamGracefully(eventStream, sessionId, { cached: cachedDomains.length, scraped: toScrapeDomains.length });

    } catch (error) {
      if (!eventStream.isClientConnected()) {
        this.activeStreamSessions.delete(sessionId);
        return;
      }
      eventStream.sendError('INTERNAL_ERROR', { message: error.message });
      await this.finishStreamGracefully(eventStream, sessionId, { cached: 0, scraped: 0, error: error.message });
    }
  }

  async finishStreamGracefully(eventStream, sessionId, donePayload) {
    if (!eventStream.isClientConnected()) {
      this.activeStreamSessions.delete(sessionId);
      return;
    }

    eventStream.sendDone(donePayload);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.activeStreamSessions.delete(sessionId);
  }

  async closeUserStreamSessions(userId) {
    const sessionsToClose = [];
    
    for (const [sessionId, session] of this.activeStreamSessions.entries()) {
      if (session.userId === userId) {
        sessionsToClose.push(sessionId);
      }
    }
    
    if (sessionsToClose.length > 0) {
      this.config.smartLog('sse', `Closing ${sessionsToClose.length} existing stream sessions for user ${userId}`);
      
      for (const sessionId of sessionsToClose) {
        const session = this.activeStreamSessions.get(sessionId);
        
        if (session) {
          try {
            if (session.eventStream && session.eventStream.isClientConnected()) {
              session.eventStream.sendError('SESSION_REPLACED', { 
                message: 'New search started, closing previous session' 
              });
              session.eventStream.sendDone({ 
                cached: 0, 
                scraped: 0, 
                error: 'SESSION_REPLACED' 
              });
            }
            
            if (session.domains) {
              for (const domain of session.domains) {
                const domainHost = this.extractDomainHost(domain);
                try {
                  if (typeof ProfileQueueManager.cleanupUserRequests === 'function') {
                    await ProfileQueueManager.cleanupUserRequests(domainHost, userId);
                    this.config.smartLog('sse', `Cleaned up requests for domain ${domainHost} and user ${userId}`);
                  } else {
                    this.config.smartLog('buffer', `Skipping cleanup for ${domainHost} - method not available`);
                  }
                } catch (cleanupError) {
                  this.config.smartLog('fail', `Error cleaning up domain ${domainHost}: ${cleanupError.message}`);
                }
              }
            }
            
          } catch (error) {
            this.config.smartLog('fail', `Error closing session ${sessionId}: ${error.message}`);
          }
          
          this.activeStreamSessions.delete(sessionId);
        }
      }
      
      this.config.smartLog('sse', `Closed ${sessionsToClose.length} previous sessions for user ${userId}`);
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
    if (!eventStream.isClientConnected()) return;
    
    eventStream.sendProgress('cache', `Processing ${domains.length} cached domains...`);
    
    const cacheResults = [];
    for (const url of domains) {
      if (!eventStream.isClientConnected()) break;

      try {
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
      } catch (error) {
        this.config.smartLog('fail', `Error processing cached domain ${url}: ${error.message}`);
      }
    }

    const filteredResults = this.jobMatchingService.filterJobResultsWithFuzzyMatching(
      cacheResults, 
      jobTitles, 
      this.config.search.fuzzyThreshold
    );
    
    if (eventStream.isClientConnected()) {
      eventStream.sendCacheComplete(filteredResults, cacheResults.length, cacheResults.length - filteredResults.length);
    }
  }

  async processScrapingDomainsWithBuffer(domains, jobTitles, userId, userEmail, eventStream, sessionId) {
    if (!eventStream.isClientConnected()) return;
    
    eventStream.sendProgress('scraping', `Processing ${domains.length} domains through buffer system...`);
    this.config.smartLog('sse', `Starting buffer-integrated scraping for ${domains.length} domains`);
    
    const domainResults = new Map();
    const pendingDomains = new Set(domains);
    const completedDomains = new Set();
    const requestedDomains = new Set();
    
    const processResults = () => {
      let completedCount = completedDomains.size;
      for (const [domain, result] of domainResults.entries()) {
        if (!eventStream.isClientConnected()) break;
        
        let results = [];
        if (result.success && result.data) {
          const matches = this.jobMatchingService.findJobMatches(result.data, jobTitles);
          if (matches.links?.length > 0) {
            results = matches.links.map(link => ({
              title: link.text || link.title || matches.jobTitles[0],
              url: link.url,
              description: link.text || link.title || '',
              date: result.data.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
              source: this.searchCacheService.extractShortDomain(domain),
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
          url: domain,
          source: result.source || 'buffer',
          results: filteredResults,
          totalBeforeFilter: results.length,
          excludedCount: results.length - filteredResults.length
        }, completedCount, domains.length);
      }
    };
    
    for (const domain of domains) {
      if (!eventStream.isClientConnected()) break;
      
      const domainHost = this.extractDomainHost(domain);
      
      if (requestedDomains.has(domainHost)) {
        this.config.smartLog('sse', `Domain ${domainHost} already requested, skipping duplicate`);
        continue;
      }
      
      requestedDomains.add(domainHost);
      const requesterId = `${sessionId}_${domainHost}`;
      
      const bufferCallback = (result) => {
        if (!eventStream.isClientConnected()) return;
        
        this.config.smartLog('sse', `Buffer callback for ${domainHost}: ${result.success ? 'success' : 'failed'}`);
        
        domainResults.set(domain, result);
        completedDomains.add(domain);
        pendingDomains.delete(domain);
        
        processResults();
        
        if (completedDomains.size === domains.length) {
          this.config.smartLog('sse', `All ${domains.length} domains completed via buffer`);
        }
      };
      
      try {
        const slotRequest = await ProfileQueueManager.requestScrapingSlot(domainHost, requesterId, bufferCallback);
        
        if (slotRequest.allowed) {
          this.config.smartLog('sse', `Slot granted for ${domainHost} - starting scraping`);
          eventStream.sendProgress('scraping', `Scraping ${domainHost}...`);
          
          setImmediate(async () => {
            try {
              const scrapingService = require('../scrapingService');
              
              const scrapingOptions = {
                userId: userId,
                userEmail: userEmail,
                requesterId: requesterId,
                sessionId: requesterId,
                timeout: this.config.timeouts?.domainScrapingMs || 30000,
                skipCache: false,
                forceUserId: true
              };
              
              this.config.smartLog('scraper', `Starting scraping for ${domainHost} with userId=${userId}`);
              
              const result = await scrapingService.scrapeCareerPage(domain, scrapingOptions);
              
              if (result && result.success) {
                this.config.smartLog('scraper', `Scraping successful for ${domainHost}: ${result.data?.links?.length || 0} jobs found`);
              } else {
                this.config.smartLog('fail', `Scraping failed for ${domainHost}: ${result?.error || 'Unknown error'}`);
              }
              
              const cacheData = result && result.success ? result.data : null;
              await ProfileQueueManager.releaseScrapingSlot(domainHost, slotRequest.scraperId, cacheData);
              
            } catch (error) {
              this.config.smartLog('fail', `Scraping failed for ${domainHost}: ${error.message}`);
              await ProfileQueueManager.releaseScrapingSlot(domainHost, slotRequest.scraperId, null);
            }
          });
          
        } else if (slotRequest.reason === 'buffered') {
          const queueMaxWait = this.config.queue?.getMaxWaitTimeMs() || 180000;
          const waitMinutes = Math.ceil(queueMaxWait / 60000);
          
          this.config.smartLog('sse', `Domain ${domainHost} queued at position ${slotRequest.queuePosition}`);
          
          eventStream.sendProgress('queued', 
            `Domain ${domainHost} in buffer queue (position ${slotRequest.queuePosition})`, 
            { 
              domain: domainHost,
              position: slotRequest.queuePosition,
              estimatedWaitMinutes: waitMinutes,
              status: 'queued'
            }
          );
          
        } else {
          this.config.smartLog('fail', `Slot request failed for ${domainHost}: ${slotRequest.reason}`);
          domainResults.set(domain, { 
            success: false, 
            error: slotRequest.reason || 'Slot request failed',
            source: 'error'
          });
          completedDomains.add(domain);
          pendingDomains.delete(domain);
        }
        
      } catch (error) {
        this.config.smartLog('fail', `Buffer error for ${domainHost}: ${error.message}`);
        domainResults.set(domain, { 
          success: false, 
          error: error.message,
          source: 'error'
        });
        completedDomains.add(domain);
        pendingDomains.delete(domain);
      }
    }
    
    const maxWaitTime = this.config.queue?.getMaxWaitTimeMs() || 180000;
    const checkInterval = 2000;
    let elapsed = 0;
    
    while (pendingDomains.size > 0 && elapsed < maxWaitTime && eventStream.isClientConnected()) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }
    
    if (pendingDomains.size > 0) {
      this.config.smartLog('queue', `Timeout reached: ${pendingDomains.size} domains still pending`);
      for (const domain of pendingDomains) {
        domainResults.set(domain, { 
          success: false, 
          error: 'Timeout waiting in queue',
          source: 'timeout'
        });
        completedDomains.add(domain);
      }
      processResults();
    }
  }

  extractDomainHost(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  getActiveStreamSessions() {
    const sessions = [];
    for (const [sessionId, session] of this.activeStreamSessions.entries()) {
      sessions.push({
        sessionId,
        userId: session.userId,
        startTime: new Date(session.startTime).toISOString(),
        duration: Date.now() - session.startTime,
        connected: session.eventStream.isClientConnected(),
        domainsCount: session.domains?.length || 0
      });
    }
    return sessions;
  }

  async cleanupStreamSessions() {
    let cleaned = 0;
    for (const [sessionId, session] of this.activeStreamSessions.entries()) {
      if (!session.eventStream.isClientConnected()) {
        this.activeStreamSessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.config.smartLog('sse', `Cleaned up ${cleaned} disconnected stream sessions`);
    }
    
    return cleaned;
  }
}

module.exports = SearchController;