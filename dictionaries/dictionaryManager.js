const LanguageDetector = require('./languageDetector');
const config = require('../config');

class DictionaryManager {
  constructor() {
    this.currentLang = 'en';
    this.fallbackLang = 'en';
    this._cache = new Map();
    this._initialized = false;
    this._initializationPromise = null;
  }
  
  getSupportedLanguages() {
    try {
      const patterns = require('./core/patterns');
      return patterns.supportedLanguages || ['ar', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'id', 'it', 'ja', 'ko', 'lb', 'ms', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sv', 'sw', 'th', 'tr', 'uk', 'vi', 'zh'];
    } catch (error) {
      config.smartLog('fail', `Error loading supported languages: ${error.message}`);
      return ['en'];
    }
  }
  
  async initialize(page) {
    if (this._initialized) {
      return this.currentLang;
    }
    
    if (this._initializationPromise) {
      return await this._initializationPromise;
    }
    
    this._initializationPromise = this._performInitialization(page);
    return await this._initializationPromise;
  }
  
  async _performInitialization(page) {
    try {
      this.currentLang = await LanguageDetector.detectRobust(page);
      config.smartLog('langue', `Detected language: ${this.currentLang}`);
      
      if (!this.getSupportedLanguages().includes(this.currentLang)) {
        config.smartLog('langue', `Language ${this.currentLang} not supported, using ${this.fallbackLang}`);
        this.currentLang = this.fallbackLang;
      }
      
      this._initialized = true;
      return this.currentLang;
    } catch (error) {
      config.smartLog('fail', `Language detection failed: ${error.message}`);
      this.currentLang = this.fallbackLang;
      this._initialized = true;
      return this.currentLang;
    }
  }
  
  _ensureInitialized() {
    if (!this._initialized) {
      config.smartLog('langue', 'Not initialized, using default language');
      this.currentLang = this.fallbackLang;
      this._initialized = true;
    }
  }
  
  get(category, subcategory = null) {
    this._ensureInitialized();
    const cacheKey = `${this.currentLang}-${category}-${subcategory || 'all'}`;
    
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }
    
    try {
      let result;
      
      if (category === 'complexSites') {
        const patterns = require('./core/patterns');
        result = patterns.complexSites;
      } else if (category === 'urlKeywords') {
        const patterns = require('./core/patterns');
        result = patterns.urlKeywords;
      } else if (category === 'highConfidenceDomains') {
        const patterns = require('./core/patterns');
        result = patterns.highConfidenceDomains;
      } else if (category === 'lowConfidenceDomains') {
        const patterns = require('./core/patterns');
        result = patterns.lowConfidenceDomains;
      } else if (category === 'pathPatterns') {
        const patterns = require('./core/patterns');
        result = patterns.pathPatterns;
      } else if (category === 'languageUrlPatterns') {
        const patterns = require('./core/patterns');
        result = patterns.languageUrlPatterns;
      } else if (category === 'languageTldMappings') {
        const patterns = require('./core/patterns');
        result = patterns.languageTldMappings;
      } else {
        const langDict = require(`./scraping/${this.currentLang}`);
        const universal = require('./core/universal');
        const platforms = require('./core/platforms');
        const patterns = require('./core/patterns');
        
        if (subcategory) {
          result = langDict[category]?.[subcategory];
        } else {
          result = langDict[category];
        }
        
        if (!result && universal[category]) {
          result = universal[category];
        }
        
        if (!result && platforms[category]) {
          result = platforms[category];
        }
        
        if (!result && patterns[category]) {
          result = patterns[category];
        }
        
        if (!result && this.currentLang !== this.fallbackLang) {
          const fallbackDict = require(`./scraping/${this.fallbackLang}`);
          result = subcategory ? 
            fallbackDict[category]?.[subcategory] : 
            fallbackDict[category];
        }
      }
      
      this._cache.set(cacheKey, result || []);
      return result || [];
      
    } catch (error) {
      config.smartLog('fail', `Error loading dictionary: ${error.message}`);
      return [];
    }
  }
  
