(function(){
    let prefsService = null;
    let stateManager = null;
    
    window.initPreferencesService = async () => {
        if (!prefsService && window.preferencesService) {
            try {
                prefsService = window.preferencesService.init({
                    hash: crypto.subtle,
                    fetchImpl: fetch,
                    log: (cat, msg, data) => {
                        if (window.clientConfig?.smartLog) {
                            window.clientConfig.smartLog(cat, msg, data);
                        }
                    },
                    config: window.clientConfig
                });
                
                if (window.clientConfig?.smartLog) {
                    window.clientConfig.smartLog('service', 'Preferences service initialized successfully');
                }
            } catch (error) {
                if (window.clientConfig?.smartLog) {
                    window.clientConfig.smartLog('fail', `Failed to initialize preferences service: ${error.message}`);
                }
                throw error;
            }
        }
        return prefsService;
    };
    
    window.safeSaveUserPreferences = async (payload) => {
        if (payload === null || payload === undefined) {
            if (window.clientConfig?.smartLog) {
                window.clientConfig.smartLog('fail', 'safeSaveUserPreferences: payload is null/undefined, skipping save');
            }
            return {success: true, skipped: true, message: 'Invalid payload skipped'};
        }
        
        if (typeof payload !== 'object') {
            if (window.clientConfig?.smartLog) {
                window.clientConfig.smartLog('fail', `safeSaveUserPreferences: invalid payload type ${typeof payload}, skipping save`);
            }
            return {success: true, skipped: true, message: 'Invalid payload type skipped'};
        }
        
        if (Array.isArray(payload)) {
            if (window.clientConfig?.smartLog) {
                window.clientConfig.smartLog('fail', 'safeSaveUserPreferences: payload is array, skipping save');
            }
            return {success: true, skipped: true, message: 'Array payload skipped'};
        }
        
        try {
            const service = await window.initPreferencesService();
            if (service && service.save) {
                return await service.save(payload);
            } else {
                throw new Error('Preferences service not properly initialized');
            }
        } catch (error) {
            if (window.clientConfig?.smartLog) {
                window.clientConfig.smartLog('fail', `safeSaveUserPreferences error: ${error.message}`);
            }
            return {success: false, error: error.message};
        }
    };
})();

let currentComponent = null;
let componentStates = {};
let isAppInitialized = false;
let isAuthenticated = true;
let i18nInitialized = false;
let i18nInitPromise = null;
let navigationLock = false;
let authVerificationCache = null;
let authCacheExpiry = 0;

function cleanupEventListeners() {
    const elementsWithListeners = document.querySelectorAll('.nav-item, #logout-btn, #cancel-logout-confirmation, #close-logout-confirm-modal, #confirm-logout');
    elementsWithListeners.forEach(element => {
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
    });
}

