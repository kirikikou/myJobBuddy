const config = require('../config');
const os = require('os');

const PRESETS = {
  LOW: {
    CPU_PERCENT: 10,
    RAM_PERCENT: 10,
    DESCRIPTION: "Low resources - background work"
  },
  MID: {
    CPU_PERCENT: 50,  
    RAM_PERCENT: 50,
    DESCRIPTION: "Medium resources - regular work"
  },
  HIGH: {
    CPU_PERCENT: 90,
    RAM_PERCENT: 80,
    DESCRIPTION: "High resources - dedicated scraping"
  }
};

let currentPreset = 'HIGH'; // Change ici : LOW, MID, ou HIGH

function calculateLimits(preset) {
  const totalCores = os.cpus().length;
  const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  
  const maxConcurrentScrapers = Math.floor((totalCores * preset.CPU_PERCENT / 100) / 2);
  const maxParallel = Math.min(50, Math.floor(totalCores * preset.CPU_PERCENT / 100));
  const maxRamGB = Math.floor(totalRamGB * preset.RAM_PERCENT / 100);
  
  return {
    MAX_WAIT_TIME_MINUTES: 2,
    MIN_PARALLEL: 1,
    MAX_PARALLEL: maxParallel,
    TARGET_DURATION_SECONDS: 60,
    
    CPU_THRESHOLD: preset.CPU_PERCENT / 100,
    RAM_THRESHOLD: preset.RAM_PERCENT / 100,
    QUEUE_THRESHOLD: maxConcurrentScrapers * 3,
    
    STEP_WEIGHTS: {
      'http-simple': 1,
      'axios-simple': 1,
      'mobile-variant': 2,
      'lightweight-variants': 2,
      'lighthouse': 3,
      'greenhouse-step-direct': 4,
      'wordpress-headless': 6,
      'headless-rendering': 8,
      'headless': 8,
      'wordpress-iframe': 10,
      'robust-scraper': 12,
      'ocr-fallback': 15
    },
    
    BATCH_CALCULATION: {
      MIN_BATCH_SIZE: 1,
      MAX_BATCH_SIZE: Math.min(100, maxParallel),
      TARGET_BATCH_DURATION: 60
    },
    
    RESOURCE_LIMITS: {
      MAX_CPU_PERCENT: preset.CPU_PERCENT,
      MAX_RAM_GB: maxRamGB,
      MAX_CONCURRENT_SCRAPERS: maxConcurrentScrapers
    },
    
    SYSTEM_INFO: {
      PRESET: currentPreset,
      TOTAL_CORES: totalCores,
      TOTAL_RAM_GB: totalRamGB,
      CALCULATED_SCRAPERS: maxConcurrentScrapers,
      CALCULATED_PARALLEL: maxParallel
    }
  };
}

function setResourceLevel(level) {
  if (!PRESETS[level]) {
    throw new Error(`Invalid level: ${level}. Use: LOW, MID, HIGH`);
  }
  
  currentPreset = level;
  const newConfig = calculateLimits(PRESETS[level]);
  
  Object.keys(newConfig).forEach(key => {
    if (key !== 'SYSTEM_INFO') {
      module.exports[key] = newConfig[key];
    }
  });
  
  config.smartLog('buffer',`🎯 Resources set to ${level}: ${newConfig.RESOURCE_LIMITS.MAX_CONCURRENT_SCRAPERS} scrapers, ${newConfig.MAX_PARALLEL} parallel`);
  
  return newConfig;
}

const initialConfig = calculateLimits(PRESETS[currentPreset]);

module.exports = {
  ...initialConfig,
  setResourceLevel,
  getCurrentPreset: () => currentPreset,
  getAvailablePresets: () => Object.keys(PRESETS).map(key => ({
    key,
    ...PRESETS[key]
  }))
};