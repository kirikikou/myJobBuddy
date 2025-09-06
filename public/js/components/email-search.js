let domains = [];
let allResults = [];
let isSearching = false;
let eventSource = null;
let searchStartTime = null;
let totalProcessed = 0;
let cacheHits = 0;
let explorationCount = 0;
let filteredResults = [];
let countdownInterval = null;
let countdownFinished = false;
let searchResultsReceived = false;
let pendingResults = null;
let userPlan = 'free';
let emailSearchLimits = null;

function initEmailSearch() {
    window.clientConfig&&window.clientConfig.smartLog('buffer','Initializing Email Search...');
    
    setupEventListeners();
    updateDomainsDisplay();
    updateEmailSearchLimits();
    initializeComponentI18n();
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateEmailSearchLimits();
        }
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

async function updateEmailSearchLimits() {
    try {
        window.clientConfig&&window.clientConfig.smartLog('buffer','[EMAIL-LIMITS] Fetching email search limits...');
        const response = await fetch('/email-limits/status');
        const data = await response.json();
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','[EMAIL-LIMITS] Response:', data);
        
        if (data.success) {
            emailSearchLimits = data;
            userPlan = data.plan || 'free';
            
            const emailStatusBar = document.getElementById('emailSearchStatusBar');
            const emailRemainingText = document.getElementById('remainingEmailSearchesText');
            const emailUpgradeLink = emailStatusBar?.querySelector('.upgrade-link');
            
            if (emailStatusBar && emailRemainingText) {
                const currentPlan = data.plan;
                const isFreePlan = currentPlan === 'free';
                const canUseLive = data.limits.canUseLive;
                
                window.clientConfig&&window.clientConfig.smartLog('buffer',`[EMAIL-LIMITS] Plan: ${currentPlan}, Live search: ${canUseLive}`);
                
                emailStatusBar.style.display = 'flex';
                emailStatusBar.className = 'email-search-status-bar';
                
                if (currentPlan === 'pro') {
                    emailStatusBar.classList.add('pro-plan');
                } else if (currentPlan === 'standard') {
                    emailStatusBar.classList.add('standard-plan');
                } else if (isFreePlan) {
                    emailStatusBar.classList.add('free-plan');
                }
                
                if (isFreePlan) {
                    emailRemainingText.innerHTML = `
                        <i class="fas fa-envelope"></i> 
                        Email: ${data.usage.cacheSearches}/${data.limits.cacheSearches} cache searches used (Free plan)
                    `;
                    if (emailUpgradeLink) emailUpgradeLink.style.display = 'block';
                } else if (canUseLive) {
                    const liveUsed = data.usage.liveSearches || 0;
                    const liveLimit = data.limits.liveSearches || 0;
                    const cacheUsed = data.usage.cacheSearches || 0;
                    const cacheLimit = data.limits.cacheSearches || 0;
                    
                    emailRemainingText.innerHTML = `
                        <i class="fas fa-envelope"></i> 
                        Email: ${liveUsed}/${liveLimit} live • ${cacheUsed}/${cacheLimit} cache searches
                    `;
                    
                    window.clientConfig&&window.clientConfig.smartLog('buffer',`[EMAIL-LIMITS] Live: ${liveUsed}/${liveLimit}, Cache: ${cacheUsed}/${cacheLimit}`);
                    
                    if (data.remaining.liveSearches === 0 && data.remaining.cacheSearches === 0) {
                        emailStatusBar.classList.add('limit-reached');
                        if (emailUpgradeLink) {
                            emailUpgradeLink.style.display = currentPlan === 'pro' ? 'none' : 'block';  
                        }
                    } else {
                        if (emailUpgradeLink) {
                            emailUpgradeLink.style.display = currentPlan === 'pro' ? 'none' : 'block';
                        }
                    }
                    
                    if ((data.remaining.liveSearches <= 2 || data.remaining.cacheSearches <= 2) && currentPlan !== 'pro') {
                        emailStatusBar.classList.add('limit-warning');
                    }
                } else {
                    const cacheUsed = data.usage.cacheSearches || 0;
                    const cacheLimit = data.limits.cacheSearches || 0;
                    
                    emailRemainingText.innerHTML = `
                        <i class="fas fa-envelope"></i> 
                        Email: ${cacheUsed}/${cacheLimit} cache searches only
                    `;
                    emailStatusBar.classList.add('cache-only');
                    if (emailUpgradeLink) emailUpgradeLink.style.display = 'block';
                }

                updateActionButtons(data);
            } else {
                window.clientConfig&&window.clientConfig.smartLog('fail','[EMAIL-LIMITS] Status bar elements not found');
            }
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','[EMAIL-LIMITS] API error:', data.message);
        }
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','[EMAIL-LIMITS] Error updating email search limits:', error);
    }
}

