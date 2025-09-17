const express = require('express');
const { isAuthenticated } = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimit');
const config = require('../config');
const JobListingService = require('../services/JobListingService');
const userPreferencesManager = require('../userPreferencesManager');

const router = express.Router();

router.get('/job-listing/all', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  async (req, res) => {
    const startTime = Date.now();
    const userId = req.user._id.toString();
    
    try {
      config.smartLog('api', `Job listing request: user=${userId.slice(-8)}`);
      
      const userPrefs = await userPreferencesManager.getUserPreferences(userId);
      const userPlan = userPrefs?.subscription?.plan || 'free';
      const jobTitles = userPrefs?.jobTitles || [];
      
      if (jobTitles.length === 0) {
        config.smartLog('api', `No job titles configured for user ${userId.slice(-8)}`);
        return res.json({
          success: true,
          jobs: [],
          totalJobs: 0,
          message: 'No job titles configured. Please add job titles in your preferences.',
          fromServiceCache: false
        });
      }
      
      const options = {
        includeStale: req.query.includeStale === 'true',
        sortBy: req.query.sortBy || 'confidence',
        filterByLocation: req.query.location
      };
      
      const jobListingService = JobListingService.getInstance();
      const result = await jobListingService.getJobsForUser(userId, userPlan, jobTitles, options);
      
      const responseTime = Date.now() - startTime;
      
      config.smartLog('win', `Job listing served: ${result.totalJobs} jobs for ${userId.slice(-8)} (${responseTime}ms)`);
      
      res.set('X-Response-Time', responseTime + 'ms');
      res.set('X-Cache-Hit', result.fromServiceCache ? 'true' : 'false');
      res.set('X-Plan', userPlan);
      
      res.json({
        ...result,
        userPlan: userPlan,
        responseTime: responseTime
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      config.smartLog('fail', `Job listing error for user ${userId.slice(-8)}: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve job listings',
          details: config.DEBUG ? error.message : undefined
        },
        jobs: [],
        totalJobs: 0,
        responseTime: responseTime
      });
    }
  }
);

router.get('/job-listing/stats', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, 20),
  async (req, res) => {
    try {
      const jobListingService = JobListingService.getInstance();
      const stats = await jobListingService.getServiceStats();
      
      config.smartLog('api', 'Job listing stats requested');
      
      res.json({
        success: true,
        stats: stats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      config.smartLog('fail', `Job listing stats error: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve service statistics',
          details: config.DEBUG ? error.message : undefined
        }
      });
    }
  }
);

router.post('/job-listing/refresh-cache', 
  isAuthenticated, 
  rateLimitMiddleware(60000, 5),
  async (req, res) => {
    try {
      const userId = req.user._id.toString();
      config.smartLog('api', `Cache refresh requested by user ${userId.slice(-8)}`);
      
      const jobListingService = JobListingService.getInstance();
      const result = await jobListingService.clearServiceCache();
      
      config.smartLog('win', `Service cache cleared by user ${userId.slice(-8)}`);
      
      res.json({
        success: true,
        message: 'Service cache cleared successfully',
        result: result
      });
      
    } catch (error) {
      config.smartLog('fail', `Cache refresh error: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to refresh cache',
          details: config.DEBUG ? error.message : undefined
        }
      });
    }
  }
);

router.post('/job-listing/rebuild-index', 
  isAuthenticated, 
  rateLimitMiddleware(300000, 2),
  async (req, res) => {
    try {
      const userId = req.user._id.toString();
      const userPrefs = await userPreferencesManager.getUserPreferences(userId);
      const userPlan = userPrefs?.subscription?.plan || 'free';
      
      if (userPlan === 'free') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Index rebuild is not available for free plan users',
            upgradeRequired: true
          }
        });
      }
      
      config.smartLog('api', `Index rebuild requested by user ${userId.slice(-8)}`);
      
      const jobListingService = JobListingService.getInstance();
      const result = await jobListingService.rebuildIndex();
      
      config.smartLog('win', `Job index rebuilt by user ${userId.slice(-8)}: ${result.indexSize} entries`);
      
      res.json({
        success: true,
        message: 'Job index rebuilt successfully',
        result: result
      });
      
    } catch (error) {
      config.smartLog('fail', `Index rebuild error: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to rebuild index',
          details: config.DEBUG ? error.message : undefined
        }
      });
    }
  }
);

router.get('/job-listing/search-opportunities',
  isAuthenticated,
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, 10),
  async (req, res) => {
    const startTime = Date.now();
    const userId = req.user._id.toString();
    
    try {
      const { jobTitle, includeStale = 'false' } = req.query;
      
      if (!jobTitle) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'jobTitle query parameter is required'
          }
        });
      }
      
      const userPrefs = await userPreferencesManager.getUserPreferences(userId);
      const userPlan = userPrefs?.subscription?.plan || 'free';
      
      config.smartLog('api', `Opportunity search: user=${userId.slice(-8)}, title="${jobTitle}"`);
      
      const options = {
        includeStale: includeStale === 'true',
        sortBy: 'confidence'
      };
      
      const jobListingService = JobListingService.getInstance();
      const result = await jobListingService.getJobsForUser(userId, userPlan, [jobTitle], options);
      
      const responseTime = Date.now() - startTime;
      
      config.smartLog('win', `Opportunity search completed: ${result.totalJobs} opportunities found (${responseTime}ms)`);
      
      res.json({
        success: true,
        opportunities: result.jobs,
        totalCount: result.totalJobs,
        searchTime: responseTime,
        jobTitle: jobTitle,
        userPlan: userPlan,
        fromServiceCache: result.fromServiceCache
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      config.smartLog('fail', `Opportunity search error: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to search opportunities',
          details: config.DEBUG ? error.message : undefined
        },
        opportunities: [],
        totalCount: 0,
        searchTime: responseTime
      });
    }
  }
);

module.exports = router;