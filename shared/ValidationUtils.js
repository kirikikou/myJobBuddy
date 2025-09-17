class ValidationUtils {
    static isValidUrl(url) {
      if (!url || typeof url !== 'string') return false;
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return false;
      
      try {
        new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`);
        return true;
      } catch (error) {
        return false;
      }
    }
  
    static isValidDomain(domain) {
      if (!domain || typeof domain !== 'string') return false;
      const trimmedDomain = domain.trim();
      if (!trimmedDomain) return false;
      
      const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
      return domainRegex.test(trimmedDomain);
    }
  
    static isValidEmail(email) {
      if (!email || typeof email !== 'string') return false;
      const trimmedEmail = email.trim();
      if (!trimmedEmail) return false;
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(trimmedEmail);
    }
  
    static sanitizeInput(input, type = 'string') {
      if (input === null || input === undefined) return '';
      
      switch (type) {
        case 'string':
          return String(input).trim();
        case 'url':
          const urlString = String(input).trim();
          return urlString.startsWith('http') ? urlString : `https://${urlString}`;
        case 'email':
          return String(input).trim().toLowerCase();
        case 'number':
          const num = Number(input);
          return isNaN(num) ? 0 : num;
        case 'boolean':
          return Boolean(input);
        default:
          return String(input).trim();
      }
    }
  
    static validateJobTitle(title, language = 'en') {
      if (!title || typeof title !== 'string') return false;
      const trimmedTitle = title.trim();
      if (!trimmedTitle || trimmedTitle.length < 2) return false;
      if (trimmedTitle.length > 200) return false;
      
      const invalidPatterns = [
        /^\d+$/,
        /^[^a-zA-Z]*$/,
        /script|javascript|<|>/i
      ];
      
      return !invalidPatterns.some(pattern => pattern.test(trimmedTitle));
    }
  
    static validateUrls(urls) {
      if (!Array.isArray(urls)) return [];
      
      return urls
        .filter(url => url && typeof url === 'string')
        .map(url => url.trim())
        .filter(url => url.length > 0)
        .filter(url => this.isValidUrl(url));
    }
  
    static validateJobTitles(jobTitles, language = 'en') {
      if (!Array.isArray(jobTitles)) return [];
      
      return jobTitles
        .filter(title => title && typeof title === 'string')
        .map(title => title.trim())
        .filter(title => title.length > 0)
        .filter(title => this.validateJobTitle(title, language));
    }
  
    static validateTimeout(ms, maxMs = 5000) {
      const timeout = parseInt(ms) || 250;
      
      if (timeout > maxMs) {
        throw new Error(`Timeout cannot exceed ${maxMs}ms`);
      }
      if (timeout < 0) {
        throw new Error('Timeout must be positive');
      }
      
      return timeout;
    }
  
    static validateFileUpload(file, config = {}) {
      if (!file) {
        throw new Error('No file provided');
      }
      
      const allowedTypes = config.allowedTypes || ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new Error('Invalid file type. Only images are allowed.');
      }
      
      const maxSize = config.maxFileSize || 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
      }
      
      return true;
    }
  
    static sanitizeOptions(options, defaults = {}) {
      if (!options || typeof options !== 'object') {
        return { ...defaults };
      }
      
      const sanitized = { ...defaults };
      
      if (typeof options.useCache === 'boolean') {
        sanitized.useCache = options.useCache;
      }
      if (typeof options.saveCache === 'boolean') {
        sanitized.saveCache = options.saveCache;
      }
      if (typeof options.maxRetries === 'number' && options.maxRetries >= 0) {
        sanitized.maxRetries = Math.min(options.maxRetries, defaults.maxRetries || 5);
      }
      if (typeof options.timeout === 'number' && options.timeout > 0) {
        sanitized.timeout = Math.min(options.timeout, defaults.maxTimeout || 300000);
      }
      
      return sanitized;
    }
  
    static createValidationError(message, code = 'VALIDATION_ERROR') {
      const error = new Error(message);
      error.code = code;
      error.type = 'client_error';
      return error;
    }
  
    static extractUserInfo(req) {
      if (req.headers['x-stress-test'] === 'true') {
        return {
          userId: req.headers['x-user-id'] || 'stress_test_user',
          userEmail: req.headers['x-user-email'] || 'stress@test.local'
        };
      }
      
      if (req.user && req.isAuthenticated && req.isAuthenticated()) {
        return {
          userId: req.user._id.toString(),
          userEmail: req.user.email
        };
      }
      
      const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous_' + Date.now();
      const userEmail = req.body.userEmail || req.headers['x-user-email'] || null;
      return { userId, userEmail };
    }
  
    static isStressTest(req) {
      return req.headers['x-stress-test'] === 'true';
    }
  }
  
  module.exports = ValidationUtils;