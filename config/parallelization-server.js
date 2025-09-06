module.exports = {
    MAX_WAIT_TIME_MINUTES: 3,
    MIN_PARALLEL: 1,
    MAX_PARALLEL: 20,
    TARGET_DURATION_SECONDS: 150,
    
    CPU_THRESHOLD: 0.8,
    RAM_THRESHOLD: 0.8,
    QUEUE_THRESHOLD: 100,
    
    STEP_WEIGHTS: {
      'http-simple': 1,
      'mobile-variant': 2,
      'lighthouse': 3,
      'headless': 8,
      'ocr-fallback': 10
    },
    
    BATCH_CALCULATION: {
      MIN_BATCH_SIZE: 1,
      MAX_BATCH_SIZE: 20,
      TARGET_BATCH_DURATION: 150
    },
    
    RESOURCE_LIMITS: {
      MAX_CPU_PERCENT: 80,
      MAX_RAM_GB: 6,
      MAX_CONCURRENT_SCRAPERS: 15
    }
  };