const express = require('express');
const router = express.Router();
const config = require('../config');
const { getPlanByName, getEmailSearchLimits, canPerformLiveEmailSearch } = require('../subscriptionPlans');
const userPreferencesManager = require('../userPreferencesManager');

const getDefaultLimits = () => ({
  maxScrapingRequests: 0,
  maxCacheSearches: 0,
  maxFavoriteCompanies: 0,
  maxJobTitles: 0,
  aiCoverLetters: 0,
  applicationsTracked: 0,
  canExportData: false,
  supportLevel: 'basic',
  liveEmailSearches: 0,
  cacheEmailSearches: 0
});

const getDefaultUsage = () => ({
  scrapingRequests: 0,
  cacheSearches: 0,
  applicationsTracked: 0,
  emailSearches: 0,
  emailSearchesCache: 0,
  lastResetDate: new Date().toISOString().split('T')[0]
});

const getDefaultRestrictions = () => ({
  canAddCompany: true,
  canAddJobTitle: true,
  canPerformSearch: true,
  canPerformLiveSearch: false,
  canGenerateCoverLetter: false,
  hasLinkedinIntegration: false,
  hasExportFeature: false,
  hasPrioritySupport: false,
  canSearchEmails: false,
  canUseLiveEmailSearch: false,
  limitExceeded: true
});

router.get('/status', async (req, res) => {
  if (!req.user || !req.user._id) {
    config.smartLog('gate', 'Email limits - unauthenticated request');
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      plan: 'free',
      limits: getDefaultLimits(),
      usage: getDefaultUsage(),
      restrictions: getDefaultRestrictions()
    });
  }
  
  try {
    const userId = req.user._id.toString();
    
    let userPrefs = null;
    try {
      userPrefs = await userPreferencesManager.getUserPreferences(userId);
    } catch (err) {
      config.smartLog('buffer', `Email limits - no prefs for ${userId.slice(-8)}`);
    }
    
    const plan = userPrefs?.subscription?.plan || 'free';
    const planData = getPlanByName(plan) || { limits: getDefaultLimits(), name: plan };
    const emailLimits = getEmailSearchLimits(plan);
    const canUseLive = canPerformLiveEmailSearch(plan);
    
    const today = new Date().toISOString().split('T')[0];
    const usage = userPrefs?.usage || getDefaultUsage();
    
    if (usage.lastResetDate !== today) {
      usage.emailSearches = 0;
      usage.emailSearchesCache = 0;
      usage.lastResetDate = today;
    }
    
    const limits = {
      ...getDefaultLimits(),
      ...planData.limits,
      liveEmailSearches: emailLimits.liveSearches || 0,
      cacheEmailSearches: emailLimits.cacheSearches || 0
    };
    
    const remainingLive = Math.max(0, limits.liveEmailSearches - (usage.emailSearches || 0));
    const remainingCache = Math.max(0, limits.cacheEmailSearches - (usage.emailSearchesCache || 0));
    
    const restrictions = {
      ...getDefaultRestrictions(),
      canPerformLiveSearch: canUseLive && remainingLive > 0,
      hasLinkedinIntegration: plan !== 'free',
      hasExportFeature: !!limits.canExportData,
      hasPrioritySupport: limits.supportLevel === 'priority',
      canGenerateCoverLetter: plan !== 'free',
      canSearchEmails: remainingLive > 0 || remainingCache > 0,
      canUseLiveEmailSearch: canUseLive,
      limitExceeded: remainingLive === 0 && remainingCache === 0
    };
    
    config.smartLog('win', `Email limits retrieved for ${userId.slice(-8)}, plan: ${plan}`);
    
    return res.json({
      success: true,
      plan,
      limits,
      usage,
      restrictions,
      timestamp: Date.now()
    });
    
  } catch (error) {
    config.smartLog('fail', `Email limits error: ${error.message}`);
    
    return res.status(500).json({
      success: false,
      error: 'Unable to retrieve email status',
      plan: 'free',
      limits: getDefaultLimits(),
      usage: getDefaultUsage(),
      restrictions: getDefaultRestrictions()
    });
  }
});

module.exports = router;