// public/js/utils-debounce.js - Utilitaires pour débounce et déduplication

class DebounceManager {
    constructor() {
      this.timers = new Map();
      this.inflightRequests = new Map();
    }
  
    debounce(key, fn, delay = 300) {
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }
      
      const timer = setTimeout(() => {
        this.timers.delete(key);
        fn();
      }, delay);
      
      this.timers.set(key, timer);
    }
  
    deduplicateRequest(key, promiseFactory) {
      if (this.inflightRequests.has(key)) {
        return this.inflightRequests.get(key);
      }
      
      const promise = promiseFactory()
        .finally(() => {
          this.inflightRequests.delete(key);
        });
      
      this.inflightRequests.set(key, promise);
      return promise;
    }
  
    clear() {
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();
      this.inflightRequests.clear();
    }
  }
  
  const globalDebounceManager = new DebounceManager();
  
  // public/js/components/userPreferences.js - Structure recommandée
  
  class UserPreferencesManager {
    constructor() {
      this.debounceManager = globalDebounceManager;
      this.currentPreferences = null;
      this.lastSentHash = null;
      this.planLimitsCache = null;
      this.planLimitsCacheTime = 0;
      this.planLimitsCacheTTL = 30000; // 30s
    }
  
    init() {
      this.loadUserPreferences();
      this.setupEventListeners();
    }
  
    // Deep equality check
    deepEqual(obj1, obj2) {
      if (obj1 === obj2) return true;
      if (obj1 == null || obj2 == null) return false;
      if (typeof obj1 !== typeof obj2) return false;
      
      if (typeof obj1 !== 'object') return obj1 === obj2;
      
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);
      
      if (keys1.length !== keys2.length) return false;
      
      for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!this.deepEqual(obj1[key], obj2[key])) return false;
      }
      
      return true;
    }
  
    // Hash for change detection
    hashPreferences(prefs) {
      return btoa(JSON.stringify(prefs)).slice(0, 16);
    }
  
    // Debounced save with deduplication
    saveUserPreferences(preferences, force = false) {
      const prefsHash = this.hashPreferences(preferences);
      
      // Don't save if unchanged
      if (!force && this.lastSentHash === prefsHash) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] No changes detected, skipping save');
        return Promise.resolve({ success: true, cached: true });
      }
  
      const saveKey = `save-prefs-${prefsHash}`;
      
      return this.debounceManager.deduplicateRequest(saveKey, () => {
        return new Promise((resolve) => {
          this.debounceManager.debounce('save-user-prefs', async () => {
            try {
              window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Saving preferences...');
              
              // Generate idempotency key
              const idempotencyKey = `${Date.now()}-${prefsHash}`;
              
              const response = await fetch('/api/save-user-preferences', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify(preferences)
              });
              
              if (response.status === 204) {
                window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] No changes on server side');
                resolve({ success: true, noChanges: true });
                return;
              }
              
              if (response.status === 429) {
                const errorData = await response.json();
                window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Rate limited:', errorData.retryAfter);
                showToast('warning', `Too many requests. Please wait ${errorData.retryAfter}s`);
                resolve({ success: false, rateLimited: true });
                return;
              }
              
              const result = await response.json();
              
              if (result.success) {
                this.lastSentHash = prefsHash;
                window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Preferences saved successfully');
                showToast('success', 'Preferences saved');
              } else {
                window.clientConfig&&window.clientConfig.smartLog('fail','[UserPrefs] Save failed:', result.message);
                showToast('error', 'Failed to save preferences');
              }
              
              resolve(result);
              
            } catch (error) {
              window.clientConfig&&window.clientConfig.smartLog('fail','[UserPrefs] Save error:', error);
              showToast('error', 'Network error while saving');
              resolve({ success: false, error: error.message });
            }
          }, 300); // 300ms debounce
        });
      });
    }
  
    // Cached plan limits with 30s TTL
    async getPlanLimits(forceRefresh = false) {
      const now = Date.now();
      
      if (!forceRefresh && 
          this.planLimitsCache && 
          (now - this.planLimitsCacheTime) < this.planLimitsCacheTTL) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Plan limits from client cache');
        return this.planLimitsCache;
      }
      
      const limitsKey = 'get-plan-limits';
      
      return this.debounceManager.deduplicateRequest(limitsKey, async () => {
        try {
          window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Fetching plan limits...');
          
          const response = await fetch('/plan/limits');
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const result = await response.json();
          
          // Cache the result
          this.planLimitsCache = result;
          this.planLimitsCacheTime = now;
          
          window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Plan limits cached for 30s');
          return result;
          
        } catch (error) {
          window.clientConfig&&window.clientConfig.smartLog('fail','[UserPrefs] Plan limits fetch error:', error);
          // Return cached data if available, even if stale
          if (this.planLimitsCache) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Returning stale plan limits cache');
            return this.planLimitsCache;
          }
          throw error;
        }
      });
    }
  
    // Event listeners with debounced saves
    setupEventListeners() {
      // Job titles
      document.addEventListener('change', (e) => {
        if (e.target.matches('.job-title-input')) {
          this.handleJobTitleChange(e);
        }
      });
      
      // Locations  
      document.addEventListener('change', (e) => {
        if (e.target.matches('.location-input')) {
          this.handleLocationChange(e);
        }
      });
      
      // Career pages
      document.addEventListener('change', (e) => {
        if (e.target.matches('.career-page-input')) {
          this.handleCareerPageChange(e);
        }
      });
      
      // Periodic plan limits refresh (avoid spam)
      setInterval(() => {
        if (document.visibilityState === 'visible') {
          this.getPlanLimits(true).catch(console.error);
        }
      }, 60000); // 1 minute
    }
  
    handleJobTitleChange(e) {
      // Update current preferences
      this.currentPreferences.jobTitles = this.getCurrentJobTitles();
      
      // Debounced save
      this.saveUserPreferences(this.currentPreferences);
    }
  
    handleLocationChange(e) {
      this.currentPreferences.locations = this.getCurrentLocations();
      this.saveUserPreferences(this.currentPreferences);
    }
  
    handleCareerPageChange(e) {
      this.currentPreferences.careerPages = this.getCurrentCareerPages();
      this.saveUserPreferences(this.currentPreferences);
    }
  
    // Helper methods to get current values from DOM
    getCurrentJobTitles() {
      return Array.from(document.querySelectorAll('.job-title-input'))
        .map(input => input.value.trim())
        .filter(title => title.length > 0);
    }
  
    getCurrentLocations() {
      return Array.from(document.querySelectorAll('.location-input'))
        .map(input => input.value.trim())
        .filter(location => location.length > 0);
    }
  
    getCurrentCareerPages() {
      return Array.from(document.querySelectorAll('.career-page-input'))
        .map(input => ({ url: input.value.trim(), name: input.dataset.name || '' }))
        .filter(page => page.url.length > 0);
    }
  
    async loadUserPreferences() {
      try {
        const response = await fetch('/api/get-user-preferences');
        const result = await response.json();
        
        if (result.success) {
          this.currentPreferences = result.preferences;
          this.lastSentHash = this.hashPreferences(result.preferences);
          this.populateForm(result.preferences);
          window.clientConfig&&window.clientConfig.smartLog('buffer','[UserPrefs] Preferences loaded');
        }
      } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','[UserPrefs] Load error:', error);
      }
    }
  
    populateForm(preferences) {
      // Populate job titles
      if (preferences.jobTitles) {
        preferences.jobTitles.forEach((title, index) => {
          const input = document.querySelector(`.job-title-input[data-index="${index}"]`);
          if (input) input.value = title;
        });
      }
      
      // Similar for locations and career pages...
    }
  
    // Cleanup on page unload
    cleanup() {
      this.debounceManager.clear();
    }
  }
  
  // Global instance
  const userPreferencesManager = new UserPreferencesManager();
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => userPreferencesManager.init());
  } else {
    userPreferencesManager.init();
  }
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => userPreferencesManager.cleanup());