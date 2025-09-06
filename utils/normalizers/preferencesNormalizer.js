const config = require('../../config');

const PREFERENCES_TEMPLATE = {
  version: "1.0.0",
  jobTitles: [],
  locations: [],
  careerPages: [],
  profileComments: ["", "", "", ""],
  profileLinks: Array(10).fill(""),
  jobSearchData: {
    lastSearchResults: [],
    lastSearchDate: null,
    searchedDomains: [],
    favoriteJobs: []
  },
  emailSearchData: {
    lastSearchResults: [],
    lastSearchDate: null,
    searchedDomains: [],
    favoriteEmails: []
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
  showSelectionCInCareerList: false,
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
  linktrees: {},
  companies: {},
  applications: [],
  profile: {},
  coverLetters: {},
  links: {},
  resources: [],
  settings: {
    reminderSettings: { reminder15Days: true, reminder30Days: true },
    appearance: { theme: 'dark' },
    popupNotifications: {
      template: 'discrete',
      types: { searchComplete: true, jobMatch: true, reminder15: true, reminder30: true }
    }
  },
  dashboardWidgets: {},
  usage: {
    scrapingRequests: 0,
    cacheSearches: 0,
    applicationsTracked: 0,
    lastResetDate: new Date().toISOString().split('T')[0]
  },
  lastUsed: new Date().toISOString()
};

const WHITELIST_TOP_LEVEL = [
  'version', 'jobTitles', 'locations', 'careerPages', 'profileComments', 'profileLinks',
  'jobSearchData', 'emailSearchData', 'careerPageLists', 'currentActiveList',
  'showFavoritesInCareerList', 'showSelectionAInCareerList', 'showSelectionBInCareerList',
  'showSelectionCInCareerList', 'cvs', 'linktrees', 'companies', 'applications',
  'profile', 'coverLetters', 'links', 'resources', 'settings', 'dashboardWidgets',
  'usage', 'subscription', 'lastUsed', 'userId', 'email'
];

const normalizeStructure = (preferences) => {
  if (!preferences || typeof preferences !== 'object') {
    config.smartLog('buffer', 'PreferencesNormalizer: creating from template');
    return JSON.parse(JSON.stringify(PREFERENCES_TEMPLATE));
  }
  
  const result = {};
  
  for (const key of WHITELIST_TOP_LEVEL) {
    if (key in PREFERENCES_TEMPLATE) {
      result[key] = PREFERENCES_TEMPLATE[key];
    }
  }
  
  for (const key in preferences) {
    if (!WHITELIST_TOP_LEVEL.includes(key)) continue;
    
    const value = preferences[key];
    
    if (value === null || value === undefined) {
      continue;
    }
    
    if (key === 'careerPageLists') {
      result.careerPageLists = {
        listA: Array.isArray(preferences.careerPageLists?.listA) ? preferences.careerPageLists.listA : [],
        listB: Array.isArray(preferences.careerPageLists?.listB) ? preferences.careerPageLists.listB : [],
        listC: Array.isArray(preferences.careerPageLists?.listC) ? preferences.careerPageLists.listC : [],
        listD: Array.isArray(preferences.careerPageLists?.listD) ? preferences.careerPageLists.listD : [],
        listE: Array.isArray(preferences.careerPageLists?.listE) ? preferences.careerPageLists.listE : []
      };
    } else if (key === 'cvs' && typeof value === 'object' && !Array.isArray(value)) {
      result.cvs = value;
    } else if (typeof value === 'object' && !Array.isArray(value) && key in PREFERENCES_TEMPLATE) {
      result[key] = { ...value };
    } else if (Array.isArray(value)) {
      result[key] = [...value];
    } else {
      result[key] = value;
    }
  }
  
  result.lastUsed = new Date().toISOString();
  
  const normalized = ensureIdempotence(result);
  config.smartLog('win', 'PreferencesNormalizer: normalized without recursion');
  return normalized;
};

const ensureIdempotence = (data) => {
  const test1 = JSON.stringify(data);
  const normalized = JSON.parse(test1);
  const test2 = JSON.stringify(normalized);
  
  if (test1 !== test2) {
    config.smartLog('fail', 'PreferencesNormalizer: idempotence test failed!');
  }
  
  return normalized;
};

const deepMergeSafe = (existing, incoming) => {
  if (!existing || typeof existing !== 'object') {
    return incoming || JSON.parse(JSON.stringify(PREFERENCES_TEMPLATE));
  }
  
  if (!incoming || typeof incoming !== 'object') {
    return existing;
  }
  
  const result = { ...existing };
  
  for (const key of WHITELIST_TOP_LEVEL) {
    if (!(key in incoming)) continue;
    
    const incomingValue = incoming[key];
    
    if (incomingValue === undefined || incomingValue === null) continue;
    
    if (key === 'subscription' || key === 'usage') {
      result[key] = { ...(existing[key] || {}), ...(incomingValue || {}) };
    } else if (key === 'careerPageLists') {
      result.careerPageLists = {
        listA: Array.isArray(incomingValue.listA) ? incomingValue.listA : (existing.careerPageLists?.listA || []),
        listB: Array.isArray(incomingValue.listB) ? incomingValue.listB : (existing.careerPageLists?.listB || []),
        listC: Array.isArray(incomingValue.listC) ? incomingValue.listC : (existing.careerPageLists?.listC || []),
        listD: Array.isArray(incomingValue.listD) ? incomingValue.listD : (existing.careerPageLists?.listD || []),
        listE: Array.isArray(incomingValue.listE) ? incomingValue.listE : (existing.careerPageLists?.listE || [])
      };
    } else if (Array.isArray(incomingValue)) {
      result[key] = [...incomingValue];
    } else if (typeof incomingValue === 'object') {
      result[key] = { ...incomingValue };
    } else {
      result[key] = incomingValue;
    }
  }
  
  result.lastUsed = new Date().toISOString();
  
  config.smartLog('win', 'PreferencesNormalizer: safe merge completed');
  return result;
};

const detectChanges = (existing, incoming) => {
  const existingStr = JSON.stringify(existing || {});
  const incomingStr = JSON.stringify(incoming || {});
  return existingStr !== incomingStr;
};

const createChangeSnapshot = (preferences) => {
  if (!preferences) return '{}';
  
  return JSON.stringify({
    jobTitles: preferences.jobTitles?.length || 0,
    locations: preferences.locations?.length || 0,
    careerPageLists: {
      listA: preferences.careerPageLists?.listA?.length || 0,
      listB: preferences.careerPageLists?.listB?.length || 0,
      listC: preferences.careerPageLists?.listC?.length || 0,
      listD: preferences.careerPageLists?.listD?.length || 0,
      listE: preferences.careerPageLists?.listE?.length || 0
    },
    currentActiveList: preferences.currentActiveList || 'listA',
    companies: Object.keys(preferences.companies || {}).length,
    applications: preferences.applications?.length || 0,
    lastUsed: preferences.lastUsed
  });
};

module.exports = {
  PREFERENCES_TEMPLATE,
  normalizeStructure,
  deepMergeSafe,
  detectChanges,
  createChangeSnapshot
};