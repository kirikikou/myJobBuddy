const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const dns = require('dns').promises;

const scrapingConfig = require('./config/scraping');
const cacheConfig = require('./config/cache');
const uploadConfig = require('./config/upload');
const performanceConfig = require('./config/performance');

const ENV_SCHEMA = {
  meta: {
    APP_ENV: { type: 'enum', values: ['development', 'production', 'test'], default: 'development' },
    APP_MODE: { type: 'enum', values: ['local', 'server'], default: 'local' },
    PARALLEL_PRESET: { type: 'enum', values: ['high', 'mid', 'low', 'server'], default: 'mid' },
    APP_DRY_RUN: { type: 'boolean', default: false }
  },
  db: {
    MONGODB_URI: { type: 'string', default: null },
    MONGO_URI: { type: 'string', default: null },
    MONGO_URL: { type: 'string', default: null },
    DB_CONNECT_TIMEOUT_MS: { type: 'integer', min: 1000, max: 60000, default: 10000 },
    DB_SOCKET_TIMEOUT_MS: { type: 'integer', min: 1000, max: 120000, default: 30000 },
    DB_MIN_POOL: { type: 'integer', min: 1, max: 100, default: 5 },
    DB_MAX_POOL: { type: 'integer', min: 1, max: 200, default: 20 },
    DB_TLS: { type: 'boolean', default: false },
    DB_DIRECT_CONNECTION: { type: 'boolean', default: false },
    DB_REPLICA_SET: { type: 'string', default: null }
  },
  sessions: {
    SESSIONS_STORE: { type: 'enum', values: ['mongo', 'memory'], default: null },
    SESSION_SECRET: { type: 'string', default: null },
    SESSION_MAX_AGE: { type: 'integer', min: 300000, max: 2592000000, default: 86400000 },
    SESSIONS_COLLECTION: { type: 'string', default: 'sessions' },
    SESSIONS_TTL_SECONDS: { type: 'integer', min: 300, max: 2592000, default: 86400 }
  },
  logging: {
    LOG_LEVEL: { type: 'enum', values: ['OFF', 'Fails', 'Errors', 'Timeout', 'Essential', 'Verbose'], default: 'Essential' },
    LOG_TRANSPORT: { type: 'enum', values: ['file', 'stdout', 'silent'], default: 'file' },
    LOG_SAMPLING: { type: 'number', min: 0, max: 1, default: 1.0 },
    LOG_REDACT_PII: { type: 'boolean', default: true },
    LOG_MAX_SIZE_MB: { type: 'integer', min: 1, max: 1000, default: 100 },
    LOG_MAX_FILES: { type: 'integer', min: 1, max: 50, default: 10 },
    LOG_AUDIT_EVENTS: { type: 'boolean', default: true },
    LOG_DEDUP_MS: { type: 'integer', min: 1000, max: 30000, default: 5000 }
  },
  diagnostics: {
    DIAG_MODE: { type: 'string', default: 'NO' },
    DIAG_TIMING: { type: 'boolean', default: false },
    DIAG_BUFFER: { type: 'boolean', default: false },
    DIAG_PARALLEL: { type: 'boolean', default: false },
    DIAG_POLLING: { type: 'boolean', default: false },
    DIAG_OUTDIR: { type: 'string', default: 'exports/diagnostics' },
    DIAG_SAMPLING: { type: 'number', min: 0, max: 1, default: 0.1 },
    DIAG_ENABLE_IN_PROD: { type: 'boolean', default: false }
  },
  maintenance: {
    MAINT_ENABLE: { type: 'boolean', default: false },
    CLEAN_ALLOW: { type: 'string', default: 'cache,monitoring_data,debug,profiles' },
    CLEAN_EXCLUDE: { type: 'string', default: 'debug/SessionStore.js' },
    CLEAN_DRYRUN: { type: 'boolean', default: true },
    CLEAN_CONFIRM: { type: 'boolean', default: true },
    CLEAN_SCHEDULE: { type: 'string', default: '' }
  },
  startup: {
    CLEAN_ON_STARTUP: { type: 'boolean', default: false },
    CLEAN_STARTUP_SAFE_PROD: { type: 'boolean', default: true },
    CLEAN_CACHE_ON_STARTUP: { type: 'enum', values: ['never', 'dry-run', 'confirm', 'always'], default: 'never' },
    CLEAN_DEBUG_ON_STARTUP: { type: 'enum', values: ['never', 'dry-run', 'confirm', 'always'], default: 'never' },
    CLEAN_PROFILES_ON_STARTUP: { type: 'enum', values: ['never', 'dry-run', 'confirm', 'always'], default: 'never' },
    CLEAN_MONITORING_ON_STARTUP: { type: 'enum', values: ['never', 'dry-run', 'confirm', 'always'], default: 'never' },
    CLEAN_STARTUP_MAX_AGE_DAYS: { type: 'integer', min: 0, max: 365, default: 0 },
    CLEAN_STARTUP_MAX_TOTAL_MB: { type: 'integer', min: 0, max: 102400, default: 0 },
    CLEAN_EXCLUDE: { type: 'string', default: 'debug/SessionStore.js' },
    CLEAN_CONFIRM_ACCEPT: { type: 'boolean', default: false }
  },
  parallelism: {
    MAX_PARALLEL: { type: 'integer', min: 1, max: 50, default: null },
    MAX_SCRAPERS: { type: 'integer', min: 1, max: 100, default: null },
    MAX_BATCH: { type: 'integer', min: 1, max: 100, default: null },
    PDOMAIN_CONCURRENCY: { type: 'integer', min: 1, max: 10, default: null },
    CPU_LOAD_TARGET: { type: 'number', min: 0.1, max: 1.0, default: null },
    MEM_LIMIT_MB: { type: 'integer', min: 128, max: 8192, default: null },
    QUEUE_BACKPRESSURE: { type: 'integer', min: 0, max: 1000, default: null }
  },
  timeouts: {
    TO_REQUEST_MS: { type: 'integer', min: 1000, max: 120000, default: scrapingConfig.TIMEOUTS.HTTP_REQUEST_MS },
    TO_NAV_MS: { type: 'integer', min: 1000, max: 120000, default: scrapingConfig.TIMEOUTS.NAVIGATION_MS },
    TO_STEP_MS: { type: 'integer', min: 100, max: 60000, default: scrapingConfig.TIMEOUTS.SCRAPER_STEP_MS },
    TO_GLOBAL_MS: { type: 'integer', min: 1000, max: 600000, default: scrapingConfig.TIMEOUTS.GLOBAL_JOB_MS },
    TO_IDLE_MS: { type: 'integer', min: 1000, max: 300000, default: scrapingConfig.TIMEOUTS.IDLE_BROWSER_MS },
    BACKOFF_BASE_MS: { type: 'integer', min: 100, max: 10000, default: scrapingConfig.TIMEOUTS.BACKOFF_BASE_MS },
    BACKOFF_MAX_MS: { type: 'integer', min: 1000, max: 60000, default: scrapingConfig.TIMEOUTS.BACKOFF_MAX_MS },
    CAPTCHA_COOLDOWN_MS: { type: 'integer', min: 0, max: 300000, default: scrapingConfig.TIMEOUTS.CAPTCHA_COOLDOWN_MS },
    IDEMPOTENCY_TTL_MS: { type: 'integer', min: 1000, max: 300000, default: 10000 },
    MEM_CACHE_DEFAULT_TTL_MS: { type: 'integer', min: 1000, max: 3600000, default: cacheConfig.MEMORY_CACHE.DEFAULT_TTL_MS }
  },
  retries: {
    RETRIES_MAX: { type: 'integer', min: 0, max: 10, default: scrapingConfig.RETRIES.MAX_ATTEMPTS },
    RETRYABLE_ERRORS: { type: 'string', default: scrapingConfig.RETRIES.RETRYABLE_ERROR_TYPES.join(',') },
    RETRY_JITTER: { type: 'boolean', default: scrapingConfig.RETRIES.JITTER_ENABLED },
    RETRY_FACTOR: { type: 'number', min: 1, max: 5, default: scrapingConfig.RETRIES.BACKOFF_FACTOR }
  },
  cache: {
    CACHE_ENABLED: { type: 'boolean', default: true },
    CACHE_FRESH_S: { type: 'integer', min: 0, max: 604800, default: cacheConfig.FRESHNESS.SECONDS },
    CACHE_RETENTION_D: { type: 'integer', min: 0, max: 365, default: cacheConfig.TTL.DAYS },
    CACHE_MAX_MB: { type: 'integer', min: 0, max: 10240, default: cacheConfig.SIZE_LIMITS.MAX_SIZE_MB },
    CACHE_NS: { type: 'string', default: cacheConfig.NAMESPACES.DEFAULT },
    CACHE_EVICTION: { type: 'enum', values: ['LRU', 'LFU'], default: cacheConfig.POLICIES.EVICTION_STRATEGY },
    CACHE_DPROFILE_TTL_D: { type: 'integer', min: 0, max: 365, default: cacheConfig.TTL.DOMAIN_PROFILE_DAYS }
  },
  polling: {
    POLL_ENABLED: { type: 'boolean', default: true },
    POLL_MIN_MS: { type: 'integer', min: 0, max: 60000, default: 1000 },
    POLL_MAX_MS: { type: 'integer', min: 0, max: 300000, default: 10000 },
    POLL_JITTER_MS: { type: 'integer', min: 0, max: 5000, default: 500 },
    POLL_MAX_CONC: { type: 'integer', min: 0, max: 50, default: 5 }
  },
  requests: {
    RL_GLOBAL_PS: { type: 'integer', min: 0, max: 1000, default: scrapingConfig.RATE_LIMITING.GLOBAL_PER_SECOND },
    RL_DOMAIN_PM: { type: 'integer', min: 0, max: 100, default: scrapingConfig.RATE_LIMITING.DOMAIN_PER_MINUTE },
    RATE_LIMIT_WINDOW_MS: { type: 'integer', min: 100, max: 60000, default: scrapingConfig.RATE_LIMITING.WINDOW_MS },
    ROBOTS_RESPECT: { type: 'boolean', default: true },
    CRAWL_DELAY_MS: { type: 'integer', min: 0, max: 10000, default: scrapingConfig.RATE_LIMITING.CRAWL_DELAY_MS },
    UA_ROTATION: { type: 'boolean', default: true },
    PROXY_ENABLED: { type: 'boolean', default: false },
    PROXY_POOL: { type: 'integer', min: 0, max: 100, default: 0 },
    PROXY_ROTATION: { type: 'enum', values: ['perRequest', 'perDomain', 'perSession'], default: 'perDomain' }
  },
  features: {
    FEATURE_PLAN_INTEGRATION: { type: 'boolean', default: true },
    FEATURE_ENFORCE_PLAN_LIMITS: { type: 'boolean', default: true }
  },
  search: {
    SEARCH_FUZZY_THRESHOLD: { type: 'integer', min: 50, max: 100, default: scrapingConfig.MATCHING.FUZZY_THRESHOLD }
  },
  flags: {
    ENABLE_SOFT_DEADLINE: { type: 'boolean', default: true },
    ENABLE_PARTIAL_EMIT: { type: 'boolean', default: true }
  },
  security: {
    SEC_FREEZE_PROD: { type: 'boolean', default: true },
    SEC_SANDBOX_FS: { type: 'boolean', default: true },
    SEC_AUDIT_CHANGES: { type: 'boolean', default: true },
    SEC_BLOCK_LOCALHOST: { type: 'boolean', default: true },
    SEC_BLOCK_0000: { type: 'boolean', default: true },
    SEC_RESOLVE_DNS: { type: 'boolean', default: false },
    SEC_DNS_TIMEOUT_MS: { type: 'integer', min: 100, max: 10000, default: 2000 },
    SEC_REJECT_SYMLINKS: { type: 'boolean', default: true },
    SEC_DENYLIST_DOMAINS: { type: 'string', default: '' }
  },
  telemetry: {
    METRICS_ENABLED: { type: 'boolean', default: true },
    METRICS_SAMPLING: { type: 'number', min: 0, max: 1, default: 0.1 },
    METRICS_PII: { type: 'boolean', default: false },
    METRICS_SINKS: { type: 'string', default: 'file' }
  }
};

