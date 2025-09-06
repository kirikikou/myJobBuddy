(function() {
    let isInitialized = false;
    let isDataReady = false;
    let initRetryCount = 0;
    const MAX_RETRY = 50;
    let selectedTags = [];
    let currentFocusIndex = -1;
    let allResults = [];
    let filteredResults = [];
    let userPlan = 'free';

    function ensureJobSearchDefaults(userData) {
        if (!userData || typeof userData !== 'object') return userData;
        
        userData.careerPageLists ||= {
            listA: [],
            listB: [],
            listC: [],
            listD: [],
            listE: []
        };
        userData.careerPages ||= [];
        userData.jobTitles ||= [];
        userData.locations ||= [];
        userData.companies ||= {};
        userData.currentActiveList ||= 'listA';
        
        if (!userData.jobSearchData) {
            userData.jobSearchData = {
                lastSearchResults: [],
                lastSearchDate: null,
                selectedSite: 'career-pages'
            };
        }
        
        if (userData.showFavoritesInCareerList === undefined) {
            userData.showFavoritesInCareerList = true;
        }
        if (userData.showSelectionAInCareerList === undefined) {
            userData.showSelectionAInCareerList = false;
        }
        if (userData.showSelectionBInCareerList === undefined) {
            userData.showSelectionBInCareerList = false;
        }
        if (userData.showSelectionCInCareerList === undefined) {
            userData.showSelectionCInCareerList = false;
        }
        
        return userData;
    }

    function waitForUserData() {
        return new Promise((resolve) => {
            function checkData() {
                if (window.userData && 
                    typeof window.saveUserData === 'function' && 
                    typeof window.loadUserData === 'function' &&
                    window.userData.lastUsed) {
                    
                    window.clientConfig&&window.clientConfig.smartLog('buffer','UserData is ready:', window.userData);
                    isDataReady = true;
                    resolve();
                } else {
                    initRetryCount++;
                    if (initRetryCount < MAX_RETRY) {
                        window.clientConfig&&window.clientConfig.smartLog('buffer','Waiting for userData... attempt', initRetryCount);
                        setTimeout(checkData, 200);
                    } else {
                        window.clientConfig&&window.clientConfig.smartLog('fail','Failed to load userData after max retries');
                        resolve();
                    }
                }
            }
            checkData();
        });
    }

    function initializeComponentI18n() {
        if (window.uiManager && window.uiManager.isInitialized) {
            window.uiManager.translatePage();
            window.uiManager.onLanguageChange(() => {
                setTimeout(() => {
                    window.uiManager.translatePage();
                }, 100);
            });
        }
    }

    function showLocalizedToast(type, messageKey, params = {}) {
        const message = window.getTranslatedMessage ? 
            window.getTranslatedMessage(messageKey, params) : 
            messageKey;
        showToast(type, message);
    }

    async function initJobSearch() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                updateSearchLimits();
            }
        });
        if (isInitialized) return;
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Starting job search initialization...');
        await waitForUserData();
        
        if (!isDataReady) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Could not initialize job search: userData not ready');
            return;
        }
        
        ensureJobSearchDefaults(userData);
        
        isInitialized = true;
        window.clientConfig&&window.clientConfig.smartLog('buffer','Job search initializing with userData:', userData);
        
        await waitForDOM();
        setupEventListeners();
        setupKeyboardNavigation();
        
        populateAllFields();
        restoreSearchState();
        
        await updateSearchLimits();
        await checkUserPlan();
        initializeComponentI18n();
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Job search initialization complete');
        cleanUserData();
    }
    
    async function safeSaveIfChanged() {
        try {
            const currentUserData = await window.unifiedPreferencesService.get();
            const hasRealChanges = JSON.stringify(currentUserData) !== JSON.stringify(userData);
            
            if (hasRealChanges) {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Real changes detected, saving...');
                await window.safeSaveUserPreferences(userData);
            } else {
                window.clientConfig&&window.clientConfig.smartLog('buffer','No real changes, skipping save');
            }
        } catch (error) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Error in safeSaveIfChanged:', error.message);
        }
    }
        
    window.setComponentData = function(data) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Restoring job search component state');
        
        if (!isDataReady) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Data not ready yet, retrying...');
            setTimeout(() => window.setComponentData(data), 300);
            return;
        }
        
        setTimeout(() => {
            ensureJobSearchDefaults(userData);
            populateAllFields();
            restoreSearchState();
        }, 100);
    };

    async function checkUserPlan() {
        try {
            const response = await fetch('/plan/limits');
            const data = await response.json();
            
            if (data.success) {
                userPlan = data.plan || 'free';
                updateExportButtonVisibility();
            }
        } catch (error) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Error checking user plan:', error);
        }
    }

    function updateExportButtonVisibility() {
        const exportButton = document.getElementById('exportJobResults');
        if (exportButton) {
            if (userPlan === 'theSentinel') {
                exportButton.style.display = 'block';
            } else {
                exportButton.style.display = 'none';
            }
        }
    }

    function extractCleanDomain(url) {
        if (!url) return '';
        
        try {
            const urlObj = new URL(url);
            let domain = urlObj.hostname;
            
            if (domain.startsWith('www.')) {
                domain = domain.substring(4);
            }
            
            const pathParts = urlObj.pathname.split('/').filter(part => part && part.length > 0);
            if (pathParts.length > 0) {
                domain += '/' + pathParts[0];
            }
            
            return domain;
        } catch (e) {
            return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        }
    }
    
    async function performJobSearchWithNotifications() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsCount = document.getElementById('resultsCount');
        
        if (!loadingIndicator || !resultsContainer || !resultsCount) return;
        
        await updateSearchLimits();
        
        loadingIndicator.style.display = 'block';
        resultsContainer.innerHTML = '';
        
        const jobTitles = userData?.jobTitles || [];
        const selectedSiteElement = document.querySelector('.site-buttons .site-button.active');
        if (!selectedSiteElement) return;
        
        const selectedSite = selectedSiteElement.getAttribute('data-site');
        
        if (jobTitles.length === 0) {
          loadingIndicator.style.display = 'none';
          resultsContainer.innerHTML = `
            <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
              <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--warning); margin-bottom: var(--space-sm); display: block;"></i>
              <p>Please add at least one job title to search for.</p>
            </div>
          `;
          showToast('error', 'Please add at least one job title');
          return;
        }
        
        const activeList = getCurrentActiveList();
        const currentUrls = userData?.careerPageLists?.[activeList] || [];
        let favoriteUrls = [];
        let selectionAUrls = [];
        let selectionBUrls = [];
        let selectionCUrls = [];
        
        if (userData?.showFavoritesInCareerList) {
          favoriteUrls = Object.values(userData?.companies || {})
            .filter(company => company?.favorite && (company?.career || company?.website || company?.linkedin))
            .map(company => company.career || company.website || company.linkedin);
        }

        if (userData?.showSelectionAInCareerList) {
          selectionAUrls = Object.values(userData?.companies || {})
            .filter(company => company?.selection === 'A' && (company?.career || company?.website || company?.linkedin))
            .map(company => company.career || company.website || company.linkedin);
        }

        if (userData?.showSelectionBInCareerList) {
          selectionBUrls = Object.values(userData?.companies || {})
            .filter(company => company?.selection === 'B' && (company?.career || company?.website || company?.linkedin))
            .map(company => company.career || company.website || company.linkedin);
        }

        if (userData?.showSelectionCInCareerList) {
          selectionCUrls = Object.values(userData?.companies || {})
            .filter(company => company?.selection === 'C' && (company?.career || company?.website || company?.linkedin))
            .map(company => company.career || company.website || company.linkedin);
        }
        
        const careerUrls = [
          ...currentUrls.map(page => page?.url).filter(Boolean),
          ...favoriteUrls,
          ...selectionAUrls,
          ...selectionBUrls,
          ...selectionCUrls
        ];
        
        const uniqueCareerUrls = [...new Set(careerUrls)];
        
        if (uniqueCareerUrls.length === 0) {
          loadingIndicator.style.display = 'none';
          resultsContainer.innerHTML = `
            <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
              <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--warning); margin-bottom: var(--space-sm); display: block;"></i>
              <p>Please add URLs to ${activeList.toUpperCase()} or show companies with career URLs.</p>
            </div>
          `;
          showToast('error', 'Please add career page URLs or show companies');
          return;
        }
        
        allResults = [];
        filteredResults = [];
        let scrapingStartTime = Date.now();
        let processedDomains = 0;
        
        startIndependentCountdown(uniqueCareerUrls.length * 15, uniqueCareerUrls.length, jobTitles);
        
        const eventSource = new EventSource('/api/search-career-pages-stream?' + new URLSearchParams({
          jobTitles: JSON.stringify(jobTitles),
          careerPages: JSON.stringify(uniqueCareerUrls)
        }));
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          switch (data.phase) {
            case 'cache':
              const progressBarText = document.getElementById('progressBarText');
              if (progressBarText) progressBarText.textContent = data.message;
              break;
              
            case 'cache-complete':
              if (data.results.length > 0) {
                allResults.push(...data.results);
                filteredResults = [...allResults];
                displayResults(filteredResults);
                showFilters();
                resultsCount.textContent = `(${allResults.length} results)`;
              }
              const progressBarFill = document.getElementById('progressBarFill');
              if (progressBarFill) progressBarFill.style.width = '30%';
              showToast('info', `${data.count} results from cache`, 3000);
              break;
              
            case 'scraping':
              const progressBarText2 = document.getElementById('progressBarText');
              if (progressBarText2) progressBarText2.textContent = data.message;
              break;
              
            case 'scraping-progress':
              processedDomains++;
              if (data.results.length > 0) {
                allResults.push(...data.results);
                filteredResults = [...allResults];
                displayResults(filteredResults);
                resultsCount.textContent = `(${allResults.length} results)`;
              }
              const progress = data.progress.split('/');
              const percent = 30 + (parseInt(progress[0]) / parseInt(progress[1]) * 70);
              const progressBarFill2 = document.getElementById('progressBarFill');
              if (progressBarFill2) progressBarFill2.style.width = `${percent}%`;
              const progressBarText3 = document.getElementById('progressBarText');
              if (progressBarText3) progressBarText3.textContent = `Processing ${data.progress} - ${extractShortDomain(data.url)}`;
              
              if (data.wasBuffered) {
                showToast('success', `${extractShortDomain(data.url)} via buffer`, 2000);
              }
              break;
              
            case 'complete':
              eventSource.close();
              stopCountdownTimer();
              loadingIndicator.style.display = 'none';
              
              if (userData?.jobSearchData) {
                userData.jobSearchData.lastSearchResults = allResults;
                userData.jobSearchData.lastSearchDate = new Date().toISOString();
              }
              if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
              
              if (allResults.length === 0) {
                resultsContainer.innerHTML = `
                  <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
                    <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; margin-bottom: var(--space-sm); display: block;"></i>
                    <p>No results found matching your job titles.</p>
                  </div>
                `;
              }
              
              updateExportButtonVisibility();
              showToast('success', `Search complete: ${allResults.length} results from ${data.totalProcessed} domains`, 5000);
              break;
              
            case 'error':
              eventSource.close();
              stopCountdownTimer();
              loadingIndicator.style.display = 'none';
              
              if (data.errorType === 'CACHE_LIMIT_EXCEEDED' || data.errorType === 'SCRAPING_LIMIT_EXCEEDED') {
                showLimitExceededModal(
                  data.errorType === 'CACHE_LIMIT_EXCEEDED' ? 'Cache Search' : 'Live Scraping',
                  data.needed,
                  data.available,
                  userPlan
                );
              } else {
                showToast('error', data.message || 'Search failed');
              }
              break;
          }
        };
        
        eventSource.onerror = (error) => {
          eventSource.close();
          stopCountdownTimer();
          loadingIndicator.style.display = 'none';
          showToast('error', 'Connection lost');
        };
      }

    async function performCacheOnlySearchWithNotifications() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsCount = document.getElementById('resultsCount');
        
        if (!loadingIndicator || !resultsContainer || !resultsCount) return;
        
        await updateSearchLimits();
        
        loadingIndicator.style.display = 'block';
        resultsContainer.innerHTML = '';
        
        const jobTitles = userData?.jobTitles || [];
        const selectedSiteElement = document.querySelector('.site-buttons .site-button.active');
        if (!selectedSiteElement) return;
        
        const selectedSite = selectedSiteElement.getAttribute('data-site');
        
        if (jobTitles.length === 0) {
            loadingIndicator.style.display = 'none';
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--warning); margin-bottom: var(--space-sm); display: block;"></i>
                    <p>Please add at least one job title to search for.</p>
                </div>
            `;
            showToast('error', 'Please add at least one job title');
            return;
        }
        
        if (selectedSite === 'career-pages') {
            const activeList = getCurrentActiveList();
            const currentUrls = userData?.careerPageLists?.[activeList] || [];
            let favoriteUrls = [];
            let selectionAUrls = [];
            let selectionBUrls = [];
            let selectionCUrls = [];
            
            if (userData?.showFavoritesInCareerList) {
                favoriteUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.favorite && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionAInCareerList) {
                selectionAUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'A' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionBInCareerList) {
                selectionBUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'B' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionCInCareerList) {
                selectionCUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'C' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }
            
            const careerUrls = [
                ...currentUrls.map(page => page?.url).filter(Boolean),
                ...favoriteUrls,
                ...selectionAUrls,
                ...selectionBUrls,
                ...selectionCUrls
            ];

            const uniqueCareerUrls = [...new Set(careerUrls)];
            
            if (uniqueCareerUrls.length === 0) {
                loadingIndicator.style.display = 'none';
                resultsContainer.innerHTML = `
                    <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
                        <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--warning); margin-bottom: var(--space-sm); display: block;"></i>
                        <p>Please add URLs to ${activeList.toUpperCase()} or show companies with career URLs.</p>
                    </div>
                `;
                showToast('error', 'Please add career page URLs or show companies');
                return;
            }
        }
        
        try {
            const activeList = getCurrentActiveList();
            const currentUrls = userData?.careerPageLists?.[activeList] || [];
            let favoriteUrls = [];
            let selectionAUrls = [];
            let selectionBUrls = [];
            let selectionCUrls = [];
            
            if (userData?.showFavoritesInCareerList) {
                favoriteUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.favorite && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionAInCareerList) {
                selectionAUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'A' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionBInCareerList) {
                selectionBUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'B' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionCInCareerList) {
                selectionCUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'C' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }
            
            const searchData = {
                jobTitles,
                site: selectedSite,
                careerPages: [
                    ...currentUrls.map(page => page?.url).filter(Boolean),
                    ...favoriteUrls,
                    ...selectionAUrls,
                    ...selectionBUrls,
                    ...selectionCUrls
                ],
                cacheOnly: true
            };

            searchData.careerPages = [...new Set(searchData.careerPages)];
            
            const response = await fetch('/api/search-cache-only', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchData)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                
                if (response.status === 429) {
                    if (errorData.errorType === 'CACHE_LIMIT_EXCEEDED') {
                        showLimitExceededModal('Cache Search', errorData.needed, errorData.available, errorData.currentPlan);
                    }
                    return;
                }
                
                throw new Error(errorData.message || `Request failed (${response.status})`);
            }
            
            const data = await response.json();
            const results = data.results || [];
            
            if (userData?.jobSearchData) {
                userData.jobSearchData.lastSearchResults = results;
                userData.jobSearchData.lastSearchDate = new Date().toISOString();
                userData.jobSearchData.lastSearchType = 'cache_only';
            }
            if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
            
            allResults = results;
            filteredResults = [...allResults];
            
            loadingIndicator.style.display = 'none';
            resultsCount.textContent = `(${results.length} results)`;
            
            if (results.length === 0) {
                resultsContainer.innerHTML = `
                    <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
                        <i class="fas fa-database" style="font-size: 2rem; color: var(--info); margin-bottom: var(--space-sm); display: block;"></i>
                        <p>No cached results found matching your job titles.</p>
                        <p style="margin-top: var(--space-sm); font-size: 0.9rem;">Try using "Search Jobs" for live scraping or different job titles.</p>
                    </div>
                `;
                showToast('info', 'No cached results found');
                return;
            }
            
            displayResults(filteredResults);
            showFilters();
            
            const contextData = {
                domainsNotified: data.domainsNotified || 0,
                domainsScraped: data.domainsScraped || 0,
                domainsCached: data.domainsCached || 0,
                searchType: data.searchType || 'cache_only',
                totalResults: results.length
            };
            
            showContextualMessage('cache_only', contextData);
            
        } catch (error) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Error during cache-only search:', error);
            loadingIndicator.style.display = 'none';
            
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--danger); margin-bottom: var(--space-sm); display: block;"></i>
                    <p>An error occurred during the cache search.</p>
                    <p style="margin-top: var(--space-sm); font-size: 0.9rem;">Error: ${error.message}</p>
                </div>
            `;
            
            showToast('error', 'Cache search failed: ' + error.message);
        }
    }

    let countdownInterval = null;
    let countdownFinished = false;
    let searchResultsReceived = false;
    let pendingResults = null;
    
    function startIndependentCountdown(totalSeconds, domainsCount, jobTitles) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (!loadingIndicator) return;
        
        countdownFinished = false;
        searchResultsReceived = false;
        pendingResults = null;
        
        let remainingSeconds = totalSeconds;
        const originalTotalSeconds = totalSeconds;
        
        loadingIndicator.innerHTML = `
            <div class="advanced-loading-container">
                <div class="loading-header">
                    <div class="search-icon-container">
                        <i class="fas fa-search search-icon-main"></i>
                        <div class="search-pulse"></div>
                    </div>
                    <div class="loading-text">
                        <h3>Searching Job Opportunities</h3>
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
                        <span class="stat-value">${Math.floor(originalTotalSeconds/60)}m</span>
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
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        `;
        
        const progressRingProgress = loadingIndicator.querySelector('.progress-ring-progress');
        const progressBarFill = loadingIndicator.querySelector('#progressBarFill');
        const progressBarText = loadingIndicator.querySelector('#progressBarText');
        
        const updateDisplay = () => {
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            
            const timeDisplay = loadingIndicator.querySelector('#timeDisplay');
            if (timeDisplay) {
                timeDisplay.querySelector('.minutes').textContent = minutes;
                timeDisplay.querySelector('.seconds').textContent = seconds.toString().padStart(2, '0');
            }
            
            const progressPercent = ((originalTotalSeconds - remainingSeconds) / originalTotalSeconds) * 100;
            
            if (progressRingProgress) {
                const circumference = 2 * Math.PI * 50;
                const offset = circumference - (progressPercent / 100) * circumference;
                progressRingProgress.style.strokeDashoffset = offset;
            }
            
            if (progressBarFill) {
                progressBarFill.style.width = progressPercent + '%';
            }
            
            if (progressBarText) {
                const phases = [
                    'Initializing search...',
                    'Connecting to domains...',
                    'Analyzing career pages...',
                    'Extracting job listings...',
                    'Processing results...',
                    'Finalizing search...'
                ];
                const phaseIndex = Math.floor((progressPercent / 100) * phases.length);
                progressBarText.textContent = phases[Math.min(phaseIndex, phases.length - 1)];
            }
            
            remainingSeconds--;
            
            if (remainingSeconds < 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                countdownFinished = true;
                
                if (searchResultsReceived && pendingResults) {
                    window.clientConfig&&window.clientConfig.smartLog('buffer','[COUNTDOWN] Countdown finished - displaying pending results');
                    displayPendingResults();
                } else {
                    window.clientConfig&&window.clientConfig.smartLog('buffer','[COUNTDOWN] Countdown finished - waiting for results');
                    showWaitingForResults();
                }
            }
        };
        
        updateDisplay();
        countdownInterval = setInterval(updateDisplay, 1000);
    }
    
    function showWaitingForResults() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (!loadingIndicator) return;
        
        loadingIndicator.innerHTML = `
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
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        `;
        
        const checkInterval = setInterval(() => {
            if (searchResultsReceived && pendingResults) {
                clearInterval(checkInterval);
                displayPendingResults();
            }
        }, 500);
    }
    
    function stopCountdownTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }
    
    async function handleSearchResults(data) {
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsCount = document.getElementById('resultsCount');
        const loadingIndicator = document.getElementById('loadingIndicator');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        const results = data.results || [];
        
        if (userData?.jobSearchData) {
            userData.jobSearchData.lastSearchResults = results;
            userData.jobSearchData.lastSearchDate = new Date().toISOString();
        }
        
        allResults = results;
        filteredResults = [...allResults];
        
        resultsCount.textContent = `(${results.length} results)`;
        
        if (results.length === 0) {
          resultsContainer.innerHTML = `
            <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
              <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; margin-bottom: var(--space-sm); display: block;"></i>
              <p>No results found matching your job titles.</p>
            </div>
          `;
          return;
        }
        
        displayResults(filteredResults);
        showFilters();
        updateExportButtonVisibility();
    }
    
    async function displayPendingResults() {
        if (!pendingResults) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','[RESULTS] No pending results to display');
            return;
        }
        
        stopCountdownTimer();
        
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','[RESULTS] Displaying results:', pendingResults);
        
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsCount = document.getElementById('resultsCount');
        
        if (!resultsContainer || !resultsCount) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Results containers not found');
            return;
        }
        
        const results = pendingResults.results || [];
        
        if (userData?.jobSearchData) {
            userData.jobSearchData.lastSearchResults = results;
            userData.jobSearchData.lastSearchDate = new Date().toISOString();
            userData.jobSearchData.lastSearchType = pendingResults.searchType || 'mixed';
        }
        
        allResults = results;
        filteredResults = [...allResults];
        
        resultsCount.textContent = `(${results.length} results)`;
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
                    <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; margin-bottom: var(--space-sm); display: block;"></i>
                    <p>No results found matching your job titles.</p>
                    ${pendingResults.message ? `<p style="margin-top: var(--space-sm); font-size: 0.9rem; opacity: 0.7;">${pendingResults.message}</p>` : ''}
                </div>
            `;
        } else {
            displayResults(filteredResults);
            showFilters();
            
            const contextData = {
                domainsNotified: pendingResults.domainsNotified || 0,
                domainsScraped: pendingResults.domainsScraped || 0,
                domainsCached: pendingResults.domainsCached || 0,
                searchType: pendingResults.searchType || 'mixed',
                totalResults: results.length
            };
            
            showContextualMessage(pendingResults.searchType || 'mixed', contextData);
        }
        
        updateExportButtonVisibility();
        
        pendingResults = null;
        countdownFinished = false;
        searchResultsReceived = false;
    }
    
    function showContextualMessage(searchType, contextData) {
        let message = '';
        
        if (contextData.domainsNotified > 0) {
            message = `✨ ${contextData.domainsNotified} domains used intelligent buffer (instant results from ongoing scraping)`;
        } else if (searchType === 'cache_only') {
            message = `📦 All results from cache (instant search)`;
        } else if (contextData.domainsCached > 0 && contextData.domainsScraped > 0) {
            message = `🚀 ${contextData.domainsCached} from cache + ${contextData.domainsScraped} freshly scraped`;
        }
        
        if (message) {
            showToast('success', message, 5000);
        }
    }

    function isOldCacheResult(result) {
        if (!result.cacheAge || !result.date) return false;
        
        const resultDate = new Date(result.date);
        const daysDiff = (Date.now() - resultDate.getTime()) / (1000 * 60 * 60 * 24);
        
        return daysDiff > 30;
    }

    function exportJobResultsToHTML() {
        if (userPlan !== 'theSentinel') {
            showToast('error', 'Export feature requires TheSentinel plan');
            return;
        }
    
        if (filteredResults.length === 0) {
            showToast('warning', 'No results to export');
            return;
        }
    
        const jobsData = filteredResults.map(result => ({
            id: Date.now() + Math.random(),
            title: result.title || 'Unknown Position',
            company: extractCleanDomain(result.url),
            url: result.url || result.applyUrl || '#',
            description: null,
            location: null,
            postedDate: null,
            tags: null,
            favorite: false,
            applied: false,
            status: 'not-applied',
            comments: [],
            applicationDate: null
        }));
    
        const htmlTemplate = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>myJobBuddy - Job Search Results</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
    
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background-color: #f8fafc;
                color: #1e293b;
                line-height: 1.6;
            }
    
            .container {
                max-width: 1400px;
                margin: 0 auto;
                padding: 20px;
            }
    
            .header {
                text-align: center;
                margin-bottom: 30px;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            }
    
            .header h1 {
                font-size: 2.5rem;
                font-weight: 700;
                margin-bottom: 10px;
            }
    
            .header p {
                font-size: 1.1rem;
                opacity: 0.9;
            }
    
            .storage-info {
                background: linear-gradient(135deg, #e3f2fd, #f3e5f5);
                border: 1px solid #90caf9;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 20px;
                font-size: 0.9rem;
                color: #1565c0;
                text-align: center;
            }
    
            .storage-warning {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                color: #856404;
            }
    
            .controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                flex-wrap: wrap;
                gap: 15px;
            }
    
            .search-box {
                flex: 1;
                min-width: 300px;
            }
    
            .search-input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                font-size: 1rem;
                transition: border-color 0.3s ease;
            }
    
            .search-input:focus {
                outline: none;
                border-color: #667eea;
            }
    
            .buttons {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
    
            .btn {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                font-size: 0.9rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
    
            .btn-primary {
                background-color: #667eea;
                color: white;
            }
    
            .btn-primary:hover {
                background-color: #5a67d8;
                transform: translateY(-1px);
            }
    
            .btn-secondary {
                background-color: #e2e8f0;
                color: #475569;
            }
    
            .btn-secondary:hover {
                background-color: #cbd5e0;
            }
    
            .stats {
                display: flex;
                justify-content: space-between;
                margin-bottom: 20px;
                padding: 15px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
    
            .stat-item {
                text-align: center;
            }
    
            .stat-number {
                font-size: 1.5rem;
                font-weight: 700;
                color: #667eea;
            }
    
            .stat-label {
                font-size: 0.9rem;
                color: #64748b;
            }
    
            .job-table {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                border: 1px solid #e2e8f0;
            }
    
            .table-header {
                background: #f8fafc;
                padding: 15px 20px;
                border-bottom: 1px solid #e2e8f0;
                display: grid;
                grid-template-columns: 2fr 2fr 1fr 1fr;
                gap: 20px;
                font-weight: 600;
                color: #374151;
                align-items: center;
            }
    
            .sort-btn {
                background: none;
                border: none;
                color: #667eea;
                cursor: pointer;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 0.9rem;
            }
    
            .sort-btn:hover {
                color: #5a67d8;
            }
    
            .job-row {
                padding: 15px 20px;
                border-bottom: 1px solid #f1f5f9;
                display: grid;
                grid-template-columns: 2fr 2fr 1fr 1fr;
                gap: 20px;
                align-items: center;
                transition: background-color 0.2s ease;
            }
    
            .job-row:hover {
                background-color: #f8fafc;
            }
    
            .job-row:last-child {
                border-bottom: none;
            }
    
            .job-title {
                font-weight: 600;
                color: #1e293b;
            }
    
            .job-title a {
                color: inherit;
                text-decoration: none;
            }
    
            .job-title a:hover {
                color: #667eea;
            }
    
            .company-name {
                color: #64748b;
                font-size: 0.95rem;
            }
    
            .application-date {
                color: #64748b;
                font-size: 0.9rem;
            }
    
            .date-input {
                padding: 6px 8px;
                border: 1px solid #e2e8f0;
                border-radius: 4px;
                font-size: 0.85rem;
                width: 120px;
            }
    
            .notes-section {
                display: flex;
                align-items: center;
                gap: 8px;
            }
    
            .notes-input {
                flex: 1;
                padding: 6px 8px;
                border: 1px solid #e2e8f0;
                border-radius: 4px;
                font-size: 0.85rem;
                min-width: 150px;
            }
    
            .no-results {
                text-align: center;
                padding: 40px;
                color: #64748b;
            }
    
            .hidden {
                display: none;
            }
    
            @media (max-width: 768px) {
                .container {
                    padding: 10px;
                }
                
                .controls {
                    flex-direction: column;
                    align-items: stretch;
                }
                
                .search-box {
                    min-width: unset;
                }
                
                .stats {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .table-header,
                .job-row {
                    grid-template-columns: 1fr;
                    gap: 10px;
                    text-align: left;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>myJobBuddy</h1>
                <p>Your Job Search Results - Exported on ${new Date().toLocaleDateString()}</p>
            </div>
    
            <div class="storage-info" id="storageInfo">
                💾 Data is automatically saved in your browser. Changes persist between sessions.
            </div>
    
            <div class="controls">
                <div class="search-box">
                    <input type="text" class="search-input" placeholder="Search jobs, companies..." id="searchInput">
                </div>
                <div class="buttons">
                    <button class="btn btn-primary" onclick="exportData()">📤 Export Data</button>
                    <button class="btn btn-secondary" onclick="importData()">📥 Import Data</button>
                    <button class="btn btn-secondary" onclick="toggleFavorites()">⭐ Favorites</button>
                    <button class="btn btn-secondary" onclick="sortAlphabetical()">🔤 Sort A-Z</button>
                    <button class="btn btn-secondary" onclick="clearAll()">🗑️ Clear All</button>
                </div>
            </div>
    
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number" id="totalJobs">${jobsData.length}</div>
                    <div class="stat-label">Total Jobs</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="appliedJobs">0</div>
                    <div class="stat-label">Applied</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="favoriteJobs">0</div>
                    <div class="stat-label">Favorites</div>
                </div>
            </div>
    
            <div class="job-table" id="jobTable">
                <div class="table-header">
                    <button class="sort-btn" onclick="sortByColumn('title')">
                        Job Position <i>↕</i>
                    </button>
                    <button class="sort-btn" onclick="sortByColumn('company')">
                        Company <i>↕</i>
                    </button>
                    <span>Applied Date</span>
                    <span>Notes</span>
                </div>
                <div id="jobRows">
                    ${jobsData.map(job => `
                        <div class="job-row" data-job-id="${job.id}">
                            <div class="job-title">
                                <a href="${job.url}" target="_blank">${job.title}</a>
                            </div>
                            <div class="company-name">${job.company}</div>
                            <div class="application-date">
                                <input type="date" class="date-input" onchange="updateApplicationDate(${job.id}, this.value)">
                            </div>
                            <div class="notes-section">
                                <input type="text" class="notes-input" placeholder="Add notes..." onchange="updateNotes(${job.id}, this.value)">
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
    
            <div class="no-results hidden" id="noResults">
                <p>No jobs found matching your criteria.</p>
            </div>
        </div>
    
        <script>
            const STORAGE_KEY = 'myJobBuddy-jobs-export';
            let jobsData = ${JSON.stringify(jobsData)};
            let filteredJobs = [...jobsData];
            let showFavoritesOnly = false;
            let sortOrder = { column: null, direction: 'asc' };
            let storageAvailable = true;
    
            function checkStorageSupport() {
                try {
                    const testKey = 'test-storage';
                    localStorage.setItem(testKey, 'test');
                    localStorage.removeItem(testKey);
                    return true;
                } catch (e) {
                    return false;
                }
            }
    
            function initializeStorage() {
                storageAvailable = checkStorageSupport();
                const storageInfo = document.getElementById('storageInfo');
                
                if (!storageAvailable) {
                    storageInfo.className = 'storage-info storage-warning';
                    storageInfo.innerHTML = '⚠️ Local storage not available. Data will only persist during this session. Try using a web server or modern browser.';
                }
                
                if (storageAvailable) {
                    loadFromStorage();
                }
            }
    
            function saveToStorage() {
                if (!storageAvailable) return;
                
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobsData));
                    window.clientConfig&&window.clientConfig.smartLog('buffer','Data saved successfully');
                } catch (e) {
                    window.clientConfig&&window.clientConfig.smartLog('buffer','Failed to save data:', e.message);
                    const storageInfo = document.getElementById('storageInfo');
                    if (storageInfo) {
                        storageInfo.className = 'storage-info storage-warning';
                        storageInfo.innerHTML = '⚠️ Storage quota exceeded. Consider exporting your data.';
                    }
                }
            }
    
            function loadFromStorage() {
                if (!storageAvailable) return;
                
                try {
                    const saved = localStorage.getItem(STORAGE_KEY);
                    if (saved) {
                        const savedData = JSON.parse(saved);
                        jobsData = savedData;
                        filteredJobs = [...jobsData];
                        window.clientConfig&&window.clientConfig.smartLog('buffer','Data loaded from storage');
                    }
                } catch (e) {
                    window.clientConfig&&window.clientConfig.smartLog('buffer','Failed to load saved data:', e.message);
                }
            }
    
            function renderJobs() {
                const jobRows = document.getElementById('jobRows');
                const noResults = document.getElementById('noResults');
                const jobTable = document.getElementById('jobTable');
                
                if (filteredJobs.length === 0) {
                    jobTable.style.display = 'none';
                    noResults.classList.remove('hidden');
                    return;
                }
    
                jobTable.style.display = 'block';
                noResults.classList.add('hidden');
    
                jobRows.innerHTML = filteredJobs.map(job => \`
                    <div class="job-row" data-job-id="\${job.id}">
                        <div class="job-title">
                            <a href="\${job.url}" target="_blank">\${job.title}</a>
                        </div>
                        <div class="company-name">\${job.company}</div>
                        <div class="application-date">
                            <input type="date" class="date-input" value="\${job.applicationDate || ''}" onchange="updateApplicationDate(\${job.id}, this.value)">
                        </div>
                        <div class="notes-section">
                            <input type="text" class="notes-input" placeholder="Add notes..." value="\${job.notes || ''}" onchange="updateNotes(\${job.id}, this.value)">
                        </div>
                    </div>
                \`).join('');
            }
    
            function filterJobs() {
                const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                
                filteredJobs = jobsData.filter(job => {
                    const matchesSearch = !searchTerm || 
                        job.title.toLowerCase().includes(searchTerm) ||
                        job.company.toLowerCase().includes(searchTerm);
                    
                    const matchesFavorites = !showFavoritesOnly || job.favorite;
                    
                    return matchesSearch && matchesFavorites;
                });
                
                renderJobs();
                updateStats();
            }
    
            function updateStats() {
                document.getElementById('totalJobs').textContent = jobsData.length;
                document.getElementById('appliedJobs').textContent = jobsData.filter(job => job.applicationDate).length;
                document.getElementById('favoriteJobs').textContent = jobsData.filter(job => job.favorite).length;
            }
    
            function updateApplicationDate(jobId, date) {
                const job = jobsData.find(j => j.id === jobId);
                if (job) {
                    job.applicationDate = date;
                    job.applied = !!date;
                    saveToStorage();
                    updateStats();
                }
            }
    
            function updateNotes(jobId, notes) {
                const job = jobsData.find(j => j.id === jobId);
                if (job) {
                    job.notes = notes;
                    saveToStorage();
                }
            }
    
            function sortByColumn(column) {
                if (sortOrder.column === column) {
                    sortOrder.direction = sortOrder.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortOrder.column = column;
                    sortOrder.direction = 'asc';
                }
    
                filteredJobs.sort((a, b) => {
                    let aVal = a[column] || '';
                    let bVal = b[column] || '';
                    
                    if (typeof aVal === 'string') {
                        aVal = aVal.toLowerCase();
                        bVal = bVal.toLowerCase();
                    }
                    
                    if (sortOrder.direction === 'asc') {
                        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                    } else {
                        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                    }
                });
    
                renderJobs();
            }
    
            function sortAlphabetical() {
                sortByColumn('title');
            }
    
            function toggleFavorites() {
                showFavoritesOnly = !showFavoritesOnly;
                const btn = event.target;
                btn.textContent = showFavoritesOnly ? '⭐ Show All' : '⭐ Favorites';
                filterJobs();
            }
    
            function exportData() {
                const dataStr = JSON.stringify(jobsData, null, 2);
                const dataBlob = new Blob([dataStr], {type: 'application/json'});
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = \`myJobBuddy-data-\${new Date().toISOString().split('T')[0]}.json\`;
                link.click();
                URL.revokeObjectURL(url);
            }
    
            function importData() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            try {
                                const importedData = JSON.parse(e.target.result);
                                if (confirm('This will replace all current data. Continue?')) {
                                    jobsData = importedData;
                                    filteredJobs = [...jobsData];
                                    renderJobs();
                                    updateStats();
                                    saveToStorage();
                                    alert('Data imported successfully!');
                                }
                            } catch (error) {
                                alert('Error importing data. Please check file format.');
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            }
    
            function clearAll() {
                if (confirm('Are you sure you want to clear all data?')) {
                    jobsData = [];
                    filteredJobs = [];
                    renderJobs();
                    updateStats();
                    saveToStorage();
                }
            }
    
            document.getElementById('searchInput').addEventListener('input', filterJobs);
    
            initializeStorage();
            renderJobs();
            updateStats();
        </script>
    </body>
    </html>`;
    
        const blob = new Blob([htmlTemplate], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `myJobBuddy-results-${new Date().toISOString().split('T')[0]}.html`;
        link.click();
        URL.revokeObjectURL(url);
    
        showToast('success', `Exported ${filteredResults.length} job results to shareable HTML file`);
    }

    function waitForDOM() {
        return new Promise((resolve) => {
            function checkDOM() {
                const requiredElements = [
                    '#jobTitlesContainer',
                    '#careerUrlsContainer',
                    '#jobTitleInput',
                    '#careerUrlInput',
                    '.site-buttons',
                    '#search-jobs-action',
                    '#search-cache-only-action'
                ];
                
                const allPresent = requiredElements.every(selector => 
                    document.querySelector(selector) !== null
                );
                
                if (allPresent) {
                    window.clientConfig&&window.clientConfig.smartLog('buffer','All DOM elements ready');
                    resolve();
                } else {
                    setTimeout(checkDOM, 100);
                }
            }
            checkDOM();
        });
    }

    function setupKeyboardNavigation() {
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                handleDeleteKey(e);
            }
        });

        document.addEventListener('click', function(e) {
            if (e.target.closest('.tag')) {
                const tag = e.target.closest('.tag');
                selectTag(tag);
            } else {
                clearTagSelection();
            }
        });
    }

    function selectTag(tag) {
        clearTagSelection();
        tag.classList.add('selected');
        selectedTags = [tag];
        currentFocusIndex = Array.from(tag.parentNode.querySelectorAll('.tag')).indexOf(tag);
    }

    function clearTagSelection() {
        selectedTags.forEach(tag => tag.classList.remove('selected'));
        selectedTags = [];
        currentFocusIndex = -1;
    }

    function handleDeleteKey(e) {
        const activeElement = document.activeElement;
        
        if (selectedTags.length > 0) {
            selectedTags.forEach(tag => deleteTag(tag));
            clearTagSelection();
            e.preventDefault();
            return;
        }
        
        if (activeElement && (activeElement.id === 'jobTitleInput' || activeElement.id === 'careerUrlInput')) {
            const input = activeElement;
            const cursorPosition = input.selectionStart;
            const inputValue = input.value;
            
            if (cursorPosition === 0 && inputValue.length === 0) {
                const container = input.closest('.tag-input');
                const tags = Array.from(container.querySelectorAll('.tag'));
                if (tags.length > 0) {
                    const lastTag = tags[tags.length - 1];
                    deleteTag(lastTag);
                    e.preventDefault();
                }
            }
        }
    }

    function deleteTag(tag) {
        const container = tag.parentNode;
        let tagText;
        
        if (tag.classList.contains('favorite-tag')) {
            tagText = tag.childNodes[0].textContent.trim();
        } else if (tag.classList.contains('selection-tag')) {
            tagText = tag.childNodes[0].textContent.trim();
        } else {
            tagText = tag.textContent.replace('×', '').trim();
        }
        
        if (container.id === 'jobTitlesContainer') {
            userData.jobTitles = userData?.jobTitles?.filter(t => t !== tagText) || [];
            populateJobTitles();
        } else if (container.id === 'careerUrlsContainer') {
            if (tag.classList.contains('favorite-tag')) {
                const favoriteUrl = tagText;
                const company = Object.values(userData?.companies || {}).find(comp => 
                    comp?.favorite && (comp?.career === favoriteUrl || comp?.website === favoriteUrl || comp?.linkedin === favoriteUrl)
                );
                if (company) {
                    showElegantConfirm(
                        'Delete Favorite Company', 
                        `Are you sure you want to permanently delete "${company.name}" from your favorites?`,
                        async () => {
                            company.favorite = false;
                            try {
                                if (window.unifiedPreferencesService) {
                                    await window.unifiedPreferencesService.save(userData);
                                } else if (window.safeSaveUserPreferences) {
                                    await window.safeSaveUserPreferences(userData);
                                }
                                populateCareerPages();
                                updateFavoritesButton();
                                updateSelectionButtons();
                                showToast('success', `${company.name} deleted from favorites`);
                                
                                if (window.applicationsModule?.populateCompaniesTable) {
                                    window.applicationsModule.populateCompaniesTable();
                                }
                            } catch (error) {
                                window.clientConfig && window.clientConfig.smartLog('fail', `Error deleting favorite: ${error.message}`);
                                showToast('error', 'Failed to delete favorite');
                            }
                        },
                        'Delete Forever'
                    );
                }
            } else if (tag.classList.contains('selection-tag')) {
                const selectionUrl = tagText;
                const selectionType = tag.getAttribute('data-selection');
                const company = Object.values(userData?.companies || {}).find(comp => 
                    comp?.selection === selectionType && (comp?.career === selectionUrl || comp?.website === selectionUrl || comp?.linkedin === selectionUrl)
                );
                if (company) {
                    showElegantConfirm(
                        `Delete Selection ${selectionType} Company`, 
                        `Are you sure you want to permanently delete "${company.name}" from selection ${selectionType}?`,
                        async () => {
                            company.selection = '';
                            try {
                                if (window.unifiedPreferencesService) {
                                    await window.unifiedPreferencesService.save(userData);
                                } else if (window.safeSaveUserPreferences) {
                                    await window.safeSaveUserPreferences(userData);
                                }
                                populateCareerPages();
                                updateSelectionButtons();
                                showToast('success', `${company.name} removed from selection ${selectionType}`);
                                
                                if (window.applicationsModule?.populateCompaniesTable) {
                                    window.applicationsModule.populateCompaniesTable();
                                }
                            } catch (error) {
                                window.clientConfig && window.clientConfig.smartLog('fail', `Error removing from selection: ${error.message}`);
                                showToast('error', 'Failed to remove from selection');
                            }
                        },
                        'Delete Forever'
                    );
                }
            } else {
                const activeList = getCurrentActiveList();
                if (!userData?.careerPageLists?.[activeList]) {
                    ensureJobSearchDefaults(userData);
                }
                userData.careerPageLists[activeList] = userData.careerPageLists[activeList].filter(p => p?.url !== tagText);
                populateCareerPages();
            }
        }
    }

    function validateAndFixUrl(url) {
        const urlLower = url.toLowerCase();
        
        if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
            const correctedUrl = 'https://' + url;
            showHttpsValidationModal(url, correctedUrl);
            return correctedUrl;
        }
        
        return url;
    }

    function showHttpsValidationModal(originalUrl, correctedUrl) {
        const modal = document.getElementById('https-validation-modal');
        const originalUrlEl = document.getElementById('originalUrl');
        const correctedUrlEl = document.getElementById('correctedUrl');
        
        if (originalUrlEl) originalUrlEl.textContent = originalUrl;
        if (correctedUrlEl) correctedUrlEl.textContent = correctedUrl;
        
        modal.classList.add('show');
        
        const confirmBtn = document.getElementById('confirm-https');
        const closeBtn = document.getElementById('close-https-modal');
        
        function closeModal() {
            modal.classList.remove('show');
        }
        
        confirmBtn.onclick = closeModal;
        closeBtn.onclick = closeModal;
        
        modal.onclick = function(e) {
            if (e.target === modal) closeModal();
        };
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeModal();
        });
    }

    function populateAllFields() {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Populating all fields...');
        ensureJobSearchDefaults(userData);
        populateJobTitles();
        populateCareerPages();
        updateFavoritesButton();
        updateSelectionButtons();
    }

    function restoreSearchState() {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Restoring search state...');
        
        if (!userData?.jobSearchData) return;
        
        const savedSite = userData.jobSearchData.selectedSite || 'career-pages';
        window.clientConfig&&window.clientConfig.smartLog('buffer','Restoring selected site:', savedSite);
        
        const siteButton = document.querySelector(`[data-site="${savedSite}"]`);
        if (siteButton) {
            document.querySelectorAll('.site-buttons .site-button').forEach(btn => {
                btn.classList.remove('active');
            });
            siteButton.classList.add('active');
            
            const careerPagesContainer = document.getElementById('careerPagesContainer');
            if (careerPagesContainer) {
                careerPagesContainer.style.display = savedSite === 'career-pages' ? 'block' : 'none';
            }
        }

        const listSelector = document.getElementById('listSelector');
        if (listSelector) {
            const activeList = userData.currentActiveList || 'listA';
            listSelector.value = activeList;
        }
        
        if (userData.jobSearchData.lastSearchResults?.length > 0) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Restoring search results:', userData.jobSearchData.lastSearchResults.length, 'results');
            allResults = userData.jobSearchData.lastSearchResults;
            filteredResults = [...allResults];
            displayResults(filteredResults);
            showFilters();
            updateExportButtonVisibility();
        }
    }

    function displayResults(results) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Displaying results:', results.length);
        
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsCount = document.getElementById('resultsCount');
        const loadingIndicator = document.getElementById('loadingIndicator');
        
        if (!resultsContainer || !resultsCount) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Results containers not found');
            return;
        }
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        resultsCount.textContent = `(${results.length} results)`;
        resultsContainer.innerHTML = '';
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: var(--space-lg); color: rgba(255, 255, 255, 0.7);">
                    <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; margin-bottom: var(--space-sm); display: block;"></i>
                    <p>No results match your current filters.</p>
                </div>
            `;
            return;
        }
        
        results.forEach(result => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            
            if (isOldCacheResult(result)) {
                resultItem.classList.add('old-cache-result');
                resultItem.style.borderLeft = '4px solid #ff4757';
                resultItem.style.backgroundColor = 'rgba(255, 71, 87, 0.05)';
            }
            
            const title = result.title?.trim() || '';
            const date = result.date || '';
            const source = result.source || extractCleanDomain(result.url || '');
            const description = result.description?.trim() || '';
            const jobUrl = result.url || '';
            
            resultItem.innerHTML = `
                <div class="result-title">
                    ${jobUrl ? `<a href="${jobUrl}" target="_blank" style="color: inherit; text-decoration: none;">${title}</a>` : title}
                    ${isOldCacheResult(result) ? '<span style="color: #ff4757; font-size: 0.8rem; margin-left: 8px; background: rgba(255, 71, 87, 0.1); padding: 2px 6px; border-radius: 4px;">Old Cache (>30 days)</span>' : ''}
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
                        data-company="${extractCompanyFromDomain(source)}" 
                        data-career="${jobUrl}">
                        <i class="fas fa-plus"></i> Add to applications
                    </button>
                </div>
            `;
            
            resultsContainer.appendChild(resultItem);
        });
        
        setupResultsEventListeners();
        updateExportButtonVisibility();
        window.clientConfig&&window.clientConfig.smartLog('buffer','Results displayed successfully');
    }

    function extractFullDomain(url) {
        if (!url) return '';
        
        try {
            const urlObj = new URL(url);
            let domain = urlObj.hostname + urlObj.pathname;
            
            if (urlObj.hash) {
                domain += urlObj.hash;
            }
            
            if (domain.endsWith('/')) {
                domain = domain.slice(0, -1);
            }
            
            return domain;
        } catch (e) {
            return url;
        }
    }

    function extractCompanyFromDomain(domain) {
        if (!domain) return 'Unknown Company';
        
        const parts = domain.split('.');
        if (parts.length > 0) {
            let companyPart = parts[0];
            if (companyPart === 'www') {
                companyPart = parts[1] || parts[0];
            }
            
            return companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
        }
        
        return 'Unknown Company';
    }

    function showFilters() {
        const filtersEl = document.getElementById('resultsFilters');
        if (filtersEl) {
            filtersEl.style.display = 'block';
            setupFilterListeners();
        }
    }

    function setupFilterListeners() {
        const domainFilter = document.getElementById('domainFilter');
        const titleFilter = document.getElementById('titleFilter');
        const clearFilters = document.getElementById('clearAllFilters');

        function applyFilters() {
            const domainText = domainFilter?.value.toLowerCase().trim() || '';
            const titleText = titleFilter?.value.toLowerCase().trim() || '';

            filteredResults = allResults.filter(result => {
                const fullDomain = extractFullDomain(result.url || '').toLowerCase();
                const domainMatch = !domainText || fullDomain.includes(domainText);
                const titleMatch = !titleText || (result.title || '').toLowerCase().includes(titleText);
                
                return domainMatch && titleMatch;
            });

            displayResults(filteredResults);
        }

        if (domainFilter) {
            domainFilter.addEventListener('input', applyFilters);
        }
        if (titleFilter) {
            titleFilter.addEventListener('input', applyFilters);
        }
        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                if (domainFilter) domainFilter.value = '';
                if (titleFilter) titleFilter.value = '';
                applyFilters();
            });
        }
    }

    function setupResultsEventListeners() {
        document.querySelectorAll('.add-to-applications-btn').forEach(button => {
            button.addEventListener('click', function() {
                const jobTitle = this.getAttribute('data-title') || '';
                let companyName = this.getAttribute('data-company') || '';
                const website = this.getAttribute('data-website') || '';
                const career = this.getAttribute('data-career') || '';
                
                if (!companyName && career) {
                    try {
                        const url = new URL(career);
                        const hostname = url.hostname;
                        const parts = hostname.split('.');
                        if (parts.length > 0) {
                            companyName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                        }
                    } catch (e) {
                        companyName = 'Unknown Company';
                    }
                }
                
                if (!companyName) companyName = 'Unknown Company';
                
                if (window.modalsModule?.openAddApplicationModal) {
                    window.modalsModule.openAddApplicationModal(jobTitle, companyName, '', website, career);
                } else {
                    addApplicationDirectly(jobTitle, companyName, '', website, career);
                }
            });
        });
    }

    function setupEventListeners() {
        const jobTitleInput = document.getElementById('jobTitleInput');
        if (jobTitleInput) {
            jobTitleInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = this.value.trim();
                    if (value && !userData?.jobTitles?.includes(value)) {
                        ensureJobSearchDefaults(userData);
                        userData.jobTitles.push(value);
                        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
                        this.value = '';
                        populateJobTitles();
                    }
                }
            });
        }
        
        const careerUrlInput = document.getElementById('careerUrlInput');
        if (careerUrlInput) {
            careerUrlInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = this.value.trim();
                    if (value) {
                        handleUrlInput(value);
                        this.value = '';
                    }
                }
            });
        }

        const clearJobTitles = document.getElementById('clearJobTitles');
        if (clearJobTitles) {
            clearJobTitles.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.clientConfig&&window.clientConfig.smartLog('buffer','Clear job titles clicked');
                if (!userData?.jobTitles?.length) {
                    showToast('info', 'No job titles to clear');
                    return;
                }
                showElegantConfirm(
                    'Clear Job Titles', 
                    `Are you sure you want to clear all ${userData.jobTitles.length} job titles?`,
                    () => {
                        userData.jobTitles = [];
                        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
                        populateJobTitles();
                        showToast('success', 'Job titles cleared');
                    },
                    'Clear All'
                );
            });
        }

        const clearAllUrls = document.getElementById('clearAllUrls');
        if (clearAllUrls) {
            clearAllUrls.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.clientConfig&&window.clientConfig.smartLog('buffer','Clear all URLs clicked');
                const activeList = getCurrentActiveList();
                const currentCount = (userData?.careerPageLists?.[activeList] || []).length;
                if (currentCount === 0) {
                    showToast('info', `${activeList.toUpperCase()} is already empty`);
                    return;
                }
                showElegantConfirm(
                    'Clear Career URLs', 
                    `Are you sure you want to clear all ${currentCount} URLs from ${activeList.toUpperCase()}?`,
                    () => {
                        ensureJobSearchDefaults(userData);
                        userData.careerPageLists[activeList] = [];
                        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
                        populateCareerPages();
                        showToast('success', `${activeList.toUpperCase()} cleared`);
                    },
                    'Clear All'
                );
            });
        }

        const exportUrls = document.getElementById('exportUrls');
        if (exportUrls) {
            exportUrls.addEventListener('click', exportCareerUrls);
        }

        const exportJobResults = document.getElementById('exportJobResults');
        if (exportJobResults) {
            exportJobResults.addEventListener('click', exportJobResultsToHTML);
        }

        const listSelector = document.getElementById('listSelector');
        if (listSelector) {
            listSelector.addEventListener('change', handleListChange);
        }

        const manageFavorites = document.getElementById('manageFavorites');
        if (manageFavorites) {
            manageFavorites.addEventListener('click', toggleFavoritesVisibility);
        }

        const manageSelectionA = document.getElementById('manageSelectionA');
        if (manageSelectionA) {
            manageSelectionA.addEventListener('click', () => toggleSelectionVisibility('A'));
        }

        const manageSelectionB = document.getElementById('manageSelectionB');
        if (manageSelectionB) {
            manageSelectionB.addEventListener('click', () => toggleSelectionVisibility('B'));
        }

        const manageSelectionC = document.getElementById('manageSelectionC');
        if (manageSelectionC) {
            manageSelectionC.addEventListener('click', () => toggleSelectionVisibility('C'));
        }
        
        document.querySelectorAll('.site-buttons .site-button').forEach(button => {
            button.addEventListener('click', function() {
                document.querySelectorAll('.site-buttons .site-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                const selectedSite = this.getAttribute('data-site');
                if (userData?.jobSearchData) {
                    userData.jobSearchData.selectedSite = selectedSite;
                    if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
                }
                
                const careerPagesContainer = document.getElementById('careerPagesContainer');
                if (careerPagesContainer) {
                    careerPagesContainer.style.display = selectedSite === 'career-pages' ? 'block' : 'none';
                }
            });
        });
        
        const searchButton = document.getElementById('search-jobs-action');
        if (searchButton) {
            searchButton.addEventListener('click', performJobSearchWithNotifications);
        }
        
        const searchCacheButton = document.getElementById('search-cache-only-action');
        if (searchCacheButton) {
            searchCacheButton.addEventListener('click', performCacheOnlySearchWithNotifications);
        }
    }

    async function handleUrlInput(input) {
        try {
            const activeList = getCurrentActiveList();
            ensureJobSearchDefaults(userData);
            
            const serverCareerLists = window.userData?.careerPageLists || {};
            const serverActiveList = serverCareerLists[activeList] || [];
    
            if (input.includes(',')) {
                const urls = input.split(',').map(url => url.trim()).filter(url => url);
                let addedCount = 0;
                const errorElement = document.getElementById('careerUrlError');
                
                for (const url of urls) {
                    try {
                        const validatedUrl = validateAndFixUrl(url);
                        new URL(validatedUrl);
                        
                        const urlExistsInServer = serverActiveList.some(page => page?.url === validatedUrl);
                        const urlExistsInLocal = userData.careerPageLists[activeList].some(page => page?.url === validatedUrl);
                        
                        if (!urlExistsInServer && !urlExistsInLocal) {
                            userData.careerPageLists[activeList].push({ url: validatedUrl });
                            addedCount++;
                        }
                    } catch (error) {
                        window.clientConfig && window.clientConfig.smartLog('buffer', 'Invalid URL skipped:', url);
                    }
                }
                
                if (addedCount > 0) {
                    try {
                        const result = await window.unifiedPreferencesService.save(userData);
                        if (result) {
                            const updatedData = await window.unifiedPreferencesService.get();
                            if (updatedData) {
                                window.userData = updatedData;
                                userData = updatedData;
                            }
                        }
                        populateCareerPages();
                        showToast('success', `Added ${addedCount} URLs to ${activeList.toUpperCase()}`);
                        if (errorElement) errorElement.textContent = '';
                        window.clientConfig && window.clientConfig.smartLog('win', `URLs added to ${activeList} and saved`);
                    } catch (error) {
                        window.clientConfig && window.clientConfig.smartLog('fail', `Error saving URLs: ${error.message}`);
                        showToast('error', 'Failed to save URLs');
                    }
                }
            } else {
                try {
                    const validatedUrl = validateAndFixUrl(input);
                    new URL(validatedUrl);
                    
                    const urlExistsInServer = serverActiveList.some(page => page?.url === validatedUrl);
                    const urlExistsInLocal = userData.careerPageLists[activeList].some(page => page?.url === validatedUrl);
                    
                    if (!urlExistsInServer && !urlExistsInLocal) {
                        userData.careerPageLists[activeList].push({ url: validatedUrl });
                        
                        try {
                            const result = await window.unifiedPreferencesService.save(userData);
                            if (result) {
                                const updatedData = await window.unifiedPreferencesService.get();
                                if (updatedData) {
                                    window.userData = updatedData;
                                    userData = updatedData;
                                }
                            }
                            const errorElement = document.getElementById('careerUrlError');
                            if (errorElement) errorElement.textContent = '';
                            populateCareerPages();
                            showToast('success', `Added URL to ${activeList.toUpperCase()}`);
                            window.clientConfig && window.clientConfig.smartLog('win', `URL added to ${activeList} and saved`);
                        } catch (error) {
                            window.clientConfig && window.clientConfig.smartLog('fail', `Error saving URL: ${error.message}`);
                            showToast('error', 'Failed to save URL');
                        }
                    }
                } catch (error) {
                    const errorElement = document.getElementById('careerUrlError');
                    if (errorElement) errorElement.textContent = 'Please enter a valid URL';
                }
            }
        } catch (error) {
            window.clientConfig && window.clientConfig.smartLog('fail', `Error in handleUrlInput: ${error.message}`);
            showToast('error', 'Failed to process URL input');
        }
    }
    
    async function handleListChange() {
        try {
            const listSelector = document.getElementById('listSelector');
            const selectedList = listSelector.value;
            
            ensureJobSearchDefaults(userData);
            userData.currentActiveList = selectedList;
            
            if (window.unifiedPreferencesService) {
                const result = await window.unifiedPreferencesService.save(userData);
                if (result) {
                    const updatedData = await window.unifiedPreferencesService.get();
                    if (updatedData) {
                        window.userData = updatedData;
                        userData = updatedData;
                    }
                    window.clientConfig && window.clientConfig.smartLog('win', 'List change saved and propagated');
                }
            } else if (window.saveUserData) {
                await window.saveUserData(userData);
                window.clientConfig && window.clientConfig.smartLog('win', 'List change saved');
            }
            
            populateCareerPages();
            showToast('info', `Switched to ${selectedList.toUpperCase()}`);
        } catch (error) {
            window.clientConfig && window.clientConfig.smartLog('fail', `Error saving list change: ${error.message}`);
            showToast('error', 'Failed to save list change');
        }
    }
    
    async function toggleFavoritesVisibility() {
        try {
            const companies = Object.values(userData?.companies || {});
            const favoriteCount = companies.filter(company => company?.favorite).length;
            
            if (favoriteCount === 0) {
                openFavoritesManager();
                return;
            }
            
            ensureJobSearchDefaults(userData);
            userData.showFavoritesInCareerList = !userData.showFavoritesInCareerList;
            
            if (window.unifiedPreferencesService) {
                const result = await window.unifiedPreferencesService.save(userData);
                if (result) {
                    const updatedData = await window.unifiedPreferencesService.get();
                    if (updatedData) {
                        window.userData = updatedData;
                        userData = updatedData;
                    }
                }
            } else if (window.safeSaveUserPreferences) {
                await window.safeSaveUserPreferences(userData);
            }
            
            populateCareerPages();
            updateFavoritesButton();
            
            const action = userData.showFavoritesInCareerList ? 'shown' : 'hidden';
            showToast('info', `Favorites ${action} in career URLs list`);
        } catch (error) {
            window.clientConfig && window.clientConfig.smartLog('fail', `Error toggling favorites: ${error.message}`);
            showToast('error', 'Failed to toggle favorites');
        }
    }
    
    async function toggleSelectionVisibility(selection) {
        try {
            const companies = Object.values(userData?.companies || {});
            const selectionCount = companies.filter(company => company?.selection === selection).length;
            
            if (selectionCount === 0) {
                openSelectionManager(selection);
                return;
            }
            
            ensureJobSearchDefaults(userData);
            const showKey = `showSelection${selection}InCareerList`;
            userData[showKey] = !userData[showKey];
            
            if (window.unifiedPreferencesService) {
                const result = await window.unifiedPreferencesService.save(userData);
                if (result) {
                    const updatedData = await window.unifiedPreferencesService.get();
                    if (updatedData) {
                        window.userData = updatedData;
                        userData = updatedData;
                    }
                }
            } else if (window.safeSaveUserPreferences) {
                await window.safeSaveUserPreferences(userData);
            }
            
            populateCareerPages();
            updateSelectionButtons();
            
            const action = userData[showKey] ? 'shown' : 'hidden';
            showToast('info', `Selection ${selection} ${action} in career URLs list`);
        } catch (error) {
            window.clientConfig && window.clientConfig.smartLog('fail', `Error toggling selection ${selection}: ${error.message}`);
            showToast('error', `Failed to toggle selection ${selection}`);
        }
    }

    function exportCareerUrls() {
        try {
            const activeList = getCurrentActiveList();
            const currentUrls = userData?.careerPageLists?.[activeList] || [];
            let favoriteUrls = [];
            let selectionAUrls = [];
            let selectionBUrls = [];
            let selectionCUrls = [];
            
            if (userData?.showFavoritesInCareerList) {
                favoriteUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.favorite && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionAInCareerList) {
                selectionAUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'A' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionBInCareerList) {
                selectionBUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'B' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }

            if (userData?.showSelectionCInCareerList) {
                selectionCUrls = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === 'C' && (company?.career || company?.website || company?.linkedin))
                    .map(company => company.career || company.website || company.linkedin);
            }
            
            const allUrls = [
                ...currentUrls.map(page => page?.url).filter(Boolean),
                ...favoriteUrls,
                ...selectionAUrls,
                ...selectionBUrls,
                ...selectionCUrls
            ];

            const uniqueUrls = [...new Set(allUrls)];
            
            if (uniqueUrls.length === 0) {
                showToast('warning', 'No URLs to export');
                return;
            }
            
            const csvContent = uniqueUrls.join(', ');
            navigator.clipboard.writeText(csvContent).then(() => {
                showToast('success', `Exported ${uniqueUrls.length} URLs from ${activeList.toUpperCase()} to clipboard`);
            }).catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = csvContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('success', `Exported ${uniqueUrls.length} URLs from ${activeList.toUpperCase()} to clipboard`);
            });
        } catch (error) {
            window.clientConfig && window.clientConfig.smartLog('fail', `Error exporting URLs: ${error.message}`);
            showToast('error', 'Failed to export URLs');
        }
    }

    function getCurrentActiveList() {
        return userData?.currentActiveList || 'listA';
    }

    function openSelectionManager(selection) {
        if (!window.modalsModule) {
            showToast('error', 'Modal system not available');
            return;
        }
        
        const companies = Object.values(userData?.companies || {});
        const selectionCompanies = companies.filter(company => company?.selection === selection);
        const otherCompanies = companies.filter(company => company?.selection !== selection);
        
        let modalContent = `
            <div class="selection-manager">
                <div class="section">
                    <h4><i class="fas fa-tag" style="color: var(--primary);"></i> Current Selection ${selection} (${selectionCompanies.length})</h4>
                    <div class="company-list">
        `;
        
        if (selectionCompanies.length === 0) {
            modalContent += `
                <div style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.5);">
                    <i class="fas fa-tag" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                    <p>No companies in selection ${selection} yet</p>
                </div>
            `;
        } else {
            selectionCompanies.forEach(company => {
                const careerUrl = company?.career || company?.website || company?.linkedin || '';
                modalContent += `
                    <div class="company-item selection">
                        <div class="company-info">
                            <span class="company-name">${company?.name || 'Unknown Company'}</span>
                            <span class="selection-badge" style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">${selection}</span>
                            ${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}
                        </div>
                        <button class="btn-small btn-danger" onclick="window.jobSearchModule.toggleCompanySelection('${company?.name || ''}', '')">
                            <i class="fas fa-times"></i> Remove
                        </button>
                    </div>
                `;
            });
        }
        
        modalContent += `
                    </div>
                </div>
        `;
        
        if (otherCompanies.length > 0) {
            modalContent += `
                <div class="section">
                    <h4><i class="fas fa-plus" style="color: rgba(255, 255, 255, 0.5);"></i> Add to Selection ${selection} (${otherCompanies.length})</h4>
                    <div class="company-list">
            `;
            
            otherCompanies.forEach(company => {
                const careerUrl = company?.career || company?.website || company?.linkedin || '';
                modalContent += `
                    <div class="company-item">
                        <div class="company-info">
                            <span class="company-name">${company?.name || 'Unknown Company'}</span>
                            ${company?.selection ? `<span class="selection-badge" style="background: var(--secondary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">${company.selection}</span>` : ''}
                            ${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}
                        </div>
                        <button class="btn-small btn-success" onclick="window.jobSearchModule.toggleCompanySelection('${company?.name || ''}', '${selection}')">
                            <i class="fas fa-tag"></i> Add to ${selection}
                        </button>
                    </div>
                `;
            });
            
            modalContent += `
                    </div>
                </div>
            `;
        }
        
        modalContent += `</div>`;
        
        window.modalsModule.openCustomModal(`Manage Selection ${selection} Companies`, modalContent);
    }

    window.toggleCompanySelection = function(companyName, selection) {
        const companyId = generateId(companyName);
        if (userData?.companies?.[companyId]) {
            userData.companies[companyId].selection = selection;
            if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
            populateCareerPages();
            updateSelectionButtons();
            
            if (selection) {
                showToast('success', `${companyName} added to selection ${selection}`);
            } else {
                showToast('success', `${companyName} removed from selection`);
            }
            
            const currentModalSelection = selection || 'A';
            openSelectionManager(currentModalSelection);
            
            if (window.applicationsModule?.populateCompaniesTable) {
                window.applicationsModule.populateCompaniesTable();
            }
        }
    };

    function showElegantConfirm(title, message, onConfirm, confirmText = 'Delete', confirmColor = 'danger') {
        window.clientConfig&&window.clientConfig.smartLog('buffer','showElegantConfirm called:', title);
        
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 14, 39, 0.8);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 1;
            visibility: visible;
        `;
        
        const modalContainer = document.createElement('div');
        modalContainer.style.cssText = `
            background: rgba(26, 31, 54, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            width: 90%;
            max-width: 500px;
            overflow: hidden;
            transform: translateY(0) scale(1);
            transition: all 0.3s ease;
            position: relative;
            animation: confirmSlideIn 0.3s ease-out;
        `;
        
        modalContainer.innerHTML = `
            <div style="padding: 24px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; align-items: center; justify-content: space-between;">
                <h3 style="font-size: 1.2rem; font-weight: 600; background: linear-gradient(135deg, #4f6df5, #8d67f7); -webkit-background-clip: text; background-clip: text; color: transparent; margin: 0;">
                    ${title}
                </h3>
                <button class="modal-close" type="button" style="background: transparent; border: none; color: rgba(255, 255, 255, 0.5); font-size: 1.5rem; cursor: pointer; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div style="padding: 32px; text-align: center;">
                <div style="margin-bottom: 24px;">
                    <i class="fas fa-exclamation-triangle" style="color: #ff4757; font-size: 3rem; margin-bottom: 16px; text-shadow: 0 0 20px #ff4757; filter: drop-shadow(0 0 10px #ff4757);"></i>
                </div>
                <p style="color: rgba(255, 255, 255, 0.9); margin-bottom: 24px; text-align: center; line-height: 1.5; font-size: 1.1rem;">
                    ${message}
                </p>
            </div>
            
            <div style="padding: 16px 32px; border-top: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: flex-end; gap: 12px;">
                <button class="cancel-btn" type="button" style="min-width: 120px; padding: 12px 24px; font-weight: 600; border-radius: 50px; transition: all 0.2s ease; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="confirm-btn" type="button" style="min-width: 120px; padding: 12px 24px; font-weight: 600; border-radius: 50px; transition: all 0.2s ease; background: linear-gradient(to right, #ff4757, #ff6b81); color: white; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(255, 71, 87, 0.3); display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-trash"></i> ${confirmText}
                </button>
            </div>
        `;
        
        const cancelBtn = modalContainer.querySelector('.cancel-btn');
        const confirmBtn = modalContainer.querySelector('.confirm-btn');
        const closeBtn = modalContainer.querySelector('.modal-close');
        
        backdrop.appendChild(modalContainer);
        document.body.appendChild(backdrop);
        
        function closeModal() {
            if (backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
            }
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                onConfirm();
                closeModal();
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal();
            }
        });
        
        document.addEventListener('keydown', function handleEscape(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        });
    }

    function showLimitExceededModal(limitType, needed, available, currentPlan) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','showLimitExceededModal called:', limitType, needed, available, currentPlan);
        
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 14, 39, 0.8);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 1;
            visibility: visible;
        `;
        
        const modalContainer = document.createElement('div');
        modalContainer.style.cssText = `
            background: rgba(26, 31, 54, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            width: 90%;
            max-width: 550px;
            overflow: hidden;
            transform: translateY(0) scale(1);
            transition: all 0.3s ease;
            position: relative;
            animation: confirmSlideIn 0.3s ease-out;
        `;
        
        const planColors = {
            'free': '#6c757d',
            'standard': '#4f6df5', 
            'pro': '#8d67f7'
        };
        
        const planColor = planColors[currentPlan] || '#6c757d';
        
        modalContainer.innerHTML = `
            <div style="padding: 24px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; align-items: center; justify-content: space-between;">
                <h3 style="font-size: 1.3rem; font-weight: 600; background: linear-gradient(135deg, #ff4757, #ff6b81); -webkit-background-clip: text; background-clip: text; color: transparent; margin: 0;">
                    <i class="fas fa-exclamation-triangle" style="margin-right: 8px; color: #ff4757;"></i>
                    Credit Limit Exceeded
                </h3>
                <button class="modal-close" type="button" style="background: transparent; border: none; color: rgba(255, 255, 255, 0.5); font-size: 1.5rem; cursor: pointer; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div style="padding: 32px; text-align: center;">
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
            </div>
            
            <div style="padding: 16px 32px; border-top: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: ${currentPlan === 'pro' ? 'center' : 'space-between'}; gap: 12px;">
                ${currentPlan !== 'pro' ? `
                    <button class="upgrade-btn" type="button" style="flex: 1; padding: 14px 24px; font-weight: 600; border-radius: 50px; transition: all 0.2s ease; background: linear-gradient(to right, #4f6df5, #8d67f7); color: white; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(79, 109, 245, 0.3); display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-arrow-up"></i> Upgrade Plan
                    </button>
                ` : ''}
                <button class="cancel-btn" type="button" style="${currentPlan === 'pro' ? 'flex: 1; ' : ''}min-width: 120px; padding: 14px 24px; font-weight: 600; border-radius: 50px; transition: all 0.2s ease; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-times"></i> ${currentPlan === 'pro' ? 'Close' : 'Cancel'}
                </button>
            </div>
        `;
        
        const cancelBtn = modalContainer.querySelector('.cancel-btn');
        const upgradeBtn = modalContainer.querySelector('.upgrade-btn');
        const closeBtn = modalContainer.querySelector('.modal-close');
        
        backdrop.appendChild(modalContainer);
        document.body.appendChild(backdrop);
        
        function closeModal() {
            if (backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
            }
        }
        
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', () => {
                window.location.href = '/pricing';
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal();
            }
        });
        
        document.addEventListener('keydown', function handleEscape(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        });
    }

    function updateFavoritesButton() {
        const manageFavorites = document.getElementById('manageFavorites');
        if (!manageFavorites) return;
        
        const companies = Object.values(userData?.companies || {});
        const favoriteCount = companies.filter(company => company?.favorite).length;
        const isShowingFavorites = userData?.showFavoritesInCareerList;
        
        const icon = manageFavorites.querySelector('i');
        if (favoriteCount > 0 && isShowingFavorites) {
            icon.className = 'fas fa-star';
            manageFavorites.classList.add('has-favorites');
        } else if (favoriteCount > 0 && !isShowingFavorites) {
            icon.className = 'far fa-star';
            manageFavorites.classList.remove('has-favorites');
        } else {
            icon.className = 'far fa-star';
            manageFavorites.classList.remove('has-favorites');
        }
        
        if (favoriteCount > 0) {
            manageFavorites.title = `${isShowingFavorites ? 'Hide' : 'Show'} favorite companies (${favoriteCount})`;
        } else {
            manageFavorites.title = 'Manage favorite companies (0)';
        }
    }

    function updateSelectionButtons() {
        const companies = Object.values(userData?.companies || {});
        
        ['A', 'B', 'C'].forEach(selection => {
            const button = document.getElementById(`manageSelection${selection}`);
            if (!button) return;
            
            const selectionCount = companies.filter(company => company?.selection === selection).length;
            const isShowingSelection = userData?.[`showSelection${selection}InCareerList`];
            
            const icon = button.querySelector('i');
            const label = button.querySelector('.selection-label');
            
            if (selectionCount > 0 && isShowingSelection) {
                icon.className = 'fas fa-tag';
                button.classList.add('has-selection');
                if (label) label.style.color = '#4f6df5';
            } else if (selectionCount > 0 && !isShowingSelection) {
                icon.className = 'far fa-tag';
                button.classList.remove('has-selection');
                if (label) label.style.color = 'rgba(255, 255, 255, 0.7)';
            } else {
                icon.className = 'far fa-tag';
                button.classList.remove('has-selection');
                if (label) label.style.color = 'rgba(255, 255, 255, 0.5)';
            }
            
            if (selectionCount > 0) {
                button.title = `${isShowingSelection ? 'Hide' : 'Show'} selection ${selection} companies (${selectionCount})`;
            } else {
                button.title = `Manage selection ${selection} companies (0)`;
            }
        });
    }

    function openFavoritesManager() {
        if (!window.modalsModule) {
            showToast('error', 'Modal system not available');
            return;
        }
        
        const companies = Object.values(userData?.companies || {});
        const favoriteCompanies = companies.filter(company => company?.favorite);
        const nonFavoriteCompanies = companies.filter(company => !company?.favorite);
        
        let modalContent = `
            <div class="favorites-manager">
                <div class="section">
                    <h4><i class="fas fa-star" style="color: var(--warning);"></i> Current Favorites (${favoriteCompanies.length})</h4>
                    <div class="company-list">
        `;
        
        if (favoriteCompanies.length === 0) {
            modalContent += `
                <div style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.5);">
                    <i class="far fa-star" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                    <p>No favorite companies yet</p>
                </div>
            `;
        } else {
            favoriteCompanies.forEach(company => {
                const careerUrl = company?.career || company?.website || company?.linkedin || '';
                modalContent += `
                    <div class="company-item favorite">
                        <div class="company-info">
                            <span class="company-name">${company?.name || 'Unknown Company'}</span>
                            ${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}
                        </div>
                        <button class="btn-small btn-danger" onclick="window.jobSearchModule.toggleCompanyFavorite('${company?.name || ''}', false)">
                            <i class="fas fa-star-slash"></i> Remove
                        </button>
                    </div>
                `;
            });
        }
        
        modalContent += `
                    </div>
                </div>
        `;
        
        if (nonFavoriteCompanies.length > 0) {
            modalContent += `
                <div class="section">
                    <h4><i class="far fa-star" style="color: rgba(255, 255, 255, 0.5);"></i> Add to Favorites (${nonFavoriteCompanies.length})</h4>
                    <div class="company-list">
            `;
            
            nonFavoriteCompanies.forEach(company => {
                const careerUrl = company?.career || company?.website || company?.linkedin || '';
                modalContent += `
                    <div class="company-item">
                        <div class="company-info">
                            <span class="company-name">${company?.name || 'Unknown Company'}</span>
                            ${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}
                        </div>
                        <button class="btn-small btn-success" onclick="window.jobSearchModule.toggleCompanyFavorite('${company?.name || ''}', true)">
                            <i class="fas fa-star"></i> Add
                        </button>
                    </div>
                `;
            });
            
            modalContent += `
                    </div>
                </div>
            `;
        }
        
        modalContent += `</div>`;
        
        window.modalsModule.openCustomModal('Manage Favorite Companies', modalContent);
    }

    window.toggleCompanyFavorite = function(companyName, isFavorite) {
        const companyId = generateId(companyName);
        if (userData?.companies?.[companyId]) {
            userData.companies[companyId].favorite = isFavorite;
            if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
            populateCareerPages();
            updateFavoritesButton();
            showToast('success', `${companyName} ${isFavorite ? 'added to' : 'removed from'} favorites`);
            openFavoritesManager();
            
            if (window.applicationsModule?.populateCompaniesTable) {
                window.applicationsModule.populateCompaniesTable();
            }
        }
    };

    function populateJobTitles() {
        const container = document.getElementById('jobTitlesContainer');
        const input = document.getElementById('jobTitleInput');
        if (!container || !input) return;
        
        container.querySelectorAll('.tag').forEach(tag => tag.remove());
        
        const jobTitles = userData?.jobTitles || [];
        jobTitles.forEach(title => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.tabIndex = 0;
            tag.innerHTML = `${title}<span class="tag-close">×</span>`;
            
            tag.querySelector('.tag-close').addEventListener('click', function(e) {
                e.stopPropagation();
                deleteTag(tag);
            });
            
            container.insertBefore(tag, input);
        });
    }

    function cleanUserData() {
        if (!userData || typeof userData !== 'object') {
            window.clientConfig && window.clientConfig.smartLog('fail', 'cleanUserData: invalid userData structure');
            return;
        }
        
        if (!userData?.jobSearchData || typeof userData.jobSearchData !== 'object') {
            window.clientConfig && window.clientConfig.smartLog('buffer', 'cleanUserData: no jobSearchData to clean');
            return;
        }
        
        let hasChanges = false;
        
        if (userData.jobSearchData.allHistoricalResults) {
            delete userData.jobSearchData.allHistoricalResults;
            hasChanges = true;
            window.clientConfig && window.clientConfig.smartLog('buffer', 'cleanUserData: removed allHistoricalResults');
        }
        
        if (userData.jobSearchData.totalOffersScraped) {
            delete userData.jobSearchData.totalOffersScraped;
            hasChanges = true;
            window.clientConfig && window.clientConfig.smartLog('buffer', 'cleanUserData: removed totalOffersScraped');
        }
        
        if (userData.jobSearchData.lastSearchResults && Array.isArray(userData.jobSearchData.lastSearchResults)) {
            const originalLength = userData.jobSearchData.lastSearchResults.length;
            const cleanResults = userData.jobSearchData.lastSearchResults
                .filter(result => result && typeof result === 'object')
                .map(result => ({
                    title: result.title || '',
                    url: result.url || '',
                    description: result.description || '',
                    date: result.date || '',
                    source: result.source || '',
                    confidence: result.confidence || 0
                }));
            
            if (cleanResults.length !== originalLength || JSON.stringify(cleanResults) !== JSON.stringify(userData.jobSearchData.lastSearchResults)) {
                userData.jobSearchData.lastSearchResults = cleanResults;
                hasChanges = true;
                window.clientConfig && window.clientConfig.smartLog('buffer', `cleanUserData: cleaned ${originalLength} -> ${cleanResults.length} search results`);
            }
        }
        
        if (hasChanges) {
            window.clientConfig && window.clientConfig.smartLog('win', 'cleanUserData: data structure optimized (no auto-save)');
        } else {
            window.clientConfig && window.clientConfig.smartLog('buffer', 'cleanUserData: no changes needed');
        }
    }

    function populateCareerPages() {
        const container = document.getElementById('careerUrlsContainer');
        const input = document.getElementById('careerUrlInput');
        if (!container || !input) return;
        
        container.querySelectorAll('.tag').forEach(tag => tag.remove());
        
        const activeList = getCurrentActiveList();
        const currentUrls = userData?.careerPageLists?.[activeList] || [];
        
        const listSelector = document.getElementById('listSelector');
        if (listSelector) {
            listSelector.value = activeList;
        }
        
        currentUrls.forEach(page => {
            if (page?.url) {
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.tabIndex = 0;
                tag.innerHTML = `${page.url}<span class="tag-close">×</span>`;
                
                tag.querySelector('.tag-close').addEventListener('click', function(e) {
                    e.stopPropagation();
                    deleteTag(tag);
                });
                
                container.insertBefore(tag, input);
            }
        });
        
        if (userData?.showFavoritesInCareerList) {
            const favoriteCompanies = Object.values(userData?.companies || {})
                .filter(company => company?.favorite && (company?.career || company?.website || company?.linkedin))
                .filter(company => {
                    const careerUrl = company.career || company.website || company.linkedin;
                    return !currentUrls.some(page => page?.url === careerUrl);
                });
            
            favoriteCompanies.forEach(company => {
                const careerUrl = company.career || company.website || company.linkedin;
                const tag = document.createElement('div');
                tag.className = 'tag favorite-tag';
                tag.tabIndex = 0;
                
                const cleanUrl = careerUrl.replace(/^https?:\/\/(www\.)?/, '').split('?')[0].split('#')[0];
                
                tag.innerHTML = `
                    ${cleanUrl}
                    <span class="tag-badge favorite-badge" title="Click to hide from list" data-company="${company?.name || ''}">
                        <i class="fas fa-star" style="color: #f1c40f; font-size: 0.8rem;"></i>
                    </span>
                    <span class="tag-close" title="Delete favorite permanently">×</span>
                `;
                
                tag.querySelector('.tag-close').addEventListener('click', function(e) {
                    e.stopPropagation();
                    deleteTag(tag);
                });
                
                tag.querySelector('.favorite-badge').addEventListener('click', function(e) {
                    e.stopPropagation();
                    userData.showFavoritesInCareerList = false;
                    if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
                    populateCareerPages();
                    updateFavoritesButton();
                    showToast('info', 'Favorites hidden from career URLs list');
                });
                
                container.insertBefore(tag, input);
            });
        }

        ['A', 'B', 'C'].forEach(selection => {
            if (userData?.[`showSelection${selection}InCareerList`]) {
                const selectionCompanies = Object.values(userData?.companies || {})
                    .filter(company => company?.selection === selection && (company?.career || company?.website || company?.linkedin))
                    .filter(company => {
                        const careerUrl = company.career || company.website || company.linkedin;
                        return !currentUrls.some(page => page?.url === careerUrl) &&
                               !Object.values(userData?.companies || {})
                                   .filter(c => c?.favorite && userData?.showFavoritesInCareerList)
                                   .some(c => (c?.career || c?.website || c?.linkedin) === careerUrl);
                    });
                
                selectionCompanies.forEach(company => {
                    const careerUrl = company.career || company.website || company.linkedin;
                    const tag = document.createElement('div');
                    tag.className = 'tag selection-tag';
                    tag.setAttribute('data-selection', selection);
                    tag.tabIndex = 0;
                    
                    const cleanUrl = careerUrl.replace(/^https?:\/\/(www\.)?/, '').split('?')[0].split('#')[0];
                    
                    const selectionColors = {
                        'A': '#e74c3c',
                        'B': '#3498db',
                        'C': '#2ecc71'
                    };
                    
                    tag.innerHTML = `
                        ${cleanUrl}
                        <span class="tag-badge selection-badge" title="Click to hide selection ${selection} from list" data-company="${company?.name || ''}" data-selection="${selection}">
                            <i class="fas fa-tag" style="color: ${selectionColors[selection]}; font-size: 0.8rem;"></i>
                            <span style="color: ${selectionColors[selection]}; font-size: 0.7rem; font-weight: bold; margin-left: 2px;">${selection}</span>
                        </span>
                        <span class="tag-close" title="Remove from selection ${selection} permanently">×</span>
                    `;
                    
                    tag.querySelector('.tag-close').addEventListener('click', function(e) {
                        e.stopPropagation();
                        deleteTag(tag);
                    });
                    
                    tag.querySelector('.selection-badge').addEventListener('click', function(e) {
                        e.stopPropagation();
                        userData[`showSelection${selection}InCareerList`] = false;
                        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
                        populateCareerPages();
                        updateSelectionButtons();
                        showToast('info', `Selection ${selection} hidden from career URLs list`);
                    });
                    
                    container.insertBefore(tag, input);
                });
            }
        });
    }

    function addApplicationDirectly(jobTitle, companyName, location, website, career) {
        if (!companyName) {
            showToast('error', 'Company name is required');
            return;
        }
        
        const companyId = generateId(companyName);
        
        ensureJobSearchDefaults(userData);
        if (!userData.companies[companyId]) userData.companies[companyId] = {};
        
        userData.companies[companyId].name = companyName;
        userData.companies[companyId].location = location;
        userData.companies[companyId].website = website;
        userData.companies[companyId].career = career;
        userData.companies[companyId].type = 'VFX';
        userData.companies[companyId].appliedDate = new Date().toISOString().split('T')[0];
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
        
        if (window.applicationsModule?.populateCompaniesTable) {
            window.applicationsModule.populateCompaniesTable();
        }
        
        if (window.dashboardModule?.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        showToast('success', 'Company added to applications');
        
        setTimeout(() => {
            const applicationTab = document.querySelector('.nav-item[data-page="applications"]');
            if (applicationTab) applicationTab.click();
        }, 500);
    }

    async function updateSearchLimits() {
        try {
            window.clientConfig&&window.clientConfig.smartLog('buffer','[LIMITS] Fetching user limits...');
            const response = await fetch('/plan/limits');
            const data = await response.json();
            
            window.clientConfig&&window.clientConfig.smartLog('buffer','[LIMITS] Response:', data);
            
            if (data.success) {
                const statusBar = document.getElementById('searchStatusBar');
                const remainingText = document.getElementById('remainingSearchesText');
                const upgradeLink = statusBar?.querySelector('.upgrade-link');
                
                if (statusBar && remainingText) {
                    const currentPlan = data.plan;
                    const isFreePlan = currentPlan === 'free';
                    const isProPlan = currentPlan === 'pro';
                    const isStandardPlan = currentPlan === 'standard';
                    const canPerformLiveSearch = data.restrictions?.canPerformLiveSearch || false;
                    
                    window.clientConfig&&window.clientConfig.smartLog('buffer',`[LIMITS] Plan: ${currentPlan}, Live search: ${canPerformLiveSearch}`);
                    
                    statusBar.style.display = 'flex';
                    statusBar.className = 'search-status-bar';
                    
                    if (isProPlan) {
                        statusBar.classList.add('pro-plan');
                    } else if (isStandardPlan) {
                        statusBar.classList.add('standard-plan');
                    } else if (isFreePlan) {
                        statusBar.classList.add('free-plan');
                    }
                    
                    if (isFreePlan) {
                        remainingText.textContent = 'Free plan - Cache search only';
                        if (upgradeLink) upgradeLink.style.display = 'block';
                    } else if (canPerformLiveSearch) {
                        const used = data.usage?.scrapingRequests || 0;
                        const limit = data.limits?.maxScrapingRequests || 0;
                        const remaining = limit - used;
                        
                        remainingText.textContent = `${used}/${limit} live searches used`;
                        window.clientConfig&&window.clientConfig.smartLog('buffer',`[LIMITS] Usage: ${used}/${limit} (${remaining} remaining)`);
                        
                        if (remaining === 0) {
                            statusBar.classList.add('limit-reached');
                            if (upgradeLink) {
                                upgradeLink.style.display = isProPlan ? 'none' : 'block';
                            }
                        } else {
                            if (upgradeLink) {
                                upgradeLink.style.display = isProPlan ? 'none' : 'block';
                            }
                        }
                        
                        if (remaining <= 5 && remaining > 0 && !isProPlan) {
                            statusBar.classList.add('limit-warning');
                        }
                    } else {
                        remainingText.textContent = 'Cache searches only';
                        statusBar.classList.add('free-plan');
                        if (upgradeLink) upgradeLink.style.display = 'block';
                    }
                } else {
                    window.clientConfig&&window.clientConfig.smartLog('fail','[LIMITS] Status bar elements not found');
                }
            } else {
                window.clientConfig&&window.clientConfig.smartLog('fail','[LIMITS] API error:', data.message);
            }
        } catch (error) {
            window.clientConfig&&window.clientConfig.smartLog('fail','[LIMITS] Error updating search limits:', error);
        }
    }

    window.getComponentData = function() {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Saving job search component state');
        
        if (!userData?.jobSearchData) return { savedInUserData: true };
        
        const activeButton = document.querySelector('.site-buttons .site-button.active');
        const currentSite = activeButton ? activeButton.getAttribute('data-site') : 'career-pages';
        
        userData.jobSearchData.selectedSite = currentSite;
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData).then(result => {
        if (result && result.success) {
            window.userData = userData;
            window.clientConfig && window.clientConfig.smartLog('win', 'Data saved and propagated');
        }
    });
}
        
        return { 
            savedInUserData: true,
            timestamp: Date.now()
        };
    };

    window.setComponentData = function(data) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Restoring job search component state');
        
        if (!isDataReady) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Data not ready yet, retrying...');
            setTimeout(() => window.setComponentData(data), 300);
            return;
        }
        
        setTimeout(() => {
            ensureJobSearchDefaults(userData);
            populateAllFields();
            restoreSearchState();
        }, 100);
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJobSearch);
    } else {
        initJobSearch();
    }
    
    window.jobSearchModule = {
        populateJobTitles,
        populateCareerPages,
        performJobSearch: performJobSearchWithNotifications,
        performCacheOnlySearch: performCacheOnlySearchWithNotifications,
        addApplicationDirectly,
        initJobSearch,
        exportCareerUrls,
        exportJobResultsToHTML,
        openFavoritesManager,
        openSelectionManager,
        updateFavoritesButton,
        updateSelectionButtons,
        toggleCompanyFavorite: window.toggleCompanyFavorite,
        toggleCompanySelection: window.toggleCompanySelection,
        getCurrentActiveList,
        toggleFavoritesVisibility,
        toggleSelectionVisibility,
        showElegantConfirm,
        showLimitExceededModal,
        checkUserPlan,
        updateExportButtonVisibility,
        ensureJobSearchDefaults
    };
})();