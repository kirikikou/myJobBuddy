async function saveUserData(prefs){if(window.safeSaveUserPreferences){return await window.safeSaveUserPreferences(prefs||window.userData)}return await fetch('/api/save-user-preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(prefs||window.userData)}).then(r=>r.json())}

async function loadUserData() {
    try {
        const response = await fetch('/api/get-user-preferences');
        if (!response.ok) {
            throw new Error('Failed to load user preferences');
        }
        const result = await response.json();
        if (result.success && result.preferences) {
            userData = result.preferences;
            return userData;
        } else {
            throw new Error('Invalid preferences data');
        }
    } catch (error) {
        if (window.clientConfig && window.clientConfig.smartLog) {
            window.clientConfig.smartLog('fail', `Error loading user data: ${error.message}`);
        }
        userData = {
            cvs: {},
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
            showFavoritesInCareerList: true
        };
        saveUserData();
        return userData;
    }
}

function getUserPreferences() {
    return userData;
}

function updateUserPreferences(prefs) {
    userData = prefs;
    saveUserData().catch(error => {
        if (window.clientConfig && window.clientConfig.smartLog) {
            window.clientConfig.smartLog('fail', `Error saving user preferences: ${error.message}`);
        }
    });
}

window.getUserPreferences    = getUserPreferences;
window.updateUserPreferences = updateUserPreferences;
window.saveUserData = saveUserData;

function applyUserData(data) {
    if (!data.companies) data.companies = {};
    if (!data.profile) data.profile = {};
    if (!data.coverLetters) data.coverLetters = {};
    if (!data.links) data.links = {};
    if (!data.linktrees) {
        data.linktrees = {
            1: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', links: [] },
            2: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', links: [] },
            3: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', links: [] }
        };
    }
    if (!data.settings) {
        data.settings = {
            reminderSettings: {
                reminder15Days: true,
                reminder30Days: true
            },
            appearance: {
                theme: 'dark'
            }
        };
    }
    
    userData = data;
    userData.lastUsed = new Date().toISOString();
    
    if (window.clientConfig && window.clientConfig.smartLog) {
        window.clientConfig.smartLog('buffer', 'User data applied successfully');
    }
}