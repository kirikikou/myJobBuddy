const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const CACHE_QUALITY_TYPES = {
  FULL: 'full',
  PARTIAL: 'partial', 
  MINIMUM: 'minimum'
};

const cacheMetrics = {
  hits: 0,
  misses: 0,
  writes: 0,
  errors: 0,
  lastReset: Date.now()
};

const ttlMetrics = {
  fresh: 0,
  stale: 0,
  expired: 0,
  invalidations: 0
};

const ensureCacheDir = async () => {
  config.smartLog('cache', `Cache directory path: ${path.resolve(config.CACHE_DIR)}`);
  
  try {
    try {
      const stats = await fs.stat(config.CACHE_DIR);
      if (stats.isDirectory()) {
        config.smartLog('cache', `Existing cache directory: ${config.CACHE_DIR}`);
        return true;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        config.smartLog('fail', `Cache directory check error: ${err.message}`);
        return false;
      }
    }

    config.smartLog('cache', `Creating cache directory: ${config.CACHE_DIR}`);
    await fs.mkdir(config.CACHE_DIR, { recursive: true });
    config.smartLog('cache', `Cache directory created successfully: ${config.CACHE_DIR}`);
    
    const stats = await fs.stat(config.CACHE_DIR);
    if (stats.isDirectory()) {
      const testFile = path.join(config.CACHE_DIR, 'test.json');
      await fs.writeFile(testFile, JSON.stringify({ test: true }));
      await fs.unlink(testFile);
      config.smartLog('cache', `Cache directory write test successful`);
      return true;
    } else {
      config.smartLog('fail', `Cache directory exists but is not a directory: ${config.CACHE_DIR}`);
      return false;
    }
  } catch (err) {
    config.smartLog('fail', `Cache directory creation/test error: ${err.message}`);
    return false;
  }
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
    return path.join(config.CACHE_DIR, 'invalid_url_' + Date.now() + '.json');
  }
  
  const safeUrl = url.replace(/[?#]/g, '_');
  const hash = crypto.createHash('md5').update(safeUrl).digest('hex');
  
  const { domain, path: urlPath } = extractDomainAndPath(url);
  
  let filename = 'job_' + domain;
  if (urlPath) {
    filename += '_' + urlPath;
  }
  filename += '_' + hash + '.json';
  
  return path.join(config.CACHE_DIR, filename);
};

const getArbitraryKeyFilename = (key) => {
  const sanitizedKey = sanitizeForFilename(key);
  const hash = crypto.createHash('md5').update(key).digest('hex').slice(0, 8);
  const filename = `cache_${sanitizedKey}_${hash}.json`;
  return path.join(config.CACHE_DIR, filename);
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

const updateCacheMetrics = (operation, result = 'success') => {
  const now = Date.now();
  
  switch (operation) {
    case 'hit':
      cacheMetrics.hits++;
      break;
    case 'miss':
      cacheMetrics.misses++;
      break;
    case 'write':
      cacheMetrics.writes++;
      break;
    case 'error':
      cacheMetrics.errors++;
      break;
  }
  
  if (now - cacheMetrics.lastReset > 24 * 60 * 60 * 1000) {
    cacheMetrics.hits = 0;
    cacheMetrics.misses = 0;
    cacheMetrics.writes = 0;
    cacheMetrics.errors = 0;
    cacheMetrics.lastReset = now;
    
    ttlMetrics.fresh = 0;
    ttlMetrics.stale = 0;
    ttlMetrics.expired = 0;
    ttlMetrics.invalidations = 0;
  }
};

const updateTtlMetrics = (status) => {
  switch (status) {
    case 'fresh':
      ttlMetrics.fresh++;
      break;
    case 'stale':
      ttlMetrics.stale++;
      break;
    case 'expired':
      ttlMetrics.expired++;
      break;
    case 'invalidated':
      ttlMetrics.invalidations++;
      break;
  }
};

const getCachedData = async (url, options = {}) => {
  if (!isValidUrl(url)) {
    config.smartLog('fail', `Cannot get cache for invalid URL: ${url}`);
    updateCacheMetrics('error');
    return null;
  }
  
  const cacheFile = getCacheFilename(url);
  
  try {
    const data = await fs.readFile(cacheFile, 'utf-8');
    
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch (parseError) {
      config.smartLog('fail', `Invalid JSON in cache for ${url}: ${parseError.message}`);
      updateCacheMetrics('error');
      
      if (options.fallbackOnError) {
        config.smartLog('cache', `Cache corrupted, triggering fallback for ${url}`);
        await markCacheForReprofiling(url, 'corrupted_cache');
      }
      return null;
    }
    
    if (!parsedData.timestamp) {
      config.smartLog('fail', `Invalid cache format for ${url} - missing timestamp`);
      updateCacheMetrics('error');
      
      if (options.fallbackOnError) {
        config.smartLog('cache', `Invalid cache format, triggering fallback for ${url}`);
        await markCacheForReprofiling(url, 'invalid_format');
      }
      return null;
    }
    
    const cacheAge = Date.now() - parsedData.timestamp;
    const oneDayInMs = config.CACHE_DURATION || 24 * 60 * 60 * 1000;
    const thirtyOneDaysInMs = 31 * 24 * 60 * 60 * 1000;
    
    if (cacheAge > oneDayInMs && !options.allowStale) {
      config.smartLog('cache', `Cache expired for ${url} (${Math.floor(cacheAge / (1000 * 60 * 60))} hours)`);
      updateCacheMetrics('miss');
      updateTtlMetrics('expired');
      return null;
    }
    
    if (!parsedData.data || (parsedData.data.links && parsedData.data.links.length === 0)) {
      config.smartLog('cache', `Cache contains empty data for ${url}`);
      updateCacheMetrics('miss');
      
      if (options.fallbackOnError) {
        config.smartLog('cache', `Empty cache data, triggering fallback for ${url}`);
        await markCacheForReprofiling(url, 'empty_data');
      }
      return null;
    }
    
    const isStale = cacheAge > oneDayInMs;
    const cacheStatus = isStale ? 'stale' : 'fresh';
    const cacheQuality = determineCacheQuality(parsedData.data);
    
    updateCacheMetrics('hit');
    updateTtlMetrics(cacheStatus);
    
    config.smartLog('cache', `Using ${cacheStatus} cached data for ${url} from ${new Date(parsedData.timestamp).toISOString()} (quality: ${cacheQuality})`);
    
    if (cacheQuality !== CACHE_QUALITY_TYPES.MINIMUM) {
      try {
        const DomainProfiler = require('./scrapers/DomainProfiler');
        const profiler = DomainProfiler.getInstance();
        await profiler.recordHit(url, 'cache');
        await profiler.updateProfileFromCache(url, parsedData.data);
        
      } catch (profilingError) {
        config.smartLog('cache', `Could not record cache hit or update profile: ${profilingError.message}`);
      }
    } else {
      config.smartLog('cache', `MINIMUM cache detected - skipping profile update for ${url}`);
      
      try {
        const DomainProfiler = require('./scrapers/DomainProfiler');
        const profiler = DomainProfiler.getInstance();
        await profiler.recordHit(url, 'cache-minimum');
      } catch (profilingError) {
        config.smartLog('cache', `Could not record minimum cache hit: ${profilingError.message}`);
      }
    }
    
    return {
      ...parsedData.data,
      _cacheMetadata: {
        timestamp: parsedData.timestamp,
        age: Math.floor(cacheAge / 1000),
        ageInHours: Math.floor(cacheAge / (1000 * 60 * 60)),
        status: cacheStatus,
        quality: cacheQuality,
        isStale: isStale,
        isMinimumCache: cacheQuality === CACHE_QUALITY_TYPES.MINIMUM,
        hitRecorded: cacheQuality !== CACHE_QUALITY_TYPES.MINIMUM
      }
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      config.smartLog('cache', `No cache file for ${url}`);
      updateCacheMetrics('miss');
    } else {
      config.smartLog('fail', `Cache read error for ${url}: ${error.message}`);
      updateCacheMetrics('error');
      
      if (options.fallbackOnError) {
        config.smartLog('cache', `Cache read error, triggering fallback for ${url}`);
        await markCacheForReprofiling(url, 'read_error');
      }
    }
    return null;
  }
};

const getArbitraryKeyData = async (key, options = {}) => {
  const cacheFile = getArbitraryKeyFilename(key);
  
  try {
    const data = await fs.readFile(cacheFile, 'utf-8');
    
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch (parseError) {
      config.smartLog('fail', `Invalid JSON in cache for key ${key}: ${parseError.message}`);
      updateCacheMetrics('error');
      return null;
    }
    
    if (!parsedData.timestamp) {
      config.smartLog('fail', `Invalid cache format for key ${key} - missing timestamp`);
      updateCacheMetrics('error');
      return null;
    }
    
    const cacheAge = Date.now() - parsedData.timestamp;
    const ttlMs = (options.ttlHours || 24) * 60 * 60 * 1000;
    
    if (cacheAge > ttlMs && !options.allowStale) {
      config.smartLog('cache', `Cache expired for key ${key} (${Math.floor(cacheAge / (1000 * 60 * 60))} hours)`);
      updateCacheMetrics('miss');
      updateTtlMetrics('expired');
      return null;
    }
    
    updateCacheMetrics('hit');
    updateTtlMetrics(cacheAge > ttlMs ? 'stale' : 'fresh');
    
    config.smartLog('cache', `Using cached data for key ${key} from ${new Date(parsedData.timestamp).toISOString()}`);
    
    return {
      ...parsedData.data,
      _cacheMetadata: {
        timestamp: parsedData.timestamp,
        age: cacheAge,
        status: cacheAge > ttlMs ? 'stale' : 'fresh',
        isStale: cacheAge > ttlMs,
        key: key
      }
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      config.smartLog('cache', `No cache file for key ${key}`);
      updateCacheMetrics('miss');
    } else {
      config.smartLog('fail', `Cache read error for key ${key}: ${error.message}`);
      updateCacheMetrics('error');
    }
    return null;
  }
};

const markCacheForReprofiling = async (url, reason) => {
  const validReprofilingReasons = [
    'corrupted_cache',
    'invalid_format', 
    'empty_data',
    'read_error',
    'serialization_error',
    'write_error',
    'save_error'
  ];
  
  if (!validReprofilingReasons.includes(reason)) {
    config.smartLog('domain-profile', `Skipping reprofiling for ${url}: reason '${reason}' is not valid`);
    return;
  }
  
  try {
    const DomainProfiler = require('./scrapers/DomainProfiler');
    const profiler = DomainProfiler.getInstance();
    
    const existingProfile = await profiler.getDomainProfile(url);
    if (existingProfile && !existingProfile.needsReprofiling) {
      existingProfile.needsReprofiling = true;
      existingProfile.reprofilingReason = reason;
      existingProfile.reprofilingTriggeredAt = new Date().toISOString();
      
      await profiler.recordScrapingSession(url, {
        stepUsed: existingProfile.step,
        wasHeadless: existingProfile.headless,
        startTime: Date.now(),
        endTime: Date.now(),
        success: false,
        errorMessage: `Cache fallback triggered: ${reason}`,
        jobsFound: 0,
        cacheCreated: false
      });
      
      config.smartLog('domain-profile', `Domain ${profiler.getDomainFromUrl(url)} marked for reprofiling due to: ${reason}`);
    }
  } catch (error) {
    config.smartLog('fail', `Error marking domain for reprofiling: ${error.message}`);
  }
};

const saveCache = async (url, data, options = {}) => {
  if (!isValidUrl(url)) {
    config.smartLog('fail', `Cannot save cache for invalid URL: ${url}`);
    updateCacheMetrics('error');
    return false;
  }
  
  config.smartLog('cache', `saveCache called for URL: ${url}`);
  
  if (!data) {
    config.smartLog('fail', `Not saving empty data to cache for ${url}`);
    updateCacheMetrics('error');
    return false;
  }
  
  const cacheQuality = determineCacheQuality(data);
  
  if (cacheQuality === CACHE_QUALITY_TYPES.MINIMUM) {
    config.smartLog('cache', `MINIMUM cache detected for ${url} - saving with quality flag`);
  }
  
  config.smartLog('cache', `Data to cache keys: ${Object.keys(data).join(', ')}`);
  
  let dataSize = 0;
  try {
    dataSize = JSON.stringify(data).length;
    config.smartLog('cache', `Data to cache size: ~${dataSize} bytes (quality: ${cacheQuality})`);
  } catch (error) {
    config.smartLog('fail', `Data size calculation failed: ${error.message}`);
  }
  
  const cacheFile = getCacheFilename(url);
  config.smartLog('cache', `Cache file will be: ${cacheFile}`);
  
  try {
    await ensureCacheDir();
    
    const cacheData = {
      timestamp: Date.now(),
      data: {
        ...data,
        _cacheQuality: cacheQuality
      },
      cacheVersion: '1.0',
      url: url,
      size: dataSize,
      createdBy: options.createdBy || 'scraping-service',
      quality: cacheQuality
    };
    
    let serializedData;
    try {
      serializedData = JSON.stringify(cacheData);
      config.smartLog('cache', `Data successfully serialized, length: ${serializedData.length} bytes`);
    } catch (jsonError) {
      config.smartLog('fail', `JSON serialization error for ${url}: ${jsonError.message}`);
      
      config.smartLog('cache', `Attempting to filter non-serializable properties...`);
      
      const getSerializableData = (obj) => {
        const seen = new WeakSet();
        return JSON.parse(JSON.stringify(obj, (key, value) => {
          if (key === 'browser' || key === 'page' || key === 'context' || key === '_events' || key === '_eventsCount') {
            return undefined;
          }
          
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        }));
      };
      
      try {
        const serializableData = getSerializableData(data);
        cacheData.data = {
          ...serializableData,
          _cacheQuality: cacheQuality
        };
        serializedData = JSON.stringify(cacheData);
        config.smartLog('cache', `Data successfully serialized after filtering, length: ${serializedData.length} bytes`);
      } catch (filterError) {
        config.smartLog('fail', `Cannot make data serializable: ${filterError.message}`);
        await markCacheForReprofiling(url, 'serialization_error');
        updateCacheMetrics('error');
        return false;
      }
    }
    
    try {
      const existingData = await fs.readFile(cacheFile, 'utf-8');
      const existingHash = crypto.createHash('md5').update(existingData).digest('hex');
      const newHash = crypto.createHash('md5').update(serializedData).digest('hex');
      
      if (existingHash === newHash) {
        config.smartLog('cache', `Cache identical for ${url}, skipping save`);
        return true;
      }
    } catch (error) {
    }
    
    try {
      await fs.writeFile(cacheFile, serializedData);
      config.smartLog('cache', `Cache saved for ${url} -> ${cacheFile} (quality: ${cacheQuality})`);
      
      await fs.access(cacheFile);
      const fileSize = (await fs.stat(cacheFile)).size;
      config.smartLog('cache', `Cache file created successfully: ${cacheFile} (${fileSize} bytes)`);
      
      updateCacheMetrics('write');
      
      if (cacheQuality !== CACHE_QUALITY_TYPES.MINIMUM) {
        try {
          const DomainProfiler = require('./scrapers/DomainProfiler');
          const profiler = DomainProfiler.getInstance();
          const domain = profiler.getDomainFromUrl(url);
          const existingProfile = await profiler.getDomainProfile(url);
          
          if (existingProfile && existingProfile.needsReprofiling) {
            const jobsFound = profiler.extractJobCountFromCache(data);
            
            if (jobsFound > 0) {
              config.smartLog('win', `Cache created with effective success for ${domain}: ${jobsFound} jobs found`);
              
              await profiler.recordScrapingSession(url, {
                stepUsed: 'adaptive-fallback',
                wasHeadless: false,
                startTime: Date.now() - 1000,
                endTime: Date.now(),
                success: true,
                contentText: data.text || '',
                jobsFound: jobsFound,
                platform: data.detectedPlatform,
                cacheCreated: true
              });
            } else {
              existingProfile.lastSuccessfulCache = new Date().toISOString();
            }
          }
        } catch (profilingError) {
          config.smartLog('cache', `Could not update profiling status: ${profilingError.message}`);
        }
      } else {
        config.smartLog('cache', `MINIMUM cache saved - skipping profile update for ${url}`);
      }
      
      return true;
    } catch (writeError) {
      config.smartLog('fail', `File write error: ${writeError.message}`);
      config.smartLog('fail', `Absolute path: ${path.resolve(cacheFile)}`);
      await markCacheForReprofiling(url, 'write_error');
      updateCacheMetrics('error');
      return false;
    }
  } catch (error) {
    config.smartLog('fail', `Cache save error for ${url}: ${error.message}`);
    await markCacheForReprofiling(url, 'save_error');
    updateCacheMetrics('error');
    return false;
  }
};

const saveArbitraryKeyData = async (key, data, options = {}) => {
  config.smartLog('cache', `saveArbitraryKeyData called for key: ${key}`);
  
  if (!data) {
    config.smartLog('fail', `Not saving empty data to cache for key ${key}`);
    updateCacheMetrics('error');
    return false;
  }
  
  let dataSize = 0;
  try {
    dataSize = JSON.stringify(data).length;
    config.smartLog('cache', `Data to cache size: ~${dataSize} bytes`);
  } catch (error) {
    config.smartLog('fail', `Data size calculation failed: ${error.message}`);
  }
  
  const cacheFile = getArbitraryKeyFilename(key);
  config.smartLog('cache', `Cache file will be: ${cacheFile}`);
  
  try {
    await ensureCacheDir();
    
    const cacheData = {
      timestamp: Date.now(),
      data: data,
      cacheVersion: '1.0',
      key: key,
      size: dataSize,
      createdBy: options.createdBy || 'cache-service',
      ttlHours: options.ttlHours || 24
    };
    
    let serializedData;
    try {
      serializedData = JSON.stringify(cacheData);
      config.smartLog('cache', `Data successfully serialized, length: ${serializedData.length} bytes`);
    } catch (jsonError) {
      config.smartLog('fail', `JSON serialization error for key ${key}: ${jsonError.message}`);
      updateCacheMetrics('error');
      return false;
    }
    
    try {
      const existingData = await fs.readFile(cacheFile, 'utf-8');
      const existingHash = crypto.createHash('md5').update(existingData).digest('hex');
      const newHash = crypto.createHash('md5').update(serializedData).digest('hex');
      
      if (existingHash === newHash) {
        config.smartLog('cache', `Cache identical for key ${key}, skipping save`);
        return true;
      }
    } catch (error) {
    }
    
    try {
      await fs.writeFile(cacheFile, serializedData);
      config.smartLog('cache', `Cache saved for key ${key} -> ${cacheFile}`);
      
      await fs.access(cacheFile);
      const fileSize = (await fs.stat(cacheFile)).size;
      config.smartLog('cache', `Cache file created successfully: ${cacheFile} (${fileSize} bytes)`);
      
      updateCacheMetrics('write');
      
      return true;
    } catch (writeError) {
      config.smartLog('fail', `File write error: ${writeError.message}`);
      config.smartLog('fail', `Absolute path: ${path.resolve(cacheFile)}`);
      updateCacheMetrics('error');
      return false;
    }
  } catch (error) {
    config.smartLog('fail', `Cache save error for key ${key}: ${error.message}`);
    updateCacheMetrics('error');
    return false;
  }
};

const clearExpiredCache = async () => {
  try {
    config.smartLog('cache', `Cleaning expired cache in ${config.CACHE_DIR}...`);
    
    try {
      await fs.access(config.CACHE_DIR);
    } catch (error) {
      config.smartLog('cache', `Cache directory does not exist yet, nothing to clean`);
      return 0;
    }
    
    const files = await fs.readdir(config.CACHE_DIR);
    const oneDayInMs = config.CACHE_DURATION || 24 * 60 * 60 * 1000;
    let clearedCount = 0;
    let invalidCount = 0;
    
    config.smartLog('cache', `Processing ${files.length} files in cache...`);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(config.CACHE_DIR, file);
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        let parsedData;
        
        try {
          parsedData = JSON.parse(data);
        } catch (parseError) {
          config.smartLog('cache', `Deleting invalid cache file: ${file}`);
          await fs.unlink(filePath);
          invalidCount++;
          continue;
        }
        
        if (!parsedData.timestamp) {
          config.smartLog('cache', `Deleting cache file without timestamp: ${file}`);
          await fs.unlink(filePath);
          invalidCount++;
          continue;
        }
        
        const ttlMs = file.startsWith('cache_') && parsedData.ttlHours ? 
          parsedData.ttlHours * 60 * 60 * 1000 : oneDayInMs;
        
        if (Date.now() - parsedData.timestamp > ttlMs) {
          config.smartLog('cache', `Deleting expired cache file: ${file}`);
          await fs.unlink(filePath);
          clearedCount++;
          updateTtlMetrics('invalidated');
        }
      } catch (err) {
        config.smartLog('fail', `Error processing cache file ${file}: ${err.message}`);
      }
    }
    
    config.smartLog('cache', `Cleanup completed: ${clearedCount} expired and ${invalidCount} invalid files deleted`);
    return clearedCount + invalidCount;
  } catch (error) {
    config.smartLog('fail', `Error cleaning expired cache: ${error.message}`);
    return 0;
  }
};