function updateActionButtons(limitsData) {
    const liveButton = document.getElementById('start-discovery-action');
    const cacheButton = document.getElementById('search-emails-cache-action');
    
    if (!liveButton) return;

    if (limitsData.limits.canUseLive && limitsData.remaining.liveSearches > 0) {
        liveButton.disabled = false;
        liveButton.style.opacity = '1';
        liveButton.title = `${limitsData.remaining.liveSearches} live searches remaining`;
    } else {
        liveButton.disabled = true;
        liveButton.style.opacity = '0.5';
        liveButton.title = limitsData.limits.canUseLive ? 'No live searches remaining' : 'Live search not available for your plan';
    }

    if (cacheButton) {
        if (limitsData.remaining.cacheSearches > 0) {
            cacheButton.disabled = false;
            cacheButton.style.opacity = '1';
            cacheButton.title = `${limitsData.remaining.cacheSearches} cache searches remaining`;
        } else {
            cacheButton.disabled = true;
            cacheButton.style.opacity = '0.5';
            cacheButton.title = 'No cache searches remaining';
        }
    }
}

function setupEventListeners() {
    const domainInput = document.getElementById('domainInput');
    if (domainInput) {
        domainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addDomain();
            }
        });
    }
    
    const clearAllBtn = document.getElementById('clearAllDomains');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', clearAllDomains);
    }
    
    const startBtn = document.getElementById('start-discovery-action');
    if (startBtn) {
        startBtn.addEventListener('click', startDiscovery);
    }

    const cacheBtn = document.getElementById('search-emails-cache-action');
    if (cacheBtn) {
        cacheBtn.addEventListener('click', startCacheOnlySearch);
    }
    
    const exportBtn = document.getElementById('exportEmailResults');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportResults);
    }

    const clearFilters = document.getElementById('clearAllFilters');
    if (clearFilters) {
        clearFilters.addEventListener('click', clearAllFilters);
    }
}

