const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
const { getPlanByName, checkLimit, validatePlanUpgrade } = require('./subscriptionPlans');

const ensureUserPrefsDir = async () => {
  try {
    await fs.mkdir(config.USER_PREFS_DIR, { recursive: true });
  } catch (err) {
    config.smartLog('fail','Error creating user preferences directory:', err);
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
    lastUsed: new Date().toISOString(),
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
    companies: {},
    applications: [],
    profile: {},
    coverLetters: {},
    links: {},
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
    dashboardWidgets: {}
  };
};

const ensureCompleteStructure = (preferences) => {
  if (!preferences || typeof preferences !== 'object') {
    config.smartLog('buffer', 'ensureCompleteStructure: invalid preferences, returning defaults');
    return getDefaultUserPreferences();
  }
  
  const defaults = getDefaultUserPreferences();
  const result = JSON.parse(JSON.stringify(preferences));
  
  function smartMerge(userValue, defaultValue) {
    if (userValue === null || userValue === undefined) {
      return defaultValue;
    }
    
    if (typeof defaultValue !== 'object' || Array.isArray(defaultValue)) {
      return userValue;
    }
    
    if (typeof userValue !== 'object' || Array.isArray(userValue)) {
      return userValue;
    }
    
    const merged = { ...userValue };
    
    for (const key in defaultValue) {
      if (!(key in merged)) {
        merged[key] = defaultValue[key];
      } else {
        merged[key] = smartMerge(merged[key], defaultValue[key]);
      }
    }
    
    return merged;
  }
  
  const finalResult = smartMerge(result, defaults);
  
  if (!finalResult.careerPageLists || typeof finalResult.careerPageLists !== 'object') {
    finalResult.careerPageLists = {
      listA: [],
      listB: [],
      listC: [],
      listD: [],
      listE: []
    };
  }
  
  for (const listKey of ['listA', 'listB', 'listC', 'listD', 'listE']) {
    if (!Array.isArray(finalResult.careerPageLists[listKey])) {
      finalResult.careerPageLists[listKey] = [];
    }
  }
  
  if (!finalResult.currentActiveList || !['listA', 'listB', 'listC', 'listD', 'listE'].includes(finalResult.currentActiveList)) {
    finalResult.currentActiveList = 'listA';
  }
  
  ['companies', 'coverLetters', 'links', 'linktrees'].forEach(key => {
    if (finalResult[key] === undefined || finalResult[key] === null) {
      finalResult[key] = {};
    }
  });
  
  if (!finalResult.lastUsed) {
    finalResult.lastUsed = new Date().toISOString();
  }
  
  return finalResult;
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

const clearUserCache = (userId) => {
  if (_userPreferencesCache.has(userId)) {
    _userPreferencesCache.delete(userId);
    config.smartLog('cache', `User cache cleared for ${userId}`);
  }
};

const ensureUserPreferences = async (userId) => {
  if (!userId || userId === 'undefined' || userId === 'null') {
    const defaultPrefs = getDefaultUserPreferences();
    config.smartLog('buffer', 'ensureUserPreferences: invalid userId, returning defaults');
    return defaultPrefs;
  }

  if (_userPreferencesCache.has(userId)) {
    const cached = _userPreferencesCache.get(userId);
    const ensuredCached = ensureCompleteStructure(cached);
    const hasReset = resetDailyUsageIfNeeded(ensuredCached);
    if (hasReset) {
      await _saveUserPreferencesInternal(userId, ensuredCached);
    }
    return ensuredCached;
  }
  
  if (_pendingCreations.has(userId)) {
    try {
      const result = await _pendingCreations.get(userId);
      return ensureCompleteStructure(result);
    } catch (error) {
      config.smartLog('fail', `ensureUserPreferences: pending creation failed for ${userId}`);
      return getDefaultUserPreferences();
    }
  }
  
  const creationPromise = _createUserPreferencesIfNeeded(userId);
  _pendingCreations.set(userId, creationPromise);
  
  try {
    const preferences = await creationPromise;
    const ensuredPrefs = ensureCompleteStructure(preferences);
    _userPreferencesCache.set(userId, ensuredPrefs);
    _pendingCreations.delete(userId);
    return ensuredPrefs;
  } catch (error) {
    _pendingCreations.delete(userId);
    config.smartLog('fail', `ensureUserPreferences: error for ${userId} - ${error.message}`);
    return getDefaultUserPreferences();
  }
};

const _createUserPreferencesIfNeeded = async (userId) => {
  const prefsFile = getUserPreferencesFile(userId);
  
  try {
    await fs.access(prefsFile);
    const existing = await _loadUserPreferences(userId);
    if (existing && existing !== null) {
      return ensureCompleteStructure(existing);
    }
  } catch (error) {
    config.smartLog('cache', `_createUserPreferencesIfNeeded: no existing file for ${userId}, creating defaults`);
  }
  
  const defaultPrefs = getDefaultUserPreferences();
  const saved = await _saveUserPreferencesInternal(userId, defaultPrefs);
  
  if (saved) {
    config.smartLog('win', `_createUserPreferencesIfNeeded: created default preferences for ${userId}`);
    return defaultPrefs;
  } else {
    config.smartLog('fail', `_createUserPreferencesIfNeeded: failed to save defaults for ${userId}`);
    return defaultPrefs;
  }
};

const _loadUserPreferences = async (userId) => {
  const prefsFile = getUserPreferencesFile(userId);
  
  try {
    const data = await fs.readFile(prefsFile, 'utf-8');
    const preferences = JSON.parse(data);
    
    const ensuredPrefs = ensureCompleteStructure(preferences);
    
    const hasReset = resetDailyUsageIfNeeded(ensuredPrefs);
    if (hasReset) {
      await _saveUserPreferencesInternal(userId, ensuredPrefs);
    }
    
    const currentPlan = ensuredPrefs.subscription?.plan || 'free';
    if (currentPlan !== 'free' && (!ensuredPrefs.subscription.features?.hasOwnProperty('canUseLiveSearch'))) {
      const { getPlanByName } = require('./subscriptionPlans');
      const planData = getPlanByName(currentPlan);
      ensuredPrefs.subscription.features = planData.limits;
      await _saveUserPreferencesInternal(userId, ensuredPrefs);
      config.smartLog('win', `Auto-migrated user ${userId} plan structure`);
    }
    
    _userPreferencesCache.set(userId, ensuredPrefs);
    return ensuredPrefs;
  } catch (error) {
    config.smartLog('cache', `_loadUserPreferences: error loading for ${userId} - ${error.message}`);
    const defaultPrefs = getDefaultUserPreferences();
    return defaultPrefs;
  }
};

const getUserPreferences = async (userId) => {
  if (!userId || userId === 'undefined' || userId === 'null') {
    config.smartLog('buffer', 'getUserPreferences: invalid userId, returning defaults');
    return getDefaultUserPreferences();
  }

  try {
    const preferences = await _loadUserPreferences(userId);
    const ensuredPrefs = ensureCompleteStructure(preferences);
    return ensuredPrefs;
  } catch (error) {
    config.smartLog('fail', `getUserPreferences: error for ${userId} - ${error.message}`);
    const ensuredPrefs = await ensureUserPreferences(userId);
    return ensuredPrefs;
  }
};

const _saveUserPreferencesInternal = async (userId, preferences) => {
  const prefsFile = getUserPreferencesFile(userId);
  
  const ensuredPrefs = ensureCompleteStructure(preferences);
  ensuredPrefs.lastUsed = new Date().toISOString();
  
  try {
    await ensureUserPrefsDir();
    await fs.writeFile(prefsFile, JSON.stringify(ensuredPrefs, null, 2));
    
    _userPreferencesCache.set(userId, ensuredPrefs);
    
    config.smartLog('timing', `Preferences saved for ${userId}: scrapingRequests=${ensuredPrefs.usage?.scrapingRequests}, cacheSearches=${ensuredPrefs.usage?.cacheSearches}`);
    return true;
  } catch (error) {
    config.smartLog('fail',`_saveUserPreferencesInternal: error saving for ${userId} - ${error.message}`);
    return false;
  }
};

const saveUserPreferences = async (userId, preferences) => {
  const ensuredPrefs = ensureCompleteStructure(preferences);
  const result = await _saveUserPreferencesInternal(userId, ensuredPrefs);
  
  if (result) {
    clearUserCache(userId);
    config.smartLog('cache', `Cache invalidated after save for ${userId}`);
  }
  
  return result;
};

const addEmailSearchDomain = async (userId, domain, emails = []) => {
  const prefs = await ensureUserPreferences(userId);
  
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
  const prefs = await ensureUserPreferences(userId);
  
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
  const prefs = await ensureUserPreferences(userId);
  
  prefs.emailSearchData.favoriteEmails = prefs.emailSearchData.favoriteEmails.filter(
    fav => !(fav.email === email && fav.domain === domain)
  );
  
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const getEmailSearchHistory = async (userId) => {
  const prefs = await ensureUserPreferences(userId);
  return {
    searchedDomains: prefs.emailSearchData.searchedDomains || [],
    lastSearchResults: prefs.emailSearchData.lastSearchResults || [],
    favoriteEmails: prefs.emailSearchData.favoriteEmails || [],
    lastSearchDate: prefs.emailSearchData.lastSearchDate
  };
};

const clearEmailSearchHistory = async (userId) => {
  const prefs = await ensureUserPreferences(userId);
  
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
  const preferences = await ensureUserPreferences(userId);
  
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
  const preferences = await ensureUserPreferences(userId);
  const planName = preferences.subscription.plan;
  const { canPerformLiveSearch } = require('./subscriptionPlans');
  return canPerformLiveSearch(planName);
};

const checkUserLimit = async (userId, limitType) => {
  const preferences = await ensureUserPreferences(userId);
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
  const preferences = await ensureUserPreferences(userId);
  
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
  
  const prefs = await ensureUserPreferences(userId);
  if (!prefs.jobTitles.includes(jobTitle)) {
    prefs.jobTitles.push(jobTitle);
    await saveUserPreferences(userId, prefs);
  }
  return prefs;
};

const addLocation = async (userId, location) => {
  const prefs = await ensureUserPreferences(userId);
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
  
  const prefs = await ensureUserPreferences(userId);
  const pageExists = prefs.careerPages.some(page => page.url === careerPage.url);
  
  if (!pageExists) {
    prefs.careerPages.push(careerPage);
    await saveUserPreferences(userId, prefs);
  }
  return prefs;
};

const removeJobTitle = async (userId, jobTitle) => {
  const prefs = await ensureUserPreferences(userId);
  prefs.jobTitles = prefs.jobTitles.filter(title => title !== jobTitle);
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const removeLocation = async (userId, location) => {
  const prefs = await ensureUserPreferences(userId);
  prefs.locations = prefs.locations.filter(loc => loc !== location);
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const removeCareerPage = async (userId, url) => {
  const prefs = await ensureUserPreferences(userId);
  prefs.careerPages = prefs.careerPages.filter(page => page.url !== url);
  await saveUserPreferences(userId, prefs);
  return prefs;
};

const updateProfileComment = async (userId, index, comment) => {
  const prefs = await ensureUserPreferences(userId);
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
  const prefs = await ensureUserPreferences(userId);
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
    const preferences = await ensureUserPreferences(userId);
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
    config.smartLog('fail','migrateUserSubscription: error migrating subscription', error);
    return await ensureUserPreferences(userId);
  }
};

const getDefaultPreferences = getDefaultUserPreferences;

module.exports = {
  getUserPreferences,
  saveUserPreferences,
  getDefaultUserPreferences,
  getDefaultPreferences,
  ensureUserPreferences,
  ensureCompleteStructure,
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
  clearEmailSearchHistory,
  clearUserCache
};