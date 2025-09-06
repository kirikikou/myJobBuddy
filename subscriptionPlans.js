const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free Plan',
    description: 'Basic features with cache search only',
    durations: {
      1: { price: 0, monthlyEquivalent: 0 }
    },
    limits: {
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
    },
    features: [
      'Cache search only',
      'Basic job tracking',
      'Simple CV builder',
      'Community support',
      'Email search (cache only - 1/day)'
    ]
  },

  standard: {
    name: 'Standard Plan',
    description: 'Enhanced features for active job seekers',
    durations: {
      1: { price: 4.99, monthlyEquivalent: 4.99 },
      3: { price: 13.49, monthlyEquivalent: 4.50 },
      6: { price: 23.49, monthlyEquivalent: 3.91 },
      12: { price: 46.99, monthlyEquivalent: 3.91 }
    },
    limits: {
      maxOpportunities: 5,
      maxCareerPages: 50,
      maxJobTitles: 5,
      maxScrapingRequests: 50,
      maxCacheSearches: 100,
      maxEmailSearches: 3,
      maxEmailSearchesCache: 5,
      maxCVs: 2,
      maxResources: 10,
      maxLinktrees: 3,
      maxCoverLetters: 2,
      canExportData: true,
      canUseAdvancedSearch: true,
      canUseLiveSearch: true,
      canUseLiveEmailSearch: true,
      canExportJobResults: false,
      supportLevel: 'email'
    },
    features: [
      'Live scraping + cache search',
      'Advanced job tracking',
      'Multiple CV templates',
      'Data export',
      'Email support',
      'Email search (3 live + 5 cache/day)'
    ]
  },

  pro: {
    name: 'Pro Plan',
    description: 'Full features for professional job hunting',
    durations: {
      1: { price: 9.99, monthlyEquivalent: 9.99 },
      3: { price: 26.99, monthlyEquivalent: 9.00 },
      6: { price: 41.99, monthlyEquivalent: 6.99 },
      12: { price: 79.99, monthlyEquivalent: 6.67 }
    },
    limits: {
      maxOpportunities: 10,
      maxCareerPages: 100,
      maxJobTitles: 10,
      maxScrapingRequests: 100,
      maxCacheSearches: 1000,
      maxEmailSearches: 5,
      maxEmailSearchesCache: 10,
      maxCVs: 2,
      maxResources: 20,
      maxLinktrees: 5,
      maxCoverLetters: 2,
      canExportData: true,
      canUseAdvancedSearch: true,
      canUseLiveSearch: true,
      canUseLiveEmailSearch: true,
      canExportJobResults: false,
      supportLevel: 'priority'
    },
    features: [
      'Unlimited job tracking',
      'Premium CV templates',
      'Advanced analytics',
      'Priority support',
      'Priority scraping queue',
      'Email search (5 live + 10 cache/day)'
    ]
  },

  theSentinel: {
    name: 'The Sentinel',
    description: 'Ultimate access with export capabilities',
    durations: {
      1: { price: 99999, monthlyEquivalent: 99999 }
    },
    limits: {
      maxOpportunities: 999999,
      maxCareerPages: 999999,
      maxJobTitles: 999999,
      maxScrapingRequests: 999999,
      maxCacheSearches: 999999,
      maxEmailSearches: 999999,
      maxEmailSearchesCache: 999999,
      maxCVs: 10,
      maxResources: 100,
      maxLinktrees: 5,
      maxCoverLetters: 5,
      canExportData: true,
      canUseAdvancedSearch: true,
      canUseLiveSearch: true,
      canUseLiveEmailSearch: true,
      canExportJobResults: true,
      supportLevel: 'vip'
    },
    features: [
      'Unlimited everything',
      'Job results export',
      'VIP support',
      'Advanced features',
      'Priority access',
      'Unlimited email search'
    ],
    restrictions: {
      requiresManualActivation: true,
      hidden: true
    }
  }
};

