const MonitoringService = require('./MonitoringService');
const IntelligentCoordinator = require('../utils/IntelligentCoordinator');
const config = require('../config');

class MonitoringIntegration {
  constructor() {
    this.initialized = false;
    this.requestTracking = new Map();
  }

  async initialize() {
    if (this.initialized) return;
    
    await MonitoringService.initialize();
    await IntelligentCoordinator.initialize();
    
    this.setupScrapingHooks();
    this.setupUserHooks();
    this.setupSystemHooks();
    
    this.initialized = true;
    config.smartLog('buffer', 'MonitoringIntegration initialized');
  }

  setupScrapingHooks() {
    this.wrapScrapingCoordinator();
    this.wrapProfileQueueManager();
    this.wrapBatchManager();
  }

  wrapScrapingCoordinator() {
    try {
      const ScrapingCoordinator = require('../scrapers/ScrapingCoordinator');
      const coordinator = ScrapingCoordinator.getInstance();
      
      if (!coordinator || !coordinator.coordinatedScrape) {
        config.smartLog('fail', 'ScrapingCoordinator not ready for hooking');
        return;
      }
      
      const originalScrape = coordinator.coordinatedScrape.bind(coordinator);
      
      coordinator.coordinatedScrape = async (url, sessionId, options = {}, userId = 'anonymous') => {
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        const domain = this.getDomainFromUrl(url);
        const userPlan = await this.getUserPlan(userId);
        
        this.requestTracking.set(requestId, {
          url,
          domain,
          userId,
          userPlan,
          startTime
        });
        
        MonitoringService.trackRequest(userId, domain, '', userPlan);
        
        try {
          const result = await originalScrape(url, sessionId, options, userId);
          
          const duration = Date.now() - startTime;
          const success = result.success;
          const stepUsed = result.method || result.profile?.step || 'unknown';
          
          MonitoringService.trackScrapingResult(domain, stepUsed, duration, success, userId);
          
          this.requestTracking.delete(requestId);
          
          return result;
          
        } catch (error) {
          const duration = Date.now() - startTime;
          MonitoringService.trackScrapingResult(domain, 'error', duration, false, userId);
          
          this.requestTracking.delete(requestId);
          throw error;
        }
      };
      
      config.smartLog('win', 'ScrapingCoordinator monitoring hooked');
    } catch (error) {
      config.smartLog('fail', `Failed to hook ScrapingCoordinator: ${error.message}`);
    }
  }

  wrapProfileQueueManager() {
    try {
      const ProfileQueueManager = require('../scrapers/ProfileQueueManager');
      const originalRelease = ProfileQueueManager.releaseScrapingSlot.bind(ProfileQueueManager);
      
      ProfileQueueManager.releaseScrapingSlot = async (domain, scraperId, cacheData = null) => {
        const result = await originalRelease(domain, scraperId, cacheData);
        
        if (cacheData) {
          const jobsFound = this.extractJobCount(cacheData);
          MonitoringService.trackDomain(domain);
        }
        
        return result;
      };
      
      config.smartLog('win', 'ProfileQueueManager monitoring hooked');
    } catch (error) {
      config.smartLog('fail', `Failed to hook ProfileQueueManager: ${error.message}`);
    }
  }

  wrapBatchManager() {
    try {
      const IntelligentBatchManager = require('../utils/IntelligentBatchManager');
      const originalProcess = IntelligentBatchManager.processBatch.bind(IntelligentBatchManager);
      
      IntelligentBatchManager.processBatch = async (domains, options = {}) => {
        const batchId = this.generateBatchId();
        const startTime = Date.now();
        
        try {
          const result = await originalProcess(domains, options);
          
          const duration = Date.now() - startTime;
          const config = result.config || {};
          
          MonitoringService.trackBatch(batchId, domains, config, duration);
          
          return result;
          
        } catch (error) {
          const duration = Date.now() - startTime;
          MonitoringService.trackBatch(batchId, domains, { strategy: 'failed' }, duration);
          throw error;
        }
      };
      
      config.smartLog('win', 'IntelligentBatchManager monitoring hooked');
    } catch (error) {
      config.smartLog('fail', `Failed to hook IntelligentBatchManager: ${error.message}`);
    }
  }

