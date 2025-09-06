let userData = {};
let isDataLoaded = false;
let loadPromise = null;

async function saveUserData(prefs) {
    const dataToSave = prefs || userData;
    
    if (!dataToSave || Object.keys(dataToSave).length === 0) {
        window.clientConfig && window.clientConfig.smartLog('fail', 'No data to save');
        return {success: false, error: 'No data to save'};
    }
    
    try {
        if (window.safeSaveUserPreferences) {
            const result = await window.safeSaveUserPreferences(dataToSave);
            if (result && result.success) {
                window.clientConfig && window.clientConfig.smartLog('win', 'User data saved successfully via safeSave');
                userData = dataToSave;
                window.userData = userData;
                broadcastDataUpdate();
                return result;
            } else {
                window.clientConfig && window.clientConfig.smartLog('fail', 'safeSaveUserPreferences failed, using fallback:', result);
            }
        }
        
        const response = await fetch('/api/save-user-preferences', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dataToSave)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
            window.clientConfig && window.clientConfig.smartLog('win', 'User data saved successfully via fallback API');
            userData = dataToSave;
            window.userData = userData;
            broadcastDataUpdate();
        } else {
            window.clientConfig && window.clientConfig.smartLog('fail', 'API save failed:', result.message);
        }
        return result;
        
    } catch (error) {
        window.clientConfig && window.clientConfig.smartLog('fail', 'Error saving user data:', error.message);
        return { success: false, error: error.message };
    }
}

async function loadUserData() {
    if (loadPromise) {
        window.clientConfig && window.clientConfig.smartLog('buffer', 'Load already in progress, waiting...');
        return await loadPromise;
    }
    
    loadPromise = _performLoad();
    const result = await loadPromise;
    loadPromise = null;
    return result;
}