async function verifyAuthentication() {
    const now = Date.now();
    
    if (authVerificationCache && now < authCacheExpiry) {
        return authVerificationCache;
    }
    
    const maxRetries = 2;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const authResponse = await fetch('/auth/status', {
                signal: controller.signal,
                credentials: 'same-origin'
            });
            
            clearTimeout(timeoutId);
            
            if (!authResponse.ok) {
                throw new Error(`Auth check failed with status ${authResponse.status}`);
            }
            
            const authData = await authResponse.json();
            
            if (!authData.isAuthenticated) {
                (window.clientConfig?.smartLog || (() => {}))('fail', 'Authentication lost, redirecting to login');
                window.location.href = '/login';
                return false;
            }
            
            isAuthenticated = true;
            window.isAuthenticated = true;
            authVerificationCache = true;
            authCacheExpiry = now + 10000;
            
            return true;
            
        } catch (error) {
            lastError = error;
            
            if (error.name === 'AbortError') {
                (window.clientConfig?.smartLog || (() => {}))('fail', 'Auth verification timeout');
            }
            
            if (attempt < maxRetries) {
                const delay = 1000 * Math.pow(2, attempt);
                (window.clientConfig?.smartLog || (() => {}))('retry', `Auth verification attempt ${attempt + 1} failed, retrying in ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    (window.clientConfig?.smartLog || (() => {}))('fail', `Auth verification failed after ${maxRetries} retries: ${lastError.message}`);
    window.location.href = '/login';
    return false;
}

document.addEventListener('DOMContentLoaded', async function() {
    if (window.location.pathname !== '/app') {
        return;
    }
    
    const initStartTime = Date.now();
    
    try {
        (window.clientConfig?.smartLog || (() => {}))('buffer', 'Starting application initialization...');
        
        if (!(await verifyAuthentication())) {
            return;
        }
        
        await initializeI18n();
        await initApp();
        
        setupNavigation();
        setupLogoutConfirmation();
        setupLanguageSelector();
        setupRouting();
        
        setActivePage('dashboard');
        
        const initDuration = Date.now() - initStartTime;
        (window.clientConfig?.smartLog || (() => {}))('win', `Application initialized successfully in ${initDuration}ms`);
        
    } catch (error) {
        const initDuration = Date.now() - initStartTime;
        (window.clientConfig?.smartLog || (() => {}))('fail', `Initialization error after ${initDuration}ms: ${error && error.message ? error.message : error}`);
        
        showToast('error', getTranslatedMessage('messages.initError') || 'Erreur d\'initialisation');
        
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
    }
});

async function initializeI18n() {
    if (i18nInitialized) {
        return i18nInitPromise;
    }
    
    if (i18nInitPromise) {
        return i18nInitPromise;
    }
    
    i18nInitPromise = (async () => {
        const maxRetries = 3;
        let attempt = 0;
        
        while (attempt <= maxRetries) {
            try {
                if (!window.clientConfig) {
                    await loadScript('js/config.client.js');
                }
                
                if (!window.clientConfig) {
                    throw new Error('clientConfig not available after loading');
                }
                
                if (!window.uiManager) {
                    await loadScript('dictionaries/ui/uiManager.js');
                }
                
                if (!window.uiManager) {
                    throw new Error('uiManager not available after loading');
                }
                
                if (window.uiManager && !window.uiManager.isInitialized) {
                    await window.uiManager.initialize();
                    (window.clientConfig?.smartLog || (() => {}))('win', 'I18n initialized successfully');
                }
                
                i18nInitialized = true;
                return;
                
            } catch (error) {
                attempt++;
                
                if (window.clientConfig?.smartLog) {
                    window.clientConfig.smartLog('fail', `I18n initialization attempt ${attempt} failed: ${error.message}`);
                }
                
                if (attempt > maxRetries) {
                    throw new Error(`I18n initialization failed after ${maxRetries} attempts: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
        }
    })();
    
    return i18nInitPromise;
}

