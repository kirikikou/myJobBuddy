class ProgressiveSearchManager {
    constructor() {
      this.currentSearchId = null;
      this.eventSource = null;
      this.results = {
        immediate: [],
        progressive: [],
        all: []
      };
      this.searchStats = {
        totalCompanies: 0,
        completedCount: 0,
        foundInCache: 0,
        scrapedCount: 0,
        errorCount: 0,
        totalMatches: 0
      };
      this.isSearching = false;
      this.callbacks = {};
    }
  
    async startProgressiveSearch(companies, jobTitles, locations = [], options = {}) {
      if (this.isSearching) {
        console.warn('Search already in progress');
        return false;
      }
  
      try {
        this.isSearching = true;
        this.clearResults();
        
        this.trigger('searchStarted', { companies: companies.length, jobTitles });
  
        const searchPayload = {
          companies,
          jobTitles,
          locations,
          options: {
            enableProgressiveResults: true,
            strictMode: options.strictMode !== false,
            concurrencyLimit: options.concurrencyLimit || 3,
            ...options
          }
        };
  
        const response = await fetch('/api/progressive-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(searchPayload)
        });
  
        if (!response.ok) {
          throw new Error(`Search request failed: ${response.statusText}`);
        }
  
        const searchResult = await response.json();
        this.currentSearchId = searchResult.searchId;
        
        this.results.immediate = searchResult.immediate.results || [];
        this.results.progressive = searchResult.progressive.results || [];
        this.updateAllResults();
        
        this.searchStats = searchResult.summary || this.searchStats;
  
        this.trigger('immediateResults', {
          results: this.results.immediate,
          count: searchResult.immediate.count,
          totalMatches: searchResult.immediate.totalMatches
        });
  
        if (searchResult.progressive.results.length > 0) {
          this.trigger('progressiveResults', {
            results: this.results.progressive,
            count: searchResult.progressive.count,
            totalMatches: searchResult.progressive.totalMatches
          });
        }
  
        this.setupEventStream();
        
        return searchResult;
  
      } catch (error) {
        console.error('Progressive search error:', error);
        this.isSearching = false;
        this.trigger('searchError', { error: error.message });
        return false;
      }
    }
  
    async startCacheOnlySearch(companies, jobTitles, locations = [], options = {}) {
      try {
        this.clearResults();
        this.trigger('searchStarted', { companies: companies.length, jobTitles, cacheOnly: true });
  
        const searchPayload = {
          companies,
          jobTitles,
          locations,
          options: {
            strictMode: options.strictMode !== false,
            ...options
          }
        };
  
        const response = await fetch('/api/cache-only-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(searchPayload)
        });
  
        if (!response.ok) {
          throw new Error(`Cache-only search failed: ${response.statusText}`);
        }
  
        const searchResult = await response.json();
        
        this.results.immediate = searchResult.results || [];
        this.updateAllResults();
        
        this.searchStats = searchResult.summary || {};
  
        this.trigger('immediateResults', {
          results: this.results.immediate,
          count: searchResult.results.length,
          totalMatches: searchResult.totalMatches,
          cacheStatus: searchResult.cacheStatus
        });
  
        this.trigger('searchCompleted', {
          source: 'cache-only',
          summary: this.searchStats,
          totalResults: this.results.all.length
        });
  
        return searchResult;
  
      } catch (error) {
        console.error('Cache-only search error:', error);
        this.trigger('searchError', { error: error.message });
        return false;
      }
    }
  
    setupEventStream() {
      if (!this.currentSearchId) {
        console.error('No search ID available for event stream');
        return;
      }
  
      this.eventSource = new EventSource(`/api/search-events/${this.currentSearchId}`);
  
      this.eventSource.onopen = () => {
        console.log(`Event stream connected for search ${this.currentSearchId}`);
      };
  
      this.eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('Event stream connected:', data);
      });
  
      this.eventSource.addEventListener('scrapingStarted', (event) => {
        const data = JSON.parse(event.data);
        this.trigger('scrapingStarted', data);
      });
  
      this.eventSource.addEventListener('companyScrapingStarted', (event) => {
        const data = JSON.parse(event.data);
        this.trigger('companyScrapingStarted', data);
      });
  
      this.eventSource.addEventListener('progressiveResult', (event) => {
        const data = JSON.parse(event.data);
        
        this.results.progressive.push(data.result);
        this.updateAllResults();
        this.updateStats(data);
        
        this.trigger('newProgressiveResult', {
          result: data.result,
          progress: data.progress,
          allResults: this.results.all,
          stats: this.searchStats
        });
      });
  
      this.eventSource.addEventListener('companyScrapingError', (event) => {
        const data = JSON.parse(event.data);
        this.updateStats(data);
        
        this.trigger('companyScrapingError', {
          company: data.company,
          error: data.error,
          progress: data.progress,
          stats: this.searchStats
        });
      });
  
      this.eventSource.addEventListener('searchCompleted', (event) => {
        const data = JSON.parse(event.data);
        this.isSearching = false;
        
        this.trigger('searchCompleted', {
          summary: data.summary,
          duration: data.duration,
          totalResults: this.results.all.length,
          stats: this.searchStats
        });
        
        this.closeEventStream();
      });
  
      this.eventSource.addEventListener('searchError', (event) => {
        const data = JSON.parse(event.data);
        this.isSearching = false;
        
        this.trigger('searchError', {
          error: data.error,
          searchId: data.searchId
        });
        
        this.closeEventStream();
      });
  
      this.eventSource.addEventListener('searchCancelled', (event) => {
        const data = JSON.parse(event.data);
        this.isSearching = false;
        
        this.trigger('searchCancelled', {
          searchId: data.searchId
        });
        
        this.closeEventStream();
      });
  
      this.eventSource.onerror = (error) => {
        console.error('Event stream error:', error);
        if (this.eventSource.readyState === EventSource.CLOSED) {
          this.closeEventStream();
        }
      };
    }
  
    async cancelSearch() {
      if (!this.currentSearchId || !this.isSearching) {
        return false;
      }
  
      try {
        const response = await fetch(`/api/cancel-search/${this.currentSearchId}`, {
          method: 'POST'
        });
  
        if (!response.ok) {
          throw new Error(`Cancel request failed: ${response.statusText}`);
        }
  
        this.closeEventStream();
        this.isSearching = false;
        
        this.trigger('searchCancelled', { searchId: this.currentSearchId });
        
        return true;
  
      } catch (error) {
        console.error('Cancel search error:', error);
        return false;
      }
    }
  
    closeEventStream() {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    }
  
    updateStats(data) {
      if (data.progress) {
        this.searchStats.completedCount = data.progress.completed;
        this.searchStats.totalCompanies = data.progress.total;
      }
      
      if (data.result && data.result.matches) {
        this.searchStats.totalMatches += data.result.matches.links.length;
        if (data.result.source === 'scraping') {
          this.searchStats.scrapedCount++;
        }
      }
      
      if (data.error) {
        this.searchStats.errorCount++;
      }
    }
  
    updateAllResults() {
      this.results.all = [
        ...this.results.immediate,
        ...this.results.progressive
      ].sort((a, b) => {
        if (a.matches.priority !== b.matches.priority) {
          return b.matches.priority - a.matches.priority;
        }
        return b.matches.links.length - a.matches.links.length;
      });
    }
  
    clearResults() {
      this.results = {
        immediate: [],
        progressive: [],
        all: []
      };
      this.searchStats = {
        totalCompanies: 0,
        completedCount: 0,
        foundInCache: 0,
        scrapedCount: 0,
        errorCount: 0,
        totalMatches: 0
      };
    }
  
    on(event, callback) {
      if (!this.callbacks[event]) {
        this.callbacks[event] = [];
      }
      this.callbacks[event].push(callback);
    }
  
    off(event, callback) {
      if (this.callbacks[event]) {
        this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
      }
    }
  
    trigger(event, data) {
      if (this.callbacks[event]) {
        this.callbacks[event].forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in event callback for ${event}:`, error);
          }
        });
      }
    }
  
    getSearchProgress() {
      if (!this.searchStats.totalCompanies) return 0;
      return Math.round((this.searchStats.completedCount / this.searchStats.totalCompanies) * 100);
    }
  
    getAllResults() {
      return this.results.all;
    }
  
    getImmediateResults() {
      return this.results.immediate;
    }
  
    getProgressiveResults() {
      return this.results.progressive;
    }
  
    getSearchStats() {
      return { ...this.searchStats };
    }
  
    isCurrentlySearching() {
      return this.isSearching;
    }
  
    getCurrentSearchId() {
      return this.currentSearchId;
    }
  }
  
  // Instance globale
  window.progressiveSearchManager = new ProgressiveSearchManager();
  
  // Fonction d'assistance pour l'interface utilisateur
  function initializeProgressiveSearch(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return null;
    }
  
    const searchManager = window.progressiveSearchManager;
  
    // Configuration des handlers d'événements
    searchManager.on('searchStarted', (data) => {
      updateSearchUI('started', data);
    });
  
    searchManager.on('immediateResults', (data) => {
      displayImmediateResults(container, data);
    });
  
    searchManager.on('newProgressiveResult', (data) => {
      addProgressiveResult(container, data);
    });
  
    searchManager.on('searchCompleted', (data) => {
      updateSearchUI('completed', data);
    });
  
    searchManager.on('searchError', (data) => {
      updateSearchUI('error', data);
    });
  
    searchManager.on('companyScrapingStarted', (data) => {
      updateScrapingProgress(data);
    });
  
    return searchManager;
  }
  
  function updateSearchUI(status, data) {
    const statusElement = document.getElementById('search-status');
    const progressElement = document.getElementById('search-progress');
    const statsElement = document.getElementById('search-stats');
  
    if (statusElement) {
      switch (status) {
        case 'started':
          statusElement.textContent = `Recherche en cours... (${data.companies} entreprises)`;
          statusElement.className = 'search-status searching';
          break;
        case 'completed':
          statusElement.textContent = `Recherche terminée - ${data.totalResults} résultats trouvés`;
          statusElement.className = 'search-status completed';
          break;
        case 'error':
          statusElement.textContent = `Erreur: ${data.error}`;
          statusElement.className = 'search-status error';
          break;
      }
    }
  
    if (progressElement && window.progressiveSearchManager.isCurrentlySearching()) {
      const progress = window.progressiveSearchManager.getSearchProgress();
      progressElement.style.width = `${progress}%`;
      progressElement.textContent = `${progress}%`;
    }
  
    if (statsElement && data.stats) {
      const stats = data.stats;
      statsElement.innerHTML = `
        <div class="stat">Cache: ${stats.foundInCache}</div>
        <div class="stat">Scrapés: ${stats.scrapedCount}</div>
        <div class="stat">Erreurs: ${stats.errorCount}</div>
        <div class="stat">Total matches: ${stats.totalMatches}</div>
      `;
    }
  }
  
  function displayImmediateResults(container, data) {
    const resultsContainer = container.querySelector('.immediate-results') || 
                            createResultsSection(container, 'immediate-results', 'Résultats immédiats (cache)');
    
    data.results.forEach(result => {
      const resultElement = createResultElement(result, 'immediate');
      resultsContainer.appendChild(resultElement);
    });
  
    if (data.results.length > 0) {
      resultsContainer.classList.add('has-results');
    }
  }
  
  function addProgressiveResult(container, data) {
    const resultsContainer = container.querySelector('.progressive-results') || 
                            createResultsSection(container, 'progressive-results', 'Résultats en temps réel');
    
    const resultElement = createResultElement(data.result, 'progressive');
    resultsContainer.appendChild(resultElement);
    
    resultElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    resultsContainer.classList.add('has-results');
  }
  
  function createResultsSection(container, className, title) {
    const section = document.createElement('div');
    section.className = `results-section ${className}`;
    section.innerHTML = `
      <h3 class="results-title">${title}</h3>
      <div class="results-list"></div>
    `;
    container.appendChild(section);
    return section.querySelector('.results-list');
  }
  
  function createResultElement(result, source) {
    const element = document.createElement('div');
    element.className = `result-item ${source}`;
    
    const matchesCount = result.matches.links.length;
    const cacheAge = result.cacheAge ? `(cache: ${result.cacheAge}h)` : '';
    
    element.innerHTML = `
      <div class="result-header">
        <h4 class="company-name">${result.company.name}</h4>
        <span class="result-badge ${source}">${source === 'immediate' ? 'Cache' : 'Nouveau'}</span>
      </div>
      <div class="result-info">
        <span class="matches-count">${matchesCount} offres trouvées</span>
        <span class="source-info">${cacheAge}</span>
      </div>
      <div class="job-titles">
        ${result.matches.jobTitles.map(title => `<span class="job-title">${title}</span>`).join('')}
      </div>
      <div class="result-links">
        ${result.matches.links.slice(0, 3).map(link => `
          <a href="${link.url}" target="_blank" class="job-link">
            ${link.text || 'Voir l\'offre'}
          </a>
        `).join('')}
        ${matchesCount > 3 ? `<span class="more-links">+${matchesCount - 3} autres</span>` : ''}
      </div>
    `;
    
    return element;
  }
  
  function updateScrapingProgress(data) {
    const progressElement = document.getElementById('current-scraping');
    if (progressElement) {
      progressElement.textContent = `Scraping en cours: ${data.company}...`;
    }
  }
  
  // Export pour utilisation dans d'autres fichiers
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ProgressiveSearchManager,
      initializeProgressiveSearch
    };
  }