async function _performLoad() {
    try {
        window.clientConfig && window.clientConfig.smartLog('buffer', 'Starting user data load...');
        
        const response = await fetch('/api/get-user-preferences');
        if (!response.ok) {
            throw new Error(`Failed to load user preferences: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success && result.preferences) {
            const loadedData = result.preferences;
            window.clientConfig && window.clientConfig.smartLog('win', 'Raw user data loaded from server');
            
            if (!loadedData.careerPageLists) {
                loadedData.careerPageLists = {
                    listA: [],
                    listB: [],
                    listC: [],
                    listD: [],
                    listE: []
                };
            }
            
            if (!loadedData.companies) {
                loadedData.companies = {};
            }
            
            if (typeof loadedData.showFavoritesInCareerList === 'undefined') {
                loadedData.showFavoritesInCareerList = true;
            }
            
            if (typeof loadedData.showSelectionAInCareerList === 'undefined') {
                loadedData.showSelectionAInCareerList = false;
            }
            
            if (typeof loadedData.showSelectionBInCareerList === 'undefined') {
                loadedData.showSelectionBInCareerList = false;
            }
            
            if (typeof loadedData.showSelectionCInCareerList === 'undefined') {
                loadedData.showSelectionCInCareerList = false;
            }
            
            if (!loadedData.currentActiveList) {
                loadedData.currentActiveList = 'listA';
            }
            
            applyUserData(loadedData);
            
            userData = window.userData;
            isDataLoaded = true;
            
            if (window.clientConfig) {
                window.clientConfig.smartLog('win', 'User data fully loaded and applied');
                window.clientConfig.smartLog('buffer', 'Verification:', {
                    careerPageLists: Object.keys(userData.careerPageLists || {}),
                    companies: Object.keys(userData.companies || {}).length,
                    subscription: userData.subscription?.plan
                });
            }
            
            broadcastDataUpdate();
            
            return userData;
        } else {
            throw new Error('Invalid preferences data structure');
        }
    } catch (error) {
        window.clientConfig && window.clientConfig.smartLog('fail', 'Error loading user data:', error.message);
        
        const defaultData = getDefaultUserData();
        applyUserData(defaultData);
        
        userData = window.userData;
        isDataLoaded = true;
        
        try {
            await saveUserData();
            window.clientConfig && window.clientConfig.smartLog('win', 'Default user data created and saved');
        } catch (saveError) {
            window.clientConfig && window.clientConfig.smartLog('fail', 'Failed to save default data:', saveError.message);
        }
        
        broadcastDataUpdate();
        return userData;
    }
}

function getDefaultUserData() {
    return {
        cvs: {
            cv_1: {
                name: '',
                active: false,
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
        jobTitles: [],
        locations: [],
        careerPages: [],
        companies: {},
        applications: [],
        profile: {},
        coverLetters: {},
        links: {},
        linktrees: {},
        settings: {
            reminderSettings: {
                reminder15Days: true,
                reminder30Days: true
            },
            appearance: {
                theme: 'dark'
            },
            popupNotifications: {
                template: 'discrete',
                types: {
                    searchComplete: true,
                    jobMatch: true,
                    reminder15: true,
                    reminder30: true
                }
            }
        },
        dashboardWidgets: {},
        jobSearchData: {
            lastSearchResults: [],
            lastSearchDate: null,
            selectedSite: 'career-pages'
        },
        careerPageLists: {
            listA: [],
            listB: [],
            listC: [],
            listD: [],
            listE: []
        },
        currentActiveList: 'listA',
        showFavoritesInCareerList: true,
        showSelectionAInCareerList: false,
        showSelectionBInCareerList: false,
        showSelectionCInCareerList: false
    };
}

function getUserPreferences() {
    if (!isDataLoaded) {
        window.clientConfig && window.clientConfig.smartLog('fail', 'getUserPreferences called before data was loaded');
        return getDefaultUserData();
    }
    return userData;
}

function updateUserPreferences(prefs) {
    if (!prefs) {
        window.clientConfig && window.clientConfig.smartLog('fail', 'updateUserPreferences called with null/undefined data');
        return;
    }
    
    applyUserData(prefs);
    userData = window.userData;
    
    saveUserData().then(result => {
        if (result && result.success) {
            window.clientConfig && window.clientConfig.smartLog('win', 'User preferences updated successfully');
        } else {
            window.clientConfig && window.clientConfig.smartLog('fail', 'Failed to save updated preferences');
        }
    }).catch(error => {
        window.clientConfig && window.clientConfig.smartLog('fail', 'Error updating user preferences:', error.message);
    });
}

function applyUserData(data) {
    if (!data) {
        window.clientConfig && window.clientConfig.smartLog('fail', 'applyUserData called with null/undefined data');
        return;
    }
    
    window.clientConfig && window.clientConfig.smartLog('buffer', 'Applying user data with keys:', Object.keys(data));
    
    const existingData = window.userData || {};
    
    const mergedData = {
        ...existingData,
        ...data,
        companies: {...(existingData.companies || {}), ...(data.companies || {})},
        profile: {...(existingData.profile || {}), ...(data.profile || {})},
        coverLetters: {...(existingData.coverLetters || {}), ...(data.coverLetters || {})},
        links: {...(existingData.links || {}), ...(data.links || {})},
        linktrees: {...(existingData.linktrees || {}), ...(data.linktrees || {})},
        applications: data.applications || existingData.applications || [],
        jobTitles: data.jobTitles || existingData.jobTitles || [],
        locations: data.locations || existingData.locations || [],
        careerPages: data.careerPages || existingData.careerPages || [],
        cvs: {...(existingData.cvs || {}), ...(data.cvs || {})},
        careerPageLists: {
            listA: data.careerPageLists?.listA || existingData.careerPageLists?.listA || [],
            listB: data.careerPageLists?.listB || existingData.careerPageLists?.listB || [],
            listC: data.careerPageLists?.listC || existingData.careerPageLists?.listC || [],
            listD: data.careerPageLists?.listD || existingData.careerPageLists?.listD || [],
            listE: data.careerPageLists?.listE || existingData.careerPageLists?.listE || []
        },
        currentActiveList: data.currentActiveList || existingData.currentActiveList || 'listA',
        showFavoritesInCareerList: data.showFavoritesInCareerList !== undefined ? data.showFavoritesInCareerList : (existingData.showFavoritesInCareerList !== undefined ? existingData.showFavoritesInCareerList : true),
        showSelectionAInCareerList: data.showSelectionAInCareerList !== undefined ? data.showSelectionAInCareerList : (existingData.showSelectionAInCareerList !== undefined ? existingData.showSelectionAInCareerList : false),
        showSelectionBInCareerList: data.showSelectionBInCareerList !== undefined ? data.showSelectionBInCareerList : (existingData.showSelectionBInCareerList !== undefined ? existingData.showSelectionBInCareerList : false),
        showSelectionCInCareerList: data.showSelectionCInCareerList !== undefined ? data.showSelectionCInCareerList : (existingData.showSelectionCInCareerList !== undefined ? existingData.showSelectionCInCareerList : false),
        settings: {
            reminderSettings: {
                reminder15Days: data.settings?.reminderSettings?.reminder15Days !== undefined ? data.settings.reminderSettings.reminder15Days : existingData.settings?.reminderSettings?.reminder15Days !== undefined ? existingData.settings.reminderSettings.reminder15Days : true,
                reminder30Days: data.settings?.reminderSettings?.reminder30Days !== undefined ? data.settings.reminderSettings.reminder30Days : existingData.settings?.reminderSettings?.reminder30Days !== undefined ? existingData.settings.reminderSettings.reminder30Days : true
            },
            appearance: {
                theme: data.settings?.appearance?.theme || existingData.settings?.appearance?.theme || 'dark'
            },
            popupNotifications: {
                template: data.settings?.popupNotifications?.template || existingData.settings?.popupNotifications?.template || 'discrete',
                types: {
                    searchComplete: data.settings?.popupNotifications?.types?.searchComplete !== undefined ? data.settings.popupNotifications.types.searchComplete : existingData.settings?.popupNotifications?.types?.searchComplete !== undefined ? existingData.settings.popupNotifications.types.searchComplete : true,
                    jobMatch: data.settings?.popupNotifications?.types?.jobMatch !== undefined ? data.settings.popupNotifications.types.jobMatch : existingData.settings?.popupNotifications?.types?.jobMatch !== undefined ? existingData.settings.popupNotifications.types.jobMatch : true,
                    reminder15: data.settings?.popupNotifications?.types?.reminder15 !== undefined ? data.settings.popupNotifications.types.reminder15 : existingData.settings?.popupNotifications?.types?.reminder15 !== undefined ? existingData.settings.popupNotifications.types.reminder15 : true,
                    reminder30: data.settings?.popupNotifications?.types?.reminder30 !== undefined ? data.settings.popupNotifications.types.reminder30 : existingData.settings?.popupNotifications?.types?.reminder30 !== undefined ? existingData.settings.popupNotifications.types.reminder30 : true
                }
            }
        },
        jobSearchData: {
            lastSearchResults: data.jobSearchData?.lastSearchResults || existingData.jobSearchData?.lastSearchResults || [],
            lastSearchDate: data.jobSearchData?.lastSearchDate || existingData.jobSearchData?.lastSearchDate || null,
            searchedDomains: data.jobSearchData?.searchedDomains || existingData.jobSearchData?.searchedDomains || [],
            favoriteJobs: data.jobSearchData?.favoriteJobs || existingData.jobSearchData?.favoriteJobs || [],
            selectedSite: data.jobSearchData?.selectedSite || existingData.jobSearchData?.selectedSite || 'career-pages'
        },
        subscription: data.subscription || existingData.subscription || {
            plan: 'free',
            startDate: new Date().toISOString().split('T')[0],
            features: {}
        },
        usage: data.usage || existingData.usage || {
            scrapingRequests: 0,
            cacheSearches: 0,
            applicationsTracked: 0,
            lastResetDate: new Date().toISOString().split('T')[0]
        },
        userId: data.userId || existingData.userId,
        email: data.email || existingData.email,
        lastUsed: new Date().toISOString()
    };
    
    if (!mergedData.linktrees || Object.keys(mergedData.linktrees).length === 0) {
        mergedData.linktrees = {
            1: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', links: [] },
            2: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', links: [] },
            3: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', links: [] }
        };
    }
    
    userData = mergedData;
    window.userData = userData;
    
    window.clientConfig && window.clientConfig.smartLog('win', 'userData fully applied with merge and assigned globally');
}

function broadcastDataUpdate() {
    const event = new CustomEvent('userDataUpdated', { detail: userData });
    window.dispatchEvent(event);
    window.clientConfig && window.clientConfig.smartLog('buffer', 'userDataUpdated event dispatched');
}

function isDataReady() {
    return isDataLoaded && userData && window.userData && window.userData.lastUsed;
}

function waitForDataReady() {
    return new Promise((resolve) => {
        if (isDataReady()) {
            resolve(userData);
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 50;
        
        function checkReady() {
            attempts++;
            
            if (isDataReady()) {
                window.clientConfig && window.clientConfig.smartLog('win', `Data ready after ${attempts} attempts`);
                resolve(userData);
                return;
            }
            
            if (attempts >= maxAttempts) {
                window.clientConfig && window.clientConfig.smartLog('fail', 'Data readiness timeout, returning current state');
                resolve(userData || getDefaultUserData());
                return;
            }
            
            setTimeout(checkReady, 100);
        }
        
        checkReady();
    });
}

window.getUserPreferences = getUserPreferences;
window.updateUserPreferences = updateUserPreferences;
window.saveUserData = saveUserData;
window.loadUserData = loadUserData;
window.applyUserData = applyUserData;
window.isDataReady = isDataReady;
window.waitForDataReady = waitForDataReady;