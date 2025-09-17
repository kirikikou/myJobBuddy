const express = require('express');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { getPlanByName, getPlanByNameAndDuration, getAllPlans, canPerformLiveSearch } = require('../subscriptionPlans');
const userPreferencesManager = require('../userPreferencesManager');
const config = require('../config');

const router = express.Router();

const planLimitsCache = config.createMemoryCache(30000);

const loggingService = require('../services/LoggingService');
router.get('/limits', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const apiContext = config.createApiContext(req);
    const logger = config.getContextualLogger(req.sessionID, apiContext);
    
    const cacheKey = `plan_limits_${userId}`;
    const cachedResult = planLimitsCache.get(cacheKey);
    
    if (cachedResult) {
      loggingService.service('planRoutes','info',{ message: 'Plan limits served from cache', details: { cache: 'hit' } });
      return res.json(cachedResult);
    }
    
    loggingService.service('planRoutes','info',{ message: 'Plan limits cache miss, fetching fresh data', details: { cache: 'miss' } });
    
    const userPrefs = await userPreferencesManager.getUserPreferences(userId);
    const userPlan = userPrefs.subscription?.plan || 'free';
    
    const planData = getPlanByName(userPlan);
    
    const result = {
      success: true,
      plan: userPlan,
      limits: planData.limits,
      usage: userPrefs.usage || {
        scrapingRequests: 0,
        cacheSearches: 0,
        applicationsTracked: 0,
        lastResetDate: new Date().toISOString().split('T')[0]
      },
      restrictions: {
        canAddCompany: true,
        canAddJobTitle: true,
        canPerformSearch: true,
        canPerformLiveSearch: canPerformLiveSearch(userPlan),
        canGenerateCoverLetter: true,
        hasLinkedinIntegration: userPlan !== 'free',
        hasExportFeature: planData.limits.canExportData,
        hasPrioritySupport: planData.limits.supportLevel === 'priority'
      }
    };
    
    planLimitsCache.set(cacheKey, result);
    loggingService.service('planRoutes','info',{ message: 'Plan limits cached for 30s', details: { plan: userPlan, cache: 'stored' } });
    
    res.set('Cache-Control', 'public, max-age=30');
    res.json(result);
    
  } catch (error) {
    const apiContext = config.createApiContext(req);
    const logger = config.getContextualLogger(req.sessionID, apiContext);
    loggingService.error('Error in /plan/limits',{ error: { error: error.message } });
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/pricing', (req, res) => {
  const plans = getAllPlans();
  const pricingData = {};
  
  Object.keys(plans).forEach(planName => {
    if (planName !== 'free') {
      pricingData[planName] = {
        name: plans[planName].name,
        description: plans[planName].description,
        features: plans[planName].features,
        durations: plans[planName].durations,
        limits: plans[planName].limits
      };
    }
  });
  
  res.json({
    success: true,
    plans: pricingData,
    freePlan: {
      name: plans.free.name,
      description: plans.free.description,
      features: plans.free.features,
      limits: plans.free.limits
    }
  });
});

router.get('/upgrade-info', isAuthenticated, (req, res) => {
  const currentPlan = req.user.subscription.plan;
  
  const upgradePaths = {
    free: {
      recommended: 'standard',
      benefits: ['Live job search', 'Daily searches', 'AI cover letters', 'Email reminders', '50 companies']
    },
    standard: {
      recommended: 'pro', 
      benefits: ['Priority scraping', '2x search capacity', '100 companies', 'Advanced analytics']
    },
    pro: {
      recommended: null,
      benefits: ['You have the premium plan!']
    }
  };
  
  res.json({
    success: true,
    currentPlan,
    upgrade: upgradePaths[currentPlan]
  });
});

router.post('/upgrade', isAuthenticated, async (req, res) => {
  try {
    const { planName, duration } = req.body;
    
    if (!planName || !duration) {
      return res.status(400).json({
        success: false,
        error: 'Plan name and duration are required'
      });
    }
    
    const planData = getPlanByNameAndDuration(planName, duration);
    if (!planData) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan or duration'
      });
    }
    
    res.json({
      success: true,
      plan: planData,
      message: 'Upgrade information retrieved',
      redirectToPayment: true
    });
    
  } catch (error) {
    const apiContext = config.createApiContext(req);
    const logger = config.getContextualLogger(req.sessionID, apiContext);
    loggingService.error('Upgrade error',{ error: { error: error.message } });
    
    res.status(500).json({
      success: false,
      error: 'Failed to process upgrade request'
    });
  }
});

module.exports = router;