const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
const { getPlanByName, checkLimit, validatePlanUpgrade } = require('./subscriptionPlans');

const ensureUserPrefsDir = async () => {
  try {
    await fs.mkdir(config.USER_PREFS_DIR, { recursive: true });
  } catch (err) {
    config.smartLog('error', 'Error creating user preferences directory', { error: err.message });
  }
};

const getUserPreferencesFile = (userId) => {
  return path.join(config.USER_PREFS_DIR, `user_${userId}.json`);
};

const createDefaultCV = () => {
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
};

const getDefaultUserPreferences = () => {
  const currentDate = new Date().toISOString().split('T')[0];
  
  return {
    subscription: {
      plan: 'free',
      startDate: currentDate,
      features: getPlanByName('free').limits
    },
    usage: {
      scrapingRequests: 0,
      cacheSearches: 0,
      applicationsTracked: 0,
      lastResetDate: currentDate
    },
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
    resources: [],
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
    }
  };
};

const getDefaultPreferences = () => {
  return getDefaultUserPreferences();
};

const resetDailyUsageIfNeeded = (preferences) => {
  const today = new Date().toISOString().split('T')[0];
  const lastResetDate = preferences.usage?.lastResetDate;
  
  if (lastResetDate !== today) {
    config.smartLog('win', `Daily reset for user - Last reset: ${lastResetDate}, Today: ${today}`);
    config.smartLog('timing', `Before reset: scrapingRequests=${preferences.usage?.scrapingRequests}, cacheSearches=${preferences.usage?.cacheSearches}`);
    
    const applicationsTracked = preferences.usage?.applicationsTracked || 0;
    
    preferences.usage = {
      scrapingRequests: 0,
      cacheSearches: 0,
      applicationsTracked: applicationsTracked,
      lastResetDate: today
    };
    
    config.smartLog('timing', `After reset: scrapingRequests=0, cacheSearches=0, applicationsTracked=${applicationsTracked}`);
    return true;
  }
  
  return false;
};

const _userPreferencesCache = new Map();
const _pendingCreations = new Map();

const ensureUserPreferences = async (userId) => {
  if (_userPreferencesCache.has(userId)) {
    return _userPreferencesCache.get(userId);
  }
  
  if (_pendingCreations.has(userId)) {
    return await _pendingCreations.get(userId);
  }
  
  const creationPromise = _createUserPreferencesIfNeeded(userId);
  _pendingCreations.set(userId, creationPromise);
  
  try {
    const preferences = await creationPromise;
    _userPreferencesCache.set(userId, preferences);
    _pendingCreations.delete(userId);
    return preferences;
  } catch (error) {
    _pendingCreations.delete(userId);
    throw error;
  }
};

const _createUserPreferencesIfNeeded = async (userId) => {
  const prefsFile = getUserPreferencesFile(userId);
  
  try {
    await fs.access(prefsFile);
    return await getUserPreferences(userId);
  } catch (error) {
    config.smartLog('win', `Creating default preferences for user ${userId}`);
    const defaultPrefs = getDefaultUserPreferences();
    await saveUserPreferences(userId, defaultPrefs);
    return defaultPrefs;
  }
};

