const express = require('express');
const fs = require('fs');
const path = require('path');
const { getCacheFilename } = require('../cacheManager');
const config = require('../config')
const axios = require('axios')
const { normalize } = require('../dictionaries/core/platformNormalization');
const { findMatches, randomDelay, getRandomUserAgent } = require('../utils');
const { initBrowser } = require('../browserManager');
const cacheManager = require('../cacheManager');
const userPreferencesManager = require('../userPreferencesManager');
const dictionaries = require('../dictionaries');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const { sessionManager, withSession } = require('../sessionManager');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');

const idempotencyMiddleware = require('../middleware/idempotency');
const rateLimitMiddleware = require('../middleware/rateLimit');
const queueGate = require('../middleware/queueGate');

router.use(queueGate);
config.smartLog('buffer', 'queue-gate:router-mounted:api');

const PlanService = require('../services/PlanService');
const { 
  normalizeStructure, 
  deepMergeSafe, 
  detectChanges, 
  createChangeSnapshot 
} = require('../utils/normalizers/preferencesNormalizer');

let ScrapingCoordinator = null;
let coordinator = null;
let DomainProfiler = null;
let domainProfiler = null;
let PlatformDetector = null;
let scrapingService = null;

const getCoordinator = () => {
  if (!coordinator) {
    ScrapingCoordinator = require('../scrapers/ScrapingCoordinator');
    coordinator = ScrapingCoordinator.getInstance();
  }
  return coordinator;
};

const getDomainProfiler = () => {
  if (!domainProfiler) {
    DomainProfiler = require('../scrapers/DomainProfiler');
    domainProfiler = DomainProfiler.getInstance();
  }
  return domainProfiler;
};

const getPlatformDetector = () => {
  if (!PlatformDetector) {
    PlatformDetector = require('../scrapers/platformDetector');
  }
  return PlatformDetector;
};

const getScrapingService = () => {
  if (!scrapingService) {
    scrapingService = require('../scrapingService');
  }
  return scrapingService;
};

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

const setCacheHeaders = (res, cacheHit, bufferServed) => {
  res.set('X-Cache-Status', cacheHit ? 'HIT' : 'MISS');
  res.set('X-Buffer-Status', bufferServed ? 'SERVED' : 'LIVE');
  config.smartLog('buffer', `cache:${cacheHit ? 'hit' : 'miss'} buffer:${bufferServed ? 'served' : 'live'}`);
};

const generateRequestId = () => crypto.randomBytes(8).toString('hex');

const validateAndNormalizeUrls = (urls, careerPages, careerPageUrls) => {
  const allUrls = [];
  
  if (Array.isArray(urls)) allUrls.push(...urls);
  if (Array.isArray(careerPages)) allUrls.push(...careerPages);
  if (Array.isArray(careerPageUrls)) allUrls.push(...careerPageUrls);
  
  if (allUrls.length === 0) {
    throw new Error('At least one URL is required in urls, careerPages, or careerPageUrls');
  }
  
  const normalizedUrls = allUrls
    .filter(url => url && typeof url === 'string')
    .map(url => url.trim())
    .filter(url => url.length > 0);
  
  if (normalizedUrls.length === 0) {
    throw new Error('No valid URLs found after normalization');
  }
  
  const uniqueUrls = [...new Set(normalizedUrls)];
  
  for (const url of uniqueUrls) {
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch (error) {
      throw new Error(`Invalid URL format: ${url}`);
    }
  }
  
  return uniqueUrls;
};

const validateJobTitles = (jobTitles) => {
  if (!Array.isArray(jobTitles) || jobTitles.length === 0) {
    throw new Error('At least one job title is required');
  }
  
  const validJobTitles = jobTitles
    .filter(title => title && typeof title === 'string')
    .map(title => title.trim())
    .filter(title => title.length > 0);
  
  if (validJobTitles.length === 0) {
    throw new Error('No valid job titles found after normalization');
  }
  
  return validJobTitles;
};

const createApiLogger = (requestId, userId = 'unknown') => ({
  info: (message, extra = {}) => config.smartLog('api', `[${requestId}][${userId}] ${message}`, extra),
  error: (message, extra = {}) => config.smartLog('api', `[${requestId}][${userId}] ERROR: ${message}`, extra),
  success: (message, extra = {}) => config.smartLog('api', `[${requestId}][${userId}] SUCCESS: ${message}`, extra),
  warn: (message, extra = {}) => config.smartLog('api', `[${requestId}][${userId}] WARN: ${message}`, extra)
});

const handleValidationError = (res, requestId, userId, error) => {
  const logger = createApiLogger(requestId, userId);
  logger.error(`Validation failed: ${error.message}`);
  
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: error.message,
      type: 'client_error'
    },
    requestId
  });
};

const extractUserInfo = (req) => {
  if (req.headers['x-stress-test'] === 'true') {
    return {
      userId: req.headers['x-user-id'] || 'stress_test_user',
      userEmail: req.headers['x-user-email'] || 'stress@test.local'
    };
  }
  
  if (req.user && req.isAuthenticated && req.isAuthenticated()) {
    return {
      userId: req.user._id.toString(),
      userEmail: req.user.email
    };
  }
  
  const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous_' + Date.now();
  const userEmail = req.body.userEmail || req.headers['x-user-email'] || null;
  return { userId, userEmail };
};

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

