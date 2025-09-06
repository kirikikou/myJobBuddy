(function(){
    window.initPreferencesService = async () => {
        if (window.unifiedPreferencesService && window.unifiedPreferencesService.isReady()) {
            return window.unifiedPreferencesService;
        }
        
        if (!window.unifiedPreferencesService) {
            await loadScript('js/unifiedPreferencesService.js');
        }
        
        if (!window.unifiedPreferencesService.isReady()) {
            await window.unifiedPreferencesService.load();
        }
        
        return window.unifiedPreferencesService;
    };
    
    window.safeSaveUserPreferences = async (p) => {
        if (window.unifiedPreferencesService) {
            return await window.unifiedPreferencesService.save(p, false);
        }
        return {success: false, error: 'Service not initialized'};
    };
})();

let currentComponent = null;
let componentStates = {};
let isAppInitialized = false;
let isAuthenticated = true;
let i18nInitialized = false;
let i18nInitPromise = null;

document.addEventListener('DOMContentLoaded', async function() {
    if (window.location.pathname !== '/app') {
        return;
    }
        
    try {
        const authResponse = await fetch('/auth/status');
        const authData = await authResponse.json();
        
        if (!authData.isAuthenticated) {
            window.location.href = '/login';
            return;
        }
        
        window.isAuthenticated = true;
        
        await initializeI18n();
        await initApp();
        
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) {
                    setActivePage(page);
                }
            });
        });
        
        setupLogoutConfirmation();
        setupLanguageSelector();
        
        setActivePage('dashboard');
    } catch (error) {
        (window.clientConfig?window.clientConfig.smartLog:(()=>{}))
        ('fail',`Initialization error: ${error&&error.message?error.message:error}`);        
        window.location.href = '/login';
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
        try {
            if (!window.clientConfig) {
                await loadScript('js/config.client.js');
            }
            
            if (!window.clientConfig) {
                throw new Error('clientConfig not available');
            }
            
            if (!window.uiManager) {
                await loadScript('dictionaries/ui/uiManager.js');
            }
            
            if (window.uiManager && !window.uiManager.isInitialized) {
                await window.uiManager.initialize();
                window.clientConfig.smartLog('win', 'I18n initialized successfully');
            }
            
            i18nInitialized = true;
        } catch (error) {
            if (window.clientConfig) {
                window.clientConfig.smartLog('fail', `I18n initialization failed: ${error.message}`);
            }
        }
    })();
    
    return i18nInitPromise;
}

