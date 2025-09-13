const config = require('../../config');

const DEFAULT_STRUCTURE = {
  userId: '',
  email: '',
  lastUsed: '',
  profile: {
    firstName: '',
    lastName: '',
    jobTitle: '',
    email: '',
    phone: '',
    location: '',
    experience: '',
    skills: '',
    education: ''
  },
  jobTitles: [],
  locations: [],
  careerPages: [],
  careerPageLists: {
    listA: [],
    listB: [],
    listC: [],
    listD: [],
    listE: []
  },
  companies: {},
  coverLetters: {},
  links: {},
  linktrees: {
    linktree1: { active: false, firstName: '', lastName: '', headerTagline: '', jobTitles: '', email: '', links: [] },
    linktree2: { active: false, firstName: '', lastName: '', headerTagline: '', jobTitles: '', email: '', links: [] },
    linktree3: { active: false, firstName: '', lastName: '', headerTagline: '', jobTitles: '', email: '', links: [] }
  },
  jobSearchData: {
    searchHistory: [],
    allHistoricalResults: [],
    totalOffersScraped: 0
  },
  emailSearchData: {
    searchHistory: [],
    discoveredEmails: []
  },
  personalReminder: {
    text: '',
    lastUpdated: '',
    saveCount: 0
  },
  subscription: {
    plan: 'free',
    status: 'active',
    startDate: null,
    endDate: null
  },
  usage: {
    cacheSearches: 0,
    scrapingRequests: 0,
    lastResetDate: new Date().toISOString()
  },
  limits: {
    maxCacheSearches: 10,
    maxScrapingRequests: 0,
    maxCareerPages: 10,
    maxJobTitles: 5,
    maxCVs: 1
  },
  settings: {
    language: 'fr',
    theme: 'dark',
    reminderSettings: {
      reminder15Days: true,
      reminder30Days: true
    },
    appearance: {
      theme: 'dark'
    }
  },
  cvData: {
    cvs: {
      cv1: {
        active: true,
        personalInfo: {
          firstName: '',
          lastName: '',
          jobTitle: '',
          location: '',
          email: '',
          phone: '',
          photo: null,
          photoSize: 'medium',
          drivingLicense: '',
          languages: '',
          additionalNote: '',
          websiteUrl: '',
          linkedinUrl: '',
          portfolioUrl: '',
          additionalLink1: '',
          additionalLink2: '',
          personalComment: '',
          about: ''
        },
        experiences: [],
        education: [],
        additionalSection1: { title: '', content: '' },
        additionalSection2: { title: '', content: '' },
        coverLetter: { subject: '', body: '' }
      }
    }
  }
};

function normalizeStructure(rawPreferences) {
  try {
    if (!rawPreferences || typeof rawPreferences !== 'object') {
      config.smartLog('buffer', 'Creating default preferences structure');
      return JSON.parse(JSON.stringify(DEFAULT_STRUCTURE));
    }

    const normalized = JSON.parse(JSON.stringify(DEFAULT_STRUCTURE));
    
    const mergeFields = [
      'userId', 'email', 'lastUsed', 'jobTitles', 'locations', 'careerPages',
      'companies', 'coverLetters', 'links', 'personalReminder'
    ];
    
    mergeFields.forEach(field => {
      if (rawPreferences[field] !== undefined) {
        if (Array.isArray(normalized[field]) && Array.isArray(rawPreferences[field])) {
          normalized[field] = [...rawPreferences[field]];
        } else if (typeof normalized[field] === 'object' && typeof rawPreferences[field] === 'object' && !Array.isArray(normalized[field])) {
          normalized[field] = { ...normalized[field], ...rawPreferences[field] };
        } else {
          normalized[field] = rawPreferences[field];
        }
      }
    });

    if (rawPreferences.profile && typeof rawPreferences.profile === 'object') {
      normalized.profile = { ...normalized.profile, ...rawPreferences.profile };
    }

    if (rawPreferences.careerPageLists && typeof rawPreferences.careerPageLists === 'object') {
      normalized.careerPageLists = { ...normalized.careerPageLists, ...rawPreferences.careerPageLists };
      
      ['listA', 'listB', 'listC', 'listD', 'listE'].forEach(list => {
        if (!Array.isArray(normalized.careerPageLists[list])) {
          normalized.careerPageLists[list] = [];
        }
      });
    }

    if (rawPreferences.linktrees && typeof rawPreferences.linktrees === 'object') {
      normalized.linktrees = { ...normalized.linktrees, ...rawPreferences.linktrees };
      
      ['linktree1', 'linktree2', 'linktree3'].forEach(tree => {
        if (!normalized.linktrees[tree] || typeof normalized.linktrees[tree] !== 'object') {
          normalized.linktrees[tree] = DEFAULT_STRUCTURE.linktrees.linktree1;
        }
      });
    }

    if (rawPreferences.jobSearchData && typeof rawPreferences.jobSearchData === 'object') {
      normalized.jobSearchData = { ...normalized.jobSearchData, ...rawPreferences.jobSearchData };
      
      if (!Array.isArray(normalized.jobSearchData.searchHistory)) {
        normalized.jobSearchData.searchHistory = [];
      }
      if (!Array.isArray(normalized.jobSearchData.allHistoricalResults)) {
        normalized.jobSearchData.allHistoricalResults = [];
      }
    }

    if (rawPreferences.emailSearchData && typeof rawPreferences.emailSearchData === 'object') {
      normalized.emailSearchData = { ...normalized.emailSearchData, ...rawPreferences.emailSearchData };
    }

    if (rawPreferences.subscription && typeof rawPreferences.subscription === 'object') {
      normalized.subscription = { ...normalized.subscription, ...rawPreferences.subscription };
    }

    if (rawPreferences.usage && typeof rawPreferences.usage === 'object') {
      normalized.usage = { ...normalized.usage, ...rawPreferences.usage };
    }

    if (rawPreferences.limits && typeof rawPreferences.limits === 'object') {
      normalized.limits = { ...normalized.limits, ...rawPreferences.limits };
    }

    if (rawPreferences.settings && typeof rawPreferences.settings === 'object') {
      normalized.settings = deepMergeObjects(normalized.settings, rawPreferences.settings);
    }

    if (rawPreferences.cvData && typeof rawPreferences.cvData === 'object') {
      normalized.cvData = deepMergeObjects(normalized.cvData, rawPreferences.cvData);
    }

    normalized.lastUsed = new Date().toISOString();

    config.smartLog('buffer', 'Preferences structure normalized successfully');
    return normalized;
    
  } catch (error) {
    config.smartLog('fail', `Error normalizing preferences: ${error.message}`);
    return JSON.parse(JSON.stringify(DEFAULT_STRUCTURE));
  }
}

