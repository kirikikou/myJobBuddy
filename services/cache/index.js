const CacheManager = require('./CacheManager');
const MemoryCache = require('./MemoryCache');
const FileCache = require('./FileCache');
const CacheStats = require('./CacheStats');
const EvictionPolicy = require('./EvictionPolicy');
const CacheWarmer = require('./CacheWarmer');

let globalCacheManager = null;

const createCacheManager = (options = {}) => {
  return new CacheManager(options);
};

const getGlobalCacheManager = async (options = {}) => {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(options);
    await globalCacheManager.init();
  }
  return globalCacheManager;
};

const initializeGlobalCache = async (options = {}) => {
  if (globalCacheManager) {
    throw new Error('Global cache manager already initialized');
  }
  
  globalCacheManager = new CacheManager(options);
  await globalCacheManager.init();
  return globalCacheManager;
};

const destroyGlobalCache = async () => {
  if (globalCacheManager) {
    if (globalCacheManager.l1Cache?.destroy) {
      globalCacheManager.l1Cache.destroy();
    }
    globalCacheManager = null;
  }
};

const createNamespacedCache = async (namespace, options = {}) => {
  const manager = await getGlobalCacheManager(options);
  return manager.getNamespace(namespace);
};

const createSpecializedCaches = async (options = {}) => {
  const manager = await getGlobalCacheManager(options);
  
  return {
    domain: manager.getNamespace('profiles'),
    scraping: manager.getNamespace('scraping'),
    user: manager.getNamespace('users'),
    monitoring: manager.getNamespace('monitoring'),
    temp: manager.getNamespace('temp')
  };
};

const migrateFromLegacyCache = async (legacyCacheManager, options = {}) => {
  const newManager = await getGlobalCacheManager(options);
  const config = require('../../config');
  
  try {
    config.smartLog('cache', 'Starting migration from legacy cache system');
    
    if (legacyCacheManager.getCacheStats) {
      const legacyStats = await legacyCacheManager.getCacheStats();
      config.smartLog('cache', `Legacy cache has ${legacyStats.totalFiles} files to migrate`);
    }
    
    const fs = require('fs').promises;
    const path = require('path');
    const cacheDir = config.CACHE_DIR || './cache';
    
    let migratedCount = 0;
    let errorCount = 0;
    
    try {
      const files = await fs.readdir(cacheDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(cacheDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(content);
          
          if (data.data && data.data.url) {
            const domain = extractDomain(data.data.url);
            const cacheKey = `migrated:${domain}:${hashUrl(data.data.url)}`;
            
            const migrationData = {
              ...data.data,
              _migrated: true,
              _originalTimestamp: data.timestamp,
              _migrationTimestamp: Date.now()
            };
            
            const ttl = data.timestamp ? 
              Math.max(0, 31 * 24 * 60 * 60 * 1000 - (Date.now() - data.timestamp)) :
              24 * 60 * 60 * 1000;
            
            await newManager.set(cacheKey, migrationData, ttl, {
              namespace: 'scraping',
              priority: 6
            });
            
            migratedCount++;
          }
          
        } catch (fileError) {
          errorCount++;
          config.smartLog('cache', `Migration error for ${file}: ${fileError.message}`);
        }
      }
      
      config.smartLog('cache', 
        `Migration completed: ${migratedCount} entries migrated, ${errorCount} errors`
      );
      
      return {
        success: true,
        migratedCount,
        errorCount,
        totalFiles: jsonFiles.length
      };
      
    } catch (dirError) {
      config.smartLog('fail', `Migration directory error: ${dirError.message}`);
      return { success: false, error: dirError.message };
    }
    
  } catch (error) {
    config.smartLog('fail', `Migration failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const extractDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
};

const hashUrl = (url) => {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
};

const createBackwardCompatibleWrapper = async (options = {}) => {
  const manager = await getGlobalCacheManager(options);
  
  return {
    async getCachedData(url, options = {}) {
      const key = `legacy:${extractDomain(url)}:${hashUrl(url)}`;
      return await manager.get(key, { 
        namespace: 'scraping',
        allowStale: options.allowStale 
      });
    },
    
    async saveCache(url, data, options = {}) {
      const key = `legacy:${extractDomain(url)}:${hashUrl(url)}`;
      const ttl = options.ttl || 24 * 60 * 60 * 1000;
      return await manager.set(key, data, ttl, { 
        namespace: 'scraping',
        priority: 6
      });
    },
    
    async clearExpiredCache() {
      return await manager.evictByPolicy('ttl', { percentage: 100 });
    },
    
    async getCacheStats() {
      const stats = await manager.getStats();
      return {
        totalFiles: stats.l2?.entries || 0,
        validCaches: stats.l2?.entries || 0,
        freshCaches: Math.round((stats.unified?.hitRatio || 0) * (stats.l2?.entries || 0) / 100),
        staleCaches: stats.l2?.entries - Math.round((stats.unified?.hitRatio || 0) * (stats.l2?.entries || 0) / 100),
        totalSize: (stats.unified?.totalSizeMB || 0) * 1024 * 1024,
        healthScore: stats.health || 0
      };
    },
    
    async healthCheck() {
      return await manager.healthCheck();
    },
    
    isValidUrl: (url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    }
  };
};

const CacheNamespaces = {
  DEFAULT: 'default',
  SCRAPING: 'scraping', 
  PROFILES: 'profiles',
  USERS: 'users',
  MONITORING: 'monitoring',
  TEMP: 'temp'
};

const CachePriorities = {
  CRITICAL: 10,
  HIGH: 8,
  NORMAL: 6,
  LOW: 4,
  MINIMAL: 2
};

const CacheTypes = {
  MEMORY: 'memory',
  FILE: 'file',
  HYBRID: 'hybrid'
};

module.exports = {
  CacheManager,
  MemoryCache,
  FileCache,
  CacheStats,
  EvictionPolicy,
  CacheWarmer,
  
  createCacheManager,
  getGlobalCacheManager,
  initializeGlobalCache,
  destroyGlobalCache,
  createNamespacedCache,
  createSpecializedCaches,
  migrateFromLegacyCache,
  createBackwardCompatibleWrapper,
  
  CacheNamespaces,
  CachePriorities,
  CacheTypes
};