  getProgressive(category) {
    this._ensureInitialized();
    try {
      const langDict = require(`./scraping/${this.currentLang}`);
      const categoryData = langDict[category];
      
      if (!categoryData) return { level1: [], level2: {}, level3: [] };
      
      return {
        level1: categoryData.level1_specific || [],
        level2: categoryData.level2_text || {},
        level3: categoryData.level3_fallback || []
      };
    } catch (error) {
      config.smartLog('fail', `Error loading progressive dictionary: ${error.message}`);
      return { level1: [], level2: {}, level3: [] };
    }
  }
  
  getPlatformConfig(platformName) {
    try {
      const platforms = require('./core/platforms');
      return platforms.knownJobPlatforms.find(p => 
        p.name.toLowerCase() === platformName.toLowerCase()
      ) || null;
    } catch (error) {
      config.smartLog('fail', `Error loading platform config: ${error.message}`);
      return null;
    }
  }
  
  getPatterns(type) {
    try {
      const patterns = require('./core/patterns');
      return patterns[type] || [];
    } catch (error) {
      config.smartLog('fail', `Error loading patterns: ${error.message}`);
      return [];
    }
  }
  
  getJobTerms() {
    return this.get('jobTerms') || [];
  }
  
  getShowMoreSelectors() {
    const progressive = this.getProgressive('showMore');
    return [
      ...progressive.level1,
      ...progressive.level3
    ];
  }
  
  getShowMoreTextSelectors() {
    const progressive = this.getProgressive('showMore');
    return progressive.level2.exact || [];
  }
  
  getCookieSelectors() {
    const progressive = this.getProgressive('cookies');
    const frameworks = progressive.level1_frameworks || {};
    
    try {
      const universal = require('./core/universal');
      return [
        ...Object.values(frameworks),
        ...progressive.level1,
        ...progressive.level3,
        ...(universal.cookieFrameworkSelectors || [])
      ];
    } catch (error) {
      return [
        ...Object.values(frameworks),
        ...progressive.level1,
        ...progressive.level3
      ];
    }
  }
  
  getCookieTextSelectors() {
    const progressive = this.getProgressive('cookies');
    return [
      ...(progressive.level2.primary || []),
      ...(progressive.level2.secondary || [])
    ];
  }
  
  getPaginationSelectors() {
    try {
      const universal = require('./core/universal');
      return universal.paginationSelectors || [];
    } catch (error) {
      return [];
    }
  }
  
  getPaginationTextSelectors() {
    const progressive = this.getProgressive('pagination');
    return [
      ...(progressive.level2.next || []),
      ...(progressive.level2.previous || []),
      ...(progressive.level2.numbers || [])
    ];
  }
  
  getJobNavigationSelectors() {
    const navigation = this.get('navigation');
    return navigation.career || [];
  }
  
  getJobNavigationTextSelectors() {
    const navigation = this.get('navigation');
    return [...(navigation.career || []), ...(navigation.apply || [])];
  }
  
  getJobListingSelectors() {
    try {
      const universal = require('./core/universal');
      const langSpecific = this.get('jobListing', 'selectors');
      return [...(universal.jobSelectors || []), ...(langSpecific || [])];
    } catch (error) {
      return this.get('jobListing', 'selectors') || [];
    }
  }
  
  getJobURLPatterns() {
    return this.getPatterns('jobURLPatterns');
  }
  
  getJobDetailURLPatterns() {
    return this.getPatterns('jobDetailURLPatterns');
  }
  
  getButtonPatterns() {
    return this.getPatterns('buttonPatterns');
  }
  
  getButtonPatternsPositive() {
    const patterns = this.getButtonPatterns();
    return patterns.positive || {};
  }
  
  getButtonPatternsNegative() {
    const patterns = this.getButtonPatterns();
    return patterns.negative || {};
  }
  
  getLanguageUrlPatterns() {
    return this.get('languageUrlPatterns') || {};
  }
  
  getLanguageTldMappings() {
    return this.get('languageTldMappings') || {};
  }
  
  getUrlKeywords() {
    return this.get('urlKeywords') || {};
  }
  
  getHighConfidenceDomains() {
    return this.get('highConfidenceDomains') || {};
  }
  
  getLowConfidenceDomains() {
    return this.get('lowConfidenceDomains') || {};
  }
  
  getPathPatterns() {
    return this.get('pathPatterns') || {};
  }
  