const getUserPreferences = async (userId) => {
  const prefsFile = getUserPreferencesFile(userId);
  
  try {
    const data = await fs.readFile(prefsFile, 'utf-8');
    const preferences = JSON.parse(data);
    
    if (!preferences.subscription) {
      const defaultPrefs = getDefaultUserPreferences();
      preferences.subscription = defaultPrefs.subscription;
    }
    
    if (!preferences.usage) {
      preferences.usage = {
        scrapingRequests: 0,
        cacheSearches: 0,
        applicationsTracked: 0,
        lastResetDate: new Date().toISOString().split('T')[0]
      };
    }
    
    const hasReset = resetDailyUsageIfNeeded(preferences);
    if (hasReset) {
      config.smartLog('win', `Saving reset preferences for user ${userId}`);
      await _saveUserPreferencesInternal(userId, preferences);
      config.smartLog('win', `Daily usage reset applied and saved for user ${userId}`);
    }
    
    if (!preferences.cvs) {
      preferences.cvs = { cv_1: createDefaultCV() };
    }
    
    if (!preferences.linktrees) {
      preferences.linktrees = {};
    }
    
    if (!preferences.resources) {
      preferences.resources = [];
    }

    if (!preferences.jobSearchData) {
      preferences.jobSearchData = {
        lastSearchResults: [],
        lastSearchDate: null,
        searchedDomains: [],
        favoriteJobs: []
      };
    }

    if (!preferences.emailSearchData) {
      preferences.emailSearchData = {
        lastSearchResults: [],
        lastSearchDate: null,
        searchedDomains: [],
        favoriteEmails: []
      };
    }
    
    const currentPlan = preferences.subscription?.plan || 'free';
    if (currentPlan !== 'free' && (!preferences.subscription.features?.hasOwnProperty('canUseLiveSearch'))) {
      const { getPlanByName } = require('./subscriptionPlans');
      const planData = getPlanByName(currentPlan);
      preferences.subscription.features = planData.limits;
      await _saveUserPreferencesInternal(userId, preferences);
      config.smartLog('win', `Auto-migrated user ${userId} plan structure`);
    }
    
    _userPreferencesCache.set(userId, preferences);
    return preferences;
  } catch (error) {
    throw new Error(`User preferences not found for ${userId}`);
  }
};

const _saveUserPreferencesInternal = async (userId, preferences) => {
  const prefsFile = getUserPreferencesFile(userId);
  
  preferences.lastUsed = new Date().toISOString();
  
  try {
    await ensureUserPrefsDir();
    await fs.writeFile(prefsFile, JSON.stringify(preferences, null, 2));
    _userPreferencesCache.set(userId, preferences);
    config.smartLog('timing', `User preferences saved for ${userId}: scrapingRequests=${preferences.usage?.scrapingRequests}, cacheSearches=${preferences.usage?.cacheSearches}`);
    return true;
  } catch (error) {
    config.smartLog('error', `Error saving user preferences for user ${userId}`, { error: error.message });
    return false;
  }
};

const saveUserPreferences = async (userId, preferences) => {
  const result = await _saveUserPreferencesInternal(userId, preferences);
  return result;
};

