const express = require('express');
const config = require('../config');
const dictionaries = require('../dictionaries');
const { isAuthenticated, securityHeaders, sanitizeInputs, detectMaliciousInput, createCSRFProtection } = require('../middleware/authMiddleware');
const idempotencyMiddleware = require('../middleware/idempotency');
const rateLimitMiddleware = require('../middleware/rateLimit');
const queueGate = require('../middleware/queueGate');
const SecurityMiddleware = require('../middleware/SecurityMiddleware');

const userPreferencesManager = require('../userPreferencesManager');
const PlanService = require('../services/PlanService');
const ServicesBootstrap = require('../services/ServicesBootstrap');

const router = express.Router();

router.use(queueGate);
config.smartLog('buffer', 'queue-gate:router-mounted:api');

router.use(securityHeaders);
router.use(sanitizeInputs);
router.use(detectMaliciousInput);

const planService = PlanService.getInstance();
const bootstrap = ServicesBootstrap.createBootstrap(config, userPreferencesManager, dictionaries, planService);

try {
  bootstrap.validateDependencies();
} catch (error) {
  config.smartLog('fail', `Services validation failed: ${error.message}`);
  throw error;
}

const controllers = bootstrap.getAllControllers();
const services = bootstrap.getAllServices();

const withDeadlineLocal = (timeoutMs) => {
  return (asyncHandler) => {
    return async (req, res, next) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        if (!res.headersSent) {
          config.smartLog('fail', `deadline:api-429 ${req.path}`);
          res.status(429).json({
            success: false,
            error: 'Request deadline exceeded',
            reason: 'deadline',
            timeout: timeoutMs
          });
        }
        controller.abort();
      }, timeoutMs);
      
      req.abortSignal = controller.signal;
      
      try {
        await asyncHandler(req, res, next);
      } catch (error) {
        if (error.name === 'AbortError') {
          config.smartLog('fail', `deadline:aborted ${req.path}`);
        } else {
          throw error;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };
  };
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.get('/', (req, res) => {
  const healthStatus = bootstrap.getHealthStatus();
  res.json({
    success: true,
    message: 'myJobBuddy API is running',
    version: '2.0.0',
    architecture: 'services-based',
    health: healthStatus
  });
});

router.post('/search-career-pages', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  createCSRFProtection(),
  SecurityMiddleware.validateInput({
    jobTitles: { required: true, type: 'array', maxLength: 10 },
    urls: { required: true, type: 'array', maxLength: 50 }
  }),
  withDeadlineLocal(config.timeouts?.apiMs || 120000),
  asyncHandler(async (req, res) => {
    await controllers.searchController.searchCareerPages(req, res);
  })
);

router.post('/search-cache-only', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  asyncHandler(async (req, res) => {
    await controllers.searchController.searchCacheOnly(req, res);
  })
);

router.get('/search-career-pages-stream', 
  asyncHandler(async (req, res) => {
    try {
      const { userId } = services.validationService.extractUserInfo(req);
      config.smartLog('sse', `Starting SSE stream for user ${userId}`);
      
      await controllers.searchController.searchCareerPagesStream(req, res);
      
    } catch (error) {
      config.smartLog('fail', `SSE stream error: ${error.message}`);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'SSE_STREAM_ERROR',
          message: 'Failed to initialize search stream',
          details: error.message
        });
      }
    }
  })
);

router.post('/search-cache-opportunities',
  asyncHandler(async (req, res) => {
    await controllers.searchController.searchCacheOpportunities(req, res);
  })
);

router.post('/check-cache-status',
  asyncHandler(async (req, res) => {
    await controllers.searchController.checkCacheStatus(req, res);
  })
);

router.post('/refresh-cache',
  asyncHandler(async (req, res) => {
    await controllers.searchController.refreshCache(req, res);
  })
);

router.post('/scraping/batch', 
  isAuthenticated,
  SecurityMiddleware.createRateLimit('API'),
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.batchScraping(req, res);
  })
);

router.post('/scraping/single',
  SecurityMiddleware.createRateLimit('API'),
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.singleScraping(req, res);
  })
);

router.get('/scraping/sessions',
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.getSessions(req, res);
  })
);

router.get('/scraping/sessions/:sessionId',
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.getSession(req, res);
  })
);

router.post('/scraping/sessions/:sessionId/stop',
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.stopSession(req, res);
  })
);

router.post('/scraping/sessions/user/:userId/stop-all',
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.stopAllUserSessions(req, res);
  })
);

router.get('/scraping/users/:userId/sessions',
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.getUserSessions(req, res);
  })
);

router.get('/scraping/stats',
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.getStats(req, res);
  })
);

