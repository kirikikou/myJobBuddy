const config = require('../config');
const { 
  getPlanByName, 
  checkLimit, 
  canPerformLiveSearch, 
  canPerformLiveEmailSearch,
  canExportJobResults,
  getEmailSearchLimits 
} = require('../subscriptionPlans');

class PlanService {
  constructor() {
    this._instance = null;
  }

  static getInstance() {
    if (!this._instance) {
      this._instance = new PlanService();
    }
    return this._instance;
  }

  async enrichPreferencesWithPlan(preferences, user = {}) {
    try {
      const userId = user._id?.toString() || 'unknown';
      const userPlan = preferences?.subscription?.plan || user?.subscription?.plan || 'free';
      const planData = getPlanByName(userPlan);

      if (!preferences) {
        config.smartLog('buffer', `enrichPreferencesWithPlan: no preferences for ${userId}, using plan ${userPlan}`);
        return {
          subscription: {
            plan: userPlan,
            features: planData.limits,
            startDate: new Date().toISOString().split('T')[0]
          },
          usage: {
            scrapingRequests: 0,
            cacheSearches: 0,
            applicationsTracked: 0,
            lastResetDate: new Date().toISOString().split('T')[0]
          }
        };
      }

      const enrichedPreferences = {
        ...preferences,
        subscription: {
          ...preferences.subscription,
          plan: userPlan,
          features: planData.limits
        }
      };

      if (!enrichedPreferences.usage) {
        enrichedPreferences.usage = {
          scrapingRequests: 0,
          cacheSearches: 0,
          applicationsTracked: 0,
          lastResetDate: new Date().toISOString().split('T')[0]
        };
      }

      config.smartLog('buffer', `Preferences structure normalized successfully`);
      return enrichedPreferences;

    } catch (error) {
      config.smartLog('fail', `PlanService not available: ${error.message}`);
      return preferences || {};
    }
  }

  stripPlanFromClientData(clientData) {
    if (!clientData || typeof clientData !== 'object') {
      return clientData;
    }

    const sanitized = { ...clientData };

    if (sanitized.subscription) {
      if (sanitized.subscription.features) {
        delete sanitized.subscription.features;
      }
      if (sanitized.subscription.limits) {
        delete sanitized.subscription.limits;
      }
    }

    return sanitized;
  }

  async getUserPlanInfo(userId, preferences) {
    try {
      const userPlan = preferences?.subscription?.plan || 'free';
      const planData = getPlanByName(userPlan);

      return {
        plan: userPlan,
        features: planData.limits,
        limits: planData.limits,
        canPerformLiveSearch: canPerformLiveSearch(userPlan),
        canPerformLiveEmailSearch: canPerformLiveEmailSearch(userPlan),
        canExportJobResults: canExportJobResults(userPlan),
        emailSearchLimits: getEmailSearchLimits(userPlan)
      };

    } catch (error) {
      config.smartLog('fail', `Error getting plan info for ${userId}: ${error.message}`);
      return {
        plan: 'free',
        features: getPlanByName('free').limits,
        limits: getPlanByName('free').limits,
        canPerformLiveSearch: false,
        canPerformLiveEmailSearch: false,
        canExportJobResults: false,
        emailSearchLimits: getEmailSearchLimits('free')
      };
    }
  }

  async checkUserLimit(userId, preferences, limitType) {
    try {
      const userPlan = preferences?.subscription?.plan || 'free';
      
      let currentUsage = 0;
      
      switch (limitType) {
        case 'maxOpportunities':
          currentUsage = preferences?.careerPages?.length || 0;
          break;
        case 'maxCareerPages':
          currentUsage = preferences?.careerPages?.length || 0;
          break;
        case 'maxJobTitles':
          currentUsage = preferences?.jobTitles?.length || 0;
          break;
        case 'maxScrapingRequests':
          currentUsage = preferences?.usage?.scrapingRequests || 0;
          break;
        case 'maxCacheSearches':
          currentUsage = preferences?.usage?.cacheSearches || 0;
          break;
        case 'maxCVs':
          currentUsage = preferences?.cvs ? Object.keys(preferences.cvs).length : 0;
          break;
        case 'maxLinktrees':
          currentUsage = preferences?.linktrees ? Object.keys(preferences.linktrees).length : 0;
          break;
        case 'maxResources':
          currentUsage = preferences?.resources?.length || 0;
          break;
        case 'maxApplicationsTracked':
          currentUsage = preferences?.usage?.applicationsTracked || 0;
          break;
        case 'maxEmailDomains':
          currentUsage = preferences?.emailSearchData?.searchedDomains?.length || 0;
          break;
        case 'maxFavoriteEmails':
          currentUsage = preferences?.emailSearchData?.favoriteEmails?.length || 0;
          break;
        default:
          currentUsage = 0;
      }
      
      return checkLimit(userPlan, limitType, currentUsage);

    } catch (error) {
      config.smartLog('fail', `Error checking limit ${limitType} for ${userId}: ${error.message}`);
      return { allowed: false, limit: 0, remaining: 0, usage: 0 };
    }
  }

  async validatePlanFeature(userId, preferences, featureName) {
    try {
      const userPlan = preferences?.subscription?.plan || 'free';
      const planData = getPlanByName(userPlan);
      
      const featureValue = planData.limits[featureName];
      
      if (typeof featureValue === 'boolean') {
        return featureValue;
      }
      
      if (typeof featureValue === 'number') {
        return featureValue > 0;
      }
      
      return false;

    } catch (error) {
      config.smartLog('fail', `Error validating feature ${featureName} for ${userId}: ${error.message}`);
      return false;
    }
  }

  isFeatureEnabled(featureName) {
    try {
      if (featureName === 'planIntegration') {
        return config.features?.planIntegration !== false;
      }
      
      if (featureName === 'enforcePlanLimits') {
        return config.features?.enforcePlanLimits !== false;
      }
      
      return true;

    } catch (error) {
      config.smartLog('fail', `Error checking feature ${featureName}: ${error.message}`);
      return false;
    }
  }

  async getPlanUpgradeRecommendations(userId, preferences) {
    try {
      const userPlan = preferences?.subscription?.plan || 'free';
      const currentUsage = preferences?.usage || {};
      
      const recommendations = [];
      
      if (userPlan === 'free') {
        if (currentUsage.scrapingRequests > 0) {
          recommendations.push({
            reason: 'enable_scraping',
            suggestedPlan: 'standard',
            message: 'Upgrade to Standard for live scraping capabilities'
          });
        }
        
        if ((currentUsage.cacheSearches || 0) > 40) {
          recommendations.push({
            reason: 'cache_limit_approaching',
            suggestedPlan: 'standard',
            message: 'Upgrade to Standard for more cache searches'
          });
        }
      }
      
      if (userPlan === 'standard') {
        if ((currentUsage.scrapingRequests || 0) > 40) {
          recommendations.push({
            reason: 'scraping_limit_approaching',
            suggestedPlan: 'pro',
            message: 'Upgrade to Pro for unlimited scraping'
          });
        }
      }
      
      return recommendations;

    } catch (error) {
      config.smartLog('fail', `Error getting upgrade recommendations for ${userId}: ${error.message}`);
      return [];
    }
  }
}

module.exports = PlanService;