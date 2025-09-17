(function() {
  let hashFn = null;
  let fetchFn = null;
  let logFn = null;
  let config = null;
  
  let lastHash = null;
  let csrfToken = null;
  
  class PreferencesQueue {
    constructor() {
      this.queue = [];
      this.processing = false;
      this.mutex = false;
      this.retryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffFactor: 2
      };
    }
    
    async enqueue(payload) {
      return new Promise((resolve, reject) => {
        const request = {
          id: Date.now() + Math.random(),
          payload,
          resolve,
          reject,
          timestamp: Date.now(),
          retryCount: 0
        };
        
        this.queue.push(request);
        this.processNext();
      });
    }
    
    async processNext() {
      if (this.processing || this.mutex || this.queue.length === 0) {
        return;
      }
      
      this.mutex = true;
      this.processing = true;
      
      try {
        const batchSize = Math.min(this.queue.length, 5);
        const batch = this.queue.splice(0, batchSize);
        
        if (batch.length === 0) {
          return;
        }
        
        const latestRequest = batch[batch.length - 1];
        const result = await this.executeWithRetry(latestRequest);
        
        batch.forEach(request => request.resolve(result));
        
        if (logFn) {
          logFn('buffer', `Processed batch of ${batch.length} requests`);
        }
        
      } catch (error) {
        if (logFn) {
          logFn('fail', `Batch processing failed: ${error.message}`);
        }
        
        const failedBatch = this.queue.splice(0, Math.min(this.queue.length, 5));
        failedBatch.forEach(request => request.reject(error));
        
      } finally {
        this.processing = false;
        this.mutex = false;
        
        if (this.queue.length > 0) {
          setTimeout(() => this.processNext(), 100);
        }
      }
    }
    
    async executeWithRetry(request) {
      const { payload, retryCount } = request;
      
      try {
        const result = await executeRequest(payload);
        const hash = await computeHash(payload);
        
        if (hash) {
          lastHash = hash;
        }
        
        return result;
        
      } catch (error) {
        if (retryCount < this.retryConfig.maxRetries) {
          const delay = this.retryConfig.baseDelayMs * 
            Math.pow(this.retryConfig.backoffFactor, retryCount);
          
          if (logFn) {
            logFn('retry', `Retry ${retryCount + 1}/${this.retryConfig.maxRetries} after ${delay}ms`);
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          request.retryCount++;
          return this.executeWithRetry(request);
        }
        
        throw error;
      }
    }
    
    getStats() {
      return {
        queueLength: this.queue.length,
        processing: this.processing,
        mutex: this.mutex
      };
    }
  }
  
  const preferencesQueue = new PreferencesQueue();
  
  function canonicalJSON(obj, ignoreKeys = []) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => canonicalJSON(item, ignoreKeys));
    }
    
    const sorted = {};
    const keys = Object.keys(obj).filter(k => !ignoreKeys.includes(k)).sort();
    keys.forEach(key => {
      sorted[key] = canonicalJSON(obj[key], ignoreKeys);
    });
    return sorted;
  }
  
  async function computeHash(payload) {
    if (!hashFn) return null;
    
    try {
      const ignoreKeys = config?.prefs?.ignoreKeys || [];
      const canonical = canonicalJSON(payload, ignoreKeys);
      const encoded = new TextEncoder().encode(JSON.stringify(canonical));
      const hashBuffer = await hashFn.digest('SHA-256', encoded);
      
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
        
    } catch (error) {
      if (logFn) logFn('fail', `Hash computation failed: ${error.message}`);
      return null;
    }
  }
  
  async function fetchCSRFToken() {
    if (csrfToken) return csrfToken;
    
    try {
      const response = await fetchFn('/api/csrf-token', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        csrfToken = data.token;
        return csrfToken;
      }
      
    } catch (error) {
      if (logFn) logFn('fail', `CSRF token fetch failed: ${error.message}`);
    }
    
    return null;
  }
  
  async function executeRequest(payload) {
    const maxRetries = 2;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await fetchCSRFToken();
        const headers = {
          'Content-Type': 'application/json'
        };
        
        if (token) {
          headers['X-CSRF-Token'] = token;
        }
        
        const response = await fetchFn('/api/save-user-preferences', {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        
        if (response.status === 403) {
          csrfToken = null;
          if (logFn) logFn('fail', 'CSRF token invalid, clearing cache');
          
          if (attempt < maxRetries) {
            continue;
          }
        }
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        
        const contentType = response.headers.get('content-type');
        
        if (response.status === 204) {
          const result = { 
            success: true, 
            skipped: true, 
            message: 'No changes detected' 
          };
          
          if (logFn) logFn('cache', 'Server confirmed no changes');
          return result;
        }
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const result = await response.json();
            
            if (logFn) {
              logFn(result.success ? 'win' : 'fail', 
                result.success ? 'Preferences saved successfully' : 'Save operation failed');
            }
            
            return result;
            
          } catch (jsonError) {
            if (logFn) logFn('fail', `JSON parse error: ${jsonError.message}`);
            throw new Error(`Invalid JSON response: ${jsonError.message}`);
          }
        }
        
        const textResponse = await response.text();
        
        if (textResponse.trim() === '') {
          const result = { 
            success: true, 
            message: 'Preferences saved (empty response)' 
          };
          
          if (logFn) logFn('win', 'Empty response treated as success');
          return result;
        }
        
        throw new Error(`Unexpected response format: ${contentType || 'unknown'}`);
        
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = 500 * Math.pow(2, attempt);
          if (logFn) logFn('retry', `Request attempt ${attempt + 1} failed, retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    if (logFn) logFn('fail', `All retry attempts failed: ${lastError.message}`);
    throw lastError;
  }
  
  function validatePayload(payload) {
    if (payload === null || payload === undefined) {
      throw new Error('Payload cannot be null or undefined');
    }
    
    if (typeof payload !== 'object') {
      throw new Error(`Invalid payload type: ${typeof payload}, expected object`);
    }
    
    if (Array.isArray(payload)) {
      throw new Error('Payload cannot be an array, must be an object');
    }
    
    try {
      JSON.stringify(payload);
    } catch (error) {
      throw new Error(`Payload is not JSON serializable: ${error.message}`);
    }
    
    const payloadSize = JSON.stringify(payload).length;
    const maxSize = config?.prefs?.maxPayloadSize || 1048576;
    
    if (payloadSize > maxSize) {
      throw new Error(`Payload too large: ${payloadSize} bytes (max: ${maxSize})`);
    }
  }
  
  async function saveUserPreferences(payload) {
    if (!hashFn || !fetchFn) {
      throw new Error('Preferences service not initialized');
    }
    
    try {
      validatePayload(payload);
      
      const hash = await computeHash(payload);
      
      if (hash && hash === lastHash) {
        if (logFn) logFn('cache', 'Skipping save - no changes detected');
        return {
          success: true, 
          skipped: true, 
          message: 'No changes detected'
        };
      }
      
      if (logFn) logFn('buffer', 'Adding request to preferences queue');
      
      return await preferencesQueue.enqueue(payload);
      
    } catch (error) {
      if (logFn) logFn('fail', `Save preferences validation failed: ${error.message}`);
      throw error;
    }
  }
  
  function initPreferencesService(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new Error('Dependencies object required');
    }
    
    hashFn = deps.hash || (typeof crypto !== 'undefined' ? crypto.subtle : null);
    fetchFn = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    
    if (deps.log && typeof deps.log === 'function') {
      logFn = deps.log;
    } else if (typeof window !== 'undefined' && window.clientConfig?.smartLog) {
      logFn = window.clientConfig.smartLog;
    } else {
      logFn = null;
    }
    
    config = deps.config || (typeof window !== 'undefined' ? window.clientConfig : null);
    
    if (!fetchFn) {
      throw new Error('Fetch implementation not available');
    }
    
    if (logFn) logFn('service', 'Preferences service initialized with FIFO queue');
    
    return {
      save: saveUserPreferences,
      getStats: () => preferencesQueue.getStats()
    };
  }
  
  if (typeof window !== 'undefined') {
    window.preferencesService = {
      init: initPreferencesService,
      save: saveUserPreferences
    };
  }
})();