window.showProgressModal = function(title, message) {
    const existingModal = document.querySelector('.progress-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'progress-modal';
    modal.innerHTML = `
        <div class="progress-modal-overlay">
            <div class="progress-modal-content">
                <h3>${title || 'Traitement en cours...'}</h3>
                <p>${message || 'Veuillez patienter...'}</p>
                <div class="progress-spinner">
                    <div></div><div></div><div></div><div></div>
                </div>
            </div>
        </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        .progress-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .progress-modal-overlay {
            background: rgba(0, 0, 0, 0.5);
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .progress-modal-content {
            background: var(--surface, #fff);
            padding: 2rem;
            border-radius: 8px;
            text-align: center;
            min-width: 300px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        .progress-modal-content h3 {
            margin: 0 0 1rem 0;
            color: var(--text-primary, #333);
        }
        .progress-modal-content p {
            margin: 0 0 2rem 0;
            color: var(--text-secondary, #666);
        }
        .progress-spinner {
            display: inline-block;
            position: relative;
            width: 40px;
            height: 40px;
        }
        .progress-spinner div {
            box-sizing: border-box;
            display: block;
            position: absolute;
            width: 32px;
            height: 32px;
            margin: 4px;
            border: 3px solid var(--primary, #4f6df5);
            border-radius: 50%;
            animation: progress-spinner 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
            border-color: var(--primary, #4f6df5) transparent transparent transparent;
        }
        .progress-spinner div:nth-child(1) { animation-delay: -0.45s; }
        .progress-spinner div:nth-child(2) { animation-delay: -0.3s; }
        .progress-spinner div:nth-child(3) { animation-delay: -0.15s; }
        @keyframes progress-spinner {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    
    if (!document.querySelector('#progress-modal-styles')) {
        style.id = 'progress-modal-styles';
        document.head.appendChild(style);
    }
    
    document.body.appendChild(modal);
    
    return modal;
};

window.hideProgressModal = function() {
    const modal = document.querySelector('.progress-modal');
    if (modal) {
        modal.remove();
    }
};

function setupLanguageSelector() {
    if (!window.uiManager) return;
    
    const navContainer = document.querySelector('.sidebar-nav');
    if (!navContainer) return;
    
    const existing = navContainer.querySelector('.nav-language-selector');
    if (existing) return;
    
    const languageContainer = document.createElement('div');
    languageContainer.className = 'nav-language-selector';
    languageContainer.innerHTML = `
        <div class="language-selector-wrapper">
            <label for="app-language-selector" style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px; display: block;">
                ${window.uiManager.translate ? window.uiManager.translate('settings.language') : 'Langue'}
            </label>
            <div id="app-language-selector-container"></div>
        </div>
    `;
    
    navContainer.appendChild(languageContainer);
    
    if (window.uiManager.createLanguageSelector) {
        window.uiManager.createLanguageSelector('app-language-selector-container', {
            className: 'app-language-selector',
            style: `
                width: 100%;
                background: var(--surface);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                padding: 6px 8px;
                color: var(--text-primary);
                font-size: 0.8rem;
                cursor: pointer;
                transition: all var(--transition);
            `
        });
        
        if (window.uiManager.onLanguageChange) {
            window.uiManager.onLanguageChange((newLanguage) => {
                updateNavigationTexts();
                if (currentComponent) {
                    setTimeout(() => {
                        if (window.uiManager.translatePage) {
                            window.uiManager.translatePage();
                        }
                    }, 200);
                }
            });
        }
    }
}

function updateNavigationTexts() {
    if (!window.uiManager || !window.uiManager.getNavigationTranslations) return;
    
    const navTranslations = window.uiManager.getNavigationTranslations();
    
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        const page = item.getAttribute('data-page');
        const span = item.querySelector('span');
        if (span && navTranslations[page]) {
            span.textContent = navTranslations[page];
        }
    });
    
    const languageLabel = document.querySelector('.nav-language-selector label');
    if (languageLabel && window.uiManager.translate) {
        languageLabel.textContent = window.uiManager.translate('settings.language');
    }
}

function setupLogoutConfirmation() {
    const logoutBtn = document.getElementById('logout-btn');
    const logoutModal = document.getElementById('logout-confirm-modal');
    const cancelLogoutBtn = document.getElementById('cancel-logout-confirmation');
    const confirmLogoutBtn = document.getElementById('confirm-logout');
    const closeLogoutModalBtn = document.getElementById('close-logout-confirm-modal');
    
    if (logoutBtn) {
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        
        newLogoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (logoutModal) {
                logoutModal.classList.add('show');
            }
        });
    }
    
    if (cancelLogoutBtn) {
        const newCancelBtn = cancelLogoutBtn.cloneNode(true);
        cancelLogoutBtn.parentNode.replaceChild(newCancelBtn, cancelLogoutBtn);
        
        newCancelBtn.addEventListener('click', function() {
            if (logoutModal) {
                logoutModal.classList.remove('show');
            }
        });
    }
    
    if (closeLogoutModalBtn) {
        const newCloseBtn = closeLogoutModalBtn.cloneNode(true);
        closeLogoutModalBtn.parentNode.replaceChild(newCloseBtn, closeLogoutModalBtn);
        
        newCloseBtn.addEventListener('click', function() {
            if (logoutModal) {
                logoutModal.classList.remove('show');
            }
        });
    }
    
    if (confirmLogoutBtn) {
        const newConfirmBtn = confirmLogoutBtn.cloneNode(true);
        confirmLogoutBtn.parentNode.replaceChild(newConfirmBtn, confirmLogoutBtn);
        
        newConfirmBtn.addEventListener('click', async function() {
            try {
                const response = await fetch('/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'same-origin'
                });
                
                if (response.ok) {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = '/';
                } else {
                    showToast('error', getTranslatedMessage('auth.logoutError'));
                }
            } catch (error) {
                (window.clientConfig?.smartLog || (() => {}))('fail', `Logout error: ${error.message}`);
                showToast('error', getTranslatedMessage('auth.logoutError'));
            }
        });
    }
}

function getTranslatedMessage(key, params = {}) {
    if (window.uiManager && window.uiManager.translate) {
        return window.uiManager.translate(key, params);
    }
    return key;
}

function setActivePage(page) {
    if (!isValidPage(page)) {
        (window.clientConfig?.smartLog || (() => {}))('fail', `Invalid page: ${page}`);
        return;
    }
    
    document.querySelectorAll('.nav-item').forEach(navItem => {
        navItem.classList.remove('active');
        if (navItem.getAttribute('data-page') === page) {
            navItem.classList.add('active');
        }
    });
    
    loadComponent(page);
}

function setupRouting() {
    window.addEventListener('popstate', function(event) {
        if (!isAppInitialized) return;
        const page = getPageFromURL() || 'dashboard';
        if (isValidPage(page)) {
            loadComponent(page, false);
        } else {
            loadComponent('dashboard', false);
        }
    });
}

function getPageFromURL() {
    const hash = window.location.hash.substring(1);
    return hash || null;
}

window.addEventListener('beforeunload', function() {
    if (currentComponent && shouldSaveComponentState(currentComponent)) {
        saveComponentState(currentComponent);
    }
});

async function initApp() {
    const initStartTime = Date.now();
    
    try {
        (window.clientConfig?.smartLog || (() => {}))('buffer', 'Starting app initialization...');
        
        await loadScript('js/services/preferences.js');
        await window.initPreferencesService();
        
        await loadUserData();
        (window.clientConfig?.smartLog || (() => {}))('buffer', 'Initial data load completed');
        
        await waitForCompleteDataLoad();
        (window.clientConfig?.smartLog || (() => {}))('buffer', 'Complete data load verified');
        
        isAppInitialized = true;
        
        const initDuration = Date.now() - initStartTime;
        (window.clientConfig?.smartLog || (() => {}))('win', `App initialization completed successfully in ${initDuration}ms`);
        
        if (window.uiManager) {
            updateNavigationTexts();
        }
        
        setInterval(async () => {
            try {
                await verifyAuthentication();
            } catch (error) {
                (window.clientConfig?.smartLog || (() => {}))('fail', `Periodic auth check failed: ${error.message}`);
            }
        }, 30000);
        
    } catch (error) {
        const initDuration = Date.now() - initStartTime;
        (window.clientConfig?.smartLog || (() => {}))('fail', `Error initializing application after ${initDuration}ms: ${error.message}`);
        showToast('error', getTranslatedMessage('messages.loadError'));
        throw error;
    }
}

function initAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -10% 0px'
    };
    
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                animationObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.card, .stat-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        animationObserver.observe(el);
    });
    
    const cards = document.querySelectorAll('.card, .stat-card');
    cards.forEach((card, index) => {
        card.style.transition = `all 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.1}s`;
    });
}

function waitForCompleteDataLoad() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 25;
        const baseDelayMs = 200;
        const maxDelayMs = 1000;
        const startTime = Date.now();
        const timeoutMs = 15000;
        
        function checkDataComplete() {
            attempts++;
            const elapsed = Date.now() - startTime;
            
            if (elapsed > timeoutMs) {
                (window.clientConfig?.smartLog || (() => {}))('fail', `Data load timeout after ${elapsed}ms, proceeding with available data`);
                resolve();
                return;
            }
            
            try {
                const dataExists = window.userData && 
                    window.userData.lastUsed && 
                    typeof window.saveUserData === 'function' &&
                    (window.userData.companies !== undefined) &&
                    (window.userData.jobTitles !== undefined) &&
                    (window.userData.locations !== undefined) &&
                    (window.userData.careerPages !== undefined);
                
                if (dataExists) {
                    (window.clientConfig?.smartLog || (() => {}))('buffer', `All data structures confirmed loaded after ${attempts} attempts (${elapsed}ms)`);
                    
                    setTimeout(() => {
                        resolve();
                    }, 100);
                    return;
                }
                
                if (attempts >= maxAttempts) {
                    (window.clientConfig?.smartLog || (() => {}))('fail', `Max attempts (${maxAttempts}) reached after ${elapsed}ms, proceeding with available data`);
                    resolve();
                    return;
                }
                
                const delay = Math.min(
                    baseDelayMs + (attempts * 50), 
                    maxDelayMs
                );
                
                if (attempts % 5 === 0) {
                    (window.clientConfig?.smartLog || (() => {}))('buffer', `Waiting for complete data load... attempt ${attempts}/${maxAttempts} (${elapsed}ms elapsed)`);
                }
                
                setTimeout(checkDataComplete, delay);
                
            } catch (error) {
                (window.clientConfig?.smartLog || (() => {}))('fail', `Error during data load check: ${error.message}`);
                
                if (attempts >= maxAttempts) {
                    resolve();
                } else {
                    setTimeout(checkDataComplete, baseDelayMs);
                }
            }
        }
        
        checkDataComplete();
    });
}

function setupNavigation() {
    cleanupEventListeners();
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            
            if (navigationLock) {
                (window.clientConfig?.smartLog || (() => {}))('buffer', 'Navigation locked, request ignored');
                return;
            }
            
            if (!isAppInitialized) return;
            
            try {
                if (!(await verifyAuthentication())) {
                    return;
                }
            } catch (error) {
                (window.clientConfig?.smartLog || (() => {}))('fail', `Navigation auth check failed: ${error.message}`);
                return;
            }
            
            const page = item.dataset.page;
            if (page && isValidPage(page)) {
                setActivePage(page);
            }
        });
    });
}

function isValidPage(pageName) {
    const validPages = ['dashboard', 'job-search', 'job-listing', 'email-search', 'applications', 'profile', 'cv-builder', 'linktree', 'resources', 'settings', 'help', 'pricing'];
    return validPages.includes(pageName);
}

function shouldSaveComponentState(componentName) {
    const noSaveComponents = ['applications', 'dashboard'];
    return !noSaveComponents.includes(componentName);
}

function isElementExcludedFromState(element) {
    if (!element) return true;
    
    const excludedIds = [
        'company-search',
        'company-name',
        'edit-website',
        'edit-linkedin', 
        'edit-email',
        'comments-title',
        'comments-content'
    ];
    
    const excludedClasses = [
        'inline-input',
        'company-name-edit',
        'date-input',
        'search-table'
    ];
    
    if (excludedIds.includes(element.id)) return true;
    if (excludedClasses.some(cls => element.classList.contains(cls))) return true;
    if (element.closest('#companies-table') || element.closest('.companies-table')) return true;
    
    return false;
}

function saveComponentState(componentName) {
    if (!shouldSaveComponentState(componentName)) return;
    
    const stateElements = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
    const state = {};
    
    stateElements.forEach(element => {
        if (element.type === 'file' || isElementExcludedFromState(element)) {
            return;
        }
        
        const selector = getElementSelector(element);
        if (selector && isValidSelector(selector)) {
            try {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    state[selector] = element.checked;
                } else if (element.tagName === 'SELECT') {
                    state[selector] = element.value;
                } else if (element.contentEditable === 'true') {
                    state[selector] = element.innerHTML;
                } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    state[selector] = element.value;
                }
            } catch (error) {
                (window.clientConfig?.smartLog || (() => {}))('fail', `Failed to save state for element: ${error.message}`);
            }
        }
    });
    
    componentStates[componentName] = state;
}

function restoreComponentState(componentName) {
    if (!componentStates[componentName] || !shouldSaveComponentState(componentName)) return;
    
    const state = componentStates[componentName];
    
    Object.entries(state).forEach(([selector, value]) => {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (element.type === 'file' || isElementExcludedFromState(element)) {
                    return;
                }
                
                try {
                    if (element.type === 'checkbox' || element.type === 'radio') {
                        element.checked = value;
                    } else if (element.tagName === 'SELECT') {
                        element.value = value;
                    } else if (element.contentEditable === 'true') {
                        element.innerHTML = value;
                    } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                        element.value = value;
                    }
                } catch (error) {
                    (window.clientConfig?.smartLog || (() => {}))('fail', `Failed to restore state for ${selector}: ${error.message}`);
                }
            });
        } catch (error) {
            (window.clientConfig?.smartLog || (() => {}))('fail', `Invalid selector in state restoration: ${selector}: ${error.message}`);
        }
    });
}

function isValidSelector(selector) {
    const invalidSelectors = [
        '.inline-input',
        '.company-name-edit', 
        '.date-input',
        '.search-table'
    ];
    
    return !invalidSelectors.includes(selector);
}

function getElementSelector(element) {
    if (element.id && !isElementExcludedFromState(element)) {
        return `#${element.id}`;
    }
    
    if (element.name && !isElementExcludedFromState(element)) {
        return `[name="${element.name}"]`;
    }
    
    return null;
}

