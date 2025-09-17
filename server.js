require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const config = require('./config');
const serverConfig = require('./config/server');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const fs = require('fs');

const SecurityMiddleware = require('./middleware/SecurityMiddleware');

const loggingService = require('./services/LoggingService');
global.loggingService = loggingService;

const connectDB = require('./database/connection');
const passport = require('./config/passport');
const { setupMiddlewares } = require('./middlewares');
const { ensureDebugDir } = require('./utils');
const { shutdownBrowser, initBrowser } = require('./browserManager');
const { addUserToLocals, rateLimitByUser } = require('./middleware/authMiddleware');
const parallelization = require('./config/parallelization');

config.runStartupCleanup();

const app = express();
const ProfileQueueManager = require('./scrapers/ProfileQueueManager');
const EmailQueueManager = require('./scrapers/EmailQueueManager');
const { emailCoordinator } = require('./scrapers/EmailCoordinator');

connectDB();
if (process.env.NODE_ENV !== 'production') {
  parallelization.setResourceLevel('LOW');
}

app.disable('x-powered-by');

SecurityMiddleware.trustProxyConfig(app);

const setupSecurityMiddleware = () => {
  const isProduction = config.meta?.environment === 'production';
  
  const helmetConfig = {
    contentSecurityPolicy: serverConfig.SECURITY.CSP_ENABLED ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 
          'https://cdnjs.cloudflare.com', 
          'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 
          'https://cdnjs.cloudflare.com', 
          'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 
          'https://cdnjs.cloudflare.com', 
          'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null
      }
    } : false,
    hsts: isProduction ? {
      maxAge: serverConfig.SECURITY.HSTS_MAX_AGE,
      includeSubDomains: true,
      preload: true
    } : false,
    frameguard: { 
      action: serverConfig.SECURITY.FRAME_OPTIONS
    },
    noSniff: true,
    xssFilter: serverConfig.SECURITY.XSS_FILTER_ENABLED,
    referrerPolicy: { 
      policy: serverConfig.SECURITY.REFERRER_POLICY
    },
    permittedCrossDomainPolicies: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: true,
    dnsPrefetchControl: { allow: false },
    ieNoOpen: true,
    hidePoweredBy: true
  };
  
  app.use(helmet(helmetConfig));
};

const setupCompressionMiddleware = () => {
  const compressionConfig = {
    level: serverConfig.COMPRESSION.LEVEL,
    threshold: serverConfig.COMPRESSION.THRESHOLD,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
    brotli: {
      enabled: serverConfig.COMPRESSION.BROTLI_ENABLED,
      params: {
        [require('zlib').constants.BROTLI_PARAM_QUALITY]: serverConfig.COMPRESSION.BROTLI_QUALITY
      }
    }
  };
  
  app.use(compression(compressionConfig));
};

const setupCorsMiddleware = () => {
  const corsOptions = {
    origin: (origin, callback) => {
      const allowedOrigins = serverConfig.CORS.ALLOWED_ORIGINS;
      
      if (!origin && serverConfig.CORS.ALLOW_NO_ORIGIN) {
        return callback(null, true);
      }
      
      if (serverConfig.CORS.ALLOW_ALL) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: serverConfig.CORS.CREDENTIALS,
    methods: serverConfig.CORS.METHODS,
    allowedHeaders: serverConfig.CORS.ALLOWED_HEADERS,
    exposedHeaders: serverConfig.CORS.EXPOSED_HEADERS,
    maxAge: serverConfig.CORS.MAX_AGE,
    preflightContinue: false,
    optionsSuccessStatus: serverConfig.CORS.OPTIONS_SUCCESS_STATUS
  };
  
  app.use(cors(corsOptions));
};

const initializeSessionStore = () => {
  const mongoUri = config.db.mongodbUri || config.MONGODB_URI;
  const sessionSecret = config.sessions.secret || config.SESSION_SECRET;
  const cookieMaxAge = config.sessions.cookieMaxAgeMs || config.SESSION_MAX_AGE;

  if (!sessionSecret) {
    if (config.meta.environment === 'production') {
      throw new Error('SESSION_SECRET is required in production environment');
    }
    config.smartLog('fail', 'SESSION_SECRET not configured, using ephemeral secret');
  }

  let sessionStore;
  let storeType = config.sessions.store;

  if (storeType === 'mongo') {
    if (!mongoUri) {
      if (config.meta.environment === 'production') {
        throw new Error('MongoDB URI is required when SESSIONS_STORE=mongo in production');
      }
      config.smartLog('fail', 'MongoDB URI not configured for sessions, falling back to memory store');
      storeType = 'memory';
    } else {
      try {
        sessionStore = MongoStore.create({
          mongoUrl: mongoUri,
          touchAfter: serverConfig.SESSIONS.TOUCH_AFTER_SECONDS,
          collection: config.sessions.collection,
          ttl: config.sessions.ttlSeconds
        });
        config.smartLog('win', `Session store initialized: MongoDB (collection: ${config.sessions.collection})`);
      } catch (error) {
        config.smartLog('fail', `Failed to create MongoDB session store: ${error.message}`);
        if (config.meta.environment === 'production') {
          throw new Error(`MongoDB session store initialization failed: ${error.message}`);
        }
        config.smartLog('buffer', 'Falling back to memory store');
        storeType = 'memory';
      }
    }
  }

  if (storeType === 'memory') {
    if (config.meta.environment === 'production') {
      throw new Error('Memory session store is not allowed in production environment');
    }
    sessionStore = new session.MemoryStore();
    config.smartLog('buffer', 'Session store initialized: Memory (development only)');
  }

  if (!sessionStore) {
    throw new Error('Failed to initialize session store');
  }

  return {
    store: sessionStore,
    secret: sessionSecret,
    maxAge: cookieMaxAge
  };
};

const initializeCacheDirectory = () => {
  const cacheDir = path.resolve(config.CACHE_DIR);
  config.smartLog('buffer', `Cache directory path: ${cacheDir}`);
  
  try {
    const cacheStats = fs.statSync(cacheDir, { throwIfNoEntry: false });
    if (!cacheStats) {
      config.smartLog('buffer', 'Cache directory does not exist, creating...');
      fs.mkdirSync(cacheDir, { recursive: true });
      config.smartLog('win', `Cache directory created: ${cacheDir}`);
    } else if (!cacheStats.isDirectory()) {
      config.smartLog('fail', `Cache path exists but is not a directory: ${cacheDir}`);
    } else {
      config.smartLog('buffer', `Cache directory exists: ${cacheDir}`);
      const testFile = path.join(cacheDir, 'test-write-permission.txt');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        config.smartLog('win', 'Cache directory write test successful');
      } catch (writeError) {
        config.smartLog('fail', `Cannot write to cache directory: ${writeError.message}`);
      }
    }
  } catch (error) {
    config.smartLog('fail', `Cache directory verification error: ${error.message}`);
  }
};