function addDomain() {
    const input = document.getElementById('domainInput');
    let inputValue = input.value.trim();
    
    if (!inputValue) return;
    
    const domainList = inputValue.split(',').map(d => d.trim()).filter(d => d);
    let addedCount = 0;
    let skippedCount = 0;
    
    domainList.forEach(domainString => {
        let urlToStore = domainString;
        
        let cleanDomain = domainString.replace(/^https?:\/\//, '');
        cleanDomain = cleanDomain.replace(/^www\./, '');
        cleanDomain = cleanDomain.replace(/\/$/, '');
        
        const domainParts = cleanDomain.split('/');
        const domainOnly = domainParts[0];
        
        const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
        
        if (domainRegex.test(domainOnly) && !domains.some(d => d.domain === domainOnly)) {
            if (!urlToStore.startsWith('http://') && !urlToStore.startsWith('https://')) {
                urlToStore = 'https://' + urlToStore;
            }
            
            domains.push({
                domain: domainOnly,
                url: urlToStore,
                display: domainOnly
            });
            addedCount++;
        } else if (domains.some(d => d.domain === domainOnly)) {
            skippedCount++;
        } else {
            window.clientConfig&&window.clientConfig.smartLog('buffer',`Invalid domain skipped: ${domainString}`);
        }
    });
    
    updateDomainsDisplay();
    
    if (addedCount > 0) {
        let message = `Added ${addedCount} domain${addedCount > 1 ? 's' : ''} to search list`;
        if (skippedCount > 0) {
            message += ` (${skippedCount} duplicate${skippedCount > 1 ? 's' : ''} skipped)`;
        }
        showSuccess(message);
    } else if (skippedCount > 0) {
        showError('domainError', 'All domains were already in the list');
    } else {
        showError('domainError', 'No valid domains found. Please check your input.');
    }
    
    input.value = '';
    clearError('domainError');
}

function removeDomain(index) {
    const removed = domains[index];
    domains.splice(index, 1);
    updateDomainsDisplay();
    showSuccess(`Removed ${removed.display}`);
}

function clearAllDomains() {
    if (domains.length > 0 && confirm('Clear all domains?')) {
        domains = [];
        updateDomainsDisplay();
        showSuccess('All domains cleared');
    }
}

function updateDomainsDisplay() {
    const container = document.getElementById('domainsContainer');
    const input = container.querySelector('input');
    
    container.querySelectorAll('.domain-tag').forEach(tag => tag.remove());
    
    domains.forEach((domainObj, index) => {
        const tag = document.createElement('div');
        tag.className = 'domain-tag';
        tag.innerHTML = `
            <span>${domainObj.display}</span>
            <button onclick="removeDomain(${index})" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.insertBefore(tag, input);
    });
}

async function startDiscovery() {
    if (domains.length === 0) {
        showError('domainError', 'Please add at least one domain');
        return;
    }
    
    if (isSearching) {
        showWarning('Search already in progress');
        return;
    }

    if (!emailSearchLimits) {
        await updateEmailSearchLimits();
    }

    if (emailSearchLimits && !emailSearchLimits.limits.canUseLive) {
        showLimitExceededModal('LIVE_EMAIL_SEARCH_NOT_ALLOWED', domains.length, 0, userPlan);
        return;
    }

    if (emailSearchLimits && emailSearchLimits.remaining.liveSearches <= 0) {
        showLimitExceededModal('EMAIL_LIVE_LIMIT_EXCEEDED', domains.length, emailSearchLimits.remaining.liveSearches, userPlan);
        return;
    }
    
    isSearching = true;
    searchStartTime = Date.now();
    totalProcessed = 0;
    cacheHits = 0;
    explorationCount = 0;
    allResults = [];
    countdownFinished = false;
    searchResultsReceived = false;
    pendingResults = null;
    
    document.getElementById('start-discovery-action').disabled = true;
    document.getElementById('searchProgress').style.display = 'block';
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('resultsStats').style.display = 'none';
    
    updateProgressText(`Starting exploration of ${domains.length} domain${domains.length > 1 ? 's' : ''}...`);
    
    startIndependentCountdown(domains.length * 15, domains.length);
    
    const params = new URLSearchParams({
        domains: JSON.stringify(domains.map(d => d.url)),
        maxDepth: 2,
        forceRefresh: 'false'
    });

    const url = `/email/explore-domains-stream?${params}`;
    
    try {
        eventSource = new EventSource(url);
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleStreamEvent(data);
            } catch (error) {
                window.clientConfig&&window.clientConfig.smartLog('fail','Error parsing stream data:', error);
            }
        };

        eventSource.onerror = (error) => {
            window.clientConfig&&window.clientConfig.smartLog('fail','EventSource error:', error);
            handleStreamError('Connection error during email exploration');
        };

    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','Error starting email exploration stream:', error);
        handleStreamError(error.message);
    }
}

async function startCacheOnlySearch() {
    if (domains.length === 0) {
        showError('domainError', 'Please add at least one domain');
        return;
    }
    
    if (isSearching) {
        showWarning('Search already in progress');
        return;
    }

    if (!emailSearchLimits) {
        await updateEmailSearchLimits();
    }

    if (emailSearchLimits && emailSearchLimits.remaining.cacheSearches <= 0) {
        showLimitExceededModal('EMAIL_CACHE_LIMIT_EXCEEDED', domains.length, emailSearchLimits.remaining.cacheSearches, userPlan);
        return;
    }

    isSearching = true;
    searchStartTime = Date.now();
    
    document.getElementById('start-discovery-action').disabled = true;
    if (document.getElementById('search-emails-cache-action')) {
        document.getElementById('search-emails-cache-action').disabled = true;
    }
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('resultsStats').style.display = 'none';

    try {
        const response = await fetch('/email/search-cache-only', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domains: domains.map(d => d.url)
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            
            if (response.status === 429) {
                showLimitExceededModal(
                    errorData.errorType,
                    errorData.needed || 0,
                    errorData.available || 0,
                    errorData.userPlan || userPlan
                );
                return;
            }
            
            throw new Error(errorData.message || `Request failed (${response.status})`);
        }

        const data = await response.json();
        
        allResults = data.results || [];
        
        displayResults({
            success: true,
            results: allResults,
            summary: data.summary
        });
        
        const summary = data.summary || {};
        showSuccess(`Cache search complete! Found ${summary.totalEmailsFound || 0} emails from cache`);
        
        await updateEmailSearchLimits();

    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','Error during cache email search:', error);
        showError('', 'Cache search failed: ' + error.message);
    } finally {
        resetUI();
        isSearching = false;
    }
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
    
    let displayType = 'Email Search';
    if (limitType === 'EMAIL_LIVE_LIMIT_EXCEEDED') {
        displayType = 'Live Email Search';
    } else if (limitType === 'EMAIL_CACHE_LIMIT_EXCEEDED') {
        displayType = 'Email Cache Search';
    } else if (limitType === 'LIVE_EMAIL_SEARCH_NOT_ALLOWED') {
        displayType = 'Live Email Search';
    }
    
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
                ${displayType} Limit Exceeded
            </h3>
            <button class="modal-close" type="button" style="background: transparent; border: none; color: rgba(255, 255, 255, 0.5); font-size: 1.5rem; cursor: pointer; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease;">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div style="padding: 32px; text-align: center;">
            <div style="margin-bottom: 24px;">
                <div style="display: inline-block; background: rgba(255, 71, 87, 0.1); border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <i class="fas fa-envelope" style="color: #ff4757; font-size: 2.5rem;"></i>
                </div>
            </div>
            
            <h4 style="color: rgba(255, 255, 255, 0.9); margin-bottom: 16px; font-size: 1.2rem;">
                <strong>${displayType}</strong> limit reached for your 
                <span style="background: ${planColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.9rem; text-transform: uppercase; font-weight: 600; margin: 0 4px;">${currentPlan}</span> 
                plan
            </h4>
            
            ${limitType !== 'LIVE_EMAIL_SEARCH_NOT_ALLOWED' ? `
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
            ` : ''}
            
            <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 24px; line-height: 1.5; font-size: 1rem;">
                ${limitType === 'LIVE_EMAIL_SEARCH_NOT_ALLOWED' ?
                    'Live email search is not available for Free plan users. Upgrade to unlock live email discovery!' :
                    currentPlan === 'pro' ? 
                        'You have reached your daily email search limit. Credits reset at midnight.' :
                        'Upgrade your plan to get more email search credits and unlock unlimited searching power!'
                }
            </p>
        </div>
        
        <div style="padding: 16px 32px; border-top: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: ${currentPlan === 'pro' && limitType !== 'LIVE_EMAIL_SEARCH_NOT_ALLOWED' ? 'center' : 'space-between'}; gap: 12px;">
            ${currentPlan !== 'pro' || limitType === 'LIVE_EMAIL_SEARCH_NOT_ALLOWED' ? `
                <button class="upgrade-btn" type="button" style="flex: 1; padding: 14px 24px; font-weight: 600; border-radius: 50px; transition: all 0.2s ease; background: linear-gradient(to right, #4f6df5, #8d67f7); color: white; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(79, 109, 245, 0.3); display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-arrow-up"></i> Upgrade Plan
                </button>
            ` : ''}
            <button class="cancel-btn" type="button" style="${currentPlan === 'pro' && limitType !== 'LIVE_EMAIL_SEARCH_NOT_ALLOWED' ? 'flex: 1; ' : ''}min-width: 120px; padding: 14px 24px; font-weight: 600; border-radius: 50px; transition: all 0.2s ease; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fas fa-times"></i> ${currentPlan === 'pro' && limitType !== 'LIVE_EMAIL_SEARCH_NOT_ALLOWED' ? 'Close' : 'Cancel'}
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
        upgradeBtn.addEventListener('click', (e) => {
            e.preventDefault();
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

function startIndependentCountdown(totalSeconds, domainsCount) {
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
                    <i class="fas fa-envelope search-icon-main"></i>
                    <div class="search-pulse"></div>
                </div>
                <div class="loading-text">
                    <h3>Discovering Email Addresses</h3>
                    <p>Exploring ${domainsCount} domain${domainsCount > 1 ? 's' : ''} for contact information</p>
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
                    <i class="fas fa-envelope"></i>
                    <span class="stat-value">?</span>
                    <span class="stat-label">emails</span>
                </div>
            </div>
            
            <div class="loading-progress-bar">
                <div class="progress-bar-fill" id="progressBarFill"></div>
                <div class="progress-bar-text" id="progressBarText">Initializing exploration...</div>
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
    
    if (!document.querySelector('#advanced-loading-styles')) {
        const styles = document.createElement('style');
        styles.id = 'advanced-loading-styles';
        styles.textContent = `
            .advanced-loading-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 2rem;
                background: linear-gradient(135deg, rgba(26, 31, 54, 0.95) 0%, rgba(16, 20, 36, 0.95) 100%);
                border-radius: 20px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                position: relative;
                overflow: hidden;
            }
            
            .advanced-loading-container::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
                animation: shimmer 3s infinite;
            }
            
            @keyframes shimmer {
                0% { left: -100%; }
                100% { left: 100%; }
            }
            
            .loading-header {
                display: flex;
                align-items: center;
                gap: 1.5rem;
                margin-bottom: 2rem;
                text-align: center;
            }
            
            .search-icon-container {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .search-icon-main {
                font-size: 2.5rem;
                color: #4f6df5;
                animation: searchPulse 2s ease-in-out infinite;
                z-index: 2;
                position: relative;
            }
            
            .search-pulse {
                position: absolute;
                width: 60px;
                height: 60px;
                border: 2px solid #4f6df5;
                border-radius: 50%;
                animation: pulseRing 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
                opacity: 0;
            }
            
            @keyframes searchPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            
            @keyframes pulseRing {
                0% {
                    opacity: 1;
                    transform: scale(0.33);
                }
                80%, 100% {
                    opacity: 0;
                    transform: scale(1.33);
                }
            }
            
            .loading-text h3 {
                font-size: 1.5rem;
                font-weight: 600;
                background: linear-gradient(135deg, #4f6df5, #8d67f7);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                margin: 0 0 0.5rem 0;
            }
            
            .loading-text p {
                color: rgba(255, 255, 255, 0.7);
                margin: 0;
                font-size: 0.95rem;
            }
            
            .countdown-display {
                margin-bottom: 2rem;
                position: relative;
            }
            
            .circular-progress {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .progress-ring {
                transform: rotate(-90deg);
                filter: drop-shadow(0 0 10px rgba(79, 109, 245, 0.3));
            }
            
            .progress-ring-background {
                fill: none;
                stroke: rgba(255, 255, 255, 0.1);
                stroke-width: 4;
            }
            
            .progress-ring-progress {
                fill: none;
                stroke: url(#progressGradient);
                stroke-width: 4;
                stroke-linecap: round;
                stroke-dasharray: 314.16;
                stroke-dashoffset: 314.16;
                transition: stroke-dashoffset 0.5s ease;
                animation: progressGlow 2s ease-in-out infinite alternate;
            }
            
            @keyframes progressGlow {
                0% { filter: drop-shadow(0 0 5px rgba(79, 109, 245, 0.5)); }
                100% { filter: drop-shadow(0 0 15px rgba(79, 109, 245, 0.8)); }
            }
            
            .progress-content {
                position: absolute;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            
            .time-remaining {
                font-size: 1.8rem;
                font-weight: 700;
                color: #4f6df5;
                display: flex;
                align-items: center;
                gap: 0.2rem;
                text-shadow: 0 0 10px rgba(79, 109, 245, 0.5);
                animation: timeGlow 2s ease-in-out infinite alternate;
            }
            
            @keyframes timeGlow {
                0% { text-shadow: 0 0 10px rgba(79, 109, 245, 0.5); }
                100% { text-shadow: 0 0 20px rgba(79, 109, 245, 0.8); }
            }
            
            .separator {
                animation: blink 1s infinite;
            }
            
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0.3; }
            }
            
            .progress-label {
                font-size: 0.8rem;
                color: rgba(255, 255, 255, 0.6);
                margin-top: 0.3rem;
            }
            
            .loading-stats {
                display: flex;
                gap: 2rem;
                margin-bottom: 2rem;
                flex-wrap: wrap;
                justify-content: center;
            }
            
            .stat-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.5rem;
                padding: 1rem;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.05);
                min-width: 80px;
                transition: all 0.3s ease;
            }
            
            .stat-item:hover {
                background: rgba(255, 255, 255, 0.05);
                transform: translateY(-2px);
            }
            
            .stat-item i {
                font-size: 1.2rem;
                color: #8d67f7;
            }
            
            .stat-value {
                font-size: 1.1rem;
                font-weight: 600;
                color: #4f6df5;
            }
            
            .stat-label {
                font-size: 0.75rem;
                color: rgba(255, 255, 255, 0.6);
            }
            
            .loading-progress-bar {
                width: 100%;
                max-width: 400px;
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                overflow: hidden;
                margin-bottom: 1.5rem;
                position: relative;
            }
            
            .progress-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #4f6df5, #8d67f7);
                border-radius: 3px;
                width: 0%;
                transition: width 0.3s ease;
                position: relative;
            }
            
            .progress-bar-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
                animation: progressShimmer 2s infinite;
            }
            
            @keyframes progressShimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            
            .progress-bar-text {
                text-align: center;
                margin-top: 0.5rem;
                font-size: 0.85rem;
                color: rgba(255, 255, 255, 0.7);
            }
            
            .loading-dots {
                display: flex;
                gap: 0.5rem;
                margin-top: 1rem;
            }
            
            .dot {
                width: 8px;
                height: 8px;
                background: #4f6df5;
                border-radius: 50%;
                animation: dotBounce 1.4s infinite ease-in-out;
            }
            
            .dot:nth-child(1) { animation-delay: -0.32s; }
            .dot:nth-child(2) { animation-delay: -0.16s; }
            .dot:nth-child(3) { animation-delay: 0s; }
            .dot:nth-child(4) { animation-delay: 0.16s; }
            .dot:nth-child(5) { animation-delay: 0.32s; }
            
            @keyframes dotBounce {
                0%, 80%, 100% {
                    transform: scale(0.8);
                    opacity: 0.5;
                }
                40% {
                    transform: scale(1.2);
                    opacity: 1;
                }
            }
            
            .waiting-for-results {
                background: linear-gradient(135deg, #2ed573, #1dd1a1);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
            }
            
            .waiting-icon {
                color: #2ed573 !important;
            }
            
            .waiting-pulse {
                border-color: #2ed573 !important;
            }
            
            .waiting-dots .dot {
                background: #2ed573;
            }
            
            @media (max-width: 768px) {
                .advanced-loading-container {
                    padding: 1.5rem;
                }
                
                .loading-header {
                    flex-direction: column;
                    gap: 1rem;
                }
                
                .loading-stats {
                    gap: 1rem;
                }
                
                .stat-item {
                    min-width: 60px;
                    padding: 0.8rem;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    const progressRing = loadingIndicator.querySelector('.progress-ring');
    if (progressRing && !progressRing.querySelector('#progressGradient')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.id = 'progressGradient';
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '100%');
        gradient.setAttribute('y2', '100%');
        
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', '#4f6df5');
        
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', '#8d67f7');
        
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        progressRing.appendChild(defs);
    }
    
    const timeDisplay = loadingIndicator.querySelector('#timeDisplay');
    const progressRingProgress = loadingIndicator.querySelector('.progress-ring-progress');
    const progressBarFill = loadingIndicator.querySelector('#progressBarFill');
    const progressBarText = loadingIndicator.querySelector('#progressBarText');
    
    const updateDisplay = () => {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        
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
                'Initializing exploration...',
                'Connecting to domains...',
                'Analyzing pages...',
                'Extracting emails...',
                'Processing results...',
                'Finalizing discovery...'
            ];
            const phaseIndex = Math.floor((progressPercent / 100) * phases.length);
            progressBarText.textContent = phases[Math.min(phaseIndex, phases.length - 1)];
        }
        
        if (remainingSeconds <= 30) {
            document.documentElement.style.setProperty('--countdown-color', '#ff4757');
        } else if (remainingSeconds <= 60) {
            document.documentElement.style.setProperty('--countdown-color', '#ff6b81');
        } else {
            document.documentElement.style.setProperty('--countdown-color', '#4f6df5');
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
                    <p>Your exploration is taking longer than expected...</p>
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

function handleStreamEvent(data) {
    window.clientConfig&&window.clientConfig.smartLog('buffer','Email stream event:', data.phase, data);

    switch (data.phase) {
        case 'starting':
            updateProgressText(`Starting exploration of ${data.totalDomains} domains...`);
            break;
        case 'cache':
            cacheHits = data.cacheHits;
            updateProgressText(`Found ${data.cacheHits} cached email explorations`);
            break;
        case 'cache-result':
            updateProgressText(`Cache: ${data.domain} - ${data.emailsFound} emails`);
            break;
        case 'cache-complete':
            allResults = data.results || [];
            updateProgressText(`Cache complete: ${data.cacheHits} domains processed`);
            updateResultsDisplay();
            break;
        case 'exploration-starting':
            updateProgressText(`Starting fresh exploration of ${data.domainsToExplore} domains...`);
            break;
        case 'exploring':
            updateProgressText(`Exploring: ${data.domain}... (${data.progress})`);
            break;
        case 'exploration-progress':
            explorationCount++;
            updateProgressText(`${data.domain}: ${data.emailsFound} emails found (${data.progress})`);
            updateResultFromStream(data);
            updateResultsDisplay();
            break;
        case 'exploration-error':
            updateProgressText(`Error exploring ${data.domain}: ${data.error}`);
            updateResultFromStream(data, true);
            updateResultsDisplay();
            break;
        case 'complete':
            window.clientConfig&&window.clientConfig.smartLog('buffer','[COMPLETE] Received complete event with data:', data);
            handleComplete(data);
            break;
        case 'error':
            if (data.errorType && (data.errorType.includes('LIMIT_EXCEEDED') || data.errorType === 'LIVE_EMAIL_SEARCH_NOT_ALLOWED')) {
                showLimitExceededModal(
                    data.errorType,
                    data.needed || 0,
                    data.available || 0,
                    data.userPlan || userPlan
                );
            } else {
                handleStreamError(data.error);
            }
            break;
        default:
            window.clientConfig&&window.clientConfig.smartLog('buffer','Unknown email stream phase:', data.phase);
    }
}

function updateResultFromStream(data, isError = false) {
    const existingIndex = allResults.findIndex(r => r.domain === data.domain);
    
    const result = {
        domain: data.domain,
        success: !isError,
        emails: isError ? [] : (data.emails || []),
        stats: {
            totalPages: data.pagesExplored || 0,
            contactPages: 0,
            emailsFound: data.emailsFound || 0,
            uniqueEmails: data.emailsFound || 0,
            errors: isError ? [{ error: data.error }] : []
        },
        fromCache: data.source === 'cache-shared' || data.source === 'cache',
        error: isError ? data.error : null
    };
    
    if (existingIndex >= 0) {
        allResults[existingIndex] = result;
    } else {
        allResults.push(result);
    }
}

function handleComplete(data) {
    window.clientConfig&&window.clientConfig.smartLog('buffer','[HANDLE COMPLETE] Starting with data:', data);
    isSearching = false;
    allResults = data.results || [];
    totalProcessed = data.totalProcessed;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[HANDLE COMPLETE] allResults:', allResults);
    window.clientConfig&&window.clientConfig.smartLog('buffer','[HANDLE COMPLETE] summary:', data.summary);
    
    searchResultsReceived = true;
    pendingResults = {
        results: allResults,
        summary: data.summary
    };
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[HANDLE COMPLETE] pendingResults created:', pendingResults);
    window.clientConfig&&window.clientConfig.smartLog('buffer','[HANDLE COMPLETE] countdownFinished:', countdownFinished, 'countdownInterval:', countdownInterval);
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[HANDLE COMPLETE] Forcing immediate display');
    displayPendingResults();
}

function displayPendingResults() {
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY PENDING] Starting with pendingResults:', pendingResults);
    
    if (!pendingResults) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY PENDING] No pending results - exiting');
        return;
    }
    
    stopCountdownTimer();
    
    const duration = Math.round((Date.now() - searchStartTime) / 1000);
    const summary = pendingResults.summary;
    const results = pendingResults.results;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY PENDING] Duration:', duration, 'Summary:', summary, 'Results count:', results.length);
    
    updateProgressText(`Complete! ${summary.totalEmailsFound || 0} emails found in ${duration}s`);
    
    allResults = results;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY PENDING] Updated allResults:', allResults);
    
    displayResults({
        success: true,
        results: results,
        summary: summary
    });
    
    const creditsUsed = summary.creditsUsed;
    if (creditsUsed) {
        const creditsMsg = [];
        if (creditsUsed.live > 0) creditsMsg.push(`${creditsUsed.live} live`);
        if (creditsUsed.cache > 0) creditsMsg.push(`${creditsUsed.cache} cache`);
        
        if (creditsMsg.length > 0) {
            showSuccess(`Discovery complete! Found ${summary.totalEmailsFound || 0} emails (Used: ${creditsMsg.join(' + ')} credits)`);
        } else {
            showSuccess(`Discovery complete! Found ${summary.totalEmailsFound || 0} emails across ${summary.domainsProcessed || 0} domains`);
        }
    } else {
        showSuccess(`Discovery complete! Found ${summary.totalEmailsFound || 0} emails across ${summary.domainsProcessed || 0} domains`);
    }
    
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    
    resetUI();
    updateEmailSearchLimits();
    
    pendingResults = null;
    countdownFinished = false;
    searchResultsReceived = false;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY PENDING] Completed successfully');
}

