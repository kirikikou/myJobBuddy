module.exports = {
  LEVELS: {
    L1: {
      maxSizeMB: parseInt(process.env.CACHE_L1_SIZE_MB) || 100,
      evictionPolicy: process.env.CACHE_L1_EVICTION || 'LRU',
      ttlMs: parseInt(process.env.CACHE_L1_TTL_MS) || 30000
    },
    L2: {
      maxSizeMB: parseInt(process.env.CACHE_L2_SIZE_MB) || 1024,
      compression: (process.env.CACHE_L2_COMPRESSION || 'false') === 'true',
      evictionPolicy: process.env.CACHE_L2_EVICTION || 'LRU'
    }
  },

  FRESHNESS: {
    SECONDS: 86400,
    HOURS: 24,
    MILLISECONDS: 86400000
  },
  
  TTL: {
    DAYS: 31,
    SECONDS: 2678400,
    DOMAIN_PROFILE_DAYS: 30,
    DEFAULT: parseInt(process.env.CACHE_TTL_DEFAULT_S) || 86400,
    USER_PREFS_DAYS: parseInt(process.env.CACHE_USER_PREFS_DAYS) || 7,
    SCRAPING_RESULTS_DAYS: parseInt(process.env.CACHE_SCRAPING_DAYS) || 31,
    MONITORING_HOURS: parseInt(process.env.CACHE_MONITORING_HOURS) || 6
  },
  
  SIZE_LIMITS: {
    MAX_SIZE_MB: 1024,
    MAX_SIZE_BYTES: 1024 * 1024 * 1024,
    EVICTION_THRESHOLD_MB: 900,
    CLEANUP_BATCH_SIZE: 50,
    MAX_ENTRY_SIZE_MB: parseInt(process.env.CACHE_MAX_ENTRY_SIZE_MB) || 10
  },
  
  NAMESPACES: {
    DEFAULT: 'myjobbuddy',
    SCRAPING: 'scraping',
    PROFILES: 'profiles',
    MONITORING: 'monitoring',
    TEMP: 'temp',
    USERS: process.env.CACHE_NS_USERS || 'users'
  },
  
  POLICIES: {
    EVICTION_STRATEGY: 'LRU',
    WRITE_THROUGH: true,
    READ_THROUGH: true,
    COMPRESSION_ENABLED: false,
    DEFAULT_EVICTION: process.env.CACHE_DEFAULT_EVICTION || 'LRU',
    COMPRESSION_THRESHOLD_KB: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD_KB) || 1,
    SMART_PROMOTION: (process.env.CACHE_SMART_PROMOTION || 'true') === 'true'
  },
  
  MEMORY_CACHE: {
    DEFAULT_TTL_MS: 30000,
    MAX_ENTRIES: 1000,
    CLEANUP_INTERVAL_MS: 60000,
    EVICTION_BATCH_SIZE: parseInt(process.env.CACHE_MEMORY_EVICTION_BATCH) || 200
  },

  FILE_CACHE: {
    BASE_PATH: process.env.CACHE_FILE_PATH || './cache',
    INDEX_REBUILD_INTERVAL_MS: parseInt(process.env.CACHE_INDEX_REBUILD_MS) || 3600000,
    COMPRESSION_LEVEL: parseInt(process.env.CACHE_COMPRESSION_LEVEL) || 6,
    SYNC_INTERVAL_MS: parseInt(process.env.CACHE_SYNC_INTERVAL_MS) || 5000,
    REPAIR_ON_STARTUP: (process.env.CACHE_REPAIR_STARTUP || 'true') === 'true'
  },

  EVICTION: {
    CHECK_INTERVAL_MS: parseInt(process.env.CACHE_EVICTION_CHECK_MS) || 300000,
    BATCH_SIZE: parseInt(process.env.CACHE_EVICTION_BATCH_SIZE) || 50,
    MAX_CONCURRENT: parseInt(process.env.CACHE_EVICTION_MAX_CONCURRENT) || 3,
    WEIGHTS: {
      RECENCY: parseFloat(process.env.CACHE_WEIGHT_RECENCY) || 0.3,
      FREQUENCY: parseFloat(process.env.CACHE_WEIGHT_FREQUENCY) || 0.25,
      PRIORITY: parseFloat(process.env.CACHE_WEIGHT_PRIORITY) || 0.25,
      SIZE: parseFloat(process.env.CACHE_WEIGHT_SIZE) || 0.1,
      AGE: parseFloat(process.env.CACHE_WEIGHT_AGE) || 0.1
    },
    ADAPTIVE_THRESHOLDS: {
      HIT_RATIO_LOW: parseInt(process.env.CACHE_HIT_RATIO_LOW) || 70,
      HIT_RATIO_HIGH: parseInt(process.env.CACHE_HIT_RATIO_HIGH) || 85,
      MEMORY_USAGE_HIGH: parseInt(process.env.CACHE_MEMORY_USAGE_HIGH) || 85
    }
  },
  
  HOUSEKEEPING: {
    INTERVAL_HOURS: 6,
    STALE_THRESHOLD_DAYS: 7,
    ORPHAN_CLEANUP_ENABLED: true,
    STATS_RETENTION_DAYS: 90,
    INDEX_OPTIMIZATION: (process.env.CACHE_INDEX_OPTIMIZATION || 'true') === 'true',
    COMPRESSION_OPTIMIZATION: (process.env.CACHE_COMPRESSION_OPT || 'true') === 'true'
  },
  
  HIT_RECORDING: {
    ENABLED: true,
    BATCH_SIZE: 100,
    FLUSH_INTERVAL_MS: 30000,
    DETAILED_LOGGING: (process.env.CACHE_DETAILED_LOGGING || 'false') === 'true'
  },

  MONITORING: {
    ENABLED: (process.env.CACHE_MONITORING_ENABLED || 'true') === 'true',
    STATS_INTERVAL_MS: parseInt(process.env.CACHE_STATS_INTERVAL_MS) || 30000,
    REPORT_INTERVAL_MS: parseInt(process.env.CACHE_REPORT_INTERVAL_MS) || 300000,
    SAMPLING_RATE: parseFloat(process.env.CACHE_SAMPLING_RATE) || 0.1,
    MAX_SAMPLES: parseInt(process.env.CACHE_MAX_SAMPLES) || 1000,
    MAX_ALERTS: parseInt(process.env.CACHE_MAX_ALERTS) || 100,
    ALERT_THRESHOLDS: {
      hitRatio: parseInt(process.env.CACHE_ALERT_HIT_RATIO) || 80,
      avgResponseTime: parseInt(process.env.CACHE_ALERT_RESPONSE_TIME_MS) || 100,
      errorRate: parseInt(process.env.CACHE_ALERT_ERROR_RATE) || 5,
      memoryUsage: parseFloat(process.env.CACHE_ALERT_MEMORY_USAGE) || 0.9
    }
  },

  WARMUP: {
    ENABLED: (process.env.CACHE_WARMUP_ENABLED || 'true') === 'true',
    STARTUP_WARMUP: (process.env.CACHE_STARTUP_WARMUP || 'true') === 'true',
    MAX_CONCURRENT: parseInt(process.env.CACHE_WARMUP_CONCURRENT) || 3,
    DOMAIN_PROFILES_COUNT: parseInt(process.env.CACHE_WARMUP_DOMAINS) || 100,
    USER_PREFS_COUNT: parseInt(process.env.CACHE_WARMUP_USERS) || 50,
    POPULAR_SEARCHES_COUNT: parseInt(process.env.CACHE_WARMUP_SEARCHES) || 50,
    RECENT_FILES_COUNT: parseInt(process.env.CACHE_WARMUP_FILES) || 100,
    STRATEGIES: {
      DOMAIN_PROFILES: (process.env.CACHE_WARMUP_DOMAINS_ENABLED || 'true') === 'true',
      USER_PREFERENCES: (process.env.CACHE_WARMUP_USERS_ENABLED || 'true') === 'true',
      POPULAR_SEARCHES: (process.env.CACHE_WARMUP_SEARCHES_ENABLED || 'true') === 'true',
      RECENT_DATA: (process.env.CACHE_WARMUP_RECENT_ENABLED || 'false') === 'true'
    }
  },

  LEGACY_COMPATIBILITY: {
    ENABLED: (process.env.CACHE_LEGACY_COMPAT || 'true') === 'true',
    MIGRATION_ENABLED: (process.env.CACHE_MIGRATION_ENABLED || 'true') === 'true',
    LEGACY_PREFIX: process.env.CACHE_LEGACY_PREFIX || 'legacy',
    WRAPPER_LOGGING: (process.env.CACHE_WRAPPER_LOGGING || 'true') === 'true'
  },

  PERFORMANCE: {
    BATCH_OPERATIONS: (process.env.CACHE_BATCH_OPS || 'true') === 'true',
    ASYNC_WRITES: (process.env.CACHE_ASYNC_WRITES || 'true') === 'true',
    PREFETCH_ENABLED: (process.env.CACHE_PREFETCH || 'false') === 'true',
    WRITE_COALESCING: (process.env.CACHE_WRITE_COALESCING || 'true') === 'true'
  },

  CACHE_DIR: process.env.CACHE_DIR || './cache',
  CACHE_DURATION: parseInt(process.env.CACHE_DURATION) || 86400000,

  getEnvironmentConfig() {
    return {
      NODE_ENV: process.env.NODE_ENV || 'development',
      CACHE_DEBUG: (process.env.CACHE_DEBUG || 'false') === 'true',
      CACHE_PROFILE: (process.env.CACHE_PROFILE || 'false') === 'true',
      CACHE_METRICS_EXPORT: process.env.CACHE_METRICS_EXPORT || 'none'
    };
  },

  validateConfig() {
    const errors = [];
    const warnings = [];
    
    if (this.LEVELS.L1.maxSizeMB <= 0) {
      errors.push('L1 cache size must be positive');
    }
    
    if (this.LEVELS.L2.maxSizeMB <= 0) {
      errors.push('L2 cache size must be positive');
    }
    
    if (this.LEVELS.L1.maxSizeMB >= this.LEVELS.L2.maxSizeMB) {
      warnings.push('L1 cache size should be smaller than L2 cache size');
    }
    
    const weightSum = Object.values(this.EVICTION.WEIGHTS).reduce((sum, w) => sum + w, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      warnings.push(`Eviction weights sum to ${weightSum}, expected 1.0`);
    }
    
    if (this.MONITORING.SAMPLING_RATE < 0 || this.MONITORING.SAMPLING_RATE > 1) {
      errors.push('Sampling rate must be between 0 and 1');
    }
    
    if (this.TTL.DEFAULT <= 0) {
      errors.push('Default TTL must be positive');
    }
    
    return { errors, warnings };
  },

  getOptimizedConfig(environment = 'production') {
    const base = { ...this };
    
    switch (environment) {
      case 'development':
        base.LEVELS.L1.maxSizeMB = 50;
        base.LEVELS.L2.maxSizeMB = 200;
        base.MONITORING.DETAILED_LOGGING = true;
        base.WARMUP.ENABLED = false;
        break;
        
      case 'testing':
        base.LEVELS.L1.maxSizeMB = 10;
        base.LEVELS.L2.maxSizeMB = 50;
        base.MONITORING.ENABLED = false;
        base.WARMUP.ENABLED = false;
        base.HOUSEKEEPING.INTERVAL_HOURS = 1;
        break;
        
      case 'production':
        base.LEVELS.L1.maxSizeMB = 150;
        base.LEVELS.L2.maxSizeMB = 1024;
        base.MONITORING.ENABLED = true;
        base.WARMUP.ENABLED = true;
        base.PERFORMANCE.BATCH_OPERATIONS = true;
        break;
    }
    
    return base;
  }
};