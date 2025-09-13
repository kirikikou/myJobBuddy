module.exports = {
    cache: {
      scoreCache: {
        maxSize: process.env.SCORE_CACHE_MAX_SIZE || 5000,
        ttl: process.env.SCORE_CACHE_TTL || 7200000,
        cleanup: process.env.SCORE_CACHE_CLEANUP || 300000
      },
      indexTTL: process.env.CACHE_INDEX_TTL || 3600000,
      maxIndexSize: process.env.CACHE_MAX_INDEX_SIZE || 10000,
      indexRebuildThreshold: process.env.INDEX_REBUILD_THRESHOLD || 3600000,
      freshnessHours: process.env.CACHE_FRESHNESS_HOURS || 24,
      retentionDays: process.env.CACHE_RETENTION_DAYS || 31
    },
  
    streaming: {
      chunkSize: process.env.STREAM_CHUNK_SIZE || 100,
      maxMemoryMB: process.env.STREAM_MAX_MEMORY_MB || 50,
      processTimeout: process.env.STREAM_PROCESS_TIMEOUT || 30000,
      maxConcurrency: process.env.STREAM_MAX_CONCURRENCY || 5
    },
  
    pagination: {
      defaultLimit: process.env.PAGINATION_DEFAULT_LIMIT || 50,
      maxLimit: process.env.PAGINATION_MAX_LIMIT || 500,
      defaultSort: process.env.PAGINATION_DEFAULT_SORT || 'relevance',
      enableCursor: process.env.PAGINATION_ENABLE_CURSOR === 'true'
    },
  
    matching: {
      fuzzyThreshold: process.env.MATCHING_FUZZY_THRESHOLD || 0.8,
      partialThreshold: process.env.MATCHING_PARTIAL_THRESHOLD || 0.6,
      minimumThreshold: process.env.MATCHING_MINIMUM_THRESHOLD || 0.3,
      enableScoreCache: process.env.MATCHING_ENABLE_SCORE_CACHE !== 'false',
      precomputeCommonScores: process.env.MATCHING_PRECOMPUTE_SCORES === 'true'
    },
  
    search: {
      defaultLimit: process.env.SEARCH_DEFAULT_LIMIT || 100,
      maxLimit: process.env.SEARCH_MAX_LIMIT || 1000,
      fuzzyThreshold: process.env.SEARCH_FUZZY_THRESHOLD || 0.8,
      enableStreaming: process.env.SEARCH_ENABLE_STREAMING !== 'false',
      streamingThreshold: process.env.SEARCH_STREAMING_THRESHOLD || 200
    },
  
    response: {
      compressionThreshold: process.env.RESPONSE_COMPRESSION_THRESHOLD || 1000,
      enableLazyLoading: process.env.RESPONSE_ENABLE_LAZY_LOADING === 'true',
      lazyLoadingThreshold: process.env.RESPONSE_LAZY_LOADING_THRESHOLD || 20
    },
  
    performance: {
      targetResponseTimeMs: process.env.PERF_TARGET_RESPONSE_TIME || 3000,
      maxMemoryUsageMB: process.env.PERF_MAX_MEMORY_MB || 100,
      targetThroughputPerMin: process.env.PERF_TARGET_THROUGHPUT || 500,
      maxCpuUsagePercent: process.env.PERF_MAX_CPU_USAGE || 80,
      enableMetrics: process.env.PERF_ENABLE_METRICS !== 'false',
      metricsInterval: process.env.PERF_METRICS_INTERVAL || 30000
    },
  
    monitoring: {
      logPerformanceMetrics: process.env.MONITORING_LOG_PERF_METRICS !== 'false',
      alertThresholds: {
        responseTime: process.env.MONITORING_ALERT_RESPONSE_TIME || 5000,
        errorRate: process.env.MONITORING_ALERT_ERROR_RATE || 0.05,
        memoryUsage: process.env.MONITORING_ALERT_MEMORY_USAGE || 150,
        cacheHitRate: process.env.MONITORING_ALERT_CACHE_HIT_RATE || 0.5
      },
      enableAlerts: process.env.MONITORING_ENABLE_ALERTS === 'true'
    },
  
    optimization: {
      enableIndexing: process.env.OPT_ENABLE_INDEXING !== 'false',
      enableStreaming: process.env.OPT_ENABLE_STREAMING !== 'false',
      enableScoreCache: process.env.OPT_ENABLE_SCORE_CACHE !== 'false',
      enablePagination: process.env.OPT_ENABLE_PAGINATION !== 'false',
      autoOptimization: process.env.OPT_AUTO_OPTIMIZATION === 'true',
      profileOptimizations: process.env.OPT_PROFILE_OPTIMIZATIONS === 'true'
    }
  };