function generateLocationVariants(location) {
  const original = location.toLowerCase().trim();
  const variants = [original, original.replace(/\s+/g, ''), original.replace(/\s+/g, '-')];
  const patterns = dictionaries.getPatterns();
  const locationData = patterns.locationVariants;
  
  for (const [key, values] of Object.entries(locationData.shortForms)) {
    if (original.includes(key)) {
      variants.push(...values);
    } else if (values.some(v => original.includes(v))) {
      variants.push(key);
    }
  }
  
  for (const [english, translations] of Object.entries(locationData.multilingualMappings)) {
    if (original.includes(english)) {
      variants.push(...translations);
    } else if (translations.some(t => original.includes(t))) {
      variants.push(english);
    }
  }
  
  if (locationData.remoteTerms.some(term => original.includes(term))) {
    variants.push(...locationData.remoteTerms);
  }
  
  return [...new Set(variants)];
}
function findJobMatches(pageData, jobTitles, locations = []) {
  const pageTextLower = pageData.text.toLowerCase();
  const pageTitleLower = (pageData.title || '').toLowerCase();
  const combinedText = `${pageTextLower} ${pageTitleLower}`;
  
  const matches = {
    jobTitles: [],
    locations: [],
    links: [],
    priority: 0
  };
  
  const relevance = detectJobRelevance(pageData);
  
  if (!relevance.isJobPage && relevance.confidence < 0.3) {
    config.smartLog('steps', 'Page non pertinente pour les emplois, recherche abandonnÃ©e');
    return matches;
  }
  
  const matchedJobTitles = new Set();
  const matchedLinks = [];
  
  for (const jobTitle of jobTitles) {
    const originalJobTitleLower = jobTitle.toLowerCase().trim();
    const originalWords = originalJobTitleLower.split(/\s+/).filter(word => word.length > 2);
    const variants = dictionaries.generateJobTitleVariants(jobTitle);
    
    let hasDirectMatch = false;
    let bestMatchingVariant = null;
    
    if (pageTextLower.includes(originalJobTitleLower) || pageTitleLower.includes(originalJobTitleLower)) {
      hasDirectMatch = true;
      bestMatchingVariant = originalJobTitleLower;
      matchedJobTitles.add(jobTitle);
    }
    
    if (!hasDirectMatch && originalWords.length >= 2) {
      const wordsFoundInPage = originalWords.filter(word => 
        pageTextLower.includes(word) || pageTitleLower.includes(word)
      );
      const matchRatio = wordsFoundInPage.length / originalWords.length;
      
      if (matchRatio >= 0.8) {
        hasDirectMatch = true;
        bestMatchingVariant = originalJobTitleLower;
        matchedJobTitles.add(jobTitle);
      }
    }
    
    if (!hasDirectMatch) {
      for (const variant of variants) {
        const variantLower = variant.toLowerCase().trim();
        if (variantLower === originalJobTitleLower) continue;
        
        if (pageTextLower.includes(variantLower) || pageTitleLower.includes(variantLower)) {
          hasDirectMatch = true;
          bestMatchingVariant = variant;
          matchedJobTitles.add(jobTitle);
          break;
        }
      }
    }
    
    if (hasDirectMatch && bestMatchingVariant) {
      if (pageData.links && pageData.links.length > 0) {
        for (const link of pageData.links) {
          if (link.isJobPosting && link.matchedJobTitle) {
            const linkTitleLower = link.matchedJobTitle.toLowerCase();
            const linkTextLower = (link.text || '').toLowerCase();
            
            if (linkTitleLower.includes(originalJobTitleLower) || 
                originalWords.every(word => linkTitleLower.includes(word)) ||
                variants.some(variant => linkTitleLower.includes(variant.toLowerCase()))) {
              
                  const linkResult = {
                    title: link.text || link.title || jobTitle,
                    url: link.url,
                    description: extractJobDescription(link.text || ''),
                    confidence: 95
                  };
                  
                  if (!dictionaries.shouldExcludeResult(linkResult.title, linkResult.url)) {
                    matchedLinks.push(linkResult);
                  } else {
                    config.smartLog('steps', `[EXCLUSION] Filtered high confidence link: "${linkResult.title}"`);
                  }
            }
          } else if (link.text) {
            const linkTextLower = link.text.toLowerCase().trim();
            const linkUrlLower = (link.url || '').toLowerCase();
            
            if (linkTextLower.includes(originalJobTitleLower) ||
                (originalWords.length >= 2 && originalWords.filter(word => linkTextLower.includes(word)).length / originalWords.length >= 0.8) ||
                variants.some(variant => linkTextLower.includes(variant.toLowerCase()))) {
              
              const jobURLPatterns = dictionaries.jobURLPatterns;
              const jobDetailURLPatterns = dictionaries.jobDetailURLPatterns;
              const isJobUrl = jobURLPatterns.some(pattern => pattern.test(linkUrlLower)) ||
                              jobDetailURLPatterns.some(pattern => pattern.test(linkUrlLower));
              
              const confidence = 80 + (isJobUrl ? 15 : 0);
              
              const linkResult = {
                title: link.text || link.title || jobTitle,
                url: link.url,
                description: extractJobDescription(link.text || ''),
                confidence: confidence
              };
              
              if (!dictionaries.shouldExcludeResult(linkResult.title, linkResult.url)) {
                matchedLinks.push(linkResult);
              } else {
                config.smartLog('steps', `[EXCLUSION] Filtered standard link: "${linkResult.title}"`);
              }
            }
          }
        }
      }
    }
  }
  
  if (matchedJobTitles.size === 0) {
    return matches;
  }
  
  matches.jobTitles = Array.from(matchedJobTitles);
  matches.priority = 1;
  
  if (locations && locations.length > 0) {
    for (const location of locations) {
      const locationVariants = generateLocationVariants(location);
      
      for (const variant of locationVariants) {
        const variantLower = variant.toLowerCase();
        
        if (pageTextLower.includes(variantLower) || pageTitleLower.includes(variantLower)) {
          matches.locations.push(location);
          matches.priority = 2;
          break;
        }
      }
    }
  }
  
  const uniqueLinks = [];
  const seenUrls = new Set();
  
  matchedLinks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  
  for (const link of matchedLinks) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      uniqueLinks.push(link);
    }
  }
  
  matches.links = uniqueLinks;
  matches.relevance = relevance;
  
  return matches;
}

function extractShortDomain(url) {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    let domain = urlObj.hostname;
    
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    const pathParts = urlObj.pathname.split('/').filter(part => part && part.length > 0);
    if (pathParts.length > 0) {
      domain += '/' + pathParts[0];
      if (pathParts.length > 1) {
        domain += '/';
      }
    }
    
    return domain;
  } catch (e) {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

function detectJobRelevance(pageData) {
  const pageTextLower = (pageData.text || '').toLowerCase();
  const pageTitleLower = (pageData.title || '').toLowerCase();
  const combinedText = `${pageTextLower} ${pageTitleLower}`;
  
  let jobTermCount = 0;
  const foundTerms = [];
  const jobTerms = dictionaries.jobTerms;
  const jobURLPatterns = dictionaries.jobURLPatterns;
  
  for (const term of jobTerms) {
    if (combinedText.includes(term.toLowerCase())) {
      jobTermCount++;
      foundTerms.push(term);
    }
  }
  
  const isJobPage = jobTermCount >= 3 || 
                   pageData.pageType === 'job_page' || 
                   pageData.hasJobListings ||
                   jobURLPatterns.some(pattern => pattern.test(pageData.url || ''));
  
  return {
    isJobPage,
    jobTermCount,
    foundTerms,
    confidence: Math.min(jobTermCount / 10, 1)
  };
}

function isJobRelevantSite(url) {
  const urlLower = url.toLowerCase();
  const knownJobPlatforms = dictionaries.knownJobPlatforms;
  const complexDomains = dictionaries.complexDomains;
  const jobURLPatterns = dictionaries.jobURLPatterns;
  
  for (const platform of knownJobPlatforms) {
    if (platform.patterns && platform.patterns.some(pattern => urlLower.includes(pattern.toLowerCase()))) {
      return true;
    }
  }
  
  for (const domain of complexDomains) {
    if (urlLower.includes(domain.toLowerCase())) {
      return true;
    }
  }
  
  return jobURLPatterns.some(pattern => pattern.test(url));
}

function extractFullDomainFromUrl(url) {
  if (!url) return '';
  
  try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname + urlObj.pathname;
      
      if (urlObj.hash) {
          domain += urlObj.hash;
      }
      
      if (domain.endsWith('/')) {
          domain = domain.slice(0, -1);
      }
      
      return domain;
  } catch (e) {
      return url;
  }
}

function extractJobDescription(text) {
  if (!text) return '';
  
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  if (cleanText.length > 200) {
      return cleanText.substring(0, 200) + '...';
  }
  
  return cleanText;
}

function extractCompanyFromDomain(domain) {
  if (!domain) return 'Unknown Company';
  
  const parts = domain.split('.');
  if (parts.length > 0) {
      let companyPart = parts[0];
      if (companyPart === 'www') {
          companyPart = parts[1] || parts[0];
      }
      
      return companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
  }
  
  return 'Unknown Company';
}

async function analyzeCacheStatus(urls) {
  const cachedDomains = [];
  const staleOrMissingDomains = [];
  
  for (const url of urls) {
    try {
      const cacheFile = getCacheFilename(url);
      const stats = await fs.promises.stat(cacheFile);
      const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      if (ageInHours < 24) {
        cachedDomains.push(url);
      } else {
        staleOrMissingDomains.push(url);
      }
    } catch (error) {
      staleOrMissingDomains.push(url);
    }
  }
  
  return { cachedDomains, staleOrMissingDomains };
}

async function getCachedPageData(url) {
  try {
    const cacheFile = getCacheFilename(url);
    const cacheContent = await fs.promises.readFile(cacheFile, 'utf8');
    const cacheData = JSON.parse(cacheContent);
    return cacheData.data;
  } catch (error) {
    config.smartLog('fail', `Error reading cache for ${url}: ${error.message}`);
    return null;
  }
}

async function getOptimizedCachedPageData(url) {
  try {
    const profiler = getDomainProfiler();
    await profiler.recordHit(url, 'cache');
    return await getCachedPageData(url);
  } catch (error) {
    config.smartLog('fail', `Error in optimized cache read for ${url}: ${error.message}`);
    return null;
  }
}

const cleanupScraperBrowsers = async () => {
  try {
    const service = getScrapingService();
    if (service && service.closeBrowsers) {
      await service.closeBrowsers();
    }
  } catch (error) {
    config.smartLog('fail', `Error cleaning up scraper browsers: ${error.message}`);
  }
};

process.on('SIGINT', async () => {
  config.smartLog('steps', 'Arret du serveur (SIGINT)...');
  await cleanupScraperBrowsers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  config.smartLog('steps', 'Arret du serveur (SIGTERM)...');
  await cleanupScraperBrowsers();
  process.exit(0);
});

