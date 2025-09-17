module.exports = {
  TIMEOUTS: {
    HTTP_REQUEST_MS: 30000,
    API_DEFAULT_MS: 180000,
    HEADLESS_PAGE_MS: 120000,
    SCRAPER_STEP_MS: 30000,
    GLOBAL_JOB_MS: 180000,
    NAVIGATION_MS: 45000,
    IDLE_BROWSER_MS: 15000,
    CAPTCHA_COOLDOWN_MS: 60000,
    BACKOFF_BASE_MS: 1000,
    BACKOFF_MAX_MS: 30000,
    PLAYWRIGHT_INTERACTION_MS: 30000,
    SSE_MESSAGE_TIMEOUT_MS: 300000
  },
  
  LIMITS: {
    MAX_CONCURRENT_DOMAINS: 1,
    MAX_RETRIES: 3,
    MAX_URLS_PER_BATCH: 100,
    MAX_DESCRIPTION_LENGTH: 200,
    MAX_SCRAPERS: 25,
    MAX_BATCH_SIZE: 15,
    PER_DOMAIN_CONCURRENCY: 2
  },
  
  MATCHING: {
    FUZZY_THRESHOLD: 80,
    HIGH_CONFIDENCE: 95,
    MEDIUM_CONFIDENCE: 80,
    LOW_CONFIDENCE: 70,
    FAST_TRACK_SUCCESS_RATE: 70,
    TITLE_MATCH_BONUS: 50,
    DESCRIPTION_MATCH_BONUS: 25,
    LOCATION_MATCH_BONUS: 30,
    REMOTE_MATCH_BONUS: 20,
    JOB_URL_BONUS: 15
  },
  
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
  ],
  
  PLAYWRIGHT_ARGS: [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-automation',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1920,1080',
    '--start-maximized',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-notifications',
    '--disable-default-apps',
    '--no-default-browser-check',
    '--disable-translate',
    '--disable-infobars',
    '--mute-audio',
    '--window-position=-32000,-32000',
    '--disable-gpu',
    '--disable-webgl',
    '--disable-3d-apis',
    '--disable-accelerated-2d-canvas',
    '--disable-accelerated-video-decode'
  ],
  
  RETRIES: {
    MAX_ATTEMPTS: 3,
    BACKOFF_FACTOR: 2,
    JITTER_ENABLED: true,
    RETRYABLE_ERROR_TYPES: [
      'TIMEOUT',
      'NETWORK',
      'DNS',
      'CONNECTION',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT'
    ]
  },
  
  RATE_LIMITING: {
    GLOBAL_PER_SECOND: 10,
    DOMAIN_PER_MINUTE: 30,
    WINDOW_MS: 1000,
    CRAWL_DELAY_MS: 1000
  }
};