const addEmailSearchDomain = async (userId, domain, emails = []) => {
  const prefs = await getUserPreferences(userId);
  
  if (!prefs.emailSearchData.searchedDomains.includes(domain)) {
    prefs.emailSearchData.searchedDomains.push(domain);
  }
  
  if (emails.length > 0) {
    prefs.emailSearchData.lastSearchResults = emails;
    prefs.emailSearchData.lastSearchDate = new Date().toISOString();
  }
  
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const addFavoriteEmail = async (userId, email, domain) => {
  const prefs = await getUserPreferences(userId);
  
  const favorite = {
    email: email,
    domain: domain,
    addedAt: new Date().toISOString()
  };
  
  const existingIndex = prefs.emailSearchData.favoriteEmails.findIndex(
    fav => fav.email === email && fav.domain === domain
  );
  
  if (existingIndex === -1) {
    prefs.emailSearchData.favoriteEmails.push(favorite);
    await saveUserPreferences(userId, prefs);
  }
  
  return prefs;
};

const removeFavoriteEmail = async (userId, email, domain) => {
  const prefs = await getUserPreferences(userId);
  
  prefs.emailSearchData.favoriteEmails = prefs.emailSearchData.favoriteEmails.filter(
    fav => !(fav.email === email && fav.domain === domain)
  );
  
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const getEmailSearchHistory = async (userId) => {
  const prefs = await getUserPreferences(userId);
  return {
    searchedDomains: prefs.emailSearchData.searchedDomains || [],
    lastSearchResults: prefs.emailSearchData.lastSearchResults || [],
    favoriteEmails: prefs.emailSearchData.favoriteEmails || [],
    lastSearchDate: prefs.emailSearchData.lastSearchDate
  };
};

const clearEmailSearchHistory = async (userId) => {
  const prefs = await getUserPreferences(userId);
  
  prefs.emailSearchData = {
    lastSearchResults: [],
    lastSearchDate: null,
    searchedDomains: [],
    favoriteEmails: []
  };
  
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const upgradeUserPlan = async (userId, newPlan, inviteCode = null) => {
  const preferences = await getUserPreferences(userId);
  
  const validation = validatePlanUpgrade(preferences.subscription.plan, newPlan);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  
  const planData = getPlanByName(newPlan);
  
  preferences.subscription.plan = newPlan;
  preferences.subscription.features = planData.limits;
  preferences.subscription.upgradeDate = new Date().toISOString().split('T')[0];
  
  if (inviteCode) {
    preferences.subscription.inviteCode = inviteCode;
  }
  
  await saveUserPreferences(userId, preferences);
  return preferences;
};

const canPerformLiveSearch = async (userId) => {
  const preferences = await getUserPreferences(userId);
  const planName = preferences.subscription.plan;
  const { canPerformLiveSearch } = require('./subscriptionPlans');
  return canPerformLiveSearch(planName);
};

const checkUserLimit = async (userId, limitType) => {
  const preferences = await getUserPreferences(userId);
  const planName = preferences.subscription.plan;
  
  let currentUsage = 0;
  
  switch (limitType) {
    case 'maxOpportunities':
      currentUsage = preferences.careerPages.length;
      break;
    case 'maxCareerPages':
      currentUsage = preferences.careerPages.length;
      break;
    case 'maxJobTitles':
      currentUsage = preferences.jobTitles.length;
      break;
    case 'maxScrapingRequests':
      currentUsage = preferences.usage.scrapingRequests;
      break;
    case 'maxCacheSearches':
      currentUsage = preferences.usage.cacheSearches;
      break;
    case 'maxCVs':
      currentUsage = Object.keys(preferences.cvs).length;
      break;
    case 'maxLinktrees':
      currentUsage = Object.keys(preferences.linktrees).length;
      break;
    case 'maxResources':
      currentUsage = preferences.resources.length;
      break;
    case 'maxApplicationsTracked':
      currentUsage = preferences.usage.applicationsTracked;
      break;
    case 'maxEmailDomains':
      currentUsage = preferences.emailSearchData?.searchedDomains?.length || 0;
      break;
    case 'maxFavoriteEmails':
      currentUsage = preferences.emailSearchData?.favoriteEmails?.length || 0;
      break;
    default:
      currentUsage = 0;
  }
  
  return checkLimit(planName, limitType, currentUsage);
};

const incrementUsage = async (userId, usageType, amount = 1) => {
  const preferences = await getUserPreferences(userId);
  
  if (!preferences.usage[usageType]) {
    preferences.usage[usageType] = 0;
  }
  
  config.smartLog('timing', `Before: ${usageType}=${preferences.usage[usageType]}, adding ${amount}`);
  preferences.usage[usageType] += amount;
  config.smartLog('timing', `After: ${usageType}=${preferences.usage[usageType]}`);
  
  await saveUserPreferences(userId, preferences);
  
  return preferences.usage[usageType];
};

const addJobTitle = async (userId, jobTitle) => {
  const limitCheck = await checkUserLimit(userId, 'maxJobTitles');
  if (!limitCheck.allowed) {
    throw new Error(`Job title limit reached (${limitCheck.limit})`);
  }
  
  const prefs = await getUserPreferences(userId);
  if (!prefs.jobTitles.includes(jobTitle)) {
    prefs.jobTitles.push(jobTitle);
    await saveUserPreferences(userId, prefs);
  }
  return prefs;
};

const addLocation = async (userId, location) => {
  const prefs = await getUserPreferences(userId);
  if (!prefs.locations.includes(location)) {
    prefs.locations.push(location);
    await saveUserPreferences(userId, prefs);
  }
  return prefs;
};

const addCareerPage = async (userId, careerPage) => {
  const limitCheck = await checkUserLimit(userId, 'maxCareerPages');
  if (!limitCheck.allowed) {
    throw new Error(`Career page limit reached (${limitCheck.limit})`);
  }
  
  const prefs = await getUserPreferences(userId);
  const pageExists = prefs.careerPages.some(page => page.url === careerPage.url);
  
  if (!pageExists) {
    prefs.careerPages.push(careerPage);
    await saveUserPreferences(userId, prefs);
  }
  return prefs;
};

const removeJobTitle = async (userId, jobTitle) => {
  const prefs = await getUserPreferences(userId);
  prefs.jobTitles = prefs.jobTitles.filter(title => title !== jobTitle);
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const removeLocation = async (userId, location) => {
  const prefs = await getUserPreferences(userId);
  prefs.locations = prefs.locations.filter(loc => loc !== location);
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const removeCareerPage = async (userId, url) => {
  const prefs = await getUserPreferences(userId);
  prefs.careerPages = prefs.careerPages.filter(page => page.url !== url);
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const updateProfileComment = async (userId, index, comment) => {
  const prefs = await getUserPreferences(userId);
  if (!prefs.profileComments) {
    prefs.profileComments = ["", "", "", ""];
  }
  if (index >= 0 && index < 4) {
    prefs.profileComments[index] = comment;
    await saveUserPreferences(userId, prefs);
  }
  return prefs;
};

const updateProfileLink = async (userId, index, link) => {
  const prefs = await getUserPreferences(userId);
  if (!prefs.profileLinks) {
    prefs.profileLinks = Array(10).fill("");
  }
  if (index >= 0 && index < 10) {
    prefs.profileLinks[index] = link;
    await saveUserPreferences(userId, prefs);
  }
  return prefs;
};

const migrateUserSubscription = async (userId) => {
  try {
    const preferences = await getUserPreferences(userId);
    const currentPlan = preferences.subscription?.plan || 'free';
    
    const { getPlanByName } = require('./subscriptionPlans');
    const planData = getPlanByName(currentPlan);
    
    if (!preferences.subscription.features || 
        !preferences.subscription.features.hasOwnProperty('canUseLiveSearch')) {
      
      preferences.subscription.features = planData.limits;
      preferences.subscription.upgradeDate = preferences.subscription.upgradeDate || 
                                           preferences.subscription.startDate;
      
      if (!preferences.usage) {
        preferences.usage = {
          scrapingRequests: 0,
          cacheSearches: 0,
          applicationsTracked: 0,
          lastResetDate: new Date().toISOString().split('T')[0]
        };
      }
      
      await saveUserPreferences(userId, preferences);
      config.smartLog('win', `User ${userId} subscription migrated to new structure`);
    }
    
    return preferences;
  } catch (error) {
    config.smartLog('error', 'Error migrating user subscription', { error: error.message });
    return null;
  }
};

module.exports = {
  getUserPreferences,
  saveUserPreferences,
  getDefaultUserPreferences,
  ensureUserPreferences,
  upgradeUserPlan,
  checkUserLimit,
  incrementUsage,
  addJobTitle,
  addLocation,
  addCareerPage,
  removeJobTitle,
  removeLocation,
  removeCareerPage,
  updateProfileComment,
  updateProfileLink,
  canPerformLiveSearch,
  migrateUserSubscription,
  resetDailyUsageIfNeeded,
  addEmailSearchDomain,
  addFavoriteEmail,
  removeFavoriteEmail,
  getEmailSearchHistory,
  clearEmailSearchHistory
};