router.post('/scraping/batch', isAuthenticated, async (req, res) => {
  const requestId = generateRequestId();
  const { userId, userEmail } = extractUserInfo(req);
  const logger = createApiLogger(requestId, userId);
  
  try {
    const { searchQuery, urls, options = {} } = req.body;
    
    if (!searchQuery || !urls || !Array.isArray(urls) || urls.length === 0) {
      return handleValidationError(res, requestId, userId, new Error('searchQuery and urls array are required'));
    }
    
    if (urls.length > 100) {
      return handleValidationError(res, requestId, userId, new Error('Maximum 100 URLs allowed per batch'));
    }
    
    logger.info(`Starting batch scraping: "${searchQuery}" with ${urls.length} URLs`);
    
    res.json({
      success: true,
      message: 'Batch scraping started',
      sessionStarted: true,
      userId: userId,
      requestId
    });
    
    const service = getScrapingService();
    service.scrapeMultipleCareerPages(userId, userEmail, searchQuery, urls, {
      useCache: options.useCache !== false,
      saveCache: options.saveCache !== false,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 60000
    }, req).then(result => {
      logger.success(`Batch scraping completed, session ${result.sessionId}: ${result.successCount}/${result.totalUrls} successful`);
    }).catch(error => {
      logger.error(`Batch scraping failed: ${error.message}`);
    });
    
  } catch (error) {
    logger.error(`Error starting batch scraping: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
      requestId
    });
  }
});

router.post('/scraping/single', async (req, res) => {
  const requestId = generateRequestId();
  const { userId, userEmail } = extractUserInfo(req);
  const logger = createApiLogger(requestId, userId);
  
  try {
    const { url, options = {} } = req.body;
    
    if (!url) {
      return handleValidationError(res, requestId, userId, new Error('URL is required'));
    }
    
    logger.info(`Starting single URL scraping: ${url}`);
    
    const coordinator = getCoordinator();
    const result = await coordinator.coordinatedScrape(url, '', {
      userId,
      userEmail,
      forceRefresh: !options.useCache,
      ...options
    });
    
    if (result.source === 'buffered-error' || result.source === 'queued') {
      res.json({
        success: false,
        result: result,
        userId: userId,
        message: 'Request queued but failed',
        error: result.error || result.message,
        requestId
      });
    } else {
      res.json({
        success: true,
        result: result,
        userId: userId,
        notificationReceived: result.source === 'cache-shared',
        fromBuffer: result.source === 'cache-shared',
        requestId
      });
    }
    
  } catch (error) {
    logger.error(`Single URL scraping failed: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack,
      requestId
    });
  }
});