async function syncLanguageAfterDataLoad() {
    if (!i18nInitialized || !window.uiManager) return;
    
    window.clientConfig.smartLog('langue', 'Synchronizing language preferences after data load...');
    
    window.uiManager.syncLanguagePreferences();
    
    const detectedLanguage = window.uiManager.detectLanguage();
    const currentLanguage = window.uiManager.getCurrentLanguage();
    
    if (detectedLanguage !== currentLanguage) {
        window.clientConfig.smartLog('langue', `Language change needed: ${currentLanguage} -> ${detectedLanguage}`);
        window.uiManager.setLanguage(detectedLanguage);
    }
    
    setTimeout(() => {
        window.uiManager.translatePage();
        updateNavigationTexts();
    }, 100);
}

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
                ${window.uiManager.translate('settings.language')}
            </label>
            <div id="app-language-selector-container"></div>
        </div>
    `;
    
    navContainer.appendChild(languageContainer);
    
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
    
    window.uiManager.onLanguageChange((newLanguage) => {
        updateNavigationTexts();
        if (currentComponent) {
            setTimeout(() => {
                window.uiManager.translatePage();
            }, 200);
        }
    });
}

function updateNavigationTexts() {
    if (!window.uiManager) return;
    
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
    if (languageLabel) {
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
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logoutModal.classList.add('show');
        });
    }
    
    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', function() {
            logoutModal.classList.remove('show');
        });
    }
    
    if (closeLogoutModalBtn) {
        closeLogoutModalBtn.addEventListener('click', function() {
            logoutModal.classList.remove('show');
        });
    }
    
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', async function() {
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
                (window.clientConfig?window.clientConfig.smartLog:(()=>{}))
                ('fail',`Logout error: ${error.message}`);                
                showToast('error', getTranslatedMessage('auth.logoutError'));
            }
        });
    }
}

function getTranslatedMessage(key, params = {}) {
    if (window.uiManager) {
        return window.uiManager.translate(key, params);
    }
    return key;
}

function setActivePage(page) {
    if (!isValidPage(page)) {
        (window.clientConfig?window.clientConfig.smartLog:(()=>{}))
        ('fail',`Invalid page: ${page}`);        
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

window.addEventListener('popstate', async function(event) {
    if (!isAppInitialized) return;
    const page = getPageFromURL() || 'dashboard';
    if (typeof window.ensureDataIntegrity === 'function' && !window.ensureDataIntegrity()) {
        await loadUserData();
    }
    loadComponent(page, false);
});

window.addEventListener('beforeunload', function() {
    if (currentComponent && shouldSaveComponentState(currentComponent)) {
        saveComponentState(currentComponent);
    }
});

async function initApp() {
    try {
        window.clientConfig.smartLog('buffer', 'Starting app initialization...');
        
        await loadScript('js/unifiedPreferencesService.js');
        await window.initPreferencesService();
        
        const loadedData = await window.unifiedPreferencesService.load();
        window.clientConfig.smartLog('buffer', 'Initial data load completed');
        
        if (loadedData) {
            window.userData = loadedData;
            window.clientConfig.smartLog('win', 'UserData globally assigned');
        }
        
        await waitForCompleteDataLoad();
        window.clientConfig.smartLog('buffer', 'Complete data load verified');
        
        setupDataSynchronization();
        
        isAppInitialized = true;
        window.clientConfig.smartLog('win', 'App initialization completed successfully');
        
        if (window.uiManager) {
            updateNavigationTexts();
        }
        
    } catch (error) {
        window.clientConfig.smartLog('fail', `Error initializing application: ${error.message}`);
        showToast('error', getTranslatedMessage('messages.loadError'));
    }
}

function setupDataSynchronization() {
    window.addEventListener('userDataUpdated', function(event) {
        window.userData = event.detail;
        window.clientConfig.smartLog('buffer', 'UserData synchronized via event');
        
        if (currentComponent === 'job-search' && window.jobSearchModule) {
            setTimeout(() => {
                window.jobSearchModule.populateJobTitles();
                window.jobSearchModule.populateCareerPages();
            }, 100);
        }
        
        if (currentComponent === 'applications' && window.applicationsModule) {
            setTimeout(() => {
                window.applicationsModule.populateCompaniesTable();
            }, 100);
        }
    });
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
    
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.stat-card, .job-card');
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const cardX = rect.left + rect.width / 2;
            const cardY = rect.top + rect.height / 2;
            
            const angleX = (mouseY - cardY) / 100;
            const angleY = (cardX - mouseX) / 100;
            
            card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) translateZ(10px)`;
        });
    });
    
    document.addEventListener('mouseleave', () => {
        const cards = document.querySelectorAll('.stat-card, .job-card');
        cards.forEach(card => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
        });
    });
}

