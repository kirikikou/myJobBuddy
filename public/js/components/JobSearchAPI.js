class JobSearchAPI {
  constructor(stateManager) {
    this.state = stateManager;
    this.activeRequests = new Map();
    this.retryQueue = new Map();
    this.requestId = 0;
    
    this.config = {
      timeouts: {
        search: 30000,
        cache: 10000,
        limits: 5000,
        auth: 8000
      },
      retries: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffFactor: 2
      },
      eventSource: {
        reconnectDelay: 2000,
        maxReconnects: 5,
        messageTimeout: 300000,
        heartbeatInterval: 30000
      }
    };
  }

  generateRequestId() {
    return `req_${Date.now()}_${++this.requestId}`;
  }

  async makeRequest(url, options = {}) {
    const requestId = this.generateRequestId();
    const controller = new AbortController();
    const timeout = options.timeout || this.config.timeouts.search;
    
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      this.activeRequests.set(requestId, { controller, url, startTime: Date.now() });

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      clearTimeout(timeoutId);
      this.activeRequests.delete(requestId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(response.status, errorData.message || response.statusText, errorData);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      this.activeRequests.delete(requestId);

      if (error.name === 'AbortError') {
        throw new APIError(408, 'Request timeout', { requestId, timeout });
      }

      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', `API request failed: ${url}`, error.message);
      }

      throw error;
    }
  }

  async retryableRequest(url, options = {}, maxRetries = null) {
    const retries = maxRetries || this.config.retries.maxAttempts;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.makeRequest(url, options);
        
        if (attempt > 0 && window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('retry', `Request succeeded on attempt ${attempt + 1}: ${url}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt < retries && this.shouldRetry(error)) {
          const delay = Math.min(
            this.config.retries.baseDelay * Math.pow(this.config.retries.backoffFactor, attempt),
            this.config.retries.maxDelay
          );
          
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('retry', `Retry attempt ${attempt + 1}/${retries + 1} in ${delay}ms for: ${url}`);
          }
          
          await this.delay(delay);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  shouldRetry(error) {
    if (error.name === 'AbortError') return false;
    if (error instanceof APIError) {
      return error.status >= 500 || error.status === 429;
    }
    return true;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkUserPlan() {
    try {
      const data = await this.retryableRequest('/plan/limits', {
        timeout: this.config.timeouts.limits
      });
      
      if (data.success) {
        this.state.setState({ userPlan: data.plan || 'free' });
        return data;
      }
      
      throw new Error('Invalid plan response');
    } catch (error) {
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', 'Failed to check user plan', error.message);
      }
      return { plan: 'free', success: false };
    }
  }

  async performCacheOnlySearch(searchData) {
    try {
      this.state.setSearchProgress(true, { searchType: 'cache' });
      
      const response = await this.retryableRequest('/api/search-cache-only', {
        method: 'POST',
        body: JSON.stringify(searchData),
        timeout: this.config.timeouts.cache
      });

      this.state.setSearchProgress(false, { results: response.results || [] });
      
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('win', `Cache search completed: ${response.results?.length || 0} results`);
      }
      
      return response;
    } catch (error) {
      this.state.setSearchProgress(false);
      
      if (error instanceof APIError && error.status === 429) {
        this.handleLimitExceeded(error.data);
        return { results: [], limitExceeded: true };
      }
      
      throw error;
    }
  }

  createEventSourceSearch(searchParams) {
    return new Promise((resolve, reject) => {
      const url = '/api/search-career-pages-stream?' + new URLSearchParams(searchParams).toString();
      const eventSource = new EventSource(url);
      let results = [];
      let isComplete = false;
      let messageTimeout;
      let heartbeatInterval;
      let lastMessageTime = Date.now();
      let queuedDomains = new Set();

      const cleanup = () => {
        if (messageTimeout) {
          clearTimeout(messageTimeout);
          messageTimeout = null;
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        this.state.setEventSource(null);
        if (eventSource.readyState !== EventSource.CLOSED) {
          eventSource.close();
        }
      };

      const resetMessageTimeout = () => {
        if (messageTimeout) clearTimeout(messageTimeout);
        lastMessageTime = Date.now();
        
        messageTimeout = setTimeout(() => {
          if (!isComplete && queuedDomains.size === 0) {
            if (window.clientConfig?.smartLog) {
              window.clientConfig.smartLog('fail', 'Search blocked - EventSource message timeout');
            }
            cleanup();
            reject(new Error('Search timeout - please try with fewer domains or check your connection'));
          }
        }, this.config.eventSource.messageTimeout);
      };

      const startHeartbeat = () => {
        heartbeatInterval = setInterval(() => {
          const timeSinceLastMessage = Date.now() - lastMessageTime;
          if (timeSinceLastMessage > this.config.eventSource.heartbeatInterval && !isComplete) {
            if (window.clientConfig?.smartLog) {
              window.clientConfig.smartLog('buffer', `Heartbeat: ${Math.floor(timeSinceLastMessage/1000)}s since last message`);
            }
          }
        }, this.config.eventSource.heartbeatInterval);
      };

      this.state.setEventSource(eventSource);
      resetMessageTimeout();
      startHeartbeat();

      eventSource.onopen = () => {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'EventSource connection opened');
        }
        resetMessageTimeout();
      };

      eventSource.onmessage = (event) => {
        resetMessageTimeout();
        
        try {
          const data = JSON.parse(event.data);
          
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('buffer', `EventSource phase: ${data.phase}`);
          }

          switch (data.phase) {
            case 'cache':
              this.handleCachePhase(data);
              break;
            case 'cache-complete':
              results = [...(data.results || [])];
              this.state.updateResults(results);
              this.handleCacheComplete(data);
              break;
            case 'queued':
              this.handleQueuedPhase(data, queuedDomains);
              break;
            case 'scraping':
              this.handleScrapingPhase(data);
              break;
            case 'scraping-progress':
              if (data.results?.length > 0) {
                results = [...results, ...data.results];
                this.state.updateResults(results);
              }
              this.handleScrapingProgress(data, queuedDomains);
              break;
            case 'complete':
              isComplete = true;
              cleanup();
              resolve({
                results,
                totalProcessed: data.totalProcessed,
                searchType: 'live'
              });
              break;
            case 'error':
              isComplete = true;
              cleanup();
              
              if (data.errorType === 'CACHE_LIMIT_EXCEEDED' || data.errorType === 'SCRAPING_LIMIT_EXCEEDED') {
                const error = new APIError(429, data.message, {
                  errorType: data.errorType,
                  needed: data.needed,
                  available: data.available,
                  currentPlan: data.currentPlan
                });
                reject(error);
              } else {
                reject(new Error(data.message || 'Search failed'));
              }
              break;
          }
        } catch (parseError) {
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('fail', 'EventSource parse error', parseError.message);
          }
        }
      };

      eventSource.onerror = (error) => {
        if (eventSource.readyState === EventSource.CONNECTING) {
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('buffer', 'EventSource reconnecting...');
          }
          return;
        }
        
        if (!isComplete) {
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('fail', 'Search error: EventSource connection failed');
          }
          cleanup();
          reject(new Error('Connection lost - search interrupted'));
        }
      };
    });
  }

  handleCachePhase(data) {
    this.state.emit('searchPhase', {
      phase: 'cache',
      message: data.message,
      progress: 0
    });
  }

  handleCacheComplete(data) {
    this.state.emit('searchPhase', {
      phase: 'cache-complete',
      count: data.count,
      progress: 30
    });
  }

  handleQueuedPhase(data, queuedDomains) {
    const domain = data.domain;
    if (domain) {
      queuedDomains.add(domain);
    }
    
    const position = data.position || 'unknown';
    const waitTime = data.estimatedWaitMinutes || 'unknown';
    
    this.state.emit('searchPhase', {
      phase: 'queued',
      message: `${domain || 'Domain'} in queue (position ${position})`,
      progress: 10,
      domain: domain,
      queuePosition: position,
      estimatedWaitMinutes: waitTime,
      totalQueued: queuedDomains.size
    });
    
    if (window.clientConfig?.smartLog) {
      window.clientConfig.smartLog('queue', `Domain ${domain} queued at position ${position}, estimated wait: ${waitTime} minutes`);
    }
  }

  handleScrapingPhase(data) {
    this.state.emit('searchPhase', {
      phase: 'scraping',
      message: data.message,
      progress: 35
    });
  }

  handleScrapingProgress(data, queuedDomains) {
    const domain = data.url ? new URL(data.url).hostname : data.url;
    if (domain && queuedDomains.has(domain)) {
      queuedDomains.delete(domain);
    }
    
    const progress = data.progress ? data.progress.split('/') : [0, 1];
    const percent = 30 + (parseInt(progress[0]) / parseInt(progress[1]) * 70);
    
    this.state.emit('searchPhase', {
      phase: 'scraping-progress',
      progress: percent,
      url: data.url,
      wasBuffered: data.source === 'cache-notification' || data.source === 'buffer',
      source: data.source,
      progressText: data.progress
    });
  }

  async performLiveSearch(searchData) {
    try {
      this.state.setSearchProgress(true, { searchType: 'live' });
      
      const searchParams = {
        jobTitles: JSON.stringify(searchData.jobTitles),
        careerPages: JSON.stringify(searchData.careerPages)
      };

      const response = await this.createEventSourceSearch(searchParams);
      
      this.state.setSearchProgress(false, { results: response.results });
      
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('win', `Live search completed: ${response.results.length} results from ${response.totalProcessed} domains`);
      }
      
      return response;
    } catch (error) {
      this.state.setSearchProgress(false);
      
      if (error instanceof APIError && error.status === 429) {
        this.handleLimitExceeded(error.data);
        throw error;
      }
      
      throw error;
    }
  }

  handleLimitExceeded(errorData) {
    this.state.emit('limitExceeded', {
      errorType: errorData.errorType,
      needed: errorData.needed,
      available: errorData.available,
      currentPlan: errorData.currentPlan
    });
  }

  cancelAllRequests() {
    for (const [requestId, request] of this.activeRequests) {
      try {
        request.controller.abort();
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Error aborting request ${requestId}`, error.message);
        }
      }
    }
    
    this.activeRequests.clear();
    this.state.closeEventSource();
    
    if (window.clientConfig?.smartLog) {
      window.clientConfig.smartLog('buffer', 'All API requests cancelled');
    }
  }

  getActiveRequestsCount() {
    return this.activeRequests.size;
  }

  getRequestStats() {
    const stats = {
      active: this.activeRequests.size,
      retrying: this.retryQueue.size,
      avgDuration: 0
    };

    if (this.activeRequests.size > 0) {
      const now = Date.now();
      let totalDuration = 0;
      
      for (const request of this.activeRequests.values()) {
        totalDuration += now - request.startTime;
      }
      
      stats.avgDuration = Math.round(totalDuration / this.activeRequests.size);
    }

    return stats;
  }
}

class APIError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

if (typeof window !== 'undefined') {
  window.JobSearchAPI = JobSearchAPI;
  window.APIError = APIError;
}