  getComplexSites() {
    return this.get('complexSites') || [];
  }
  
  getComplexDomains() {
    return this.getComplexSites();
  }
  
  getLoadingIndicators() {
    try {
      const universal = require('./core/universal');
      return universal.loadingSelectors || [];
    } catch (error) {
      return [];
    }
  }
  
  getLoadingTextSelectors() {
    const loadingStates = this.get('loadingStates');
    return loadingStates.text || [];
  }
  
  getErrorSelectors() {
    try {
      const universal = require('./core/universal');
      return universal.errorSelectors || [];
    } catch (error) {
      return [];
    }
  }
  
  getErrorTextSelectors() {
    return [
      'Error', 'error', 'Failed', 'failed', 'Problem', 'Invalid'
    ];
  }
  
  getDynamicContentIndicators() {
    try {
      const universal = require('./core/universal');
      return universal.dynamicIndicators || [];
    } catch (error) {
      return [];
    }
  }
  
  getShowMorePatterns() {
    return this.getPatterns('showMorePatterns');
  }
  
  getShowMorePatternsText() {
    const patterns = this.getShowMorePatterns();
    return patterns.text || {};
  }
  
  getShowMorePatternsRegex() {
    const patterns = this.getShowMorePatterns();
    return patterns.regex;
  }
  
  getPaginationPatterns() {
    return this.getPatterns('paginationPatterns');
  }
  
  getPaginationPatternsText() {
    const patterns = this.getPaginationPatterns();
    return patterns.text || {};
  }
  
  getPaginationPatternsSymbols() {
    const patterns = this.getPaginationPatterns();
    return patterns.symbols || [];
  }
  
  getPaginationPatternsRegex() {
    const patterns = this.getPaginationPatterns();
    return patterns.regex;
  }
  
  getBlockingContentSelectors() {
    const blockingContent = this.get('blockingContent');
    return blockingContent.selectors || [];
  }
  
  getBlockingTextSelectors() {
    const blockingContent = this.get('blockingContent');
    return blockingContent.text || [];
  }
  
  getEmptyContentIndicators() {
    try {
      const universal = require('./core/universal');
      return universal.emptyContentSelectors || [];
    } catch (error) {
      return [];
    }
  }
  
  getEmptyContentTextSelectors() {
    const emptyStates = this.get('emptyStates');
    return emptyStates.text || [];
  }
  
  getSearchFilterSelectors() {
    try {
      const universal = require('./core/universal');
      return universal.searchFilterSelectors || [];
    } catch (error) {
      return [];
    }
  }
  
  getFilterTextSelectors() {
    const filters = this.get('filters');
    return [
      ...(filters.departments || []),
      ...(filters.locations || []),
      ...(filters.types || []),
      ...(filters.keywords || [])
    ];
  }
  
  getFilterKeywords() {
    const filters = this.get('filters');
    return filters.keywords || [];
  }
  
  getTemplateIndicators() {
    try {
      const universal = require('./core/universal');
      return universal.templateIndicators || [];
    } catch (error) {
      return [];
    }
  }
  
  getKnownJobPlatforms() {
    try {
      const platforms = require('./core/platforms');
      return platforms.knownJobPlatforms || [];
    } catch (error) {
      return [];
    }
  }
  
  getCsvColumnMappings() {
    try {
      const platforms = require('./core/platforms');
      return platforms.csvColumnMappings || {};
    } catch (error) {
      return {};
    }
  }
  
  getCsvFieldLabels() {
    try {
      const platforms = require('./core/platforms');
      return platforms.csvFieldLabels || {};
    } catch (error) {
      return {};
    }
  }
  
  getCsvRequiredFields() {
    try {
      const platforms = require('./core/platforms');
      return platforms.csvRequiredFields || [];
    } catch (error) {
      return [];
    }
  }
  
  getCsvDateFormats() {
    return this.getPatterns('csvDateFormats');
  }
  
  getCsvValidationRules() {
    try {
      const platforms = require('./core/platforms');
      return platforms.csvValidationRules || {};
    } catch (error) {
      return {};
    }
  }
  
  getJobTitleMappings() {
    try {
      const platforms = require('./core/platforms');
      return platforms.jobTitleMappings || {};
    } catch (error) {
      return {};
    }
  }
  
