require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const config = require('./config');
const securityConfig = require('./config/security');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const fs = require('fs');
const saveUserPreferencesRoutes = require('./routes/saveUserPreferencesRoutes');

let sanityCompat = null;
try {
    sanityCompat = require('./sanityCheck/sanityCompat');
    config.smartLog('buffer', 'sanityCompat:loaded');
} catch (error) {
    config.smartLog('buffer', `sanityCompat:skip - ${error.message}`);
}

const connectDB = require('./database/connection');
const passport = require('./config/passport');
const { ensureCacheDir } = require('./cacheManager');
const { ensureDebugDir } = require('./utils');
const { shutdownBrowser, initBrowser } = require('./browserManager');
const { addUserToLocals, rateLimitByUser, apiOnlyAuth } = require('./middleware/authMiddleware');
const userPreferencesManager = require('./userPreferencesManager');
const parallelization = require('./config/parallelization');
const cacheFastLane = require('./middleware/cacheFastLane');
const queueGate = require('./middleware/queueGate');
const dictionaries = require('./dictionaries');

const ensureRunDir = () => {
    const runDir = path.join(__dirname, 'run');
    if (!fs.existsSync(runDir)) {
        fs.mkdirSync(runDir, { recursive: true });
    }
    return runDir;
};

const createPidLock = () => {
    if (!securityConfig.shouldUsePidLock()) {
        config.smartLog('system', 'PID lock disabled by configuration');
        return null;
    }

    const runDir = ensureRunDir();
    const pidFile = path.join(runDir, 'app.pid');
    
    if (fs.existsSync(pidFile)) {
        const existingPid = fs.readFileSync(pidFile, 'utf8').trim();
        try {
            process.kill(parseInt(existingPid), 0);
            config.smartLog('system', `PID file exists - Process ${existingPid} already running`);
            
            if (securityConfig.shouldExitOnPidLock()) {
                config.smartLog('system', 'Production environment - exiting due to existing process');
                process.exit(1);
            } else {
                config.smartLog('warn', 'Development/test environment - continuing despite existing PID file');
                fs.unlinkSync(pidFile);
            }
        } catch (e) {
            config.smartLog('system', `Removing stale PID file for process ${existingPid}`);
            fs.unlinkSync(pidFile);
        }
    }
    
    fs.writeFileSync(pidFile, process.pid.toString());
    config.smartLog('win', `PID file created - ${process.pid}`);
    
    return pidFile;
};

const removePidLock = (pidFile) => {
    if (!pidFile) return;
    
    try {
        if (fs.existsSync(pidFile)) {
            fs.unlinkSync(pidFile);
            config.smartLog('win', 'PID file removed');
        }
    } catch (error) {
        config.smartLog('fail', `Error removing PID file: ${error.message}`);
    }
};

const determineResourceLevel = () => {
  const envLevel = process.env.RESOURCE_LEVEL?.toUpperCase();
  const validLevels = ['LOW', 'MID', 'HIGH'];
  
  if (envLevel && validLevels.includes(envLevel)) {
      config.smartLog('system', `Resource level forced by env: ${envLevel}`);
      return envLevel;
  }
  
  if (securityConfig.isProduction()) {
      config.smartLog('system', 'Production mode, using MID level');
      return 'MID';
  }
  
  const totalMemGB = Math.round(require('os').totalmem() / (1024 * 1024 * 1024));
  const cpuCount = require('os').cpus().length;
  
  config.smartLog('system', `System specs: ${totalMemGB}GB RAM, ${cpuCount} CPUs`);
  
  if (totalMemGB >= 32 && cpuCount >= 16) {
      config.smartLog('system', 'High-end system detected, using HIGH level');
      return 'HIGH';
  } else if (totalMemGB >= 16 && cpuCount >= 8) {
      config.smartLog('system', 'Mid-range system detected, using MID level');
      return 'MID';  
  } else {
      config.smartLog('system', 'Low-spec system detected, using LOW level');
      return 'LOW';
  }
};