  setupUserHooks() {
    this.wrapAuthMiddleware();
  }

  wrapAuthMiddleware() {
    try {
      const authMiddleware = require('../middleware/authMiddleware');
      
      if (authMiddleware.addUserToLocals) {
        const originalAddUser = authMiddleware.addUserToLocals;
        
        authMiddleware.addUserToLocals = (req, res, next) => {
          const result = originalAddUser(req, res, next);
          
          if (req.user) {
            const userId = req.user._id?.toString() || req.user.id?.toString();
            const plan = req.user.plan || 'free';
            
            if (userId) {
              MonitoringService.trackUser(userId, plan);
            }
          }
          
          return result;
        };
      }
      
      config.smartLog('win', 'Auth middleware monitoring hooked');
    } catch (error) {
      config.smartLog('fail', `Failed to hook auth middleware: ${error.message}`);
    }
  }

  setupSystemHooks() {
    this.setupResourceMonitoring();
    this.setupErrorTracking();
  }

  setupResourceMonitoring() {
    setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        if (memUsage.heapUsed > 1024 * 1024 * 1024) {
          config.smartLog('fail', `High memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        }
        
        if (global.gc && memUsage.heapUsed > 800 * 1024 * 1024) {
          global.gc();
          config.smartLog('buffer', 'Garbage collection triggered');
        }
        
      } catch (error) {
        config.smartLog('fail', `Resource monitoring error: ${error.message}`);
      }
    }, 30000);
  }

  setupErrorTracking() {
    process.on('uncaughtException', (error) => {
      config.smartLog('fail', `Uncaught Exception: ${error.message}`);
      MonitoringService.trackScrapingResult('system', 'uncaught-exception', 0, false, 'system');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      config.smartLog('fail', `Unhandled Rejection: ${reason}`);
      MonitoringService.trackScrapingResult('system', 'unhandled-rejection', 0, false, 'system');
    });
  }

  async getUserPlan(userId) {
    if (!userId || userId === 'anonymous') return 'free';
    
    try {
      const User = require('../models/User');
      const user = await User.findById(userId);
      return user?.plan || 'free';
    } catch (error) {
      return 'free';
    }
  }

  getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  extractJobCount(cacheData) {
    if (!cacheData) return 0;
    
    if (cacheData.links) return cacheData.links.length;
    if (cacheData.jobs) return cacheData.jobs.length;
    if (cacheData.jobsFound) return cacheData.jobsFound;
    
    return 0;
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createExpressMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const userId = req.user?._id?.toString() || 'anonymous';
        const method = req.method;
        const path = req.path;
        
        if (path.startsWith('/api/search-career-pages') || 
            path.startsWith('/api/search-cache-only')) {
          
          const domains = req.body?.urls || [];
          const jobTitles = req.body?.jobTitles || [];
          
          domains.forEach((url, index) => {
            const domain = this.getDomainFromUrl(url);
            const jobTitle = jobTitles[index] || jobTitles[0] || '';
            
            MonitoringService.trackRequest(userId, domain, jobTitle);
          });
        }
      });
      
      next();
    };
  }

  async getMonitoringStats() {
    const overview = MonitoringService.getSystemOverview();
    const systemHealth = await IntelligentCoordinator.getSystemHealth();
    
    return {
      integration: {
        initialized: this.initialized,
        activeRequests: this.requestTracking.size,
        hooks: {
          scrapingCoordinator: true,
          profileQueueManager: true,
          batchManager: true,
          authMiddleware: true
        }
      },
      monitoring: overview,
      system: systemHealth,
      timestamp: Date.now()
    };
  }

  async diagnostics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    return {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000),
        system: Math.round(cpuUsage.system / 1000)
      },
      uptime: Math.round(uptime),
      activeRequests: this.requestTracking.size,
      integration: this.initialized,
      timestamp: Date.now()
    };
  }

  async shutdown() {
    config.smartLog('buffer', 'MonitoringIntegration shutting down...');
    
    await MonitoringService.shutdown();
    
    this.requestTracking.clear();
    this.initialized = false;
    
    config.smartLog('win', 'MonitoringIntegration shutdown complete');
  }
}

module.exports = new MonitoringIntegration();