function initParticles() {
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles-container';
    particlesContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
        overflow: hidden;
    `;
    document.body.appendChild(particlesContainer);
    
    for (let i = 0; i < 50; i++) {
        createParticle(particlesContainer);
    }
}

function createParticle(container) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const size = Math.random() * 3 + 1;
    const duration = Math.random() * 20 + 10;
    const delay = Math.random() * duration;
    const startX = Math.random() * window.innerWidth;
    
    particle.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: rgba(79, 109, 245, ${Math.random() * 0.5 + 0.2});
        border-radius: 50%;
        left: ${startX}px;
        top: 100%;
        box-shadow: 0 0 ${size * 2}px rgba(79, 109, 245, 0.5);
        animation: floatUp ${duration}s linear ${delay}s infinite;
    `;
    
    container.appendChild(particle);
    
    particle.addEventListener('animationiteration', () => {
        particle.style.left = Math.random() * window.innerWidth + 'px';
    });
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
`;
document.head.appendChild(style);

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

function waitForCompleteDataLoad() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 5;
        const checkInterval = 100;
        
        function checkDataComplete() {
            attempts++;
            
            if (window.userData && window.userData.lastUsed) {
                window.clientConfig.smartLog('buffer', 'Essential data structures confirmed loaded');
                setTimeout(resolve, 50);
                return;
            }
            
            if (window.userData && typeof window.saveUserData === 'function') {
                if (!window.userData.companies) window.userData.companies = {};
                if (!window.userData.jobTitles) window.userData.jobTitles = [];
                if (!window.userData.locations) window.userData.locations = [];
                if (!window.userData.careerPages) window.userData.careerPages = [];
                
                window.clientConfig.smartLog('buffer', 'Data structures initialized and confirmed loaded');
                setTimeout(resolve, 50);
                return;
            }
            
            if (attempts < maxAttempts) {
                if (attempts <= 2) {
                    window.clientConfig.smartLog('buffer', `Waiting for complete data load... attempt ${attempts}/${maxAttempts}`);
                }
                setTimeout(checkDataComplete, checkInterval);
            } else {
                window.clientConfig.smartLog('buffer', 'Proceeding with available data structures');
                if (window.userData && !window.userData.companies) {
                    window.userData.companies = {};
                    window.userData.jobTitles = [];
                    window.userData.locations = [];
                    window.userData.careerPages = [];
                }
                resolve();
            }
        }
        
        checkDataComplete();
    });
}

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            if (!isAppInitialized) return;
            const pageName = this.getAttribute('data-page');
            if (isValidPage(pageName)) {
                navigateTo(pageName);
            }
        });
        
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(8px)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0)';
        });
    });
}

function isValidPage(pageName) {
    const validPages = ['dashboard', 'job-search', 'email-search', 'applications', 'profile', 'cv-builder', 'linktree', 'resources', 'settings', 'help', 'pricing'];
    return validPages.includes(pageName);
}

function setupRouting() {
    window.addEventListener('hashchange', function() {
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

function navigateTo(pageName) {
    if (!isAppInitialized || !isValidPage(pageName)) return;
    
    if (currentComponent && shouldSaveComponentState(currentComponent)) {
        saveComponentState(currentComponent);
    }
    
    window.history.pushState({page: pageName}, '', `#${pageName}`);
    loadComponent(pageName, false);
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
    
    const excludedSelectors = [
        '[data-company-id]',
        '[data-field="name"]',
        '[data-field="location"]',
        '[data-field="appliedDate"]',
        '.companies-table input',
        '.companies-table textarea',
        '#companies-table input',
        '#companies-table textarea'
    ];
    
    if (excludedIds.includes(element.id)) return true;
    
    if (excludedClasses.some(cls => element.classList.contains(cls))) return true;
    
    if (excludedSelectors.some(selector => {
        try {
            return element.matches(selector);
        } catch(e) {
            return false;
        }
    })) return true;
    
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
                (window.clientConfig?window.clientConfig.smartLog:(()=>{}))
                ('fail',`Failed to save state for element: ${error.message}`);
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
                    (window.clientConfig?window.clientConfig.smartLog:(()=>{}))
                    ('fail',`Failed to restore state for ${selector}: ${error.message}`);
                }
            });
        } catch (error) {
            (window.clientConfig?window.clientConfig.smartLog:(()=>{}))
            ('fail',`Invalid selector in state restoration: ${selector}: ${error.message}`);
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

window.ensureDataIntegrity = function ensureDataIntegrity() {
    if (!window.userData) {
        window.clientConfig.smartLog('fail', 'userData is null, reloading...');
        if (window.unifiedPreferencesService) {
            window.unifiedPreferencesService.load().then(() => {
                window.clientConfig.smartLog('win', 'userData reloaded successfully');
            });
        }
        return false;
    }
    
    if (!window.userData.careerPageLists) {
        window.userData.careerPageLists = {
            listA: [],
            listB: [],
            listC: [],
            listD: [],
            listE: []
        };
        window.clientConfig.smartLog('buffer', 'Restored missing careerPageLists structure');
    }
    
    if (!window.userData.companies) {
        window.userData.companies = {};
        window.clientConfig.smartLog('buffer', 'Restored missing companies structure');
    }
    
    return true;
}

async function loadComponent(componentName, updateURL = true) {
    if (!isAppInitialized) {
        window.clientConfig.smartLog('buffer', 'App not initialized yet, waiting...');
        return;
    }
    
    if (!isValidPage(componentName)) {
        window.clientConfig.smartLog('fail', `Invalid page requested: ${componentName}, redirecting to dashboard`);
        componentName = 'dashboard';
    }
    
    if (typeof window.ensureDataIntegrity === 'function' && !window.ensureDataIntegrity()) {
        if (window.unifiedPreferencesService) {
            await window.unifiedPreferencesService.load();
        }
        await waitForDataReady();
    }
    
    try {
        if (currentComponent && currentComponent !== componentName) {
            if (window.userData) {
                await window.safeSaveUserPreferences(window.userData);
                window.clientConfig.smartLog('buffer', `Saved userData before leaving ${currentComponent}`);
            }
            
            if (shouldSaveComponentState(currentComponent)) {
                saveComponentState(currentComponent);
            }
        }

        await waitForDataReady();

        document.querySelectorAll('.nav-item').forEach(navItem => {
            navItem.classList.remove('active');
            if (navItem.getAttribute('data-page') === componentName) {
                navItem.classList.add('active');
            }
        });

        const container = document.getElementById('page-container');
        if (!container) {
            window.clientConfig.smartLog('fail', 'Page container not found');
            return;
        }

        container.style.opacity = '0';
        container.style.transform = 'translateY(20px)';

        setTimeout(async () => {
            container.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 300px;">
                    <div style="text-align: center;">
                        <div class="loading-spinner">
                            <div></div><div></div><div></div><div></div>
                        </div>
                        <p style="margin-top: 20px; color: var(--text-secondary);">${getTranslatedMessage('common.loading')}</p>
                    </div>
                </div>
            `;

            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';

            window.clientConfig.smartLog('buffer', `Attempting to load component: ${componentName}`);
            
            const response = await fetch(`components/${componentName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load component HTML: ${componentName} - Status: ${response.status}`);
            }

            const html = await response.text();
            window.clientConfig.smartLog('buffer', `Component HTML loaded: ${componentName}`);

            container.style.opacity = '0';
            
            setTimeout(() => {
                container.innerHTML = html;
                container.style.opacity = '1';
                window.clientConfig.smartLog('buffer', `Component HTML inserted: ${componentName}`);

                initAnimations();

                loadScript(`js/components/${componentName}.js`, true)
                    .then(async () => {
                        window.clientConfig.smartLog('buffer', `Component script loaded: ${componentName}`);
                        currentComponent = componentName;
                        
                        await waitForComponentInitialization(componentName);
                        
                        if (window.userData && !isDataReady()) {
                            await window.unifiedPreferencesService.load();
                        }
                        
                        if (window.uiManager) {
                            window.uiManager.updateComponentTexts(componentName);
                        }
                        
                        if (shouldSaveComponentState(componentName)) {
                            setTimeout(() => {
                                restoreComponentState(componentName);
                            }, 1000);
                        }
                        
                        if (updateURL) {
                            window.history.replaceState({page: componentName}, '', `#${componentName}`);
                        }
                        
                        window.clientConfig.smartLog('win', `Component fully loaded: ${componentName}`);
                    })
                    .catch(scriptError => {
                        window.clientConfig.smartLog('fail', `Error loading script for ${componentName}: ${scriptError.message}`);
                        throw scriptError;
                    });
            }, 150);
        }, 150);

    } catch (error) {
        window.clientConfig.smartLog('fail', `Error loading component "${componentName}": ${error.message}`);
        showToast('error', getTranslatedMessage('messages.loadError', {component: componentName}));
        
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = `
                <div class="error-message" style="margin: 20px; padding: 20px; background: rgba(255, 0, 0, 0.1); border-radius: 8px; color: #ff4757;">
                    <h3>${getTranslatedMessage('common.error')}</h3>
                    <p>${error.message}</p>
                    <p>Please check the console for more details.</p>
                </div>
            `;
            container.style.opacity = '1';
        }
    }
}

