const express = require('express');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { getPlanByName, getPlanByNameAndDuration, getAllPlans, canPerformLiveSearch } = require('../subscriptionPlans');
const userPreferencesManager = require('../userPreferencesManager');
const config = require('../config');
const queueGate = require('../middleware/queueGate');
const router = express.Router();

router.use(queueGate);
config.smartLog('buffer', 'queue-gate:router-mounted:plan');

const planLimitsCache = config.createMemoryCache ? config.createMemoryCache(30000) : new Map();

const getDefaultLimits = () => ({
  maxScrapingRequests: 0,
  maxCacheSearches: 0,
  maxFavoriteCompanies: 0,
  maxJobTitles: 0,
  aiCoverLetters: 0,
  applicationsTracked: 0,
  canExportData: false,
  supportLevel: 'basic'
});

const getDefaultUsage = () => ({
  scrapingRequests: 0,
  cacheSearches: 0,
  applicationsTracked: 0,
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
  hasPrioritySupport: false
});

const ensureSafePlanResponse = (data, plan = 'free') => {
  const defaultLimits = getDefaultLimits();
  const defaultUsage = getDefaultUsage();
  const defaultRestrictions = getDefaultRestrictions();
  
  return {
    success: true,
    plan: plan,
    limits: {
      ...defaultLimits,
      ...(data.limits || {})
    },
    usage: {
      ...defaultUsage,
      ...(data.usage || {})
    },
    restrictions: {
      ...defaultRestrictions,
      ...(data.restrictions || {})
    },
    timestamp: Date.now()
  };
};

router.get('/limits', async (req, res) => {
  try {
    const isStressTest = req.headers['x-stress-test'] === 'true';
    const isAuthenticatedUser = req.isAuthenticated() && req.user && req.user._id;
    
    if (!isAuthenticatedUser && !isStressTest) {
      config.smartLog('buffer', `Plan limits request - unauthenticated user, returning free plan`);
      return res.json(ensureSafePlanResponse({
        limits: getDefaultLimits(),
        usage: getDefaultUsage(),
        restrictions: getDefaultRestrictions()
      }, 'free'));
    }

    const userId = req.user && req.user._id ? String(req.user._id) : null;
    const userIdStr = userId ? userId.slice(-8) : 'stress';
    const basePlan = isStressTest ? 'pro' : (req.user && req.user.subscription && req.user.subscription.plan ? req.user.subscription.plan : 'free');
    
    const cacheKey = userId ? `plan_limits_${userId}` : `plan_limits_public_${basePlan}`;
    const cached = planLimitsCache.get && planLimitsCache.get(cacheKey);
    
    if (cached) {
      config.smartLog('cache', `Plan limits cache hit - user: ${userIdStr}, plan: ${cached.plan}`);
      return res.json(cached);
    }

    let userPrefs = null;
    if (userId && !isStressTest) {
      try {
        userPrefs = await userPreferencesManager.getUserPreferences(userId);
        config.smartLog('buffer', `User preferences loaded - user: ${userIdStr}, prefs plan: ${userPrefs?.subscription?.plan || 'none'}`);
      } catch (prefsError) {
        config.smartLog('fail', `Failed to load user preferences for ${userIdStr}: ${prefsError.message}`);
      }
    }
    
    const resolvedPlan = isStressTest ? 'pro' : (userPrefs && userPrefs.subscription && userPrefs.subscription.plan ? userPrefs.subscription.plan : basePlan);
    
    let planData;
    try {
      planData = getPlanByName(resolvedPlan);
      config.smartLog('buffer', `Plan data loaded - user: ${userIdStr}, plan: ${resolvedPlan}`);
    } catch (planError) {
      config.smartLog('fail', `Failed to get plan data for ${resolvedPlan}: ${planError.message}`);
    }
    
    if (!planData) {
      config.smartLog('fail', `No plan data found for ${resolvedPlan}, using defaults`);
      planData = { limits: getDefaultLimits(), name: resolvedPlan, description: `${resolvedPlan} plan` };
    }

    const limits = isStressTest ? {
      maxScrapingRequests: 999999,
      maxCacheSearches: 999999,
      maxFavoriteCompanies: 999999,
      maxJobTitles: 999999,
      aiCoverLetters: 999999,
      applicationsTracked: 999999,
      canExportData: true,
      supportLevel: 'priority'
    } : { ...getDefaultLimits(), ...(planData.limits || {}) };
    
    const usage = isStressTest ? {
      scrapingRequests: 0,
      cacheSearches: 0,
      applicationsTracked: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    } : (userPrefs && userPrefs.usage ? userPrefs.usage : getDefaultUsage());

    let live = false;
    try {
      live = isStressTest ? true : canPerformLiveSearch(resolvedPlan);
      config.smartLog('buffer', `Live search capability - user: ${userIdStr}, plan: ${resolvedPlan}, allowed: ${live}`);
    } catch (liveError) {
      config.smartLog('fail', `Failed to check live search capability for ${resolvedPlan}: ${liveError.message}`);
      live = isStressTest;
    }

    const restrictions = {
      ...getDefaultRestrictions(),
      canPerformLiveSearch: live,
      hasLinkedinIntegration: resolvedPlan !== 'free',
      hasExportFeature: !!limits.canExportData,
      hasPrioritySupport: limits.supportLevel === 'priority',
      canGenerateCoverLetter: resolvedPlan !== 'free'
    };

    const result = ensureSafePlanResponse({ limits, usage, restrictions }, resolvedPlan);
    
    if (planLimitsCache.set) {
      planLimitsCache.set(cacheKey, result);
    }
    
    config.smartLog('win', `Plan limits response - user: ${userIdStr}, plan: ${resolvedPlan}, live: ${live}`);
    
    res.set('Cache-Control', 'public, max-age=30');
    return res.json(result);
    
  } catch (error) {
    const userIdStr = req.user && req.user._id ? req.user._id.toString().slice(-8) : 'unknown';
    config.smartLog('fail', `Plan limits critical error for user ${userIdStr}: ${error.message}`);
    
    const fallback = ensureSafePlanResponse({
      limits: getDefaultLimits(),
      usage: getDefaultUsage(),
      restrictions: getDefaultRestrictions()
    }, 'free');
    fallback.success = false;
    fallback.message = 'Unable to retrieve plan information';
    fallback.error = error.message;
    
    return res.status(500).json(fallback);
  }
});

