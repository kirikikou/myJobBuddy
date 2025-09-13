module.exports = {
    CPU_THRESHOLDS: {
      LOW_LOAD_PERCENT: 20,
      HIGH_LOAD_PERCENT: 80,
      CRITICAL_LOAD_PERCENT: 95,
      TARGET_UTILIZATION: 70
    },
    
    MEMORY_THRESHOLDS: {
      LOW_USAGE_MB: 1024,
      HIGH_USAGE_MB: 4096,
      CRITICAL_USAGE_MB: 6144,
      GC_TRIGGER_MB: 2048
    },
    
    PARALLELIZATION: {
      MAX_PARALLEL_JOBS: 10,
      MAX_CONCURRENT_SCRAPERS: 25,
      MAX_BATCH_SIZE: 15,
      PER_DOMAIN_CONCURRENCY: 2,
      QUEUE_BACKPRESSURE_THRESHOLD: 100
    },
    
    RESOURCE_LEVELS: {
      LOW: {
        maxParallel: 5,
        maxScrapers: 10,
        maxBatchSize: 8,
        perDomainConcurrency: 1,
        cpuLoadTarget: 0.5,
        memLimitMB: 1024,
        queueBackpressureThreshold: 50
      },
      MID: {
        maxParallel: 10,
        maxScrapers: 25,
        maxBatchSize: 15,
        perDomainConcurrency: 2,
        cpuLoadTarget: 0.7,
        memLimitMB: 2048,
        queueBackpressureThreshold: 100
      },
      HIGH: {
        maxParallel: 20,
        maxScrapers: 50,
        maxBatchSize: 25,
        perDomainConcurrency: 3,
        cpuLoadTarget: 0.9,
        memLimitMB: 4096,
        queueBackpressureThreshold: 200
      },
      SERVER: {
        maxParallel: 30,
        maxScrapers: 75,
        maxBatchSize: 40,
        perDomainConcurrency: 5,
        cpuLoadTarget: 0.8,
        memLimitMB: 6144,
        queueBackpressureThreshold: 300
      }
    },
    
    MONITORING: {
      METRICS_INTERVAL_MS: 5000,
      HEALTH_CHECK_INTERVAL_MS: 30000,
      PERFORMANCE_WINDOW_SIZE: 100,
      ALERT_THRESHOLD_VIOLATIONS: 3
    },
    
    SCALABILITY: {
      AUTO_SCALE_ENABLED: true,
      SCALE_UP_CPU_THRESHOLD: 80,
      SCALE_DOWN_CPU_THRESHOLD: 30,
      SCALE_COOLDOWN_MS: 300000,
      MIN_INSTANCES: 1,
      MAX_INSTANCES: 10
    },
    
    OPTIMIZATION: {
      ENABLE_COMPRESSION: true,
      ENABLE_CACHING: true,
      ENABLE_KEEP_ALIVE: true,
      POOL_SIZE: 20,
      IDLE_TIMEOUT_MS: 60000,
      REQUEST_TIMEOUT_MS: 30000
    },
    
    STRESS_TESTING: {
      MAX_CONCURRENT_USERS: 1000,
      MAX_REQUESTS_PER_SECOND: 100,
      TARGET_RESPONSE_TIME_MS: 2000,
      ACCEPTABLE_ERROR_RATE_PERCENT: 1
    }
  };