const loadingStyle = document.createElement('style');
loadingStyle.textContent = `
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
`;
document.head.appendChild(loadingStyle);

function waitForComponentInitialization(componentName) {
    return new Promise((resolve) => {
        if (componentName === 'cv-builder') {
            let attempts = 0;
            const maxAttempts = 20;
            
            function checkCvBuilderReady() {
                attempts++;
                
                const hasModals = document.getElementById('experience-modal') && 
                               document.getElementById('education-modal');
                const hasButtons = document.getElementById('preview-cv') && 
                                 document.getElementById('export-pdf');
                
                if (hasModals && hasButtons) {
                    window.clientConfig.smartLog('buffer', 'CV Builder component confirmed ready');
                    resolve();
                    return;
                }
                
                if (attempts < maxAttempts) {
                    setTimeout(checkCvBuilderReady, 200);
                } else {
                    window.clientConfig.smartLog('buffer', 'CV Builder initialization timeout, proceeding');
                    resolve();
                }
            }
            
            setTimeout(checkCvBuilderReady, 300);
            return;
        }
        
        if (componentName !== 'job-search') {
            resolve();
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 10;
        
        function checkComponentReady() {
            attempts++;
            
            if (window.jobSearchModule && window.getComponentData) {
                window.clientConfig.smartLog('buffer', 'Job search component confirmed ready');
                resolve();
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(checkComponentReady, 200);
            } else {
                window.clientConfig.smartLog('buffer', 'Component initialization timeout, proceeding');
                resolve();
            }
        }
        
        setTimeout(checkComponentReady, 100);
    });
}

function waitForDataReady() {
    return new Promise((resolve) => {
        function checkReady() {
            if (window.unifiedPreferencesService && window.unifiedPreferencesService.isReady()) {
                resolve();
            } else {
                setTimeout(checkReady, 100);
            }
        }
        checkReady();
    });
}

function isDataReady() {
    return window.unifiedPreferencesService && window.unifiedPreferencesService.isReady();
}

function loadScript(src, isModule = false) {
    return new Promise((resolve, reject) => {
        const normalizedSrc = src.replace(/\?v=\d+/, '');
        const existing = document.querySelector(`script[data-src="${normalizedSrc}"]`);
        if (existing) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = `${src}?v=${Date.now()}`;
        script.type = isModule ? 'module' : 'text/javascript';
        script.defer = true;
        script.dataset.src = normalizedSrc;

        script.onload = () => {
            if (window.clientConfig) {
                window.clientConfig.smartLog('buffer', `Script loaded successfully: ${src}`);
            }
            resolve();
        };
        script.onerror = () =>
            reject(new Error(`Failed to load script: ${src}`));

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
        toastTitle.textContent = options.title || getTranslatedMessage('common.success');
        toastIcon.className = 'fas fa-check-circle';
    } else if (type === 'error') {
        toast.classList.add('toast-error');
        toastTitle.textContent = options.title || getTranslatedMessage('common.error');
        toastIcon.className = 'fas fa-exclamation-circle';
    } else if (type === 'info') {
        toast.classList.add('toast-info');
        toastTitle.textContent = options.title || getTranslatedMessage('common.info');
        toastIcon.className = 'fas fa-info-circle';
    } else if (type === 'warning') {
        toast.classList.add('toast-warning');
        toastTitle.textContent = options.title || getTranslatedMessage('common.warning');
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
            getTranslatedMessage('messages.queueOptimization', {domains: domainsNotified}),
            { 
                title: 'Smart Queue Active', 
                duration: 5000 
            }
        );
    } else if (type === 'shared_cache') {
        const efficiency = Math.round(((domainsCached + domainsNotified) / (domainsScraped + domainsCached + domainsNotified)) * 100);
        showToast('shared', 
            getTranslatedMessage('messages.sharedCache', {totalResults, domainsNotified, efficiency}),
            { 
                title: 'Shared Cache Results', 
                duration: 4000 
            }
        );
    } else if (type === 'mixed_results') {
        showToast('info', 
            getTranslatedMessage('messages.mixedResults', {totalResults, domainsScraped, domainsCached, domainsNotified}),
            { 
                title: 'Mixed Search Results', 
                duration: 4000 
            }
        );
    } else if (type === 'cache_only') {
        showToast('info', 
            getTranslatedMessage('messages.cacheOnly', {totalResults, domainsCached}),
            { 
                title: 'Cache Search Complete', 
                duration: 3000 
            }
        );
    } else if (type === 'live_search') {
        showToast('success', 
            getTranslatedMessage('messages.liveSearch', {totalResults, domainsScraped}),
            { 
                title: 'Live Search Complete', 
                duration: 3500 
            }
        );
    }
}

window.animateValue = animateValue;
window.showToast = showToast;
window.showContextualMessage = showContextualMessage;
window.getTranslatedMessage = getTranslatedMessage;