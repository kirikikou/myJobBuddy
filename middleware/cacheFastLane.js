const config = require('../config');
const cacheManager = require('../cacheManager');
const userPreferencesManager = require('../userPreferencesManager');
const dictionaries = require('../dictionaries');

const extractUserInfo = (req) => {
  const stressTestUserId = config.testing?.stressTestUserId || 'stress_test_user';
  const stressTestEmail = config.testing?.stressTestEmail || 'stress@test.local';
  const anonymousPrefix = config.auth?.anonymousPrefix || 'anonymous_';
  
  if (req.headers['x-stress-test'] === 'true') {
    return {
      userId: req.headers['x-user-id'] || stressTestUserId,
      userEmail: req.headers['x-user-email'] || stressTestEmail
    };
  }
  
  if (req.user && req.isAuthenticated && req.isAuthenticated()) {
    return {
      userId: req.user._id.toString(),
      userEmail: req.user.email
    };
  }
  
  const userId = req.body.userId || req.headers['x-user-id'] || anonymousPrefix + Date.now();
  const userEmail = req.body.userEmail || req.headers['x-user-email'] || null;
  return { userId, userEmail };
};

const canServeCacheHit = async (req) => {
  const path = req.path || req.route?.path || '';
  
  if (dictionaries.isCacheOnlyEndpoint(path)) {
    return { canServe: true, reason: 'cache-only-endpoint' };
  }
  
  if (dictionaries.isLightEndpoint(path) || dictionaries.isSystemEndpoint(path)) {
    return { canServe: true, reason: 'reading-endpoint' };
  }
  
  const searchEndpoints = dictionaries.routeCategories.HEAVY_ENDPOINTS.filter(endpoint => 
    endpoint.includes('search-career-pages')
  );
  
  if (searchEndpoints.some(endpoint => path.startsWith(endpoint)) && req.method === 'POST' && req.body) {
    const { urls, careerPages, careerPageUrls } = req.body;
    const allUrls = [
      ...(Array.isArray(urls) ? urls : []),
      ...(Array.isArray(careerPages) ? careerPages : []),
      ...(Array.isArray(careerPageUrls) ? careerPageUrls : [])
    ].filter(url => url && typeof url === 'string').map(url => url.trim());
    
    if (allUrls.length === 0) {
      return { canServe: false, reason: 'no-urls' };
    }
    
    const freshHours = config.cache?.freshHours || config.CACHE_TTL_HOURS || config.CACHE_FRESH_HOURS || 24;
    const freshMs = freshHours * 60 * 60 * 1000;
    
    let allCached = true;
    let cachedCount = 0;
    
    for (const url of allUrls) {
      try {
        const cacheFile = cacheManager.getCacheFilename(url);
        const stats = await require('fs').promises.stat(cacheFile);
        const cacheAge = Date.now() - stats.mtime.getTime();
        
        if (cacheAge < freshMs) {
          cachedCount++;
        } else {
          allCached = false;
        }
      } catch (error) {
        allCached = false;
      }
    }
    
    if (allCached && cachedCount === allUrls.length) {
      return { canServe: true, reason: 'all-domains-cached', cachedCount, totalUrls: allUrls.length };
    }
    
    if (cachedCount > 0) {
      return { canServe: false, reason: 'partial-cache', cachedCount, totalUrls: allUrls.length };
    }
  }
  
  return { canServe: false, reason: 'no-cache-available' };
};

