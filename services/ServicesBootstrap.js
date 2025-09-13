const SearchCacheService = require('./SearchCacheService');
const SearchCareerService = require('./SearchCareerService');
const JobMatchingService = require('./JobMatchingService');
const FileProcessingService = require('./FileProcessingService');
const ValidationService = require('./ValidationService');
const ResponseFormatterService = require('./ResponseFormatterService');

const SearchController = require('../controllers/SearchController');
const ScrapingController = require('../controllers/ScrapingController');
const FileController = require('../controllers/FileController');
const UserPreferencesController = require('../controllers/UserPreferencesController');
const PlatformController = require('../controllers/PlatformController');

class ServicesBootstrap {
  constructor(config, userPreferencesManager, dictionaries, planService) {
    this.config = config;
    this.userPreferencesManager = userPreferencesManager;
    this.dictionaries = dictionaries;
    this.planService = planService;
    
    this.services = {};
    this.controllers = {};
    
    this.initializeServices();
    this.initializeControllers();
  }

  initializeServices() {
    this.config.smartLog('service', 'Initializing services...');
    
    this.services.validationService = new ValidationService(this.config);
    this.config.smartLog('service', 'ValidationService initialized');
    
    this.services.responseFormatterService = new ResponseFormatterService(this.config);
    this.config.smartLog('service', 'ResponseFormatterService initialized');
    
    this.services.fileProcessingService = new FileProcessingService(this.config);
    this.config.smartLog('service', 'FileProcessingService initialized');
    
    this.services.jobMatchingService = new JobMatchingService(this.dictionaries, this.config);
    this.config.smartLog('service', 'JobMatchingService initialized');
    
    const cacheManager = this.getCacheManager();
    const domainProfiler = this.getDomainProfiler();
    
    this.services.searchCacheService = new SearchCacheService(
      cacheManager,
      domainProfiler,
      this.config
    );
    this.config.smartLog('service', 'SearchCacheService initialized');
    
    const scrapingCoordinator = this.getScrapingCoordinator();
    const scrapingService = this.getScrapingService();
    
    this.services.searchCareerService = new SearchCareerService(
      this.services.searchCacheService,
      this.services.jobMatchingService,
      scrapingCoordinator,
      scrapingService,
      this.config,
      this.userPreferencesManager
    );
    this.config.smartLog('service', 'SearchCareerService initialized');
    
    this.config.smartLog('win', 'All services initialized successfully');
  }

  initializeControllers() {
    this.config.smartLog('service', 'Initializing controllers...');
    
    this.controllers.searchController = new SearchController(
      this.services.searchCacheService,
      this.services.searchCareerService,
      this.services.jobMatchingService,
      this.services.validationService,
      this.services.responseFormatterService,
      this.config,
      this.userPreferencesManager
    );
    this.config.smartLog('service', 'SearchController initialized');
    
    this.controllers.scrapingController = new ScrapingController(
      this.services.validationService,
      this.services.responseFormatterService,
      this.config
    );
    this.config.smartLog('service', 'ScrapingController initialized');
    
    this.controllers.fileController = new FileController(
      this.services.fileProcessingService,
      this.services.validationService,
      this.services.responseFormatterService,
      this.config
    );
    this.config.smartLog('service', 'FileController initialized');
    
    this.controllers.userPreferencesController = new UserPreferencesController(
      this.userPreferencesManager,
      this.planService,
      this.services.validationService,
      this.services.responseFormatterService,
      this.config
    );
    this.config.smartLog('service', 'UserPreferencesController initialized');
    
    this.controllers.platformController = new PlatformController(
      this.services.validationService,
      this.services.responseFormatterService,
      this.config
    );
    this.config.smartLog('service', 'PlatformController initialized');
    
    this.config.smartLog('win', 'All controllers initialized successfully');
  }

  getService(serviceName) {
    const service = this.services[serviceName];
    if (!service) {
      throw new Error(`Service '${serviceName}' not found`);
    }
    return service;
  }

  getController(controllerName) {
    const controller = this.controllers[controllerName];
    if (!controller) {
      throw new Error(`Controller '${controllerName}' not found`);
    }
    return controller;
  }

