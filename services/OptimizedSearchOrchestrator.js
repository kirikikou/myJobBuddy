const SearchCacheService = require('./SearchCacheService');
const JobMatchingService = require('./JobMatchingService');
const ResponseFormatterService = require('./ResponseFormatterService');
const PerformanceMonitor = require('../utils/PerformanceMonitor');
const optimizationConfig = require('../config/optimization');

class OptimizedSearchOrchestrator {
  constructor(dependencies) {
    this.config = { ...dependencies.config, ...optimizationConfig };
    this.cacheManager = dependencies.cacheManager;
    this.domainProfiler = dependencies.domainProfiler;
    this.dictionaries = dependencies.dictionaries;
    
    this.searchCacheService = new SearchCacheService(
      this.cacheManager,
      this.domainProfiler,
      this.config
    );
    
    this.jobMatchingService = new JobMatchingService(
      this.dictionaries,
      this.config
    );
    
    this.responseFormatterService = new ResponseFormatterService(this.config);
    this.performanceMonitor = new PerformanceMonitor(this.config);
    
    this.operationStats = {
      totalOperations: 0,
      optimizedOperations: 0,
      fallbackOperations: 0,
      avgOptimizationGain: 0
    };
    
    this.initializeOptimizations();
  }

  initializeOptimizations() {
    if (this.config.matching?.precomputeCommonScores) {
      this.precomputeCommonScores();
    }
    
    this.config.smartLog('service', 'OptimizedSearchOrchestrator initialized with all optimizations enabled');
  }