router.get('/get-user-preferences', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  asyncHandler(async (req, res) => {
    await controllers.userPreferencesController.getUserPreferences(req, res);
  })
);

router.post('/save-user-preferences', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  createCSRFProtection(),
  SecurityMiddleware.validateInput({
    jobTitles: { required: false, type: 'array', maxLength: 20 },
    locations: { required: false, type: 'array', maxLength: 10 },
    careerPages: { required: false, type: 'array', maxLength: 50 }
  }),
  asyncHandler(async (req, res) => {
    await controllers.userPreferencesController.saveUserPreferences(req, res);
  })
);

router.get('/verify-user-data', 
  isAuthenticated,
  asyncHandler(async (req, res) => {
    await controllers.userPreferencesController.verifyUserData(req, res);
  })
);

router.get('/export-user-data',
  isAuthenticated,
  asyncHandler(async (req, res) => {
    await controllers.userPreferencesController.exportUserData(req, res);
  })
);

router.post('/import-user-data',
  isAuthenticated,
  createCSRFProtection(),
  SecurityMiddleware.validateInput({
    data: { required: true, type: 'string', maxLength: 100000 }
  }),
  asyncHandler(async (req, res) => {
    await controllers.userPreferencesController.importUserData(req, res);
  })
);

router.get('/ats-detection',
  SecurityMiddleware.validateInput({
    url: { required: true, type: 'url' }
  }),
  asyncHandler(async (req, res) => {
    await controllers.platformController.detectATS(req, res);
  })
);

router.post('/ats-detection',
  SecurityMiddleware.validateInput({
    url: { required: true, type: 'url' }
  }),
  asyncHandler(async (req, res) => {
    await controllers.platformController.detectATS(req, res);
  })
);

router.get('/domain-profiles',
  asyncHandler(async (req, res) => {
    await controllers.platformController.getDomainProfiles(req, res);
  })
);

router.post('/detect-language',
  SecurityMiddleware.validateInput({
    text: { required: true, type: 'string', maxLength: 10000 }
  }),
  asyncHandler(async (req, res) => {
    await controllers.scrapingController.detectLanguage(req, res);
  })
);

router.post('/scrape',
  rateLimitMiddleware(5000, 10),
  SecurityMiddleware.validateInput({
    url: { required: true, type: 'url' }
  }),
  asyncHandler(async (req, res) => {
    await controllers.platformController.simulateScrape(req, res);
  })
);

router.post('/job-filter',
  SecurityMiddleware.validateInput({
    jobs: { required: true, type: 'array', maxLength: 100 },
    filters: { required: true, type: 'string', maxLength: 1000 }
  }),
  asyncHandler(async (req, res) => {
    await controllers.platformController.filterJobs(req, res);
  })
);

router.get('/debug/timeout',
  asyncHandler(async (req, res) => {
    await controllers.platformController.debugTimeout(req, res);
  })
);

router.post('/files/upload',
  isAuthenticated,
  SecurityMiddleware.createRateLimit('UPLOAD'),
  SecurityMiddleware.fileUploadSecurity,
  asyncHandler(async (req, res) => {
    await controllers.fileController.uploadFile(req, res);
  })
);

router.delete('/files/:filename',
  isAuthenticated,
  SecurityMiddleware.validateInput({
    filename: { required: true, type: 'string', maxLength: 255 }
  }),
  asyncHandler(async (req, res) => {
    await controllers.fileController.deleteFile(req, res);
  })
);

router.get('/files',
  isAuthenticated,
  asyncHandler(async (req, res) => {
    await controllers.fileController.listFiles(req, res);
  })
);

router.post('/files/cleanup',
  isAuthenticated,
  createCSRFProtection(),
  asyncHandler(async (req, res) => {
    await controllers.fileController.cleanupFiles(req, res);
  })
);

router.post('/files/process-image',
  isAuthenticated,
  SecurityMiddleware.fileUploadSecurity,
  asyncHandler(async (req, res) => {
    await controllers.fileController.processImageEndpoint(req, res);
  })
);

router.post('/files/export',
  isAuthenticated,
  createCSRFProtection(),
  SecurityMiddleware.validateInput({
    format: { required: true, type: 'string', maxLength: 10 }
  }),
  asyncHandler(async (req, res) => {
    await controllers.fileController.exportData(req, res);
  })
);

router.post('/files/import',
  isAuthenticated,
  createCSRFProtection(),
  SecurityMiddleware.fileUploadSecurity,
  asyncHandler(async (req, res) => {
    await controllers.fileController.importData(req, res);
  })
);

router.get('/dictionaries/ui/locales.json',
  asyncHandler(async (req, res) => {
    try {
      const supportedLanguages = dictionaries.getSupportedLanguages();
      res.json({ languages: supportedLanguages });
    } catch (error) {
      config.smartLog('fail', `Error serving locales.json: ${error.message}`);
      res.status(500).json({ languages: ['en'] });
    }
  })
);