function handleStreamError(error) {
    isSearching = false;
    const errorMessage = typeof error === 'string' ? error : 'Email exploration failed';
    
    updateProgressText(`Error: ${errorMessage}`);
    showError('', errorMessage);
    
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    
    stopCountdownTimer();
    resetUI();
}

function updateProgressText(message) {
    const progressElement = document.getElementById('progressText');
    if (progressElement) {
        progressElement.textContent = message;
    }
}

function updateResultsDisplay() {
    if (allResults.length === 0) return;
    
    const totalEmails = allResults.reduce((sum, r) => 
        sum + (r.success && r.emails ? r.emails.length : 0), 0
    );
    
    if (totalEmails > 0) {
        document.getElementById('resultsStats').style.display = 'block';
        document.getElementById('exportEmailResults').style.display = 'inline-flex';
        document.getElementById('resultsFilters').style.display = 'block';
        
        document.getElementById('totalEmails').textContent = totalEmails;
        document.getElementById('totalDomains').textContent = allResults.filter(r => r.success).length;
        document.getElementById('resultsCount').textContent = `(${totalEmails} emails found)`;
        
        applyFilters();
    }
}

function displayResults(data) {
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY RESULTS] Starting with data:', data);
    
    const summary = data.summary || {};
    const results = data.results || [];
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY RESULTS] Summary:', summary, 'Results:', results);
    
    document.getElementById('resultsStats').style.display = 'block';
    document.getElementById('exportEmailResults').style.display = 'inline-flex';
    document.getElementById('resultsFilters').style.display = 'block';
    
    const totalEmailsFound = summary.totalEmailsFound || 0;
    const domainsProcessed = summary.domainsProcessed || 0;
    
    document.getElementById('totalEmails').textContent = totalEmailsFound;
    document.getElementById('totalDomains').textContent = domainsProcessed;
    document.getElementById('resultsCount').textContent = `(${totalEmailsFound} emails found)`;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY RESULTS] Updated stats UI');
    
    let totalPages = 0;
    let totalContactPages = 0;
    
    results.forEach(result => {
        if (result.stats) {
            totalPages += result.stats.totalPages || 0;
            totalContactPages += result.stats.contactPages || 0;
        }
    });
    
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('contactPages').textContent = totalContactPages;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY RESULTS] Setting up filters and applying');
    
    setupFilterListeners();
    applyFilters();
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY RESULTS] Completed successfully');
}

