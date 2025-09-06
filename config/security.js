const config = require('../config');

const isProduction = () => {
  return config.meta?.environment === 'production' || process.env.NODE_ENV === 'production';
};

const isDevelopment = () => {
  return !isProduction();
};

const isTestEnvironment = () => {
  return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'testing';
};

const sessionConfig = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'connect.sid',
  secret: process.env.SESSION_SECRET || config.sessions?.secret || config.SESSION_SECRET,
  maxAgeMs: parseInt(process.env.SESSION_MAX_AGE) || config.sessions?.cookieMaxAgeMs || config.SESSION_MAX_AGE || (24 * 60 * 60 * 1000),
  
  sameSite: 'lax',
  secure: isProduction(),
  httpOnly: true,
  
  trustProxy: config.sessions?.trustProxy === true || isProduction(),
  
  store: config.sessions?.store || 'mongo',
  collection: config.sessions?.collection || 'sessions',
  ttlSeconds: config.sessions?.ttlSeconds || (24 * 60 * 60)
};

const corsConfig = {
  allowAll: config.cors?.allowAll === true || process.env.CORS_ALLOW_ALL === 'true',
  credentials: config.cors?.credentials !== false,
  methods: config.cors?.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: config.cors?.allowedHeaders || [
    'Content-Type', 'Authorization', 'X-Requested-With', 'x-idempotency-key', 'x-stress-test', 'Accept', 'Origin'
  ],
  exposedHeaders: config.cors?.exposedHeaders || [],
  maxAge: config.cors?.maxAge || 86400,
  optionsSuccessStatus: config.cors?.optionsSuccessStatus || 204
};

const helmetConfig = {
  contentSecurityPolicy: config.security?.csp !== false ? {
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
      upgradeInsecureRequests: isProduction() ? [] : null,
      ...(config.security?.cspDirectives || {})
    }
  } : false,
  hsts: isProduction() ? {
    maxAge: config.security?.hstsMaxAge || 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
  frameguard: { 
    action: config.security?.frameOptions || 'deny' 
  },
  noSniff: true,
  xssFilter: false,
  referrerPolicy: { 
    policy: config.security?.referrerPolicy || 'same-origin' 
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

const compressionConfig = {
  level: config.compress?.level || 6,
  threshold: config.compress?.threshold || 1024,
  brotli: {
    enabled: config.compress?.brotli !== false,
    params: {
      [require('zlib').constants.BROTLI_PARAM_QUALITY]: 
        config.compress?.brotliQuality || 4
    }
  }
};

const shouldExitOnPidLock = () => {
  return isProduction() && !isTestEnvironment();
};

const shouldUsePidLock = () => {
  return config.server?.usePidLock !== false;
};

module.exports = {
  isProduction,
  isDevelopment,
  isTestEnvironment,
  sessionConfig,
  corsConfig,
  helmetConfig,
  compressionConfig,
  shouldExitOnPidLock,
  shouldUsePidLock
};