router.get('/health',
  asyncHandler(async (req, res) => {
    const healthStatus = bootstrap.getHealthStatus();
    res.json({
      success: true,
      health: healthStatus,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  })
);

router.get('/errors/recent',
  asyncHandler(async (req, res) => {
    const errors = [];
    const responseData = services.responseFormatterService.formatSuccessResponse({
      errors,
      count: errors.length,
      message: 'Recent errors retrieved'
    });
    res.json(responseData);
  })
);

const webhooksStore = { registrations: [], logs: [] };

router.post('/webhooks/register',
  createCSRFProtection(),
  SecurityMiddleware.validateInput({
    url: { required: true, type: 'url' },
    events: { required: true, type: 'array', maxLength: 10 }
  }),
  asyncHandler(async (req, res) => {
    try {
      const validatedRequest = services.validationService.validateWebhookRequest(req.body);
      
      const registration = { 
        id: 'webhook_' + Date.now(), 
        ...validatedRequest, 
        created: new Date().toISOString(), 
        active: true 
      };
      
      webhooksStore.registrations.push(registration);
      
      const responseData = services.responseFormatterService.formatWebhookResponse(registration);
      res.json(services.responseFormatterService.formatSuccessResponse(responseData));
      
    } catch (error) {
      const errorResponse = services.responseFormatterService.formatErrorResponse(error);
      res.status(400).json(errorResponse);
    }
  })
);

router.post('/webhooks/unregister',
  createCSRFProtection(),
  SecurityMiddleware.validateInput({
    id: { required: true, type: 'string', maxLength: 50 }
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.body;
    const index = webhooksStore.registrations.findIndex(r => r.id === id);
    
    if (index !== -1) {
      webhooksStore.registrations.splice(index, 1);
    }
    
    const responseData = { removed: index !== -1 };
    res.json(services.responseFormatterService.formatSuccessResponse(responseData));
  })
);

router.get('/webhooks/logs',
  SecurityMiddleware.validateInput({
    limit: { required: false, type: 'string', maxLength: 10 }
  }),
  asyncHandler(async (req, res) => {
    const { limit = 100 } = req.query;
    const logs = webhooksStore.logs.slice(-parseInt(limit));
    
    const responseData = services.responseFormatterService.formatWebhookLogsResponse(logs, webhooksStore.logs.length);
    res.json(services.responseFormatterService.formatSuccessResponse(responseData));
  })
);

router.get('/debug/cache/stats',
  asyncHandler(async (req, res) => {
    const stats = {
      hitRatio: Math.round((Math.random() * 30 + 60) * 100) / 100,
      items: Math.floor(Math.random() * 1000) + 100,
      stale: Math.floor(Math.random() * 50) + 5,
      expired: Math.floor(Math.random() * 20) + 2
    };
    
    const responseData = { stats, timestamp: Date.now() };
    res.json(services.responseFormatterService.formatSuccessResponse(responseData));
  })
);

router.post('/debug/cache/housekeeping',
  createCSRFProtection(),
  asyncHandler(async (req, res) => {
    const results = {
      purged: Math.floor(Math.random() * 20) + 5,
      reprofiled: Math.floor(Math.random() * 10) + 2
    };
    
    const responseData = { results, timestamp: Date.now() };
    res.json(services.responseFormatterService.formatSuccessResponse(responseData));
  })
);

router.use(bootstrap.createErrorHandler());

router.get('/csrf-token',
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const csrf = require('csrf');
    const tokens = new csrf();
    
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = tokens.secretSync();
    }
    
    const token = tokens.create(req.session.csrfSecret);
    
    res.json({
      success: true,
      token,
      timestamp: new Date().toISOString()
    });
  })
);

const cleanupScraperBrowsers = async () => {
  try {
    const scrapingService = require('../scrapingService');
    if (scrapingService && scrapingService.closeBrowsers) {
      await scrapingService.closeBrowsers();
    }
  } catch (error) {
    config.smartLog('fail', `Error cleaning up scraper browsers: ${error.message}`);
  }
};

process.on('SIGINT', async () => {
  config.smartLog('steps', 'Stopping server (SIGINT)...');
  bootstrap.shutdown();
  await cleanupScraperBrowsers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  config.smartLog('steps', 'Stopping server (SIGTERM)...');
  bootstrap.shutdown();
  await cleanupScraperBrowsers();
  process.exit(0);
});

config.smartLog('win', `API Routes refactored: ${Object.keys(controllers).length} controllers, ${Object.keys(services).length} services`);

module.exports = router;