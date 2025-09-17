let _lastPreferencesSnapshot = null;
let _saveTimeout = null;
let _pendingSave = false;
let _saveQueue = [];

const DEBOUNCE_DELAY = 400;

export async function getUserPreferences() {
    try {
        const response = await fetch('/api/get-user-preferences', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user preferences');
        }
        
        const data = await response.json();
        
        if (data.success && data.preferences) {
            const preferences = ensureDefaultCVStructure(data.preferences);
            _lastPreferencesSnapshot = createSnapshot(preferences);
            return preferences;
        } else {
            const defaultPrefs = getDefaultPreferences();
            _lastPreferencesSnapshot = createSnapshot(defaultPrefs);
            return defaultPrefs;
        }
    } catch (error) {
        console.error('Error fetching user preferences:', error);
        const defaultPrefs = getDefaultPreferences();
        _lastPreferencesSnapshot = createSnapshot(defaultPrefs);
        return defaultPrefs;
    }
}

export async function updateUserPreferences(preferences, options = {}) {
    return new Promise((resolve, reject) => {
        const currentSnapshot = createSnapshot(preferences);
        
        if (!options.force && _lastPreferencesSnapshot && areSnapshotsEqual(currentSnapshot, _lastPreferencesSnapshot)) {
            resolve(true);
            return;
        }
        
        if (options.immediate) {
            _saveUserPreferencesNow(preferences).then(resolve).catch(reject);
            return;
        }
        
        _saveQueue.push({ preferences, resolve, reject });
        
        if (_saveTimeout) {
            clearTimeout(_saveTimeout);
        }
        
        _saveTimeout = setTimeout(_processSaveQueue, DEBOUNCE_DELAY);
    });
}

async function _processSaveQueue() {
    if (_saveQueue.length === 0) return;
    
    const latestSave = _saveQueue[_saveQueue.length - 1];
    const allResolvers = _saveQueue.map(item => ({ resolve: item.resolve, reject: item.reject }));
    _saveQueue = [];
    
    try {
        const result = await _saveUserPreferencesNow(latestSave.preferences);
        allResolvers.forEach(({ resolve }) => resolve(result));
    } catch (error) {
        allResolvers.forEach(({ reject }) => reject(error));
    }
}

async function _saveUserPreferencesNow(preferences) {
    if (_pendingSave) {
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (!_pendingSave) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 50);
        });
    }

    _pendingSave = true;
    
    try {
        const response = await fetch('/api/save-user-preferences', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preferences)
        });
        
        if (response.status === 204) {
            _lastPreferencesSnapshot = createSnapshot(preferences);
            return true;
        }
        
        if (!response.ok) {
            throw new Error('Failed to save user preferences');
        }
        
        const data = await response.json();
        
        if (data.success) {
            _lastPreferencesSnapshot = createSnapshot(preferences);
        }
        
        return data.success;
    } catch (error) {
        console.error('Error saving user preferences:', error);
        return false;
    } finally {
        _pendingSave = false;
        _saveTimeout = null;
    }
}

function createSnapshot(preferences) {
    return JSON.stringify({
        jobTitles: preferences.jobTitles || [],
        locations: preferences.locations || [],
        careerPages: preferences.careerPages || [],
        profileComments: preferences.profileComments || [],
        profileLinks: preferences.profileLinks || [],
        cvs: preferences.cvs || {},
        linktrees: preferences.linktrees || {},
        subscription: preferences.subscription || {}
    });
}

function areSnapshotsEqual(snapshot1, snapshot2) {
    return snapshot1 === snapshot2;
}

export async function updateUserPreferencesImmediate(preferences) {
    return await updateUserPreferences(preferences, { immediate: true, force: true });
}

export function hasUnsavedChanges(preferences) {
    if (!_lastPreferencesSnapshot) return false;
    const currentSnapshot = createSnapshot(preferences);
    return !areSnapshotsEqual(currentSnapshot, _lastPreferencesSnapshot);
}

function getDefaultPreferences() {
    return {
        jobTitles: [],
        locations: [],
        careerPages: [],
        profileComments: ["", "", "", ""],
        profileLinks: Array(10).fill(""),
        lastUsed: null,
        cvs: {
            cv_1: createDefaultCV()
        },
        linktrees: {},
        subscription: {
            plan: 'free',
            features: {}
        }
    };
}

function createDefaultCV() {
    return {
        name: '',
        active: false,
        personalInfo: {
            firstName: '',
            lastName: '',
            jobTitle: '',
            location: '',
            email: '',
            phone: '',
            drivingLicense: '',
            languages: '',
            additionalNote: '',
            personalComment: '',
            website: '',
            linkedin: '',
            portfolio: '',
            link1: '',
            link2: ''
        },
        summary: '',
        experience: [],
        education: [],
        extra1: {
            title: '',
            content: ''
        },
        extra2: {
            title: '',
            content: ''
        },
        coverLetterTitle: '',
        coverLetterContent: '',
        photo: null,
        photoSize: 0
    };
}

function ensureDefaultCVStructure(preferences) {
    if (!preferences.cvs) {
        preferences.cvs = {
            cv_1: createDefaultCV()
        };
    }
    
    if (!preferences.cvs.cv_1) {
        preferences.cvs.cv_1 = createDefaultCV();
    }
    
    if (!preferences.linktrees) {
        preferences.linktrees = {};
    }

    if (!preferences.subscription) {
        preferences.subscription = {
            plan: 'free',
            features: {}
        };
    }
    
    return preferences;
}

window.getUserPreferences = getUserPreferences;
window.updateUserPreferences = updateUserPreferences;
window.updateUserPreferencesImmediate = updateUserPreferencesImmediate;
window.hasUnsavedChanges = hasUnsavedChanges;