const crypto = require('crypto');
const { ValidationUtils } = require('../shared');

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
    
    const validUrls = ValidationUtils.validateUrls(allUrls);
    
    if (validUrls.length === 0) {
      throw new Error('No valid URLs found after normalization');
    }
    
    return [...new Set(validUrls)];
  }

  validateJobTitles(jobTitles) {
    if (!Array.isArray(jobTitles) || jobTitles.length === 0) {
      throw new Error('At least one job title is required');
    }
    
    const validJobTitles = ValidationUtils.validateJobTitles(jobTitles);
    
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

    if (!ValidationUtils.isValidUrl(trimmedUrl)) {
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

    if (!ValidationUtils.isValidUrl(url)) {
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
    return ValidationUtils.extractUserInfo(req);
  }

  generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
  }

  sanitizeOptions(options) {
    const defaults = {
      maxRetries: this.config.retries?.maxRetries || 5,
      maxTimeout: this.config.timeouts?.maxRequestMs || 300000
    };
    
    return ValidationUtils.sanitizeOptions(options, defaults);
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
    return ValidationUtils.validateTimeout(ms, maxMs);
  }

  createValidationError(message, code = 'VALIDATION_ERROR') {
    return ValidationUtils.createValidationError(message, code);
  }

  isStressTest(req) {
    return ValidationUtils.isStressTest(req);
  }

  validateFileUpload(file) {
    const config = {
      maxFileSize: this.config.upload?.maxFileSize || 5 * 1024 * 1024
    };
    
    return ValidationUtils.validateFileUpload(file, config);
  }
}

module.exports = ValidationService;