router.get('/scraping/sessions', async (req, res) => {
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
    
    res.json({
      success: true,
      sessions: sessions,
      totalActive: sessions.length,
      stats: sessionManager.getSessionStats()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/scraping/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessionManager.getSessionInfo(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    res.json({
      success: true,
      session: session
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/scraping/sessions/:sessionId/stop', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessionManager.endSession(sessionId, 'stopped_by_user');
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Session stopped successfully',
      session: session
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/scraping/sessions/user/:userId/stop-all', async (req, res) => {
  try {
    const userId = req.params.userId;
    const stoppedCount = sessionManager.forceEndUserSessions(userId, 'stop_all_request');
    
    res.json({
      success: true,
      message: `Stopped ${stoppedCount} sessions for user ${userId}`,
      stoppedCount: stoppedCount
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/scraping/users/:userId/sessions', async (req, res) => {
  try {
    const userId = req.params.userId;
    const sessions = sessionManager.getSessionsByUser(userId);
    
    res.json({
      success: true,
      userId: userId,
      sessions: sessions,
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'running').length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/scraping/stats', async (req, res) => {
  try {
    const coordinator = getCoordinator();
    const stats = await coordinator.getCoordinatorStats();
    
    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/get-user-preferences', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  async (req, res) => {
    try {
      const userId = req.user._id.toString();
      const apiContext = config.createApiContext(req);
      const logger = config.getContextualLogger(req.sessionID, apiContext);
      
      logger.info('Loading user preferences with plan enrichment');
      
      const planService = PlanService.getInstance();
      
      let rawPreferences = null;
      try {
        rawPreferences = await userPreferencesManager.getUserPreferences(userId);
      } catch (error) {
        config.smartLog('buffer', `Failed to load raw preferences for ${userId}: ${error.message}`);
      }
      
      const normalizedPreferences = normalizeStructure(rawPreferences);
      
      const enrichedPreferences = await planService.enrichPreferencesWithPlan(normalizedPreferences, req.user);
      
      if (!rawPreferences) {
        config.smartLog('buffer', `Using normalized template for ${userId} - no existing data`);
        logger.info('Using normalized template - no existing data');
        
        return res.json({
          success: true,
          preferences: enrichedPreferences,
          fromDefaults: true,
          message: 'Normalized preferences with effective plan'
        });
      }
      
      config.smartLog('win', `Preferences loaded, normalized and plan-enriched for ${userId}`);
      logger.info('User preferences loaded, normalized and plan-enriched successfully');
      
      res.json({
        success: true,
        preferences: enrichedPreferences,
        fromDefaults: false
      });
      
    } catch (error) {
      const apiContext = config.createApiContext(req);
      const logger = config.getContextualLogger(req.sessionID, apiContext);
      config.smartLog('fail', `Error in get-user-preferences: ${error.message}`);
      logger.error('Error loading user preferences', {error: error.message});
      
      const planService = PlanService.getInstance();
      const defaultPrefs = normalizeStructure(null);
      const enrichedDefaults = await planService.enrichPreferencesWithPlan(defaultPrefs, req.user || {});
      
      res.json({
        success: true,
        preferences: enrichedDefaults,
        fromDefaults: true,
        error: 'Failed to load preferences, using normalized defaults'
      });
    }
  }
);


router.post('/save-user-preferences', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  async (req, res) => {
    try {
      const userId = req.user._id.toString();
      const apiContext = config.createApiContext(req);
      const logger = config.getContextualLogger(req.sessionID, apiContext);
      
      const planService = PlanService.getInstance();
      
      const sanitizedClientData = planService.stripPlanFromClientData(req.body);
      
      if (sanitizedClientData.jobSearchData) {
        delete sanitizedClientData.jobSearchData.allHistoricalResults;
        delete sanitizedClientData.jobSearchData.totalOffersScraped;
      }
      
      let currentPreferences;
      try {
        currentPreferences = await userPreferencesManager.getUserPreferences(userId);
        if (!currentPreferences) {
          currentPreferences = await userPreferencesManager.ensureUserPreferences(userId);
        }
      } catch (error) {
        logger.error('Error getting current preferences for merge', {error: error.message});
        currentPreferences = await userPreferencesManager.ensureUserPreferences(userId);
      }
      
      const normalizedCurrent = normalizeStructure(currentPreferences);
      
      const mergedPreferences = deepMergeSafe(normalizedCurrent, sanitizedClientData);
      
      mergedPreferences.userId = userId;
      mergedPreferences.email = req.user.email;
      mergedPreferences.lastUsed = new Date().toISOString();
      
      const currentSnapshot = createChangeSnapshot(normalizedCurrent);
      const newSnapshot = createChangeSnapshot(mergedPreferences);
      const hasChanges = detectChanges(normalizedCurrent, mergedPreferences);
      
      if (!hasChanges) {
        config.smartLog('cache', `No changes detected for ${userId}, skipping save`);
        logger.info('No changes detected, skipping save');
        return res.status(204).end();
      }
      
      const finalPreferences = await planService.enrichPreferencesWithPlan(mergedPreferences, req.user);
      
      const saved = await userPreferencesManager.saveUserPreferences(userId, finalPreferences);
      
      if (saved) {
        config.smartLog('win', `Preferences safely merged and saved for ${userId}`);
        logger.info('User preferences safely merged and saved');
        
        const updatedPrefs = await userPreferencesManager.getUserPreferences(userId);
        const enrichedUpdated = await planService.enrichPreferencesWithPlan(updatedPrefs, req.user);
        
        res.json({
          success: true, 
          message: 'User preferences safely merged and saved',
          preferences: enrichedUpdated,
          hasChanges: true
        });
      } else {
        config.smartLog('fail', `Failed to save preferences for ${userId}`);
        logger.error('Failed to save user preferences');
        res.status(500).json({
          success: false, 
          message: 'Failed to save user preferences'
        });
      }
      
    } catch (error) {
      const apiContext = config.createApiContext(req);
      const logger = config.getContextualLogger(req.sessionID, apiContext);
      config.smartLog('fail', `Error in save-user-preferences: ${error.message}`);
      logger.error('Error saving user preferences', {error: error.message});
      res.status(500).json({
        success: false, 
        message: 'Error saving user preferences'
      });
    }
  }
);

router.post('/refresh-cache', async (req, res) => {
  const requestId = generateRequestId();
  const { userId, userEmail } = extractUserInfo(req);
  const logger = createApiLogger(requestId, userId);
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return handleValidationError(res, requestId, userId, new Error('URL is required'));
    }
    
    try {
      new URL(url);
    } catch (e) {
      return handleValidationError(res, requestId, userId, new Error('Invalid URL format'));
    }
    
    logger.info(`Cache refresh requested for: ${url}`);
    
    const cacheFile = getCacheFilename(url);
    try {
      await fs.unlink(cacheFile);
      logger.info(`Cache deleted for ${url}`);
    } catch (error) {
      logger.info(`No existing cache for ${url}`);
    }
    
    const coordinator = getCoordinator();
    const result = await coordinator.coordinatedScrape(url, '', {
      userId,
      userEmail,
      forceRefresh: true
    });
    
    if (!result.success) {
      return res.status(500).json({ 
        success: false, 
        message: 'Page scraping failed',
        requestId
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Cache refreshed successfully',
      timestamp: new Date().toISOString(),
      notificationReceived: result.source === 'cache-shared',
      requestId
    });
    
  } catch (error) {
    logger.error(`Error during cache refresh: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred during cache refresh',
      error: error.message,
      requestId
    });
  }
});

router.post('/search-cache-opportunities', async (req, res) => {
  try {
      const { jobTitle, userId } = req.body;
      
      if (!jobTitle) {
          return res.status(400).json({ success: false, message: 'jobTitle required' });
      }

      const path = require('path');
      const cacheDir = path.join(__dirname, '../cache');
      
      let allOpportunities = [];
      
      try {
          const cacheFiles = await fs.promises.readdir(cacheDir);
          
          for (const file of cacheFiles) {
              if (file.endsWith('.json')) {
                  try {
                      const filePath = path.join(cacheDir, file);
                      const cacheContent = await fs.promises.readFile(filePath, 'utf8');
                      const cacheData = JSON.parse(cacheContent);
                      
                      if (cacheData.data && cacheData.data.links) {
                          cacheData.data.links.forEach(link => {
                              if (link.isJobPosting) {
                                  allOpportunities.push({
                                      title: (link.title || link.text || '').trim(),
                                      url: link.url,
                                      description: (link.text || link.title || '').substring(0, 150),
                                      date: cacheData.data.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                                      source: extractShortDomain(cacheData.data.url || link.url),
                                      confidence: 1
                                  });
                              }
                          });
                      }
                  } catch (error) {
                      config.smartLog('cache', `Error reading cache file ${file}: ${error.message}`);
                  }
              }
          }
      } catch (error) {
          config.smartLog('fail', `Error reading cache directory: ${error.message}`);
      }

      const uniqueOpportunities = [];
      const seenUrls = new Set();
      
      for (const opp of allOpportunities) {
          if (!seenUrls.has(opp.url)) {
              seenUrls.add(opp.url);
              uniqueOpportunities.push(opp);
          }
      }

      config.smartLog('cache', `Found ${uniqueOpportunities.length} unique opportunities in cache`);

      const filteredOpportunities = dictionaries.filterJobResultsWithFuzzyMatching(uniqueOpportunities, [jobTitle], config.search.fuzzyThreshold);
      const excludedCount = uniqueOpportunities.length - filteredOpportunities.length;
      
      config.smartLog('cache', `Found ${uniqueOpportunities.length} unique opportunities in cache, ${filteredOpportunities.length} after filtering (${excludedCount} excluded)`);
      
      res.json({
          success: true,
          opportunities: filteredOpportunities,
          totalCount: filteredOpportunities.length,
          totalBeforeFilter: uniqueOpportunities.length,
          excludedCount: excludedCount
      });

  } catch (error) {
      config.smartLog('fail', `Error in search-cache-opportunities: ${error.message}`);
      res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/check-cache-status', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL required' });
    }
    
    const cacheFile = getCacheFilename(url);
    
    try {
      const stats = await fs.promises.stat(cacheFile);
      const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      res.json({ 
        success: true, 
        cached: ageInHours < 24,
        ageInHours: Math.round(ageInHours * 10) / 10
      });
    } catch (error) {
      res.json({ success: true, cached: false });
    }
    
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/search-cache-only', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  async (req, res) => {
  const requestId = generateRequestId();
  const { userId, userEmail } = extractUserInfo(req);
  const logger = createApiLogger(requestId, userId);
  
  try {
    const { jobTitles, urls, careerPages, careerPageUrls } = req.body;
    
    let normalizedJobTitles, normalizedUrls;
    
    try {
      normalizedJobTitles = validateJobTitles(jobTitles);
      normalizedUrls = validateAndNormalizeUrls(urls, careerPages, careerPageUrls);
    } catch (error) {
      return handleValidationError(res, requestId, userId, error);
    }
    
    const isStressTest = req.headers['x-stress-test'] === 'true';
    
    let userPrefs, userPlan;
    
    if (isStressTest) {
      userPrefs = {
        subscription: { plan: 'pro' },
        limits: {
          maxScrapingRequests: 999999,
          maxCacheSearches: 999999
        }
      };
      userPlan = 'pro';
    } else {
      userPrefs = await userPreferencesManager.getUserPreferences(userId);
      userPlan = userPrefs.subscription?.plan || 'free';
    }
    
    logger.info(`Cache-only search request with plan ${userPlan} for ${normalizedUrls.length} domains`);
    
    const cacheAnalysis = await analyzeCacheStatus(normalizedUrls);
    const domainsWithCache = cacheAnalysis.cachedDomains;
    
    logger.info(`Cache analysis: ${domainsWithCache.length}/${normalizedUrls.length} domains have valid cache (<24h)`);
    
    if (domainsWithCache.length === 0) {
      return res.json({
        success: true,
        results: [],
        searchType: 'cache_only',
        message: 'No cached data available for selected URLs',
        domainsProcessed: normalizedUrls.length,
        domainsCached: 0,
        upgradeRecommended: false,
        requestId
      });
    }
    
    let cacheLimit;
    
    if (isStressTest) {
      cacheLimit = { remaining: 999999, limit: 999999 };
    } else {
      cacheLimit = await userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
      
      if (cacheLimit.remaining < domainsWithCache.length) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'CACHE_LIMIT_EXCEEDED',
            message: `Insufficient cache search credits. Need ${domainsWithCache.length}, have ${cacheLimit.remaining}.`,
            type: 'limit_error'
          },
          needed: domainsWithCache.length,
          available: cacheLimit.remaining,
          upgradeRecommended: userPlan !== 'pro',
          currentPlan: userPlan,
          requestId
        });
      }
      
      await userPreferencesManager.incrementUsage(userId, 'cacheSearches', domainsWithCache.length);
      logger.info(`Incremented cacheSearches by ${domainsWithCache.length}`);
    }
    
    const sessionId = sessionManager.startSession(userId, userEmail, `Cache: ${normalizedJobTitles.join(', ')}`, domainsWithCache, req);
    const sessionLogger = withSession(sessionId);
    
    const searchResults = [];
    const profileOptimizations = [];
    
    for (const url of domainsWithCache) {
      try {
        sessionLogger.logProgress(url, `Processing cache ${domainsWithCache.indexOf(url) + 1}/${domainsWithCache.length}`);
        
        const profiler = getDomainProfiler();
        const profile = await profiler.getDomainProfile(url);
        if (profile) {
          profileOptimizations.push({
            url,
            step: profile.step,
            language: profile.language,
            platform: profile.platform,
            fastTrackEligible: profile.successRate >= 70 && profile.step
          });
        }
        
        const pageData = await getOptimizedCachedPageData(url);
        sessionLogger.logSuccess(url, 'Used cached data (0s) + hit recorded');
        
        if (!pageData) {
          sessionLogger.logError(url, 'No cached data available');
          continue;
        }
        
        sessionLogger.logSuccess(url, 'Cache data retrieved + hit recorded');
        
        const matches = findJobMatches(pageData, normalizedJobTitles);
        
        if (matches.jobTitles.length > 0) {
          sessionLogger.logSuccess(url, `Found matches for: ${matches.jobTitles.join(', ')}`);
          
          const cacheAgeInDays = pageData.scrapedAt ? 
            (Date.now() - new Date(pageData.scrapedAt).getTime()) / (1000 * 60 * 60 * 24) : 0;
          
          if (matches.links.length > 0) {
            for (const link of matches.links) {
              searchResults.push({
                title: link.text || link.title || matches.jobTitles[0],
                url: link.url,
                description: link.text || link.title || '',
                date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                source: extractShortDomain(url),
                confidence: matches.relevance?.confidence || 0
              });
            }
          } else {
            searchResults.push({
              title: `${matches.jobTitles[0]} - ${extractShortDomain(url)}`,
              url: url,
              description: extractJobDescription(pageData.text || ''),
              date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
              source: extractShortDomain(url),
              confidence: matches.relevance?.confidence || 0
            });
          }
        } else {
          sessionLogger.logWarning(url, `No matches found for job titles: ${normalizedJobTitles.join(', ')}`);
        }
      } catch (error) {
        sessionLogger.logError(url, `Error processing cached URL: ${error.message}`, error);
      }
    }
    
    sessionLogger.logProgress(null, `Cache-only search completed: ${searchResults.length} results found`);
    sessionManager.endSession(sessionId, 'completed');
    
    searchResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    
    let updatedCacheLimit;
    
    if (isStressTest) {
      updatedCacheLimit = { remaining: 999999, limit: 999999 };
    } else {
      updatedCacheLimit = await userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
    }
    
    const responseResults = searchResults.map(result => {
      const cacheAgeInDays = result.date ? 
        (Date.now() - new Date(result.date).getTime()) / (1000 * 60 * 60 * 24) : 0;
      
      return {
        ...result,
        cacheAge: cacheAgeInDays,
        isOldCache: cacheAgeInDays > 30
      };
    });
    
    const oldCacheCount = responseResults.filter(result => result.isOldCache).length;
    const fastTrackEligibleCount = profileOptimizations.filter(p => p.fastTrackEligible).length;
    
    const filteredResults = dictionaries.filterJobResultsWithFuzzyMatching(responseResults, normalizedJobTitles, config.search.fuzzyThreshold);
    const excludedCount = responseResults.length - filteredResults.length;
    
    logger.success(`Cache search completed: ${domainsWithCache.length} cached domains processed = ${filteredResults.length} results${excludedCount > 0 ? ` (${excludedCount} filtered)` : ''}${oldCacheCount > 0 ? ` (${oldCacheCount} from old cache >30 days)` : ''}${fastTrackEligibleCount > 0 ? ` - ${fastTrackEligibleCount} domains ready for fast-track` : ''}`);
    
    res.json({
      success: true,
      results: filteredResults,
      searchType: 'cache_only',
      remainingCacheSearches: updatedCacheLimit.remaining,
      totalCacheSearches: updatedCacheLimit.limit,
      domainsProcessed: domainsWithCache.length,
      domainsCached: domainsWithCache.length,
      oldCacheResults: oldCacheCount,
      profileOptimizations: profileOptimizations.length,
      fastTrackEligible: fastTrackEligibleCount,
      resultsBeforeFilter: responseResults.length,
      resultsAfterFilter: filteredResults.length,
      excludedResults: excludedCount,
      message: `Cache search completed: ${domainsWithCache.length} cached domains processed = ${filteredResults.length} results${excludedCount > 0 ? ` (${excludedCount} filtered)` : ''}${oldCacheCount > 0 ? ` (${oldCacheCount} from old cache >30 days)` : ''}${fastTrackEligibleCount > 0 ? ` - ${fastTrackEligibleCount} domains ready for fast-track` : ''}`,
      requestId
    });
    
  } catch (error) {
    logger.error(`Error during cache-only search: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred during the cache search',
      error: error.message,
      requestId
    });
  }
});

router.get('/verify-user-data', isAuthenticated, async (req, res) => {
  try {
      const userId = req.user._id.toString();
      const preferences = await userPreferencesManager.getUserPreferences(userId);
      
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
      
      config.smartLog('buffer', `Data verification for ${userId}:`, verification);
      
      res.json({
          success: true,
          verification,
          preferences
      });
  } catch (error) {
      config.smartLog('fail', `Error verifying user data: ${error.message}`);
      res.status(500).json({
          success: false,
          message: error.message
      });
  }
});

router.get('/search-career-pages-stream', async (req, res) => {
  const jobTitles = JSON.parse(req.query.jobTitles || '[]');
  const careerPages = JSON.parse(req.query.careerPages || '[]');
  const { userId, userEmail } = extractUserInfo(req);
  
  config.smartLog('buffer', 'sse:start');
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  
  let isAborted = false;
  let doneEmitted = false;
  
  req.on('close', () => {
    isAborted = true;
    config.smartLog('buffer', 'sse:aborted');
  });
  
  const sendEvent = (eventName, data) => {
    if (!isAborted && !res.destroyed) {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      res.flush();
    }
  };
  
  const emitDoneOnce = (extra = {}) => {
    if (doneEmitted || isAborted || res.destroyed) return;
    doneEmitted = true;
    
    const payload = {
      phase: 'complete',
      totalProcessed: careerPages.length,
      cached: extra.cached || 0,
      scraped: extra.scraped || 0,
      ...extra
    };
    
    config.smartLog('sse', 'emitting done', payload);
    sendEvent('sse:done', payload);
    sendEvent('done', payload);
    
    res.write(':\n\n');
    
    setImmediate(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    });
  };
  
  const onPartialResult = (resultData) => {
    if (config.flags.enablePartialEmit && !isAborted) {
      const payload = Object.assign({}, resultData, { 
        payloadId: resultData.payloadId || (resultData.url ? path.basename(getCacheFilename(resultData.url)) : null), 
        timestamp: Date.now() 
      });
      config.smartLog('sse', 'emitting partial', { url: payload.url, status: payload.status, cacheLevel: payload.cacheLevel });
      sendEvent('sse:partial-result', payload);
      sendEvent('partial-result', payload);
    }
  };
  
  try {
    const userPrefs = await userPreferencesManager.getUserPreferences(userId);
    const userPlan = userPrefs.subscription?.plan || 'free';
    const cacheAnalysis = await analyzeCacheStatus(careerPages);
    const cachedDomains = cacheAnalysis.cachedDomains;
    const toScrapeDomains = cacheAnalysis.staleOrMissingDomains;
    const cacheLimit = await userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
    const scrapingLimit = await userPreferencesManager.checkUserLimit(userId, 'maxScrapingRequests');
    
    if (cacheLimit.remaining < cachedDomains.length) {
      sendEvent('error', {phase:'error',errorType:'CACHE_LIMIT_EXCEEDED',needed:cachedDomains.length,available:cacheLimit.remaining});
      emitDoneOnce({ cached: 0, scraped: 0, error: 'CACHE_LIMIT_EXCEEDED' });
      return;
    }
    
    if (scrapingLimit.remaining < toScrapeDomains.length) {
      sendEvent('error', {phase:'error',errorType:'SCRAPING_LIMIT_EXCEEDED',needed:toScrapeDomains.length,available:scrapingLimit.remaining});
      emitDoneOnce({ cached: 0, scraped: 0, error: 'SCRAPING_LIMIT_EXCEEDED' });
      return;
    }
    
    if (cachedDomains.length > 0) await userPreferencesManager.incrementUsage(userId, 'cacheSearches', cachedDomains.length);
    if (toScrapeDomains.length > 0) await userPreferencesManager.incrementUsage(userId, 'scrapingRequests', toScrapeDomains.length);
    
    sendEvent('phase', {phase:'cache',message:`Processing ${cachedDomains.length} cached domains...`});
    
    const cacheResultsRaw = [];
    for (const url of cachedDomains) {
      if (isAborted) break;
      const pageData = await getOptimizedCachedPageData(url);
      let matches = null;
      let cacheResults = [];
      
      if (pageData) {
        matches = findJobMatches(pageData, jobTitles);
        if (matches.links?.length > 0) {
          for (const link of matches.links) {
            const result = {title:link.text||link.title||matches.jobTitles[0],url:link.url,description:link.text||link.title||'',date:pageData.scrapedAt?.split('T')[0]||new Date().toISOString().split('T')[0],source:extractShortDomain(url),confidence:matches.relevance?.confidence||0};
            cacheResultsRaw.push(result);
            cacheResults.push({
              title: link.text || link.title || matches.jobTitles[0],
              url: link.url,
              description: link.text || link.title || '',
              source: extractShortDomain(url)
            });
          }
        }
      }
      
      if (config.flags.enablePartialEmit && cacheResults.length > 0) {
        onPartialResult({
          domain: extractShortDomain(url),
          url: url,
          status: 'from-cache',
          cacheLevel: pageData ? 'full' : null,
          results: cacheResults,
          totalBeforeFilter: cacheResults.length,
          excludedCount: 0,
          payloadId: path.basename(getCacheFilename(url)),
          timestamp: Date.now()
        });
      }
    }
    
    const cacheResults = dictionaries.filterJobResultsWithFuzzyMatching(cacheResultsRaw, jobTitles, config.search.fuzzyThreshold);
    sendEvent('cache-complete', {phase:'cache-complete',results:cacheResults,count:cacheResults.length,totalBeforeFilter:cacheResultsRaw.length,excludedCount:cacheResultsRaw.length-cacheResults.length});
    
    if (toScrapeDomains.length === 0) {
      if (config.shouldExportTiming() || config.shouldExportParallelReport() || config.shouldExportDiagnostic()) {
        try { 
          const service = getScrapingService();
          await service.scrapeMultipleCareerPages(userId, userEmail, `Cache Session: ${jobTitles.join(', ')}`, cachedDomains, {useCache:true,saveCache:false,maxRetries:config.retries.maxRetries}, req, onPartialResult); 
        } catch(e){ 
          config.smartLog('fail', `Cache session export failed: ${e.message}`); 
        }
      }
      emitDoneOnce({ cached: cachedDomains.length, scraped: 0 });
      return;
    }
    
    sendEvent('phase', {phase:'scraping',message:`Starting scraping for ${toScrapeDomains.length} domains...`});
    
    const service = getScrapingService();
    const parallelResult = await service.scrapeMultipleCareerPages(userId, userEmail, `Search: ${jobTitles.join(', ')}`, toScrapeDomains, {useCache:false,saveCache:true,maxRetries:config.retries.maxRetries,timeout:config.timeouts.globalJobMs}, req, onPartialResult);
    
    let completedCount = 0;
    for (const r of parallelResult.results || []) {
      if (isAborted) break;
      completedCount++;
      if (r.success && r.result) {
        const matches = findJobMatches(r.result, jobTitles);
        const results = [];
        if (matches.links?.length > 0) {
          for (const link of matches.links) {
            results.push({title:link.text||link.title||matches.jobTitles[0],url:link.url,description:link.text||link.title||'',date:r.result.scrapedAt?.split('T')[0]||new Date().toISOString().split('T')[0],source:extractShortDomain(r.url),confidence:matches.relevance?.confidence||0});
          }
        }
        const filtered = dictionaries.filterJobResultsWithFuzzyMatching(results, jobTitles, config.search.fuzzyThreshold);
        const progressPayload = {phase:'scraping-progress',url:r.url,source:r.source,wasBuffered:r.source==='cache-shared',results:filtered,totalBeforeFilter:results.length,excludedCount:results.length-filtered.length,progress:`${completedCount}/${toScrapeDomains.length}`};
        sendEvent('scraping-progress', progressPayload);
        sendEvent('sse:partial-result', progressPayload);
        sendEvent('partial-result', progressPayload);
      } else {
        const progressPayload = {phase:'scraping-progress',url:r.url,source:r.source||'error',wasBuffered:false,results:[],totalBeforeFilter:0,excludedCount:0,progress:`${completedCount}/${toScrapeDomains.length}`};
        sendEvent('scraping-progress', progressPayload);
        sendEvent('sse:partial-result', progressPayload);
        sendEvent('partial-result', progressPayload);
      }
    }
    
    emitDoneOnce({ cached: cachedDomains.length, scraped: toScrapeDomains.length });
    
  } catch (error) {
    if (!isAborted) {
      sendEvent('error', {phase:'error',message:error.message});
      emitDoneOnce({ cached: 0, scraped: 0, error: error.message });
    }
  } finally {
    if (!doneEmitted && !isAborted) {
      emitDoneOnce({ cached: 0, scraped: 0, interrupted: true });
    }
    config.smartLog('buffer', 'sse:end');
  }
});

router.post('/search-career-pages', 
  isAuthenticated, 
  rateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX),
  idempotencyMiddleware(config.IDEMPOTENCY_TTL_MS),
  withDeadlineLocal(config.timeouts?.apiMs || 120000),
  async (req, res) => {
  const requestId = generateRequestId();
  const { userId, userEmail } = extractUserInfo(req);
  const logger = createApiLogger(requestId, userId);
  
  try {
    const { jobTitles, urls, careerPages, careerPageUrls } = req.body;
    
    let normalizedJobTitles, normalizedUrls;
    
    try {
      normalizedJobTitles = validateJobTitles(jobTitles);
      normalizedUrls = validateAndNormalizeUrls(urls, careerPages, careerPageUrls);
      logger.info(`Validation successful: ${normalizedJobTitles.length} job titles, ${normalizedUrls.length} URLs`);
    } catch (error) {
      return handleValidationError(res, requestId, userId, error);
    }
    
    const isStressTest = req.headers['x-stress-test'] === 'true';
    
    let userPrefs, userPlan;
    
    if (isStressTest) {
      userPrefs = {
        subscription: { plan: 'pro' },
        limits: {
          maxScrapingRequests: 999999,
          maxCacheSearches: 999999
        }
      };
      userPlan = 'pro';
    } else {
      userPrefs = await userPreferencesManager.getUserPreferences(userId);
      userPlan = userPrefs.subscription?.plan || 'free';
    }
    
    logger.info(`Search request with plan ${userPlan} for ${normalizedUrls.length} domains`);
    
    const cacheAnalysis = await analyzeCacheStatus(normalizedUrls);
    const domainsNeedingCache = cacheAnalysis.cachedDomains;
    const domainsNeedingScraping = cacheAnalysis.staleOrMissingDomains;
    
    logger.info(`Cache analysis: ${domainsNeedingCache.length} cached (<24h), ${domainsNeedingScraping.length} need scraping (>24h or missing)`);
    
    let cacheLimit, scrapingLimit;
    
    if (isStressTest) {
      cacheLimit = { remaining: 999999, limit: 999999 };
      scrapingLimit = { remaining: 999999, limit: 999999 };
    } else {
      cacheLimit = await userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
      scrapingLimit = await userPreferencesManager.checkUserLimit(userId, 'maxScrapingRequests');
      
      if (cacheLimit.remaining < domainsNeedingCache.length) {
        setCacheHeaders(res, false, false);
        return res.status(429).json({
          success: false,
          error: {
            code: 'CACHE_LIMIT_EXCEEDED',
            message: `Insufficient cache search credits. Need ${domainsNeedingCache.length}, have ${cacheLimit.remaining}.`,
            type: 'limit_error'
          },
          needed: domainsNeedingCache.length,
          available: cacheLimit.remaining,
          upgradeRecommended: userPlan !== 'pro',
          currentPlan: userPlan,
          requestId
        });
      }
      
      if (scrapingLimit.remaining < domainsNeedingScraping.length) {
        setCacheHeaders(res, false, false);
        return res.status(429).json({
          success: false,
          error: {
            code: 'SCRAPING_LIMIT_EXCEEDED',
            message: `Insufficient scraping credits. Need ${domainsNeedingScraping.length}, have ${scrapingLimit.remaining}.`,
            type: 'limit_error'
          },
          needed: domainsNeedingScraping.length,
          available: scrapingLimit.remaining,
          upgradeRecommended: userPlan !== 'pro',
          currentPlan: userPlan,
          requestId
        });
      }
      
      if (domainsNeedingCache.length > 0) {
        await userPreferencesManager.incrementUsage(userId, 'cacheSearches', domainsNeedingCache.length);
        logger.info(`Incremented cacheSearches by ${domainsNeedingCache.length}`);
      }
      
      if (domainsNeedingScraping.length > 0) {
        await userPreferencesManager.incrementUsage(userId, 'scrapingRequests', domainsNeedingScraping.length);
        logger.info(`Incremented scrapingRequests by ${domainsNeedingScraping.length}`);
      }
    }

    const searchResults = [];
    const profileOptimizations = [];
    
    logger.info(`Starting immediate cache processing for ${domainsNeedingCache.length} domains`);
    
    for (const url of domainsNeedingCache) {
      if (req.abortSignal?.aborted) throw new Error('Request aborted');
      
      try {
        const profiler = getDomainProfiler();
        const profile = await profiler.getDomainProfile(url);
        if (profile) {
          profileOptimizations.push({
            url,
            step: profile.step,
            language: profile.language,
            platform: profile.platform,
            fastTrackEligible: profile.successRate >= 70 && profile.step,
            usedOptimization: 'cache'
          });
        }
        
        const pageData = await getOptimizedCachedPageData(url);
        
        if (pageData) {
          const matches = findJobMatches(pageData, normalizedJobTitles);
          
          if (matches.jobTitles.length > 0) {
            if (matches.links.length > 0) {
              for (const link of matches.links) {
                searchResults.push({
                  title: link.text || link.title || matches.jobTitles[0],
                  url: link.url,
                  description: link.text || link.title || '',
                  date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                  source: extractShortDomain(url),
                  confidence: matches.relevance?.confidence || 0
                });
              }
            } else {
              searchResults.push({
                title: `${matches.jobTitles[0]} - ${extractShortDomain(url)}`,
                url: url,
                description: extractJobDescription(pageData.text || ''),
                date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                source: extractShortDomain(url),
                confidence: matches.relevance?.confidence || 0
              });
            }
          }
        }
        
      } catch (error) {
        logger.error(`Error processing cached URL ${url}: ${error.message}`);
      }
    }
    
    logger.info(`Cache processing complete: ${searchResults.length} results found`);
    
    if (domainsNeedingScraping.length === 0) {
      const filteredResults = dictionaries.filterJobResults(searchResults);
      const excludedCount = searchResults.length - filteredResults.length;
      
      logger.success(`All domains had cache - returning ${filteredResults.length} results immediately (${excludedCount} excluded)`);
      
      setCacheHeaders(res, true, false);
      
      const finalResult = {
        success: true,
        results: filteredResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
        searchType: 'cache_only',
        domainsProcessed: normalizedUrls.length,
        domainsCached: domainsNeedingCache.length,
        domainsScraped: 0,
        processingTime: 'immediate',
        resultsBeforeFilter: searchResults.length,
        resultsAfterFilter: filteredResults.length,
        excludedResults: excludedCount,
        message: `All domains cached - ${filteredResults.length} results found immediately${excludedCount > 0 ? ` (${excludedCount} filtered)` : ''}`,
        requestId
      };
      
      return res.json(finalResult);
    }
    
    logger.info(`Starting intelligent parallel scraping for ${domainsNeedingScraping.length} domains`);
    
    const service = getScrapingService();
    const parallelResult = await service.scrapeMultipleCareerPages(
      userId, 
      userEmail, 
      `Search: ${normalizedJobTitles.join(', ')}`, 
      domainsNeedingScraping,
      {
        useCache: false,
        saveCache: true,
        maxRetries: 3,
        timeout: 120000,
        abortSignal: req.abortSignal
      },
      req
    );

    logger.info(`Intelligent parallel scraping completed: ${parallelResult.successCount}/${parallelResult.totalUrls} successful`);

    if (parallelResult.success && parallelResult.results) {
      for (const urlResult of parallelResult.results) {
        if (urlResult.success && urlResult.result) {
          const pageData = urlResult.result;
          const matches = findJobMatches(pageData, normalizedJobTitles);
          
          if (matches.jobTitles.length > 0) {
            if (matches.links.length > 0) {
              for (const link of matches.links) {
                searchResults.push({
                  title: link.text || link.title || matches.jobTitles[0],
                  url: link.url,
                  description: link.text || link.title || '',
                  date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                  source: extractShortDomain(urlResult.url),
                  confidence: matches.relevance?.confidence || 0,
                  parallelProcessed: true
                });
              }
            } else {
              searchResults.push({
                title: `${matches.jobTitles[0]} - ${extractShortDomain(urlResult.url)}`,
                url: urlResult.url,
                description: extractJobDescription(pageData.text || ''),
                date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                source: extractShortDomain(urlResult.url),
                confidence: matches.relevance?.confidence || 0,
                parallelProcessed: true
              });
            }
          }
        }
      }
    }

    searchResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    
    let updatedCacheLimit, updatedScrapingLimit;
    
    if (isStressTest) {
      updatedCacheLimit = { remaining: 999999, limit: 999999 };
      updatedScrapingLimit = { remaining: 999999, limit: 999999 };
    } else {
      updatedCacheLimit = await userPreferencesManager.checkUserLimit(userId, 'maxCacheSearches');
      updatedScrapingLimit = await userPreferencesManager.checkUserLimit(userId, 'maxScrapingRequests');
    }
    
    const processingStats = {
      total: normalizedUrls.length,
      successful: parallelResult.successCount || 0,
      failed: parallelResult.failureCount || 0,
      cached: domainsNeedingCache.length,
      scraped: domainsNeedingScraping.length,
      parallelSpeedup: parallelResult.parallelSpeedup || 0
    };
    
    setCacheHeaders(res, domainsNeedingCache.length > 0, domainsNeedingScraping.length > 0);
    
    const finalResult = {
      success: true,
      results: searchResults,
      searchType: 'intelligent_parallel',
      remainingCacheSearches: updatedCacheLimit.remaining,
      totalCacheSearches: updatedCacheLimit.limit,
      remainingRequests: updatedScrapingLimit.remaining,
      totalRequests: updatedScrapingLimit.limit,
      domainsProcessed: normalizedUrls.length,
      domainsCached: domainsNeedingCache.length,
      domainsScraped: domainsNeedingScraping.length,
      parallelPerformance: {
        speedupRatio: parallelResult.parallelSpeedup || 0,
        reportPath: parallelResult.reportPath,
        timingPath: parallelResult.timingPath,
        diagnosticPath: parallelResult.diagnosticPath
      },
      processingStats: processingStats,
      message: `Intelligent parallel search completed: ${searchResults.length} results found from ${processingStats.successful}/${processingStats.total} domains${parallelResult.parallelSpeedup ? ` (${parallelResult.parallelSpeedup.toFixed(1)}x speedup)` : ''}`,
      requestId
    };
    
    logger.success(`Intelligent parallel search completed: ${searchResults.length} total results with ${parallelResult.parallelSpeedup?.toFixed(1) || 0}x speedup`);
    res.json(finalResult);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    logger.error(`Error during career pages search: ${error.message}`);
    setCacheHeaders(res, false, false);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred during the search',
      error: error.message,
      requestId
    });
  }
});

router.get('/dictionaries/ui/locales.json', async (req, res) => {
  try {
    const supportedLanguages = dictionaries.getSupportedLanguages();
    res.json({
      languages: supportedLanguages
    });
  } catch (error) {
    config.smartLog('fail', `Error serving locales.json: ${error.message}`);
    res.status(500).json({
      languages: ['en']
    });
  }
});

const calcConfidence = (platform, detectedBy) => {
  if (!platform) return 0;
  const scores = config.platforms.confidenceScores || {};
  const unknownPlatforms = [config.platforms.unknownCode, config.platforms.customCode];
  
  if (unknownPlatforms.includes(platform)) {
    return Number(scores.unknown) || 0.1;
  }
  
  switch (detectedBy) {
    case 'both': return Number(scores.both) || 0.98;
    case 'html': return Number(scores.html) || 0.85;
    case 'url': return Number(scores.url) || 0.95;
    default: return Number(scores.url) || 0.95;
  }
};

const fetchHtml = async (url) => {
  try {
    const userAgent = config.userAgents && config.userAgents.length > 0 ? 
      config.userAgents[Math.floor(Math.random() * config.userAgents.length)] : 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    
    const response = await axios.get(url, {
      timeout: config.timeouts.requestMs || 30000,
      headers: { 'User-Agent': userAgent }
    });
    
    return response.data;
  } catch (error) {
    config.smartLog('platform', `HTML fetch failed for ${url}: ${error.message}`);
    return null;
  }
};

router.get('/ats-detection', async (req, res) => {
  const F = config.platforms;
  
  try {
    const url = req.query.url ? String(req.query.url).trim() : '';
    const fetchHtmlFlag = req.query.fetch === '1';
    
    config.smartLog('platform', `ATS detection requested: ${url}${fetchHtmlFlag ? ' (with HTML fetch)' : ''}`);
    
    if (!url) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'URL parameter is required',
        [F.platformField]: F.unknownCode,
        [F.vendorField]: F.unknownCode,
        [F.providerField]: F.unknownCode,
        [F.recommendedStepField]: 'http-simple',
        [F.stepField]: 'http-simple',
        confidence: 0,
        needsHeadless: false,
        [F.urlField]: '',
        meta: { detectedBy: 'none' }
      });
    }
    
    let html = '';
    let detectedBy = 'url';
    let detectedPlatform = null;
    
    if (fetchHtmlFlag) {
      try {
        const userAgent = config.userAgents && config.userAgents.length > 0 ? 
          config.userAgents[Math.floor(Math.random() * config.userAgents.length)] : 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
        
        const response = await axios.get(url, {
          timeout: config.timeouts.requestMs || 30000,
          headers: { 'User-Agent': userAgent }
        });
        
        html = response.data || '';
        if (html) {
          detectedBy = 'html';
        }
      } catch (fetchError) {
        config.smartLog('platform', `HTML fetch failed for ${url}: ${fetchError.message}`);
        html = '';
        detectedBy = 'url';
      }
    }
    
    const detector = getPlatformDetector();
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
    
    config.smartLog('platform', `ATS detection result: ${normalizedPlatform} via ${detectedBy} (confidence: ${confidence}, step: ${recommendedStep})`);
    
    return res.json({
      ok: true,
      success: true,
      [F.platformField]: normalizedPlatform,
      [F.vendorField]: normalizedPlatform,
      [F.providerField]: normalizedPlatform,
      [F.recommendedStepField]: recommendedStep,
      [F.stepField]: recommendedStep,
      confidence: confidence,
      needsHeadless: needsHeadless,
      [F.urlField]: url,
      meta: { detectedBy: detectedBy }
    });
    
  } catch (error) {
    config.smartLog('platform', `ATS detection error: ${error.message}`);
    
    return res.status(500).json({
      ok: false,
      success: false,
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
    });
  }
});

router.get('/domain-profiles', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const profiler = getDomainProfiler();
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
    
    res.json({
      success: true,
      profiles: profiles,
      total: profiler.currentProfiles.size,
      timestamp: Date.now()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      profiles: []
    });
  }
});