function setupFilterListeners() {
    const domainFilter = document.getElementById('domainFilter');
    const emailFilter = document.getElementById('emailFilter');

    function applyFiltersHandler() {
        applyFilters();
    }

    if (domainFilter) {
        domainFilter.removeEventListener('input', applyFiltersHandler);
        domainFilter.addEventListener('input', applyFiltersHandler);
    }
    if (emailFilter) {
        emailFilter.removeEventListener('input', applyFiltersHandler);
        emailFilter.addEventListener('input', applyFiltersHandler);
    }
}

function applyFilters() {
    window.clientConfig&&window.clientConfig.smartLog('buffer','[APPLY FILTERS] Starting with allResults:', allResults);
    
    const domainFilter = document.getElementById('domainFilter')?.value.toLowerCase() || '';
    const emailFilter = document.getElementById('emailFilter')?.value.toLowerCase() || '';
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[APPLY FILTERS] Filters:', { domainFilter, emailFilter });
    
    filteredResults = [];
    
    for (const result of allResults) {
        if (!result.success || !result.emails) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','[APPLY FILTERS] Skipping result:', result.domain, 'success:', result.success, 'emails:', result.emails);
            continue;
        }
        
        const domainMatch = !domainFilter || result.domain.toLowerCase().includes(domainFilter);
        
        if (domainMatch) {
            const filteredEmails = result.emails.filter(emailData => {
                const emailString = typeof emailData === 'string' ? emailData : (emailData.email || '');
                const emailMatch = !emailFilter || emailString.toLowerCase().includes(emailFilter);
                return emailMatch;
            });
            
            if (filteredEmails.length > 0) {
                filteredResults.push({
                    ...result,
                    emails: filteredEmails
                });
            }
        }
    }
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[APPLY FILTERS] filteredResults:', filteredResults);
    
    displayFilteredResults();
}