async function loadComponent(componentName, updateURL = true) {
    if (!isAppInitialized) {
        (window.clientConfig?.smartLog || (() => {}))('buffer', 'App not initialized yet, waiting...');
        return;
    }
    
    if (navigationLock) {
        (window.clientConfig?.smartLog || (() => {}))('buffer', 'Navigation locked, component load blocked');
        return;
    }
    
    if (!isValidPage(componentName)) {
        (window.clientConfig?.smartLog || (() => {}))('fail', `Invalid page requested: ${componentName}, redirecting to dashboard`);
        componentName = 'dashboard';
    }
    
    navigationLock = true;
    const loadStartTime = Date.now();
    
    try {
        if (!(await verifyAuthentication())) {
            return;
        }
        
        if (currentComponent && currentComponent !== componentName && shouldSaveComponentState(currentComponent)) {
            saveComponentState(currentComponent);
        }

        document.querySelectorAll('.nav-item').forEach(navItem => {
            navItem.classList.remove('active');
            if (navItem.getAttribute('data-page') === componentName) {
                navItem.classList.add('active');
            }
        });

        const container = document.getElementById('page-container');
        if (!container) {
            (window.clientConfig?.smartLog || (() => {}))('fail', 'Page container not found');
            return;
        }

        container.style.opacity = '0';
        container.style.transform = 'translateY(20px)';

        await new Promise(resolve => setTimeout(resolve, 150));
        
        container.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 300px;">
                <div style="text-align: center;">
                    <div class="loading-spinner">
                        <div></div><div></div><div></div><div></div>
                    </div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">${getTranslatedMessage('common.loading') || 'Chargement...'}</p>
                </div>
            </div>
        `;

        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';

        (window.clientConfig?.smartLog || (() => {}))('buffer', `Loading component: ${componentName}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`components/${componentName}.html?v=${Date.now()}`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Failed to load component HTML: ${componentName} - Status: ${response.status}`);
        }

        const html = await response.text();
        (window.clientConfig?.smartLog || (() => {}))('buffer', `Component HTML loaded: ${componentName}`);

        container.style.opacity = '0';
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        container.innerHTML = html;
        container.style.opacity = '1';
        (window.clientConfig?.smartLog || (() => {}))('buffer', `Component HTML inserted: ${componentName}`);

        initAnimations();

        await loadScript(`js/components/${componentName}.js`, true);
        (window.clientConfig?.smartLog || (() => {}))('buffer', `Component script loaded: ${componentName}`);
        
        currentComponent = componentName;
        
        await waitForComponentInitialization(componentName);
        
        if (window.uiManager && window.uiManager.updateComponentTexts) {
            window.uiManager.updateComponentTexts(componentName);
        }
        
        setupNavigation();
        setupLogoutConfirmation();
        
        if (shouldSaveComponentState(componentName)) {
            setTimeout(() => {
                restoreComponentState(componentName);
            }, 500);
        }
        
        if (updateURL) {
            window.history.replaceState({page: componentName}, '', `#${componentName}`);
        }
        
        const loadDuration = Date.now() - loadStartTime;
        (window.clientConfig?.smartLog || (() => {}))('win', `Component fully loaded: ${componentName} in ${loadDuration}ms`);

    } catch (error) {
        const loadDuration = Date.now() - loadStartTime;
        
        if (error.name === 'AbortError') {
            (window.clientConfig?.smartLog || (() => {}))('fail', `Component load timeout for ${componentName} after ${loadDuration}ms`);
        } else {
            (window.clientConfig?.smartLog || (() => {}))('fail', `Error loading component "${componentName}" after ${loadDuration}ms: ${error.message}`);
        }
        
        showToast('error', getTranslatedMessage('messages.loadError', {component: componentName}) || `Erreur lors du chargement: ${componentName}`);
        
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = `
                <div class="error-message" style="margin: 20px; padding: 20px; background: rgba(255, 0, 0, 0.1); border-radius: 8px; color: #ff4757;">
                    <h3>${getTranslatedMessage('common.error') || 'Erreur'}</h3>
                    <p>${error.message}</p>
                    <button onclick="loadComponent('dashboard')" style="margin-top: 10px; padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        ${getTranslatedMessage('common.backToDashboard') || 'Retour au tableau de bord'}
                    </button>
                </div>
            `;
            container.style.opacity = '1';
        }
    } finally {
        navigationLock = false;
    }
}