const getCacheStats = async () => {
  try {
    await ensureCacheDir();
    
    const files = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    let totalSize = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    let validCaches = 0;
    let invalidCaches = 0;
    let staleCaches = 0;
    let freshCaches = 0;
    let fullQualityCaches = 0;
    let partialQualityCaches = 0;
    let minimumQualityCaches = 0;
    let urlBasedCaches = 0;
    let keyBasedCaches = 0;
    
    const oneDayInMs = config.CACHE_DURATION || 24 * 60 * 60 * 1000;
    
    for (const file of jsonFiles) {
      const filePath = path.join(config.CACHE_DIR, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
      
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(data);
        
        if (parsedData.timestamp) {
          validCaches++;
          
          if (file.startsWith('cache_')) {
            keyBasedCaches++;
            const ttlMs = parsedData.ttlHours ? parsedData.ttlHours * 60 * 60 * 1000 : oneDayInMs;
            const cacheAge = Date.now() - parsedData.timestamp;
            if (cacheAge > ttlMs) {
              staleCaches++;
            } else {
              freshCaches++;
            }
          } else {
            urlBasedCaches++;
            const cacheAge = Date.now() - parsedData.timestamp;
            if (cacheAge > oneDayInMs) {
              staleCaches++;
            } else {
              freshCaches++;
            }
            
            const quality = parsedData.quality || determineCacheQuality(parsedData.data);
            if (quality === CACHE_QUALITY_TYPES.FULL) {
              fullQualityCaches++;
            } else if (quality === CACHE_QUALITY_TYPES.PARTIAL) {
              partialQualityCaches++;
            } else {
              minimumQualityCaches++;
            }
          }
          
          if (parsedData.timestamp < oldestTimestamp) {
            oldestTimestamp = parsedData.timestamp;
          }
          if (parsedData.timestamp > newestTimestamp) {
            newestTimestamp = parsedData.timestamp;
          }
        } else {
          invalidCaches++;
        }
      } catch (error) {
        invalidCaches++;
      }
    }
    
    return {
      totalFiles: jsonFiles.length,
      validCaches,
      invalidCaches,
      freshCaches,
      staleCaches,
      fullQualityCaches,
      partialQualityCaches,
      minimumQualityCaches,
      urlBasedCaches,
      keyBasedCaches,
      totalSize: totalSize,
      averageSize: jsonFiles.length > 0 ? Math.floor(totalSize / jsonFiles.length) : 0,
      oldestEntry: oldestTimestamp !== Date.now() ? new Date(oldestTimestamp).toISOString() : null,
      newestEntry: newestTimestamp !== 0 ? new Date(newestTimestamp).toISOString() : null,
      cacheDir: config.CACHE_DIR,
      cacheDuration: config.CACHE_DURATION,
      healthScore: validCaches > 0 ? Math.round((freshCaches / validCaches) * 100) : 0,
      qualityDistribution: {
        full: fullQualityCaches,
        partial: partialQualityCaches,
        minimum: minimumQualityCaches,
        fullPercentage: validCaches > 0 ? Math.round((fullQualityCaches / validCaches) * 100) : 0
      },
      metrics: {
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        writes: cacheMetrics.writes,
        errors: cacheMetrics.errors,
        hitRatio: cacheMetrics.hits + cacheMetrics.misses > 0 ? 
          Math.round((cacheMetrics.hits / (cacheMetrics.hits + cacheMetrics.misses)) * 100) : 0,
        lastReset: new Date(cacheMetrics.lastReset).toISOString()
      },
      ttlMetrics: {
        fresh: ttlMetrics.fresh,
        stale: ttlMetrics.stale,
        expired: ttlMetrics.expired,
        invalidations: ttlMetrics.invalidations,
        freshRatio: ttlMetrics.fresh + ttlMetrics.stale > 0 ? 
          Math.round((ttlMetrics.fresh / (ttlMetrics.fresh + ttlMetrics.stale)) * 100) : 0
      }
    };
  } catch (error) {
    config.smartLog('fail', `Error getting cache stats: ${error.message}`);
    return {
      error: error.message,
      cacheDir: config.CACHE_DIR,
      metrics: {
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        writes: cacheMetrics.writes,
        errors: cacheMetrics.errors,
        hitRatio: 0,
        lastReset: new Date(cacheMetrics.lastReset).toISOString()
      },
      ttlMetrics: {
        fresh: 0,
        stale: 0,
        expired: 0,
        invalidations: 0,
        freshRatio: 0
      }
    };
  }
};