router.get('/pricing', (req, res) => {
  try {
    let plans;
    try {
      plans = getAllPlans();
      if (!plans) {
        throw new Error('No plans available');
      }
    } catch (error) {
      config.smartLog('fail', `Failed to get all plans: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'Unable to retrieve pricing information',
        plans: {},
        freePlan: {
          name: 'Free',
          description: 'Basic free plan',
          features: ['Basic features'],
          limits: getDefaultLimits()
        }
      });
    }
    
    const pricingData = {};
    
    Object.keys(plans).forEach(planName => {
      if (planName !== 'free') {
        const plan = plans[planName];
        pricingData[planName] = {
          name: plan?.name || planName,
          description: plan?.description || 'Premium plan',
          features: plan?.features || [],
          durations: plan?.durations || {},
          limits: {
            ...getDefaultLimits(),
            ...(plan?.limits || {})
          }
        };
      }
    });
    
    const freePlan = plans.free || {
      name: 'Free',
      description: 'Basic free plan',
      features: ['Basic features'],
      limits: getDefaultLimits()
    };
    
    config.smartLog('win', `Pricing data retrieved - plans: ${Object.keys(pricingData).length}`);
    
    res.json({
      success: true,
      plans: pricingData,
      freePlan: {
        name: freePlan.name || 'Free',
        description: freePlan.description || 'Basic free plan',
        features: freePlan.features || [],
        limits: {
          ...getDefaultLimits(),
          ...(freePlan.limits || {})
        }
      }
    });
  } catch (error) {
    config.smartLog('fail', `Pricing endpoint error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      plans: {},
      freePlan: {
        name: 'Free',
        description: 'Basic free plan',
        features: ['Basic features'],
        limits: getDefaultLimits()
      }
    });
  }
});

router.get('/upgrade-info', isAuthenticated, (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      config.smartLog('fail', `Upgrade info - user validation failed`);
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        currentPlan: 'unknown',
        upgrade: null
      });
    }

    const userIdStr = req.user._id.toString().slice(-8);
    const currentPlan = req.user?.subscription?.plan || 'free';
    
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
    
    const upgradeInfo = upgradePaths[currentPlan] || upgradePaths.free;
    
    config.smartLog('win', `Upgrade info retrieved - user: ${userIdStr}, current: ${currentPlan}, recommended: ${upgradeInfo.recommended || 'none'}`);
    
    res.json({
      success: true,
      currentPlan,
      upgrade: upgradeInfo
    });
  } catch (error) {
    const userIdStr = req.user && req.user._id ? req.user._id.toString().slice(-8) : 'unknown';
    config.smartLog('fail', `Upgrade info error for user ${userIdStr}: ${error.message}`);
    
    res.status(500).json({
      success: false,
      error: error.message,
      currentPlan: 'free',
      upgrade: {
        recommended: 'standard',
        benefits: ['Upgrade for more features']
      }
    });
  }
});

router.post('/upgrade', isAuthenticated, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      config.smartLog('fail', `Upgrade request - user validation failed`);
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        plan: null,
        redirectToPayment: false
      });
    }

    const userIdStr = req.user._id.toString().slice(-8);
    const { planName, duration } = req.body;
    
    if (!planName || !duration) {
      config.smartLog('fail', `Upgrade request incomplete - user: ${userIdStr}, plan: ${planName || 'missing'}, duration: ${duration || 'missing'}`);
      return res.status(400).json({
        success: false,
        error: 'Plan name and duration are required',
        plan: null,
        redirectToPayment: false
      });
    }
    
    let planData;
    try {
      planData = getPlanByNameAndDuration(planName, duration);
      if (!planData) {
        throw new Error(`Plan ${planName} with duration ${duration} not found`);
      }
    } catch (error) {
      config.smartLog('fail', `Invalid upgrade request - user: ${userIdStr}, plan: ${planName}, duration: ${duration}, error: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid plan or duration',
        plan: null,
        redirectToPayment: false
      });
    }
    
    const responseData = {
      success: true,
      plan: {
        ...planData,
        limits: {
          ...getDefaultLimits(),
          ...(planData.limits || {})
        }
      },
      message: 'Upgrade information retrieved',
      redirectToPayment: true
    };
    
    config.smartLog('win', `Upgrade request processed - user: ${userIdStr}, plan: ${planName}, duration: ${duration}`);
    
    res.json(responseData);
    
  } catch (error) {
    const userIdStr = req.user && req.user._id ? req.user._id.toString().slice(-8) : 'unknown';
    config.smartLog('fail', `Upgrade request error for user ${userIdStr}: ${error.message}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process upgrade request',
      plan: null,
      redirectToPayment: false
    });
  }
});

module.exports = router;