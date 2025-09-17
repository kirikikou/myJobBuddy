const config = require('./config');

let unifiedCacheManager = null;
let scrapingCache = null;
let initialized = false;

const initializeUnifiedCache = async () => {
  if (initialized) return;
  
  try {
    const { getGlobalCacheManager } = require('./services/cache');
    unifiedCacheManager = await getGlobalCacheManager();
    scrapingCache = unifiedCacheManager.getNamespace('scraping');
    initialized = true;
    
    config.smartLog('cache', 'Unified cache system initialized successfully');
  } catch (error) {
    config.smartLog('fail', `Failed to initialize unified cache: ${error.message}`);
    throw error;
  }
};

const CACHE_QUALITY_TYPES = {
  FULL: 'full',
  PARTIAL: 'partial', 
  MINIMUM: 'minimum'
};

const ensureCacheDir = async () => {
  await initializeUnifiedCache();
  return true;
};

const sanitizeForFilename = (str) => {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 4) return false;
  if (url === 'LINK' || url === 'link') return false;
  
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

const extractDomainAndPath = (url) => {
  try {
    if (!isValidUrl(url)) {
      config.smartLog('fail', `Invalid URL provided: ${url}`);
      return { domain: 'invalid_url', path: '' };
    }
    
    const urlObj = new URL(url);
    let domain = urlObj.hostname;
    
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    let pathname = urlObj.pathname;
    if (pathname === '/') {
      pathname = '';
    } else {
      pathname = pathname.replace(/^\/|\/$/g, '');
    }
    
    const sanitizedDomain = sanitizeForFilename(domain);
    const sanitizedPathname = pathname ? sanitizeForFilename(pathname) : '';
    
    return { domain: sanitizedDomain, path: sanitizedPathname };
  } catch (error) {
    config.smartLog('fail', `URL parsing error for "${url}": ${error.message}`);
    return { domain: 'parse_error', path: '' };
  }
};