const initializeResourceLevel = () => {
  const level = determineResourceLevel();
  
  try {
      if (parallelization.setResourceLevel && typeof parallelization.setResourceLevel === 'function') {
          parallelization.setResourceLevel(level);
          config.smartLog('win', `Resource level set to ${level} in parallelization config`);
      } else {
          config.smartLog('fail', 'parallelization.setResourceLevel not available - using static config');
          config.smartLog('buffer', `Attempted level: ${level} (will use defaults)`);
      }
  } catch (error) {
      config.smartLog('fail', `Failed to set resource level: ${error.message}`);
      config.smartLog('buffer', `Fallback: using default parallelization settings`);
  }
  
  try {
      if (queueGate.setLevel && typeof queueGate.setLevel === 'function') {
          queueGate.setLevel(level);
          queueGate.updateLimits();
          config.smartLog('win', `Queue gate configured for ${level} level`);
      } else {
          config.smartLog('fail', 'queueGate.setLevel not available - using static limits');
      }
  } catch (error) {
      config.smartLog('fail', `Failed to configure queue gate: ${error.message}`);
  }
  
  return level;
};

const withGradualDeadline = () => {
  return (req, res, next) => {
      const startTime = Date.now();
      const gateStats = queueGate.getStats();
      const deadlineMs = gateStats.timeout;
      
      req._deadlineAt = startTime + deadlineMs;
      
      const isSystemRoute = dictionaries.isSystemEndpoint(req.path);
      
      const timeoutId = setTimeout(() => {
          if (!res.headersSent && !isSystemRoute) {
              config.smartLog('fail', `deadline:timeout ${req.path} after ${deadlineMs}ms (level: ${gateStats.level})`);
              res.status(429).json({
                  success: false,
                  error: 'Request deadline exceeded',
                  reason: 'timeout',
                  timeout: deadlineMs,
                  level: gateStats.level,
                  path: req.path
              });
          }
      }, deadlineMs);
      
      const cleanup = () => {
          clearTimeout(timeoutId);
      };
      
      res.on('finish', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
      
      next();
  };
};

const pidFile = createPidLock();

config.runStartupCleanup();

connectDB();
config.smartLog('buffer', 'ConnectDB called');

const resourceLevel = initializeResourceLevel();
config.smartLog('system', `System initialized with resource level: ${resourceLevel}`);

const app = express();
const ProfileQueueManager = require('./scrapers/ProfileQueueManager');
const EmailQueueManager = require('./scrapers/EmailQueueManager');
const { emailCoordinator } = require('./scrapers/EmailCoordinator');

app.disable('x-powered-by');

const setupSecurityMiddleware = () => {
  app.use(helmet(securityConfig.helmetConfig));
  config.smartLog('system', `Security middleware configured for ${securityConfig.isProduction() ? 'production' : 'development'}`);
};

const setupCompressionMiddleware = () => {
  const compressionConfig = {
    ...securityConfig.compressionConfig,
    filter: (req, res) => {
      if (config.compress?.enabled === false) return false;
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    }
  };
  
  app.use(compression(compressionConfig));
  config.smartLog('system', 'Compression middleware configured');
};

const setupCorsMiddleware = () => {
  const fromEnv = (process.env.CORS_WHITELIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowedOrigins = Array.from(new Set([
    ...(config.cors?.allowedOrigins || []),
    ...fromEnv,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]));

  const defaultAllowedRegex = [
    '^https?://localhost(:\\d+)?$',
    '^https?://127\\.0\\.0\\.1(:\\d+)?$',
    '^https?://\\[::1\\](:\\d+)?$'
  ];

  const allowedRegex = (config.cors?.allowedRegex && config.cors.allowedRegex.length > 0)
    ? config.cors.allowedRegex
    : defaultAllowedRegex;

  const corsOptions = {
    origin: (origin, callback) => {
      if (securityConfig.corsConfig.allowAll) return callback(null, true);
      if (!origin && config.cors?.allowNoOrigin !== false) return callback(null, true);
      if (origin === 'null' && config.cors?.allowNullOrigin === true) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      for (const pattern of allowedRegex) {
        try {
          if (new RegExp(pattern).test(origin)) return callback(null, true);
        } catch (e) {
          config.smartLog('fail', `Invalid CORS regex: ${pattern}`);
        }
      }
      return callback(new Error('Not allowed by CORS'));
    },
    ...securityConfig.corsConfig
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  config.smartLog('system', 'CORS middleware configured');
};

const setupProxyConfiguration = () => {
  if (securityConfig.sessionConfig.trustProxy) {
    app.set('trust proxy', 1);
    config.smartLog('system', `Proxy trust enabled for ${securityConfig.isProduction() ? 'production' : 'configured'} environment`);
  } else {
    config.smartLog('system', 'Proxy trust disabled for development environment');
  }
};

setupSecurityMiddleware();
setupCompressionMiddleware();
setupCorsMiddleware();
setupProxyConfiguration();

config.smartLog('system', 'Configurable deadline middleware installed');
app.use(withGradualDeadline());

app.use(express.json({ 
  limit: config.server?.maxJsonBody || '1mb',
  strict: false,
  type: ['application/json', 'application/*+json']
}));

app.use(express.urlencoded({
  limit: config.server?.maxJsonBody || '1mb',
  extended: true
}));

app.use(express.text({ 
  type: ['text/*', 'application/x-www-form-urlencoded'],
  limit: config.text?.limit || '1mb'
}));

const initializeSessionStore = () => {
  const sessionSecret = securityConfig.sessionConfig.secret;

  if (!sessionSecret) {
    if (securityConfig.isProduction()) {
      throw new Error('SESSION_SECRET is required in production environment');
    }
    config.smartLog('warn', 'SESSION_SECRET not configured, using ephemeral secret');
  }

  let sessionStore;
  let storeType = securityConfig.sessionConfig.store;

  if (storeType === 'mongo') {
    const mongoUri = config.db.mongodbUri || config.MONGODB_URI;
    if (!mongoUri) {
      if (securityConfig.isProduction()) {
        throw new Error('MongoDB URI is required when store=mongo in production');
      }
      config.smartLog('warn', 'MongoDB URI not configured for sessions, falling back to memory store');
      storeType = 'memory';
    } else {
      try {
        sessionStore = MongoStore.create({
          mongoUrl: mongoUri,
          touchAfter: 24 * 3600,
          collection: securityConfig.sessionConfig.collection,
          ttl: securityConfig.sessionConfig.ttlSeconds
        });
        config.smartLog('win', `Session store initialized: MongoDB (collection: ${securityConfig.sessionConfig.collection})`);
      } catch (error) {
        config.smartLog('fail', `Failed to create MongoDB session store: ${error.message}`);
        if (securityConfig.isProduction()) {
          throw new Error(`MongoDB session store initialization failed: ${error.message}`);
        }
        config.smartLog('warn', 'Falling back to memory store');
        storeType = 'memory';
      }
    }
  }

  if (storeType === 'memory') {
    if (securityConfig.isProduction()) {
      throw new Error('Memory session store is not allowed in production environment');
    }
    sessionStore = new session.MemoryStore();
    config.smartLog('system', 'Session store initialized: Memory (development only)');
  }

  if (!sessionStore) {
    throw new Error('Failed to initialize session store');
  }

  return {
    store: sessionStore,
    secret: sessionSecret,
    maxAge: securityConfig.sessionConfig.maxAgeMs
  };
};

const sessionStoreConfig = initializeSessionStore();

app.use(session({
  secret: sessionStoreConfig.secret,
  resave: false,
  saveUninitialized: false,
  store: sessionStoreConfig.store,
  cookie: {
    secure: securityConfig.sessionConfig.secure,
    httpOnly: securityConfig.sessionConfig.httpOnly,
    maxAge: sessionStoreConfig.maxAge,
    sameSite: securityConfig.sessionConfig.sameSite
  },
  name: securityConfig.sessionConfig.cookieName,
  proxy: securityConfig.sessionConfig.trustProxy
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/dictionaries/ui', express.static(path.join(__dirname, 'dictionaries/ui'), {
  maxAge: config.static?.maxAge || '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    }
  }
}));

app.get('/dictionaries/ui/locales.json', (req, res) => {
  try {
    const dir = path.join(__dirname, 'dictionaries/ui');
    const langs = fs.readdirSync(dir)
      .filter(f => f.endsWith('.js'))
      .map(f => path.basename(f, '.js'))
      .filter(x => x !== 'uiManager');
    
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json({ languages: langs });
  } catch (e) {
    res.status(200).json({ languages: [] });
  }
});

app.use(addUserToLocals);
app.use(rateLimitByUser(1000, 15 * 60 * 1000));

const cacheDir = path.resolve(config.CACHE_DIR);
config.smartLog('system', `Cache directory path: ${cacheDir}`);
try {
  const cacheStats = fs.statSync(cacheDir, { throwIfNoEntry: false });
  if (!cacheStats) {
    config.smartLog('system', 'Cache directory does not exist, creating...');
    fs.mkdirSync(cacheDir, { recursive: true });
    config.smartLog('win', `Cache directory created: ${cacheDir}`);
  } else if (!cacheStats.isDirectory()) {
    config.smartLog('fail', `Cache path exists but is not a directory: ${cacheDir}`);
  } else {
    config.smartLog('system', `Cache directory exists: ${cacheDir}`);
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

ensureDebugDir();

config.smartLog('cache', config.middleware?.cacheFastLaneInstallMessage || 'Installing cacheFastLane middleware');
app.use(cacheFastLane);

config.smartLog('gate', config.middleware?.selectiveGateInstallMessage || 'Installing selective queue gate');
app.use(queueGate.selective);

const mountRoutes = () => {
  const validateRouter = (routerModule, routeName) => {
    if (typeof routerModule !== 'function' && (!routerModule || typeof routerModule.handle !== 'function')) {
      config.smartLog('fail', `Invalid router module: ${routeName}`);
      throw new Error(`Router validation failed: ${routeName}`);
    }
    return routerModule;
  };

  try {
    const saveUserPreferencesRoutes = require('./routes/saveUserPreferencesRoutes');
    validateRouter(saveUserPreferencesRoutes, 'saveUserPreferencesRoutes');
    app.use('/', saveUserPreferencesRoutes);

    const apiRoutes = require('./routes/apiRoutes');
    validateRouter(apiRoutes, 'apiRoutes');
    app.use('/api', apiRoutes);

    const authRoutes = require('./routes/authRoutes');
    validateRouter(authRoutes, 'authRoutes');
    app.use('/auth', authRoutes);

    const planRoutes = require('./routes/planRoutes');
    validateRouter(planRoutes, 'planRoutes');
    app.use('/plan', planRoutes);

    const emailSearchRoutes = require('./routes/emailSearchRoutes');
    validateRouter(emailSearchRoutes, 'emailSearchRoutes');
    app.use('/email', emailSearchRoutes);

    const emailLimitsRoutes = require('./routes/emailLimitsRoutes');
    validateRouter(emailLimitsRoutes, 'emailLimitsRoutes');
    app.use('/email-limits', emailLimitsRoutes);

    const monitoringRoutes = require('./routes/monitoringRoutes');
    validateRouter(monitoringRoutes, 'monitoringRoutes');
    app.use('/monitoring', monitoringRoutes);

    const historicalAnalysisRoutes = require('./routes/historicalAnalysisRoutes');
    validateRouter(historicalAnalysisRoutes, 'historicalAnalysisRoutes');
    app.use('/monitoring/historical', historicalAnalysisRoutes);

    if (config.DEBUG) {
      const debugRoutes = require('./routes/debugRoutes');
      validateRouter(debugRoutes, 'debugRoutes');
      app.use('/debug', debugRoutes);
    }

    config.smartLog('win', `Routes mounted with ${resourceLevel} resource level`);

  } catch (error) {
    config.smartLog('fail', `Router mounting failed: ${error.message}`);
    throw error;
  }
};

config.smartLog('system', `CacheFastLane + selective queue-gate configured - Level ${resourceLevel} protection for heavy endpoints only`);

let MonitoringIntegration = null;
let ScrapingCoordinator = null;

function generateLinksGridHTML(links) {
    if (links.length === 0) return '';
    
    const linkSize = '120px';
    const gap = '30px';
    
    const createLinkHTML = (link) => `
        <a href="${link.url}" target="_blank" class="link-sphere" style="
            width: ${linkSize};
            height: ${linkSize};
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1));
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.3);
            display: flex !important;
            flex-direction: column !important;
            align-items: center;
            justify-content: center;
            color: white;
            text-decoration: none;
            transition: all 0.3s ease;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3);
            position: relative;
            overflow: hidden;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
            padding: 10px;
        " 
        onmouseover="this.style.transform='translateY(-15px) scale(1.5)'; this.style.boxShadow='0 25px 50px rgba(0,0,0,0.6), 0 12px 24px rgba(0,0,0,0.5)'; this.style.background='linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.2))';"
        onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)'; this.style.background='linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))';"
        title="${link.title}">
            <div class="icon" style="
                font-size: 2rem;
                margin-bottom: 8px;
            ">
                <i class="${link.icon}"></i>
            </div>
            <div class="title" style="
                font-size: 0.75rem;
                font-weight: 600;
                line-height: 1.2;
                text-align: center;
                word-wrap: break-word;
                max-width: 100%;
            ">${link.title}</div>
        </a>
    `;
    
    let gridHTML = '';
    
    if (links.length <= 4) {
        gridHTML = `
            <div style="
                display: grid;
                grid-template-columns: repeat(${links.length}, 1fr);
                gap: ${gap};
                justify-items: center;
                margin-bottom: 30px;
                max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                margin-left: auto;
                margin-right: auto;
            ">
                ${links.map(createLinkHTML).join('')}
            </div>
        `;
    } else if (links.length <= 8) {
        const firstRow = links.slice(0, 4);
        const secondRow = links.slice(4, 8);
        
        gridHTML = `
            <div style="margin-bottom: 30px;">
                <div style="
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: ${gap};
                    justify-items: center;
                    margin-bottom: ${gap};
                    max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    ${firstRow.map(createLinkHTML).join('')}
                </div>
                <div style="
                    display: grid;
                    grid-template-columns: repeat(${secondRow.length}, 1fr);
                    gap: ${gap};
                    justify-items: center;
                    max-width: ${parseInt(linkSize) * secondRow.length + parseInt(gap) * (secondRow.length - 1)}px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    ${secondRow.map(createLinkHTML).join('')}
                </div>
            </div>
        `;
    } else {
        const firstRow = links.slice(0, 4);
        const secondRow = links.slice(4, 8);
        const thirdRow = links.slice(8, 10);
        
        gridHTML = `
            <div style="margin-bottom: 30px;">
                <div style="
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: ${gap};
                    justify-items: center;
                    margin-bottom: ${gap};
                    max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    ${firstRow.map(createLinkHTML).join('')}
                </div>
                <div style="
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: ${gap};
                    justify-items: center;
                    margin-bottom: ${gap};
                    max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    ${secondRow.map(createLinkHTML).join('')}
                </div>
                <div style="
                    display: grid;
                    grid-template-columns: repeat(${thirdRow.length}, 1fr);
                    gap: ${gap};
                    justify-items: center;
                    max-width: ${parseInt(linkSize) * thirdRow.length + parseInt(gap) * (thirdRow.length - 1)}px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    ${thirdRow.map(createLinkHTML).join('')}
                </div>
            </div>
        `;
    }
    
    return gridHTML;
}

app.get('/linktree/:treeId/:slug', async (req, res) => {
  try {
        const { treeId, slug } = req.params;
        
        let foundLinktree = null;
        let foundUser = null;
        
        try {
            const userPrefsDir = path.join(__dirname, 'user_preferences');
            const files = fs.readdirSync(userPrefsDir);
            
            for (const file of files) {
                if (file.startsWith('user_') && file.endsWith('.json')) {
                    try {
                        const filePath = path.join(userPrefsDir, file);
                        const userData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        if (userData.linktrees && userData.linktrees[treeId]) {
                            const linktree = userData.linktrees[treeId];
                            
                            const expectedSlug = `${linktree.firstName || ''}-${linktree.lastName || ''}`
                                .toLowerCase()
                                .replace(/[^a-z0-9]/g, '-')
                                .replace(/-+/g, '-');
                            
                            if (expectedSlug === slug || !slug) {
                                foundLinktree = linktree;
                                foundUser = userData;
                                break;
                            }
                        }
                    } catch (fileError) {
                        config.smartLog('fail', `Error reading user file ${file}: ${fileError.message}`);
                        continue;
                    }
                }
            }
        } catch (dirError) {
            config.smartLog('fail', `Error reading user preferences directory: ${dirError.message}`);
        }
        
        if (!foundLinktree && userPreferencesManager.getAllUsers) {
            try {
                const allUsers = await userPreferencesManager.getAllUsers();
                for (const userData of allUsers) {
                    if (userData.linktrees && userData.linktrees[treeId]) {
                        const linktree = userData.linktrees[treeId];
                        
                        const expectedSlug = `${linktree.firstName || ''}-${linktree.lastName || ''}`
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, '-')
                            .replace(/-+/g, '-');
                        
                        if (expectedSlug === slug || !slug) {
                            foundLinktree = linktree;
                            foundUser = userData;
                            break;
                        }
                    }
                }
            } catch (dbError) {
                config.smartLog('fail', `Error searching in database: ${dbError.message}`);
            }
        }
        
        if (!foundLinktree) {
            return res.status(404).send(`Linktree ${treeId} not found`);
        }
        
        const linktree = foundLinktree;
        const fullName = `${linktree.firstName || ''} ${linktree.lastName || ''}`.trim();
        const hasRequiredData = linktree.firstName && linktree.lastName && linktree.links && linktree.links.length > 0;
        
        if (!hasRequiredData) {
            return res.status(404).send('Linktree not complete - missing required data (name and links)');
        }
        
        const jobTitlesArray = (linktree.jobTitles || '').split('|').map(t => t.trim()).filter(t => t);
        
        const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${fullName} - Linktree</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Arial', sans-serif;
                overflow-x: hidden;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
            }
            
            @keyframes float {
                0%, 100% { transform: translateY(0px) rotate(0deg); }
                50% { transform: translateY(-30px) rotate(180deg); }
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 0.7; }
                50% { transform: scale(1.1); opacity: 0.9; }
            }
            
            .sphere {
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .sphere:hover {
                animation: pulse 0.6s ease-in-out infinite !important;
                transform: scale(1.2) !important;
            }
            
            .link-sphere::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                border-radius: 50%;
                background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .link-sphere:hover::before {
                opacity: 1;
            }
            
            .footer-link {
                color: inherit;
                text-decoration: none;
                transition: color 0.3s ease;
            }
            
            .footer-link:hover {
                color: rgba(255,255,255,0.9);
            }
            
            @media (max-width: 768px) {
                .linktree-content {
                    padding: 0 15px;
                }
                
                h1 {
                    font-size: 2rem !important;
                }
                
                .sphere {
                    display: none;
                }
            }
            
            @media (max-width: 480px) {
                h1 {
                    font-size: 1.8rem !important;
                }
            }
        </style>
    </head>
    <body>
        <div class="linktree-page-container" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            padding: 20px;
            flex: 1;
            padding-bottom: 100px;
        ">
            <div class="sphere sphere-1" style="
                position: absolute;
                width: 600px;
                height: 600px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
                top: 5%;
                left: 5%;
                animation: float 6s ease-in-out infinite;
            "></div>
            <div class="sphere sphere-2" style="
                position: absolute;
                width: 450px;
                height: 450px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
                top: 60%;
                right: 10%;
                animation: float 8s ease-in-out infinite reverse;
            "></div>
            <div class="sphere sphere-3" style="
                position: absolute;
                width: 300px;
                height: 300px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
                bottom: 15%;
                left: 15%;
                animation: float 4s ease-in-out infinite;
            "></div>
            <div class="sphere sphere-4" style="
                position: absolute;
                width: 400px;
                height: 400px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.07), rgba(255,255,255,0.04));
                top: 20%;
                right: 25%;
                animation: float 7s ease-in-out infinite;
            "></div>
            <div class="sphere sphere-5" style="
                position: absolute;
                width: 350px;
                height: 350px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
                bottom: 40%;
                right: 5%;
                animation: float 5s ease-in-out infinite reverse;
            "></div>
            <div class="sphere sphere-6" style="
                position: absolute;
                width: 250px;
                height: 250px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04));
                top: 40%;
                left: 5%;
                animation: float 6.5s ease-in-out infinite;
            "></div>
            <div class="sphere sphere-7" style="
                position: absolute;
                width: 500px;
                height: 500px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
                bottom: 5%;
                right: 30%;
                animation: float 9s ease-in-out infinite reverse;
            "></div>
            <div class="sphere sphere-8" style="
                position: absolute;
                width: 200px;
                height: 200px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
                top: 70%;
                left: 40%;
                animation: float 4.5s ease-in-out infinite;
            "></div>
            <div class="sphere sphere-9" style="
                position: absolute;
                width: 380px;
                height: 380px;
                border-radius: 50%;
                background: linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
                top: 10%;
                left: 60%;
                animation: float 7.5s ease-in-out infinite reverse;
            "></div>
            
            <div class="linktree-content" style="
                text-align: center;
                z-index: 2;
                max-width: 500px;
                width: 100%;
            ">
                ${fullName ? `
                    <h1 style="
                        color: white;
                        font-size: 2.5rem;
                        margin-bottom: 10px;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4);
                        font-weight: 600;
                    ">${fullName}</h1>
                ` : ''}
                
                ${linktree.header ? `
                    <p style="
                        color: rgba(255,255,255,0.9);
                        font-size: 1.2rem;
                        margin-bottom: 10px;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                    ">${linktree.header}</p>
                ` : ''}
                
                ${jobTitlesArray.length > 0 ? `
                    <p style="
                        color: rgba(255,255,255,0.8);
                        font-size: 1rem;
                        margin-bottom: ${linktree.email ? '10px' : '30px'};
                        text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                    ">${jobTitlesArray.join(' | ')}</p>
                ` : ''}
                
                ${linktree.email ? `
                    <p style="
                        color: rgba(255,255,255,0.8);
                        font-size: 1rem;
                        margin-bottom: 30px;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                    ">
                        <a href="mailto:${linktree.email}" style="
                            color: rgba(255,255,255,0.8);
                            text-decoration: none;
                            transition: color 0.3s ease;
                            text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                        " onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.8)'">${linktree.email}</a>
                    </p>
                ` : ''}
                
                ${generateLinksGridHTML(linktree.links)}
            </div>
        </div>
        
        <div style="
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 15px 20px;
            text-align: center;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
            backdrop-filter: blur(10px);
            border-top: 1px solid rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.7);
            font-size: 0.9rem;
            z-index: 10;
        ">
            <a href="http://localhost:3000/" class="footer-link" target="_blank">
                <p>Powered by <strong>myJobBuddy</strong></p>
                <p style="margin-top: 3px; font-size: 0.8rem;">Professional networking made simple</p>
            </a>
        </div>
    </body>
    </html>`;
        
        res.send(html);
        
    } catch (error) {
        config.smartLog('fail', `Error generating linktree: ${error.message}`);
        res.status(500).send(`Internal server error: ${error.message}`);
    }
});

app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

app.get('/forgot-password', (req, res) => {
    if (req.isAuthenticated()) {
      return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
      return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});
  
app.get('/app', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/app');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/app');
  }
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success:false, error:'Invalid JSON' });
  }
  next(err);
});

app.use(express.static('public', {
  maxAge: config.static?.maxAge || '1d',
  etag: true,
  lastModified: true,
  index: false
}));

if (sanityCompat) {
  app.use('/sanity', sanityCompat);
  config.smartLog('system', 'SanityCompat mounted on /sanity');
}

let systemInitialized = false;

const initializeSystem = async () => {
  if (systemInitialized) {
    config.smartLog('system', 'System already initialized, skipping');
    return;
  }

  try {
    config.smartLog('system', 'Initializing browser...');
    await initBrowser();
    config.smartLog('win', 'Browser initialized successfully');
    
    config.smartLog('system', 'Initializing Profile Queue Manager...');
    await ProfileQueueManager.start();
    config.smartLog('win', 'Profile Queue Manager initialized successfully');
    
    config.smartLog('system', 'Initializing Email Queue Manager...');
    await EmailQueueManager.start();
    config.smartLog('win', 'Email Queue Manager initialized successfully');
    
    config.smartLog('system', 'Initializing Email Coordinator...');
    await emailCoordinator.initialize();
    config.smartLog('win', 'Email Coordinator initialized successfully');
    
    config.smartLog('system', 'Initializing Scraping Coordinator...');
    ScrapingCoordinator = require('./scrapers/ScrapingCoordinator');
    const coordinator = ScrapingCoordinator.getInstance();
    await coordinator.initialize();
    config.smartLog('win', 'Scraping Coordinator initialized successfully');
    
    config.smartLog('system', 'Initializing Monitoring System...');
    MonitoringIntegration = require('./monitoring/MonitoringIntegration');
    await MonitoringIntegration.initialize();
    config.smartLog('win', 'Monitoring System initialized successfully');
    
    systemInitialized = true;
    config.smartLog('win', 'All systems initialized successfully');
    
  } catch (error) {
    config.smartLog('fail', `System initialization failed: ${error.message}`);
    
    if (securityConfig.shouldExitOnPidLock()) {
      throw error;
    } else {
      config.smartLog('warn', 'Continuing startup despite system initialization error (development mode)');
    }
  }
};

const startServer = async () => {
  try {
    await initializeSystem();
    mountRoutes();
    setupMiddleware();
    
    const srv = app.listen(config.PORT);
    srv.on('listening', async () => {
      config.smartLog('win', `Server started on port ${config.PORT}`);
      config.smartLog('system', `Environment: ${securityConfig.isProduction() ? 'production' : 'development'}`);
      config.smartLog('system', `Debug mode: ${config.DEBUG ? 'Enabled' : 'Disabled'}`);
      if (config.DEBUG) config.smartLog('system', `Debug URL: http://localhost:${config.PORT}/debug/search`);
      if (config.db.mongodbUri) {
        try {
          const mongoUrl = new URL(config.db.mongodbUri);
          config.smartLog('system', `MongoDB: ${mongoUrl.hostname}:${mongoUrl.port || 27017}/${mongoUrl.pathname.slice(1) || 'default'}`);
        } catch (e) {
          config.smartLog('system', 'MongoDB: configured (URI format validation passed)');
        }
      } else {
        config.smartLog('system', 'MongoDB: not configured');
      }
      config.smartLog('system', `Homepage: http://localhost:${config.PORT}`);
      config.smartLog('system', `Login: http://localhost:${config.PORT}/login`);
      config.smartLog('system', `Register: http://localhost:${config.PORT}/register`);
    });
    srv.on('error', (err) => {
      config.smartLog('fail', `Server listen error: ${err.code || 'UNKNOWN'}: ${err.message}`);
      
      if (securityConfig.shouldExitOnPidLock()) {
        process.exit(1);
      } else {
        config.smartLog('warn', 'Server error in development mode - not exiting');
      }
    });
  } catch (error) {
    config.smartLog('fail', `Server startup error: ${error.message}`);
    
    if (securityConfig.shouldExitOnPidLock()) {
      process.exit(1);
    } else {
      config.smartLog('warn', 'Startup error in development mode - not exiting');
    }
  }
};

const setupMiddleware = () => {
  if (MonitoringIntegration) {
    app.use(MonitoringIntegration.createExpressMiddleware());
    config.smartLog('win', 'Monitoring middleware mounted');
  }
  config.smartLog('system', 'Express middleware configuration completed');
};

const gracefulShutdown = async (signal) => {
  config.smartLog('system', `Server shutdown initiated (${signal})...`);
  try {
    removePidLock(pidFile);
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
    
    config.smartLog('win', 'Graceful shutdown completed');
  } catch (error) {
    config.smartLog('fail', `Error during shutdown: ${error.message}`);
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();