const LOG_CONFIGURATIONS = {
    development: {
      level: 'Verbose',
      transport: 'stdout',
      sampling: 1.0,
      redactPII: false,
      dedupMs: 1000,
      auditEvents: true,
      asyncBuffering: {
        enabled: false,
        maxBufferSize: 50,
        flushIntervalMs: 5000
      },
      categories: {
        enabled: ['all'],
        highFrequency: ['timing', 'parallel', 'batch'],
        realTime: ['fail', 'error', 'win'],
        async: ['cache', 'buffer', 'timing']
      },
      monitoring: {
        enabled: true,
        alerting: false,
        metricsFlushMs: 30000,
        healthCheckMs: 10000
      }
    },
  
    production: {
      level: 'Essential',
      transport: 'file',
      sampling: 0.1,
      redactPII: true,
      dedupMs: 5000,
      auditEvents: true,
      asyncBuffering: {
        enabled: true,
        maxBufferSize: 200,
        flushIntervalMs: 1000
      },
      categories: {
        enabled: [
          'buffer', 'polling', 'langue', 'domain-profile', 
          'steps', 'retry', 'timeout', 'fail', 'win', 
          'cache', 'platform', 'fast-track', 'parallel',
          'batch', 'timing', 'queue'
        ],
        highFrequency: ['timing', 'parallel', 'batch', 'polling'],
        realTime: ['fail', 'error'],
        async: ['cache', 'buffer', 'timing', 'parallel', 'batch']
      },
      monitoring: {
        enabled: true,
        alerting: true,
        metricsFlushMs: 60000,
        healthCheckMs: 30000
      }
    },
  
    test: {
      level: 'Errors',
      transport: 'silent',
      sampling: 0.01,
      redactPII: true,
      dedupMs: 10000,
      auditEvents: false,
      asyncBuffering: {
        enabled: true,
        maxBufferSize: 10,
        flushIntervalMs: 1000
      },
      categories: {
        enabled: ['fail', 'error'],
        highFrequency: [],
        realTime: ['fail', 'error'],
        async: []
      },
      monitoring: {
        enabled: false,
        alerting: false,
        metricsFlushMs: 300000,
        healthCheckMs: 60000
      }
    }
  };
  
  const CATEGORY_PRIORITIES = {
    fail: 1,
    error: 1,
    timeout: 2,
    retry: 3,
    win: 4,
    'fast-track': 5,
    steps: 6,
    platform: 7,
    langue: 8,
    'domain-profile': 9,
    cache: 10,
    buffer: 11,
    queue: 12,
    parallel: 13,
    batch: 14,
    timing: 15,
    polling: 16,
    service: 17,
    sse: 18,
    inventory: 19,
    probe: 20,
    validate: 21,
    stress: 22
  };
  
  const PERFORMANCE_OPTIMIZATIONS = {
    asyncCategories: new Set([
      'timing', 'parallel', 'batch', 'polling', 
      'cache', 'buffer', 'inventory'
    ]),
    
    batchCategories: new Set([
      'timing', 'parallel', 'batch'
    ]),
    
    samplingRates: {
      development: {
        timing: 1.0,
        parallel: 1.0,
        batch: 1.0,
        cache: 0.5,
        default: 1.0
      },
      production: {
        timing: 0.1,
        parallel: 0.2,
        batch: 0.3,
        cache: 0.05,
        default: 0.1
      },
      test: {
        timing: 0.01,
        parallel: 0.01,
        batch: 0.01,
        cache: 0.001,
        default: 0.01
      }
    }
  };
  
  function getLogConfig(environment = 'development') {
    const envConfig = LOG_CONFIGURATIONS[environment] || LOG_CONFIGURATIONS.development;
    
    return {
      ...envConfig,
      categoryPriorities: CATEGORY_PRIORITIES,
      performanceOptimizations: PERFORMANCE_OPTIMIZATIONS,
      environment
    };
  }
  
  function shouldUseAsync(category, environment = 'development') {
    const config = getLogConfig(environment);
    return config.asyncBuffering.enabled && 
           config.categories.async.includes(category);
  }
  
  function getCategorySampling(category, environment = 'development') {
    const rates = PERFORMANCE_OPTIMIZATIONS.samplingRates[environment] || 
                  PERFORMANCE_OPTIMIZATIONS.samplingRates.development;
    
    return rates[category] || rates.default;
  }
  
  function shouldLogCategory(category, environment = 'development') {
    const config = getLogConfig(environment);
    
    if (config.categories.enabled.includes('all')) {
      return true;
    }
    
    return config.categories.enabled.includes(category);
  }
  
  function getCategoryPriority(category) {
    return CATEGORY_PRIORITIES[category] || 999;
  }
  
  function isHighFrequencyCategory(category, environment = 'development') {
    const config = getLogConfig(environment);
    return config.categories.highFrequency.includes(category);
  }
  
  function isRealTimeCategory(category, environment = 'development') {
    const config = getLogConfig(environment);
    return config.categories.realTime.includes(category);
  }
  
  const MONITORING_CONFIGURATIONS = {
    development: {
      enableMetrics: true,
      enableAlerting: false,
      metricsRetentionHours: 1,
      alertRetentionHours: 4,
      flushIntervalMs: 30000,
      maxBufferSize: 500,
      alertThresholds: {
        errorRate: 0.1,
        responseTime: 60000,
        queueLength: 200,
        memoryUsage: 0.9,
        cacheHitRate: 0.2
      }
    },
  
    production: {
      enableMetrics: true,
      enableAlerting: true,
      metricsRetentionHours: 24,
      alertRetentionHours: 72,
      flushIntervalMs: 60000,
      maxBufferSize: 1000,
      alertThresholds: {
        errorRate: 0.05,
        responseTime: 30000,
        queueLength: 100,
        memoryUsage: 0.8,
        cacheHitRate: 0.3
      }
    },
  
    test: {
      enableMetrics: false,
      enableAlerting: false,
      metricsRetentionHours: 0.1,
      alertRetentionHours: 0.1,
      flushIntervalMs: 300000,
      maxBufferSize: 10,
      alertThresholds: {
        errorRate: 0.5,
        responseTime: 120000,
        queueLength: 1000,
        memoryUsage: 0.95,
        cacheHitRate: 0.1
      }
    }
  };
  
  function getMonitoringConfig(environment = 'development') {
    return MONITORING_CONFIGURATIONS[environment] || MONITORING_CONFIGURATIONS.development;
  }
  
  const LOG_ROTATION_CONFIG = {
    development: {
      maxFiles: 3,
      maxSizeMB: 10,
      rotateDaily: false
    },
    production: {
      maxFiles: 10,
      maxSizeMB: 100,
      rotateDaily: true
    },
    test: {
      maxFiles: 1,
      maxSizeMB: 1,
      rotateDaily: false
    }
  };
  
  function getRotationConfig(environment = 'development') {
    return LOG_ROTATION_CONFIG[environment] || LOG_ROTATION_CONFIG.development;
  }
  
  module.exports = {
    getLogConfig,
    getMonitoringConfig,
    getRotationConfig,
    shouldUseAsync,
    getCategorySampling,
    shouldLogCategory,
    getCategoryPriority,
    isHighFrequencyCategory,
    isRealTimeCategory,
    LOG_CONFIGURATIONS,
    CATEGORY_PRIORITIES,
    PERFORMANCE_OPTIMIZATIONS,
    MONITORING_CONFIGURATIONS
  };