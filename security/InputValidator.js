const xss = require('xss');
const { URL } = require('url');
const path = require('path');
const securityConfig = require('../config/security');
const config = require('../config');

class InputValidator {
  static validateUrl(url, allowedDomains = []) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL must be a non-empty string' };
    }

    try {
      const urlObj = new URL(url);
      
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
      }
      
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname === '0.0.0.0') {
        return { valid: false, error: 'Local URLs are not allowed' };
      }
      
      const isPrivateIP = this.isPrivateIP(urlObj.hostname);
      if (isPrivateIP) {
        return { valid: false, error: 'Private IP addresses are not allowed' };
      }
      
      if (allowedDomains.length > 0) {
        const isAllowed = allowedDomains.some(domain => 
          urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
        );
        if (!isAllowed) {
          return { valid: false, error: 'Domain is not in allowed list' };
        }
      }
      
      if (url.length > 2048) {
        return { valid: false, error: 'URL is too long' };
      }
      
      return { valid: true, url: urlObj.href };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  static validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email must be a non-empty string' };
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    if (email.length > 254) {
      return { valid: false, error: 'Email is too long' };
    }
    
    const [localPart, domain] = email.split('@');
    if (localPart.length > 64) {
      return { valid: false, error: 'Email local part is too long' };
    }
    
    const suspiciousDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];
    if (suspiciousDomains.some(suspDomain => domain.includes(suspDomain))) {
      return { valid: false, error: 'Temporary email addresses are not allowed' };
    }
    
    return { valid: true, email: email.toLowerCase() };
  }

  static validateFileUpload(file, allowedTypes = securityConfig.FILE_UPLOAD.ALLOWED_TYPES) {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    if (file.size > securityConfig.FILE_UPLOAD.MAX_SIZE) {
      return { 
        valid: false, 
        error: `File size exceeds maximum allowed (${securityConfig.FILE_UPLOAD.MAX_SIZE} bytes)` 
      };
    }
    
    if (!allowedTypes.includes(file.mimetype)) {
      return { valid: false, error: 'File type not allowed' };
    }
    
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!securityConfig.FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return { valid: false, error: 'File extension not allowed' };
    }
    
    if (securityConfig.FILE_UPLOAD.FORBIDDEN_EXTENSIONS.includes(fileExtension)) {
      return { valid: false, error: 'File extension is forbidden' };
    }
    
    if (file.originalname.includes('..') || 
        file.originalname.includes('/') || 
        file.originalname.includes('\\')) {
      return { valid: false, error: 'Invalid characters in filename' };
    }
    
    const filenameRegex = /^[a-zA-Z0-9._-]+$/;
    const nameWithoutExt = path.basename(file.originalname, fileExtension);
    if (!filenameRegex.test(nameWithoutExt)) {
      return { valid: false, error: 'Filename contains invalid characters' };
    }
    
    return { valid: true };
  }

  static sanitizeHtml(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    return xss(input, securityConfig.SANITIZATION.HTML_OPTIONS);
  }

  static validateJobTitle(title, maxLength = 200) {
    if (!title || typeof title !== 'string') {
      return { valid: false, error: 'Job title must be a non-empty string' };
    }
    
    if (title.length > maxLength) {
      return { valid: false, error: `Job title must be at most ${maxLength} characters` };
    }
    
    const sanitized = this.sanitizeHtml(title.trim());
    
    if (sanitized !== title.trim()) {
      return { valid: false, error: 'Job title contains potentially dangerous content' };
    }
    
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+=/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(sanitized))) {
      return { valid: false, error: 'Job title contains suspicious patterns' };
    }
    
    return { valid: true, title: sanitized };
  }

  static validateSearchQuery(query) {
    if (!query || typeof query !== 'string') {
      return { valid: false, error: 'Search query must be a non-empty string' };
    }
    
    if (query.length > 500) {
      return { valid: false, error: 'Search query is too long' };
    }
    
    const sqlInjectionPatterns = securityConfig.INPUT_VALIDATION.SQL_INJECTION_PATTERNS;
    if (sqlInjectionPatterns.some(pattern => pattern.test(query))) {
      return { valid: false, error: 'Search query contains potentially malicious content' };
    }
    
    const sanitized = this.sanitizeHtml(query.trim());
    
    return { valid: true, query: sanitized };
  }

  static validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password must be a string' };
    }
    
    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long' };
    }
    
    if (password.length > 128) {
      return { valid: false, error: 'Password is too long' };
    }
    
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasNonalphas = /\W/.test(password);
    
    const score = [hasUpperCase, hasLowerCase, hasNumbers, hasNonalphas].filter(Boolean).length;
    
    if (score < 3) {
      return { 
        valid: false, 
        error: 'Password must contain at least 3 of: uppercase, lowercase, numbers, special characters' 
      };
    }
    
    const commonPasswords = [
      'password', '123456', 'password123', 'admin', 'qwerty', 
      'letmein', 'welcome', 'monkey', '1234567890'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      return { valid: false, error: 'Password is too common' };
    }
    
    return { valid: true };
  }

  static validateObjectId(id) {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: 'ID must be a non-empty string' };
    }
    
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(id)) {
      return { valid: false, error: 'Invalid ObjectId format' };
    }
    
    return { valid: true, id };
  }

  static validatePaginationParams(page, limit, maxLimit = 100) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    
    if (pageNum < 1) {
      return { valid: false, error: 'Page must be greater than 0' };
    }
    
    if (limitNum < 1 || limitNum > maxLimit) {
      return { valid: false, error: `Limit must be between 1 and ${maxLimit}` };
    }
    
    return { valid: true, page: pageNum, limit: limitNum };
  }

  static isPrivateIP(hostname) {
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    
    if (match) {
      const [, a, b, c, d] = match.map(Number);
      
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
    }
    
    const ipv6PrivatePatterns = [
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
      /^::ffff:127\./i,
      /^::ffff:10\./i,
      /^::ffff:192\.168\./i,
      /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./i
    ];
    
    return ipv6PrivatePatterns.some(pattern => pattern.test(hostname));
  }

  static validateRequestSize(req) {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxSize = 10 * 1024 * 1024;
    
    if (contentLength > maxSize) {
      return { valid: false, error: 'Request body too large' };
    }
    
    return { valid: true };
  }

  static validateUserAgent(userAgent) {
    if (!userAgent || typeof userAgent !== 'string') {
      return { valid: false, error: 'User-Agent header is required' };
    }
    
    if (userAgent.length > 512) {
      return { valid: false, error: 'User-Agent header is too long' };
    }
    
    const suspiciousPatterns = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /<script/i,
      /javascript:/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      config.smartLog('fail', 'Suspicious User-Agent detected', { userAgent });
      return { valid: false, error: 'Suspicious User-Agent' };
    }
    
    return { valid: true };
  }

  static createValidationSchema(fields) {
    const schema = {};
    
    for (const [fieldName, config] of Object.entries(fields)) {
      schema[fieldName] = {
        required: config.required || false,
        type: config.type || 'string',
        minLength: config.minLength,
        maxLength: config.maxLength,
        pattern: config.pattern,
        custom: config.custom
      };
    }
    
    return schema;
  }

  static validateWithSchema(data, schema) {
    const errors = [];
    
    for (const [fieldName, rules] of Object.entries(schema)) {
      const value = data[fieldName];
      
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({ field: fieldName, message: `${fieldName} is required` });
        continue;
      }
      
      if (value !== undefined && value !== null) {
        if (rules.type === 'email') {
          const result = this.validateEmail(value);
          if (!result.valid) {
            errors.push({ field: fieldName, message: result.error });
          }
        }
        
        if (rules.type === 'url') {
          const result = this.validateUrl(value);
          if (!result.valid) {
            errors.push({ field: fieldName, message: result.error });
          }
        }
        
        if (rules.type === 'string' && typeof value === 'string') {
          if (rules.minLength && value.length < rules.minLength) {
            errors.push({ field: fieldName, message: `${fieldName} must be at least ${rules.minLength} characters` });
          }
          
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push({ field: fieldName, message: `${fieldName} must be at most ${rules.maxLength} characters` });
          }
          
          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push({ field: fieldName, message: `${fieldName} format is invalid` });
          }
        }
        
        if (rules.custom && typeof rules.custom === 'function') {
          const customResult = rules.custom(value);
          if (!customResult.valid) {
            errors.push({ field: fieldName, message: customResult.error });
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = InputValidator;