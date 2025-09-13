const config = require('../config');

class OptimizedLanguageDetector {
  static CONFIDENCE_THRESHOLDS = {
    HIGH: 40,
    MEDIUM: 20,
    LOW: 10,
    MINIMUM: 5,
    CANDIDATE: 3
  };

  static ambiguousTerms = null;
  static detectionCache = new Map();
  static complexSitesCache = null;
  static urlPatternsCache = null;
  static tldMappingsCache = null;
  static supportedLanguagesCache = null;

  static getComplexSites() {
    if (!this.complexSitesCache) {
      try {
        const platforms = require('./core/platforms');
        const knownPlatforms = platforms.knownJobPlatforms || [];
        
        this.complexSitesCache = knownPlatforms
          .filter(platform => platform.complexity === 'high' || platform.isGeneralist === true)
          .flatMap(platform => platform.patterns || []);
        
        const fallbackGeneralists = ['linkedin.com', 'indeed.com', 'glassdoor.com'];
        if (this.complexSitesCache.length === 0) {
          this.complexSitesCache = fallbackGeneralists;
        }
      } catch (error) {
        config.smartLog('langue', 'Failed to load complex sites from dictionary, using minimal fallback');
        this.complexSitesCache = ['linkedin.com', 'indeed.com', 'glassdoor.com'];
      }
    }
    return this.complexSitesCache;
  }

  static getUrlPatterns() {
    if (!this.urlPatternsCache) {
      try {
        const patterns = require('./core/patterns');
        this.urlPatternsCache = patterns.languageUrlPatterns || {
          ar: ['.ar/', '.ar', '/ar/', 'lang=ar', 'langue=ar'],
          fr: ['.fr/', '.fr', '/fr/', 'lang=fr', 'langue=fr'],
          es: ['.es/', '.es', '/es/', 'lang=es', 'idioma=es'],
          de: ['.de/', '.de', '/de/', 'lang=de', 'sprache=de'],
          it: ['.it/', '.it', '/it/', 'lang=it', 'lingua=it'],
          pt: ['.pt/', '.pt', '/pt/', 'lang=pt', 'idioma=pt'],
          ru: ['.ru/', '.ru', '/ru/', 'lang=ru', 'язык=ru'],
          ja: ['.jp/', '.jp', '/ja/', 'lang=ja', '言語=ja'],
          zh: ['.cn/', '.cn', '/zh/', 'lang=zh', '语言=zh'],
          ko: ['.kr/', '.kr', '/ko/', 'lang=ko', '언어=ko'],
          en: ['.com/', '.com', '.org/', '.org', '.net/', '.net', 'lang=en', 'language=en']
        };
      } catch (error) {
        config.smartLog('langue', 'Failed to load URL patterns from dictionary, using fallback');
        this.urlPatternsCache = {
          fr: ['.fr/', '.fr', '/fr/', 'lang=fr'],
          es: ['.es/', '.es', '/es/', 'lang=es'],
          de: ['.de/', '.de', '/de/', 'lang=de'],
          en: ['.com/', '.com', '.org/', '.org', 'lang=en']
        };
      }
    }
    return this.urlPatternsCache;
  }

  static getTldMappings() {
    if (!this.tldMappingsCache) {
      try {
        const patterns = require('./core/patterns');
        this.tldMappingsCache = patterns.languageTldMappings || {
          '.de': 'de', '.fr': 'fr', '.es': 'es', '.it': 'it', 
          '.pt': 'pt', '.ru': 'ru', '.jp': 'ja', '.cn': 'zh', '.kr': 'ko'
        };
      } catch (error) {
        config.smartLog('langue', 'Failed to load TLD mappings from dictionary, using fallback');
        this.tldMappingsCache = {
          '.de': 'de', '.fr': 'fr', '.es': 'es', '.it': 'it', 
          '.pt': 'pt', '.ru': 'ru', '.jp': 'ja', '.cn': 'zh', '.kr': 'ko'
        };
      }
    }
    return this.tldMappingsCache;
  }

  static getSupportedLanguages() {
    if (!this.supportedLanguagesCache) {
      try {
        const patterns = require('./core/patterns');
        this.supportedLanguagesCache = patterns.supportedLanguages || [
          'ar', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 
          'he', 'hi', 'id', 'it', 'ja', 'ko', 'lb', 'ms', 'nl', 'no', 
          'pl', 'pt', 'ro', 'ru', 'sv', 'sw', 'th', 'tr', 'uk', 'vi', 'zh'
        ];
      } catch (error) {
        config.smartLog('langue', 'Failed to load supported languages from dictionary, using fallback');
        this.supportedLanguagesCache = [
          'ar', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 
          'he', 'hi', 'id', 'it', 'ja', 'ko', 'lb', 'ms', 'nl', 'no', 
          'pl', 'pt', 'ro', 'ru', 'sv', 'sw', 'th', 'tr', 'uk', 'vi', 'zh'
        ];
      }
    }
    return this.supportedLanguagesCache;
  }

