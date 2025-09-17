const config = require('../../config');

const PLATFORM_MAPPINGS = {
  'workday': 'workday',
  'greenhouse': 'greenhouse', 
  'lever': 'lever',
  'bamboohr': 'bamboohr',
  'bamboo': 'bamboohr',
  'smartrecruiters': 'smartrecruiters',
  'smart-recruiters': 'smartrecruiters',
  'icims': 'icims',
  'jazzhr': 'jazzhr',
  'jazz': 'jazzhr',
  'recruitee': 'recruitee',
  'workable': 'workable',
  'brassring': 'brassring',
  'brass-ring': 'brassring',
  'teamtailor': 'teamtailor',
  'team-tailor': 'teamtailor',
  'adp': 'adp',
  'zoho': 'zoho-recruit',
  'zoho-recruit': 'zoho-recruit',
  'wordpress': 'wordpress',
  'wp': 'wordpress',
  'powershift': 'powershift',
  'unknown': 'unknown',
  'custom': 'custom'
};

const PLATFORM_ALIASES = {
  'workday.com': 'workday',
  'greenhouse.io': 'greenhouse',
  'lever.co': 'lever',
  'bamboohr.com': 'bamboohr',
  'smartrecruiters.com': 'smartrecruiters',
  'icims.com': 'icims',
  'jazzhr.com': 'jazzhr',
  'recruitee.com': 'recruitee',
  'workable.com': 'workable',
  'brassring': 'brassring',
  'teamtailor.com': 'teamtailor',
  'adp.com': 'adp',
  'zoho.com': 'zoho-recruit',
  'wordpress.com': 'wordpress',
  'wp.com': 'wordpress'
};

function normalize(platform) {
  if (!platform || typeof platform !== 'string') {
    config.smartLog('platform', 'Invalid platform input, defaulting to unknown');
    return 'unknown';
  }
  
  const cleaned = platform.toLowerCase().trim();
  
  if (PLATFORM_MAPPINGS[cleaned]) {
    config.smartLog('platform', `Platform normalized: ${platform} -> ${PLATFORM_MAPPINGS[cleaned]}`);
    return PLATFORM_MAPPINGS[cleaned];
  }
  
  for (const [alias, normalized] of Object.entries(PLATFORM_ALIASES)) {
    if (cleaned.includes(alias)) {
      config.smartLog('platform', `Platform matched via alias: ${platform} -> ${normalized}`);
      return normalized;
    }
  }
  
  if (cleaned.includes('workday')) return 'workday';
  if (cleaned.includes('greenhouse')) return 'greenhouse';
  if (cleaned.includes('lever')) return 'lever';
  if (cleaned.includes('bamboo')) return 'bamboohr';
  if (cleaned.includes('smart')) return 'smartrecruiters';
  if (cleaned.includes('icims')) return 'icims';
  if (cleaned.includes('jazz')) return 'jazzhr';
  if (cleaned.includes('recruitee')) return 'recruitee';
  if (cleaned.includes('workable')) return 'workable';
  if (cleaned.includes('brass')) return 'brassring';
  if (cleaned.includes('team')) return 'teamtailor';
  if (cleaned.includes('adp')) return 'adp';
  if (cleaned.includes('zoho')) return 'zoho-recruit';
  if (cleaned.includes('wordpress') || cleaned.includes('wp-')) return 'wordpress';
  if (cleaned.includes('powershift')) return 'powershift';
  
  config.smartLog('platform', `Platform not recognized, defaulting to unknown: ${platform}`);
  return 'unknown';
}

function getPlatformStep(platform) {
  const normalizedPlatform = normalize(platform);
  
  const stepMappings = {
    'workday': 'headless',
    'greenhouse': 'http-simple',
    'lever': 'http-simple', 
    'bamboohr': 'headless',
    'smartrecruiters': 'headless',
    'icims': 'headless',
    'jazzhr': 'http-simple',
    'recruitee': 'http-simple',
    'workable': 'http-simple',
    'brassring': 'headless',
    'teamtailor': 'http-simple',
    'adp': 'headless',
    'zoho-recruit': 'headless',
    'wordpress': 'http-simple',
    'powershift': 'http-simple',
    'unknown': 'http-simple',
    'custom': 'http-simple'
  };
  
  return stepMappings[normalizedPlatform] || 'http-simple';
}

function isHeadlessRequired(platform) {
  const normalizedPlatform = normalize(platform);
  const headlessPlatforms = [
    'workday', 
    'bamboohr', 
    'smartrecruiters', 
    'icims', 
    'brassring', 
    'adp', 
    'zoho-recruit'
  ];
  
  return headlessPlatforms.includes(normalizedPlatform);
}

function getSupportedPlatforms() {
  return Object.values(PLATFORM_MAPPINGS);
}

module.exports = {
  normalize,
  getPlatformStep,
  isHeadlessRequired,
  getSupportedPlatforms,
  PLATFORM_MAPPINGS,
  PLATFORM_ALIASES
};