const PRESET_MAPPINGS = performanceConfig.RESOURCE_LEVELS;

const RETRYABLE_ERROR_TYPES = scrapingConfig.RETRIES.RETRYABLE_ERROR_TYPES;

const PRIVATE_IP_RANGES_V4 = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./
];

const PRIVATE_IP_RANGES_V6 = [
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^::ffff:127\./i,
  /^::ffff:10\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./i
];

const LOCALHOST_PATTERNS = [
  'localhost',
  '0.0.0.0',
  '[::]'
];

const DANGEROUS_SCHEMES = [
  'file:',
  'ftp:',
  'gopher:',
  'data:',
  'chrome:',
  'about:',
  'javascript:'
];

class SecureConfig {
  constructor() {
    this._config = {};
    this._frozen = false;
    this._memoryCache = new Map();
    this._rateLimits = new Map();
    this._idempotencyCache = new Map();
    this._logDeduplication = new Map();
    this._sessionContexts = new Map();
    this._performanceMetrics = {
      batchTimings: [],
      urlTimings: [],
      parallelEfficiency: null,
      lastBatchReport: null
    };
    this._auditLog = [];
    this._logWriteStream = null;
    this._currentLogSize = 0;
    this._logFileIndex = 0;
    
    this.userAgents = scrapingConfig.USER_AGENTS;
    this.playwrightArgs = scrapingConfig.PLAYWRIGHT_ARGS;
    
    this._initialize();
  }

  _initialize() {
    try {
      this._loadEnvironmentVariables();
      this._applyPresets();
      this._validateConfiguration();
      this._setupDirectories();
      this._validateSecurity();
      this._initializeLogTransport();
      this._freezeIfProduction();
      this._auditConfigChange('initialization', 'Config initialized successfully');
    } catch (error) {
      throw new Error(`Configuration initialization failed: ${error.message}`);
    }
  }

