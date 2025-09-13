(function() {
  let hashFn = null;
  let fetchFn = null;
  let logFn = null;
  let config = null;
  
  let lastHash = null;
  let debounceTimer = null;
  let pendingRequest = null;
  let queuedPayload = null;
  
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
    } catch (e) {
      if (logFn) logFn('fail', `Hash computation failed: ${e.message}`);
      return null;
    }
  }
  
  async function executeRequest(payload) {
    try {
      const response = await fetchFn('/api/save-user-preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
      }
      
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          result = await response.json();
        } catch (jsonError) {
          if (logFn) logFn('fail', `JSON parse error: ${jsonError.message}`);
          throw new Error('Invalid JSON response from server');
        }
      } else {
        const text = await response.text();
        if (text.trim() === '') {
          result = { success: true, message: 'Preferences saved (empty response)' };
          if (logFn) logFn('win', 'Empty response treated as success');
        } else {
          if (logFn) logFn('fail', `Unexpected response format: ${contentType || 'unknown'}`);
          throw new Error('Unexpected response format');
        }
      }
      
      if (logFn) {
        logFn(result.success ? 'win' : 'fail', 
          result.success ? 'Preferences saved' : 'Save failed', result);
      }
      return result;
    } catch (e) {
      if (logFn) logFn('fail', `Preferences save error: ${e.message}`);
      throw e;
    }
  }
  
  async function saveUserPreferences(payload) {
    if (!hashFn || !fetchFn) {
      throw new Error('Preferences service not initialized');
    }
    
    if (payload === null || payload === undefined) {
      if (logFn) logFn('fail', 'Payload is null or undefined, aborting save');
      throw new Error('Invalid payload: cannot be null or undefined');
    }
    
    if (typeof payload !== 'object') {
      if (logFn) logFn('fail', `Invalid payload type: ${typeof payload}, expected object`);
      throw new Error('Invalid payload: must be an object');
    }
    
    if (Array.isArray(payload)) {
      if (logFn) logFn('fail', 'Payload is an array, expected object');
      throw new Error('Invalid payload: must be an object, not an array');
    }
    
    const hash = await computeHash(payload);
    
    if (hash && hash === lastHash) {
      if (logFn) logFn('cache', 'Skip unchanged preferences');
      return {success: true, skipped: true, message: 'No changes detected'};
    }
    
    clearTimeout(debounceTimer);
    queuedPayload = payload;
    
    return new Promise((resolve, reject) => {
      debounceTimer = setTimeout(async () => {
        if (pendingRequest) {
          if (logFn) logFn('buffer', 'Request already in flight, queueing');
          try {
            await pendingRequest;
            const result = await saveUserPreferences(queuedPayload);
            resolve(result);
          } catch (e) {
            reject(e);
          }
          return;
        }
        
        try {
          pendingRequest = executeRequest(queuedPayload);
          const result = await pendingRequest;
          if (hash) lastHash = hash;
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          pendingRequest = null;
          queuedPayload = null;
        }
      }, config?.prefs?.debounceMs || 500);
    });
  }
  
  function initPreferencesService(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new Error('Dependencies object required');
    }
    
    hashFn = deps.hash || (typeof crypto !== 'undefined' ? crypto.subtle : null);
    fetchFn = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    
    if (deps.log && typeof deps.log === 'function') {
      logFn = deps.log;
    } else if (typeof window !== 'undefined' && window.clientConfig && window.clientConfig.smartLog) {
      logFn = window.clientConfig.smartLog;
    } else {
      logFn = null;
    }
    
    config = deps.config || (typeof window !== 'undefined' ? window.clientConfig : null);
    
    if (!fetchFn) {
      throw new Error('Fetch implementation not available');
    }
    
    if (logFn) logFn('buffer', 'Preferences service initialized');
    
    return {save: saveUserPreferences};
  }
  
  if (typeof window !== 'undefined') {
    window.preferencesService = {
      init: initPreferencesService,
      save: saveUserPreferences
    };
  }
})();