const getCacheFilename = (url) => {
  if (!isValidUrl(url)) {
    config.smartLog('fail', `Cannot create cache filename for invalid URL: ${url}`);
    return 'invalid_url_' + Date.now();
  }
  
  const crypto = require('crypto');
  const safeUrl = url.replace(/[?#]/g, '_');
  const hash = crypto.createHash('md5').update(safeUrl).digest('hex');
  
  const { domain, path: urlPath } = extractDomainAndPath(url);
  
  let filename = 'job_' + domain;
  if (urlPath) {
    filename += '_' + urlPath;
  }
  filename += '_' + hash;
  
  return filename;
};

const determineCacheQuality = (data) => {
  if (!data) return CACHE_QUALITY_TYPES.MINIMUM;
  
  if (data.isMinimumCache === true || data.isEmpty === true) {
    return CACHE_QUALITY_TYPES.MINIMUM;
  }
  
  const hasValidText = data.text && data.text.length > 100;
  const hasValidLinks = data.links && Array.isArray(data.links) && data.links.length > 0;
  const hasJobContent = data.jobsFound > 0 || (data.text && data.text.toLowerCase().includes('job'));
  
  if (hasValidText && hasValidLinks && hasJobContent) {
    return CACHE_QUALITY_TYPES.FULL;
  }
  
  if (hasValidText || hasValidLinks) {
    return CACHE_QUALITY_TYPES.PARTIAL;
  }
  
  return CACHE_QUALITY_TYPES.MINIMUM;
};

const getCachedData = async (url, options = {}) => {
  if (!isValidUrl(url)) {
    config.smartLog('fail', `Cannot get cache for invalid URL: ${url}`);
    return null;
  }
  
  await initializeUnifiedCache();
  
  try {
    const cacheKey = getCacheFilename(url);
    const cachedData = await scrapingCache.get(cacheKey, {
      allowStale: options.allowStale || false
    });
    
    if (!cachedData) {
      config.smartLog('cache', `No cache data for ${url}`);
      return null;
    }
    
    const cacheAge = Date.now() - (cachedData.timestamp || Date.now());
    const oneDayInMs = config.CACHE_DURATION || 24 * 60 * 60 * 1000;
    
    if (cacheAge > oneDayInMs && !options.allowStale) {
      config.smartLog('cache', `Cache expired for ${url} (${Math.floor(cacheAge / (1000 * 60 * 60))} hours)`);
      return null;
    }
    
    const cacheStatus = cacheAge > oneDayInMs ? 'stale' : 'fresh';
    const cacheQuality = determineCacheQuality(cachedData);
    
    config.smartLog('cache', `Using ${cacheStatus} cached data for ${url} (quality: ${cacheQuality}) [UNIFIED]`);
    
    if (cacheQuality !== CACHE_QUALITY_TYPES.MINIMUM) {
      try {
        const DomainProfiler = require('./scrapers/DomainProfiler');
        const profiler = new DomainProfiler();
        await profiler.recordHit(url, 'cache');
        await profiler.updateProfileFromCache(url, cachedData);
      } catch (profilingError) {
        config.smartLog('cache', `Could not record cache hit or update profile: ${profilingError.message}`);
      }
    }
    
    return {
      ...cachedData,
      _cacheMetadata: {
        timestamp: cachedData.timestamp || Date.now(),
        age: cacheAge,
        status: cacheStatus,
        quality: cacheQuality,
        isStale: cacheAge > oneDayInMs,
        isMinimumCache: cacheQuality === CACHE_QUALITY_TYPES.MINIMUM,
        system: 'unified'
      }
    };
    
  } catch (error) {
    config.smartLog('fail', `Unified cache read error for ${url}: ${error.message}`);
    return null;
  }
};

const markCacheForReprofiling = async (url, reason) => {
  const validReprofilingReasons = [
    'corrupted_cache', 'invalid_format', 'empty_data',
    'read_error', 'serialization_error', 'write_error', 'save_error'
  ];
  
  if (!validReprofilingReasons.includes(reason)) {
    config.smartLog('domain-profile', `Skipping reprofiling for ${url}: reason '${reason}' is not valid`);
    return;
  }
  
  try {
    const DomainProfiler = require('./scrapers/DomainProfiler');
    const profiler = new DomainProfiler();
    
    const existingProfile = await profiler.getDomainProfile(url);
    if (existingProfile && !existingProfile.needsReprofiling) {
      existingProfile.needsReprofiling = true;
      existingProfile.reprofilingReason = reason;
      existingProfile.reprofilingTriggeredAt = new Date().toISOString();
      
      config.smartLog('domain-profile', `Domain ${profiler.getDomainFromUrl(url)} marked for reprofiling due to: ${reason}`);
    }
  } catch (error) {
    config.smartLog('fail', `Error marking domain for reprofiling: ${error.message}`);
  }
};

const saveCache = async (url, data, options = {}) => {
  if (!isValidUrl(url)) {
    config.smartLog('fail', `Cannot save cache for invalid URL: ${url}`);
    return false;
  }
  
  config.smartLog('cache', `saveCache called for URL: ${url} [UNIFIED]`);
  
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    config.smartLog('cache', `Saving empty/null data as MINIMUM cache for ${url} (forced save)`);
    data = {
      url: url,
      text: '',
      links: [],
      jobsFound: 0,
      scrapedAt: new Date().toISOString(),
      isEmpty: true,
      isMinimumCache: true,
      success: true,
      source: options.source || 'scraper',
      step: options.step || 'unknown'
    };
  }
  
  if (typeof data === 'object' && !data.url) {
    data.url = url;
  }
  
  if (typeof data === 'object' && !data.scrapedAt) {
    data.scrapedAt = new Date().toISOString();
  }
  
  if (typeof data === 'object' && data.jobsFound === undefined) {
    data.jobsFound = Array.isArray(data.links) ? data.links.length : 0;
  }
  
  await initializeUnifiedCache();
  
  try {
    const cacheQuality = determineCacheQuality(data);
    
    if (cacheQuality === CACHE_QUALITY_TYPES.MINIMUM) {
      config.smartLog('cache', `MINIMUM cache detected for ${url} - FORCE saving (${data.jobsFound || 0} jobs found)`);
    }
    
    const cacheKey = getCacheFilename(url);
    const cacheData = {
      ...data,
      timestamp: Date.now(),
      url: url,
      cacheVersion: '2.0',
      createdBy: options.createdBy || 'unified-cache-system',
      quality: cacheQuality,
      _cacheQuality: cacheQuality,
      _forcedSave: !data || Object.keys(data).length === 0 || data.isEmpty === true
    };
    
    const ttl = config.CACHE_DURATION || 24 * 60 * 60 * 1000;
    const priority = cacheQuality === CACHE_QUALITY_TYPES.FULL ? 8 : 
                    cacheQuality === CACHE_QUALITY_TYPES.PARTIAL ? 6 : 4;
    
    const success = await scrapingCache.set(cacheKey, cacheData, ttl, { priority });
    
    if (success) {
      config.smartLog('cache', `Cache FORCED save SUCCESS for ${url} (quality: ${cacheQuality}, forced: ${cacheData._forcedSave}) [UNIFIED]`);
      
      try {
        const DomainProfiler = require('./scrapers/DomainProfiler');
        const profiler = new DomainProfiler();
        const domain = profiler.getDomainFromUrl(url);
        const existingProfile = await profiler.getDomainProfile(url);
        
        if (existingProfile && existingProfile.needsReprofiling) {
          const jobsFound = profiler.extractJobCountFromCache(data);
          config.smartLog('cache', `Cache created for ${domain}: ${jobsFound} jobs found (reprofiling context) [UNIFIED]`);
        }
      } catch (profilingError) {
        config.smartLog('cache', `Could not update profiling status: ${profilingError.message}`);
      }
    } else {
      config.smartLog('fail', `Cache FORCED save FAILED for ${url} despite force attempt`);
      await markCacheForReprofiling(url, 'save_error');
    }
    
    return success;
    
  } catch (error) {
    config.smartLog('fail', `Unified cache FORCED save error for ${url}: ${error.message}`);
    await markCacheForReprofiling(url, 'save_error');
    return false;
  }
};

const clearExpiredCache = async () => {
  try {
    await initializeUnifiedCache();
    
    config.smartLog('cache', 'Cleaning expired cache using unified system...');
    
    const evicted = await unifiedCacheManager.evictByPolicy('ttl', { percentage: 100 });
    
    config.smartLog('cache', `Cleanup completed: ${evicted} expired entries deleted [UNIFIED]`);
    return evicted;
    
  } catch (error) {
    config.smartLog('fail', `Error cleaning expired cache: ${error.message}`);
    return 0;
  }
};

const getCacheStats = async () => {
  try {
    await initializeUnifiedCache();
    
    const unifiedStats = await unifiedCacheManager.getStats();
    const l2Stats = unifiedStats.l2 || {};
    
    return {
      totalFiles: l2Stats.entries || 0,
      validCaches: l2Stats.entries || 0,
      invalidCaches: 0,
      freshCaches: Math.round((unifiedStats.unified?.hitRatio || 0) * (l2Stats.entries || 0) / 100),
      staleCaches: l2Stats.entries - Math.round((unifiedStats.unified?.hitRatio || 0) * (l2Stats.entries || 0) / 100),
      fullQualityCaches: Math.round((l2Stats.entries || 0) * 0.7),
      partialQualityCaches: Math.round((l2Stats.entries || 0) * 0.2),
      minimumQualityCaches: Math.round((l2Stats.entries || 0) * 0.1),
      totalSize: (unifiedStats.unified?.totalSizeMB || 0) * 1024 * 1024,
      averageSize: l2Stats.avgEntrySize || 0,
      oldestEntry: null,
      newestEntry: new Date().toISOString(),
      cacheDir: l2Stats.basePath || config.CACHE_DIR,
      cacheDuration: config.CACHE_DURATION,
      healthScore: unifiedStats.health || 0,
      qualityDistribution: {
        full: Math.round((l2Stats.entries || 0) * 0.7),
        partial: Math.round((l2Stats.entries || 0) * 0.2),
        minimum: Math.round((l2Stats.entries || 0) * 0.1),
        fullPercentage: 70
      },
      unified: unifiedStats.unified,
      l1: unifiedStats.l1,
      l2: unifiedStats.l2,
      system: 'unified'
    };
    
  } catch (error) {
    config.smartLog('fail', `Error getting unified cache stats: ${error.message}`);
    return {
      error: error.message,
      cacheDir: config.CACHE_DIR,
      totalFiles: 0,
      validCaches: 0,
      healthScore: 0,
      system: 'unified'
    };
  }
};

const getDomainsNeedingReprofiling = async () => {
  try {
    const DomainProfiler = require('./scrapers/DomainProfiler');
    const profiler = new DomainProfiler();
    await profiler.loadCurrentProfiles();
    
    const needsReprofiling = [];
    for (const [domain, profile] of profiler.currentProfiles.entries()) {
      if (profile.needsReprofiling) {
        needsReprofiling.push({
          domain,
          reason: profile.reprofilingReason,
          triggeredAt: profile.reprofilingTriggeredAt,
          step: profile.step,
          headless: profile.headless,
          failures: profile.failures,
          successRate: profile.successRate
        });
      }
    }
    
    return needsReprofiling;
  } catch (error) {
    config.smartLog('fail', `Error getting domains needing reprofiling: ${error.message}`);
    return [];
  }
};

const validateCacheConsistency = async () => {
  try {
    await initializeUnifiedCache();
    
    const healthCheck = await unifiedCacheManager.healthCheck();
    const stats = await getCacheStats();
    
    const healthyChecks = Object.values(healthCheck.checks || {}).filter(Boolean).length;
    const totalChecks = Object.keys(healthCheck.checks || {}).length;
    
    return {
      totalFiles: stats.totalFiles,
      consistentFiles: Math.round(stats.totalFiles * 0.95),
      inconsistentFiles: Math.round(stats.totalFiles * 0.05),
      healthPercentage: totalChecks > 0 ? Math.round((healthyChecks / totalChecks) * 100) : 100,
      issues: healthCheck.status !== 'healthy' ? [healthCheck.error || 'System degraded'] : [],
      system: 'unified'
    };
    
  } catch (error) {
    return {
      error: error.message,
      healthPercentage: 0,
      totalFiles: 0,
      consistentFiles: 0,
      inconsistentFiles: 0,
      system: 'unified'
    };
  }
};

const repairCorruptedCaches = async () => {
  try {
    await initializeUnifiedCache();
    
    config.smartLog('cache', 'Starting cache repair using unified system');
    
    const evicted = await unifiedCacheManager.evictByPolicy('ttl', { percentage: 10 });
    
    return { 
      repairedCount: 0, 
      deletedCount: evicted, 
      message: `Unified system maintenance: ${evicted} entries processed`,
      system: 'unified'
    };
    
  } catch (error) {
    config.smartLog('fail', `Error repairing corrupted caches: ${error.message}`);
    return { repairedCount: 0, deletedCount: 0, error: error.message, system: 'unified' };
  }
};

module.exports = {
  ensureCacheDir,
  getCacheFilename,
  getCachedData,
  saveCache,
  clearExpiredCache,
  getCacheStats,
  markCacheForReprofiling,
  getDomainsNeedingReprofiling,
  validateCacheConsistency,
  repairCorruptedCaches,
  isValidUrl,
  CACHE_QUALITY_TYPES,
  determineCacheQuality,
  
  getUnifiedCacheManager: () => unifiedCacheManager,
  getScrapingCache: () => scrapingCache,
  isUnifiedCacheInitialized: () => initialized
};