const getPlanByName = (planName) => {
  return SUBSCRIPTION_PLANS[planName] || SUBSCRIPTION_PLANS.free;
};

const getPlanByNameAndDuration = (planName, duration) => {
  const plan = getPlanByName(planName);
  const durationData = plan.durations[duration] || plan.durations[1];
  return {
    ...plan,
    selectedDuration: duration,
    price: durationData.price,
    monthlyEquivalent: durationData.monthlyEquivalent
  };
};

const getAllPlans = () => {
  return SUBSCRIPTION_PLANS;
};

const getAvailablePlans = () => {
  return Object.keys(SUBSCRIPTION_PLANS).filter(plan => 
    !SUBSCRIPTION_PLANS[plan].restrictions?.requiresInviteCode &&
    !SUBSCRIPTION_PLANS[plan].restrictions?.hidden
  );
};

const getPublicPlans = () => {
  return Object.keys(SUBSCRIPTION_PLANS).filter(plan => {
    const planData = SUBSCRIPTION_PLANS[plan];
    return !planData.restrictions?.requiresInviteCode && 
           !planData.restrictions?.requiresSchoolEmail &&
           !planData.restrictions?.hidden;
  });
};

const validatePlanUpgrade = (currentPlan, targetPlan, duration = 1) => {
  const current = getPlanByName(currentPlan);
  const target = getPlanByNameAndDuration(targetPlan, duration);
  
  if (!target) {
    return { valid: false, reason: 'Target plan does not exist' };
  }
  
  if (target.restrictions?.requiresInviteCode) {
    return { valid: false, reason: 'Target plan requires invite code' };
  }
  
  if (target.restrictions?.requiresSchoolEmail) {
    return { valid: false, reason: 'Target plan requires school email verification' };
  }
  
  return { valid: true };
};

const checkLimit = (planName, limitType, currentUsage) => {
  const plan = getPlanByName(planName);
  const limit = plan.limits[limitType];
  
  if (limit === undefined) {
    return { allowed: true, limit: Infinity, remaining: Infinity };
  }
  
  if (typeof limit === 'boolean') {
    return { allowed: limit, limit: limit ? 1 : 0, remaining: limit ? 1 : 0 };
  }
  
  return {
    allowed: currentUsage < limit,
    limit: limit,
    remaining: Math.max(0, limit - currentUsage),
    usage: currentUsage
  };
};

const canPerformLiveSearch = (planName) => {
  const plan = getPlanByName(planName);
  return plan.limits.canUseLiveSearch === true;
};

const canPerformLiveEmailSearch = (planName) => {
  const plan = getPlanByName(planName);
  return plan.limits.canUseLiveEmailSearch === true;
};

const canExportJobResults = (planName) => {
  const plan = getPlanByName(planName);
  return plan.limits.canExportJobResults === true;
};

const getEmailSearchLimits = (planName) => {
  const plan = getPlanByName(planName);
  return {
    liveSearches: plan.limits.maxEmailSearches,
    cacheSearches: plan.limits.maxEmailSearchesCache,
    canUseLive: plan.limits.canUseLiveEmailSearch
  };
};

const getPlanFeatures = (planName, duration = 1) => {
  const plan = getPlanByNameAndDuration(planName, duration);
  return {
    name: plan.name,
    description: plan.description,  
    price: plan.price,
    monthlyEquivalent: plan.monthlyEquivalent,
    duration: duration,
    features: plan.features,
    limits: plan.limits,
    restrictions: plan.restrictions || {}
  };
};

module.exports = {
  SUBSCRIPTION_PLANS,
  getPlanByName,
  getPlanByNameAndDuration,
  getAllPlans,
  getAvailablePlans,
  getPublicPlans,
  validatePlanUpgrade,
  checkLimit,
  canPerformLiveSearch,
  canPerformLiveEmailSearch,
  canExportJobResults,
  getEmailSearchLimits,
  getPlanFeatures
};