  getEmailPattern() {
    return this.getPatterns('emailPattern');
  }
  
  getPhonePatterns() {
    return this.getPatterns('phonePatterns');
  }
  
  generateJobTitleVariants(jobTitle) {
    const original = jobTitle.toLowerCase().trim();
    const variants = new Set([original]);
    const mappings = this.getJobTitleMappings();
    
    variants.add(original.replace(/\s+/g, ''));
    variants.add(original.replace(/\s+/g, '-'));
    variants.add(original.replace(/\s+/g, '_'));
    
    for (const [level, synonyms] of Object.entries(mappings.seniority || {})) {
      const levelRegex = new RegExp(`\\b${level}\\b`, 'gi');
      if (levelRegex.test(original)) {
        synonyms.forEach(synonym => {
          variants.add(original.replace(levelRegex, synonym));
        });
        variants.add(original.replace(levelRegex, '').trim().replace(/\s+/g, ' '));
      }
    }
    
    for (const [position, synonyms] of Object.entries(mappings.positions || {})) {
      const positionRegex = new RegExp(`\\b${position}\\b`, 'gi');
      if (positionRegex.test(original)) {
        synonyms.forEach(synonym => {
          variants.add(original.replace(positionRegex, synonym));
        });
      }
    }
    
    for (const [tech, expansions] of Object.entries(mappings.technical || {})) {
      const techRegex = new RegExp(`\\b${tech}\\b`, 'gi');
      if (techRegex.test(original)) {
        expansions.forEach(expansion => {
          variants.add(original.replace(techRegex, expansion));
        });
      }
    }
    
    const cleanVariants = Array.from(variants)
      .map(v => v.trim().replace(/\s+/g, ' '))
      .filter(v => v.length > 0);
    
    return [...new Set(cleanVariants)];
  }
  
  getWorkableSpecificSelectors() {
    try {
      const platforms = require('./core/platforms');
      return platforms.workableSpecificSelectors || {};
    } catch (error) {
      return {};
    }
  }
  
  getWorkableDetectionPatterns() {
    return this.getPatterns('workableDetectionPatterns');
  }
  
  clearCache() {
    this._cache.clear();
  }
  
  setLanguage(lang) {
    if (this.getSupportedLanguages().includes(lang)) {
      this.currentLang = lang;
      this.clearCache();
      this._initialized = true;
      config.smartLog('langue', `Language set to: ${lang}`);
    }
  }
  
  getCurrentLanguage() {
    return this.currentLang;
  }
  
