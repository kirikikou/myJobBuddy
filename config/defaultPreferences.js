const defaultPreferences = {
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
    
    subscription: {
      plan: 'free',
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
      endDate: null,
      features: {
        maxOpportunities: 3,
        maxCareerPages: 10,
        maxJobTitles: 2,
        maxScrapingRequests: 0,
        maxCacheSearches: 50,
        maxEmailSearches: 0,
        maxEmailSearchesCache: 1,
        maxCVs: 1,
        maxResources: 5,
        maxLinktrees: 1,
        maxCoverLetters: 1,
        canExportData: false,
        canUseAdvancedSearch: false,
        canUseLiveSearch: false,
        canUseLiveEmailSearch: false,
        canExportJobResults: false,
        supportLevel: 'community'
      }
    },
    
    cvs: {
      cv_1: {
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
        extra1: { title: '', content: '' },
        extra2: { title: '', content: '' },
        coverLetterTitle: '',
        coverLetterContent: '',
        photo: null,
        photoSize: 0
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
    
    usage: {
      scrapingRequests: 0,
      cacheSearches: 0,
      applicationsTracked: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    },
    
    lastUsed: new Date().toISOString()
  };
  
  const deepMerge = (target, source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return source !== undefined ? source : target;
    }
    
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return source;
    }
    
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] !== undefined) {
          result[key] = deepMerge(target[key], source[key]);
        }
      }
    }
    
    return result;
  };
  
  const ensureCompletePreferences = (userPreferences) => {
    if (!userPreferences || typeof userPreferences !== 'object') {
      return JSON.parse(JSON.stringify(defaultPreferences));
    }
    
    const merged = deepMerge(defaultPreferences, userPreferences);
    
    if (!merged.careerPageLists || typeof merged.careerPageLists !== 'object') {
      merged.careerPageLists = {
        listA: [],
        listB: [],
        listC: [],
        listD: [],
        listE: []
      };
    }
    
    for (const listKey of ['listA', 'listB', 'listC', 'listD', 'listE']) {
      if (!Array.isArray(merged.careerPageLists[listKey])) {
        merged.careerPageLists[listKey] = [];
      }
    }
    
    if (!merged.currentActiveList || !['listA', 'listB', 'listC', 'listD', 'listE'].includes(merged.currentActiveList)) {
      merged.currentActiveList = 'listA';
    }
    
    ['companies', 'coverLetters', 'links', 'linktrees', 'cvs'].forEach(key => {
      if (!merged[key] || typeof merged[key] !== 'object' || Array.isArray(merged[key])) {
        merged[key] = key === 'cvs' ? JSON.parse(JSON.stringify(defaultPreferences.cvs)) : {};
      }
    });
    
    ['applications', 'resources'].forEach(key => {
      if (!Array.isArray(merged[key])) {
        merged[key] = [];
      }
    });
    
    merged.lastUsed = new Date().toISOString();
    
    return merged;
  };
  
  module.exports = {
    defaultPreferences,
    deepMerge,
    ensureCompletePreferences
  };