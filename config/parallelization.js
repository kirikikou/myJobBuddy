const mainConfig = require('../config');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let config;

if (IS_PRODUCTION) {
  config = require('./parallelization-server');
  mainConfig.smartLog('buffer','Using SERVER parallelization config (fixed limits)');
} else {
  config = require('./parallelization-local');
  mainConfig.smartLog('buffer','Using LOCAL parallelization config (dynamic presets)');
}

const resolvedConfig = typeof config === 'function' ? config() : config;

let currentResourceLevel = 'MID';
let currentLimits = null;

const LEVEL_OVERRIDES = {
  LOW: {
    MAX_CONCURRENT_SCRAPERS: 5,
    BATCH_SIZE: 8,
    TIMEOUT_MS: 30000
  },
  MID: {
    MAX_CONCURRENT_SCRAPERS: 10,
    BATCH_SIZE: 15,
    TIMEOUT_MS: 60000
  },
  HIGH: {
    MAX_CONCURRENT_SCRAPERS: 15,
    BATCH_SIZE: 25,
    TIMEOUT_MS: 120000
  }
};

function applyResourceLevel(level) {
  const validLevels = ['LOW', 'MID', 'HIGH'];
  if (!validLevels.includes(level)) {
    mainConfig.smartLog('fail', `Invalid resource level: ${level}, using MID`);
    level = 'MID';
  }
  
  currentResourceLevel = level;
  const overrides = LEVEL_OVERRIDES[level];
  
  currentLimits = {
    ...resolvedConfig,
    RESOURCE_LIMITS: {
      ...resolvedConfig.RESOURCE_LIMITS,
      MAX_CONCURRENT_SCRAPERS: overrides.MAX_CONCURRENT_SCRAPERS,
      BATCH_SIZE: overrides.BATCH_SIZE
    },
    TIMEOUTS: {
      ...resolvedConfig.TIMEOUTS,
      GATE_TIMEOUT_MS: overrides.TIMEOUT_MS,
      REQUEST_TIMEOUT_MS: overrides.TIMEOUT_MS,
      STEP_TIMEOUT_MS: Math.min(overrides.TIMEOUT_MS, 30000)
    }
  };
  
  mainConfig.smartLog('buffer', `Resource level set to ${level}: ${overrides.MAX_CONCURRENT_SCRAPERS} scrapers, ${overrides.TIMEOUT_MS}ms timeout`);
  return currentLimits;
}

const finalConfig = {
  GLOBAL_MAX_CONCURRENCY: resolvedConfig.RESOURCE_LIMITS?.MAX_CONCURRENT_SCRAPERS || 
                         resolvedConfig.MAX_CONCURRENT_SCRAPERS || 
                         resolvedConfig.MAX_PARALLEL || 10,
  DOMAIN_MAX_CONCURRENCY: resolvedConfig.RESOURCE_LIMITS?.MAX_CONCURRENT_SCRAPERS || 
                         resolvedConfig.MAX_CONCURRENT_SCRAPERS || 1,
  SCRAPER_MAX_CONCURRENCY: resolvedConfig.MAX_PARALLEL || 
                          resolvedConfig.RESOURCE_LIMITS?.MAX_CONCURRENT_SCRAPERS || 5,
  ...resolvedConfig,
  setResourceLevel: applyResourceLevel,
  getCurrentLevel: () => currentResourceLevel,
  getCurrentLimits: () => currentLimits || finalConfig,
  getTimeoutForLevel: (level) => LEVEL_OVERRIDES[level]?.TIMEOUT_MS || LEVEL_OVERRIDES.MID.TIMEOUT_MS,
  RESOURCE_LIMITS: resolvedConfig.RESOURCE_LIMITS || {},
  TIMEOUTS: resolvedConfig.TIMEOUTS || {}
};

applyResourceLevel('MID');

module.exports = finalConfig;