const getCacheMetrics = () => {
  return {
    operations: {
      hits: cacheMetrics.hits,
      misses: cacheMetrics.misses,
      writes: cacheMetrics.writes,
      errors: cacheMetrics.errors,
      total: cacheMetrics.hits + cacheMetrics.misses + cacheMetrics.writes,
      hitRatio: cacheMetrics.hits + cacheMetrics.misses > 0 ? 
        Math.round((cacheMetrics.hits / (cacheMetrics.hits + cacheMetrics.misses)) * 100) : 0,
      errorRate: cacheMetrics.hits + cacheMetrics.misses + cacheMetrics.writes > 0 ?
        Math.round((cacheMetrics.errors / (cacheMetrics.hits + cacheMetrics.misses + cacheMetrics.writes)) * 100) : 0
    },
    ttl: {
      fresh: ttlMetrics.fresh,
      stale: ttlMetrics.stale,
      expired: ttlMetrics.expired,
      invalidations: ttlMetrics.invalidations,
      total: ttlMetrics.fresh + ttlMetrics.stale + ttlMetrics.expired,
      freshRatio: ttlMetrics.fresh + ttlMetrics.stale > 0 ? 
        Math.round((ttlMetrics.fresh / (ttlMetrics.fresh + ttlMetrics.stale)) * 100) : 0
    },
    lastReset: new Date(cacheMetrics.lastReset).toISOString(),
    uptime: Math.floor((Date.now() - cacheMetrics.lastReset) / 1000)
  };
};

