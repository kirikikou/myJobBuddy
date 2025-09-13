const { 
    normalizeStructure, 
    deepMergeSafe, 
    detectChanges, 
    createChangeSnapshot 
  } = require('../utils/normalizers/preferencesNormalizer');
  
  class UserPreferencesController {
    constructor(userPreferencesManager, planService, validationService, responseFormatterService, config) {
      this.userPreferencesManager = userPreferencesManager;
      this.planService = planService;
      this.validationService = validationService;
      this.responseFormatterService = responseFormatterService;
      this.config = config;
    }
  
    async getUserPreferences(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const userId = req.user._id.toString();
        const apiContext = this.config.createApiContext(req);
        const logger = this.config.getContextualLogger(req.sessionID, apiContext);
        
        logger.info('Loading user preferences with plan enrichment');
        
        let rawPreferences = null;
        try {
          rawPreferences = await this.userPreferencesManager.getUserPreferences(userId);
        } catch (error) {
          this.config.smartLog('buffer', `Failed to load raw preferences for ${userId}: ${error.message}`);
        }
        
        const normalizedPreferences = normalizeStructure(rawPreferences);
        const enrichedPreferences = await this.planService.enrichPreferencesWithPlan(normalizedPreferences, req.user);
        
        const responseData = {
          preferences: enrichedPreferences,
          fromDefaults: !rawPreferences,
          message: rawPreferences ? 'User preferences loaded successfully' : 'Normalized preferences with effective plan'
        };
        
        if (!rawPreferences) {
          this.config.smartLog('buffer', `Using normalized template for ${userId} - no existing data`);
          logger.info('Using normalized template - no existing data');
        } else {
          this.config.smartLog('win', `Preferences loaded, normalized and plan-enriched for ${userId}`);
          logger.info('User preferences loaded, normalized and plan-enriched successfully');
        }
        
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
        
      } catch (error) {
        const apiContext = this.config.createApiContext(req);
        const logger = this.config.getContextualLogger(req.sessionID, apiContext);
        this.config.smartLog('fail', `Error in get-user-preferences: ${error.message}`);
        logger.error('Error loading user preferences', {error: error.message});
        
        const defaultPrefs = normalizeStructure(null);
        const enrichedDefaults = await this.planService.enrichPreferencesWithPlan(defaultPrefs, req.user || {});
        
        const responseData = {
          preferences: enrichedDefaults,
          fromDefaults: true,
          error: 'Failed to load preferences, using normalized defaults'
        };
        
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      }
    }
  
    async saveUserPreferences(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const userId = req.user._id.toString();
        const apiContext = this.config.createApiContext(req);
        const logger = this.config.getContextualLogger(req.sessionID, apiContext);
        
        const sanitizedClientData = this.planService.stripPlanFromClientData(req.body);
        
        if (sanitizedClientData.jobSearchData) {
          delete sanitizedClientData.jobSearchData.allHistoricalResults;
          delete sanitizedClientData.jobSearchData.totalOffersScraped;
        }
        
        let currentPreferences;
        try {
          currentPreferences = await this.userPreferencesManager.getUserPreferences(userId);
          if (!currentPreferences) {
            currentPreferences = await this.userPreferencesManager.ensureUserPreferences(userId);
          }
        } catch (error) {
          logger.error('Error getting current preferences for merge', {error: error.message});
          currentPreferences = await this.userPreferencesManager.ensureUserPreferences(userId);
        }
        
        const normalizedCurrent = normalizeStructure(currentPreferences);
        const mergedPreferences = deepMergeSafe(normalizedCurrent, sanitizedClientData);
        
        mergedPreferences.userId = userId;
        mergedPreferences.email = req.user.email;
        mergedPreferences.lastUsed = new Date().toISOString();
        
        const hasChanges = detectChanges(normalizedCurrent, mergedPreferences);
        
        if (!hasChanges) {
          this.config.smartLog('cache', `No changes detected for ${userId}, skipping save`);
          logger.info('No changes detected, skipping save');
          return res.status(204).end();
        }
        
        const finalPreferences = await this.planService.enrichPreferencesWithPlan(mergedPreferences, req.user);
        const saved = await this.userPreferencesManager.saveUserPreferences(userId, finalPreferences);
        
        if (saved) {
          this.config.smartLog('win', `Preferences safely merged and saved for ${userId}`);
          logger.info('User preferences safely merged and saved');
          
          const updatedPrefs = await this.userPreferencesManager.getUserPreferences(userId);
          const enrichedUpdated = await this.planService.enrichPreferencesWithPlan(updatedPrefs, req.user);
          
          const responseData = {
            message: 'User preferences safely merged and saved',
            preferences: enrichedUpdated,
            hasChanges: true
          };
          
          res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
        } else {
          this.config.smartLog('fail', `Failed to save preferences for ${userId}`);
          logger.error('Failed to save user preferences');
          
          const error = this.validationService.createValidationError('Failed to save user preferences', 'SAVE_FAILED');
          const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
          res.status(500).json(errorResponse);
        }
        
      } catch (error) {
        const apiContext = this.config.createApiContext(req);
        const logger = this.config.getContextualLogger(req.sessionID, apiContext);
        this.config.smartLog('fail', `Error in save-user-preferences: ${error.message}`);
        logger.error('Error saving user preferences', {error: error.message});
        
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(500).json(errorResponse);
      }
    }
  
    async verifyUserData(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const userId = req.user._id.toString();
        const preferences = await this.userPreferencesManager.getUserPreferences(userId);
        
        const verification = {
          hasCareerPageLists: !!(preferences.careerPageLists && Object.keys(preferences.careerPageLists).length > 0),
          hasCompanies: !!(preferences.companies && Object.keys(preferences.companies).length > 0),
          subscription: preferences.subscription?.plan || 'unknown',
          jobTitlesCount: (preferences.jobTitles || []).length,
          careerPageListsCount: {
            listA: (preferences.careerPageLists?.listA || []).length,
            listB: (preferences.careerPageLists?.listB || []).length,
            listC: (preferences.careerPageLists?.listC || []).length,
            listD: (preferences.careerPageLists?.listD || []).length,
            listE: (preferences.careerPageLists?.listE || []).length
          },
          companiesCount: Object.keys(preferences.companies || {}).length
        };
        
        this.config.smartLog('buffer', `Data verification for ${userId}:`, verification);
        
        const responseData = {
          verification,
          preferences
        };
        
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
        
      } catch (error) {
        this.config.smartLog('fail', `Error verifying user data: ${error.message}`);
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(500).json(errorResponse);
      }
    }
  
    async exportUserData(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const userId = req.user._id.toString();
        const { format = 'json', includeHistory = false } = req.query;
        
        const preferences = await this.userPreferencesManager.getUserPreferences(userId);
        
        if (!preferences) {
          const error = this.validationService.createValidationError('No user data found to export', 'NO_DATA');
          return res.status(404).json(this.responseFormatterService.formatErrorResponse(error, requestId));
        }
        
        let exportData = { ...preferences };
        
        if (!includeHistory) {
          if (exportData.jobSearchData) {
            delete exportData.jobSearchData.allHistoricalResults;
          }
        }
        
        delete exportData.userId;
        delete exportData.email;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `user_data_${userId.substring(0, 8)}_${timestamp}.${format}`;
        
        let contentType, processedData;
        
        switch (format.toLowerCase()) {
          case 'json':
            contentType = 'application/json';
            processedData = JSON.stringify(exportData, null, 2);
            break;
          case 'csv':
            contentType = 'text/csv';
            processedData = this.convertPreferencesToCSV(exportData);
            break;
          default:
            throw this.validationService.createValidationError('Unsupported format. Use json or csv');
        }
        
        res.set({
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': Buffer.byteLength(processedData, 'utf8')
        });
        
        this.config.smartLog('win', `User data exported for ${userId}: ${filename}`);
        res.send(processedData);
        
      } catch (error) {
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(500).json(errorResponse);
      }
    }
  
    async importUserData(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const userId = req.user._id.toString();
        
        if (!req.file) {
          throw this.validationService.createValidationError('No file provided for import');
        }
        
        const fileContent = req.file.buffer.toString('utf8');
        let importedData;
        
        try {
          importedData = JSON.parse(fileContent);
        } catch (parseError) {
          throw this.validationService.createValidationError('Invalid JSON format in uploaded file');
        }
        
        const sanitizedData = this.planService.stripPlanFromClientData(importedData);
        
        const currentPreferences = await this.userPreferencesManager.getUserPreferences(userId);
        const normalizedCurrent = normalizeStructure(currentPreferences);
        const mergedPreferences = deepMergeSafe(normalizedCurrent, sanitizedData);
        
        mergedPreferences.userId = userId;
        mergedPreferences.email = req.user.email;
        mergedPreferences.lastUsed = new Date().toISOString();
        
        const finalPreferences = await this.planService.enrichPreferencesWithPlan(mergedPreferences, req.user);
        const saved = await this.userPreferencesManager.saveUserPreferences(userId, finalPreferences);
        
        if (!saved) {
          throw this.validationService.createValidationError('Failed to save imported data', 'IMPORT_FAILED');
        }
        
        const responseData = {
          message: 'User data imported successfully',
          originalFilename: req.file.originalname,
          importedKeys: Object.keys(sanitizedData),
          merged: true
        };
        
        this.config.smartLog('win', `User data imported for ${userId}: ${req.file.originalname}`);
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
        
      } catch (error) {
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(400).json(errorResponse);
      }
    }
  
    convertPreferencesToCSV(preferences) {
      const rows = [];
      
      const flattenObject = (obj, prefix = '') => {
        const result = [];
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              result.push(...flattenObject(value, newKey));
            } else {
              result.push({
                key: newKey,
                value: Array.isArray(value) ? value.join(';') : value,
                type: Array.isArray(value) ? 'array' : typeof value
              });
            }
          }
        }
        return result;
      };
      
      const flattenedData = flattenObject(preferences);
      
      rows.push('key,value,type');
      
      for (const item of flattenedData) {
        const escapedValue = typeof item.value === 'string' && item.value.includes(',') ? 
          `"${item.value.replace(/"/g, '""')}"` : item.value;
        rows.push(`${item.key},${escapedValue},${item.type}`);
      }
      
      return rows.join('\n');
    }
  }
  
  module.exports = UserPreferencesController;