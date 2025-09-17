class JobSearchState {
    constructor() {
      this.state = {
        isInitialized: false,
        isDataReady: false,
        initRetryCount: 0,
        selectedTags: [],
        currentFocusIndex: -1,
        allResults: [],
        filteredResults: [],
        userPlan: 'free',
        searchInProgress: false,
        countdownActive: false,
        eventSource: null,
        navigationLock: false
      };
      
      this.config = {
        maxRetry: 50,
        debounceDelay: 400,
        retryInterval: 200,
        maxTimeout: 15000
      };
      
      this.listeners = new Map();
      this.stateHistory = [];
      this.maxHistorySize = 10;
    }
  
    subscribe(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(callback);
      
      return () => {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
          eventListeners.delete(callback);
        }
      };
    }
  
    emit(event, data) {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            if (window.clientConfig?.smartLog) {
              window.clientConfig.smartLog('fail', `Event listener error for ${event}`, error.message);
            }
          }
        });
      }
    }
  
    setState(newState, shouldEmit = true) {
      const prevState = { ...this.state };
      this.state = { ...this.state, ...newState };
      
      this.stateHistory.push({
        timestamp: Date.now(),
        prevState,
        newState: { ...this.state },
        changes: Object.keys(newState)
      });
      
      if (this.stateHistory.length > this.maxHistorySize) {
        this.stateHistory.shift();
      }
      
      if (shouldEmit) {
        this.emit('stateChanged', {
          prevState,
          newState: this.state,
          changes: Object.keys(newState)
        });
      }
  
      if (window.clientConfig?.smartLog) {
        const changedKeys = Object.keys(newState).join(', ');
        window.clientConfig.smartLog('buffer', `State updated: ${changedKeys}`);
      }
    }
  
    getState() {
      return { ...this.state };
    }
  
    getStateValue(key) {
      return this.state[key];
    }
  
    resetState() {
      const initialState = {
        isInitialized: false,
        isDataReady: false,
        initRetryCount: 0,
        selectedTags: [],
        currentFocusIndex: -1,
        allResults: [],
        filteredResults: [],
        userPlan: 'free',
        searchInProgress: false,
        countdownActive: false,
        eventSource: null,
        navigationLock: false
      };
      
      this.setState(initialState);
      this.stateHistory = [];
    }
  
    canPerformAction(action) {
      switch (action) {
        case 'search':
          return !this.state.searchInProgress && 
                 !this.state.navigationLock && 
                 this.state.isDataReady;
        case 'navigate':
          return !this.state.navigationLock && 
                 this.state.isInitialized;
        case 'modify_data':
          return this.state.isDataReady && 
                 !this.state.searchInProgress;
        default:
          return true;
      }
    }
  
    lockAction(action, timeout = 5000) {
      const lockKey = `${action}Lock`;
      this.setState({ [lockKey]: true });
      
      setTimeout(() => {
        if (this.state[lockKey]) {
          this.setState({ [lockKey]: false });
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('timeout', `Auto-unlocked ${action} after timeout`);
          }
        }
      }, timeout);
    }
  
    unlockAction(action) {
      const lockKey = `${action}Lock`;
      this.setState({ [lockKey]: false });
    }
  
    setSearchProgress(inProgress, data = {}) {
      this.setState({
        searchInProgress: inProgress,
        ...(inProgress && { searchStartTime: Date.now() }),
        ...(!inProgress && data.results && { 
          allResults: data.results,
          filteredResults: [...data.results]
        }),
        ...data
      });
    }
  
    setEventSource(eventSource) {
      if (this.state.eventSource) {
        try {
          this.state.eventSource.close();
        } catch (error) {
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('fail', 'Error closing previous EventSource', error.message);
          }
        }
      }
      
      this.setState({ eventSource });
    }
  
    closeEventSource() {
      if (this.state.eventSource) {
        try {
          this.state.eventSource.close();
        } catch (error) {
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('fail', 'Error closing EventSource', error.message);
          }
        }
        this.setState({ eventSource: null });
      }
    }
  
    updateResults(newResults, append = false) {
      const allResults = append ? 
        [...this.state.allResults, ...newResults] : 
        newResults;
      
      this.setState({
        allResults,
        filteredResults: [...allResults]
      });
    }
  
    filterResults(filterFn) {
      const filteredResults = this.state.allResults.filter(filterFn);
      this.setState({ filteredResults });
      return filteredResults;
    }
  
    clearResults() {
      this.setState({
        allResults: [],
        filteredResults: []
      });
    }
  
    incrementRetry() {
      const newCount = this.state.initRetryCount + 1;
      this.setState({ initRetryCount: newCount });
      return newCount;
    }
  
    canRetry() {
      return this.state.initRetryCount < this.config.maxRetry;
    }
  
    getRetryDelay() {
      return Math.min(
        this.config.retryInterval * Math.pow(1.5, this.state.initRetryCount),
        2000
      );
    }
  
    getStateHistory() {
      return [...this.stateHistory];
    }
  
    rollbackState(steps = 1) {
      if (this.stateHistory.length === 0) return false;
      
      const targetIndex = Math.max(0, this.stateHistory.length - steps - 1);
      const targetState = this.stateHistory[targetIndex];
      
      if (targetState) {
        this.state = { ...targetState.prevState };
        this.stateHistory = this.stateHistory.slice(0, targetIndex + 1);
        this.emit('stateRolledBack', { steps, targetState });
        return true;
      }
      
      return false;
    }
  
    validateState() {
      const requiredKeys = ['isInitialized', 'isDataReady', 'allResults', 'filteredResults'];
      const missingKeys = requiredKeys.filter(key => !(key in this.state));
      
      if (missingKeys.length > 0) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Invalid state: missing keys ${missingKeys.join(', ')}`);
        }
        return false;
      }
      
      return true;
    }
  
    getConfig(key) {
      return this.config[key];
    }
  
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
      
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', 'JobSearch config updated', Object.keys(newConfig));
      }
    }
  }
  
  if (typeof window !== 'undefined') {
    window.JobSearchState = JobSearchState;
  }