const getDomainsNeedingReprofiling = async () => {
  try {
    const DomainProfiler = require('./scrapers/DomainProfiler');
    const profiler = DomainProfiler.getInstance();
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
    const files = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    let consistentFiles = 0;
    let inconsistentFiles = 0;
    const issues = [];
    
    for (const file of jsonFiles) {
      const filePath = path.join(config.CACHE_DIR, file);
      
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(data);
        
        if (!parsedData.timestamp || !parsedData.data) {
          inconsistentFiles++;
          issues.push(`${file}: Missing required fields`);
          continue;
        }
        
        if (file.startsWith('job_') && !parsedData.url) {
          inconsistentFiles++;
          issues.push(`${file}: URL cache missing url field`);
          continue;
        }
        
        if (file.startsWith('cache_') && !parsedData.key) {
          inconsistentFiles++;
          issues.push(`${file}: Key cache missing key field`);
          continue;
        }
        
        if (parsedData.data.links && !Array.isArray(parsedData.data.links)) {
          inconsistentFiles++;
          issues.push(`${file}: Invalid links format`);
          continue;
        }
        
        consistentFiles++;
      } catch (error) {
        inconsistentFiles++;
        issues.push(`${file}: ${error.message}`);
      }
    }
    
    return {
      totalFiles: jsonFiles.length,
      consistentFiles,
      inconsistentFiles,
      healthPercentage: jsonFiles.length > 0 ? Math.round((consistentFiles / jsonFiles.length) * 100) : 100,
      issues: issues.slice(0, 10)
    };
  } catch (error) {
    return {
      error: error.message,
      healthPercentage: 0
    };
  }
};