const setupExpressConfiguration = () => {
  app.use(SecurityMiddleware.setSecurityHeaders);
  app.use(SecurityMiddleware.createRateLimit('GLOBAL'));
  
  setupSecurityMiddleware();
  setupCompressionMiddleware();
  setupCorsMiddleware();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  app.use(SecurityMiddleware.sanitizeInput);

  const sessionConfig = initializeSessionStore();

  app.use(session({
    secret: sessionConfig.secret,
    resave: false,
    saveUninitialized: false,
    store: sessionConfig.store,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: sessionConfig.maxAge,
      sameSite: serverConfig.SESSIONS.SAME_SITE
    },
    name: serverConfig.SESSIONS.COOKIE_NAME,
    proxy: serverConfig.SESSIONS.TRUST_PROXY
  }));

  app.use(passport.initialize());
  app.use(passport.session());
  setupMiddlewares(app);

  app.use('/dictionaries/ui', express.static(path.join(__dirname, serverConfig.PATHS.DICTIONARIES_UI_PATH), {
    maxAge: serverConfig.STATIC_FILES.MAX_AGE,
    etag: serverConfig.STATIC_FILES.ETAG_ENABLED,
    lastModified: serverConfig.STATIC_FILES.LAST_MODIFIED_ENABLED,
    setHeaders: (res, path) => {
      if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      }
    }
  }));

  app.use(addUserToLocals);
  app.use(rateLimitByUser(
    serverConfig.RATE_LIMITING.DEFAULT_MAX_REQUESTS, 
    serverConfig.RATE_LIMITING.DEFAULT_WINDOW_MS
  ));
};

const setupRoutes = () => {
  const publicApiRoutes = require('./routes/publicApiRoutes');
  const apiRoutes = require('./routes/apiRoutes');
  const authRoutes = require('./routes/authRoutes');
  const planRoutes = require('./routes/planRoutes');
  const emailSearchRoutes = require('./routes/emailSearchRoutes');
  const emailLimitsRoutes = require('./routes/emailLimitsRoutes');
  const monitoringRoutes = require('./routes/monitoringRoutes');
  const historicalAnalysisRoutes = require('./routes/historicalAnalysisRoutes');
  const jobListingRoutes = require('./routes/jobListingRoutes');
  const pageRoutes = require('./routes/pageRoutes');
  const linktreeRoutes = require('./routes/linktreeRoutes');
  const saveUserPreferencesRoutes = require('./routes/saveUserPreferencesRoutes');
  const adminRoutes = require('./routes/adminRoutes');

  app.use('/', publicApiRoutes);
  app.use('/api', apiRoutes);
  app.use('/auth', authRoutes);
  app.use('/plan', planRoutes);
  app.use('/email', emailSearchRoutes); 
  app.use('/email-limits', emailLimitsRoutes);
  app.use('/monitoring', monitoringRoutes);
  app.use('/monitoring', historicalAnalysisRoutes);
  app.use('/api', jobListingRoutes);
  app.use('/', pageRoutes);
  app.use('/linktree', linktreeRoutes);
  app.use('/', saveUserPreferencesRoutes);
  app.use('/admin', adminRoutes);

  if (config.DEBUG) {
    const debugRoutes = require('./routes/debugRoutes');
    app.use('/debug', debugRoutes);
  }

  app.use(express.static(serverConfig.PATHS.PUBLIC_DIR, {
    maxAge: serverConfig.STATIC_FILES.MAX_AGE,
    etag: serverConfig.STATIC_FILES.ETAG_ENABLED,
    lastModified: serverConfig.STATIC_FILES.LAST_MODIFIED_ENABLED,
    index: false
  }));
};

