const { 
    getPlanByName, 
    getPlanFeatures, 
    checkLimit, 
    canPerformLiveSearch,
    canPerformLiveEmailSearch,
    canExportJobResults
  } = require('../subscriptionPlans');
  const config = require('../config');
  
  class PlanService {
    static getInstance() {
      if (!this.instance) {
        this.instance = new PlanService();
      }
      return this.instance;
    }
  
    async getEffectivePlan(user) {
      if (!user) {
        config.smartLog('fail', 'PlanService: no user provided, defaulting to free');
        return 'free';
      }
  
      try {
        let effectivePlan = 'free';
  
        if (user.subscription && user.subscription.plan) {
          effectivePlan = user.subscription.plan;
        }
  
        const planData = getPlanByName(effectivePlan);
        if (!planData) {
          config.smartLog('buffer', `PlanService: invalid plan ${effectivePlan}, falling back to free`);
          effectivePlan = 'free';
        }
  
        if (user.subscription && user.subscription.status === 'cancelled') {
          config.smartLog('buffer', `PlanService: subscription cancelled, using free plan`);
          effectivePlan = 'free';
        }
  
        config.smartLog('buffer', `PlanService: effective plan for user ${user._id}: ${effectivePlan}`);
        return effectivePlan;
  
      } catch (error) {
        config.smartLog('fail', `PlanService: error determining plan: ${error.message}`);
        return 'free';
      }
    }
  
    async enrichPreferencesWithPlan(preferences, user) {
      const effectivePlan = await this.getEffectivePlan(user);
      const planData = getPlanByName(effectivePlan);
  
      const enrichedPreferences = {
        ...preferences,
        subscription: {
          ...preferences.subscription,
          plan: effectivePlan,
          status: user.subscription?.status || 'active',
          startDate: user.subscription?.startDate || new Date().toISOString().split('T')[0],
          endDate: user.subscription?.endDate || null,
          features: planData.limits
        }
      };
  
      config.smartLog('win', `PlanService: preferences enriched with plan ${effectivePlan}`);
      return enrichedPreferences;
    }
  
    async validateUserLimits(user, limitType, currentUsage = 0) {
      const effectivePlan = await this.getEffectivePlan(user);
      return checkLimit(effectivePlan, limitType, currentUsage);
    }
  
    async canUserPerformAction(user, action) {
      const effectivePlan = await this.getEffectivePlan(user);
      
      switch (action) {
        case 'liveSearch':
          return canPerformLiveSearch(effectivePlan);
        case 'liveEmailSearch':
          return canPerformLiveEmailSearch(effectivePlan);
        case 'exportJobResults':
          return canExportJobResults(effectivePlan);
        default:
          const planData = getPlanByName(effectivePlan);
          return planData.limits[action] === true;
      }
    }
  
    stripPlanFromClientData(clientData) {
      if (!clientData || typeof clientData !== 'object') {
        return clientData;
      }
  
      const sanitized = { ...clientData };
      
      if (sanitized.subscription) {
        const { plan, status, startDate, endDate, features, ...restSubscription } = sanitized.subscription;
        sanitized.subscription = restSubscription;
        
        config.smartLog('buffer', 'PlanService: stripped plan-related fields from client data');
      }
  
      return sanitized;
    }
  }
  
  module.exports = PlanService;