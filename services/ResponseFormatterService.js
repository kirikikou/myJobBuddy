class ResponseFormatterService {
  constructor(config) {
    this.config = config;
    this.paginationDefaults = {
      limit: this.config.pagination?.defaultLimit || 50,
      maxLimit: this.config.pagination?.maxLimit || 500,
      defaultSort: this.config.pagination?.defaultSort || 'relevance',
      enableCursor: this.config.pagination?.enableCursor || true
    };
    this.compressionThreshold = this.config.response?.compressionThreshold || 1000;
  }

  formatSuccessResponse(data, requestId = null, pagination = null) {
    const response = {
      success: true,
      ...data
    };

    if (requestId) {
      response.requestId = requestId;
    }

    if (pagination) {
      response.pagination = this.normalizePagination(pagination);
    }

    response.timestamp = new Date().toISOString();
    
    if (this.shouldCompress(response)) {
      response._compressed = true;
      this.config.smartLog('format', 'Response marked for compression');
    }
    
    return response;
  }

  formatErrorResponse(error, requestId = null) {
    const response = {
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
        type: error.type || 'server_error'
      }
    };

    if (requestId) {
      response.requestId = requestId;
    }

    if (error.needed !== undefined) response.needed = error.needed;
    if (error.available !== undefined) response.available = error.available;
    if (error.upgradeRecommended !== undefined) response.upgradeRecommended = error.upgradeRecommended;
    if (error.currentPlan) response.currentPlan = error.currentPlan;

    response.timestamp = new Date().toISOString();
    return response;
  }

  formatSearchResults(results, metadata, paginationOptions = {}) {
    const startTime = Date.now();
    
    const {
      limit = this.paginationDefaults.limit,
      offset = 0,
      sort = this.paginationDefaults.defaultSort,
      enableLazy = false,
      cursor = null
    } = paginationOptions;
    
    const filteredResults = this.applyResultFilters(results, metadata.jobTitles);
    const excludedCount = results.length - filteredResults.length;
    
    let paginatedResults;
    let paginationInfo;
    
    if (cursor && this.paginationDefaults.enableCursor) {
      const cursorResult = this.applyCursorPagination(filteredResults, cursor, limit, sort);
      paginatedResults = cursorResult.results;
      paginationInfo = cursorResult.pagination;
    } else {
      const offsetResult = this.applyOffsetPagination(filteredResults, offset, limit, sort);
      paginatedResults = offsetResult.results;
      paginationInfo = offsetResult.pagination;
    }
    
    if (enableLazy && paginatedResults.length > 20) {
      paginatedResults = this.applyLazyLoading(paginatedResults);
    }
    
    const formattingTime = Date.now() - startTime;
    
    this.config.smartLog('format', 
      `Results formatted: ${paginatedResults.length}/${filteredResults.length} in ${formattingTime}ms`
    );

    return {
      results: paginatedResults,
      searchType: metadata.searchType || 'standard',
      domainsProcessed: metadata.domainsProcessed || 0,
      domainsCached: metadata.domainsCached || 0,
      domainsScraped: metadata.domainsScraped || 0,
      resultsBeforeFilter: results.length,
      resultsAfterFilter: filteredResults.length,
      excludedResults: excludedCount,
      processingTime: metadata.processingTime || 'unknown',
      formattingTime,
      message: this.generateSearchMessage(metadata, paginatedResults.length, excludedCount),
      pagination: paginationInfo
    };
  }

  applyOffsetPagination(results, offset, limit, sort) {
    const sortedResults = this.sortResults(results, sort);
    const total = sortedResults.length;
    const normalizedLimit = Math.min(limit, this.paginationDefaults.maxLimit);
    const normalizedOffset = Math.max(0, offset);
    
    const paginatedResults = sortedResults.slice(normalizedOffset, normalizedOffset + normalizedLimit);
    const hasMore = normalizedOffset + normalizedLimit < total;
    
    return {
      results: paginatedResults,
      pagination: {
        type: 'offset',
        limit: normalizedLimit,
        offset: normalizedOffset,
        total,
        hasMore,
        nextOffset: hasMore ? normalizedOffset + normalizedLimit : null,
        currentPage: Math.floor(normalizedOffset / normalizedLimit) + 1,
        totalPages: Math.ceil(total / normalizedLimit)
      }
    };
  }

  applyCursorPagination(results, cursor, limit, sort) {
    const sortedResults = this.sortResults(results, sort);
    const normalizedLimit = Math.min(limit, this.paginationDefaults.maxLimit);
    
    let startIndex = 0;
    if (cursor) {
      const decodedCursor = this.decodeCursor(cursor);
      if (decodedCursor && decodedCursor.lastId) {
        startIndex = sortedResults.findIndex(r => 
          this.generateResultId(r) === decodedCursor.lastId
        );
        if (startIndex > 0) startIndex++;
      }
    }
    
    const paginatedResults = sortedResults.slice(startIndex, startIndex + normalizedLimit);
    const hasMore = startIndex + normalizedLimit < sortedResults.length;
    
    const nextCursor = hasMore && paginatedResults.length > 0 ? 
      this.encodeCursor({
        lastId: this.generateResultId(paginatedResults[paginatedResults.length - 1]),
        sort,
        timestamp: Date.now()
      }) : null;
    
    return {
      results: paginatedResults,
      pagination: {
        type: 'cursor',
        limit: normalizedLimit,
        hasMore,
        nextCursor,
        previousCursor: cursor || null,
        total: sortedResults.length,
        currentCount: paginatedResults.length
      }
    };
  }

  applyLazyLoading(results) {
    return results.map((result, index) => {
      if (index < 10) {
        return result;
      }
      
      return {
        ...result,
        description: result.description ? result.description.substring(0, 100) + '...' : '',
        lazyLoaded: true,
        fullDataUrl: `/api/results/${this.generateResultId(result)}`
      };
    });
  }

  sortResults(results, sortBy) {
    switch (sortBy) {
      case 'relevance':
        return [...results].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      case 'date':
        return [...results].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      case 'title':
        return [...results].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'source':
        return [...results].sort((a, b) => (a.source || '').localeCompare(b.source || ''));
      case 'confidence':
        return [...results].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      default:
        return results;
    }
  }

  formatCacheOnlyResponse(results, metadata, paginationOptions = {}) {
    const response = this.formatSearchResults(results, {
      ...metadata,
      searchType: 'cache_only'
    }, paginationOptions);

    if (metadata.remainingCacheSearches !== undefined) {
      response.remainingCacheSearches = metadata.remainingCacheSearches;
      response.totalCacheSearches = metadata.totalCacheSearches;
    }

    if (metadata.oldCacheResults) {
      response.oldCacheResults = metadata.oldCacheResults;
    }

    if (metadata.profileOptimizations) {
      response.profileOptimizations = metadata.profileOptimizations;
    }

    if (metadata.fastTrackEligible) {
      response.fastTrackEligible = metadata.fastTrackEligible;
    }

    return response;
  }

  formatIntelligentParallelResponse(results, metadata, parallelResult, paginationOptions = {}) {
    const response = this.formatSearchResults(results, {
      ...metadata,
      searchType: 'intelligent_parallel'
    }, paginationOptions);

    if (metadata.remainingRequests !== undefined) {
      response.remainingRequests = metadata.remainingRequests;
      response.totalRequests = metadata.totalRequests;
    }

    if (metadata.remainingCacheSearches !== undefined) {
      response.remainingCacheSearches = metadata.remainingCacheSearches;
      response.totalCacheSearches = metadata.totalCacheSearches;
    }

    if (parallelResult) {
      response.parallelPerformance = {
        speedupRatio: parallelResult.parallelSpeedup || 0,
        reportPath: parallelResult.reportPath,
        timingPath: parallelResult.timingPath,
        diagnosticPath: parallelResult.diagnosticPath
      };

      response.processingStats = {
        total: metadata.domainsProcessed,
        successful: parallelResult.successCount || 0,
        failed: parallelResult.failureCount || 0,
        cached: metadata.domainsCached,
        scraped: metadata.domainsScraped,
        parallelSpeedup: parallelResult.parallelSpeedup || 0
      };
    }

    return response;
  }

  formatStreamingResponse(results, metadata, streamOptions = {}) {
    const {
      chunkSize = 20,
      enableCompression = true,
      includeMetadata = true
    } = streamOptions;
    
    const chunks = this.chunkResults(results, chunkSize);
    
    return {
      type: 'streaming',
      chunks: chunks.length,
      chunkSize,
      totalResults: results.length,
      metadata: includeMetadata ? metadata : null,
      compressed: enableCompression && this.shouldCompress({ results }),
      timestamp: new Date().toISOString()
    };
  }

  formatCacheStatusResponse(cached, ageInHours) {
    return {
      cached,
      ageInHours: ageInHours !== null ? Math.round(ageInHours * 10) / 10 : null
    };
  }

  formatScrapingSessionResponse(session, includeDetails = true) {
    const response = {
      sessionId: session.sessionId,
      userId: session.userId,
      status: session.status,
      startTime: session.startTime,
      totalUrls: session.totalUrls,
      processedUrls: session.processedUrls,
      successfulUrls: session.successfulUrls,
      failedUrls: session.failedUrls
    };
    
    if (includeDetails) {
      response.userEmail = session.userEmail;
      response.searchQuery = session.searchQuery;
      response.endTime = session.endTime;
      response.processingTime = session.endTime && session.startTime ? 
        new Date(session.endTime) - new Date(session.startTime) : null;
    }
    
    return response;
  }

  formatScrapingStatsResponse(stats) {
    return {
      stats: {
        activeSessions: stats.activeSessions || 0,
        totalProcessed: stats.totalProcessed || 0,
        successRate: Math.round((stats.successRate || 0) * 100) / 100,
        averageProcessingTime: Math.round(stats.averageProcessingTime || 0),
        queueSize: stats.queueSize || 0
      },
      timestamp: new Date().toISOString()
    };
  }

  formatDomainProfilesResponse(profiles, total, paginationOptions = {}) {
    const { limit = 20, offset = 0 } = paginationOptions;
    
    const formattedProfiles = profiles.map(profile => ({
      domain: profile.domain,
      step: profile.step || 'unknown',
      language: profile.language || 'en',
      platform: profile.platform || 'unknown',
      successRate: Math.round((profile.successRate || 0) * 100) / 100,
      attempts: profile.attempts || 0,
      lastSeen: profile.lastSeen,
      headless: profile.headless || false,
      fastTrackEligible: profile.fastTrackEligible || false
    }));
    
    const paginationResult = this.applyOffsetPagination(formattedProfiles, offset, limit, 'domain');

    return {
      profiles: paginationResult.results,
      total: total || formattedProfiles.length,
      pagination: paginationResult.pagination,
      timestamp: Date.now()
    };
  }

  formatLanguageDetectionResponse(lang, confidence, detectedPatterns, supportedLanguages, textLength) {
    return {
      lang,
      confidence: Math.round(confidence),
      detectedPatterns: detectedPatterns || [],
      supportedLanguages: supportedLanguages || 0,
      processedTextLength: textLength || 0
    };
  }

  formatJobFilterResponse(matches, totalJobs, paginationOptions = {}) {
    const paginationResult = this.applyOffsetPagination(
      matches, 
      paginationOptions.offset || 0, 
      paginationOptions.limit || 50, 
      'relevance'
    );
    
    const stats = {
      total: totalJobs,
      matched: matches.length,
      avgScore: matches.length > 0 ? 
        Math.round(matches.reduce((sum, m) => sum + m.score, 0) / matches.length) : 0,
      displayed: paginationResult.results.length
    };

    return {
      matches: paginationResult.results,
      stats,
      pagination: paginationResult.pagination
    };
  }

  formatWebhookResponse(registration) {
    return {
      registration: {
        id: registration.id,
        url: registration.url,
        events: registration.events,
        created: registration.created,
        active: registration.active
      }
    };
  }

  formatWebhookLogsResponse(logs, totalLogs, paginationOptions = {}) {
    const paginationResult = this.applyOffsetPagination(
      logs, 
      paginationOptions.offset || 0, 
      paginationOptions.limit || 100, 
      'date'
    );
    
    const formattedLogs = paginationResult.results.map(log => ({
      timestamp: log.timestamp,
      event: log.event,
      data: log.data,
      delivered: log.delivered
    }));

    return {
      items: formattedLogs,
      total: totalLogs || logs.length,
      pagination: paginationResult.pagination
    };
  }

  setCacheHeaders(res, cacheHit, bufferServed) {
    res.set('X-Cache-Status', cacheHit ? 'HIT' : 'MISS');
    res.set('X-Buffer-Status', bufferServed ? 'SERVED' : 'LIVE');
    this.config.smartLog('buffer', `cache:${cacheHit ? 'hit' : 'miss'} buffer:${bufferServed ? 'served' : 'live'}`);
  }

  applyResultFilters(results, jobTitles) {
    if (!this.config.search || !jobTitles || !results.length) return results;
    
    try {
      const dictionaries = require('../dictionaries');
      return dictionaries.filterJobResultsWithFuzzyMatching(
        results, 
        jobTitles, 
        this.config.search.fuzzyThreshold || 0.8
      );
    } catch (error) {
      this.config.smartLog('fail', `Error applying result filters: ${error.message}`);
      return results;
    }
  }

  generateSearchMessage(metadata, resultsCount, excludedCount) {
    const { searchType, domainsProcessed, domainsCached, domainsScraped, parallelSpeedup } = metadata;
    
    let message = '';

    if (searchType === 'cache_only') {
      message = `Cache search completed: ${domainsCached} cached domains processed = ${resultsCount} results`;
    } else if (searchType === 'intelligent_parallel') {
      message = `Intelligent parallel search completed: ${resultsCount} results found from ${domainsScraped}/${domainsProcessed} domains`;
      if (parallelSpeedup) {
        message += ` (${parallelSpeedup.toFixed(1)}x speedup)`;
      }
    } else {
      message = `Search completed: ${resultsCount} results found from ${domainsProcessed} domains`;
    }

    if (excludedCount > 0) {
      message += ` (${excludedCount} filtered)`;
    }

    return message;
  }

  addPaginationHeaders(res, pagination) {
    if (pagination.type === 'offset') {
      res.set({
        'X-Page': pagination.currentPage.toString(),
        'X-Total-Pages': pagination.totalPages.toString(),
        'X-Total-Items': pagination.total.toString(),
        'X-Page-Size': pagination.limit.toString(),
        'X-Has-More': pagination.hasMore.toString()
      });
    } else if (pagination.type === 'cursor') {
      res.set({
        'X-Total-Items': pagination.total.toString(),
        'X-Page-Size': pagination.limit.toString(),
        'X-Has-More': pagination.hasMore.toString(),
        'X-Current-Count': pagination.currentCount.toString()
      });
      
      if (pagination.nextCursor) {
        res.set('X-Next-Cursor', pagination.nextCursor);
      }
    }
  }

  addRateLimitHeaders(res, limit, remaining, resetTime) {
    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toString()
    });
  }

  chunkResults(results, chunkSize) {
    const chunks = [];
    for (let i = 0; i < results.length; i += chunkSize) {
      chunks.push(results.slice(i, i + chunkSize));
    }
    return chunks;
  }

  encodeCursor(cursorData) {
    return Buffer.from(JSON.stringify(cursorData)).toString('base64');
  }

  decodeCursor(cursor) {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch (error) {
      this.config.smartLog('format', `Invalid cursor format: ${error.message}`);
      return null;
    }
  }

  generateResultId(result) {
    return Buffer.from(result.url || result.title || Math.random().toString()).toString('base64').substring(0, 12);
  }

  normalizePagination(pagination) {
    return {
      ...pagination,
      limit: Math.min(pagination.limit || this.paginationDefaults.limit, this.paginationDefaults.maxLimit),
      hasMore: Boolean(pagination.hasMore),
      total: Math.max(0, pagination.total || 0)
    };
  }

  shouldCompress(response) {
    return JSON.stringify(response).length > this.compressionThreshold;
  }

  getFormatterStats() {
    return {
      paginationDefaults: this.paginationDefaults,
      compressionThreshold: this.compressionThreshold
    };
  }
}

module.exports = ResponseFormatterService;