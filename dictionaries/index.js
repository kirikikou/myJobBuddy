const dictionaryManager = require('./dictionaryManager');
const resultsExclusion = require('./resultsExclusion');

module.exports = {
  dictionaryManager,
  
  async getDictionary(page) {
    await dictionaryManager.initialize(page);
    return dictionaryManager;
  },

  getDictionaryForLanguage(language) {
    return dictionaryManager.setLanguage(language) || dictionaryManager;
  },

  getDefaultDictionary() {
    return dictionaryManager;
  },

  async detectAndCreateDictionary(page, providedLanguage = null) {
    if (providedLanguage) {
      dictionaryManager.setLanguage(providedLanguage);
    } else {
      await dictionaryManager.initialize(page);
    }
    return dictionaryManager;
  },

  get jobTerms() {
    return dictionaryManager.getJobTerms();
  },
  
  get knownJobPlatforms() {
    return dictionaryManager.getKnownJobPlatforms();
  },
  
  get complexDomains() {
    return dictionaryManager.getComplexDomains();
  },
  
  get templateIndicators() {
    return dictionaryManager.getTemplateIndicators();
  },
  
  get cookieSelectors() {
    return dictionaryManager.getCookieSelectors();
  },
  
  get cookieTextSelectors() {
    return dictionaryManager.getCookieTextSelectors();
  },
  
  get showMoreSelectors() {
    return dictionaryManager.getShowMoreSelectors();
  },
  
  get showMoreTextSelectors() {
    return dictionaryManager.getShowMoreTextSelectors();
  },
  
  get paginationSelectors() {
    return dictionaryManager.getPaginationSelectors();
  },
  
  get paginationTextSelectors() {
    return dictionaryManager.getPaginationTextSelectors();
  },
  
  get jobNavigationSelectors() {
    return dictionaryManager.getJobNavigationSelectors();
  },
  
  get jobNavigationTextSelectors() {
    return dictionaryManager.getJobNavigationTextSelectors();
  },
  
  get jobListingSelectors() {
    return dictionaryManager.getJobListingSelectors();
  },
  
  get jobURLPatterns() {
    return dictionaryManager.getJobURLPatterns();
  },
  
  get jobDetailURLPatterns() {
    return dictionaryManager.getJobDetailURLPatterns();
  },
  
  get buttonPatterns() {
    return dictionaryManager.getButtonPatterns();
  },
  
  get loadingIndicators() {
    return dictionaryManager.getLoadingIndicators();
  },
  
  get loadingTextSelectors() {
    return dictionaryManager.getLoadingTextSelectors();
  },
  
  get errorSelectors() {
    return dictionaryManager.getErrorSelectors();
  },
  
  get errorTextSelectors() {
    return dictionaryManager.getErrorTextSelectors();
  },
  
  get dynamicContentIndicators() {
    return dictionaryManager.getDynamicContentIndicators();
  },
  
  get showMorePatterns() {
    return dictionaryManager.getShowMorePatterns();
  },
  
  get paginationPatterns() {
    return dictionaryManager.getPaginationPatterns();
  },
  
  get blockingContentSelectors() {
    return dictionaryManager.getBlockingContentSelectors();
  },
  
  get blockingTextSelectors() {
    return dictionaryManager.getBlockingTextSelectors();
  },
  
  get emptyContentIndicators() {
    return dictionaryManager.getEmptyContentIndicators();
  },
  
  get emptyContentTextSelectors() {
    return dictionaryManager.getEmptyContentTextSelectors();
  },
  
  get searchFilterSelectors() {
    return dictionaryManager.getSearchFilterSelectors();
  },
  
  get filterTextSelectors() {
    return dictionaryManager.getFilterTextSelectors();
  },
  
  get filterKeywords() {
    return dictionaryManager.getFilterKeywords();
  },
  
  get csvColumnMappings() {
    return dictionaryManager.getCsvColumnMappings();
  },
  
  get csvFieldLabels() {
    return dictionaryManager.getCsvFieldLabels();
  },
  
  get csvRequiredFields() {
    return dictionaryManager.getCsvRequiredFields();
  },
  
  get csvDateFormats() {
    return dictionaryManager.getCsvDateFormats();
  },
  
  get csvValidationRules() {
    return dictionaryManager.getCsvValidationRules();
  },
  
  get jobTitleMappings() {
    return dictionaryManager.getJobTitleMappings();
  },
  
  generateJobTitleVariants(jobTitle) {
    return dictionaryManager.generateJobTitleVariants(jobTitle);
  },
  
  get workableSpecificSelectors() {
    return dictionaryManager.getWorkableSpecificSelectors();
  },
  
  get workableDetectionPatterns() {
    return dictionaryManager.getWorkableDetectionPatterns();
  },
  
  get exclusionPatterns() {
    return resultsExclusion.exclusionPatterns;
  },
  
  shouldExcludeResult(linkText, linkUrl) {
    return resultsExclusion.shouldExcludeResult(linkText, linkUrl);
  },
  
  filterJobResults(results) {
    return resultsExclusion.filterJobResults(results);
  },

  get paginationZoneSelectors() {
    return [
      '.pagination', '.pager', '.page-nav', '.page-navigation', '.page-links',
      '.results-footer', '.footer-pagination', '.bottom-pagination',
      'nav[aria-label*="pagination"]', 'nav[aria-label*="page"]',
      '[role="navigation"][aria-label*="pagination"]',
      'footer .pagination', 'footer .pager',
      '.bottom', '.results-bottom', '.listing-footer',
      '.jobs-pagination', '.careers-pagination', '.listing-pagination',
      '[class*="pagination"][class*="job"]', '[class*="pagination"][class*="career"]'
    ];
  },
  
  get filterZoneSelectors() {
    return [
      '[class*="filter"]', '[id*="filter"]', '[class*="refine"]', '[class*="affiner"]',
      '.sidebar', 'aside', '.filters', '.refinements',
      '.search-filters', '.job-filters', '.facets', '.filter-panel',
      'form[class*="filter"]', 'form[class*="search"]',
      '.filter-form', '.search-form', '.refine-form',
      '.left-panel', '.right-panel', '.side-panel',
      'header .filters', '.top-filters', '.header-filters'
    ];
  },
  
  get dynamicContentZones() {
    return [
      '[data-ajax]', '[data-dynamic]', '[data-load]', '[data-fetch]',
      '[class*="ajax"]', '[class*="dynamic"]', '[class*="lazy"]',
      '[class*="job-list"]', '[class*="career-list"]', '[class*="position-list"]',
      '[class*="vacancy-list"]', '[class*="opening-list"]',
      '[id*="job-list"]', '[id*="career-list"]', '[id*="position-list"]',
      '[class*="results"]', '[class*="listings"]', '[class*="postings"]',
      '[id*="results"]', '[id*="listings"]', '[id*="postings"]',
      '.content', '.main-content', '.primary-content',
      'main', 'article', 'section[role="main"]'
    ];
  },
  
  get smartSelectors() {
    return {
      showMore: {
        primary: dictionaryManager.getProgressive('showMore').level1,
        textBased: {
          patterns: dictionaryManager.getProgressive('showMore').level2.patterns || [],
          maxLength: 20
        }
      },
      cookies: {
        frameworks: dictionaryManager.getProgressive('cookies').level1_frameworks || {},
        textPatterns: {
          primary: /^(accept|ok|agree|got it)$/i,
          secondary: /^(accept all|accept cookies|i agree)$/i,
          maxLength: 20
        }
      }
    };
  },
  
  getLanguageDetector() {
    return require('./languageDetector');
  },
  
  getUniversalSelectors() {
    return require('./core/universal');
  },
  
  getPlatforms() {
    return require('./core/platforms');
  },
  
  getPatterns() {
    return require('./core/patterns');
  },

  fuzzyMatchJobTitle(jobTitle, linkText, threshold = 80) {
    return resultsExclusion.fuzzyMatchJobTitle(jobTitle, linkText, threshold);
  },

  calculateSimilarityScore(jobTitle, linkText) {
    return resultsExclusion.calculateSimilarityScore(jobTitle, linkText);
  },

  filterJobResultsWithFuzzyMatching(results, jobTitles, threshold = 80) {
    return resultsExclusion.filterJobResultsWithFuzzyMatching(results, jobTitles, threshold);
  },
  
  async initializeDictionary(page) {
    return await dictionaryManager.initialize(page);
  },
  
  setLanguage(lang) {
    return dictionaryManager.setLanguage(lang);
  },
  
  getCurrentLanguage() {
    return dictionaryManager.getCurrentLanguage();
  },
  
  getSupportedLanguages() {
    return dictionaryManager.getSupportedLanguages();
  },
  
  clearCache() {
    return dictionaryManager.clearCache();
  },
  
  isCompatibleWithOldDictionary() {
    return dictionaryManager.isCompatibleWithOldDictionary();
  },
  
  getAllAvailableData() {
    return dictionaryManager.getAllAvailableData();
  },
  
  filterByText(elements, textSelectors) {
    if (!elements || !textSelectors) return [];
    
    return elements.filter(element => {
      const text = element.textContent?.toLowerCase().trim() || '';
      return textSelectors.some(selector => {
        if (typeof selector === 'string') {
          return text.includes(selector.toLowerCase());
        } else if (selector instanceof RegExp) {
          return selector.test(text);
        }
        return false;
      });
    });
  },
  
  isValidSelector(selector) {
    try {
      document.querySelector(selector);
      return true;
    } catch (e) {
      return false;
    }
  },
  
  combineSelectors(selectorArrays) {
    return [...new Set(selectorArrays.flat())].filter(Boolean);
  }
};

module.exports.DictionaryManager = dictionaryManager;
module.exports.LanguageDetector = require('./languageDetector');