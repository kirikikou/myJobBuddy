const xss = require('xss');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const securityConfig = require('../config/security');
const config = require('../config');

class SecurityMiddleware {
  static setSecurityHeaders(req, res, next) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction && securityConfig.SECURITY_HEADERS.HSTS) {
      const hsts = securityConfig.SECURITY_HEADERS.HSTS;
      res.setHeader('Strict-Transport-Security', 
        `max-age=${hsts.maxAge}; includeSubDomains; preload`);
    }
    
    if (securityConfig.SECURITY_HEADERS.CSP) {
      const csp = securityConfig.SECURITY_HEADERS.CSP.directives;
      const cspString = Object.entries(csp)
        .map(([key, values]) => `${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)} ${values.join(' ')}`)
        .join('; ');
      res.setHeader('Content-Security-Policy', cspString);
    }
    
    res.setHeader('X-Frame-Options', securityConfig.SECURITY_HEADERS.FRAME_OPTIONS);
    res.setHeader('X-Content-Type-Options', securityConfig.SECURITY_HEADERS.CONTENT_TYPE_OPTIONS);
    res.setHeader('X-XSS-Protection', securityConfig.SECURITY_HEADERS.XSS_PROTECTION);
    res.setHeader('Referrer-Policy', securityConfig.SECURITY_HEADERS.REFERRER_POLICY);
    res.setHeader('Permissions-Policy', securityConfig.SECURITY_HEADERS.PERMISSIONS_POLICY);
    res.removeHeader('X-Powered-By');
    
    next();
  }

  static sanitizeInput(req, res, next) {
    const sanitizeObject = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }
      
      if (obj !== null && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }
      
      if (typeof obj === 'string') {
        let sanitized = xss(obj, securityConfig.SANITIZATION.HTML_OPTIONS);
        
        securityConfig.INPUT_VALIDATION.FORBIDDEN_PATTERNS.forEach(pattern => {
          sanitized = sanitized.replace(pattern, '');
        });
        
        if (sanitized.length > securityConfig.INPUT_VALIDATION.MAX_STRING_LENGTH) {
          sanitized = sanitized.substring(0, securityConfig.INPUT_VALIDATION.MAX_STRING_LENGTH);
        }
        
        return sanitized;
      }
      
      return obj;
    };

    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  }

  static isUrlField(fieldPath) {
    return securityConfig.INPUT_VALIDATION.URL_SAFE_FIELDS.some(urlField => 
      fieldPath.toLowerCase().includes(urlField)
    );
  }

  static isValidUrl(str) {
    try {
      const url = new URL(str);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  static detectMaliciousInput(req, res, next) {
    const checkForSQLInjection = (str, fieldPath) => {
      if (SecurityMiddleware.isUrlField(fieldPath) && SecurityMiddleware.isValidUrl(str)) {
        return false;
      }
      
      return securityConfig.INPUT_VALIDATION.SQL_INJECTION_PATTERNS.some(pattern => 
        pattern.test(str)
      );
    };

    const checkForXSS = (str) => {
      return securityConfig.INPUT_VALIDATION.FORBIDDEN_PATTERNS.some(pattern => 
        pattern.test(str)
      );
    };

    let maliciousFound = false;
    let maliciousField = '';

    const scanObject = (obj, path = '') => {
      if (maliciousFound) return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          if (!maliciousFound) {
            scanObject(item, `${path}[${index}]`);
          }
        });
        return;
      }
      
      if (obj !== null && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          if (!maliciousFound) {
            scanObject(value, path ? `${path}.${key}` : key);
          }
        });
        return;
      }
      
      if (typeof obj === 'string' && obj.length > 0) {
        if (checkForSQLInjection(obj, path)) {
          config.smartLog('fail', `SQL injection attempt detected: ${path}`, {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            value: obj.substring(0, 100)
          });
          maliciousFound = true;
          maliciousField = path;
          return;
        }
        
        if (checkForXSS(obj)) {
          config.smartLog('fail', `XSS attempt detected: ${path}`, {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            value: obj.substring(0, 100)
          });
          maliciousFound = true;
          maliciousField = path;
          return;
        }
      }
    };

    if (req.body) scanObject(req.body, 'body');
    if (!maliciousFound && req.query) scanObject(req.query, 'query');
    if (!maliciousFound && req.params) scanObject(req.params, 'params');

    if (maliciousFound) {
      return res.status(400).json({
        success: false,
        error: 'malicious_input_detected',
        field: maliciousField
      });
    }

    next();
  }

  static createRateLimit(type = 'GLOBAL') {
    const limitConfig = securityConfig.RATE_LIMITING[type];
    
    return rateLimit({
      windowMs: limitConfig.WINDOW_MS,
      max: limitConfig.MAX_REQUESTS,
      message: {
        success: false,
        error: 'rate_limit_exceeded',
        message: limitConfig.MESSAGE
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        config.smartLog('fail', `Rate limit exceeded: ${type}`, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        res.status(429).json({
          success: false,
          error: 'rate_limit_exceeded',
          message: limitConfig.MESSAGE,
          retryAfter: Math.round(limitConfig.WINDOW_MS / 1000)
        });
      }
    });
  }

  static createSlowDown(type = 'GLOBAL') {
    const limitConfig = securityConfig.RATE_LIMITING[type];
    
    return slowDown({
      windowMs: limitConfig.WINDOW_MS,
      delayAfter: Math.floor(limitConfig.MAX_REQUESTS / 2),
      delayMs: () => 500,
      maxDelayMs: 20000,
      skipFailedRequests: false,
      skipSuccessfulRequests: false,
      validate: {
        delayMs: false
      }
    });
  }

  static validateInput(schema) {
    return [
      ...Object.entries(schema).map(([field, rules]) => {
        let validator = body(field);
        
        if (rules.required) {
          validator = validator.notEmpty().withMessage(`${field} is required`);
        }
        
        if (rules.type === 'email') {
          validator = validator.isEmail().withMessage(`${field} must be a valid email`);
        }
        
        if (rules.type === 'string') {
          validator = validator.isString().withMessage(`${field} must be a string`);
          if (rules.minLength) {
            validator = validator.isLength({ min: rules.minLength }).withMessage(`${field} must be at least ${rules.minLength} characters`);
          }
          if (rules.maxLength) {
            validator = validator.isLength({ max: rules.maxLength }).withMessage(`${field} must be at most ${rules.maxLength} characters`);
          }
        }
        
        if (rules.type === 'array') {
          validator = validator.isArray().withMessage(`${field} must be an array`);
          if (rules.maxLength) {
            validator = validator.isArray({ max: rules.maxLength }).withMessage(`${field} must contain at most ${rules.maxLength} items`);
          }
        }
        
        if (rules.type === 'url') {
          validator = validator.isURL(securityConfig.SANITIZATION.URL_OPTIONS).withMessage(`${field} must be a valid URL`);
        }
        
        return validator;
      }),
      
      (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          config.smartLog('fail', 'Input validation failed', {
            errors: errors.array(),
            ip: req.ip,
            path: req.path
          });
          
          return res.status(400).json({
            success: false,
            error: 'validation_error',
            details: errors.array()
          });
        }
        next();
      }
    ];
  }

  static fileUploadSecurity(req, res, next) {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.files]) : [req.file];
    
    for (const file of files) {
      if (file.size > securityConfig.FILE_UPLOAD.MAX_SIZE) {
        return res.status(400).json({
          success: false,
          error: 'file_too_large',
          maxSize: securityConfig.FILE_UPLOAD.MAX_SIZE
        });
      }
      
      if (!securityConfig.FILE_UPLOAD.ALLOWED_TYPES.includes(file.mimetype)) {
        config.smartLog('fail', 'Forbidden file type upload attempt', {
          mimetype: file.mimetype,
          filename: file.originalname,
          ip: req.ip
        });
        
        return res.status(400).json({
          success: false,
          error: 'forbidden_file_type',
          allowedTypes: securityConfig.FILE_UPLOAD.ALLOWED_TYPES
        });
      }
      
      const fileExtension = require('path').extname(file.originalname).toLowerCase();
      if (securityConfig.FILE_UPLOAD.FORBIDDEN_EXTENSIONS.includes(fileExtension)) {
        config.smartLog('fail', 'Forbidden file extension upload attempt', {
          extension: fileExtension,
          filename: file.originalname,
          ip: req.ip
        });
        
        return res.status(400).json({
          success: false,
          error: 'forbidden_file_extension'
        });
      }
      
      if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
        config.smartLog('fail', 'Path traversal attempt in filename', {
          filename: file.originalname,
          ip: req.ip
        });
        
        return res.status(400).json({
          success: false,
          error: 'invalid_filename'
        });
      }
    }

    next();
  }

  static trustProxyConfig(app) {
    if (process.env.NODE_ENV === 'production') {
      app.set('trust proxy', securityConfig.TRUSTED_PROXIES);
    }
  }

  static logSecurityEvent(eventType, details, req) {
    config.smartLog('fail', `Security event: ${eventType}`, {
      ...details,
      ip: req?.ip,
      userAgent: req?.get('User-Agent'),
      timestamp: new Date().toISOString(),
      sessionId: req?.sessionID
    });
  }
}

module.exports = SecurityMiddleware;