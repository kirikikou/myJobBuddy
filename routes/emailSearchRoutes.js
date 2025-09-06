const config = require('../config');
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const { 
  checkEmailSearchLimits, 
  validateEmailSearchRequest,
  updateEmailSearchUsage,
  hasCachedEmailData 
} = require('../middleware/emailLimitsMiddleware');
const EmailExplorer = require('../scrapers/EmailExplorer');
const EmailScraper = require('../scrapers/EmailScraper');
const fs = require('fs').promises;
const path = require('path');
const queueGate = require('../middleware/queueGate');

router.use(queueGate);
config.smartLog('buffer', 'queue-gate:router-mounted:email');

const emailExplorer = new EmailExplorer();
const emailScraper = new EmailScraper();

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Email search routes are working!',
    timestamp: new Date().toISOString(),
    authenticated: !!req.user,
    cacheDir: path.join(__dirname, '../cache')
  });
});

router.get('/explore-domains-stream', 
  isAuthenticated, 
  checkEmailSearchLimits,
  async (req, res) => {
    const startTime = Date.now();
    let { domains, maxDepth = 2, forceRefresh = 'false' } = req.query;
    const { userData, userId, emailLimits, canUseLive, currentLiveUsage, currentCacheUsage } = req.emailSearchContext;
    
    try {
      domains = JSON.parse(domains);
      maxDepth = parseInt(maxDepth) || 2;
      forceRefresh = forceRefresh === 'true';
    } catch (e) {
      if (!Array.isArray(domains)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid domains parameter'
        });
      }
    }
    
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Domains array is required'
      });
    }

    let needsLiveSearch = 0;
    let needsCacheSearch = 0;
    
    domains.forEach(domain => {
      if (forceRefresh || !hasCachedEmailData(domain)) {
        needsLiveSearch++;
      } else {
        needsCacheSearch++;
      }
    });

    if (needsLiveSearch > 0 && !canUseLive) {
      return res.status(403).json({
        success: false,
        message: 'Live email search not available for your plan',
        errorType: 'LIVE_EMAIL_SEARCH_NOT_ALLOWED',
        userPlan: userData.subscription?.plan || 'free',
        needed: needsLiveSearch,
        available: 0
      });
    }

    if (needsLiveSearch > 0) {
      const availableLive = Math.max(0, emailLimits.liveSearches - currentLiveUsage);
      if (needsLiveSearch > availableLive) {
        return res.status(429).json({
          success: false,
          message: `Insufficient live email search credits. Need ${needsLiveSearch}, have ${availableLive}`,
          errorType: 'EMAIL_LIVE_LIMIT_EXCEEDED',
          userPlan: userData.subscription?.plan || 'free',
          needed: needsLiveSearch,
          available: availableLive,
          currentUsage: currentLiveUsage,
          limit: emailLimits.liveSearches
        });
      }
    }

    if (needsCacheSearch > 0) {
      const availableCache = Math.max(0, emailLimits.cacheSearches - currentCacheUsage);
      if (needsCacheSearch > availableCache) {
        return res.status(429).json({
          success: false,
          message: `Insufficient email cache search credits. Need ${needsCacheSearch}, have ${availableCache}`,
          errorType: 'EMAIL_CACHE_LIMIT_EXCEEDED', 
          userPlan: userData.subscription?.plan || 'free',
          needed: needsCacheSearch,
          available: availableCache,
          currentUsage: currentCacheUsage,
          limit: emailLimits.cacheSearches
        });
      }
    }

    config.smartLog('buffer',`[Email Stream] User ${userId} requesting exploration of ${domains.length} domains with depth ${maxDepth}`);
    config.smartLog('buffer',`[Email Stream] Needs: ${needsLiveSearch} live, ${needsCacheSearch} cache searches`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendEvent = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        config.smartLog('fail','Error sending SSE event:', error);
      }
    };

    try {
      const results = [];
      let totalProcessed = 0;
      let cacheHits = 0;
      let explorationCount = 0;
      let actualLiveUsed = 0;
      let actualCacheUsed = 0;

      sendEvent({
        phase: 'starting',
        message: `Starting email exploration of ${domains.length} domains`,
        totalDomains: domains.length
      });

      const cachedDomains = [];
      const staleOrMissingDomains = [];

      for (const domain of domains) {
        try {
          const cached = await emailExplorer.getCachedResults(domain);
          if (cached && !forceRefresh && !isEmailCacheStale(cached)) {
            cachedDomains.push({ domain, data: cached });
          } else {
            staleOrMissingDomains.push(domain);
          }
        } catch (error) {
          config.smartLog('fail',`[Email Stream] Cache check error for ${domain}:`, error);
          staleOrMissingDomains.push(domain);
        }
      }

      if (cachedDomains.length > 0) {
        sendEvent({
          phase: 'cache',
          message: `Found ${cachedDomains.length} cached email explorations`,
          cacheHits: cachedDomains.length,
          totalDomains: domains.length
        });

        for (const { domain, data } of cachedDomains) {
          results.push({
            domain: data.domain,
            success: true,
            emails: data.emails || [],
            stats: data.stats,
            fromCache: true,
            exploredAt: data.completedAt
          });

          sendEvent({
            phase: 'cache-result',
            domain: data.domain,
            emailsFound: data.stats?.uniqueEmails || 0,
            fromCache: true
          });

          cacheHits++;
          totalProcessed++;
          actualCacheUsed++;
        }

        sendEvent({
          phase: 'cache-complete',
          message: `Cache processing complete: ${cacheHits} domains`,
          results: results,
          cacheHits,
          totalProcessed
        });
      }

      if (staleOrMissingDomains.length > 0) {
        sendEvent({
          phase: 'exploration-starting',
          message: `Starting fresh exploration of ${staleOrMissingDomains.length} domains`,
          domainsToExplore: staleOrMissingDomains.length
        });

        const explorationPromises = staleOrMissingDomains.map(async (domain) => {
          try {
            sendEvent({
              phase: 'exploring',
              message: `Exploring domain: ${domain}`,
              domain: domain,
              progress: `${explorationCount + 1}/${staleOrMissingDomains.length}`
            });

            const explorationResult = await emailExplorer.exploreDomain(domain, {
              maxDepth,
              forceRefresh,
              userId,
              userEmail: userData.email,
              searchContactPages: true
            });

            explorationCount++;
            actualLiveUsed++;

            if (explorationResult && explorationResult.stats) {
              const result = {
                domain: explorationResult.domain || new URL(domain).hostname,
                success: true,
                emails: explorationResult.emails || [],
                stats: explorationResult.stats || { uniqueEmails: 0, totalPages: 0 },
                fromCache: false,
                source: 'fresh-exploration',
                exploredAt: explorationResult.completedAt || new Date().toISOString()
              };

              results.push(result);

              sendEvent({
                phase: 'exploration-progress',
                domain: result.domain,
                emailsFound: result.stats.uniqueEmails || 0,
                pagesExplored: result.stats.totalPages || 0,
                source: 'fresh-exploration',
                progress: `${explorationCount}/${staleOrMissingDomains.length}`
              });

            } else {
              const errorResult = {
                domain: new URL(domain).hostname,
                success: false,
                error: 'Exploration failed - no data returned',
                emails: [],
                stats: { uniqueEmails: 0, totalPages: 0, errors: [{ error: 'No data returned' }] },
                fromCache: false,
                source: 'exploration-error'
              };

              results.push(errorResult);

              sendEvent({
                phase: 'exploration-error',
                domain: errorResult.domain,
                error: 'No data returned',
                progress: `${explorationCount}/${staleOrMissingDomains.length}`
              });
            }

            totalProcessed++;

          } catch (error) {
            config.smartLog('fail',`[Email Stream] Error exploring ${domain}:`, error);
            
            results.push({
              domain: new URL(domain).hostname,
              success: false,
              error: error.message,
              emails: [],
              stats: { uniqueEmails: 0, totalPages: 0, errors: [{ error: error.message }] },
              fromCache: false,
              source: 'exploration-error'
            });

            sendEvent({
              phase: 'exploration-error',
              domain: new URL(domain).hostname,
              error: error.message,
              progress: `${explorationCount}/${staleOrMissingDomains.length}`
            });

            totalProcessed++;
          }
        });

        await Promise.allSettled(explorationPromises);
      }

      await updateEmailSearchUsage(userId, actualLiveUsed, actualCacheUsed);

      const totalEmails = results.reduce((sum, r) => 
        sum + (r.success && r.emails ? r.emails.length : 0), 0
      );

      const summary = {
        domainsProcessed: domains.length,
        successfulExplorations: results.filter(r => r.success).length,
        totalEmailsFound: totalEmails,
        fromCache: cacheHits,
        freshExplorations: explorationCount,
        processingTimeMs: Date.now() - startTime,
        creditsUsed: {
          live: actualLiveUsed,
          cache: actualCacheUsed
        }
      };

      sendEvent({
        phase: 'complete',
        message: `Email exploration complete: ${totalEmails} emails found across ${domains.length} domains`,
        results: results,
        summary: summary,
        totalProcessed: totalProcessed,
        timestamp: new Date().toISOString()
      });

      config.smartLog('buffer',`[Email Stream] Completed for user ${userId}: ${totalEmails} emails, ${summary.processingTimeMs}ms`);
      config.smartLog('buffer',`[Email Stream] Credits used - Live: ${actualLiveUsed}, Cache: ${actualCacheUsed}`);

    } catch (error) {
      config.smartLog('fail',`[Email Stream] Fatal error for user ${userId}:`, error);
      
      sendEvent({
        phase: 'error',
        message: 'Email exploration failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      try {
        res.end();
      } catch (resError) {
        config.smartLog('fail','Error closing SSE connection:', resError);
      }
    }
  }
);