function displayFilteredResults() {
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY FILTERED] Starting with filteredResults:', filteredResults);
    
    let totalPages = 0;
    let totalContactPages = 0;
    
    const resultsHtml = filteredResults.map(result => {
        window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY FILTERED] Processing result:', result);
        
        if (!result.success) {
            return `
                <div class="email-result error">
                    <div class="email-address" style="color: var(--danger);">
                        ${result.domain} - Error
                    </div>
                    <div class="email-meta">${result.error}</div>
                </div>
            `;
        }
        
        totalPages += result.stats?.totalPages || 0;
        totalContactPages += result.stats?.contactPages || 0;
        
        if (!result.emails || result.emails.length === 0) {
            return `
                <div class="email-result">
                    <div class="email-address" style="color: var(--text-secondary);">
                        No emails found for ${result.domain}
                    </div>
                    <div class="email-meta">
                        <div><i class="fas fa-file"></i> Explored ${result.stats?.totalPages || 0} pages</div>
                    </div>
                </div>
            `;
        }
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY FILTERED] Processing emails for', result.domain, ':', result.emails);
        
        return result.emails.map(emailData => {
            const emailString = typeof emailData === 'string' ? emailData : (emailData.email || '');
            const pageType = typeof emailData === 'object' && emailData.pageTypes ? 
                (Array.isArray(emailData.pageTypes) ? emailData.pageTypes[0] : emailData.pageTypes) : 'general';
            
            return `
                <div class="email-result">
                    <div class="email-address">
                        <span>${emailString}</span>
                        <div>
                            <button class="copy-button" onclick="copyEmail('${emailString}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                    <div class="email-meta">
                        <div><i class="fas fa-globe"></i> Found on: <strong>${result.domain}</strong></div>
                        <div><i class="fas fa-file"></i> Page type: <strong>${pageType}</strong></div>
                        ${result.fromCache ? '<div><i class="fas fa-database"></i> Source: <strong>Cache</strong></div>' : '<div><i class="fas fa-search"></i> Source: <strong>Live scan</strong></div>'}
                    </div>
                </div>
            `;
        }).join('');
    }).join('');
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY FILTERED] Generated HTML length:', resultsHtml.length);
    
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('contactPages').textContent = totalContactPages;
    
    const totalFilteredEmails = filteredResults.reduce((sum, r) => sum + (r.emails ? r.emails.length : 0), 0);
    document.getElementById('resultsCount').textContent = `(${totalFilteredEmails} emails found)`;
    
    const resultsContainer = document.getElementById('resultsContainer');
    const finalHtml = resultsHtml || '<p class="empty-state">No emails match your current filters</p>';
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY FILTERED] Setting innerHTML to:', finalHtml.substring(0, 200) + '...');
    
    resultsContainer.innerHTML = finalHtml;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','[DISPLAY FILTERED] Completed successfully');
}