  static async loadAmbiguousTerms() {
    if (!this.ambiguousTerms) {
      try {
        this.ambiguousTerms = require('./detection/ambiguous');
      } catch (error) {
        config.smartLog('langue', 'Ambiguous terms not found, using fallback');
        this.ambiguousTerms = { weight: 5 };
      }
    }
    return this.ambiguousTerms;
  }

  static async loadDetectionDict(lang) {
    const cacheKey = `detection_${lang}`;
    if (!this.detectionCache.has(cacheKey)) {
      try {
        const dict = require(`./detection/${lang}`);
        this.detectionCache.set(cacheKey, dict);
        return dict;
      } catch (error) {
        config.smartLog('langue', `Dictionary not found for ${lang}, using fallback`);
        return null;
      }
    }
    return this.detectionCache.get(cacheKey);
  }

  static preprocessText(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000);
  }

  static extractWords(text) {
    const words = text.split(/\s+/).filter(w => w.length > 1);
    const wordSet = new Set(words);
    return { words, wordSet, totalWords: words.length };
  }

  static async scoreAmbiguousTerms(wordSet, totalWords) {
    const ambiguous = await this.loadAmbiguousTerms();
    const candidates = new Set();
    let totalAmbiguousScore = 0;

    Object.entries(ambiguous).forEach(([category, terms]) => {
      if (category === 'weight') return;
      
      if (Array.isArray(terms)) {
        terms.forEach(term => {
          if (wordSet.has(term)) {
            totalAmbiguousScore += ambiguous.weight || 5;
            
            if (category.includes('Germanic')) {
              candidates.add('en').add('de');
            } else if (category.includes('Latin')) {
              candidates.add('fr').add('es').add('it').add('pt');
            } else if (category.includes('Asian')) {
              candidates.add('ja').add('ko').add('zh');
            } else if (category.includes('Arabic')) {
              candidates.add('ar');
            } else if (category.includes('Slavic')) {
              candidates.add('ru').add('uk').add('pl').add('cs');
            } else {
              this.getSupportedLanguages().forEach(lang => candidates.add(lang));
            }
          }
        });
      }
    });

    const normalizedScore = Math.round((totalAmbiguousScore / Math.max(totalWords * 0.01, 1)) * 100);
    
    return {
      score: normalizedScore,
      candidates: Array.from(candidates).filter(lang => this.getSupportedLanguages().includes(lang))
    };
  }

  static async scoreSpecificLanguage(lang, wordSet, totalWords) {
    const dict = await this.loadDetectionDict(lang);
    if (!dict) return 0;

    let score = 0;
    const categories = ['grammar', 'signatures', 'jobSpecific', 'uiSpecific'];
    const weights = { grammar: 5, signatures: 4, jobSpecific: 3, uiSpecific: 2 };

    categories.forEach(category => {
      if (!dict[category]) return;
      
      const weight = weights[category] || 1;
      
      if (category === 'signatures') {
        dict[category].forEach(phrase => {
          if (wordSet.has(phrase.replace(/\s+/g, ' '))) {
            score += weight * 2;
          }
        });
      } else if (Array.isArray(dict[category])) {
        dict[category].forEach(word => {
          if (wordSet.has(word)) {
            score += weight;
          }
        });
      }
    });

    return Math.round((score / Math.max(totalWords * 0.01, 1)) * 100) * (dict.weight || 10);
  }

  static async detectFromURL(url) {
    const urlLower = url.toLowerCase();
    const complexSites = this.getComplexSites();
    
    if (complexSites.some(domain => urlLower.includes(domain))) {
      return 'en';
    }
  
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      const tldMappings = this.getTldMappings();
      
      for (const [tld, lang] of Object.entries(tldMappings)) {
        if (hostname.endsWith(tld)) {
          config.smartLog('langue', `TLD detection: ${url} → ${lang} (TLD: ${tld})`);
          return lang;
        }
      }
    } catch (e) {
    }
  
    const urlPatterns = this.getUrlPatterns();
    for (const [lang, patterns] of Object.entries(urlPatterns)) {
      if (patterns.some(pattern => urlLower.includes(pattern))) {
        config.smartLog('langue', `URL detection: ${url} → ${lang} (pattern: ${patterns.find(p => urlLower.includes(p))})`);
        return lang;
      }
    }
  
    return null;
  }

  static async detectFromText(text, url = '') {
    if (!text || text.length < 20) return 'en';

    const processedText = this.preprocessText(text);
    const { wordSet, totalWords } = this.extractWords(processedText);

    if (totalWords < 10) return 'en';

    const urlLang = await this.detectFromURL(url);
    if (urlLang && urlLang !== 'en') return urlLang;

    const ambiguousResult = await this.scoreAmbiguousTerms(wordSet, totalWords);
    
    if (ambiguousResult.candidates.length === 0) {
      return 'en';
    }

    if (ambiguousResult.candidates.length === 1) {
      return ambiguousResult.candidates[0];
    }

    const specificScores = {};
    for (const lang of ambiguousResult.candidates) {
      specificScores[lang] = await this.scoreSpecificLanguage(lang, wordSet, totalWords);
    }

    const sortedLangs = Object.entries(specificScores)
      .sort((a, b) => b[1] - a[1]);

    const topLang = sortedLangs[0];
    const secondLang = sortedLangs[1] || ['en', 0];

    const confidence = topLang[1] - secondLang[1];

    if (topLang[1] < this.CONFIDENCE_THRESHOLDS.MINIMUM || confidence < 5) {
      return urlLang || 'en';
    }

    return topLang[0];
  }

  static async detect(page) {
    try {
      const urlPatterns = this.getUrlPatterns();
      const supportedLangs = this.getSupportedLanguages();
      return await page.evaluate((patterns, supportedLanguages) => {
        const currentUrl = window.location.href.toLowerCase();
        
        const htmlLang = document.documentElement.lang || document.documentElement.getAttribute('xml:lang');
        if (htmlLang) {
          const lang = htmlLang.split('-')[0].toLowerCase();
          if (supportedLanguages.includes(lang)) {
            return lang;
          }
        }

        const metaLang = document.querySelector('meta[http-equiv="content-language"]')?.content || 
                        document.querySelector('meta[name="language"]')?.content || 
                        document.querySelector('meta[property="og:locale"]')?.content;
        if (metaLang) {
          const lang = metaLang.split(/[-_]/)[0].toLowerCase();
          if (supportedLanguages.includes(lang)) {
            return lang;
          }
        }

        for (const [lang, patternArray] of Object.entries(patterns)) {
          if (patternArray.some(pattern => currentUrl.includes(pattern))) {
            return lang;
          }
        }

        return 'en';
      }, urlPatterns, supportedLangs);
    } catch (error) {
      config.smartLog('fail', `Browser detection failed: ${error.message}`);
      return 'en';
    }
  }

  static async detectRobust(page) {
    try {
      const url = await page.url();
      config.smartLog('langue', `Starting detection for: ${url}`);
      
      const urlDetection = await this.detectFromURL(url);
      if (urlDetection && urlDetection !== 'en') {
        config.smartLog('langue', `URL detection successful: ${urlDetection}`);
        return urlDetection;
      }
      
      const pageDetection = await this.detect(page);        
      config.smartLog('langue', `Browser detection: ${pageDetection}`);
      
      if (pageDetection !== 'en') {
        return pageDetection;
      }

      const textContent = await page.evaluate(() => {
        return (document.body?.innerText || '').substring(0, 3000);
      });
      
      const textDetection = await this.detectFromText(textContent, url);
      config.smartLog('langue', `Text detection: ${textDetection}`);
      
      return textDetection || urlDetection || pageDetection;

    } catch (error) {
      config.smartLog('fail', `Robust detection failed: ${error.message}`);
      return 'en';
    }
  }

  static async detectWithConfidence(page) {
    try {
      const url = await page.url();
      const textContent = await page.evaluate(() => {
        return (document.body?.innerText || '').substring(0, 3000);
      });

      const pageDetection = await this.detect(page);
      const textDetection = await this.detectFromText(textContent, url);
      const urlDetection = await this.detectFromURL(url);

      const detections = [pageDetection, textDetection, urlDetection].filter(Boolean);
      const counts = {};
      
      detections.forEach(lang => {
        counts[lang] = (counts[lang] || 0) + 1;
      });

      const finalLang = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];

      const confidence = Math.min(100, Math.max(0, (counts[finalLang] || 0) * 33));

      return {
        language: finalLang,
        confidence: confidence,
        methods: {
          page: pageDetection,
          url: urlDetection,
          text: textDetection
        }
      };

    } catch (error) {
      config.smartLog('fail', `Confidence detection failed: ${error.message}`);
      return {
        language: 'en',
        confidence: 0,
        methods: { page: 'en', url: 'en', text: 'en' }
      };
    }
  }

  static isComplexSite(url) {
    const complexSites = this.getComplexSites();
    return complexSites.some(domain => url.toLowerCase().includes(domain));
  }
}

module.exports = OptimizedLanguageDetector;