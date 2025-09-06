const validateStatisticsRequest = (params) => {
  const errors = [];
  
  if (params.step && typeof params.step !== 'string') {
    errors.push('Step parameter must be a string');
  }
  
  if (params.category && !['Easy', 'Moderate', 'Medium', 'Hard', 'Very Hard'].includes(params.category)) {
    errors.push('Invalid category parameter');
  }
  
  if (params.minScore && (isNaN(params.minScore) || params.minScore < 0 || params.minScore > 100)) {
    errors.push('minScore must be a number between 0 and 100');
  }
  
  if (params.maxScore && (isNaN(params.maxScore) || params.maxScore < 0 || params.maxScore > 100)) {
    errors.push('maxScore must be a number between 0 and 100');
  }
  
  if (params.sortBy && !['complexityScore', 'totalAttempts', 'lastSuccessAt', 'errors'].includes(params.sortBy)) {
    errors.push('Invalid sortBy parameter');
  }
  
  if (params.sortDir && !['asc', 'desc'].includes(params.sortDir)) {
    errors.push('sortDir must be either "asc" or "desc"');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateDomainName = (domain) => {
  if (!domain || typeof domain !== 'string') {
    return {
      isValid: false,
      error: 'Domain parameter is required and must be a string'
    };
  }
  
  if (domain.length > 255) {
    return {
      isValid: false,
      error: 'Domain name too long'
    };
  }
  
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!domainRegex.test(domain)) {
    return {
      isValid: false,
      error: 'Invalid domain name format'
    };
  }
  
  return { isValid: true };
};

const validateConsoleErrorParams = (params) => {
  const errors = [];
  
  if (params.level && !['log', 'info', 'warn', 'error', 'debug'].includes(params.level)) {
    errors.push('Invalid level parameter');
  }
  
  if (params.limit && (isNaN(params.limit) || params.limit < 1 || params.limit > 10000)) {
    errors.push('Limit must be a number between 1 and 10000');
  }
  
  if (params.page && (isNaN(params.page) || params.page < 1)) {
    errors.push('Page must be a number greater than 0');
  }
  
  if (params.date && !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    errors.push('Date must be in YYYY-MM-DD format');
  }
  
  if (params.domain && typeof params.domain !== 'string') {
    errors.push('Domain parameter must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateFileOperationParams = (params) => {
  const errors = [];
  
  if (params.dir && !['cache', 'debug', 'user_preferences', ''].includes(params.dir)) {
    errors.push('Invalid directory parameter');
  }
  
  if (params.action && !['browse', 'view', 'download', 'delete', 'analyze'].includes(params.action)) {
    errors.push('Invalid action parameter');
  }
  
  if (params.file && typeof params.file !== 'string') {
    errors.push('File parameter must be a string');
  }
  
  if (params.file && params.file.includes('..')) {
    errors.push('File path traversal not allowed');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateScrapingTestParams = (params) => {
  const errors = [];
  
  if (!params.url || typeof params.url !== 'string') {
    errors.push('URL parameter is required and must be a string');
  }
  
  if (params.url && params.url.length > 2048) {
    errors.push('URL too long');
  }
  
  try {
    if (params.url) {
      new URL(params.url);
    }
  } catch (e) {
    errors.push('Invalid URL format');
  }
  
  if (params.jobTitle && typeof params.jobTitle !== 'string') {
    errors.push('Job title must be a string');
  }
  
  if (params.jobTitle && params.jobTitle.length > 200) {
    errors.push('Job title too long');
  }
  
  if (params.useCache && !['true', 'false'].includes(params.useCache)) {
    errors.push('useCache must be "true" or "false"');
  }
  
  if (params.timeout && (isNaN(params.timeout) || params.timeout < 1000 || params.timeout > 300000)) {
    errors.push('Timeout must be between 1000 and 300000 milliseconds');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateCacheOperationParams = (params) => {
  const errors = [];
  
  if (params.operation && !['clear', 'stats', 'cleanup', 'view'].includes(params.operation)) {
    errors.push('Invalid operation parameter');
  }
  
  if (params.pattern && typeof params.pattern !== 'string') {
    errors.push('Pattern must be a string');
  }
  
  if (params.maxAge && (isNaN(params.maxAge) || params.maxAge < 0)) {
    errors.push('maxAge must be a positive number');
  }
  
  if (params.domain && typeof params.domain !== 'string') {
    errors.push('Domain must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const sanitizeUserInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
};

const isValidUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (e) {
    return false;
  }
};

const isValidDomainFormat = (domain) => {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  return domainRegex.test(domain);
};

const validatePaginationParams = (params) => {
  const errors = [];
  
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 20;
  
  if (page < 1) {
    errors.push('Page must be greater than 0');
  }
  
  if (limit < 1 || limit > 1000) {
    errors.push('Limit must be between 1 and 1000');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    page,
    limit
  };
};

module.exports = {
  validateStatisticsRequest,
  validateDomainName,
  validateConsoleErrorParams,
  validateFileOperationParams,
  validateScrapingTestParams,
  validateCacheOperationParams,
  sanitizeUserInput,
  isValidUrl,
  isValidDomainFormat,
  validatePaginationParams
};