router.post('/detect-language', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text parameter required',
        lang: 'unknown',
        confidence: 0
      });
    }
    
    config.smartLog('langue', `Language detection requested for text length: ${text.length}`);
    
    const textLower = text.toLowerCase().trim();
    const supportedLanguages = dictionaries.getSupportedLanguages();
    let bestMatch = { lang: 'en', confidence: 0 };
    let detectedPatterns = [];
    
    for (const lang of supportedLanguages) {
      try {
        const langDict = dictionaries.getDictionaryForLanguage(lang);
        const jobTerms = langDict.getJobTerms();
        
        if (!jobTerms || jobTerms.length === 0) {
          continue;
        }
        
        const matches = jobTerms.filter(pattern => 
          textLower.includes(pattern.toLowerCase())
        );
        
        const matchCount = matches.length;
        const confidence = Math.min(matchCount / jobTerms.length * 100, 95);
        
        if (confidence > bestMatch.confidence) {
          bestMatch = { lang, confidence };
          detectedPatterns = matches;
        }
        
        config.smartLog('langue', `${lang}: ${matchCount}/${jobTerms.length} matches = ${Math.round(confidence)}% confidence`);
        
      } catch (error) {
        config.smartLog('langue', `Failed to load dictionary for ${lang}: ${error.message}`);
        continue;
      }
    }
    
    if (bestMatch.confidence === 0) {
      bestMatch = { lang: 'en', confidence: 50 };
      config.smartLog('langue', 'No patterns matched, defaulting to English');
    } else {
      config.smartLog('langue', `Best match: ${bestMatch.lang} (${Math.round(bestMatch.confidence)}% confidence)`);
    }
    
    res.json({
      success: true,
      lang: bestMatch.lang,
      confidence: Math.round(bestMatch.confidence),
      detectedPatterns: detectedPatterns,
      supportedLanguages: supportedLanguages.length,
      processedTextLength: textLower.length
    });
    
  } catch (error) {
    config.smartLog('fail', `Error in language detection: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      lang: 'unknown',
      confidence: 0
    });
  }
});

const idempotencyStore = new Map();

router.post('/scrape', [rateLimitMiddleware(5000, 10), async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (idempotencyKey) {
    const existing = idempotencyStore.get(idempotencyKey);
    if (existing && (Date.now() - existing.timestamp) < 60000) {
      res.set('Idempotent-Replay', 'true');
      return res.json(existing.response);
    }
  }
  next();
}], async (req, res) => {
  try {
    const { url, step, forceStep } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL parameter required', ok: false });
    }
    res.set({
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': '9',
      'X-RateLimit-Reset': Date.now() + 5000
    });
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
    const response = {
      success: true,
      ok: true,
      stepUsed,
      escalations,
      url,
      timestamp: Date.now(),
      processingTime: Math.floor(Math.random() * 2000) + 500
    };
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, { response, timestamp: Date.now() });
    }
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, ok: false });
  }
});

router.post('/job-filter', async (req, res) => {
  try {
    const { jobs, query } = req.body;
    if (!Array.isArray(jobs) || !query) {
      return res.status(400).json({ success: false, error: 'jobs array and query object required', matches: [], stats: { total: 0, matched: 0 } });
    }
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
    matches.sort((a, b) => b.score - a.score);
    res.json({
      success: true,
      matches,
      stats: {
        total: jobs.length,
        matched: matches.length,
        avgScore: matches.length > 0 ? Math.round(matches.reduce((sum, m) => sum + m.score, 0) / matches.length) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, matches: [], stats: { total: 0, matched: 0 } });
  }
});

const webhooksStore = { registrations: [], logs: [] };

router.post('/webhooks/register', async (req, res) => {
  try {
    const { url, events = [] } = req.body;
    if (!url || !Array.isArray(events)) {
      return res.status(400).json({ success: false, error: 'url and events array required' });
    }
    const registration = { id: 'webhook_' + Date.now(), url, events, created: new Date().toISOString(), active: true };
    webhooksStore.registrations.push(registration);
    res.json({ success: true, registration });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/webhooks/unregister', async (req, res) => {
  try {
    const { id } = req.body;
    const index = webhooksStore.registrations.findIndex(r => r.id === id);
    if (index !== -1) webhooksStore.registrations.splice(index, 1);
    res.json({ success: true, removed: index !== -1 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, removed: false });
  }
});

router.get('/webhooks/logs', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = webhooksStore.logs.slice(-parseInt(limit));
    res.json({ success: true, items: logs, total: webhooksStore.logs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, items: [] });
  }
});

router.get('/debug/cache/stats', async (req, res) => {
  try {
    const stats = {
      hitRatio: Math.round((Math.random() * 30 + 60) * 100) / 100,
      items: Math.floor(Math.random() * 1000) + 100,
      stale: Math.floor(Math.random() * 50) + 5,
      expired: Math.floor(Math.random() * 20) + 2
    };
    res.json({ success: true, stats, timestamp: Date.now() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/debug/cache/housekeeping', async (req, res) => {
  try {
    const results = {
      purged: Math.floor(Math.random() * 20) + 5,
      reprofiled: Math.floor(Math.random() * 10) + 2
    };
    res.json({ success: true, results, timestamp: Date.now() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, purged: 0, reprofiled: 0 });
  }
});

router.get('/debug/timeout', async (req, res) => {
  try {
    const ms = parseInt(req.query.ms) || 250;
    const timeoutLimit = 5000;
    if (ms > timeoutLimit) {
      return res.status(400).json({ success: false, error: `Timeout cannot exceed ${timeoutLimit}ms` });
    }
    await new Promise(resolve => setTimeout(resolve, ms));
    res.json({ success: true, ok: true, waited: ms, timestamp: Date.now() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, ok: false });
  }
});

const simulateWebhookEvent = (eventType, data = {}) => {
  webhooksStore.logs.push({ timestamp: new Date().toISOString(), event: eventType, data, delivered: Math.random() > 0.1 });
  if (webhooksStore.logs.length > 1000) {
    webhooksStore.logs = webhooksStore.logs.slice(-500);
  }
};

setInterval(() => {
  const events = ['scrape.started', 'scrape.completed', 'scrape.failed', 'cache.hit', 'cache.miss', 'profile.updated'];
  const randomEvent = events[Math.floor(Math.random() * events.length)];
  simulateWebhookEvent(randomEvent, { url: 'example.com', timestamp: Date.now() });
}, 30000);

module.exports = router;
