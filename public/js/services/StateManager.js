class StateManager {
    constructor() {
      this.state = {
        app: {
          initialized: false,
          authenticating: false,
          authenticated: false,
          currentComponent: null,
          navigationLocked: false,
          i18nInitialized: false
        },
        user: {
          data: null,
          preferences: null,
          plan: null
        },
        component: {
          states: {},
          loadingStates: new Map()
        },
        services: {
          preferences: null,
          initialized: new Set()
        }
      };
      
      this.subscribers = new Map();
      this.promiseCache = new Map();
      this.retryConfig = {
        maxRetries: 3,
        baseDelay: 500,
        backoffFactor: 1.5,
        jitter: 0.1
      };
    }
  
    getState(path = '') {
      if (!path) return this.state;
      
      return path.split('.').reduce((obj, key) => obj?.[key], this.state);
    }
  
    setState(path, value) {
      const keys = path.split('.');
      const lastKey = keys.pop();
      const target = keys.reduce((obj, key) => {
        if (!obj[key]) obj[key] = {};
        return obj[key];
      }, this.state);
      
      const oldValue = target[lastKey];
      target[lastKey] = value;
      
      this.notifySubscribers(path, value, oldValue);
    }
  
    subscribe(path, callback) {
      if (!this.subscribers.has(path)) {
        this.subscribers.set(path, new Set());
      }
      
      this.subscribers.get(path).add(callback);
      
      return () => {
        const pathSubscribers = this.subscribers.get(path);
        if (pathSubscribers) {
          pathSubscribers.delete(callback);
          if (pathSubscribers.size === 0) {
            this.subscribers.delete(path);
          }
        }
      };
    }
  
    notifySubscribers(path, newValue, oldValue) {
      const pathParts = path.split('.');
      
      for (let i = 0; i <= pathParts.length; i++) {
        const currentPath = pathParts.slice(0, i).join('.');
        const subscribers = this.subscribers.get(currentPath);
        
        if (subscribers) {
          subscribers.forEach(callback => {
            try {
              callback(newValue, oldValue, path);
            } catch (error) {
              if (window.clientConfig?.smartLog) {
                window.clientConfig.smartLog('fail', `Subscriber error for ${path}: ${error.message}`);
              }
            }
          });
        }
      }
    }
  
    async withRetry(operation, context = 'operation') {
      const { maxRetries, baseDelay, backoffFactor, jitter } = this.retryConfig;
      let lastError;
  
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          
          if (attempt === maxRetries) {
            if (window.clientConfig?.smartLog) {
              window.clientConfig.smartLog('fail', `${context} failed after ${maxRetries} retries: ${error.message}`);
            }
            break;
          }
          
          const delay = baseDelay * Math.pow(backoffFactor, attempt);
          const jitterAmount = delay * jitter * (Math.random() * 2 - 1);
          const actualDelay = Math.max(0, delay + jitterAmount);
          
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('retry', `${context} attempt ${attempt + 1} failed, retrying in ${Math.round(actualDelay)}ms`);
          }
          
          await this.delay(actualDelay);
        }
      }
      
      throw lastError;
    }
  
    async waitForCondition(conditionFn, options = {}) {
      const {
        timeout = 10000,
        pollInterval = 100,
        timeoutMessage = 'Condition timeout'
      } = options;
      
      const startTime = Date.now();
      
      return new Promise((resolve, reject) => {
        const checkCondition = () => {
          try {
            const result = conditionFn();
            
            if (result) {
              resolve(result);
              return;
            }
            
            if (Date.now() - startTime > timeout) {
              reject(new Error(timeoutMessage));
              return;
            }
            
            setTimeout(checkCondition, pollInterval);
          } catch (error) {
            reject(error);
          }
        };
        
        checkCondition();
      });
    }
  
    async waitForDataLoad() {
      return this.waitForCondition(
        () => {
          const userData = this.getState('user.data');
          return userData?.lastUsed &&
                 userData.companies !== undefined &&
                 userData.jobTitles !== undefined &&
                 userData.locations !== undefined &&
                 userData.careerPages !== undefined;
        },
        {
          timeout: 15000,
          pollInterval: 200,
          timeoutMessage: 'User data load timeout'
        }
      );
    }
  
    async waitForComponentReady(componentName) {
      const componentCheckers = {
        'cv-builder': () => {
          return document.getElementById('experience-modal') &&
                 document.getElementById('education-modal') &&
                 document.getElementById('preview-cv') &&
                 document.getElementById('export-pdf');
        },
        'job-search': () => {
          return window.jobSearchModule && window.getComponentData;
        },
        default: () => true
      };
      
      const checker = componentCheckers[componentName] || componentCheckers.default;
      
      return this.waitForCondition(checker, {
        timeout: 8000,
        pollInterval: 200,
        timeoutMessage: `Component ${componentName} initialization timeout`
      });
    }
  
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  
    async cachedPromise(key, promiseFactory, ttl = 30000) {
      const cached = this.promiseCache.get(key);
      
      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.promise;
      }
      
      const promise = promiseFactory();
      this.promiseCache.set(key, {
        promise,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        this.promiseCache.delete(key);
      }, ttl);
      
      return promise;
    }
  
    async verifyAuthentication() {
      return this.cachedPromise('auth-verify', async () => {
        const response = await fetch('/auth/status');
        const authData = await response.json();
        
        if (!authData.isAuthenticated) {
          this.setState('app.authenticated', false);
          throw new Error('Authentication lost');
        }
        
        this.setState('app.authenticated', true);
        return true;
      }, 10000);
    }
  
    async initializeService(serviceName, initFunction) {
      const initialized = this.getState('services.initialized');
      
      if (initialized.has(serviceName)) {
        return this.getState(`services.${serviceName}`);
      }
      
      return this.cachedPromise(`init-${serviceName}`, async () => {
        const service = await initFunction();
        this.setState(`services.${serviceName}`, service);
        initialized.add(serviceName);
        this.setState('services.initialized', initialized);
        return service;
      });
    }
  
    reset() {
      this.state = {
        app: {
          initialized: false,
          authenticating: false,
          authenticated: false,
          currentComponent: null,
          navigationLocked: false,
          i18nInitialized: false
        },
        user: {
          data: null,
          preferences: null,
          plan: null
        },
        component: {
          states: {},
          loadingStates: new Map()
        },
        services: {
          preferences: null,
          initialized: new Set()
        }
      };
      
      this.subscribers.clear();
      this.promiseCache.clear();
    }
  }
  
  if (typeof window !== 'undefined') {
    window.stateManager = new StateManager();
  }