const path = require('path');

const SECURITY_HEADERS = {
  HSTS: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  CSP: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  FRAME_OPTIONS: 'DENY',
  CONTENT_TYPE_OPTIONS: 'nosniff',
  XSS_PROTECTION: '1; mode=block',
  REFERRER_POLICY: 'strict-origin-when-cross-origin',
  PERMISSIONS_POLICY: 'geolocation=(), microphone=(), camera=()'
};

const COOKIE_CONFIG = {
  SECURE: process.env.NODE_ENV === 'production',
  HTTP_ONLY: true,
  SAME_SITE: 'strict',
  MAX_AGE: 86400000,
  PREFIX: '__Secure-'
};

const RATE_LIMITING = {
  GLOBAL: {
    WINDOW_MS: 15 * 60 * 1000,
    MAX_REQUESTS: 1000,
    MESSAGE: 'Too many requests from this IP'
  },
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000,
    MAX_REQUESTS: 5,
    MESSAGE: 'Too many authentication attempts'
  },
  API: {
    WINDOW_MS: 15 * 60 * 1000,
    MAX_REQUESTS: 100,
    MESSAGE: 'API rate limit exceeded'
  },
  UPLOAD: {
    WINDOW_MS: 60 * 60 * 1000,
    MAX_REQUESTS: 10,
    MESSAGE: 'Upload rate limit exceeded'
  }
};

const FILE_UPLOAD = {
  MAX_SIZE: 5 * 1024 * 1024,
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/json'
  ],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.json'],
  FORBIDDEN_EXTENSIONS: ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar'],
  SCAN_ENABLED: true
};

const INPUT_VALIDATION = {
  MAX_STRING_LENGTH: 10000,
  MAX_ARRAY_LENGTH: 100,
  FORBIDDEN_PATTERNS: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /data:text\/html/gi
  ],
  SQL_INJECTION_PATTERNS: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b.*?\b(FROM|INTO|SET|WHERE|VALUES)\b)/gi,
    /(\bOR\b.*?=.*?=|\bAND\b.*?=.*?=)/gi,
    /(;[\s]*DROP|;[\s]*DELETE|;[\s]*UPDATE|;[\s]*INSERT)/gi,
    /(\/\*.*?\*\/|@@[\w]*|char\([\d,\s]+\)|hex\(|0x[0-9a-f]+)/gi
  ],
  URL_SAFE_FIELDS: [
    'website',
    'url',
    'link',
    'href',
    'src',
    'career',
    'page'
  ]
};

const CSRF_CONFIG = {
  SECRET: process.env.CSRF_SECRET || require('node:crypto').randomBytes(32).toString('hex'),
  COOKIE_NAME: '__Host-csrf-token',
  HEADER_NAME: 'x-csrf-token',
  VALUE_FUNCTION: (req) => {
    return req.body._csrf || req.query._csrf || req.headers['x-csrf-token'];
  }
};

const SESSION_CONFIG = {
  NAME: '__Secure-sessionId',
  SECRET: process.env.SESSION_SECRET,
  SECURE: process.env.NODE_ENV === 'production',
  HTTP_ONLY: true,
  SAME_SITE: 'strict',
  MAX_AGE: 24 * 60 * 60 * 1000,
  ROLLING: true,
  SAVE_UNINITIALIZED: false,
  RESAVE: false
};

const SANITIZATION = {
  HTML_OPTIONS: {
    whiteList: {
      p: [],
      br: [],
      strong: [],
      em: [],
      u: []
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  },
  URL_OPTIONS: {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    allow_underscores: false,
    allow_trailing_dot: false
  }
};

const SECURITY_MONITORING = {
  LOG_SECURITY_EVENTS: true,
  ALERT_THRESHOLDS: {
    FAILED_LOGINS: 10,
    SUSPICIOUS_REQUESTS: 50,
    XSS_ATTEMPTS: 5,
    SQL_INJECTION_ATTEMPTS: 3
  },
  QUARANTINE_DURATION: 60 * 60 * 1000
};

const TRUSTED_PROXIES = process.env.NODE_ENV === 'production' ? 
  ['127.0.0.1', '::1'] : 
  ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

module.exports = {
  SECURITY_HEADERS,
  COOKIE_CONFIG,
  RATE_LIMITING,
  FILE_UPLOAD,
  INPUT_VALIDATION,
  CSRF_CONFIG,
  SESSION_CONFIG,
  SANITIZATION,
  SECURITY_MONITORING,
  TRUSTED_PROXIES
};