  getAllServices() {
    return { ...this.services };
  }

  getAllControllers() {
    return { ...this.controllers };
  }

  getCacheManager() {
    try {
      return require('../cacheManager');
    } catch (error) {
      this.config.smartLog('fail', 'Failed to load cacheManager');
      return null;
    }
  }

  getDomainProfiler() {
    try {
      const DomainProfiler = require('../scrapers/DomainProfiler');
      return DomainProfiler.getInstance();
    } catch (error) {
      this.config.smartLog('fail', 'Failed to load DomainProfiler');
      return null;
    }
  }

  getScrapingCoordinator() {
    try {
      const ScrapingCoordinator = require('../scrapers/ScrapingCoordinator');
      return ScrapingCoordinator.getInstance();
    } catch (error) {
      this.config.smartLog('fail', 'Failed to load ScrapingCoordinator');
      return null;
    }
  }

  getScrapingService() {
    try {
      return require('../scrapingService');
    } catch (error) {
      this.config.smartLog('fail', 'Failed to load scrapingService');
      return null;
    }
  }

  static createBootstrap(config, userPreferencesManager, dictionaries, planService) {
    config.smartLog('service', 'Creating services bootstrap...');
    
    const bootstrap = new ServicesBootstrap(
      config,
      userPreferencesManager,
      dictionaries,
      planService
    );
    
    config.smartLog('win', 'Services bootstrap created successfully');
    return bootstrap;
  }

  validateDependencies() {
    const requiredServices = [
      'validationService',
      'responseFormatterService',
      'fileProcessingService',
      'jobMatchingService',
      'searchCacheService',
      'searchCareerService'
    ];
    
    const requiredControllers = [
      'searchController',
      'scrapingController',
      'fileController',
      'userPreferencesController',
      'platformController'
    ];
    
    const missingServices = requiredServices.filter(name => !this.services[name]);
    const missingControllers = requiredControllers.filter(name => !this.controllers[name]);
    
    if (missingServices.length > 0) {
      throw new Error(`Missing services: ${missingServices.join(', ')}`);
    }
    
    if (missingControllers.length > 0) {
      throw new Error(`Missing controllers: ${missingControllers.join(', ')}`);
    }
    
    this.config.smartLog('win', 'All dependencies validated successfully');
    return true;
  }

  getHealthStatus() {
    const serviceHealth = {};
    const controllerHealth = {};
    
    for (const [name, service] of Object.entries(this.services)) {
      serviceHealth[name] = {
        initialized: !!service,
        type: service.constructor.name
      };
    }
    
    for (const [name, controller] of Object.entries(this.controllers)) {
      controllerHealth[name] = {
        initialized: !!controller,
        type: controller.constructor.name
      };
    }
    
    return {
      services: serviceHealth,
      controllers: controllerHealth,
      totalServices: Object.keys(this.services).length,
      totalControllers: Object.keys(this.controllers).length,
      healthy: true,
      timestamp: new Date().toISOString()
    };
  }

  createErrorHandler() {
    return (error, req, res, next) => {
      const requestId = this.services.validationService.generateRequestId();
      
      this.config.smartLog('fail', `Unhandled error: ${error.message}`, {
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      const errorResponse = this.services.responseFormatterService.formatErrorResponse({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred',
        type: 'server_error'
      }, requestId);
      
      res.status(500).json(errorResponse);
    };
  }

  shutdown() {
    this.config.smartLog('service', 'Shutting down services bootstrap...');
    
    for (const [name, service] of Object.entries(this.services)) {
      if (service && typeof service.shutdown === 'function') {
        try {
          service.shutdown();
          this.config.smartLog('service', `${name} shutdown completed`);
        } catch (error) {
          this.config.smartLog('fail', `Error shutting down ${name}: ${error.message}`);
        }
      }
    }
    
    this.services = {};
    this.controllers = {};
    
    this.config.smartLog('win', 'Services bootstrap shutdown completed');
  }
}

module.exports = ServicesBootstrap;