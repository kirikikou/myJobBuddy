const { sessionManager } = require('../sessionManager');

const loggingService = require('../services/LoggingService');
class ScrapingController {
  constructor(validationService, responseFormatterService, config) {
    this.validationService = validationService;
    this.responseFormatterService = responseFormatterService;
    this.config = config;
  }

  async batchScraping(req, res) {
    const requestId = this.validationService.generateRequestId();
    const { userId, userEmail } = this.validationService.extractUserInfo(req);
    
    try {
      const validatedRequest = this.validationService.validateBatchScrapingRequest(req.body);
      
      this.config.smartLog('batch', `Starting batch scraping: "${validatedRequest.searchQuery}" with ${validatedRequest.urls.length} URLs`);
      
      const responseData = {
        message: 'Batch scraping started',
        sessionStarted: true,
        userId: userId
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      
      const scrapingService = this.getScrapingService();
      scrapingService.scrapeMultipleCareerPages(
        userId, 
        userEmail, 
        validatedRequest.searchQuery, 
        validatedRequest.urls,
        validatedRequest.options,
        req
      ).then(result => {
        this.config.smartLog('batch', `Batch scraping completed, session ${result.sessionId}: ${result.successCount}/${result.totalUrls} successful`);
      }).catch(error => {
        this.config.smartLog('fail', `Batch scraping failed: ${error.message}`);
      });
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(400).json(errorResponse);
    }
  }

  async singleScraping(req, res) {
    const requestId = this.validationService.generateRequestId();
    const { userId, userEmail } = this.validationService.extractUserInfo(req);
    
    try {
      const { url, options = {} } = req.body;
      const validatedUrl = this.validationService.validateSingleUrl(url);
      
      this.config.smartLog('scraper', `Starting single URL scraping: ${validatedUrl}`);
      
      const coordinator = this.getCoordinator();
      const result = await coordinator.coordinatedScrape(validatedUrl, '', {
        userId,
        userEmail,
        forceRefresh: !options.useCache,
        ...this.validationService.sanitizeOptions(options)
      });
      
      const isSuccess = result.source !== 'buffered-error' && result.source !== 'queued';
      
      const responseData = {
        result: result,
        userId: userId,
        notificationReceived: result.source === 'cache-shared',
        fromBuffer: result.source === 'cache-shared'
      };
      
      if (isSuccess) {
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      } else {
        responseData.message = 'Request queued but failed';
        responseData.error = result.error || result.message;
        const response = this.responseFormatterService.formatSuccessResponse(responseData, requestId);
        response.success = false;
        res.json(response);
      }
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  async getSessions(req, res) {
    try {
      const { userId, userEmail } = req.query;
      let sessions = sessionManager.getAllActiveSessions();
      
      if (userId) {
        sessions = sessions.filter(session => 
          session.userId && session.userId.toLowerCase().includes(userId.toLowerCase())
        );
      }
      
      if (userEmail) {
        sessions = sessions.filter(session => 
          session.userEmail && session.userEmail.toLowerCase().includes(userEmail.toLowerCase())
        );
      }
      
      const responseData = {
        sessions: sessions.map(session => this.responseFormatterService.formatScrapingSessionResponse(session)),
        totalActive: sessions.length,
        stats: sessionManager.getSessionStats()
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error);
      res.status(500).json(errorResponse);
    }
  }

  async getSession(req, res) {
    try {
      const sessionId = req.params.sessionId;
      const session = sessionManager.getSessionInfo(sessionId);
      
      if (!session) {
        const error = this.validationService.createValidationError('Session not found', 'SESSION_NOT_FOUND');
        return res.status(404).json(this.responseFormatterService.formatErrorResponse(error));
      }
      
      const responseData = {
        session: this.responseFormatterService.formatScrapingSessionResponse(session)
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error);
      res.status(500).json(errorResponse);
    }
  }

  async stopSession(req, res) {
    try {
      const sessionId = req.params.sessionId;
      const session = sessionManager.endSession(sessionId, 'stopped_by_user');
      
      if (!session) {
        const error = this.validationService.createValidationError('Session not found', 'SESSION_NOT_FOUND');
        return res.status(404).json(this.responseFormatterService.formatErrorResponse(error));
      }
      
      const responseData = {
        message: 'Session stopped successfully',
        session: this.responseFormatterService.formatScrapingSessionResponse(session)
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error);
      res.status(500).json(errorResponse);
    }
  }

  async stopAllUserSessions(req, res) {
    try {
      const userId = req.params.userId;
      const stoppedCount = sessionManager.forceEndUserSessions(userId, 'stop_all_request');
      
      const responseData = {
        message: `Stopped ${stoppedCount} sessions for user ${userId}`,
        stoppedCount: stoppedCount
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error);
      res.status(500).json(errorResponse);
    }
  }

  async getUserSessions(req, res) {
    try {
      const userId = req.params.userId;
      const sessions = sessionManager.getSessionsByUser(userId);
      
      const responseData = {
        userId: userId,
        sessions: sessions.map(session => this.responseFormatterService.formatScrapingSessionResponse(session)),
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => s.status === 'running').length
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error);
      res.status(500).json(errorResponse);
    }
  }

  async getStats(req, res) {
    try {
      const coordinator = this.getCoordinator();
      const stats = await coordinator.getCoordinatorStats();
      
      const responseData = this.responseFormatterService.formatScrapingStatsResponse(stats);
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error);
      res.status(500).json(errorResponse);
    }
  }

  async detectLanguage(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const text = this.validationService.validateLanguageDetectionRequest(req.body);
      
      this.config.smartLog('langue', `Language detection requested for text length: ${text.length}`);
      
      const dictionaries = require('../dictionaries');
      const textLower = text.toLowerCase().trim();
      const supportedLanguages = dictionaries.getSupportedLanguages();
      
      let bestMatch = { lang: 'en', confidence: 0 };
      let detectedPatterns = [];
      
      for (const lang of supportedLanguages) {
        try {
          const langDict = dictionaries.getDictionaryForLanguage(lang);
          const jobTerms = langDict.getJobTerms();
          
          if (!jobTerms || jobTerms.length === 0) continue;
          
          const matches = jobTerms.filter(pattern => 
            textLower.includes(pattern.toLowerCase())
          );
          
          const matchCount = matches.length;
          const confidence = Math.min(matchCount / jobTerms.length * 100, 95);
          
          if (confidence > bestMatch.confidence) {
            bestMatch = { lang, confidence };
            detectedPatterns = matches;
          }
          
          this.config.smartLog('langue', `${lang}: ${matchCount}/${jobTerms.length} matches = ${Math.round(confidence)}% confidence`);
          
        } catch (error) {
          this.config.smartLog('langue', `Failed to load dictionary for ${lang}: ${error.message}`);
          continue;
        }
      }
      
      if (bestMatch.confidence === 0) {
        bestMatch = { lang: 'en', confidence: 50 };
        this.config.smartLog('langue', 'No patterns matched, defaulting to English');
      } else {
        this.config.smartLog('langue', `Best match: ${bestMatch.lang} (${Math.round(bestMatch.confidence)}% confidence)`);
      }
      
      const responseData = this.responseFormatterService.formatLanguageDetectionResponse(
        bestMatch.lang,
        bestMatch.confidence,
        detectedPatterns,
        supportedLanguages.length,
        textLower.length
      );
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  getCoordinator() {
    const ScrapingCoordinator = require('../scrapers/ScrapingCoordinator');
    return ScrapingCoordinator.getInstance();
  }

  getScrapingService() {
    return require('../scrapingService');
  }
}

module.exports = ScrapingController;