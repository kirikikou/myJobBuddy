(function() {
    let userData = null;
    let isInitialized = false;
    let isLoading = false;
    let serverAuthoritativeFields = ['subscription', 'usage', 'lastUsed', 'userId', 'email'];
    
    function getDefaultPreferences() {
        return {
            jobTitles: [],
            locations: [],
            careerPages: [],
            profileComments: ["", "", "", ""],
            profileLinks: Array(10).fill(""),
            lastUsed: new Date().toISOString(),
            cvs: {
                cv_1: {
                    name: '', active: false,
                    personalInfo: {
                        firstName: '', lastName: '', jobTitle: '', location: '', email: '', phone: '',
                        drivingLicense: '', languages: '', additionalNote: '', personalComment: '',
                        website: '', linkedin: '', portfolio: '', link1: '', link2: ''
                    },
                    summary: '', experience: [], education: [],
                    extra1: { title: '', content: '' }, extra2: { title: '', content: '' },
                    coverLetterTitle: '', coverLetterContent: '', photo: null, photoSize: 0
                }
            },
            linktrees: {},
            subscription: { plan: 'free', features: {} },
            jobSearchData: { lastSearchResults: [], lastSearchDate: null, searchedDomains: [], favoriteJobs: [] },
            emailSearchData: { lastSearchResults: [], lastSearchDate: null, searchedDomains: [], favoriteEmails: [] },
            careerPageLists: { listA: [], listB: [], listC: [], listD: [], listE: [] },
            currentActiveList: 'listA',
            showFavoritesInCareerList: true,
            showSelectionAInCareerList: false,
            showSelectionBInCareerList: false,
            showSelectionCInCareerList: false,
            companies: {},
            applications: [],
            profile: {},
            coverLetters: {},
            links: {},
            settings: {
                reminderSettings: { reminder15Days: true, reminder30Days: true },
                appearance: { theme: 'dark' },
                popupNotifications: {
                    template: 'discrete',
                    types: { searchComplete: true, jobMatch: true, reminder15: true, reminder30: true }
                }
            },
            dashboardWidgets: {},
            usage: { scrapingRequests: 0, cacheSearches: 0, applicationsTracked: 0, lastResetDate: new Date().toISOString().split('T')[0] }
        };
    }
    
    function deepMergeClient(serverData, localState) {
        if (!serverData || typeof serverData !== 'object') {
            if (window.clientConfig) {
                window.clientConfig.smartLog('buffer', 'Client merge: server data invalid, using defaults');
            }
            return getDefaultPreferences();
        }
        
        if (!localState || typeof localState !== 'object') {
            if (window.clientConfig) {
                window.clientConfig.smartLog('win', 'Client merge: no local state, using server data as-is');
            }
            return ensureCompleteStructure(serverData);
        }
        
        const result = JSON.parse(JSON.stringify(serverData));
        
        for (const key in localState) {
            if (!localState.hasOwnProperty(key)) continue;
            
            if (serverAuthoritativeFields.includes(key)) {
                if (window.clientConfig) {
                    window.clientConfig.smartLog('buffer', `Client merge: skipping server-authoritative field: ${key}`);
                }
                continue;
            }
            
            if (!(key in result)) {
                result[key] = localState[key];
                if (window.clientConfig) {
                    window.clientConfig.smartLog('buffer', `Client merge: added missing local field: ${key}`);
                }
            } else if (typeof result[key] === 'object' && !Array.isArray(result[key]) && 
                      typeof localState[key] === 'object' && !Array.isArray(localState[key])) {
                
                result[key] = deepMergeClient(result[key], localState[key]);
            }
        }
        
        if (window.clientConfig) {
            window.clientConfig.smartLog('win', 'Client merge: server-priority merge completed');
        }
        
        return ensureCompleteStructure(result);
    }
    
    function ensureCompleteStructure(data) {
        if (!data || typeof data !== 'object') {
            return getDefaultPreferences();
        }
        
        const defaults = getDefaultPreferences();
        const result = JSON.parse(JSON.stringify(data));
        
        if (!result.careerPageLists || typeof result.careerPageLists !== 'object') {
            result.careerPageLists = { listA: [], listB: [], listC: [], listD: [], listE: [] };
        }
        
        for (const listKey of ['listA', 'listB', 'listC', 'listD', 'listE']) {
            if (!Array.isArray(result.careerPageLists[listKey])) {
                result.careerPageLists[listKey] = [];
            }
        }
        
        if (!result.currentActiveList || !['listA', 'listB', 'listC', 'listD', 'listE'].includes(result.currentActiveList)) {
            result.currentActiveList = 'listA';
        }
        
        ['companies', 'coverLetters', 'links', 'linktrees'].forEach(key => {
            if (result[key] === undefined || result[key] === null || typeof result[key] !== 'object' || Array.isArray(result[key])) {
                result[key] = defaults[key];
            }
        });
        
        ['applications', 'resources'].forEach(key => {
            if (!Array.isArray(result[key])) {
                result[key] = defaults[key];
            }
        });
        
        if (!result.subscription || typeof result.subscription !== 'object') {
            result.subscription = defaults.subscription;
        }
        
        if (!result.subscription.plan) {
            result.subscription.plan = 'free';
        }
        
        if (!result.lastUsed) {
            result.lastUsed = new Date().toISOString();
        }
        
        if (window.clientConfig) {
            window.clientConfig.smartLog('win', 'Client normalization: structure ensured and validated');
        }
        
        return result;
    }
    
    async function loadUserPreferences() {
        if (isLoading) {
            while (isLoading) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return userData;
        }
        
        isLoading = true;
        
        try {
            const response = await fetch('/api/get-user-preferences', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Failed to load preferences`);
            }
            
            const result = await response.json();
            
            if (result.success && result.preferences) {
                const serverData = result.preferences;
                const existingLocal = userData;
                
                userData = deepMergeClient(serverData, existingLocal);
                
                if (window.clientConfig) {
                    if (result.fromDefaults) {
                        window.clientConfig.smartLog('buffer', 'UnifiedPreferencesService: server provided normalized defaults');
                    } else {
                        window.clientConfig.smartLog('win', 'UnifiedPreferencesService: server data merged with client-priority for server fields');
                    }
                }
            } else {
                userData = getDefaultPreferences();
                if (window.clientConfig) {
                    window.clientConfig.smartLog('buffer', 'UnifiedPreferencesService: server response invalid, using client defaults');
                }
            }
            
            isInitialized = true;
            isLoading = false;
            window.userData = userData;
            
            broadcastDataUpdate();
            
            return userData;
            
        } catch (error) {
            if (window.clientConfig) {
                window.clientConfig.smartLog('fail', `UnifiedPreferencesService: load error - ${error.message}`);
            }
            
            userData = userData || getDefaultPreferences();
            isInitialized = true;
            isLoading = false;
            window.userData = userData;
            
            broadcastDataUpdate();
            
            return userData;
        }
    }
    
    async function saveUserPreferences(data, immediate = true) {
        if (!data) {
            if (window.clientConfig) {
                window.clientConfig.smartLog('fail', 'UnifiedPreferencesService: no data to save');
            }
            return false;
        }
        
        const sanitizedData = stripServerAuthoritativeFields(data);
        
        try {
            const response = await fetch('/api/save-user-preferences', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': generateIdempotencyKey()
                },
                body: JSON.stringify(sanitizedData)
            });
            
            if (response.status === 204) {
                if (window.clientConfig) {
                    window.clientConfig.smartLog('cache', 'UnifiedPreferencesService: no changes detected by server (204)');
                }
                return true;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Save failed`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                if (result.preferences) {
                    const existingLocal = userData;
                    userData = deepMergeClient(result.preferences, existingLocal);
                } else {
                    userData = ensureCompleteStructure(sanitizedData);
                }
                
                window.userData = userData;
                
                if (window.clientConfig) {
                    window.clientConfig.smartLog('win', 'UnifiedPreferencesService: preferences saved and server response merged');
                }
                
                broadcastDataUpdate();
                return true;
            }
            
            return false;
            
        } catch (error) {
            if (window.clientConfig) {
                window.clientConfig.smartLog('fail', `UnifiedPreferencesService: save error - ${error.message}`);
            }
            return false;
        }
    }
    
    function stripServerAuthoritativeFields(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        const sanitized = { ...data };
        
        serverAuthoritativeFields.forEach(field => {
            if (field === 'subscription' && sanitized.subscription) {
                const { plan, status, startDate, endDate, features, ...clientSubscription } = sanitized.subscription;
                sanitized.subscription = clientSubscription;
            } else {
                delete sanitized[field];
            }
        });
        
        if (window.clientConfig) {
            window.clientConfig.smartLog('buffer', 'UnifiedPreferencesService: stripped server-authoritative fields from client data');
        }
        
        return sanitized;
    }
    
    function generateIdempotencyKey() {
        return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    async function getUserPreferences() {
        if (!isInitialized) {
            return await loadUserPreferences();
        }
        return userData || getDefaultPreferences();
    }
    
    function broadcastDataUpdate() {
        const event = new CustomEvent('userDataUpdated', { 
            detail: userData || getDefaultPreferences() 
        });
        window.dispatchEvent(event);
    }
    
    function ensureUserPreferences() {
        if (!userData) {
            userData = getDefaultPreferences();
            window.userData = userData;
        }
        return userData;
    }
    
    function isReady() {
        return isInitialized && userData !== null;
    }
    
    window.unifiedPreferencesService = {
        load: loadUserPreferences,
        save: saveUserPreferences,
        get: getUserPreferences,
        ensure: ensureUserPreferences,
        isReady: isReady,
        getDefaults: getDefaultPreferences,
        reload: loadUserPreferences
    };
    
    window.getUserPreferences = getUserPreferences;
    window.updateUserPreferences = saveUserPreferences;
    window.saveUserData = saveUserPreferences;
    window.loadUserData = loadUserPreferences;
    
    window.safeSaveUserPreferences = async (data) => {
        const success = await saveUserPreferences(data, true);
        if (success) {
            await loadUserPreferences();
        }
        return success;
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUserPreferences);
    } else {
        loadUserPreferences();
    }
})();