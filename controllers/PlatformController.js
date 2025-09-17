const axios = require('axios');
const { normalize } = require('../dictionaries/core/platformNormalization');

class PlatformController {
  constructor(validationService, responseFormatterService, config) {
    this.validationService = validationService;
    this.responseFormatterService = responseFormatterService;
    this.config = config;
  }

  async detectATS(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const F = this.config.platforms;
      const url = req.query.url ? String(req.query.url).trim() : '';
      const fetchHtmlFlag = req.query.fetch === '1';
      
      this.config.smartLog('platform', `ATS detection requested: ${url}${fetchHtmlFlag ? ' (with HTML fetch)' : ''}`);
      
      if (!url) {
        const responseData = {
          ok: false,
          [F.platformField]: F.unknownCode,
          [F.vendorField]: F.unknownCode,
          [F.providerField]: F.unknownCode,
          [F.recommendedStepField]: 'http-simple',
          [F.stepField]: 'http-simple',
          confidence: 0,
          needsHeadless: false,
          [F.urlField]: '',
          meta: { detectedBy: 'none' },
          error: 'URL parameter is required'
        };
        
        return res.status(400).json(responseData);
      }
      
      let html = '';
      let detectedBy = 'url';
      let detectedPlatform = null;
      
      if (fetchHtmlFlag) {
        try {
          const userAgent = this.config.userAgents && this.config.userAgents.length > 0 ? 
            this.config.userAgents[Math.floor(Math.random() * this.config.userAgents.length)] : 
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
          
          const response = await axios.get(url, {
            timeout: this.config.timeouts.requestMs || 30000,
            headers: { 'User-Agent': userAgent }
          });
          
          html = response.data || '';
          if (html) {
            detectedBy = 'html';
          }
        } catch (fetchError) {
          this.config.smartLog('platform', `HTML fetch failed for ${url}: ${fetchError.message}`);
          html = '';
          detectedBy = 'url';
        }
      }
      
      const detector = this.getPlatformDetector();
      detectedPlatform = detector.detectPlatform(url, html);
      
      if (detectedPlatform && html && fetchHtmlFlag) {
        detectedBy = 'both';
      }
      
      if (!detectedPlatform) {
        detectedPlatform = F.allowCustom ? F.customCode : F.unknownCode;
      }
      
      const normalizedPlatform = normalize(detectedPlatform);
      const recommendedStep = detector.getRecommendedStep(normalizedPlatform) || 'http-simple';
      const needsHeadless = detector.requiresSpecialHandling(normalizedPlatform) || false;
      
      let confidence = 0.1;
      const isKnownPlatform = normalizedPlatform && 
        normalizedPlatform !== F.unknownCode && 
        normalizedPlatform !== F.customCode;
      
      if (isKnownPlatform) {
        switch (detectedBy) {
          case 'both': confidence = 0.98; break;
          case 'url': confidence = 0.95; break;
          case 'html': confidence = 0.85; break;
          default: confidence = 0.95; break;
        }
      } else {
        confidence = (detectedBy === 'html' && html) ? 0.2 : 0.1;
      }
      
      this.config.smartLog('platform', `ATS detection result: ${normalizedPlatform} via ${detectedBy} (confidence: ${confidence}, step: ${recommendedStep})`);
      
      const responseData = {
        ok: true,
        [F.platformField]: normalizedPlatform,
        [F.vendorField]: normalizedPlatform,
        [F.providerField]: normalizedPlatform,
        [F.recommendedStepField]: recommendedStep,
        [F.stepField]: recommendedStep,
        confidence: confidence,
        needsHeadless: needsHeadless,
        [F.urlField]: url,
        meta: { detectedBy: detectedBy }
      };
      
      res.json(responseData);
      
    } catch (error) {
      this.config.smartLog('platform', `ATS detection error: ${error.message}`);
      
      const F = this.config.platforms;
      const responseData = {
        ok: false,
        error: 'Internal server error',
        [F.platformField]: F.unknownCode,
        [F.vendorField]: F.unknownCode,
        [F.providerField]: F.unknownCode,
        [F.recommendedStepField]: 'http-simple',
        [F.stepField]: 'http-simple',
        confidence: 0,
        needsHeadless: false,
        [F.urlField]: req.query.url || '',
        meta: { detectedBy: 'error' }
      };
      
      res.status(500).json(responseData);
    }
  }

  async getDomainProfiles(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const { limit = 100 } = req.query;
      
      const profiler = this.getDomainProfiler();
      await profiler.loadCurrentProfiles();
      const profiles = [];
      
      for (const [domain, profile] of profiler.currentProfiles.entries()) {
        profiles.push({
          domain: domain,
          step: profile.step || 'unknown',
          language: profile.language || 'en',
          platform: profile.platform || 'unknown',
          successRate: profile.successRate || 0,
          attempts: profile.attempts || 0,
          lastSeen: profile.lastSeen || null,
          headless: profile.headless || false,
          fastTrackEligible: profile.successRate >= 70 && profile.step
        });
        
        if (profiles.length >= parseInt(limit)) break;
      }
      
      const responseData = this.responseFormatterService.formatDomainProfilesResponse(
        profiles, 
        profiler.currentProfiles.size
      );
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  async simulateScrape(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const { url, step, forceStep } = req.body;
      
      if (!url) {
        const error = this.validationService.createValidationError('URL parameter required');
        return res.status(400).json(this.responseFormatterService.formatErrorResponse(error, requestId));
      }
      
      let stepUsed = 'http';
      let escalations = 0;
      
      if (forceStep) {
        stepUsed = forceStep;
      } else if (step) {
        stepUsed = step;
      } else {
        const urlLower = url.toLowerCase();
        if (urlLower.includes('workday') || urlLower.includes('greenhouse')) {
          stepUsed = 'chromium';
          escalations = 1;
        } else if (urlLower.includes('lever') || urlLower.includes('bamboohr')) {
          stepUsed = 'headless';
          escalations = 2;
        } else if (urlLower.includes('smartrecruiters') || urlLower.includes('icims')) {
          stepUsed = 'ocr';
          escalations = 3;
        }
      }
      
      const responseData = {
        ok: true,
        stepUsed,
        escalations,
        url,
        processingTime: Math.floor(Math.random() * 2000) + 500
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(500).json(errorResponse);
    }
  }

  async filterJobs(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const validatedRequest = this.validationService.validateJobFilterRequest(req.body);
      const { jobs, query } = validatedRequest;
      const { include = [], location, remote } = query;
      
      const matches = [];
      
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        let score = 0;
        
        if (include.length > 0) {
          const titleLower = (job.title || '').toLowerCase();
          const descLower = (job.description || '').toLowerCase();
          
          for (const keyword of include) {
            const keywordLower = keyword.toLowerCase();
            if (titleLower.includes(keywordLower)) score += 50;
            if (descLower.includes(keywordLower)) score += 25;
          }
        }
        
        if (location) {
          const jobLocation = (job.location || '').toLowerCase();
          if (jobLocation.includes(location.toLowerCase())) score += 30;
        }
        
        if (remote !== undefined) {
          const isRemote = (job.remote === true) || (job.location && job.location.toLowerCase().includes('remote'));
          if (remote === isRemote) score += 20;
        }
        
        if (score > 0) {
          matches.push({
            id: i,
            score,
            title: job.title || 'Unknown Title',
            location: job.location,
            remote: job.remote,
            description: job.description
          });
        }
      }
      
      const responseData = this.responseFormatterService.formatJobFilterResponse(matches, jobs.length);
      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(400).json(errorResponse);
    }
  }

  async debugTimeout(req, res) {
    const requestId = this.validationService.generateRequestId();
    
    try {
      const ms = this.validationService.validateTimeout(req.query.ms);
      
      await new Promise(resolve => setTimeout(resolve, ms));
      
      const responseData = {
        ok: true,
        waited: ms,
        timestamp: Date.now()
      };
      
      res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
      
    } catch (error) {
      const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
      res.status(400).json(errorResponse);
    }
  }

  getPlatformDetector() {
    const PlatformDetector = require('../scrapers/platformDetector');
    return PlatformDetector;
  }

  getDomainProfiler() {
    const DomainProfiler = require('../scrapers/DomainProfiler');
    return DomainProfiler.getInstance();
  }
}

module.exports = PlatformController;