function deepMergeObjects(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMergeObjects(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

function deepMergeSafe(target, source) {
  if (!target || typeof target !== 'object') {
    target = {};
  }
  
  if (!source || typeof source !== 'object') {
    return target;
  }

  const result = JSON.parse(JSON.stringify(target));
  
  try {
    mergeRecursive(result, source);
    config.smartLog('buffer', 'Deep merge completed successfully');
    return result;
  } catch (error) {
    config.smartLog('fail', `Error in deep merge: ${error.message}`);
    return target;
  }
}

function mergeRecursive(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (sourceValue === null || sourceValue === undefined) {
        continue;
      }
      
      if (Array.isArray(sourceValue)) {
        target[key] = [...sourceValue];
      } else if (typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        if (!targetValue || typeof targetValue !== 'object' || Array.isArray(targetValue)) {
          target[key] = {};
        }
        mergeRecursive(target[key], sourceValue);
      } else {
        target[key] = sourceValue;
      }
    }
  }
}

function detectChanges(current, updated) {
  try {
    if (!current && !updated) {
      return false;
    }
    
    if (!current || !updated) {
      return true;
    }
    
    const currentSnapshot = createChangeSnapshot(current);
    const updatedSnapshot = createChangeSnapshot(updated);
    
    const hasChanges = JSON.stringify(currentSnapshot) !== JSON.stringify(updatedSnapshot);
    
    if (hasChanges) {
      config.smartLog('buffer', 'Changes detected in preferences');
    } else {
      config.smartLog('cache', 'No changes detected in preferences');
    }
    
    return hasChanges;
    
  } catch (error) {
    config.smartLog('fail', `Error detecting changes: ${error.message}`);
    return true;
  }
}

function createChangeSnapshot(preferences) {
  if (!preferences || typeof preferences !== 'object') {
    return {};
  }
  
  try {
    const snapshot = {
      userId: preferences.userId,
      email: preferences.email,
      jobTitles: preferences.jobTitles || [],
      locations: preferences.locations || [],
      careerPages: preferences.careerPages || [],
      careerPageLists: preferences.careerPageLists || {},
      companiesCount: Object.keys(preferences.companies || {}).length,
      coverLettersCount: Object.keys(preferences.coverLetters || {}).length,
      linksCount: Object.keys(preferences.links || {}).length,
      profile: preferences.profile || {},
      settings: preferences.settings || {},
      subscription: preferences.subscription || {},
      personalReminder: preferences.personalReminder || {},
      cvDataKeys: Object.keys(preferences.cvData?.cvs || {}),
      linktreeStates: {}
    };
    
    if (preferences.linktrees) {
      for (const [key, tree] of Object.entries(preferences.linktrees)) {
        snapshot.linktreeStates[key] = {
          active: tree.active || false,
          hasContent: !!(tree.firstName || tree.lastName || tree.email)
        };
      }
    }
    
    return snapshot;
    
  } catch (error) {
    config.smartLog('fail', `Error creating change snapshot: ${error.message}`);
    return {};
  }
}

function validatePreferences(preferences) {
  const errors = [];
  
  if (!preferences || typeof preferences !== 'object') {
    errors.push('Preferences must be an object');
    return { valid: false, errors };
  }
  
  if (!Array.isArray(preferences.jobTitles)) {
    errors.push('jobTitles must be an array');
  }
  
  if (!Array.isArray(preferences.locations)) {
    errors.push('locations must be an array');
  }
  
  if (!Array.isArray(preferences.careerPages)) {
    errors.push('careerPages must be an array');
  }
  
  if (preferences.companies && typeof preferences.companies !== 'object') {
    errors.push('companies must be an object');
  }
  
  if (preferences.settings && typeof preferences.settings !== 'object') {
    errors.push('settings must be an object');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  normalizeStructure,
  deepMergeSafe,
  detectChanges,
  createChangeSnapshot,
  validatePreferences,
  DEFAULT_STRUCTURE
};