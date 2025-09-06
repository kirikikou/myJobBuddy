const axios = require('axios');
const config = require('../config');
const dictionaryManager = require('./dictionaryManager');

class IndependentLanguageDetector {
  static getSupportedLanguages() {
    return dictionaryManager.getSupportedLanguages();
  }
  
  static getComplexSites() {
    return dictionaryManager.getComplexSites();
  }
  
  static getUrlKeywords() {
    return dictionaryManager.getUrlKeywords();
  }
  
  static getHighConfidenceDomains() {
    return dictionaryManager.getHighConfidenceDomains();
  }
  
  static getLowConfidenceDomains() {
    return dictionaryManager.getLowConfidenceDomains();
  }
  
  static getPathPatterns() {
    return dictionaryManager.getPathPatterns();
  }

  static async detectFromURL(url) {
    const urlLower = url.toLowerCase();
    
    if (this.getComplexSites().some(domain => urlLower.includes(domain))) {
      config.smartLog('langue', `Complex site detected: ${url} → en`);
      return 'en';
    }

    const scores = {};

    for (const [lang, keywords] of Object.entries(this.getUrlKeywords())) {
      for (const keyword of keywords) {
        if (urlLower.includes(keyword)) {
          scores[lang] = Math.max(scores[lang] || 0, 50);
          config.smartLog('langue', `URL keyword '${keyword}' found for ${lang} (score: 50)`);
        }
      }
    }

    for (const [lang, patterns] of Object.entries(this.getHighConfidenceDomains())) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern)) {
          scores[lang] = Math.max(scores[lang] || 0, 30);
          config.smartLog('langue', `High confidence domain '${pattern}' found for ${lang} (score: 30)`);
        }
      }
    }

    for (const [lang, patterns] of Object.entries(this.getPathPatterns())) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern)) {
          scores[lang] = Math.max(scores[lang] || 0, 40);
          config.smartLog('langue', `Path pattern '${pattern}' found for ${lang} (score: 40)`);
        }
      }
    }

    for (const [lang, patterns] of Object.entries(this.getLowConfidenceDomains())) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern)) {
          scores[lang] = Math.max(scores[lang] || 0, 10);
          config.smartLog('langue', `Low confidence domain '${pattern}' found for ${lang} (score: 10)`);
        }
      }
    }

    if (Object.keys(scores).length === 0) {
      return null;
    }

    const bestMatch = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
    config.smartLog('langue', `URL detection result: ${url} → ${bestMatch[0]} (score: ${bestMatch[1]})`);
    
    return bestMatch[0];
  }

  static async detectFromHTTP(url) {
    try {
      config.smartLog('langue', `HTTP detection starting for: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxRedirects: 3
      });

      const html = response.data;
      const scores = {};
      const detectedLanguages = [];
      
      const primaryHtmlLangMatch = html.match(/^[^<]*<!DOCTYPE[^>]*>[\s\S]*?<html[^>]*\s+lang=["']([^"']+)["']/i);
      if (primaryHtmlLangMatch) {
        const rawLang = primaryHtmlLangMatch[1];
        const lang = rawLang.split(/[-_]/)[0].toLowerCase();
        if (this.getSupportedLanguages().includes(lang)) {
          scores[lang] = 100;
          detectedLanguages.push(`HTML(primary): ${rawLang} → ${lang}`);
          config.smartLog('langue', `PRIMARY HTML lang found: ${rawLang} → ${lang} (score: 100)`);
        }
      }

      const allHtmlLangMatches = html.match(/<[^>]*\s+lang=["']([^"']+)["']/gi);
      if (allHtmlLangMatches && allHtmlLangMatches.length > 1) {
        config.smartLog('langue', `DEBUG: Multiple lang attributes found: ${allHtmlLangMatches.slice(0, 5).join(', ')}`);
        
        const langCounts = {};
        for (const match of allHtmlLangMatches) {
          const langMatch = match.match(/lang=["']([^"']+)["']/i);
          if (langMatch) {
            const rawLang = langMatch[1];
            const lang = rawLang.split(/[-_]/)[0].toLowerCase();
            if (this.getSupportedLanguages().includes(lang)) {
              langCounts[lang] = (langCounts[lang] || 0) + 1;
            }
          }
        }
        
        if (Object.keys(langCounts).length > 0) {
          const dominantLang = Object.entries(langCounts).reduce((a, b) => a[1] > b[1] ? a : b);
          config.smartLog('langue', `DOMINANT language from all lang attributes: ${dominantLang[0]} (${dominantLang[1]} occurrences)`);
        }
      }

      const metaMatches = [
        html.match(/<meta[^>]*http-equiv=["']content-language["'][^>]*content=["']([^"']+)["']/i),
        html.match(/<meta[^>]*name=["']language["'][^>]*content=["']([^"']+)["']/i),
        html.match(/<meta[^>]*property=["']og:locale["'][^>]*content=["']([^"']+)["']/i)
      ];
      
      for (const match of metaMatches) {
        if (match) {
          const rawLang = match[1];
          const lang = rawLang.split(/[-_]/)[0].toLowerCase();
          if (this.getSupportedLanguages().includes(lang)) {
            scores[lang] = Math.max(scores[lang] || 0, 80);
            detectedLanguages.push(`META: ${rawLang} → ${lang}`);
            config.smartLog('langue', `META lang found: ${rawLang} → ${lang} (score: 80)`);
          }
        }
      }

      const hreflangMatches = html.match(/<link[^>]+hreflang=["']([^"']+)["'][^>]*>/gi);
      if (hreflangMatches) {
        const hreflangLangs = new Set();
        for (const match of hreflangMatches) {
          const langMatch = match.match(/hreflang=["']([^"']+)["']/i);
          if (langMatch && langMatch[1] !== 'x-default') {
            const lang = langMatch[1].split(/[-_]/)[0].toLowerCase();
            if (this.getSupportedLanguages().includes(lang)) {
              hreflangLangs.add(lang);
            }
          }
        }
        config.smartLog('langue', `HREFLANG languages detected: ${Array.from(hreflangLangs).join(', ')}`);
      }

      if (detectedLanguages.length > 0) {
        config.smartLog('langue', `ALL detected languages: ${detectedLanguages.join(', ')}`);
      }

      const urlLangHint = await this.detectFromURL(url);
      if (urlLangHint && scores[urlLangHint]) {
        const bonus = urlLangHint === 'de' ? 15 : 10;
        scores[urlLangHint] += bonus;
        config.smartLog('langue', `URL-based bonus for ${urlLangHint}: +${bonus} (new score: ${scores[urlLangHint]})`);
      }

      const conflictDetected = this.detectLanguageConflict(url, scores, urlLangHint);
      if (conflictDetected) {
        config.smartLog('langue', `CONFLICT RESOLUTION: ${conflictDetected.reason}`);
        return conflictDetected.resolvedLanguage;
      }

      if (Object.keys(scores).length === 0) {
        return null;
      }

      const bestMatch = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
      config.smartLog('langue', `HTTP detection result: ${url} → ${bestMatch[0]} (score: ${bestMatch[1]})`);
      
      return bestMatch[0];
    } catch (error) {
      config.smartLog('fail', `HTTP detection failed for ${url}: ${error.message}`);
      return null;
    }
  }

  static detectLanguageConflict(url, scores, urlLangHint) {
    if (!urlLangHint || !scores[urlLangHint]) return null;
    
    const urlLower = url.toLowerCase();
    const urlScore = scores[urlLangHint];
    const otherScores = Object.entries(scores).filter(([lang]) => lang !== urlLangHint);
    
    if (otherScores.length === 0) return null;
    
    const highestOther = otherScores.reduce((a, b) => a[1] > b[1] ? a : b);
    const [otherLang, otherScore] = highestOther;
    
    if (otherScore > urlScore && otherLang === 'en') {
      if (urlLangHint === 'de' && urlLower.includes('.de') && !urlLower.includes('/en/')) {
        return {
          reason: `HTML claims "en" but URL is .de domain without /en/ path - prioritizing domain language`,
          resolvedLanguage: urlLangHint
        };
      }
      
      if (urlLangHint === 'fr' && urlLower.includes('.fr') && !urlLower.includes('/en/')) {
        return {
          reason: `HTML claims "en" but URL is .fr domain without /en/ path - prioritizing domain language`,
          resolvedLanguage: urlLangHint
        };
      }
      
      if (urlLangHint === 'es' && urlLower.includes('.es') && !urlLower.includes('/en/')) {
        return {
          reason: `HTML claims "en" but URL is .es domain without /en/ path - prioritizing domain language`,
          resolvedLanguage: urlLangHint
        };
      }
    }
    
    return null;
  }

  static async detectLanguageIndependent(url) {
    config.smartLog('langue', `Starting independent detection for: ${url}`);
    
    const httpResult = await this.detectFromHTTP(url);
    if (httpResult) {
      config.smartLog('langue', `Final result (HTTP): ${url} → ${httpResult}`);
      return {
        code: httpResult,
        lang: httpResult,
        score: 100
      };
    }

    const urlResult = await this.detectFromURL(url);
    if (urlResult) {
      config.smartLog('langue', `Final result (URL): ${url} → ${urlResult}`);
      return {
        code: urlResult,
        lang: urlResult,
        score: 50
      };
    }

    config.smartLog('langue', `No language detected for: ${url} → null`);
    return null;
  }

  static getScrapingLanguage(detectedLanguage) {
    const scrapingLang = detectedLanguage || 'en';
    if (detectedLanguage) {
      config.smartLog('langue', `Using detected language for scraping: ${scrapingLang}`);
    } else {
      config.smartLog('langue', `No language detected, using fallback for scraping: ${scrapingLang}`);
    }
    return scrapingLang;
  }

  static async detect(input) {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return await this.detectLanguageIndependent(input);
    }
    
    const supportedLangs = this.getSupportedLanguages();
    const inputLower = input.toLowerCase().trim();
    
    const urlKeywords = this.getUrlKeywords();
    const pathPatterns = this.getPathPatterns();
    
    const scores = {};
    
    const wordBanks = {
      en: ['looking', 'for', 'job', 'work', 'career', 'employment', 'position', 'hiring', 'opportunities', 'apply', 'application', 'resume', 'cv', 'interview', 'candidate', 'experience', 'skills', 'company', 'team'],
      fr: ['cherche', 'emploi', 'travail', 'carrière', 'poste', 'candidature', 'recrutement', 'opportunités', 'compétences', 'expérience', 'équipe'],
      de: ['suche', 'arbeit', 'stelle', 'beruf', 'karriere', 'bewerbung', 'stellenanzeige', 'unternehmen', 'erfahrung', 'fähigkeiten'],
      es: ['busco', 'trabajo', 'empleo', 'carrera', 'puesto', 'solicitud', 'oportunidades', 'experiencia', 'habilidades', 'empresa']
    };
    
    for (const [lang, words] of Object.entries(wordBanks)) {
      let langScore = 0;
      for (const word of words) {
        if (inputLower.includes(word.toLowerCase())) {
          langScore += word.length + 5;
        }
      }
      if (langScore > 0) scores[lang] = langScore;
    }
    
    for (const lang of supportedLangs) {
      if (urlKeywords[lang]) {
        for (const keyword of urlKeywords[lang]) {
          if (inputLower.includes(keyword.toLowerCase())) {
            const keywordScore = keyword.length * 3;
            scores[lang] = (scores[lang] || 0) + keywordScore;
          }
        }
      }
      
      if (pathPatterns[lang]) {
        for (const pattern of pathPatterns[lang]) {
          if (inputLower.includes(pattern.toLowerCase())) {
            const patternScore = pattern.length * 2;
            scores[lang] = (scores[lang] || 0) + patternScore;
          }
        }
      }
    }
    
    if (scores['en']) {
      scores['en'] += 10;
    }
    
    if (Object.keys(scores).length === 0) {
      const fallbackLang = supportedLangs.includes('en') ? 'en' : supportedLangs[0];
      return {
        code: fallbackLang,
        lang: fallbackLang,
        score: 10
      };
    }
    
    const bestMatch = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
    const finalScore = Math.min(100, bestMatch[1]);
    
    return {
      code: bestMatch[0],
      lang: bestMatch[0],
      score: finalScore
    };
  }
}

const standaloneDetect = (input) => {
  try {
    if (typeof input !== 'string' || input.length === 0) {
      return { code: 'en', lang: 'en', score: 10 };
    }
    
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return { code: 'en', lang: 'en', score: 50 };
    }
    
    const inputLower = input.toLowerCase().trim();
    
    const wordBanks = {
      fr: ['cherche', 'emploi', 'travail', 'carrière', 'poste', 'candidature', 'recrutement'],
      en: ['looking', 'for', 'job', 'work', 'career', 'employment', 'position', 'hiring'], 
      de: ['suche', 'arbeit', 'stelle', 'beruf', 'karriere', 'bewerbung', 'stellenanzeige'],
      es: ['busco', 'trabajo', 'empleo', 'carrera', 'puesto', 'solicitud', 'oportunidades']
    };
    
    const scores = {};
    
    for (const [lang, words] of Object.entries(wordBanks)) {
      let langScore = 0;
      for (const word of words) {
        if (inputLower.includes(word.toLowerCase())) {
          langScore += word.length + 10;
        }
      }
      if (langScore > 0) scores[lang] = langScore;
    }
    
    if (scores['en']) {
      scores['en'] += 10;
    }
    
    if (Object.keys(scores).length === 0) {
      return { code: 'en', lang: 'en', score: 10 };
    }
    
    const bestMatch = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
    const finalScore = Math.min(100, bestMatch[1]);
    
    return {
      code: bestMatch[0],
      lang: bestMatch[0],
      score: finalScore
    };
  } catch (error) {
    return { code: 'en', lang: 'en', score: 10 };
  }
};

module.exports = standaloneDetect;
module.exports.IndependentLanguageDetector = IndependentLanguageDetector;
module.exports.detect = standaloneDetect;
module.exports.detectLanguageIndependent = IndependentLanguageDetector.detectLanguageIndependent;
module.exports.getScrapingLanguage = IndependentLanguageDetector.getScrapingLanguage;