  _loadEnvironmentVariables() {
    this._config = {
      meta: {
        version: require('./package.json').version,
        environment: this._parseEnv('APP_ENV', ENV_SCHEMA.meta.APP_ENV),
        mode: this._parseEnv('APP_MODE', ENV_SCHEMA.meta.APP_MODE),
        preset: this._parseEnv('PARALLEL_PRESET', ENV_SCHEMA.meta.PARALLEL_PRESET),
        dryRun: this._parseEnv('APP_DRY_RUN', ENV_SCHEMA.meta.APP_DRY_RUN)
      },
      paths: {
        rootDir: path.resolve(__dirname),
        cacheDir: path.resolve(__dirname, 'cache'),
        monitoringDir: path.resolve(__dirname, 'monitoring_data'),
        debugDir: path.resolve(__dirname, 'debug'),
        profilesDir: path.resolve(__dirname, 'profiles'),
        logsDir: path.resolve(__dirname, 'logs'),
        exportsDir: path.resolve(__dirname, 'exports')
      },
      db: {
        mongodbUri: this._parseEnv('MONGODB_URI', ENV_SCHEMA.db.MONGODB_URI) || 
                   this._parseEnv('MONGO_URI', ENV_SCHEMA.db.MONGO_URI) || 
                   this._parseEnv('MONGO_URL', ENV_SCHEMA.db.MONGO_URL),
        connectTimeoutMs: this._parseEnv('DB_CONNECT_TIMEOUT_MS', ENV_SCHEMA.db.DB_CONNECT_TIMEOUT_MS),
        socketTimeoutMs: this._parseEnv('DB_SOCKET_TIMEOUT_MS', ENV_SCHEMA.db.DB_SOCKET_TIMEOUT_MS),
        minPoolSize: this._parseEnv('DB_MIN_POOL', ENV_SCHEMA.db.DB_MIN_POOL),
        maxPoolSize: this._parseEnv('DB_MAX_POOL', ENV_SCHEMA.db.DB_MAX_POOL),
        tls: this._parseEnv('DB_TLS', ENV_SCHEMA.db.DB_TLS),
        directConnection: this._parseEnv('DB_DIRECT_CONNECTION', ENV_SCHEMA.db.DB_DIRECT_CONNECTION),
        replicaSet: this._parseEnv('DB_REPLICA_SET', ENV_SCHEMA.db.DB_REPLICA_SET)
      },
      sessions: {
        store: this._parseEnv('SESSIONS_STORE', ENV_SCHEMA.sessions.SESSIONS_STORE),
        secret: this._parseEnv('SESSION_SECRET', ENV_SCHEMA.sessions.SESSION_SECRET),
        cookieMaxAgeMs: this._parseEnv('SESSION_MAX_AGE', ENV_SCHEMA.sessions.SESSION_MAX_AGE),
        collection: this._parseEnv('SESSIONS_COLLECTION', ENV_SCHEMA.sessions.SESSIONS_COLLECTION),
        ttlSeconds: this._parseEnv('SESSIONS_TTL_SECONDS', ENV_SCHEMA.sessions.SESSIONS_TTL_SECONDS)
      },
      platforms:{
        allowCustom:this._parseEnv('PLATFORMS_ALLOW_CUSTOM',{type:'boolean',default:true}),
        unknownCode:this._parseEnv('PLATFORMS_UNKNOWN_CODE',{type:'string',default:'unknown'}),
        customCode:this._parseEnv('PLATFORMS_CUSTOM_CODE',{type:'string',default:'custom'}),
        detectMethod:this._parseEnv('PLATFORMS_DETECT_METHOD',{type:'enum',values:['GET','POST'],default:'GET'}),
        urlField:this._parseEnv('PLATFORMS_URL_FIELD',{type:'string',default:'url'}),
        platformField:this._parseEnv('PLATFORMS_PLATFORM_FIELD',{type:'string',default:'platform'}),
        vendorField:this._parseEnv('PLATFORMS_VENDOR_FIELD',{type:'string',default:'vendor'}),
        providerField:this._parseEnv('PLATFORMS_PROVIDER_FIELD',{type:'string',default:'provider'}),
        recommendedStepField:this._parseEnv('PLATFORMS_RECOMMENDED_STEP_FIELD',{type:'string',default:'recommendedStep'}),
        stepField:this._parseEnv('PLATFORMS_STEP_FIELD',{type:'string',default:'step'}),
        stepInfoPath:['stepInfo','stepUsed'],
        fallbackPost:this._parseEnv('PLATFORMS_FALLBACK_POST',{type:'boolean',default:false}),
        confidenceScores:{
          url:this._parseEnv('PLATFORMS_CONF_URL',{type:'number',default:0.95}),
          html:this._parseEnv('PLATFORMS_CONF_HTML',{type:'number',default:0.85}),
          both:this._parseEnv('PLATFORMS_CONF_BOTH',{type:'number',default:0.98}),
          unknown:this._parseEnv('PLATFORMS_CONF_UNKNOWN',{type:'number',default:0.1})
        }
      },
      logging:{
        level:this._parseEnv('LOG_LEVEL',ENV_SCHEMA.logging.LOG_LEVEL),
        transport:this._parseEnv('LOG_TRANSPORT',ENV_SCHEMA.logging.LOG_TRANSPORT),
        sampling:this._parseEnv('LOG_SAMPLING',ENV_SCHEMA.logging.LOG_SAMPLING),
        redactPII:this._parseEnv('LOG_REDACT_PII',ENV_SCHEMA.logging.LOG_REDACT_PII),
        file:{path:path.resolve(__dirname,'logs','app.log'),maxSizeMB:this._parseEnv('LOG_MAX_SIZE_MB',ENV_SCHEMA.logging.LOG_MAX_SIZE_MB),maxFiles:this._parseEnv('LOG_MAX_FILES',ENV_SCHEMA.logging.LOG_MAX_FILES)},
        auditEvents:this._parseEnv('LOG_AUDIT_EVENTS',ENV_SCHEMA.logging.LOG_AUDIT_EVENTS),
        dedupMs:this._parseEnv('LOG_DEDUP_MS',ENV_SCHEMA.logging.LOG_DEDUP_MS),
        categories:{platform:'platform',language:'langue',steps:'steps',timeout:'timeout',rateLimit:'rate-limit'}
      },
      diagnostics: {
        mode: this._parseEnv('DIAG_MODE', ENV_SCHEMA.diagnostics.DIAG_MODE),
        reports: {
          timing: this._parseEnv('DIAG_TIMING', ENV_SCHEMA.diagnostics.DIAG_TIMING),
          buffer: this._parseEnv('DIAG_BUFFER', ENV_SCHEMA.diagnostics.DIAG_BUFFER),
          parallelism: this._parseEnv('DIAG_PARALLEL', ENV_SCHEMA.diagnostics.DIAG_PARALLEL),
          polling: this._parseEnv('DIAG_POLLING', ENV_SCHEMA.diagnostics.DIAG_POLLING)
        },
        outDir: path.resolve(__dirname, this._parseEnv('DIAG_OUTDIR', ENV_SCHEMA.diagnostics.DIAG_OUTDIR)),
        enabledInProduction: this._parseEnv('DIAG_ENABLE_IN_PROD', ENV_SCHEMA.diagnostics.DIAG_ENABLE_IN_PROD),
        sampling: this._parseEnv('DIAG_SAMPLING', ENV_SCHEMA.diagnostics.DIAG_SAMPLING)
      },
      maintenance: {
        enableDestructiveOps: this._parseEnv('MAINT_ENABLE', ENV_SCHEMA.maintenance.MAINT_ENABLE),
        clean: {
          allowPaths: this._parseStringList('CLEAN_ALLOW', ENV_SCHEMA.maintenance.CLEAN_ALLOW),
          exclude: this._parseStringList('CLEAN_EXCLUDE', ENV_SCHEMA.maintenance.CLEAN_EXCLUDE),
          dryRun: this._parseEnv('CLEAN_DRYRUN', ENV_SCHEMA.maintenance.CLEAN_DRYRUN),
          requireConfirmation: this._parseEnv('CLEAN_CONFIRM', ENV_SCHEMA.maintenance.CLEAN_CONFIRM),
          confirmationPhrase: 'DELETE_CONFIRM_' + Date.now().toString(36),
          schedule: this._parseEnv('CLEAN_SCHEDULE', ENV_SCHEMA.maintenance.CLEAN_SCHEDULE)
        }
      },
      startup: {
        cleanEnabled: this._parseEnv('CLEAN_ON_STARTUP', ENV_SCHEMA.startup.CLEAN_ON_STARTUP),
        safeProd: this._parseEnv('CLEAN_STARTUP_SAFE_PROD', ENV_SCHEMA.startup.CLEAN_STARTUP_SAFE_PROD),
        modes: {
          cache: this._parseEnv('CLEAN_CACHE_ON_STARTUP', ENV_SCHEMA.startup.CLEAN_CACHE_ON_STARTUP),
          debug: this._parseEnv('CLEAN_DEBUG_ON_STARTUP', ENV_SCHEMA.startup.CLEAN_DEBUG_ON_STARTUP),
          profiles: this._parseEnv('CLEAN_PROFILES_ON_STARTUP', ENV_SCHEMA.startup.CLEAN_PROFILES_ON_STARTUP),
          monitoring_data: this._parseEnv('CLEAN_MONITORING_ON_STARTUP', ENV_SCHEMA.startup.CLEAN_MONITORING_ON_STARTUP)
        },
        maxAgeDays: this._parseEnv('CLEAN_STARTUP_MAX_AGE_DAYS', ENV_SCHEMA.startup.CLEAN_STARTUP_MAX_AGE_DAYS),
        maxTotalMB: this._parseEnv('CLEAN_STARTUP_MAX_TOTAL_MB', ENV_SCHEMA.startup.CLEAN_STARTUP_MAX_TOTAL_MB),
        exclude: this._parseStringList('CLEAN_EXCLUDE', ENV_SCHEMA.startup.CLEAN_EXCLUDE),
        confirmAccept: this._parseEnv('CLEAN_CONFIRM_ACCEPT', ENV_SCHEMA.startup.CLEAN_CONFIRM_ACCEPT)
      },
      parallelism: {
        preset: this._parseEnv('PARALLEL_PRESET', ENV_SCHEMA.meta.PARALLEL_PRESET),
        maxParallel: this._parseEnv('MAX_PARALLEL', ENV_SCHEMA.parallelism.MAX_PARALLEL),
        maxScrapers: this._parseEnv('MAX_SCRAPERS', ENV_SCHEMA.parallelism.MAX_SCRAPERS),
        maxBatchSize: this._parseEnv('MAX_BATCH', ENV_SCHEMA.parallelism.MAX_BATCH),
        perDomainConcurrency: this._parseEnv('PDOMAIN_CONCURRENCY', ENV_SCHEMA.parallelism.PDOMAIN_CONCURRENCY),
        cpuLoadTarget: this._parseEnv('CPU_LOAD_TARGET', ENV_SCHEMA.parallelism.CPU_LOAD_TARGET),
        memLimitMB: this._parseEnv('MEM_LIMIT_MB', ENV_SCHEMA.parallelism.MEM_LIMIT_MB),
        queueBackpressureThreshold: this._parseEnv('QUEUE_BACKPRESSURE', ENV_SCHEMA.parallelism.QUEUE_BACKPRESSURE)
      },
      timeouts: {
        requestMs: this._parseEnv('TO_REQUEST_MS', ENV_SCHEMA.timeouts.TO_REQUEST_MS),
        navigationMs: this._parseEnv('TO_NAV_MS', ENV_SCHEMA.timeouts.TO_NAV_MS),
        scraperStepMs: this._parseEnv('TO_STEP_MS', ENV_SCHEMA.timeouts.TO_STEP_MS),
        globalJobMs: this._parseEnv('TO_GLOBAL_MS', ENV_SCHEMA.timeouts.TO_GLOBAL_MS),
        idleBrowserMs: this._parseEnv('TO_IDLE_MS', ENV_SCHEMA.timeouts.TO_IDLE_MS),
        backoffBaseMs: this._parseEnv('BACKOFF_BASE_MS', ENV_SCHEMA.timeouts.BACKOFF_BASE_MS),
        backoffMaxMs: this._parseEnv('BACKOFF_MAX_MS', ENV_SCHEMA.timeouts.BACKOFF_MAX_MS),
        captchaCooldownMs: this._parseEnv('CAPTCHA_COOLDOWN_MS', ENV_SCHEMA.timeouts.CAPTCHA_COOLDOWN_MS),
        idempotencyTtlMs: this._parseEnv('IDEMPOTENCY_TTL_MS', ENV_SCHEMA.timeouts.IDEMPOTENCY_TTL_MS),
        memCacheDefaultTtlMs: this._parseEnv('MEM_CACHE_DEFAULT_TTL_MS', ENV_SCHEMA.timeouts.MEM_CACHE_DEFAULT_TTL_MS),
        apiMs: scrapingConfig.TIMEOUTS.API_DEFAULT_MS
      },
      search: {
        fuzzyThreshold: this._parseEnv('SEARCH_FUZZY_THRESHOLD', ENV_SCHEMA.search.SEARCH_FUZZY_THRESHOLD)
      },
      flags: {
        enableSoftDeadline: this._parseEnv('ENABLE_SOFT_DEADLINE', ENV_SCHEMA.flags.ENABLE_SOFT_DEADLINE),
        enablePartialEmit: this._parseEnv('ENABLE_PARTIAL_EMIT', ENV_SCHEMA.flags.ENABLE_PARTIAL_EMIT)
      },     
      retries: {
        maxRetries: this._parseEnv('RETRIES_MAX', ENV_SCHEMA.retries.RETRIES_MAX),
        retryableErrors: this._parseStringList('RETRYABLE_ERRORS', ENV_SCHEMA.retries.RETRYABLE_ERRORS),
        exponentialFactor: this._parseEnv('RETRY_FACTOR', ENV_SCHEMA.retries.RETRY_FACTOR),
        jitter: this._parseEnv('RETRY_JITTER', ENV_SCHEMA.retries.RETRY_JITTER)
      },
      cache: {
        enabled: this._parseEnv('CACHE_ENABLED', ENV_SCHEMA.cache.CACHE_ENABLED),
        freshnessSeconds: this._parseEnv('CACHE_FRESH_S', ENV_SCHEMA.cache.CACHE_FRESH_S),
        freshHours: this._parseEnv('CACHE_FRESH_S', ENV_SCHEMA.cache.CACHE_FRESH_S) / 3600,
        retentionDays: this._parseEnv('CACHE_RETENTION_D', ENV_SCHEMA.cache.CACHE_RETENTION_D),
        maxSizeMB: this._parseEnv('CACHE_MAX_MB', ENV_SCHEMA.cache.CACHE_MAX_MB),
        namespace: this._parseEnv('CACHE_NS', ENV_SCHEMA.cache.CACHE_NS),
        evictionPolicy: this._parseEnv('CACHE_EVICTION', ENV_SCHEMA.cache.CACHE_EVICTION),
        domainProfileTTLdays: this._parseEnv('CACHE_DPROFILE_TTL_D', ENV_SCHEMA.cache.CACHE_DPROFILE_TTL_D)
      },
      polling: {
        enabled: this._parseEnv('POLL_ENABLED', ENV_SCHEMA.polling.POLL_ENABLED),
        minIntervalMs: this._parseEnv('POLL_MIN_MS', ENV_SCHEMA.polling.POLL_MIN_MS),
        maxIntervalMs: this._parseEnv('POLL_MAX_MS', ENV_SCHEMA.polling.POLL_MAX_MS),
        jitterMs: this._parseEnv('POLL_JITTER_MS', ENV_SCHEMA.polling.POLL_JITTER_MS),
        maxConcurrent: this._parseEnv('POLL_MAX_CONC', ENV_SCHEMA.polling.POLL_MAX_CONC)
      },
      requests: {
        rateLimitGlobalPerSecond: this._parseEnv('RL_GLOBAL_PS', ENV_SCHEMA.requests.RL_GLOBAL_PS),
        rateLimitPerDomainPerMinute: this._parseEnv('RL_DOMAIN_PM', ENV_SCHEMA.requests.RL_DOMAIN_PM),
        rateLimitWindowMs: this._parseEnv('RATE_LIMIT_WINDOW_MS', ENV_SCHEMA.requests.RATE_LIMIT_WINDOW_MS),
        robotsRespect: this._parseEnv('ROBOTS_RESPECT', ENV_SCHEMA.requests.ROBOTS_RESPECT),
        crawlDelayMs: this._parseEnv('CRAWL_DELAY_MS', ENV_SCHEMA.requests.CRAWL_DELAY_MS),
        userAgentRotation: this._parseEnv('UA_ROTATION', ENV_SCHEMA.requests.UA_ROTATION),
        proxy: {
          enabled: this._parseEnv('PROXY_ENABLED', ENV_SCHEMA.requests.PROXY_ENABLED),
          poolSize: this._parseEnv('PROXY_POOL', ENV_SCHEMA.requests.PROXY_POOL),
          rotation: this._parseEnv('PROXY_ROTATION', ENV_SCHEMA.requests.PROXY_ROTATION)
        }
      },
      features: {
        planIntegration: this._parseEnv('FEATURE_PLAN_INTEGRATION', ENV_SCHEMA.features.FEATURE_PLAN_INTEGRATION),
        enforcePlanLimits: this._parseEnv('FEATURE_ENFORCE_PLAN_LIMITS', ENV_SCHEMA.features.FEATURE_ENFORCE_PLAN_LIMITS)
      },
      security: {
        freezeInProduction: this._parseEnv('SEC_FREEZE_PROD', ENV_SCHEMA.security.SEC_FREEZE_PROD),
        sandboxFS: this._parseEnv('SEC_SANDBOX_FS', ENV_SCHEMA.security.SEC_SANDBOX_FS),
        allowWhitelists: false,
        denylistDomains: this._parseStringList('SEC_DENYLIST_DOMAINS', ENV_SCHEMA.security.SEC_DENYLIST_DOMAINS),
        auditConfigChanges: this._parseEnv('SEC_AUDIT_CHANGES', ENV_SCHEMA.security.SEC_AUDIT_CHANGES),
        blockLocalhost: this._parseEnv('SEC_BLOCK_LOCALHOST', ENV_SCHEMA.security.SEC_BLOCK_LOCALHOST),
        block0000: this._parseEnv('SEC_BLOCK_0000', ENV_SCHEMA.security.SEC_BLOCK_0000),
        resolveDns: this._parseEnv('SEC_RESOLVE_DNS', ENV_SCHEMA.security.SEC_RESOLVE_DNS),
        dnsTimeoutMs: this._parseEnv('SEC_DNS_TIMEOUT_MS', ENV_SCHEMA.security.SEC_DNS_TIMEOUT_MS),
        rejectSymlinks: this._parseEnv('SEC_REJECT_SYMLINKS', ENV_SCHEMA.security.SEC_REJECT_SYMLINKS)
      },
      gate: {
        defaultLevel: 'LOW',
        limits: {
          low: 5,
          mid: 10,
          high: 15,
          maxLow: 15,
          maxMid: 50,
          maxHigh: 100
        },
        timeouts: {
          low: 30000,
          mid: 60000,
          high: 120000
        },
        softDeadlinePerUrlMs: this._parseEnv('SOFT_DEADLINE_PER_URL_MS', {
          type: 'integer', min: 5000, max: 120000, default: 30000
        }),
        validLevels: ['LOW', 'MID', 'HIGH'],
        fallbackLevel: 'LOW',
        overloadStatusCode: 429,
        overloadMessage: 'Server temporarily overloaded',
        reasonCode: 'queue-capacity',
        heavyOverloadStatusCode: 429,
        heavyOverloadMessage: 'Server temporarily overloaded for heavy operations',
        heavyReasonCode: 'queue-capacity-heavy',
        heavyCategoryLabel: 'heavy',
        minActiveRequests: 0,
        utilizationPrecision: 1,
        utilizationSuffix: '%',
        descriptions: {
          low: 'Conservative limits',
          mid: 'Moderate limits',
          high: 'Aggressive limits'
        }
      },
      matching: {
        highConfidence: scrapingConfig.MATCHING.HIGH_CONFIDENCE,
        mediumConfidence: scrapingConfig.MATCHING.MEDIUM_CONFIDENCE
      },
      middleware: {
        cacheFastLaneInstallMessage: 'Installing cacheFastLane middleware',
        selectiveGateInstallMessage: 'Installing selective queue gate'
      },
      testing: {
        stressTestUserId: 'stress_test_user',
        stressTestEmail: 'stress@test.local'
      },
      auth: {
        anonymousPrefix: 'anonymous_'
      },
      validation: {
        requiredFieldsError: 'Job titles and URLs are required',
        errorCode: 'VALIDATION_ERROR'
      },
      domains: {
        wwwPrefix: 'www.',
        protocolRegex: /^https?:\/\/(www\.)?/,
        pathSeparator: '/'
      },
      telemetry: {
        metricsEnabled: this._parseEnv('METRICS_ENABLED', ENV_SCHEMA.telemetry.METRICS_ENABLED),
        metricsSampling: this._parseEnv('METRICS_SAMPLING', ENV_SCHEMA.telemetry.METRICS_SAMPLING),
        piiRedaction: this._parseEnv('METRICS_PII', ENV_SCHEMA.telemetry.METRICS_PII),
        sinks: this._parseStringList('METRICS_SINKS', ENV_SCHEMA.telemetry.METRICS_SINKS)
      },
      cors: {
        allowedOrigins: process.env.CORS_ALLOWED_ORIGINS ? 
          process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()) : [],
        allowedRegex: process.env.CORS_ALLOWED_REGEX ? 
          process.env.CORS_ALLOWED_REGEX.split(',').map(s => s.trim()) : [],
        allowNoOrigin: process.env.CORS_ALLOW_NO_ORIGIN === 'true',
        allowNullOrigin: process.env.CORS_ALLOW_NULL_ORIGIN === 'true',
        credentials: process.env.CORS_CREDENTIALS !== 'false',
        optionsSuccessStatus: parseInt(process.env.CORS_OPTIONS_SUCCESS_STATUS) || 204,
        maxAge: parseInt(process.env.CORS_MAX_AGE) || 86400,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
        exposedHeaders: []
      },
      server: {
        maxJsonBody: process.env.MAX_JSON_BODY || '1mb'
      },
      static: {
        maxAge: process.env.STATIC_MAX_AGE || '1d'
      },
      text: {
        limit: process.env.TEXT_LIMIT || '1mb'
      },
      compress: {
        enabled: process.env.COMPRESSION_ENABLED !== 'false'
      },
      overrides: {
        envOverridesEnabled: true,
        precedence: ['ENV', 'LOCAL', 'DEFAULTS']
      }
    };