let systemInitialized = false;
let MonitoringIntegration = null;
let ScrapingCoordinator = null;

const initializeSystem = async () => {
  if (systemInitialized) {
    config.smartLog('buffer', 'System already initialized, skipping');
    return;
  }

  try {
    config.smartLog('buffer', 'Initializing browser...');
    await initBrowser();
    config.smartLog('win', 'Browser initialized successfully');
    
    config.smartLog('buffer', 'Initializing Profile Queue Manager...');
    await ProfileQueueManager.start();
    config.smartLog('win', 'Profile Queue Manager initialized successfully');
    
    config.smartLog('buffer', 'Initializing Email Queue Manager...');
    await EmailQueueManager.start();
    config.smartLog('win', 'Email Queue Manager initialized successfully');
    
    config.smartLog('buffer', 'Initializing Email Coordinator...');
    await emailCoordinator.initialize();
    config.smartLog('win', 'Email Coordinator initialized successfully');
    
    config.smartLog('buffer', 'Initializing Scraping Coordinator...');
    ScrapingCoordinator = require('./scrapers/ScrapingCoordinator');
    const coordinator = ScrapingCoordinator.getInstance();
    await coordinator.initialize();
    config.smartLog('win', 'Scraping Coordinator initialized successfully');
    
    config.smartLog('buffer', 'Initializing Monitoring System...');
    MonitoringIntegration = require('./monitoring/MonitoringIntegration');
    await MonitoringIntegration.initialize();
    config.smartLog('win', 'Monitoring System initialized successfully');
    
    const JobListingService = require('./services/JobListingService');
    const jobListingService = JobListingService.getInstance();
    config.smartLog('service', 'JobListingService initialized');
    
    systemInitialized = true;
    config.smartLog('win', 'All systems initialized successfully');
    
  } catch (error) {
    config.smartLog('fail', `System initialization failed: ${error.message}`);
    throw error;
  }
};

const gracefulShutdown = async (signal) => {
  config.smartLog('buffer', `Server shutdown (${signal})...`);
  try {
    await ProfileQueueManager.stop();
    await EmailQueueManager.stop();
    await emailCoordinator.shutdown();
    if (MonitoringIntegration) {
      await MonitoringIntegration.shutdown();
    }
    await shutdownBrowser();
    
    if (ScrapingCoordinator) {
      const coordinator = ScrapingCoordinator.getInstance();
      await coordinator.close();
    }
  } catch (error) {
    config.smartLog('fail', `Error during shutdown: ${error.message}`);
  }
  process.exit(0);
};

const startServer = async () => {
  try {
    setupExpressConfiguration();

    initializeCacheDirectory();

    ensureDebugDir(); 

    setupRoutes();

    app.listen(config.PORT, async () => {
      config.smartLog('win', `Server started on port ${config.PORT}`);
      config.smartLog('buffer', `Debug mode: ${config.DEBUG ? 'Enabled' : 'Disabled'}`);
      if (config.DEBUG) {
        config.smartLog('buffer', `Debug URL: http://localhost:${config.PORT}/debug/search`);
      }
      if (config.db.mongodbUri) {
        try {
          const mongoUrl = new URL(config.db.mongodbUri);
          config.smartLog('buffer', `MongoDB: ${mongoUrl.hostname}:${mongoUrl.port || 27017}/${mongoUrl.pathname.slice(1) || 'default'}`);
        } catch (error) {
          config.smartLog('buffer', 'MongoDB: configured (URI format validation passed)');
        }
      } else {
        config.smartLog('buffer', 'MongoDB: not configured');
      }
      config.smartLog('buffer', `Homepage: http://localhost:${config.PORT}`);
      config.smartLog('buffer', `Login: http://localhost:${config.PORT}/login`);
      config.smartLog('buffer', `Register: http://localhost:${config.PORT}/register`);
      
      await initializeSystem();
      
      if (MonitoringIntegration) {
        app.use(MonitoringIntegration.createExpressMiddleware());
      }
    });
  } catch (error) {
    config.smartLog('fail', `Server startup error: ${error.message}`);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();