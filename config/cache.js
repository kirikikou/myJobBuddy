module.exports = {
    FRESHNESS: {
      SECONDS: 86400,
      HOURS: 24,
      MILLISECONDS: 86400000
    },
    
    TTL: {
      DAYS: 31,
      SECONDS: 2678400,
      DOMAIN_PROFILE_DAYS: 30
    },
    
    SIZE_LIMITS: {
      MAX_SIZE_MB: 1024,
      MAX_SIZE_BYTES: 1024 * 1024 * 1024,
      EVICTION_THRESHOLD_MB: 900,
      CLEANUP_BATCH_SIZE: 50
    },
    
    NAMESPACES: {
      DEFAULT: 'myjobbuddy',
      SCRAPING: 'scraping',
      PROFILES: 'profiles',
      MONITORING: 'monitoring',
      TEMP: 'temp'
    },
    
    POLICIES: {
      EVICTION_STRATEGY: 'LRU',
      WRITE_THROUGH: true,
      READ_THROUGH: true,
      COMPRESSION_ENABLED: false
    },
    
    MEMORY_CACHE: {
      DEFAULT_TTL_MS: 30000,
      MAX_ENTRIES: 1000,
      CLEANUP_INTERVAL_MS: 60000
    },
    
    HOUSEKEEPING: {
      INTERVAL_HOURS: 6,
      STALE_THRESHOLD_DAYS: 7,
      ORPHAN_CLEANUP_ENABLED: true,
      STATS_RETENTION_DAYS: 90
    },
    
    HIT_RECORDING: {
      ENABLED: true,
      BATCH_SIZE: 100,
      FLUSH_INTERVAL_MS: 30000
    }
  };