function isEmailCacheStale(cached) {
  if (!cached.completedAt) return true;
  const ageInHours = (Date.now() - new Date(cached.completedAt).getTime()) / (1000 * 60 * 60);
  return ageInHours >= (24 * 365);
}

router.post('/explore-multiple-domains', 
  isAuthenticated, 
  checkEmailSearchLimits,
  async (req, res) => {
    try {
      const { domains, maxDepth = 2 } = req.body;
      const { userData, userId, emailLimits, canUseLive, currentLiveUsage, currentCacheUsage } = req.emailSearchContext;
      
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Domains array is required'
        });
      }

      let needsLiveSearch = 0;
      let needsCacheSearch = 0;
      
      domains.forEach(domain => {
        if (!hasCachedEmailData(domain)) {
          needsLiveSearch++;
        } else {
          needsCacheSearch++;
        }
      });

      if (needsLiveSearch > 0 && !canUseLive) {
        return res.status(403).json({
          success: false,
          message: 'Live email search not available for your plan',
          errorType: 'LIVE_EMAIL_SEARCH_NOT_ALLOWED',
          userPlan: userData.subscription?.plan || 'free'
        });
      }

      if (needsLiveSearch > (emailLimits.liveSearches - currentLiveUsage)) {
        return res.status(429).json({
          success: false,
          message: 'Insufficient live email search credits',
          errorType: 'EMAIL_LIVE_LIMIT_EXCEEDED',
          userPlan: userData.subscription?.plan || 'free'
        });
      }

      if (needsCacheSearch > (emailLimits.cacheSearches - currentCacheUsage)) {
        return res.status(429).json({
          success: false,
          message: 'Insufficient email cache search credits',
          errorType: 'EMAIL_CACHE_LIMIT_EXCEEDED',
          userPlan: userData.subscription?.plan || 'free'
        });
      }
      
      const results = [];
      let actualLiveUsed = 0;
      let actualCacheUsed = 0;
      
      for (const domain of domains) {
        try {
          const cached = await emailExplorer.getCachedResults(domain);
          
          if (cached && !isStale(cached)) {
            config.smartLog('buffer',`[Email Search] Using cached results for ${domain}`);
            results.push({
              domain: cached.domain,
              success: true,
              emails: cached.emails,
              stats: cached.stats,
              fromCache: true
            });
            actualCacheUsed++;
          } else {
            config.smartLog('buffer',`[Email Search] Exploring ${domain}`);
            const result = await emailExplorer.exploreDomain(domain, { 
              maxDepth,
              searchContactPages: true
            });
            
            results.push({
              domain: result.domain,
              success: result.stats.totalPages > 0,
              emails: result.emails,
              stats: result.stats,
              errors: result.stats.errors,
              fromCache: false
            });
            actualLiveUsed++;
          }
        } catch (error) {
          config.smartLog('fail',`[Email Search] Error exploring ${domain}:`, error);
          results.push({
            domain: new URL(domain).hostname,
            success: false,
            error: error.message,
            emails: [],
            stats: {
              totalPages: 0,
              contactPages: 0,
              emailsFound: 0,
              uniqueEmails: 0,
              errors: [{
                url: domain,
                error: error.message,
                code: error.code || 'UNKNOWN'
              }]
            }
          });
        }
      }

      await updateEmailSearchUsage(userId, actualLiveUsed, actualCacheUsed);
      
      const totalEmails = results.reduce((sum, r) => 
        sum + (r.success && r.emails ? r.emails.length : 0), 0
      );
      
      res.json({
        success: true,
        results: results,
        summary: {
          domainsProcessed: domains.length,
          successfulExplorations: results.filter(r => r.success).length,
          totalEmailsFound: totalEmails,
          fromCache: results.filter(r => r.fromCache).length,
          creditsUsed: {
            live: actualLiveUsed,
            cache: actualCacheUsed
          }
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

function isStale(cached) {
  if (!cached.completedAt) return true;
  const ageInDays = (Date.now() - new Date(cached.completedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageInDays > 100; 
}

router.get('/email-history', isAuthenticated, async (req, res) => {
  try {
    const cacheDir = path.join(__dirname, '../cache');
    config.smartLog('buffer','Looking for cache in:', cacheDir);
    
    const files = await fs.readdir(cacheDir);
    
    const emailExplorations = [];
    
    for (const file of files) {
      if (file.startsWith('email_exploration_')) {
        const filepath = path.join(cacheDir, file);
        const stats = await fs.stat(filepath);
        const content = await fs.readFile(filepath, 'utf8');
        const data = JSON.parse(content);
        
        emailExplorations.push({
          domain: data.domain,
          exploredAt: data.completedAt || data.startedAt,
          emailsFound: data.stats.uniqueEmails,
          pagesExplored: data.stats.totalPages,
          fileAge: Math.round((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60))
        });
      }
    }
    
    emailExplorations.sort((a, b) => 
      new Date(b.exploredAt) - new Date(a.exploredAt)
    );
    
    res.json({
      success: true,
      explorations: emailExplorations,
      total: emailExplorations.length
    });
    
  } catch (error) {
    config.smartLog('fail','Email history error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/get-domain-emails/:domain', isAuthenticated, async (req, res) => {
  try {
    const domain = req.params.domain;
    const cacheDir = path.join(__dirname, '../cache');
    const files = await fs.readdir(cacheDir);
    
    let latestExploration = null;
    let latestTime = 0;
    
    for (const file of files) {
      if (file.startsWith('email_exploration_') && file.includes(domain)) {
        const filepath = path.join(cacheDir, file);
        const stats = await fs.stat(filepath);
        
        if (stats.mtime.getTime() > latestTime) {
          latestTime = stats.mtime.getTime();
          const content = await fs.readFile(filepath, 'utf8');
          latestExploration = JSON.parse(content);
        }
      }
    }
    
    if (latestExploration) {
      res.json({
        success: true,
        data: latestExploration
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'No email data found for this domain'
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/quick-email-scan', 
  isAuthenticated, 
  checkEmailSearchLimits,
  async (req, res) => {
    try {
      const { url } = req.body;
      const { userId } = req.emailSearchContext;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL is required'
        });
      }
      
      const result = await emailScraper.scrapeEmails(url, {
        searchContactPages: true,
        usePlaywright: false
      });

      await updateEmailSearchUsage(userId, 1, 0);
      
      res.json({
        success: true,
        result: result
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

router.post('/search-cache-only', 
  isAuthenticated, 
  checkEmailSearchLimits,
  async (req, res) => {
    try {
      const { domains } = req.body;
      const { userData, userId, emailLimits, currentCacheUsage } = req.emailSearchContext;
      
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Domains array is required'
        });
      }

      const cacheDomainsNeeded = domains.filter(domain => hasCachedEmailData(domain)).length;
      
      if (cacheDomainsNeeded > (emailLimits.cacheSearches - currentCacheUsage)) {
        return res.status(429).json({
          success: false,
          message: `Insufficient email cache search credits. Need ${cacheDomainsNeeded}, have ${emailLimits.cacheSearches - currentCacheUsage}`,
          errorType: 'EMAIL_CACHE_LIMIT_EXCEEDED',
          userPlan: userData.subscription?.plan || 'free',
          needed: cacheDomainsNeeded,
          available: emailLimits.cacheSearches - currentCacheUsage
        });
      }

      const results = [];
      let actualCacheUsed = 0;
      
      for (const domain of domains) {
        try {
          const cached = await emailExplorer.getCachedResults(domain);
          
          if (cached && !isEmailCacheStale(cached)) {
            results.push({
              domain: cached.domain,
              success: true,
              emails: cached.emails || [],
              stats: cached.stats,
              fromCache: true,
              exploredAt: cached.completedAt
            });
            actualCacheUsed++;
          }
        } catch (error) {
          config.smartLog('fail',`[Email Cache Search] Error loading cache for ${domain}:`, error);
        }
      }

      await updateEmailSearchUsage(userId, 0, actualCacheUsed);

      const totalEmails = results.reduce((sum, r) => 
        sum + (r.success && r.emails ? r.emails.length : 0), 0
      );
      
      res.json({
        success: true,
        results: results,
        summary: {
          domainsProcessed: domains.length,
          successfulExplorations: results.filter(r => r.success).length,
          totalEmailsFound: totalEmails,
          fromCache: results.length,
          searchType: 'cache_only',
          creditsUsed: {
            live: 0,
            cache: actualCacheUsed
          }
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

module.exports = router;