    if (!this._config.sessions.store) {
      this._config.sessions.store = this._config.db.mongodbUri ? 'mongo' : 
        (this._config.meta.environment === 'production' ? null : 'memory');
    }

    if (!this._config.sessions.secret && this._config.meta.environment !== 'production') {
      this._config.sessions.secret = crypto.randomBytes(32).toString('hex');
    }

    if (!this._config.startup.exclude.includes('debug/SessionStore.js')) {
      this._config.startup.exclude.push('debug/SessionStore.js');
    }
  }

  get scrapingConfig() { return scrapingConfig; }
  get cacheConfig() { return cacheConfig; }
  get uploadConfig() { return uploadConfig; }
  get performanceConfig() { return performanceConfig; }

  _parseEnv(envKey, schema) {
    const envValue = process.env[envKey];
    
    if (envValue === undefined) {
      return schema.default;
    }
    
    switch (schema.type) {
      case 'boolean': {
        const lowerValue = envValue.toLowerCase();
        return ['true', '1', 'yes', 'on', 'enabled'].includes(lowerValue);
      }
      case 'integer': {
        const intVal = parseInt(envValue, 10);
        if (isNaN(intVal)) return schema.default;
        if (schema.min !== undefined && intVal < schema.min) return schema.min;
        if (schema.max !== undefined && intVal > schema.max) return schema.max;
        return intVal;
      }
      case 'number': {
        const numVal = parseFloat(envValue);
        if (isNaN(numVal)) return schema.default;
        if (schema.min !== undefined && numVal < schema.min) return schema.min;
        if (schema.max !== undefined && numVal > schema.max) return schema.max;
        return numVal;
      }
      case 'enum':
        return schema.values.includes(envValue) ? envValue : schema.default;
      case 'string':
      default:
        return envValue || schema.default;
    }
  }

  _parseStringList(envKey, schema) {
    const envValue = process.env[envKey];
    if (!envValue) return schema.default.split(',').map(s => s.trim()).filter(s => s);
    return envValue.split(',').map(s => s.trim()).filter(s => s);
  }

  _applyPresets() {
    const preset = PRESET_MAPPINGS[this._config.parallelism.preset];
    if (preset) {
      if (this._config.parallelism.maxParallel === null) {
        this._config.parallelism.maxParallel = preset.maxParallel;
      }
      if (this._config.parallelism.maxScrapers === null) {
        this._config.parallelism.maxScrapers = preset.maxScrapers;
      }
      if (this._config.parallelism.maxBatchSize === null) {
        this._config.parallelism.maxBatchSize = preset.maxBatchSize;
      }
      if (this._config.parallelism.perDomainConcurrency === null) {
        this._config.parallelism.perDomainConcurrency = preset.perDomainConcurrency;
      }
      if (this._config.parallelism.cpuLoadTarget === null) {
        this._config.parallelism.cpuLoadTarget = preset.cpuLoadTarget;
      }
      if (this._config.parallelism.memLimitMB === null) {
        this._config.parallelism.memLimitMB = preset.memLimitMB;
      }
      if (this._config.parallelism.queueBackpressureThreshold === null) {
        this._config.parallelism.queueBackpressureThreshold = preset.queueBackpressureThreshold;
      }
    }
  }

  _validateConfiguration() {
    if (this._config.meta.environment === 'production') {
      if (!this._config.diagnostics.enabledInProduction) {
        this._config.diagnostics.mode = 'NO';
      }
      this._config.maintenance.enableDestructiveOps = false;
      if (this._config.logging.level === 'Verbose') {
        this._config.logging.level = 'Essential';
      }

      if (!this._config.sessions.secret) {
        throw new Error('SESSION_SECRET is required in production environment');
      }

      if (this._config.sessions.store === 'mongo' && !this._config.db.mongodbUri) {
        throw new Error('MongoDB URI is required when SESSIONS_STORE=mongo in production');
      }

      if (!this._config.sessions.store) {
        throw new Error('SESSIONS_STORE must be specified in production (mongo or memory)');
      }
    } else {
      if (this._config.sessions.store === 'mongo' && !this._config.db.mongodbUri) {
        throw new Error('MongoDB URI is required when SESSIONS_STORE=mongo');
      }
    }

    if (this._config.db.mongodbUri) {
      try {
        const mongoUrl = new URL(this._config.db.mongodbUri);
        this.smartLog('buffer', `MongoDB configured: ${mongoUrl.hostname}:${mongoUrl.port || 27017}`);
      } catch (error) {
        throw new Error(`Invalid MongoDB URI format: ${error.message}`);
      }
    }
    
    if (this._config.cache.freshnessSeconds > this._config.cache.retentionDays * 86400) {
      throw new Error('Cache freshness cannot exceed retention period');
    }
    
    if (this._config.timeouts.backoffBaseMs >= this._config.timeouts.backoffMaxMs) {
      throw new Error('Backoff base must be less than backoff max');
    }
    
    if (this._config.parallelism.maxParallel && this._config.parallelism.maxScrapers && 
        this._config.parallelism.maxParallel > this._config.parallelism.maxScrapers) {
      throw new Error('Max parallel cannot exceed max scrapers');
    }
  }

  _setupDirectories() {
    const dirs = Object.values(this._config.paths);
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  _validateSecurity() {
    const allowedPaths = ['cache', 'monitoring_data', 'debug', 'profiles', 'exports', 'logs', 'user_preferences'];
    this._config.maintenance.clean.allowPaths = this._config.maintenance.clean.allowPaths.filter(p => 
      allowedPaths.includes(p.trim())
    );
    
    if (this._config.retries.retryableErrors.length === 0) {
      this._config.retries.retryableErrors = RETRYABLE_ERROR_TYPES;
    }
  }

  _initializeLogTransport() {
    if (this._config.logging.transport === 'file') {
      try {
        const logPath = this._config.logging.file.path;
        if (fs.existsSync(logPath)) {
          const stats = fs.statSync(logPath);
          this._currentLogSize = Math.round(stats.size / (1024 * 1024));
        }
        this._logWriteStream = fs.createWriteStream(logPath, { flags: 'a' });
        this._logWriteStream.on('error', (error) => {
          this._config.logging.transport = 'silent';
          this._auditSecurity('log_rotation_failed', { error: error.message, fallback: 'silent' });
        });
      } catch (error) {
        this._config.logging.transport = 'silent';
        this._auditSecurity('log_init_failed', { error: error.message, fallback: 'silent' });
      }
    }
  }

  _rotateLogFile() {
    try {
      if (this._logWriteStream) {
        this._logWriteStream.end();
      }
      
      const basePath = this._config.logging.file.path;
      const dir = path.dirname(basePath);
      const ext = path.extname(basePath);
      const name = path.basename(basePath, ext);
      
      for (let i = this._config.logging.file.maxFiles - 1; i > 0; i--) {
        const oldFile = path.join(dir, `${name}.${i}${ext}`);
        const newFile = path.join(dir, `${name}.${i + 1}${ext}`);
        if (fs.existsSync(oldFile)) {
          if (i === this._config.logging.file.maxFiles - 1) {
            fs.unlinkSync(oldFile);
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }
      
      if (fs.existsSync(basePath)) {
        fs.renameSync(basePath, path.join(dir, `${name}.1${ext}`));
      }
      
      this._logWriteStream = fs.createWriteStream(basePath, { flags: 'a' });
      this._currentLogSize = 0;
      this._logFileIndex++;
      
      this._logWriteStream.on('error', (error) => {
        this._config.logging.transport = 'silent';
        this._auditSecurity('log_rotation_failed', { error: error.message, fallback: 'silent' });
      });
      
    } catch (error) {
      this._config.logging.transport = 'silent';
      this._auditSecurity('log_rotation_failed', { error: error.message, fallback: 'silent' });
    }
  }

  _writeLog(message) {
    const messageSize = Buffer.byteLength(message, 'utf8') / (1024 * 1024);
    
    switch (this._config.logging.transport) {
      case 'file':
        if (this._logWriteStream) {
          if (this._currentLogSize + messageSize > this._config.logging.file.maxSizeMB) {
            this._rotateLogFile();
          }
          this._logWriteStream.write(message + '\n');
          this._currentLogSize += messageSize;
        }
        break;
      case 'stdout':
        process.stdout.write(message + '\n');
        break;
      case 'silent':
        break;
    }
  }

  _deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach(name => {
      const value = obj[name];
      if (value && typeof value === 'object' && !(value instanceof Map) && !(value instanceof Set)) {
        this._deepFreeze(value);
      }
    });
    return Object.freeze(obj);
  }

  _freezeIfProduction() {
    if (this._config.meta.environment === 'production' && this._config.security.freezeInProduction) {
      this._frozen = true;
      this._deepFreeze(this._config);
    }
  }

  _auditConfigChange(operation, details) {
    if (this._config.security.auditConfigChanges) {
      this._auditLog.push({
        timestamp: new Date().toISOString(),
        operation,
        details,
        pid: process.pid,
        user: os.userInfo().username
      });
    }
  }

  async isUrlSafe(url) {
    try {
      const urlObj = new URL(url);
      
      if (DANGEROUS_SCHEMES.includes(urlObj.protocol)) {
        this._auditSecurity('dangerous_scheme', { url, scheme: urlObj.protocol });
        return { safe: false, reason: 'dangerous_scheme' };
      }
      
      if (this._config.security.denylistDomains.some(domain => urlObj.hostname.toLowerCase().includes(domain.toLowerCase()))) {
        this._auditSecurity('denylist_domain', { url, hostname: urlObj.hostname });
        return { safe: false, reason: 'denylist_domain' };
      }
      
      if (urlObj.hostname) {
        if (this._config.security.blockLocalhost && 
            LOCALHOST_PATTERNS.some(pattern => urlObj.hostname.toLowerCase() === pattern)) {
          this._auditSecurity('localhost_blocked', { url, hostname: urlObj.hostname });
          return { safe: false, reason: 'localhost_blocked' };
        }
        
        if (this._config.security.block0000 && urlObj.hostname === '0.0.0.0') {
          this._auditSecurity('zero_ip_blocked', { url, hostname: urlObj.hostname });
          return { safe: false, reason: 'zero_ip_blocked' };
        }
        
        const isPrivateV4 = PRIVATE_IP_RANGES_V4.some(range => range.test(urlObj.hostname));
        const isPrivateV6 = PRIVATE_IP_RANGES_V6.some(range => range.test(urlObj.hostname));
        
        if (isPrivateV4 || isPrivateV6) {
          this._auditSecurity('private_ip_blocked', { url, hostname: urlObj.hostname, type: isPrivateV4 ? 'ipv4' : 'ipv6' });
          return { safe: false, reason: 'private_ip' };
        }
        
        if (this._config.security.resolveDns) {
          try {
            const resolvePromises = [
              dns.resolve4(urlObj.hostname).catch(() => []),
              dns.resolve6(urlObj.hostname).catch(() => [])
            ];
            
            const [ipv4Addresses, ipv6Addresses] = await Promise.race([
              Promise.all(resolvePromises),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('DNS_TIMEOUT')), this._config.security.dnsTimeoutMs))
            ]);
            
            const allAddresses = [...ipv4Addresses, ...ipv6Addresses];
            
            for (const ip of allAddresses) {
              const isPrivateResolvedV4 = PRIVATE_IP_RANGES_V4.some(range => range.test(ip));
              const isPrivateResolvedV6 = PRIVATE_IP_RANGES_V6.some(range => range.test(ip));
              
              if (isPrivateResolvedV4 || isPrivateResolvedV6) {
                this._auditSecurity('dns_rebinding_blocked', { 
                  url, 
                  hostname: urlObj.hostname, 
                  resolved: ip, 
                  type: isPrivateResolvedV4 ? 'ipv4' : 'ipv6' 
                });
                return { safe: false, reason: 'dns_rebinding' };
              }
            }
          } catch (dnsError) {
            this._auditSecurity('dns_resolution_failed', { 
              url, 
              hostname: urlObj.hostname, 
              error: dnsError.message,
              timeout: this._config.security.dnsTimeoutMs
            });
            return { safe: false, reason: 'dns_resolution_failed' };
          }
        }
      }
      
      return { safe: true };
    } catch (error) {
      this._auditSecurity('invalid_url', { url, error: error.message });
      return { safe: false, reason: 'invalid_url' };
    }
  }

  validatePath(inputPath) {
    try {
      const normalizedPath = path.normalize(inputPath);
      const resolvedPath = path.resolve(this._config.paths.rootDir, normalizedPath);
      
      let realPath;
      try {
        realPath = fs.realpathSync(resolvedPath);
      } catch (realPathError) {
        realPath = resolvedPath;
      }
      
      if (!realPath.startsWith(this._config.paths.rootDir)) {
        this._auditSecurity('path_traversal_attempt', { inputPath, resolvedPath, realPath });
        return { valid: false, reason: 'path_traversal' };
      }
      
      if (this._config.security.rejectSymlinks && fs.existsSync(resolvedPath)) {
        let currentPath = resolvedPath;
        while (currentPath !== this._config.paths.rootDir && currentPath !== path.dirname(currentPath)) {
          try {
            const stats = fs.lstatSync(currentPath);
            if (stats.isSymbolicLink()) {
              this._auditSecurity('symlink_rejected', { inputPath, resolvedPath, symlinkPath: currentPath });
              return { valid: false, reason: 'symlink_rejected' };
            }
          } catch (statError) {
            this._auditSecurity('path_stat_error', { inputPath, resolvedPath, currentPath, error: statError.message });
          }
          currentPath = path.dirname(currentPath);
        }
      }
      
      const relativePath = path.relative(this._config.paths.rootDir, realPath);
      const pathSegments = relativePath.split(path.sep);
      const firstSegment = pathSegments[0];
      
      const isAllowed = this._config.maintenance.clean.allowPaths.includes(firstSegment);
      
      if (!isAllowed) {
        this._auditSecurity('path_not_allowed', { 
          inputPath, 
          resolvedPath, 
          realPath,
          firstSegment, 
          allowedPaths: this._config.maintenance.clean.allowPaths 
        });
        return { valid: false, reason: 'path_not_allowed' };
      }
      
      return { valid: true, resolved: realPath };
    } catch (error) {
      this._auditSecurity('path_validation_error', { inputPath, error: error.message });
      return { valid: false, reason: 'invalid_path' };
    }
  }

  _auditSecurity(event, data) {
    if (this._config.security.auditConfigChanges) {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        type: 'security',
        event,
        data,
        pid: process.pid
      };
      this._auditLog.push(auditEntry);
      
      this.smartLog('fail', `SECURITY_AUDIT: ${event}`, data);
    }
  }

  runStartupCleanup() {
    if (!this._config.startup.cleanEnabled) {
      this.smartLog('buffer', 'Startup cleanup disabled');
      return;
    }

    if (this._config.meta.environment === 'production' && 
        this._config.startup.safeProd && 
        !this._config.maintenance.enableDestructiveOps) {
      this.smartLog('buffer', 'Startup cleanup blocked in production (MAINT_ENABLE=false)');
      return;
    }

    const startTime = Date.now();
    let totalFiles = 0;
    let totalDeleted = 0;
    let totalSizeMB = 0;

    const maxAgeDays = this._config.startup.maxAgeDays;
    const maxTotalMB = this._config.startup.maxTotalMB;
    const cutoffTime = maxAgeDays > 0 ? Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000) : 0;

    const criticalFiles = [
      'debug/SessionStore.js',
      'profiles/profile-queue-buffer.json',
      'profiles/global-scraping-queue.json',
      'profiles/domain-profiles.json',
      'cache/.index.json',
      'queue_state.ndjson'
    ];

    const excludePatterns = [...this._config.startup.exclude, ...criticalFiles].map(pattern => {
      const fullPath = path.resolve(this._config.paths.rootDir, pattern);
      return { pattern, fullPath };
    });

    const isExcluded = (filePath) => {
      return excludePatterns.some(({ fullPath }) => filePath === fullPath || filePath.startsWith(fullPath + path.sep));
    };

    const isCriticalFile = (filePath) => {
      const fileName = path.basename(filePath);
      const relativePath = path.relative(this._config.paths.rootDir, filePath);
      
      return criticalFiles.some(critical => relativePath.endsWith(critical)) ||
             fileName.includes('queue') ||
             fileName.includes('profile') ||
             fileName.includes('session') ||
             fileName === '.index.json';
    };

    const cleanDirectory = (dirPath, folderName, mode) => {
      if (mode === 'never') return { files: 0, deleted: 0, sizeMB: 0 };

      const validation = this.validatePath(dirPath);
      if (!validation.valid) {
        this.smartLog('fail', `Invalid path for ${folderName}: ${validation.reason}`);
        return { files: 0, deleted: 0, sizeMB: 0 };
      }

      if (!fs.existsSync(dirPath)) {
        this.smartLog('buffer', `Directory not found: ${folderName}`);
        return { files: 0, deleted: 0, sizeMB: 0 };
      }

      let candidates = [];
      let folderFiles = 0;
      let folderSize = 0;
      let protectedFiles = 0;

      const scanDir = (currentPath) => {
        try {
          const items = fs.readdirSync(currentPath);
          for (const item of items) {
            const itemPath = path.join(currentPath, item);
            
            if (isExcluded(itemPath)) {
              protectedFiles++;
              continue;
            }

            try {
              const stats = fs.statSync(itemPath);
              folderFiles++;
              
              if (stats.isFile()) {
                const fileSizeMB = stats.size / (1024 * 1024);
                folderSize += fileSizeMB;
                
                if (isCriticalFile(itemPath)) {
                  this.smartLog('buffer', `PROTECTED critical file: ${path.relative(this._config.paths.rootDir, itemPath)}`);
                  protectedFiles++;
                  continue;
                }
                
                const fileAgeMs = Date.now() - stats.mtime.getTime();
                const minAgeForCleanupMs = 7 * 24 * 60 * 60 * 1000;
                
                if ((cutoffTime === 0 || stats.mtime.getTime() < cutoffTime) && 
                    fileAgeMs > minAgeForCleanupMs) {
                  candidates.push({ path: itemPath, sizeMB: fileSizeMB, type: 'file', age: fileAgeMs });
                }
              } else if (stats.isDirectory()) {
                scanDir(itemPath);
              }
            } catch (statError) {
              this.smartLog('fail', `Cannot stat ${itemPath}: ${statError.message}`);
            }
          }
        } catch (readError) {
          this.smartLog('fail', `Cannot read directory ${currentPath}: ${readError.message}`);
        }
      };

      scanDir(dirPath);

      if (candidates.length === 0) {
        this.smartLog('buffer', `${folderName}: ${folderFiles} files (${protectedFiles} protected), none eligible for cleanup`);
        return { files: folderFiles, deleted: 0, sizeMB: folderSize };
      }

      candidates.sort((a, b) => b.age - a.age);

      let deletedCount = 0;
      let deletedSize = 0;
      const maxFilesToDelete = Math.min(candidates.length, Math.floor(candidates.length * 0.3));

      for (let i = 0; i < maxFilesToDelete; i++) {
        const candidate = candidates[i];
        if (maxTotalMB > 0 && totalSizeMB + deletedSize >= maxTotalMB) break;

        if (mode === 'dry-run') {
          this.smartLog('batch', `DRY-RUN would delete: ${path.relative(this._config.paths.rootDir, candidate.path)} (${candidate.sizeMB.toFixed(2)}MB, ${Math.floor(candidate.age / (24*60*60*1000))}d old)`);
          deletedCount++;
          deletedSize += candidate.sizeMB;
        } else if (mode === 'confirm' && !this._config.startup.confirmAccept) {
          this.smartLog('buffer', `${folderName}: skipping ${maxFilesToDelete} files (CLEAN_CONFIRM_ACCEPT=false)`);
          break;
        } else if (mode === 'always' || (mode === 'confirm' && this._config.startup.confirmAccept)) {
          try {
            fs.unlinkSync(candidate.path);
            deletedCount++;
            deletedSize += candidate.sizeMB;
            this.smartLog('timing', `Deleted: ${path.relative(this._config.paths.rootDir, candidate.path)} (${candidate.sizeMB.toFixed(2)}MB, ${Math.floor(candidate.age / (24*60*60*1000))}d old)`);
          } catch (deleteError) {
            this.smartLog('fail', `Cannot delete ${candidate.path}: ${deleteError.message}`);
          }
        }
      }

      const action = mode === 'dry-run' ? 'would delete' : 'deleted';
      this.smartLog('batch', `${folderName}: ${folderFiles} files scanned (${protectedFiles} protected), ${deletedCount} ${action} (${deletedSize.toFixed(2)}MB)`);

      return { files: folderFiles, deleted: deletedCount, sizeMB: deletedSize };
    };

    const folderMappings = [
      { name: 'cache', path: this._config.paths.cacheDir, mode: this._config.startup.modes.cache },
      { name: 'debug', path: this._config.paths.debugDir, mode: this._config.startup.modes.debug },
      { name: 'profiles', path: this._config.paths.profilesDir, mode: 'dry-run' },
      { name: 'monitoring_data', path: this._config.paths.monitoringDir, mode: this._config.startup.modes.monitoring_data }
    ];

    this.smartLog('batch', 'Startup cleanup initiated (SAFE mode - critical files protected)');

    for (const folder of folderMappings) {
      const result = cleanDirectory(folder.path, folder.name, folder.mode);
      totalFiles += result.files;
      totalDeleted += result.deleted;
      totalSizeMB += result.sizeMB;
    }

    const duration = Date.now() - startTime;
    this.smartLog('timing', `SAFE startup cleanup completed: ${totalDeleted}/${totalFiles} files processed, ${totalSizeMB.toFixed(2)}MB freed (${duration}ms) - critical files preserved`);
  }

  shouldLog(category) {
    if (this._config.logging.level === 'OFF') return false;
    if (this._config.logging.level === 'Verbose') return true;
    
    const levelCategories = {
      Fails: ['fail'],
      Errors: ['fail', 'error'],
      Timeout: ['fail', 'error', 'timeout'],
      Essential: ['buffer', 'polling', 'langue', 'domain-profile', 'steps', 'retry', 'timeout', 'fail', 'win', 'cache', 'platform', 'fast-track', 'parallel', 'batch', 'timing', 'api', 'rate-limit', 'idempotent']
    };
    
    return levelCategories[this._config.logging.level]?.includes(category) || false;
  }

  smartLog(category, message, data = null) {
    if (!this.shouldLog(category)) return;
    
    if (Math.random() > this._config.logging.sampling) return;
    
    const deduplicationKey = `${category}:${message}`;
    const now = Date.now();
    const lastLog = this._logDeduplication.get(deduplicationKey);
    
    if (lastLog && (now - lastLog) < this._config.logging.dedupMs) return;
    
    this._logDeduplication.set(deduplicationKey, now);
    
    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = category.toUpperCase();
    
    let logMessage = message;
    if (this._config.logging.redactPII) {
      logMessage = this._redactPII(message);
    }
    
    const formattedLog = data ? 
      `[${timestamp}] ${prefix}: ${logMessage} ${JSON.stringify(this._config.logging.redactPII ? this._redactPII(data) : data)}` :
      `[${timestamp}] ${prefix}: ${logMessage}`;
    
    this._writeLog(formattedLog);
    
    if (this._config.logging.auditEvents && ['fail', 'error', 'security'].includes(category)) {
      this._auditLog.push({
        timestamp: new Date().toISOString(),
        level: category,
        message: logMessage,
        data: data ? (this._config.logging.redactPII ? this._redactPII(data) : data) : null
      });
    }
  }

  _redactPII(input) {
    if (typeof input === 'string') {
      return input
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
        .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]')
        .replace(/mongodb(\+srv)?:\/\/[^@]*@/g, 'mongodb$1://[REDACTED]@');
    }
    
    if (typeof input === 'object' && input !== null) {
      const redacted = {};
      for (const [key, value] of Object.entries(input)) {
        if (['password', 'token', 'secret', 'key', 'auth', 'uri', 'url'].some(sensitive => 
          key.toLowerCase().includes(sensitive))) {
          redacted[key] = '[REDACTED]';
        } else {
          redacted[key] = this._redactPII(value);
        }
      }
      return redacted;
    }
    
    return input;
  }

  calculateBackoff(attempt) {
    const base = this._config.timeouts.backoffBaseMs;
    const factor = this._config.retries.exponentialFactor;
    const max = this._config.timeouts.backoffMaxMs;
    
    let backoff = base * Math.pow(factor, attempt);
    
    if (this._config.retries.jitter) {
      backoff += Math.random() * base;
    }
    
    return Math.min(backoff, max);
  }

  isRetryableError(error) {
    const errorMessage = error.message || error.toString();
    return this._config.retries.retryableErrors.some(type =>
      errorMessage.toUpperCase().includes(type)
    );
  }

  createMemoryCache(defaultTTL = null) {
    const ttl = defaultTTL || this._config.timeouts.memCacheDefaultTtlMs;
    return {
      set: (key, value, customTtl = ttl) => {
        const expires = Date.now() + customTtl;
        this._memoryCache.set(key, { value, expires });
        setTimeout(() => this._memoryCache.delete(key), customTtl);
      },
      get: (key) => {
        const item = this._memoryCache.get(key);
        return item && item.expires > Date.now() ? item.value : null;
      },
      has: (key) => {
        const item = this._memoryCache.get(key);
        return item && item.expires > Date.now();
      },
      delete: (key) => this._memoryCache.delete(key),
      clear: () => this._memoryCache.clear()
    };
  }

  createRateLimit(windowMs = null, max = null) {
    const window = windowMs || this._config.requests.rateLimitWindowMs;
    const limit = max || this._config.requests.rateLimitGlobalPerSecond;
    
    return (key) => {
      const now = Date.now();
      const rateLimitWindow = this._rateLimits.get(key) || { count: 0, resetTime: now + window };
      
      if (now > rateLimitWindow.resetTime) {
        rateLimitWindow.count = 0;
        rateLimitWindow.resetTime = now + window;
      }
      
      if (++rateLimitWindow.count > limit) {
        this._rateLimits.set(key, rateLimitWindow);
        return { allowed: false, remaining: 0, resetTime: rateLimitWindow.resetTime };
      }
      
      this._rateLimits.set(key, rateLimitWindow);
      return { allowed: true, remaining: limit - rateLimitWindow.count, resetTime: rateLimitWindow.resetTime };
    };
  }

  createIdempotencyKey(req) {
    const userId = req.user?._id?.toString() || 'anonymous';
    const route = req.route?.path || req.path;
    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex').slice(0, 16);
    return req.headers['idempotency-key'] || `${userId}|${route}|${bodyHash}`;
  }

  storeIdempotentResponse(key, response, ttl = null) {
    const expires = Date.now() + (ttl || this._config.timeouts.idempotencyTtlMs);
    this._idempotencyCache.set(key, { response, expires });
    setTimeout(() => this._idempotencyCache.delete(key), ttl || this._config.timeouts.idempotencyTtlMs);
  }

  getIdempotentResponse(key) {
    const cached = this._idempotencyCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.response;
    }
    return null;
  }

  setSessionContext(sessionId, url, step = null, attempt = 1) {
    const host = this.extractHost(url);
    const sessionShort = sessionId ? sessionId.slice(-4) : 'anon';
    this._sessionContexts.set(sessionId || 'default', {
      sessionShort,
      host,
      step,
      attempt
    });
  }

  createApiContext(req) {
    const userId = req.user?._id?.toString() || req.body?.userId || req.headers['x-user-id'] || 'anonymous';
    const sessionId = req.sessionID || `temp_${Date.now()}`;
    const route = req.route?.path || req.path || 'unknown';
    const correlationId = req.headers['x-correlation-id'] || `${userId.slice(-8)}_${Date.now().toString(36)}`;
    
    return {
      userId: userId.slice(-8),
      sessionId: sessionId.slice(-8),
      route,
      correlationId,
      timestamp: new Date().toISOString()
    };
  }

  getContextualLogger(sessionId, apiContext = null) {
    const context = this._sessionContexts.get(sessionId) || {};
    const finalContext = apiContext ? { ...context, ...apiContext } : context;
    
    return {
      log: (category, message, data = null) => this.smartLogWithContext(category, message, finalContext, data),
      info: (message, data = null) => this.smartLogWithContext('api', message, finalContext, data),
      warn: (message, data = null) => this.smartLogWithContext('retry', message, finalContext, data),
      error: (message, data = null) => this.smartLogWithContext('fail', message, finalContext, data),
      cache: (action, key) => this.smartLogWithContext('cache', `${action}: ${key}`, finalContext),
      idempotent: (action, key) => this.smartLogWithContext('idempotent', `${action}: ${key}`, finalContext),
      rateLimit: (action, key) => this.smartLogWithContext('rate-limit', `${action}: ${key}`, finalContext),
      logSoftFail: (error, resolvedBy = null) => this.logSoftFailWithContext(error, resolvedBy, finalContext),
      updateStep: (step) => {
        if (this._sessionContexts.has(sessionId)) {
          this._sessionContexts.get(sessionId).step = step;
        }
      },
      updateAttempt: (attempt) => {
        if (this._sessionContexts.has(sessionId)) {
          this._sessionContexts.get(sessionId).attempt = attempt;
        }
      }
    };
  }

  extractHost(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  smartLogWithContext(category, message, context = {}, data = null) {
    if (!this.shouldLog(category)) return;
    
    const contextPrefix = this.buildContextPrefix(context);
    const fullMessage = contextPrefix ? `${contextPrefix} ${message}` : message;
    
    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = category.toUpperCase();
    
    const logData = data ? { ...data, context } : { context };
    
    if (data && data.softFail) {
      this._writeLog(`[${timestamp}] WARN: ${fullMessage} ${JSON.stringify(logData)}`);
    } else if (Object.keys(logData.context).length > 0) {
      this._writeLog(`[${timestamp}] ${prefix}: ${fullMessage} ${JSON.stringify(logData)}`);
    } else {
      this._writeLog(`[${timestamp}] ${prefix}: ${fullMessage}`);
    }
  }

  buildContextPrefix(context) {
    const parts = [];
    if (context.sessionId || context.sessionShort) parts.push(`s:${context.sessionId || context.sessionShort}`);
    if (context.userId) parts.push(`u:${context.userId}`);
    if (context.route) parts.push(`r:${context.route}`);
    if (context.correlationId) parts.push(`c:${context.correlationId}`);
    if (context.host) parts.push(`${context.host}`);
    if (context.step) parts.push(`${context.step}`);
    if (context.attempt && context.attempt > 1) parts.push(`attempt=${context.attempt}`);
    return parts.length > 0 ? `[${parts.join('|')}]` : '';
  }

  logSoftFailWithContext(error, resolvedBy = null, context = {}) {
    const contextPrefix = this.buildContextPrefix(context);
    const baseMessage = contextPrefix ? `${contextPrefix} ${error.message}` : error.message;
    
    const metadata = {
      softFail: true,
      resolvedBy: resolvedBy || 'minimum_cache',
      cacheQuality: 'minimum',
      retryAdvice: 'defer_step_tuning'
    };
    
    this.smartLogWithContext('retry', `${baseMessage} → resolved by ${resolvedBy || 'minimum_cache'}`, context, metadata);
  }

  logBatchStart(batchIndex, totalBatches, batchSize) {
    const timestamp = Date.now();
    this.smartLog('batch', `🚀 BATCH ${batchIndex + 1}/${totalBatches} START: ${batchSize} URLs in parallel`);
    return timestamp;
  }

  logBatchEnd(batchIndex, totalBatches, batchSize, startTime, successCount, failureCount) {
    const duration = Date.now() - startTime;
    const avgTimePerUrl = Math.round(duration / batchSize);
    
    this._performanceMetrics.batchTimings.push({
      batchIndex,
      batchSize,
      duration,
      successCount,
      failureCount,
      avgTimePerUrl,
      timestamp: Date.now()
    });
    
    this.smartLog('batch', `✅ BATCH ${batchIndex + 1}/${totalBatches} END: ${successCount}/${batchSize} success (${duration}ms, ~${avgTimePerUrl}ms/url)`);
    this.smartLog('timing', `Batch efficiency: ${Math.round((successCount / batchSize) * 100)}% success rate`);
    
    return duration;
  }

  logParallelStart(totalUrls, batchCount, estimatedSequentialTimeMs) {
    this._performanceMetrics.parallelStart = Date.now();
    this._performanceMetrics.totalUrls = totalUrls;
    this._performanceMetrics.batchCount = batchCount;
    this._performanceMetrics.estimatedSequentialTime = estimatedSequentialTimeMs;
    
    const parallelTargetMs = Math.round(estimatedSequentialTimeMs / Math.max(1, batchCount));
    
    this.smartLog('parallel', `🔥 PARALLEL START: ${totalUrls} URLs → ${batchCount} batches`);
    this.smartLog('timing', `Sequential estimate: ${Math.round(estimatedSequentialTimeMs / 1000)}s vs Parallel target: ${Math.round(parallelTargetMs / 1000)}s`);
  }

  logParallelEnd(totalSuccessCount, totalFailureCount) {
    const totalDuration = Date.now() - this._performanceMetrics.parallelStart;
    const sequentialEstimate = this._performanceMetrics.estimatedSequentialTime;
    const speedupRatio = sequentialEstimate / totalDuration;
    const totalUrls = this._performanceMetrics.totalUrls;
    
    this._performanceMetrics.parallelEfficiency = {
      totalDuration,
      sequentialEstimate,
      speedupRatio,
      totalUrls,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
      avgTimePerUrl: Math.round(totalDuration / totalUrls),
      efficiency: Math.round((speedupRatio - 1) * 100)
    };
    
    this.smartLog('parallel', `🎯 PARALLEL END: ${totalDuration}ms total (${Math.round(totalDuration / 1000)}s)`);
    this.smartLog('timing', `⚡ SPEEDUP: ${speedupRatio.toFixed(1)}x faster than sequential (${this._performanceMetrics.parallelEfficiency.efficiency}% efficiency gain)`);
    this.smartLog('timing', `📊 PERFORMANCE: ${totalSuccessCount}/${totalUrls} success, ~${this._performanceMetrics.parallelEfficiency.avgTimePerUrl}ms/url`);
    
    return this._performanceMetrics.parallelEfficiency;
  }

  getParallelPerformanceReport() {
    if (!this._performanceMetrics.parallelEfficiency) {
      return { status: 'no_data', message: 'No parallel execution completed yet' };
    }
    
    const report = {
      ...this._performanceMetrics.parallelEfficiency,
      batchDetails: this._performanceMetrics.batchTimings,
      status: 'success'
    };
    
    this._performanceMetrics.lastBatchReport = report;
    return report;
  }

  isParallelWorkingEffectively() {
    const efficiency = this._performanceMetrics.parallelEfficiency;
    if (!efficiency) return null;
    
    const isEffective = efficiency.speedupRatio > 2.0 && efficiency.successCount > efficiency.failureCount;
    
    this.smartLog('parallel', `Parallel effectiveness: ${isEffective ? '✅ WORKING' : '❌ INEFFECTIVE'} (${efficiency.speedupRatio.toFixed(1)}x speedup)`);
    
    return {
      isWorking: isEffective,
      speedup: efficiency.speedupRatio,
      recommendation: isEffective ? 
        'Parallel processing is working well' : 
        'Consider adjusting batch size or checking for bottlenecks'
    };
  }

  clearPerformanceMetrics() {
    this._performanceMetrics = {
      batchTimings: [],
      urlTimings: [],
      parallelEfficiency: null,
      lastBatchReport: null
    };
    this._logDeduplication.clear();
    this._sessionContexts.clear();
    this._memoryCache.clear();
    this._rateLimits.clear();
    this._idempotencyCache.clear();
    this.smartLog('timing', 'Performance metrics cleared');
  }

  shouldExportDebug(result, error, stepName = null) {
    if (this._config.meta.environment === 'production' && !this._config.diagnostics.enabledInProduction) return false;
    if (this._config.diagnostics.mode === 'NO') return false;
    
    const isTechnicalFail = !result || 
                           error || 
                           (result && result.isEmpty) || 
                           (result && result.error) ||
                           (result && result.isMinimumCache);
    
    const isEmptyButValid = result && 
                           result.success && 
                           (!result.links || result.links.length === 0) && 
                           !result.error &&
                           !result.isEmpty;
    
    if (isEmptyButValid) {
      this.smartLog('win', `Step ${stepName || 'unknown'} succeeded but found no jobs - NOT exporting debug (EMPTY result)`);
      return false;
    }
    
    if (isTechnicalFail) {
      this.smartLog('fail', `Step ${stepName || 'unknown'} technical failure - exporting debug (FAIL result)`);
      return true;
    }
    
    return false;
  }

  hasUnrenderedTemplates(text) {
    if (!text) return false;
    
    const templatePatterns = [
      /\{\{\s*department\s*\}\}/i,
      /\{\{\s*job\.jobTitle\s*\}\}/i,
      /\{\{\s*job\.location\s*\}\}/i,
      /\{\{\s*[^}]+\}\}/,
      /\{%[^%]+%\}/,
      /<%[^%]+%>/,
      /\$\{[^}]+\}/
    ];
    
    return templatePatterns.some(pattern => pattern.test(text));
  }

  shouldExportTiming() {
    return this._config.logging.level === 'Verbose';
  }

  shouldExportParallelReport() {
    return this._config.logging.level === 'Verbose';
  }

  shouldExportDiagnostic() {
    return this._config.logging.level === 'Verbose';
  }

  normalizeApiResponse(success, data = null, error = null, correlationId = null) {
    return {
      success,
      data,
      error: error ? (error.message || error) : null,
      correlationId,
      timestamp: new Date().toISOString()
    };
  }

  get config() {
    return this._config;
  }

  get search() { return this._config.search; }
  get flags() { return this._config.flags; }
  get gate() { return this._config.gate; }
  get meta() { return this._config.meta; }
  get paths() { return this._config.paths; }
  get db() { return this._config.db; }
  get sessions() { return this._config.sessions; }
  get logging() { return this._config.logging; }
  get diagnostics() { return this._config.diagnostics; }
  get maintenance() { return this._config.maintenance; }
  get startup() { return this._config.startup; }
  get parallelism() { return this._config.parallelism; }
  get timeouts() { return this._config.timeouts; }
  get retries() { return this._config.retries; }
  get cache() { return this._config.cache; }
  get polling() { return this._config.polling; }
  get requests() { return this._config.requests; }
  get features() { return this._config.features; }
  get security() { return this._config.security; }
  get telemetry() { return this._config.telemetry; }
  get cors() { return this._config.cors; }
  get overrides() { return this._config.overrides; }
  get platforms() { return this._config.platforms; }
  get server() { return this._config.server; }
  get static() { return this._config.static; }
  get text() { return this._config.text; }
  get compress() { return this._config.compress; }
  get PORT() { return process.env.PORT || 3000; }
  get DEBUG() { return this._config.meta.environment !== 'production'; }
  get CACHE_DIR() { return this._config.paths.cacheDir; }
  get DEBUG_DIR() { return this._config.paths.debugDir; }
  get USER_PREFS_DIR() { return path.join(this._config.paths.rootDir, 'user_preferences'); }
  get MONGODB_URI() { return this._config.db.mongodbUri; }
  get SESSION_SECRET() { return this._config.sessions.secret; }
  get SESSION_MAX_AGE() { return this._config.sessions.cookieMaxAgeMs; }
  get CACHE_DURATION() { return this._config.cache.freshnessSeconds * 1000; }
  get PLAN_LIMITS_TTL_MS() { return 30000; }
  get IDEMPOTENCY_TTL_MS() { return this._config.timeouts.idempotencyTtlMs; }
  get RATE_LIMIT_WINDOW_MS() { return this._config.requests.rateLimitWindowMs; }
  get RATE_LIMIT_MAX() { return this._config.requests.rateLimitGlobalPerSecond; }
  get REQUEST_TIMEOUT_MS() { return this._config.timeouts.requestMs; }
  get HOVER_TIMEOUT() { return this._config.timeouts.scraperStepMs; }
  get CLICK_TIMEOUT() { return this._config.timeouts.scraperStepMs; }
  get PAGE_LOAD_TIMEOUT() { return this._config.timeouts.navigationMs; }
  get GLOBAL_TIMEOUT() { return this._config.timeouts.globalJobMs; }
  get GOOGLE_CLIENT_ID() { return process.env.GOOGLE_CLIENT_ID; }
  get GOOGLE_CLIENT_SECRET() { return process.env.GOOGLE_CLIENT_SECRET; }
  get GITHUB_CLIENT_ID() { return process.env.GITHUB_CLIENT_ID; }
  get GITHUB_CLIENT_SECRET() { return process.env.GITHUB_CLIENT_SECRET; }
  get BASE_URL() { return process.env.BASE_URL || `http://localhost:${this.PORT}`; }
  get EMAIL_SERVICE() { return process.env.EMAIL_SERVICE || 'gmail'; }
  get EMAIL_USER() { return process.env.EMAIL_USER; }
  get EMAIL_PASS() { return process.env.EMAIL_PASS; }
  get LOG_LEVELS() {
    return {
      ESSENTIAL: ['buffer', 'polling', 'langue', 'domain-profile', 'steps', 'retry', 'timeout', 'fail', 'win', 'cache', 'platform', 'fast-track', 'parallel', 'batch', 'timing', 'api', 'rate-limit', 'idempotent'],
      VERBOSE: ['all-current-logs']
    };
  }
  get CURRENT_LOG_LEVEL() { return this._config.logging.level === 'Verbose' ? 'VERBOSE' : 'ESSENTIAL'; }
  get PLAN_HIERARCHY() {
    return {
      free: 0,
      standard: 1,
      premium: 2,
      pro: 3
    };
  }

  get auditLog() {
    return this._auditLog.slice();
  }
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round((memUsage.heapUsed || 0) / 1024 / 1024 * 100) / 100;
    const heapTotalMB = Math.round((memUsage.heapTotal || 0) / 1024 / 1024 * 100) / 100;
    const rssMB = Math.round((memUsage.rss || 0) / 1024 / 1024 * 100) / 100;
    const externalMB = Math.round((memUsage.external || 0) / 1024 / 1024 * 100) / 100;

    return {
      heapUsedMB: isNaN(heapUsedMB) ? 0 : heapUsedMB,
      heapTotalMB: isNaN(heapTotalMB) ? 0 : heapTotalMB,
      rssMB: isNaN(rssMB) ? 0 : rssMB,
      externalMB: isNaN(externalMB) ? 0 : externalMB,
      totalMB: isNaN(heapUsedMB + externalMB) ? 0 : Math.round((heapUsedMB + externalMB) * 100) / 100
    };
  }

  getCacheStatsFormatted() {
    const memStats = this.getMemoryStats();
    return {
      L1: `${memStats.heapUsedMB}MB`,
      L2: `${memStats.rssMB}MB`,
      unified: `${memStats.totalMB}MB`,
      details: {
        heapUsed: memStats.heapUsedMB,
        heapTotal: memStats.heapTotalMB,
        rss: memStats.rssMB,
        external: memStats.externalMB
      }
    };
  }

}

const configInstance = new SecureConfig();

module.exports = configInstance;