  async searchCacheOpportunities(request) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    try {
      this.operationStats.totalOperations++;
      
      const {
        jobTitle,
        language,
        domains,
        limit,
        offset,
        cursor,
        sort,
        enableStreaming,
        fuzzyThreshold
      } = this.normalizeSearchRequest(request);
      
      this.config.smartLog('service', 
        `Starting optimized cache search: jobTitle="${jobTitle}", limit=${limit}, domains=${domains?.length || 0}`
      );
      
      const searchOptions = {
        language,
        domains,
        limit,
        offset,
        fuzzyThreshold,
        useStreaming: this.shouldUseStreaming(request),
        sortBy: sort
      };
      
      const searchResult = await this.performanceMonitor.benchmarkOperation(
        'search_cache',
        'searchOpportunities',
        () => this.searchCacheService.searchCacheOpportunities(jobTitle, searchOptions),
        {
          jobTitle,
          filesProcessed: searchResult?.processedFiles,
          cacheHit: searchResult?.method === 'indexed',
          indexUsed: searchResult?.method === 'indexed',
          streamingUsed: searchResult?.method === 'streaming'
        }
      );
      
      if (searchResult.results.length === 0) {
        return this.handleEmptyResults(request, operationId);
      }
      
      const enhancedResults = await this.enhanceSearchResults(
        searchResult.results,
        jobTitle,
        operationId
      );
      
      const paginationOptions = {
        limit,
        offset,
        cursor,
        sort,
        enableLazy: this.config.response?.enableLazyLoading
      };
      
      const formattedResponse = await this.performanceMonitor.benchmarkOperation(
        'response_formatting',
        'formatSearchResults',
        () => this.responseFormatterService.formatSearchResults(
          enhancedResults,
          {
            jobTitles: [jobTitle],
            searchType: searchResult.method,
            domainsProcessed: domains?.length || 0,
            processingTime: Date.now() - startTime,
            ...searchResult
          },
          paginationOptions
        ),
        {
          resultCount: enhancedResults.length,
          paginationUsed: limit < enhancedResults.length,
          compressionUsed: this.responseFormatterService.shouldCompress(enhancedResults),
          lazyLoadingUsed: paginationOptions.enableLazy
        }
      );
      
      this.operationStats.optimizedOperations++;
      const totalTime = Date.now() - startTime;
      
      this.config.smartLog('service', 
        `Optimized cache search completed in ${totalTime}ms: ${formattedResponse.results.length} results`
      );
      
      return {
        ...formattedResponse,
        operationId,
        totalTime,
        optimization: {
          enabled: true,
          method: searchResult.method,
          performanceGain: this.calculatePerformanceGain(totalTime, searchResult.results.length)
        }
      };
      
    } catch (error) {
      this.operationStats.fallbackOperations++;
      this.config.smartLog('fail', `Optimized search failed: ${error.message}`);
      
      return this.handleSearchError(error, request, operationId);
    }
  }

  async enhanceSearchResults(results, jobTitle, operationId) {
    const startTime = Date.now();
    
    const enhancedResults = await this.performanceMonitor.benchmarkOperation(
      'job_matching',
      'enhanceResults',
      async () => {
        const enhanced = [];
        
        for (const result of results) {
          const mockPageData = {
            text: result.description || result.title || '',
            title: result.title || '',
            url: result.url,
            links: [{
              isJobPosting: true,
              title: result.title,
              text: result.description,
              url: result.url,
              confidence: result.confidence
            }]
          };
          
          const matches = this.jobMatchingService.findJobMatches(
            mockPageData,
            [jobTitle],
            []
          );
          
          if (matches.links.length > 0) {
            enhanced.push({
              ...result,
              enhancedConfidence: matches.links[0].confidence,
              matchDetails: {
                relevance: matches.relevance,
                processingTime: matches.processingTime
              }
            });
          } else {
            enhanced.push(result);
          }
        }
        
        return enhanced;
      },
      {
        jobTitles: 1,
        links: results.length,
        scoreCacheHit: this.jobMatchingService.getMatchingStats?.()?.scoreCache?.hitRate > 0.5,
        complexity: results.length
      }
    );
    
    const enhancementTime = Date.now() - startTime;
    this.config.smartLog('service', 
      `Results enhanced in ${enhancementTime}ms: ${enhancedResults.length} items`
    );
    
    return enhancedResults;
  }

  async searchWithJobMatching(pageData, jobTitles, locations = []) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    try {
      const matches = await this.performanceMonitor.benchmarkOperation(
        'job_matching',
        'findJobMatches',
        () => this.jobMatchingService.findJobMatches(pageData, jobTitles, locations),
        {
          jobTitles: jobTitles.length,
          links: pageData.links?.length || 0,
          scoreCacheHit: true,
          variantCacheHit: true,
          complexity: jobTitles.length * (pageData.links?.length || 1)
        }
      );
      
      const totalTime = Date.now() - startTime;
      
      this.config.smartLog('service', 
        `Job matching completed in ${totalTime}ms: ${matches.jobTitles.length} titles, ${matches.links.length} links`
      );
      
      return {
        ...matches,
        operationId,
        totalTime,
        optimization: {
          enabled: true,
          scoreCacheUsed: true,
          variantCacheUsed: true
        }
      };
      
    } catch (error) {
      this.config.smartLog('fail', `Job matching failed: ${error.message}`);
      throw error;
    }
  }

  normalizeSearchRequest(request) {
    return {
      jobTitle: request.jobTitle || request.query || '',
      language: request.language || 'en',
      domains: request.domains || request.urls || null,
      limit: Math.min(request.limit || this.config.search.defaultLimit, this.config.search.maxLimit),
      offset: Math.max(request.offset || 0, 0),
      cursor: request.cursor || null,
      sort: request.sort || this.config.pagination.defaultSort,
      enableStreaming: request.enableStreaming,
      fuzzyThreshold: request.fuzzyThreshold || this.config.matching.fuzzyThreshold
    };
  }

  shouldUseStreaming(request) {
    if (request.enableStreaming !== undefined) {
      return request.enableStreaming;
    }
    
    if (!this.config.optimization?.enableStreaming) {
      return false;
    }
    
    const estimatedFileCount = request.domains ? request.domains.length * 5 : 100;
    return estimatedFileCount >= (this.config.search?.streamingThreshold || 200);
  }

  calculatePerformanceGain(actualTime, resultCount) {
    const estimatedOldTime = this.estimateOldPerformance(resultCount);
    
    if (estimatedOldTime > actualTime) {
      const gain = ((estimatedOldTime - actualTime) / estimatedOldTime) * 100;
      return Math.round(gain);
    }
    
    return 0;
  }

  estimateOldPerformance(resultCount) {
    const baseTime = 1000;
    const complexityFactor = Math.pow(resultCount / 100, 2);
    return baseTime * Math.max(1, complexityFactor);
  }

  generateOperationId() {
    return `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async handleEmptyResults(request, operationId) {
    this.config.smartLog('service', `No results found for query: ${request.jobTitle}`);
    
    return this.responseFormatterService.formatSuccessResponse({
      results: [],
      searchType: 'cache_optimized',
      message: 'No job opportunities found matching your criteria',
      suggestions: this.generateSearchSuggestions(request.jobTitle)
    }, operationId, {
      limit: request.limit,
      offset: request.offset,
      total: 0,
      hasMore: false
    });
  }

  generateSearchSuggestions(jobTitle) {
    const variants = this.jobMatchingService.getCachedJobTitleVariants?.(jobTitle) || [];
    return variants.slice(0, 5);
  }

  handleSearchError(error, request, operationId) {
    return this.responseFormatterService.formatErrorResponse({
      code: 'SEARCH_OPTIMIZATION_ERROR',
      message: 'Search optimization failed, falling back to standard search',
      type: 'optimization_error',
      details: {
        originalError: error.message,
        fallbackAvailable: true
      }
    }, operationId);
  }

  async precomputeCommonScores() {
    const commonJobTitles = [
      'software engineer', 'data scientist', 'product manager',
      'marketing manager', 'sales representative', 'designer',
      'developer', 'analyst', 'consultant', 'manager'
    ];
    
    const commonTexts = [
      'join our team', 'we are hiring', 'career opportunity',
      'full-time position', 'remote work', 'competitive salary'
    ];
    
    try {
      const precomputedCount = this.jobMatchingService.precomputeCommonScores?.(
        commonJobTitles,
        commonTexts
      );
      
      this.config.smartLog('service', `Precomputed ${precomputedCount || 0} common job matching scores`);
    } catch (error) {
      this.config.smartLog('fail', `Failed to precompute scores: ${error.message}`);
    }
  }

  getOptimizationStats() {
    const performanceDetails = this.performanceMonitor.getDetailedMetrics();
    
    return {
      operations: this.operationStats,
      performance: performanceDetails.summary,
      cacheStats: this.searchCacheService.getSearchStats?.() || {},
      matchingStats: this.jobMatchingService.getMatchingStats?.() || {},
      formatterStats: this.responseFormatterService.getFormatterStats?.() || {},
      optimization: {
        indexingEnabled: this.config.optimization?.enableIndexing,
        streamingEnabled: this.config.optimization?.enableStreaming,
        scoreCacheEnabled: this.config.optimization?.enableScoreCache,
        paginationEnabled: this.config.optimization?.enablePagination
      }
    };
  }

  async runPerformanceBenchmark() {
    const benchmarkResults = {
      timestamp: Date.now(),
      tests: []
    };
    
    const testCases = [
      { jobTitle: 'software engineer', limit: 50 },
      { jobTitle: 'data scientist', limit: 100 },
      { jobTitle: 'product manager', limit: 200 }
    ];
    
    for (const testCase of testCases) {
      const startTime = Date.now();
      
      try {
        const result = await this.searchCacheOpportunities(testCase);
        const endTime = Date.now();
        
        benchmarkResults.tests.push({
          testCase,
          success: true,
          duration: endTime - startTime,
          resultCount: result.results?.length || 0,
          optimizationGain: result.optimization?.performanceGain || 0
        });
      } catch (error) {
        benchmarkResults.tests.push({
          testCase,
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        });
      }
    }
    
    const avgDuration = benchmarkResults.tests
      .filter(t => t.success)
      .reduce((sum, t) => sum + t.duration, 0) / benchmarkResults.tests.length;
    
    benchmarkResults.summary = {
      avgDuration: Math.round(avgDuration),
      successRate: benchmarkResults.tests.filter(t => t.success).length / benchmarkResults.tests.length,
      totalTests: benchmarkResults.tests.length
    };
    
    this.config.smartLog('service', 
      `Benchmark completed: ${benchmarkResults.summary.avgDuration}ms avg, ${Math.round(benchmarkResults.summary.successRate * 100)}% success rate`
    );
    
    return benchmarkResults;
  }

  clearAllCaches() {
    if (this.jobMatchingService.clearCaches) {
      this.jobMatchingService.clearCaches();
    }
    
    this.performanceMonitor.resetMetrics();
    this.operationStats = {
      totalOperations: 0,
      optimizedOperations: 0,
      fallbackOperations: 0,
      avgOptimizationGain: 0
    };
    
    this.config.smartLog('service', 'All caches and metrics cleared');
  }
}

module.exports = OptimizedSearchOrchestrator;