function waitForComponentInitialization(componentName) {
    return new Promise((resolve) => {
        const maxWaitTime = 10000;
        const checkInterval = 200;
        const startTime = Date.now();
        
        if (componentName === 'cv-builder') {
            function checkCvBuilderReady() {
                const elapsed = Date.now() - startTime;
                
                if (elapsed > maxWaitTime) {
                    (window.clientConfig?.smartLog || (() => {}))('buffer', 'CV Builder initialization timeout, proceeding');
                    resolve();
                    return;
                }
                
                try {
                    const hasModals = document.getElementById('experience-modal') && 
                                   document.getElementById('education-modal');
                    const hasButtons = document.getElementById('preview-cv') && 
                                     document.getElementById('export-pdf');
                    
                    if (hasModals && hasButtons) {
                        (window.clientConfig?.smartLog || (() => {}))('buffer', `CV Builder component confirmed ready after ${elapsed}ms`);
                        resolve();
                        return;
                    }
                    
                    setTimeout(checkCvBuilderReady, checkInterval);
                } catch (error) {
                    (window.clientConfig?.smartLog || (() => {}))('fail', `CV Builder check error: ${error.message}`);
                    setTimeout(checkCvBuilderReady, checkInterval);
                }
            }
            
            setTimeout(checkCvBuilderReady, 300);
            return;
        }
        
        if (componentName === 'job-search') {
            function checkJobSearchReady() {
                const elapsed = Date.now() - startTime;
                
                if (elapsed > maxWaitTime) {
                    (window.clientConfig?.smartLog || (() => {}))('buffer', 'Job search initialization timeout, proceeding');
                    resolve();
                    return;
                }
                
                try {
                    if (window.jobSearchModule && window.getComponentData) {
                        (window.clientConfig?.smartLog || (() => {}))('buffer', `Job search component confirmed ready after ${elapsed}ms`);
                        resolve();
                        return;
                    }
                    
                    setTimeout(checkJobSearchReady, checkInterval);
                } catch (error) {
                    (window.clientConfig?.smartLog || (() => {}))('fail', `Job search check error: ${error.message}`);
                    setTimeout(checkJobSearchReady, checkInterval);
                }
            }
            
            setTimeout(checkJobSearchReady, 100);
            return;
        }
        
        (window.clientConfig?.smartLog || (() => {}))('buffer', `Component ${componentName} - no specific initialization check needed`);
        resolve();
    });
}