function clearAllFilters() {
    const domainFilter = document.getElementById('domainFilter');
    const emailFilter = document.getElementById('emailFilter');
    
    if (domainFilter) domainFilter.value = '';
    if (emailFilter) emailFilter.value = '';
    
    applyFilters();
}

function resetUI() {
    document.getElementById('start-discovery-action').disabled = false;
    if (document.getElementById('search-emails-cache-action')) {
        document.getElementById('search-emails-cache-action').disabled = false;
    }
    document.getElementById('searchProgress').style.display = 'none';
    document.getElementById('loadingIndicator').style.display = 'none';
}

async function copyEmail(email) {
    try {
        await navigator.clipboard.writeText(email);
        showSuccess('Email copied to clipboard');
    } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = email;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('Email copied to clipboard');
    }
}

function exportResults() {
    if (allResults.length === 0) return;
    
    let csv = 'Domain,Email,Source,Page Type,Found Date\n';
    
    allResults.forEach(result => {
        if (result.success && result.emails) {
            result.emails.forEach(emailData => {
                const emailString = typeof emailData === 'string' ? emailData : (emailData.email || '');
                const pageType = typeof emailData === 'object' && emailData.pageTypes ? 
                    (Array.isArray(emailData.pageTypes) ? emailData.pageTypes[0] : emailData.pageTypes) : 'general';
                const source = result.fromCache ? 'Cache' : 'Live scan';
                const foundDate = result.exploredAt || new Date().toISOString();
                
                csv += `"${result.domain}","${emailString}","${source}","${pageType}","${foundDate}"\n`;
            });
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email_discovery_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showSuccess('Results exported to CSV');
}

function showError(elementId, message) {
    if (elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }
    if (window.showToast) {
        window.showToast('error', message);
    }
}

function clearError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
}

function showSuccess(message) {
    if (window.showToast) {
        window.showToast('success', message);
    }
}

function showWarning(message) {
    if (window.showToast) {
        window.showToast('warning', message);
    }
}

window.removeDomain = removeDomain;
window.copyEmail = copyEmail;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailSearch);
} else {
    initEmailSearch();
}