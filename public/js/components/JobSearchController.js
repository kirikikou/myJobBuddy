class JobSearchController {
    constructor() {
      this.state = null;
      this.api = null;
      this.ui = null;
      this.validator = null;
      this.isInitialized = false;
      this.initPromise = null;
      this.eventListeners = new Map();
      
      this.config = {
        retryConfig: {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 5000
        },
        timeouts: {
          initialization: 15000,
          userDataLoad: 10000,
          apiRequest: 30000
        },
        polling: {
          userDataCheck: 200,
          maxChecks: 50
        }
      };
  
      this.bindMethods();
    }
  
    bindMethods() {
      this.handleSearch = this.handleSearch.bind(this);
      this.handleCacheSearch = this.handleCacheSearch.bind(this);
      this.handleAddToApplications = this.handleAddToApplications.bind(this);
      this.handleStateChanged = this.handleStateChanged.bind(this);
      this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    }
  
    async initialize() {
      if (this.isInitialized) return this.initPromise;
      if (this.initPromise) return this.initPromise;
  
      this.initPromise = this.performInitialization();
      return this.initPromise;
    }
  
    async performInitialization() {
      const initStartTime = Date.now();
  
      try {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'JobSearchController initialization started');
        }
  
        await this.loadRequiredModules();
        await this.initializeModules();
        await this.waitForUserData();
        await this.setupEventListeners();
        await this.setupUI();
        await this.restoreState();
  
        this.isInitialized = true;
        
        const initDuration = Date.now() - initStartTime;
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('win', `JobSearchController initialized successfully in ${initDuration}ms`);
        }
  
        this.state.setState({ isInitialized: true });
  
      } catch (error) {
        const initDuration = Date.now() - initStartTime;
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `JobSearchController initialization failed after ${initDuration}ms: ${error.message}`);
        }
        throw error;
      }
    }
  
    async loadRequiredModules() {
      const requiredModules = [
        'JobSearchState',
        'JobSearchAPI', 
        'JobSearchUI',
        'JobSearchValidation'
      ];
  
      const missingModules = requiredModules.filter(module => !window[module]);
      
      if (missingModules.length > 0) {
        throw new Error(`Missing required modules: ${missingModules.join(', ')}`);
      }
    }
  
    async initializeModules() {
      try {
        this.validator = new window.JobSearchValidation();
        this.state = new window.JobSearchState();
        this.api = new window.JobSearchAPI(this.state);
        this.ui = new window.JobSearchUI(this.state, this.validator);
  
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'All modules initialized successfully');
        }
      } catch (error) {
        throw new Error(`Module initialization failed: ${error.message}`);
      }
    }
  
    async waitForUserData() {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('User data loading timeout'));
        }, this.config.timeouts.userDataLoad);
  
        let attempts = 0;
        
        const checkData = () => {
          attempts++;
          
          if (window.userData && 
              typeof window.saveUserData === 'function' && 
              window.userData.lastUsed) {
            
            clearTimeout(timeoutId);
            this.state.setState({ isDataReady: true });
            
            if (window.clientConfig?.smartLog) {
              window.clientConfig.smartLog('win', `User data ready after ${attempts} attempts`);
            }
            
            resolve();
          } else if (attempts >= this.config.polling.maxChecks) {
            clearTimeout(timeoutId);
            reject(new Error(`User data not ready after ${attempts} attempts`));
          } else {
            setTimeout(checkData, this.config.polling.userDataCheck);
          }
        };
        
        checkData();
      });
    }
  
    setupEventListeners() {
      this.state.subscribe('stateChanged', this.handleStateChanged);
  
      this.state.subscribe('addToApplications', this.handleAddToApplications);
  
      const searchButton = document.querySelector('#search-jobs-action');
      if (searchButton) {
        searchButton.addEventListener('click', this.handleSearch);
      }
  
      const cacheButton = document.querySelector('#search-cache-only-action');
      if (cacheButton) {
        cacheButton.addEventListener('click', this.handleCacheSearch);
      }
  
      const jobTitleInput = document.querySelector('#jobTitleInput');
      if (jobTitleInput) {
        jobTitleInput.addEventListener('keydown', (event) => {
          this.ui.handleInputSubmit(event, 'jobTitle');
        });
      }
  
      const careerUrlInput = document.querySelector('#careerUrlInput');
      if (careerUrlInput) {
        careerUrlInput.addEventListener('keydown', (event) => {
          this.ui.handleInputSubmit(event, 'careerUrl');
        });
      }
  
      const listSelector = document.querySelector('#listSelector');
      if (listSelector) {
        listSelector.addEventListener('change', this.handleListChange.bind(this));
      }
  
      window.addEventListener('beforeunload', this.handleBeforeUnload);
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', 'Event listeners setup completed');
      }
    }
  
    async setupUI() {
      try {
        this.ensureUserDataStructure();
        this.ui.populateJobTitles();
        this.ui.populateCareerPages();
        this.updateUIButtons();
        await this.updateSearchLimits();
        await this.checkUserPlan();
  
        if (window.uiManager?.translatePage) {
          window.uiManager.translatePage();
        }
  
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `UI setup failed: ${error.message}`);
        }
        throw error;
      }
    }
  
    ensureUserDataStructure() {
      if (!window.userData.jobSearchData) {
        window.userData.jobSearchData = {
          lastSearchResults: [],
          lastSearchDate: null,
          selectedSite: 'career-pages'
        };
      }
  
      if (!window.userData.careerPageLists) {
        window.userData.careerPageLists = {
          listA: [],
          listB: [],
          listC: [],
          listD: [],
          listE: []
        };
      }
  
      if (!window.userData.currentActiveList) {
        window.userData.currentActiveList = 'listA';
      }
  
      ['showFavoritesInCareerList', 'showSelectionAInCareerList', 
       'showSelectionBInCareerList', 'showSelectionCInCareerList'].forEach(key => {
        if (window.userData[key] === undefined) {
          window.userData[key] = key === 'showFavoritesInCareerList';
        }
      });
  
      if (!window.userData.jobTitles) window.userData.jobTitles = [];
      if (!window.userData.companies) window.userData.companies = {};
    }
  
    restoreState() {
      try {
        const savedData = window.userData.jobSearchData;
        
        if (savedData?.lastSearchResults?.length > 0) {
          this.state.updateResults(savedData.lastSearchResults);
          
          if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('buffer', `Restored ${savedData.lastSearchResults.length} previous search results`);
          }
        }
  
        const savedSite = savedData?.selectedSite || 'career-pages';
        this.updateSiteSelection(savedSite);
  
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `State restoration failed: ${error.message}`);
        }
      }
    }
  
    updateSiteSelection(site) {
      const siteButtons = document.querySelectorAll('.site-buttons .site-button');
      siteButtons.forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-site') === site);
      });
  
      const careerPagesContainer = document.querySelector('#careerPagesContainer');
      if (careerPagesContainer) {
        careerPagesContainer.style.display = site === 'career-pages' ? 'block' : 'none';
      }
    }
  
    handleStateChanged({ newState, changes }) {
      if (changes.includes('searchInProgress')) {
        this.updateUIButtons();
      }
    }
  
    updateUIButtons() {
      const { searchInProgress, navigationLock } = this.state.getState();
      const disabled = searchInProgress || navigationLock;
  
      const searchButton = document.querySelector('#search-jobs-action');
      const cacheButton = document.querySelector('#search-cache-only-action');
  
      if (searchButton) {
        searchButton.disabled = disabled;
        searchButton.style.opacity = disabled ? '0.6' : '1';
      }
  
      if (cacheButton) {
        cacheButton.disabled = disabled;
        cacheButton.style.opacity = disabled ? '0.6' : '1';
      }
    }
  
    async handleSearch(event) {
      event.preventDefault();
      event.stopPropagation();
  
      if (!this.state.canPerformAction('search')) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', 'Search blocked - invalid state');
        }
        return;
      }
  
      try {
        const searchData = await this.prepareSearchData();
        const validation = this.validator.validateSearchData(searchData);
  
        if (!validation.isValid) {
          this.showValidationErrors(validation.errors);
          return;
        }
  
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'Starting live search with EventSource');
        }
  
        this.ui.showLoadingSpinner(
          'Searching Job Opportunities',
          'Please wait while we search for opportunities...',
          validation.normalized.careerPages.length,
          validation.normalized.jobTitles
        );
  
        const results = await this.api.performLiveSearch(validation.normalized);
  
        this.ui.hideLoadingSpinner();
        this.saveSearchResults(results);
        this.showSearchSummary(results);
  
      } catch (error) {
        this.ui.hideLoadingSpinner();
        this.handleSearchError(error);
      }
    }
  
    async handleCacheSearch(event) {
      event.preventDefault();
      event.stopPropagation();
  
      if (!this.state.canPerformAction('search')) {
        return;
      }
  
      try {
        const searchData = await this.prepareSearchData();
        searchData.cacheOnly = true;
  
        const validation = this.validator.validateSearchData(searchData);
  
        if (!validation.isValid) {
          this.showValidationErrors(validation.errors);
          return;
        }
  
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'Starting cache-only search');
        }
  
        const results = await this.api.performCacheOnlySearch(validation.normalized);
  
        if (results.limitExceeded) {
          return;
        }
  
        this.saveSearchResults(results);
        this.showSearchSummary(results, 'cache');
  
      } catch (error) {
        this.handleSearchError(error);
      }
    }
  
    async prepareSearchData() {
      const jobTitles = window.userData.jobTitles || [];
      const activeList = window.userData.currentActiveList || 'listA';
      let careerPages = [...(window.userData.careerPageLists[activeList] || []).map(p => p.url)];
  
      if (window.userData.showFavoritesInCareerList) {
        const favoriteUrls = Object.values(window.userData.companies || {})
          .filter(company => company.favorite && (company.career || company.website || company.linkedin))
          .map(company => company.career || company.website || company.linkedin);
        careerPages.push(...favoriteUrls);
      }
  
      ['A', 'B', 'C'].forEach(selection => {
        if (window.userData[`showSelection${selection}InCareerList`]) {
          const selectionUrls = Object.values(window.userData.companies || {})
            .filter(company => company.selection === selection && (company.career || company.website || company.linkedin))
            .map(company => company.career || company.website || company.linkedin);
          careerPages.push(...selectionUrls);
        }
      });
  
      return {
        jobTitles,
        careerPages: [...new Set(careerPages)],
        site: 'career-pages'
      };
    }
  
    saveSearchResults(results) {
      try {
        if (!window.userData.jobSearchData) {
          window.userData.jobSearchData = {};
        }
  
        window.userData.jobSearchData.lastSearchResults = results.results || [];
        window.userData.jobSearchData.lastSearchDate = new Date().toISOString();
        window.userData.jobSearchData.lastSearchType = results.searchType || 'unknown';
  
        if (window.safeSaveUserPreferences) {
          window.safeSaveUserPreferences(window.userData).then(result => {
            if (window.clientConfig?.smartLog && result.success) {
              window.clientConfig.smartLog('win', 'Search results saved successfully');
            }
          });
        }
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Failed to save search results: ${error.message}`);
        }
      }
    }
  
    showSearchSummary(results, type = 'live') {
      const resultsCount = results.results?.length || 0;
      const totalProcessed = results.totalProcessed || 0;
  
      let message;
      if (type === 'cache') {
        message = `Found ${resultsCount} cached results`;
      } else {
        message = `Found ${resultsCount} results from ${totalProcessed} domains`;
      }
  
      this.ui.showToast('success', message, 5000);
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('win', `Search completed: ${message}`);
      }
    }
  
    showValidationErrors(errors) {
      const errorMessage = 'Validation failed: ' + errors.join(', ');
      this.ui.showToast('error', errorMessage);
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', errorMessage);
      }
    }
  
    handleSearchError(error) {
      let message = 'Search failed';
      
      if (error instanceof window.APIError) {
        if (error.status === 429) {
          return;
        }
        message = `Search failed: ${error.message}`;
      } else {
        message = `Search failed: ${error.message}`;
      }
  
      this.ui.showToast('error', message);
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', `Search error: ${error.message}`);
      }
    }
  
    handleAddToApplications(data) {
      const { jobTitle, companyName, career } = data;
      
      if (!companyName) {
        this.ui.showToast('error', 'Company name is required');
        return;
      }
  
      const companyId = this.generateCompanyId(companyName);
      
      if (!window.userData.companies) window.userData.companies = {};
      if (!window.userData.companies[companyId]) window.userData.companies[companyId] = {};
  
      window.userData.companies[companyId].name = companyName;
      window.userData.companies[companyId].career = career;
      window.userData.companies[companyId].type = 'VFX';
      window.userData.companies[companyId].appliedDate = new Date().toISOString().split('T')[0];
  
      if (window.safeSaveUserPreferences) {
        window.safeSaveUserPreferences(window.userData);
      }
  
      this.ui.showToast('success', 'Company added to applications');
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('win', `Company added to applications: ${companyName}`);
      }
  
      setTimeout(() => {
        const applicationTab = document.querySelector('.nav-item[data-page="applications"]');
        if (applicationTab) applicationTab.click();
      }, 500);
    }
  
    handleListChange(event) {
      const selectedList = event.target.value;
      
      window.userData.currentActiveList = selectedList;
      
      if (window.safeSaveUserPreferences) {
        window.safeSaveUserPreferences(window.userData);
      }
      
      this.ui.populateCareerPages();
      this.ui.showToast('info', `Switched to ${selectedList.toUpperCase()}`);
    }
  
    async checkUserPlan() {
      try {
        const planData = await this.api.checkUserPlan();
        
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', `User plan: ${planData.plan}`);
        }
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Failed to check user plan: ${error.message}`);
        }
      }
    }
  
    async updateSearchLimits() {
      try {
        const response = await fetch('/plan/limits');
        const data = await response.json();
        
        if (!data.success) return;
        
        const statusBar = document.querySelector('#searchStatusBar');
        const remainingText = document.querySelector('#remainingSearchesText');
        
        if (!statusBar || !remainingText) return;
        
        const currentPlan = data.plan;
        const canPerformLiveSearch = data.restrictions?.canPerformLiveSearch || false;
        
        statusBar.style.display = 'flex';
        statusBar.className = 'search-status-bar';
        
        if (currentPlan === 'pro') {
          statusBar.classList.add('pro-plan');
        } else if (currentPlan === 'standard') {
          statusBar.classList.add('standard-plan');
        } else {
          statusBar.classList.add('free-plan');
        }
        
        if (currentPlan === 'free') {
          remainingText.textContent = 'Free plan - Cache search only';
        } else if (canPerformLiveSearch) {
          const used = data.usage?.scrapingRequests || 0;
          const limit = data.limits?.maxScrapingRequests || 0;
          const remaining = limit - used;
          
          remainingText.textContent = `${used}/${limit} live searches used`;
          
          if (remaining === 0) {
            statusBar.classList.add('limit-reached');
          } else if (remaining <= 5 && currentPlan !== 'pro') {
            statusBar.classList.add('limit-warning');
          }
        } else {
          remainingText.textContent = 'Cache searches only';
          statusBar.classList.add('free-plan');
        }
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Failed to update search limits: ${error.message}`);
        }
      }
    }
  
    handleBeforeUnload() {
      try {
        this.api.cancelAllRequests();
        
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'JobSearchController cleanup on page unload');
        }
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Cleanup error: ${error.message}`);
        }
      }
    }
  
    generateCompanyId(companyName) {
      return companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 50);
    }
  
    getComponentData() {
      return {
        jobTitles: window.userData.jobTitles || [],
        careerPages: window.userData.careerPages || [],
        locations: window.userData.locations || [],
        companies: window.userData.companies || {},
        jobSearchData: window.userData.jobSearchData || {}
      };
    }
  
    setComponentData(data) {
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', 'Restoring job search component state');
      }
      
      if (!this.state.getStateValue('isDataReady')) {
        setTimeout(() => this.setComponentData(data), 300);
        return;
      }
      
      setTimeout(() => {
        this.ensureUserDataStructure();
        this.ui.populateJobTitles();
        this.ui.populateCareerPages();
        this.restoreState();
      }, 100);
    }
  
    async exportCareerUrls() {
      try {
        const searchData = await this.prepareSearchData();
        const urls = searchData.careerPages;
        
        if (urls.length === 0) {
          this.ui.showToast('warning', 'No URLs to export');
          return;
        }
        
        const csvContent = urls.join(', ');
        
        try {
          await navigator.clipboard.writeText(csvContent);
          this.ui.showToast('success', `Exported ${urls.length} URLs to clipboard`);
        } catch (clipboardError) {
          const textArea = document.createElement('textarea');
          textArea.value = csvContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          this.ui.showToast('success', `Exported ${urls.length} URLs to clipboard (fallback)`);
        }
      } catch (error) {
        this.ui.showToast('error', 'Export failed');
        
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Export error: ${error.message}`);
        }
      }
    }
  
    destroy() {
      try {
        if (this.api) {
          this.api.cancelAllRequests();
        }
  
        if (this.ui) {
          this.ui.destroy();
        }
  
        if (this.state) {
          this.state.resetState();
        }
  
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
  
        const searchButton = document.querySelector('#search-jobs-action');
        if (searchButton) {
          searchButton.removeEventListener('click', this.handleSearch);
        }
  
        const cacheButton = document.querySelector('#search-cache-only-action');
        if (cacheButton) {
          cacheButton.removeEventListener('click', this.handleCacheSearch);
        }
  
        this.eventListeners.clear();
        this.isInitialized = false;
        this.initPromise = null;
  
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'JobSearchController destroyed');
        }
      } catch (error) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('fail', `Destruction error: ${error.message}`);
        }
      }
    }
  }
  
  let globalJobSearchController = null;
  
  async function initJobSearch() {
    try {
      if (globalJobSearchController) {
        return globalJobSearchController;
      }
  
      globalJobSearchController = new JobSearchController();
      await globalJobSearchController.initialize();
  
      window.jobSearchModule = {
        controller: globalJobSearchController,
        getComponentData: () => globalJobSearchController.getComponentData(),
        setComponentData: (data) => globalJobSearchController.setComponentData(data),
        exportCareerUrls: () => globalJobSearchController.exportCareerUrls(),
        destroy: () => {
          if (globalJobSearchController) {
            globalJobSearchController.destroy();
            globalJobSearchController = null;
          }
        }
      };
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('win', 'JobSearch module fully initialized and exposed');
      }
  
      return globalJobSearchController;
    } catch (error) {
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', `JobSearch initialization failed: ${error.message}`);
      }
      throw error;
    }
  }
  
  function cleanupJobSearchModule() {
    if (window.jobSearchModule?.destroy) {
      window.jobSearchModule.destroy();
    }
    globalJobSearchController = null;
    delete window.jobSearchModule;
    
    if (window.clientConfig?.smartLog) {
      window.clientConfig.smartLog('buffer', 'JobSearch module cleaned up');
    }
  }
  
  if (typeof window !== 'undefined') {
    window.JobSearchController = JobSearchController;
    window.initJobSearch = initJobSearch;
    window.cleanupJobSearchModule = cleanupJobSearchModule;
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initJobSearch);
    } else {
      initJobSearch();
    }
  }