function loadScript(src, isModule = false) {
    return new Promise((resolve, reject) => {
        const normalizedSrc = src.replace(/\?v=\d+/, '');
        const existing = document.querySelector(`script[data-src="${normalizedSrc}"]`);
        if (existing) {
            existing.remove();
        }

        const script = document.createElement('script');
        script.src = `${src}?v=${Date.now()}`;
        script.type = isModule ? 'module' : 'text/javascript';
        script.defer = true;
        script.dataset.src = normalizedSrc;

        const timeout = setTimeout(() => {
            reject(new Error(`Script load timeout: ${src}`));
        }, 10000);

        script.onload = () => {
            clearTimeout(timeout);
            if (window.clientConfig?.smartLog) {
                window.clientConfig.smartLog('buffer', `Script loaded successfully: ${src}`);
            }
            resolve();
        };
        
        script.onerror = () => {
            clearTimeout(timeout);
            reject(new Error(`Failed to load script: ${src}`));
        };

        document.head.appendChild(script);
    });
}

function showToast(type, message, options = {}) {
    const existingToast = document.querySelector('.toast.show');
    if (existingToast) {
        existingToast.classList.remove('show');
    }
    
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    const toastMessage = document.getElementById('toast-message');
    const toastTitle = toast.querySelector('.toast-title');
    const toastIcon = toast.querySelector('.toast-icon i');
    
    toast.className = 'toast';
    
    if (type === 'success') {
        toast.classList.add('toast-success');
        toastTitle.textContent = options.title || getTranslatedMessage('common.success') || 'SuccÃ¨s';
        toastIcon.className = 'fas fa-check-circle';
    } else if (type === 'error') {
        toast.classList.add('toast-error');
        toastTitle.textContent = options.title || getTranslatedMessage('common.error') || 'Erreur';
        toastIcon.className = 'fas fa-exclamation-circle';
    } else if (type === 'info') {
        toast.classList.add('toast-info');
        toastTitle.textContent = options.title || getTranslatedMessage('common.info') || 'Information';
        toastIcon.className = 'fas fa-info-circle';
    } else if (type === 'warning') {
        toast.classList.add('toast-warning');
        toastTitle.textContent = options.title || getTranslatedMessage('common.warning') || 'Attention';
        toastIcon.className = 'fas fa-exclamation-triangle';
    } else if (type === 'queue') {
        toast.classList.add('toast-queue');
        toastTitle.textContent = options.title || 'Smart Queue';
        toastIcon.className = 'fas fa-clock';
    } else if (type === 'shared') {
        toast.classList.add('toast-shared');
        toastTitle.textContent = options.title || 'Shared Results';
        toastIcon.className = 'fas fa-share-alt';
    }
    
    if (toastMessage) toastMessage.textContent = message;
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    const duration = options.duration || 3000;
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function showContextualMessage(type, data) {
    const { domainsNotified = 0, domainsScraped = 0, domainsCached = 0, searchType, totalResults = 0 } = data;

    if (type === 'queue_optimization') {
        showToast('queue', 
            getTranslatedMessage('messages.queueOptimization', {domains: domainsNotified}) || `${domainsNotified} domaines en queue`,
            { 
                title: 'Smart Queue Active', 
                duration: 5000 
            }
        );
    } else if (type === 'shared_cache') {
        const efficiency = Math.round(((domainsCached + domainsNotified) / (domainsScraped + domainsCached + domainsNotified)) * 100);
        showToast('shared', 
            getTranslatedMessage('messages.sharedCache', {totalResults, domainsNotified, efficiency}) || `${totalResults} rÃ©sultats trouvÃ©s`,
            { 
                title: 'Shared Cache Results', 
                duration: 4000 
            }
        );
    }
}

function animateValue(element, start, end, duration) {
    const startTime = performance.now();
    const isPercentage = element.textContent.includes('%');
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOutExpo = 1 - Math.pow(2, -10 * progress);
        const current = Math.floor(start + (end - start) * easeOutExpo);
        
        element.textContent = current + (isPercentage ? '%' : '');
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes floatUp {
        from {
            transform: translateY(0) translateX(0);
            opacity: 0;
        }
        10% {
            opacity: 1;
        }
        90% {
            opacity: 1;
        }
        to {
            transform: translateY(-100vh) translateX(${Math.random() * 200 - 100}px);
            opacity: 0;
        }
    }
    
    .fade-in {
        opacity: 1 !important;
        transform: translateY(0) !important;
    }
    
    .nav-language-selector {
        margin: 16px 0;
        padding: 12px 16px;
        border-top: 1px solid var(--border-color);
    }
    
    .language-selector-wrapper {
        width: 100%;
    }
    
    .app-language-selector:hover {
        border-color: var(--primary);
        background: var(--surface-hover);
    }
    
    .app-language-selector:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 2px rgba(79, 109, 245, 0.2);
    }
    
    .loading-spinner {
        display: inline-block;
        position: relative;
        width: 80px;
        height: 80px;
    }
    .loading-spinner div {
        box-sizing: border-box;
        display: block;
        position: absolute;
        width: 64px;
        height: 64px;
        margin: 8px;
        border: 8px solid;
        border-radius: 50%;
        animation: loading-spinner 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        border-color: var(--primary) transparent transparent transparent;
    }
    .loading-spinner div:nth-child(1) { animation-delay: -0.45s; }
    .loading-spinner div:nth-child(2) { animation-delay: -0.3s; }
    .loading-spinner div:nth-child(3) { animation-delay: -0.15s; }
    @keyframes loading-spinner {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-message button:hover {
        background: var(--primary-dark) !important;
        transform: translateY(-1px);
    }
`;
document.head.appendChild(style);

window.currentComponent = () => currentComponent;
window.isAppInitialized = () => isAppInitialized;
window.animateValue = animateValue;
window.showToast = showToast;
window.showProgressModal = showProgressModal;
window.showContextualMessage = showContextualMessage;
window.getTranslatedMessage = getTranslatedMessage;
window.loadComponent = loadComponent;