const repairCorruptedCaches = async () => {
  try {
    const files = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    let repairedCount = 0;
    let deletedCount = 0;
    
    for (const file of jsonFiles) {
      const filePath = path.join(config.CACHE_DIR, file);
      
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(data);
        
        if (!parsedData.timestamp || !parsedData.data) {
          config.smartLog('cache', `Deleting corrupted cache file: ${file}`);
          await fs.unlink(filePath);
          deletedCount++;
          continue;
        }
        
        let needsRepair = false;
        
        if (!parsedData.cacheVersion) {
          parsedData.cacheVersion = '1.0';
          needsRepair = true;
        }
        
        if (file.startsWith('job_') && !parsedData.url && parsedData.data.originalUrl) {
          parsedData.url = parsedData.data.originalUrl;
          needsRepair = true;
        }
        
        if (file.startsWith('job_') && !parsedData.quality) {
          parsedData.quality = determineCacheQuality(parsedData.data);
          needsRepair = true;
        }
        
        if (file.startsWith('cache_') && !parsedData.ttlHours) {
          parsedData.ttlHours = 24;
          needsRepair = true;
        }
        
        if (needsRepair) {
          await fs.writeFile(filePath, JSON.stringify(parsedData, null, 2));
          repairedCount++;
          config.smartLog('cache', `Repaired cache file: ${file}`);
        }
        
      } catch (error) {
        config.smartLog('cache', `Deleting unrecoverable cache file: ${file}`);
        await fs.unlink(filePath);
        deletedCount++;
      }
    }
    
    return { repairedCount, deletedCount };
  } catch (error) {
    config.smartLog('fail', `Error repairing corrupted caches: ${error.message}`);
    return { repairedCount: 0, deletedCount: 0, error: error.message };
  }
};

