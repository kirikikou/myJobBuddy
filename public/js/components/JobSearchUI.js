class JobSearchUI {
    constructor(stateManager, validator) {
      this.state = stateManager;
      this.validator = validator;
      this.elements = {};
      this.eventListeners = new Map();
      this.countdownInterval = null;
      this.progressAnimations = new Map();
      
      this.selectors = {
        jobTitlesContainer: '#jobTitlesContainer',
        jobTitleInput: '#jobTitleInput',
        careerUrlsContainer: '#careerUrlsContainer',
        careerUrlInput: '#careerUrlInput',
        searchButton: '#search-jobs-action',
        cacheButton: '#search-cache-only-action',
        resultsContainer: '#resultsContainer',
        resultsCount: '#resultsCount',
        loadingIndicator: '#loadingIndicator',
        listSelector: '#listSelector',
        exportButton: '#exportJobResults',
        statusBar: '#searchStatusBar',
        remainingText: '#remainingSearchesText',
        siteButtons: '.site-buttons .site-button',
        careerPagesContainer: '#careerPagesContainer',
        filtersContainer: '#resultsFilters'
      };
  
      this.templates = {
        tag: (content, type = 'default') => `
          <div class="tag ${type}-tag" tabindex="0">
            ${content}
            <span class="tag-close">x</span>
          </div>
        `,
        
        favoriteTag: (content, company) => `
          <div class="tag favorite-tag" tabindex="0">
            ${content}
            <span class="tag-badge favorite-badge" title="Click to hide from list" data-company="${company}">
              <i class="fas fa-star" style="color: #f1c40f; font-size: 0.8rem;"></i>
            </span>
            <span class="tag-close" title="Delete favorite permanently">x</span>
          </div>
        `,
        
        selectionTag: (content, selection, company) => {
          const colors = { A: '#e74c3c', B: '#3498db', C: '#2ecc71' };
          return `
            <div class="tag selection-tag" data-selection="${selection}" tabindex="0">
              ${content}
              <span class="tag-badge selection-badge" title="Click to hide selection ${selection} from list" data-company="${company}" data-selection="${selection}">
                <i class="fas fa-tag" style="color: ${colors[selection]}; font-size: 0.8rem;"></i>
                <span style="color: ${colors[selection]}; font-size: 0.7rem; font-weight: bold; margin-left: 2px;">${selection}</span>
              </span>
              <span class="tag-close" title="Remove from selection ${selection} permanently">x</span>
            </div>
          `;
        },
  
        resultItem: (result) => {
          const title = result.title?.trim() || '';
          const date = result.date || '';
          const source = this.validator.extractCleanDomain(result.url || '');
          const description = result.description?.trim() || '';
          const jobUrl = result.url || '';
          const isOld = this.isOldCacheResult(result);
  
          return `
            <div class="result-item ${isOld ? 'old-cache-result' : ''}" ${isOld ? 'style="border-left: 4px solid #ff4757; background: rgba(255, 71, 87, 0.05);"' : ''}>
              <div class="result-title">
                ${jobUrl ? `<a href="${jobUrl}" target="_blank" style="color: inherit; text-decoration: none;">${title}</a>` : title}
                ${isOld ? '<span style="color: #ff4757; font-size: 0.8rem; margin-left: 8px; background: rgba(255, 71, 87, 0.1); padding: 2px 6px; border-radius: 4px;">Old Cache (>30 days)</span>' : ''}
              </div>
              <div class="result-meta">
                ${date ? `<span><i class="fas fa-clock"></i> ${date}</span>` : ''}
                ${source ? `<span><i class="fas fa-globe"></i> ${source}</span>` : ''}
              </div>
              ${description ? `<div class="result-snippet">${description}</div>` : ''}
              <div style="margin-top: 12px; display: flex; gap: 8px;">
                ${jobUrl ? `
                  <a href="${jobUrl}" target="_blank" class="btn btn-primary" style="padding: 8px 14px; font-size: 0.8rem;">
                    <i class="fas fa-external-link-alt"></i> Apply
                  </a>
                ` : ''}
                <button class="btn btn-outline add-to-applications-btn" style="padding: 8px 14px; font-size: 0.8rem;" 
                  data-title="${title}"
                  data-company="${this.validator.extractCompanyFromDomain(source)}" 
                  data-career="${jobUrl}">
                  <i class="fas fa-plus"></i> Add to applications
                </button>
              </div>
            </div>
          `;
        },
  
        loadingSpinner: (title, message, domainsCount, jobTitles) => `
          <div class="advanced-loading-container">
            <div class="loading-header">
              <div class="search-icon-container">
                <i class="fas fa-search search-icon-main"></i>
                <div class="search-pulse"></div>
              </div>
              <div class="loading-text">
                <h3>${title}</h3>
                <p>Analyzing ${domainsCount} domains for "${jobTitles.join('", "')}"</p>
              </div>
            </div>
            
            <div class="countdown-display">
              <div class="circular-progress">
                <svg class="progress-ring" width="120" height="120">
                  <circle class="progress-ring-background" cx="60" cy="60" r="50"></circle>
                  <circle class="progress-ring-progress" cx="60" cy="60" r="50"></circle>
                </svg>
                <div class="progress-content">
                  <div class="time-remaining" id="timeDisplay">
                    <span class="minutes">0</span>
                    <span class="separator">:</span>
                    <span class="seconds">00</span>
                  </div>
                  <div class="progress-label">estimated</div>
                </div>
              </div>
            </div>
            
            <div class="loading-stats">
              <div class="stat-item">
                <i class="fas fa-globe"></i>
                <span class="stat-value">${domainsCount}</span>
                <span class="stat-label">domains</span>
              </div>
              <div class="stat-item">
                <i class="fas fa-clock"></i>
                <span class="stat-value">${Math.floor((domainsCount * 15) / 60)}m</span>
                <span class="stat-label">estimated</span>
              </div>
              <div class="stat-item">
                <i class="fas fa-briefcase"></i>
                <span class="stat-value">${jobTitles.length}</span>
                <span class="stat-label">job titles</span>
              </div>
            </div>
            
            <div class="loading-progress-bar">
              <div class="progress-bar-fill" id="progressBarFill"></div>
              <div class="progress-bar-text" id="progressBarText">Initializing search...</div>
            </div>
            
            <div class="loading-dots">
              <div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
            </div>
          </div>
        `,
  
        emptyResults: (message, icon = 'search') => `
          <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
            <i class="fas fa-${icon}" style="font-size: 2rem; opacity: 0.3; margin-bottom: var(--space-sm); display: block;"></i>
            <p>${message}</p>
          </div>
        `,
  
        limitExceededModal: (limitType, needed, available, currentPlan) => {
          const planColors = { free: '#6c757d', standard: '#4f6df5', pro: '#8d67f7' };
          const planColor = planColors[currentPlan] || '#6c757d';
          
          return `
            <div style="text-align: center;">
              <div style="margin-bottom: 24px;">
                <div style="display: inline-block; background: rgba(255, 71, 87, 0.1); border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                  <i class="fas fa-chart-bar" style="color: #ff4757; font-size: 2.5rem;"></i>
                </div>
              </div>
              
              <h4 style="color: rgba(255, 255, 255, 0.9); margin-bottom: 16px; font-size: 1.2rem;">
                <strong>${limitType}</strong> limit reached for your 
                <span style="background: ${planColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.9rem; text-transform: uppercase; font-weight: 600; margin: 0 4px;">${currentPlan}</span> 
                plan
              </h4>
              
              <div style="background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid rgba(255, 255, 255, 0.05);">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: center;">
                  <div>
                    <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.9rem; margin-bottom: 8px;">Credits Needed</div>
                    <div style="color: #ff4757; font-size: 2rem; font-weight: 700;">${needed}</div>
                  </div>
                  <div>
                    <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.9rem; margin-bottom: 8px;">Credits Available</div>
                    <div style="color: ${available > 0 ? '#2ed573' : '#ff4757'}; font-size: 2rem; font-weight: 700;">${available}</div>
                  </div>
                </div>
              </div>
              
              <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 24px; line-height: 1.5; font-size: 1rem;">
                ${currentPlan === 'pro' ? 
                  'You have reached your daily credit limit. Credits reset at midnight.' :
                  'Upgrade your plan to get more credits and unlock unlimited searching power!'
                }
              </p>
              
              <div style="display: flex; justify-content: ${currentPlan === 'pro' ? 'center' : 'space-between'}; gap: 12px;">
                ${currentPlan !== 'pro' ? `
                  <button class="upgrade-btn btn btn-primary" style="flex: 1;">
                    <i class="fas fa-arrow-up"></i> Upgrade Plan
                  </button>
                ` : ''}
                <button class="cancel-btn btn btn-secondary" style="${currentPlan === 'pro' ? 'flex: 1; ' : ''}">
                  <i class="fas fa-times"></i> ${currentPlan === 'pro' ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
          `;
        }
      };
  
      this.bindMethods();
      this.cacheElements();
      this.setupGlobalEventListeners();
    }
  
    bindMethods() {
      this.handleTagDelete = this.handleTagDelete.bind(this);
      this.handleKeyboardNavigation = this.handleKeyboardNavigation.bind(this);
      this.handleInputSubmit = this.handleInputSubmit.bind(this);
    }
  
    cacheElements() {
      for (const [key, selector] of Object.entries(this.selectors)) {
        if (selector.startsWith('.')) {
          this.elements[key] = document.querySelectorAll(selector);
        } else {
          this.elements[key] = document.querySelector(selector);
        }
      }
    }
  
    setupGlobalEventListeners() {
      document.addEventListener('keydown', this.handleKeyboardNavigation);
      document.addEventListener('click', this.handleGlobalClick.bind(this));
      
      this.state.subscribe('stateChanged', this.onStateChanged.bind(this));
      this.state.subscribe('searchPhase', this.onSearchPhase.bind(this));
      this.state.subscribe('limitExceeded', this.onLimitExceeded.bind(this));
    }
  
    onStateChanged({ newState, changes }) {
      if (changes.includes('allResults') || changes.includes('filteredResults')) {
        this.updateResultsDisplay();
      }
      
      if (changes.includes('searchInProgress')) {
        this.updateSearchButtons(newState.searchInProgress);
      }
      
      if (changes.includes('userPlan')) {
        this.updateExportButtonVisibility(newState.userPlan);
      }
    }
  
    onSearchPhase(data) {
      switch (data.phase) {
        case 'cache':
          this.updateProgressText(data.message);
          break;
        case 'cache-complete':
          this.updateProgressBar(data.progress);
          this.showToast('info', `${data.count} results from cache`, 3000);
          break;
        case 'scraping-progress':
          this.updateProgressBar(data.progress);
          this.updateProgressText(`Processing ${data.progressText} - ${this.validator.extractShortDomain(data.url)}`);
          if (data.wasBuffered) {
            this.showToast('success', `${this.validator.extractShortDomain(data.url)} via buffer`, 2000);
          }
          break;
      }
    }
  
    onLimitExceeded(data) {
      this.showLimitExceededModal(data.errorType, data.needed, data.available, data.currentPlan);
    }
  
    handleGlobalClick(event) {
      const tag = event.target.closest('.tag');
      if (tag) {
        this.selectTag(tag);
        return;
      }
      
      const tagClose = event.target.closest('.tag-close');
      if (tagClose) {
        event.preventDefault();
        event.stopPropagation();
        this.handleTagDelete(tagClose.closest('.tag'));
        return;
      }
      
      this.clearTagSelection();
    }
  
    handleKeyboardNavigation(event) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        this.handleDeleteKey(event);
      }
    }
  
    handleDeleteKey(event) {
      const selectedTags = document.querySelectorAll('.tag.selected');
      if (selectedTags.length > 0) {
        selectedTags.forEach(tag => this.handleTagDelete(tag));
        this.clearTagSelection();
        event.preventDefault();
        return;
      }
  
      const activeElement = document.activeElement;
      const jobTitleInput = this.elements.jobTitleInput;
      const careerUrlInput = this.elements.careerUrlInput;
  
      if (activeElement && (activeElement === jobTitleInput || activeElement === careerUrlInput)) {
        const input = activeElement;
        const cursorPosition = input.selectionStart;
        const inputValue = input.value;
  
        if (cursorPosition === 0 && inputValue.length === 0) {
          event.preventDefault();
          
          let container;
          if (activeElement === jobTitleInput) {
            container = this.elements.jobTitlesContainer;
          } else if (activeElement === careerUrlInput) {
            container = this.elements.careerUrlsContainer;
          }
  
          if (container) {
            const tags = container.querySelectorAll('.tag');
            if (tags.length > 0) {
              const lastTag = tags[tags.length - 1];
              this.handleTagDelete(lastTag);
            }
          }
        }
      }
    }
  
    handleInputSubmit(event, type) {
      if (event.key === 'Enter') {
        event.preventDefault();
        const value = event.target.value.trim();
        
        if (!value) return;
        
        if (type === 'jobTitle') {
          this.addJobTitle(value);
        } else if (type === 'careerUrl') {
          this.addCareerUrl(value);
        }
        
        event.target.value = '';
      }
    }
  
    selectTag(tag) {
      this.clearTagSelection();
      tag.classList.add('selected');
    }
  
    clearTagSelection() {
      document.querySelectorAll('.tag.selected').forEach(tag => {
        tag.classList.remove('selected');
      });
    }
  
    handleTagDelete(tag) {
      if (!tag) return;
      
      const container = tag.parentNode;
      let tagText = this.extractTagText(tag);
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', `Deleting tag: ${tagText}`);
      }
  
      if (container.id === 'jobTitlesContainer') {
        this.deleteJobTitle(tagText, tag);
      } else if (container.id === 'careerUrlsContainer') {
        this.deleteCareerUrl(tagText, tag);
      }
    }
  
    extractTagText(tag) {
      if (tag.classList.contains('favorite-tag') || tag.classList.contains('selection-tag')) {
        return tag.childNodes[0].textContent.trim();
      } else {
        const closeBtn = tag.querySelector('.tag-close');
        if (closeBtn) {
          return tag.textContent.replace(closeBtn.textContent, '').trim();
        } else {
          return tag.textContent.replace(/x$/, '').trim();
        }
      }
    }
  
    addJobTitle(title) {
      if (!window.userData?.jobTitles) {
        window.userData.jobTitles = [];
      }
      
      if (!window.userData.jobTitles.includes(title)) {
        window.userData.jobTitles.push(title);
        this.saveUserData();
        this.populateJobTitles();
        
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('win', `Job title added: ${title}`);
        }
      }
    }
  
    deleteJobTitle(title, tag) {
      if (!window.userData?.jobTitles) return;
      
      const originalLength = window.userData.jobTitles.length;
      window.userData.jobTitles = window.userData.jobTitles.filter(t => t !== title);
      
      if (window.userData.jobTitles.length !== originalLength) {
        tag.remove();
        this.saveUserData();
        
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('win', `Job title deleted: ${title}`);
        }
      }
    }
  
    addCareerUrl(url) {
      try {
        const validatedUrl = this.validator.validateAndFixUrl(url);
        const activeList = this.getCurrentActiveList();
        
        if (!window.userData?.careerPageLists?.[activeList]) {
          if (!window.userData.careerPageLists) window.userData.careerPageLists = {};
          window.userData.careerPageLists[activeList] = [];
        }
        
        if (!window.userData.careerPageLists[activeList].some(page => page.url === validatedUrl)) {
          window.userData.careerPageLists[activeList].push({ url: validatedUrl });
          this.saveUserData();
          this.populateCareerPages();
          this.showToast('success', `Added URL to ${activeList.toUpperCase()}`);
        }
      } catch (error) {
        this.showValidationError('careerUrlError', 'Please enter a valid URL');
      }
    }
  
    deleteCareerUrl(url, tag) {
      const activeList = this.getCurrentActiveList();
      
      if (tag.classList.contains('favorite-tag') || tag.classList.contains('selection-tag')) {
        this.handleSpecialTagDelete(tag, url);
        return;
      }
      
      if (!window.userData?.careerPageLists?.[activeList]) return;
      
      const originalLength = window.userData.careerPageLists[activeList].length;
      window.userData.careerPageLists[activeList] = window.userData.careerPageLists[activeList].filter(p => p.url !== url);
      
      if (window.userData.careerPageLists[activeList].length !== originalLength) {
        tag.remove();
        this.saveUserData();
        
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('win', `Career URL deleted from ${activeList}: ${url}`);
        }
      }
    }
  
    handleSpecialTagDelete(tag, url) {
      if (tag.classList.contains('favorite-tag')) {
        this.handleFavoriteTagDelete(url);
      } else if (tag.classList.contains('selection-tag')) {
        const selection = tag.getAttribute('data-selection');
        this.handleSelectionTagDelete(url, selection);
      }
    }
  
    handleFavoriteTagDelete(url) {
      const company = Object.values(window.userData.companies || {}).find(comp => 
        comp.favorite && (comp.career === url || comp.website === url || comp.linkedin === url)
      );
      
      if (company) {
        this.showConfirmDialog(
          'Delete Favorite Company',
          `Are you sure you want to permanently delete "${company.name}" from your favorites?`,
          () => {
            company.favorite = false;
            this.populateCareerPages();
            this.saveUserData();
            this.showToast('success', `${company.name} deleted from favorites`);
          }
        );
      }
    }
  
    handleSelectionTagDelete(url, selection) {
      const company = Object.values(window.userData.companies || {}).find(comp => 
        comp.selection === selection && (comp.career === url || comp.website === url || comp.linkedin === url)
      );
      
      if (company) {
        this.showConfirmDialog(
          `Delete Selection ${selection} Company`,
          `Are you sure you want to permanently delete "${company.name}" from selection ${selection}?`,
          () => {
            company.selection = '';
            this.populateCareerPages();
            this.saveUserData();
            this.showToast('success', `${company.name} removed from selection ${selection}`);
          }
        );
      }
    }
  
    populateJobTitles() {
      const container = this.elements.jobTitlesContainer;
      const input = this.elements.jobTitleInput;
      if (!container || !input || !window.userData?.jobTitles) return;
  
      container.querySelectorAll('.tag').forEach(tag => tag.remove());
  
      window.userData.jobTitles.forEach(title => {
        const tagElement = this.createTagElement(this.templates.tag(title));
        container.insertBefore(tagElement, input);
      });
    }
  
    populateCareerPages() {
      const container = this.elements.careerUrlsContainer;
      const input = this.elements.careerUrlInput;
      if (!container || !input) return;
  
      container.querySelectorAll('.tag').forEach(tag => tag.remove());
  
      this.addListUrls(container, input);
      this.addFavoriteUrls(container, input);
      this.addSelectionUrls(container, input);
    }
  
    addListUrls(container, input) {
      const activeList = this.getCurrentActiveList();
      const currentUrls = window.userData?.careerPageLists?.[activeList] || [];
  
      currentUrls.forEach(page => {
        const tagElement = this.createTagElement(this.templates.tag(page.url));
        container.insertBefore(tagElement, input);
      });
    }
  
    addFavoriteUrls(container, input) {
      if (!window.userData?.showFavoritesInCareerList) return;
  
      const favoriteCompanies = Object.values(window.userData.companies || {})
        .filter(company => company.favorite && (company.career || company.website || company.linkedin));
  
      favoriteCompanies.forEach(company => {
        const careerUrl = company.career || company.website || company.linkedin;
        const cleanUrl = careerUrl.replace(/^https?:\/\/(www\.)?/, '').split('?')[0].split('#')[0];
        const tagElement = this.createTagElement(this.templates.favoriteTag(cleanUrl, company.name));
        container.insertBefore(tagElement, input);
      });
    }
  
    addSelectionUrls(container, input) {
      ['A', 'B', 'C'].forEach(selection => {
        if (!window.userData?.[`showSelection${selection}InCareerList`]) return;
  
        const selectionCompanies = Object.values(window.userData.companies || {})
          .filter(company => company.selection === selection && (company.career || company.website || company.linkedin));
  
        selectionCompanies.forEach(company => {
          const careerUrl = company.career || company.website || company.linkedin;
          const cleanUrl = careerUrl.replace(/^https?:\/\/(www\.)?/, '').split('?')[0].split('#')[0];
          const tagElement = this.createTagElement(this.templates.selectionTag(cleanUrl, selection, company.name));
          container.insertBefore(tagElement, input);
        });
      });
    }
  
    createTagElement(html) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      return wrapper.firstElementChild;
    }
  
    updateResultsDisplay() {
      const { filteredResults } = this.state.getState();
      const container = this.elements.resultsContainer;
      const count = this.elements.resultsCount;
      
      if (!container || !count) return;
  
      count.textContent = `(${filteredResults.length} results)`;
  
      if (filteredResults.length === 0) {
        container.innerHTML = this.templates.emptyResults('No results match your current filters.');
        return;
      }
  
      container.innerHTML = '';
      filteredResults.forEach(result => {
        const resultElement = document.createElement('div');
        resultElement.innerHTML = this.templates.resultItem(result);
        container.appendChild(resultElement.firstElementChild);
      });
  
      this.setupResultsEventListeners();
    }
  
    setupResultsEventListeners() {
      const buttons = document.querySelectorAll('.add-to-applications-btn');
      buttons.forEach(button => {
        button.addEventListener('click', (event) => {
          const jobTitle = button.getAttribute('data-title') || '';
          const companyName = button.getAttribute('data-company') || '';
          const career = button.getAttribute('data-career') || '';
          
          this.state.emit('addToApplications', { jobTitle, companyName, career });
        });
      });
    }
  
    showLoadingSpinner(title, message, domainsCount, jobTitles) {
      const indicator = this.elements.loadingIndicator;
      if (!indicator) return;
  
      indicator.style.display = 'block';
      indicator.innerHTML = this.templates.loadingSpinner(title, message, domainsCount, jobTitles);
  
      this.startCountdown(domainsCount * 15);
    }
  
    hideLoadingSpinner() {
      const indicator = this.elements.loadingIndicator;
      if (!indicator) return;
  
      indicator.style.display = 'none';
      this.stopCountdown();
    }
  
    startCountdown(totalSeconds) {
      let remainingSeconds = totalSeconds;
      const originalTotal = totalSeconds;
  
      this.countdownInterval = setInterval(() => {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
  
        const timeDisplay = document.querySelector('#timeDisplay');
        if (timeDisplay) {
          timeDisplay.querySelector('.minutes').textContent = minutes;
          timeDisplay.querySelector('.seconds').textContent = seconds.toString().padStart(2, '0');
        }
  
        const progressPercent = ((originalTotal - remainingSeconds) / originalTotal) * 100;
        this.updateCircularProgress(progressPercent);
  
        remainingSeconds--;
  
        if (remainingSeconds < 0) {
          this.stopCountdown();
          this.showWaitingState();
        }
      }, 1000);
    }
  
    stopCountdown() {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }
  
    updateCircularProgress(percent) {
      const progressRing = document.querySelector('.progress-ring-progress');
      if (progressRing) {
        const circumference = 2 * Math.PI * 50;
        const offset = circumference - (percent / 100) * circumference;
        progressRing.style.strokeDashoffset = offset;
      }
    }
  
    updateProgressBar(percent) {
      const progressBar = document.querySelector('#progressBarFill');
      if (progressBar) {
        progressBar.style.width = percent + '%';
      }
    }
  
    updateProgressText(text) {
      const progressText = document.querySelector('#progressBarText');
      if (progressText) {
        progressText.textContent = text;
      }
    }
  
    showWaitingState() {
      const indicator = this.elements.loadingIndicator;
      if (!indicator) return;
  
      indicator.innerHTML = `
        <div class="advanced-loading-container">
          <div class="loading-header">
            <div class="search-icon-container">
              <i class="fas fa-hourglass-half search-icon-main waiting-icon"></i>
              <div class="search-pulse waiting-pulse"></div>
            </div>
            <div class="loading-text">
              <h3 class="waiting-for-results">Processing Results</h3>
              <p>Your search is taking longer than expected...</p>
            </div>
          </div>
          <p style="margin-top: 20px; color: rgba(255, 255, 255, 0.6);">
            The results will appear automatically when ready.
          </p>
          <div class="loading-dots waiting-dots">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
          </div>
        </div>
      `;
    }
  
    updateSearchButtons(inProgress) {
      const searchButton = this.elements.searchButton;
      const cacheButton = this.elements.cacheButton;
  
      if (searchButton) {
        searchButton.disabled = inProgress;
        searchButton.style.opacity = inProgress ? '0.6' : '1';
      }
  
      if (cacheButton) {
        cacheButton.disabled = inProgress;
        cacheButton.style.opacity = inProgress ? '0.6' : '1';
      }
    }
  
    updateExportButtonVisibility(userPlan) {
      const exportButton = this.elements.exportButton;
      if (!exportButton) return;
  
      if (userPlan === 'theSentinel') {
        exportButton.style.display = 'block';
      } else {
        exportButton.style.display = 'none';
      }
    }
  
    showToast(type, message, duration = 3000) {
      if (window.showToast) {
        window.showToast(type, message, { duration });
      }
    }
  
    showConfirmDialog(title, message, onConfirm) {
      if (window.jobSearchModule?.showElegantConfirm) {
        window.jobSearchModule.showElegantConfirm(title, message, onConfirm);
      }
    }
  
    showLimitExceededModal(errorType, needed, available, currentPlan) {
      const content = this.templates.limitExceededModal(errorType, needed, available, currentPlan);
      
      if (window.modalsModule?.openCustomModal) {
        window.modalsModule.openCustomModal('Credit Limit Exceeded', content);
      }
    }
  
    showValidationError(elementId, message) {
      const errorElement = document.getElementById(elementId);
      if (errorElement) {
        errorElement.textContent = message;
        setTimeout(() => {
          errorElement.textContent = '';
        }, 5000);
      }
    }
  
    getCurrentActiveList() {
      return window.userData?.currentActiveList || 'listA';
    }
  
    isOldCacheResult(result) {
      if (!result.cacheAge || !result.date) return false;
      const resultDate = new Date(result.date);
      const daysDiff = (Date.now() - resultDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > 30;
    }
  
    saveUserData() {
      if (window.safeSaveUserPreferences) {
        window.safeSaveUserPreferences(window.userData);
      } else if (window.saveUserData) {
        window.saveUserData();
      }
    }
  
    addEventListener(selector, event, handler) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        element.addEventListener(event, handler);
        
        if (!this.eventListeners.has(element)) {
          this.eventListeners.set(element, []);
        }
        this.eventListeners.get(element).push({ event, handler });
      });
    }
  
    removeAllEventListeners() {
      for (const [element, listeners] of this.eventListeners) {
        listeners.forEach(({ event, handler }) => {
          element.removeEventListener(event, handler);
        });
      }
      this.eventListeners.clear();
    }
  
    destroy() {
      this.removeAllEventListeners();
      this.stopCountdown();
      
      for (const animation of this.progressAnimations.values()) {
        if (animation.cancel) animation.cancel();
      }
      this.progressAnimations.clear();
  
      document.removeEventListener('keydown', this.handleKeyboardNavigation);
      document.removeEventListener('click', this.handleGlobalClick);
    }
  }
  
  if (typeof window !== 'undefined') {
    window.JobSearchUI = JobSearchUI;
  }