  isCompatibleWithOldDictionary() {
    try {
      const tests = [
        () => this.getJobTerms().length > 0,
        () => this.getShowMoreSelectors().length > 0,
        () => this.getKnownJobPlatforms().length > 0,
        () => this.getJobURLPatterns().length > 0,
        () => this.getCsvColumnMappings() !== null
      ];
      
      return tests.every(test => {
        try {
          return test();
        } catch (e) {
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }
  
  getAllAvailableData() {
    this._ensureInitialized();
    try {
      const langDict = require(`./scraping/${this.currentLang}`);
      const universal = require('./core/universal');
      const platforms = require('./core/platforms');
      const patterns = require('./core/patterns');
      
      return {
        language: this.currentLang,
        supportedLanguages: this.getSupportedLanguages().length,
        languageSpecific: Object.keys(langDict),
        universal: Object.keys(universal),
        platforms: Object.keys(platforms),
        patterns: Object.keys(patterns),
        totalPlatforms: platforms.knownJobPlatforms?.length || 0,
        totalJobTerms: langDict.jobTerms?.length || 0,
        urlKeywordsLanguages: Object.keys(this.getUrlKeywords()).length,
        highConfidenceDomainsLanguages: Object.keys(this.getHighConfidenceDomains()).length,
        buttonPatternsStructure: this.getButtonPatterns(),
        showMorePatternsStructure: this.getShowMorePatterns(),
        paginationPatternsStructure: this.getPaginationPatterns()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  getDictionaryForLanguage(language) {
    const finalLang = this.getSupportedLanguages().includes(language) ? language : this.fallbackLang;
    return new DictionaryInstance(finalLang, this._cache);
  }

  getDefaultDictionary() {
    return this.getDictionaryForLanguage(this.fallbackLang);
  }

  async detectAndCreateDictionary(url, htmlContent = null, options = {}) {
    let detectedLanguage = null;
    
    try {
      if (options.providedLanguage && options.providedLanguage !== 'unknown') {
        detectedLanguage = options.providedLanguage;
        config.smartLog('langue', `Using provided language: ${detectedLanguage}`);
      } else if (options.profileLanguage && options.profileLanguage !== 'en') {
        detectedLanguage = options.profileLanguage;
        config.smartLog('langue', `Using profile language: ${detectedLanguage}`);
      } else {
        const IndependentLanguageDetector = require('./IndependentLanguageDetector');
        const detectedRaw = await IndependentLanguageDetector.detectLanguageIndependent(url, htmlContent);
        detectedLanguage = IndependentLanguageDetector.getScrapingLanguage(detectedRaw);
        config.smartLog('langue', `Detected language: ${detectedRaw} → ${detectedLanguage}`);
      }
    } catch (error) {
      config.smartLog('fail', `Language detection failed: ${error.message}`);
      detectedLanguage = this.fallbackLang;
    }
    
    const finalLanguage = detectedLanguage || this.fallbackLang;
    return {
      language: finalLanguage,
      dictionary: this.getDictionaryForLanguage(finalLanguage)
    };
  }
}

class DictionaryInstance {
  constructor(language, cache) {
    this.language = language;
    this.cache = cache;
    this.fallbackLang = 'en';
  }
  
  getCurrentLanguage() {
    return this.language;
  }
  
  get(category, subcategory = null) {
    const cacheKey = `${this.language}-${category}-${subcategory || 'all'}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    try {
      let result;
      
      if (category === 'complexSites') {
        const patterns = require('./core/patterns');
        result = patterns.complexSites;
      } else if (category === 'urlKeywords') {
        const patterns = require('./core/patterns');
        result = patterns.urlKeywords;
      } else if (category === 'highConfidenceDomains') {
        const patterns = require('./core/patterns');
        result = patterns.highConfidenceDomains;
      } else if (category === 'lowConfidenceDomains') {
        const patterns = require('./core/patterns');
        result = patterns.lowConfidenceDomains;
      } else if (category === 'pathPatterns') {
        const patterns = require('./core/patterns');
        result = patterns.pathPatterns;
      } else if (category === 'languageUrlPatterns') {
        const patterns = require('./core/patterns');
        result = patterns.languageUrlPatterns;
      } else if (category === 'languageTldMappings') {
        const patterns = require('./core/patterns');
        result = patterns.languageTldMappings;
      } else {
        const langDict = require(`./scraping/${this.language}`);
        const universal = require('./core/universal');
        const platforms = require('./core/platforms');
        const patterns = require('./core/patterns');
        
        if (subcategory) {
          result = langDict[category]?.[subcategory];
        } else {
          result = langDict[category];
        }
        
        if (!result && universal[category]) {
          result = universal[category];
        }
        
        if (!result && platforms[category]) {
          result = platforms[category];
        }
        
        if (!result && patterns[category]) {
          result = patterns[category];
        }
        
        if (!result && this.language !== this.fallbackLang) {
          const fallbackDict = require(`./scraping/${this.fallbackLang}`);
          result = subcategory ? 
            fallbackDict[category]?.[subcategory] : 
            fallbackDict[category];
        }
      }
      
      this.cache.set(cacheKey, result || []);
      return result || [];
      
    } catch (error) {
      config.smartLog('fail', `Error loading dictionary: ${error.message}`);
      return [];
    }
  }

  getJobTerms() {
    return this.get('jobTerms') || [];
  }

  getComplexDomains() {
    return this.get('complexSites') || [];
  }

  getKnownJobPlatforms() {
    try {
      const platforms = require('./core/platforms');
      return platforms.knownJobPlatforms || [];
    } catch (error) {
      return [];
    }
  }

  getJobURLPatterns() {
    try {
      const patterns = require('./core/patterns');
      return patterns.jobURLPatterns || [];
    } catch (error) {
      return [];
    }
  }
}

module.exports = new DictionaryManager();