const serveCacheResponse = async (req, res) => {
  const path = req.path || req.route?.path || '';
  const { userId, userEmail } = extractUserInfo(req);
  
  try {
    const userPrefsEndpoints = dictionaries.routeCategories.LIGHT_ENDPOINTS.filter(endpoint => 
      endpoint.includes('get-user-preferences')
    );
    
    if (userPrefsEndpoints.some(endpoint => path.startsWith(endpoint))) {
      const preferences = await userPreferencesManager.ensureUserPreferences(userId);
      config.smartLog(dictionaries.logCategories.CACHE, `Fast-lane: served user preferences for ${userId}`);
      return res.status(200).json({
        success: true,
        preferences: preferences
      });
    }
    
    const searchCacheEndpoints = dictionaries.routeCategories.CACHE_ONLY_ENDPOINTS;
    const searchCareerEndpoints = dictionaries.routeCategories.HEAVY_ENDPOINTS.filter(endpoint => 
      endpoint.includes('search-career-pages')
    );
    
    const isSearchEndpoint = [...searchCacheEndpoints, ...searchCareerEndpoints].some(endpoint => 
      path.startsWith(endpoint)
    );
    
    if (isSearchEndpoint) {
      const { jobTitles, urls, careerPages, careerPageUrls } = req.body;
      
      const normalizedJobTitles = Array.isArray(jobTitles) ? 
        jobTitles.filter(title => title && typeof title === 'string').map(title => title.trim()) : [];
      
      const normalizedUrls = [
        ...(Array.isArray(urls) ? urls : []),
        ...(Array.isArray(careerPages) ? careerPages : []),
        ...(Array.isArray(careerPageUrls) ? careerPageUrls : [])
      ].filter(url => url && typeof url === 'string').map(url => url.trim());
      
      const validationError = config.validation?.requiredFieldsError || 'Job titles and URLs are required';
      const validationCode = config.validation?.errorCode || 'VALIDATION_ERROR';
      
      if (normalizedJobTitles.length === 0 || normalizedUrls.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: validationCode, message: validationError }
        });
      }
      
      const searchResults = [];
      let processedCount = 0;
      
      for (const url of normalizedUrls) {
        try {
          const pageData = await cacheManager.getCachedData(url);
          if (pageData && !pageData._cacheMetadata?.isMinimumCache) {
            processedCount++;
            
            const matches = findJobMatchesBasic(pageData, normalizedJobTitles);
            if (matches.length > 0) {
              searchResults.push(...matches.map(match => ({
                title: match.title,
                url: match.url,
                description: match.description || '',
                date: pageData.scrapedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                source: extractShortDomain(url),
                confidence: match.confidence || 0
              })));
            }
          }
        } catch (error) {
          config.smartLog(dictionaries.logCategories.CACHE, `Fast-lane cache read error for ${url}: ${error.message}`);
        }
      }
      
      if (processedCount > 0) {
        const searchType = config.cache?.fastLaneSearchType || 'cache_fast_lane';
        config.smartLog(dictionaries.logCategories.CACHE, `Fast-lane: served ${searchResults.length} results from ${processedCount}/${normalizedUrls.length} cached domains`);
        
        return res.json({
          success: true,
          results: searchResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
          searchType: searchType,
          domainsProcessed: processedCount,
          domainsCached: processedCount,
          message: `Fast-lane cache: ${searchResults.length} results from ${processedCount} cached domains`
        });
      }
    }
    
    if (dictionaries.isLightEndpoint(path) || dictionaries.isSystemEndpoint(path)) {
      config.smartLog(dictionaries.logCategories.CACHE, `Fast-lane: bypassed gate for reading endpoint ${path}`);
      return null;
    }
    
  } catch (error) {
    config.smartLog(dictionaries.logCategories.FAIL, `Fast-lane cache error: ${error.message}`);
    return null;
  }
  
  return null;
};

const findJobMatchesBasic = (pageData, jobTitles) => {
  const matches = [];
  const pageTextLower = (pageData.text || '').toLowerCase();
  const highConfidence = config.matching?.highConfidence || 90;
  const mediumConfidence = config.matching?.mediumConfidence || 70;
  
  if (pageData.links && Array.isArray(pageData.links)) {
    for (const link of pageData.links) {
      if (link.text && link.url) {
        const linkTextLower = link.text.toLowerCase();
        
        for (const jobTitle of jobTitles) {
          const jobTitleLower = jobTitle.toLowerCase();
          
          if (linkTextLower.includes(jobTitleLower) || 
              (pageTextLower.includes(jobTitleLower) && link.isJobPosting)) {
            matches.push({
              title: link.text,
              url: link.url,
              description: link.text,
              confidence: linkTextLower.includes(jobTitleLower) ? highConfidence : mediumConfidence
            });
            break;
          }
        }
      }
    }
  }
  
  return matches;
};

const extractShortDomain = (url) => {
  try {
    const urlObj = new URL(url);
    const wwwPrefix = config.domains?.wwwPrefix || 'www.';
    return urlObj.hostname.replace(wwwPrefix, '');
  } catch (e) {
    const protocolRegex = config.domains?.protocolRegex || /^https?:\/\/(www\.)?/;
    const pathSeparator = config.domains?.pathSeparator || '/';
    return url.replace(protocolRegex, '').split(pathSeparator)[0];
  }
};

const cacheFastLane = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const cacheCheck = await canServeCacheHit(req);
    
    if (cacheCheck.canServe) {
      const cacheResponse = await serveCacheResponse(req, res);
      
      if (cacheResponse !== null) {
        const duration = Date.now() - startTime;
        config.smartLog(dictionaries.logCategories.CACHE, `Fast-lane bypass completed in ${duration}ms (${cacheCheck.reason})`);
        return;
      } else {
        config.smartLog(dictionaries.logCategories.CACHE, `Fast-lane bypass allowed for ${req.path} (${cacheCheck.reason})`);
      }
    } else {
      config.smartLog(dictionaries.logCategories.CACHE, `Fast-lane: no bypass for ${req.path} (${cacheCheck.reason})`);
    }
    
  } catch (error) {
    config.smartLog(dictionaries.logCategories.FAIL, `Fast-lane error: ${error.message}`);
  }
  
  next();
};

cacheFastLane.canServeCacheHit = canServeCacheHit;

module.exports = cacheFastLane;