const set = async (key, value, options = {}) => {
  try {
    if (isValidUrl(key)) {
      const result = await saveCache(key, value, options);
      return result;
    } else {
      const result = await saveArbitraryKeyData(key, value, options);
      return result;
    }
  } catch (error) {
    config.smartLog('fail', `Cache set error: ${error.message}`);
    updateCacheMetrics('error');
    return false;
  }
};

const get = async (key, options = {}) => {
  try {
    if (isValidUrl(key)) {
      const result = await getCachedData(key, options);
      return result;
    } else {
      const result = await getArbitraryKeyData(key, options);
      return result;
    }
  } catch (error) {
    config.smartLog('fail', `Cache get error: ${error.message}`);
    updateCacheMetrics('error');
    return null;
  }
};

module.exports = {
  ensureCacheDir,
  getCacheFilename,
  getCachedData,
  saveCache,
  getArbitraryKeyData,
  saveArbitraryKeyData,
  clearExpiredCache,
  getCacheStats,
  getCacheMetrics,
  markCacheForReprofiling,
  getDomainsNeedingReprofiling,
  validateCacheConsistency,
  repairCorruptedCaches,
  isValidUrl,
  CACHE_QUALITY_TYPES,
  determineCacheQuality,
  updateCacheMetrics,
  updateTtlMetrics,
  set,
  get
};