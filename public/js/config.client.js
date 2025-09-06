(function() {
  const getEnvFromHTML = () => {
    const htmlElement = document.documentElement;
    return htmlElement.getAttribute('data-env') || window.__ENV__ || 'development';
  };

  const LOG_LEVELS = {
    ESSENTIAL: ['buffer', 'polling', 'langue', 'domain-profile', 'steps', 'retry', 'timeout', 'fail', 'win', 'cache', 'platform', 'fast-track'],
    VERBOSE: ['all-current-logs']
  };

  const CONFIG = {
    env: {
      isProd: getEnvFromHTML() === 'production'
    },
    logging: {
      level: getEnvFromHTML() === 'production' ? 'ESSENTIAL' : 'VERBOSE',
      sampling: 1.0,
      dedupMs: 5000,
      redactPII: true
    },
    i18n: {
      defaultLocale: 'en',
      storageKey: 'myJobBuddy_language',
      endpoint: '/dictionaries/ui/',
      timeoutMs: 5000,
      retry: {
        max: 3,
        delayMs: 150
      }
    }
  };

  const logDeduplication = new Map();
  const memoryCache = new Map();

  const redactPII = (input) => {
    if (typeof input === 'string') {
      return input
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
        .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]');
    }
    
    if (typeof input === 'object' && input !== null) {
      const redacted = {};
      for (const [key, value] of Object.entries(input)) {
        if (['password', 'token', 'secret', 'key', 'auth', 'uri', 'url'].some(sensitive => 
          key.toLowerCase().includes(sensitive))) {
          redacted[key] = '[REDACTED]';
        } else {
          redacted[key] = redactPII(value);
        }
      }
      return redacted;
    }
    
    return input;
  };

  const shouldLog = (category) => {
    const levelCategories = LOG_LEVELS[CONFIG.logging.level] || LOG_LEVELS.ESSENTIAL;
    return CONFIG.logging.level === 'VERBOSE' || levelCategories.includes(category);
  };

  const smartLog = (category, message, data = null) => {
    if (!shouldLog(category)) return;
    
    if (Math.random() > CONFIG.logging.sampling) return;
    
    const deduplicationKey = `${category}:${message}`;
    const now = Date.now();
    const lastLog = logDeduplication.get(deduplicationKey);
    
    if (lastLog && (now - lastLog) < CONFIG.logging.dedupMs) return;
    
    logDeduplication.set(deduplicationKey, now);
    
    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = category.toUpperCase();
    
    let logMessage = message;
    if (CONFIG.logging.redactPII) {
      logMessage = redactPII(message);
    }
    
    if (data) {
      const logData = CONFIG.logging.redactPII ? redactPII(data) : data;
      console.log(`[${timestamp}] ${prefix}: ${logMessage}`, logData);
    } else {
      console.log(`[${timestamp}] ${prefix}: ${logMessage}`);
    }
  };

  const createMemoryCache = (defaultTTL = 30000) => {
    return {
      set: (key, value, customTtl = defaultTTL) => {
        const expires = Date.now() + customTtl;
        memoryCache.set(key, { value, expires });
        setTimeout(() => memoryCache.delete(key), customTtl);
      },
      get: (key) => {
        const item = memoryCache.get(key);
        return item && item.expires > Date.now() ? item.value : null;
      },
      has: (key) => {
        const item = memoryCache.get(key);
        return item && item.expires > Date.now();
      },
      delete: (key) => memoryCache.delete(key),
      clear: () => memoryCache.clear()
    };
  };

  window.clientConfig = {
    env: CONFIG.env,
    logging: CONFIG.logging,
    i18n: CONFIG.i18n,
    smartLog,
    shouldLog,
    memoryCache: createMemoryCache(),
    redactPII
  };

  if (typeof define === 'function' && define.amd) {
    define(() => window.clientConfig);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.clientConfig;
  }
})();