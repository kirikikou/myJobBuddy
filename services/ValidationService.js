const crypto = require('crypto');

class ValidationService {
  constructor(config) {
    this.config = config;
  }

  validateAndNormalizeUrls(urls, careerPages, careerPageUrls) {
    const allUrls = [];
    
    if (Array.isArray(urls)) allUrls.push(...urls);
    if (Array.isArray(careerPages)) allUrls.push(...careerPages);
    if (Array.isArray(careerPageUrls)) allUrls.push(...careerPageUrls);
    
    if (allUrls.length === 0) {
      throw new Error('At least one URL is required in urls, careerPages, or careerPageUrls');
    }
    
    const normalizedUrls = allUrls
      .filter(url => url && typeof url === 'string')
      .map(url => url.trim())
      .filter(url => url.length > 0);
    
    if (normalizedUrls.length === 0) {
      throw new Error('No valid URLs found after normalization');
    }
    
    const uniqueUrls = [...new Set(normalizedUrls)];
    
    for (const url of uniqueUrls) {
      try {
        new URL(url.startsWith('http') ? url : `https://${url}`);
      } catch (error) {
        throw new Error(`Invalid URL format: ${url}`);
      }
    }
    
    return uniqueUrls;
  }

  validateJobTitles(jobTitles) {
    if (!Array.isArray(jobTitles) || jobTitles.length === 0) {
      throw new Error('At least one job title is required');
    }
    
    const validJobTitles = jobTitles
      .filter(title => title && typeof title === 'string')
      .map(title => title.trim())
      .filter(title => title.length > 0);
    
    if (validJobTitles.length === 0) {
      throw new Error('No valid job titles found after normalization');
    }
    
    return validJobTitles;
  }

  validateSingleUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL is required and must be a string');
    }
    
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      throw new Error('URL cannot be empty');
    }

    try {
      new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`);
    } catch (error) {
      throw new Error(`Invalid URL format: ${trimmedUrl}`);
    }

    return trimmedUrl;
  }

  validateBatchScrapingRequest(requestBody) {
    const { searchQuery, urls, options = {} } = requestBody;
    
    if (!searchQuery || typeof searchQuery !== 'string') {
      throw new Error('searchQuery is required and must be a string');
    }
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      throw new Error('urls array is required and cannot be empty');
    }
    
    if (urls.length > this.config.limits?.maxBatchUrls || 100) {
      throw new Error(`Maximum ${this.config.limits?.maxBatchUrls || 100} URLs allowed per batch`);
    }

    const validUrls = [];
    for (const url of urls) {
      try {
        validUrls.push(this.validateSingleUrl(url));
      } catch (error) {
        throw new Error(`Invalid URL in batch: ${error.message}`);
      }
    }

    return {
      searchQuery: searchQuery.trim(),
      urls: validUrls,
      options: this.sanitizeOptions(options)
    };
  }

  validateLanguageDetectionRequest(requestBody) {
    const { text } = requestBody;
    
    if (!text || typeof text !== 'string') {
      throw new Error('Text parameter is required and must be a string');
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Text cannot be empty');
    }

    if (trimmedText.length > (this.config.limits?.maxTextLength || 10000)) {
      throw new Error(`Text length cannot exceed ${this.config.limits?.maxTextLength || 10000} characters`);
    }

    return trimmedText;
  }

  validateJobFilterRequest(requestBody) {
    const { jobs, query } = requestBody;
    
    if (!Array.isArray(jobs)) {
      throw new Error('jobs parameter is required and must be an array');
    }

    if (!query || typeof query !== 'object') {
      throw new Error('query parameter is required and must be an object');
    }

    const validatedJobs = jobs.filter(job => 
      job && typeof job === 'object' && job.title
    );

    if (validatedJobs.length === 0) {
      throw new Error('No valid jobs found in the jobs array');
    }

    return {
      jobs: validatedJobs,
      query: this.sanitizeQueryObject(query)
    };
  }

  validateWebhookRequest(requestBody) {
    const { url, events = [] } = requestBody;
    
    if (!url || typeof url !== 'string') {
      throw new Error('url parameter is required and must be a string');
    }

    if (!Array.isArray(events)) {
      throw new Error('events parameter must be an array');
    }

    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid webhook URL format: ${url}`);
    }

    const validEvents = events.filter(event => 
      typeof event === 'string' && event.trim().length > 0
    );

    return {
      url: url.trim(),
      events: validEvents
    };
  }

  extractUserInfo(req) {
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

  generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
  }

  sanitizeOptions(options) {
    if (!options || typeof options !== 'object') {
      return {};
    }

    const sanitized = {};
    
    if (typeof options.useCache === 'boolean') {
      sanitized.useCache = options.useCache;
    }
    
    if (typeof options.saveCache === 'boolean') {
      sanitized.saveCache = options.saveCache;
    }
    
    if (typeof options.maxRetries === 'number' && options.maxRetries >= 0) {
      sanitized.maxRetries = Math.min(options.maxRetries, this.config.retries?.maxRetries || 5);
    }
    
    if (typeof options.timeout === 'number' && options.timeout > 0) {
      sanitized.timeout = Math.min(options.timeout, this.config.timeouts?.maxRequestMs || 300000);
    }

    return sanitized;
  }

  sanitizeQueryObject(query) {
    const sanitized = {};
    
    if (Array.isArray(query.include)) {
      sanitized.include = query.include
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
    
    if (typeof query.location === 'string') {
      sanitized.location = query.location.trim();
    }
    
    if (typeof query.remote === 'boolean') {
      sanitized.remote = query.remote;
    }

    return sanitized;
  }

  validateTimeout(ms, maxMs = 5000) {
    const timeout = parseInt(ms) || 250;
    
    if (timeout > maxMs) {
      throw new Error(`Timeout cannot exceed ${maxMs}ms`);
    }

    if (timeout < 0) {
      throw new Error('Timeout must be positive');
    }

    return timeout;
  }

  createValidationError(message, code = 'VALIDATION_ERROR') {
    const error = new Error(message);
    error.code = code;
    error.type = 'client_error';
    return error;
  }

  isStressTest(req) {
    return req.headers['x-stress-test'] === 'true';
  }

  validateFileUpload(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only images are allowed.');
    }

    const maxSize = this.config.upload?.maxFileSize || 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
    }

    return true;
  }
}

module.exports = ValidationService;