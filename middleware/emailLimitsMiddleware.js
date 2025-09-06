const config = require('../config');
const { getPlanByName, getEmailSearchLimits, canPerformLiveEmailSearch } = require('../subscriptionPlans');
const userPreferencesManager = require('../userPreferencesManager');
const path = require('path');
const fs = require('fs').promises;

const loadUserPreferences = async (userId) => {
  try {
    const filePath = path.join(__dirname, '../user_preferences', `user_${userId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    config.smartLog('fail',`Error loading user preferences for ${userId}:`, error.message);
    return null;
  }
};

const saveUserPreferences = async (userId, userData) => {
  try {
    const filePath = path.join(__dirname, '../user_preferences', `user_${userId}.json`);
    await fs.writeFile(filePath, JSON.stringify(userData, null, 2));
    return true;
  } catch (error) {
    config.smartLog('fail',`Error saving user preferences for ${userId}:`, error.message);
    return false;
  }
};

const resetDailyUsageIfNeeded = (userData) => {
  const today = new Date().toISOString().split('T')[0];
  
  if (!userData.usage.lastResetDate || userData.usage.lastResetDate !== today) {
    userData.usage.emailSearches = 0;
    userData.usage.emailSearchesCache = 0;
    userData.usage.lastResetDate = today;
    return true;
  }
  return false;
};

const checkEmailSearchLimits = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const userId = req.user._id.toString();
  const userData = await loadUserPreferences(userId);
  
  if (!userData) {
    return res.status(500).json({
      success: false,
      message: 'Unable to load user data'
    });
  }

  if (!userData.usage) {
    userData.usage = {
      emailSearches: 0,
      emailSearchesCache: 0,
      scrapingRequests: 0,
      cacheSearches: 0,
      applicationsTracked: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    };
  }

  const wasReset = resetDailyUsageIfNeeded(userData);
  if (wasReset) {
    await saveUserPreferences(userId, userData);
  }

  const userPlan = userData.subscription?.plan || 'free';
  const emailLimits = getEmailSearchLimits(userPlan);
  const canUseLive = canPerformLiveEmailSearch(userPlan);

  const currentLiveUsage = userData.usage.emailSearches || 0;
  const currentCacheUsage = userData.usage.emailSearchesCache || 0;

  req.emailSearchContext = {
    userData,
    userPlan,
    emailLimits,
    canUseLive,
    currentLiveUsage,
    currentCacheUsage,
    userId
  };

  next();
};

const validateEmailSearchRequest = (req, res, next) => {
  const { domains = [], forceRefresh = false } = req.body.domains ? 
    { domains: req.body.domains, forceRefresh: req.body.forceRefresh } :
    { domains: JSON.parse(req.query.domains || '[]') };

  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one domain is required'
    });
  }

  const {
    userData,
    userPlan,
    emailLimits,
    canUseLive,
    currentLiveUsage,
    currentCacheUsage
  } = req.emailSearchContext;

  let needsLiveSearch = 0;
  let needsCacheSearch = 0;

  domains.forEach(domain => {
    if (forceRefresh || !hasCachedEmailData(domain)) {
      needsLiveSearch++;
    } else {
      needsCacheSearch++;
    }
  });

  if (needsLiveSearch > 0 && !canUseLive) {
    return res.status(403).json({
      success: false,
      message: 'Live email search not available for your plan',
      errorType: 'LIVE_EMAIL_SEARCH_NOT_ALLOWED',
      userPlan,
      needed: needsLiveSearch,
      available: 0
    });
  }

  if (needsLiveSearch > 0) {
    const availableLive = Math.max(0, emailLimits.liveSearches - currentLiveUsage);
    if (needsLiveSearch > availableLive) {
      return res.status(429).json({
        success: false,
        message: `Insufficient live email search credits. Need ${needsLiveSearch}, have ${availableLive}`,
        errorType: 'EMAIL_LIVE_LIMIT_EXCEEDED',
        userPlan,
        needed: needsLiveSearch,
        available: availableLive,
        currentUsage: currentLiveUsage,
        limit: emailLimits.liveSearches
      });
    }
  }

  if (needsCacheSearch > 0) {
    const availableCache = Math.max(0, emailLimits.cacheSearches - currentCacheUsage);
    if (needsCacheSearch > availableCache) {
      return res.status(429).json({
        success: false,
        message: `Insufficient email cache search credits. Need ${needsCacheSearch}, have ${availableCache}`,
        errorType: 'EMAIL_CACHE_LIMIT_EXCEEDED', 
        userPlan,
        needed: needsCacheSearch,
        available: availableCache,
        currentUsage: currentCacheUsage,
        limit: emailLimits.cacheSearches
      });
    }
  }

  req.emailSearchContext.needsLiveSearch = needsLiveSearch;
  req.emailSearchContext.needsCacheSearch = needsCacheSearch;

  next();
};

const updateEmailSearchUsage = async (userId, liveSearchUsed = 0, cacheSearchUsed = 0) => {
  try {
    const userData = await loadUserPreferences(userId);
    if (!userData) return false;

    if (!userData.usage) {
      userData.usage = {
        emailSearches: 0,
        emailSearchesCache: 0,
        scrapingRequests: 0,
        cacheSearches: 0,
        applicationsTracked: 0,
        lastResetDate: new Date().toISOString().split('T')[0]
      };
    }

    resetDailyUsageIfNeeded(userData);

    userData.usage.emailSearches = (userData.usage.emailSearches || 0) + liveSearchUsed;
    userData.usage.emailSearchesCache = (userData.usage.emailSearchesCache || 0) + cacheSearchUsed;

    const success = await saveUserPreferences(userId, userData);
    
    if (success) {
      config.smartLog('buffer',`[EMAIL-LIMITS] Updated usage for user ${userId}: +${liveSearchUsed} live, +${cacheSearchUsed} cache`);
    }

    return success;
  } catch (error) {
    config.smartLog('fail',`Error updating email search usage for ${userId}:`, error.message);
    return false;
  }
};

const hasCachedEmailData = (domain) => {
  try {
    const crypto = require('crypto');
    const cacheDir = path.join(__dirname, '../cache');
    const normalizedDomain = new URL(domain).hostname.replace(/^www\./, '');
    const pattern = `email_exploration_${normalizedDomain}`;
    
    const fs = require('fs');
    if (!fs.existsSync(cacheDir)) return false;
    
    const files = fs.readdirSync(cacheDir);
    const cacheFile = files.find(file => file.startsWith(pattern));
    
    if (!cacheFile) return false;
    
    const filePath = path.join(cacheDir, cacheFile);
    const stats = fs.statSync(filePath);
    const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    
    return ageInHours < (24 * 365);
  } catch (error) {
    return false;
  }
};

const getEmailSearchStatusData = async (userId) => {
  const userData = await loadUserPreferences(userId);
  
  if (!userData) {
    throw new Error('Unable to load user data');
  }

  if (!userData.usage) {
    userData.usage = {
      emailSearches: 0,
      emailSearchesCache: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    };
  }

  resetDailyUsageIfNeeded(userData);

  const userPlan = userData.subscription?.plan || 'free';
  const emailLimits = getEmailSearchLimits(userPlan);
  const canUseLive = canPerformLiveEmailSearch(userPlan);

  const currentLiveUsage = userData.usage.emailSearches || 0;
  const currentCacheUsage = userData.usage.emailSearchesCache || 0;

  return {
    success: true,
    plan: userPlan,
    limits: {
      liveSearches: emailLimits.liveSearches,
      cacheSearches: emailLimits.cacheSearches,
      canUseLive
    },
    usage: {
      liveSearches: currentLiveUsage,
      cacheSearches: currentCacheUsage
    },
    remaining: {
      liveSearches: Math.max(0, emailLimits.liveSearches - currentLiveUsage),
      cacheSearches: Math.max(0, emailLimits.cacheSearches - currentCacheUsage)
    }
  };
};

const getEmailSearchStatus = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const statusData = await getEmailSearchStatusData(userId);
    res.json(statusData);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to retrieve email search status'
    });
  }
};

module.exports = {
  checkEmailSearchLimits,
  validateEmailSearchRequest,
  updateEmailSearchUsage,
  getEmailSearchStatus,
  getEmailSearchStatusData,
  hasCachedEmailData,
  loadUserPreferences,
  saveUserPreferences
};