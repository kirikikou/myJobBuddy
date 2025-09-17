class MatchingUtils {
    static fuzzyMatch(text1, text2, threshold = 0.8) {
      if (!text1 || !text2) return 0;
      
      const str1 = text1.toLowerCase().trim();
      const str2 = text2.toLowerCase().trim();
      
      if (str1 === str2) return 1.0;
      
      const words1 = str1.split(/\s+/).filter(w => w.length > 2);
      const words2 = str2.split(/\s+/).filter(w => w.length > 2);
      
      if (words1.length === 0 || words2.length === 0) return 0;
      
      let matches = 0;
      words1.forEach(word1 => {
        if (words2.some(word2 => 
          word2.includes(word1) || word1.includes(word2)
        )) {
          matches++;
        }
      });
      
      const score = matches / Math.max(words1.length, words2.length);
      return score >= threshold ? score : 0;
    }
  
    static calculateQuickFuzzyMatch(jobTitle, candidateTitle) {
      const jobWords = jobTitle.split(/\s+/).filter(w => w.length > 2);
      const candidateWords = candidateTitle.split(/\s+/).filter(w => w.length > 2);
      
      if (jobWords.length === 0 || candidateWords.length === 0) return 0;
      
      let matches = 0;
      jobWords.forEach(jobWord => {
        if (candidateWords.some(candWord => 
          candWord.includes(jobWord) || jobWord.includes(candWord)
        )) {
          matches++;
        }
      });
      
      return matches / Math.max(jobWords.length, candidateWords.length);
    }
  
    static calculateRelevanceScore(jobData, searchCriteria) {
      if (!jobData || !searchCriteria) return 0;
      
      let totalScore = 0;
      let weightSum = 0;
      
      const weights = {
        title: 0.4,
        description: 0.3,
        location: 0.2,
        company: 0.1
      };
      
      if (searchCriteria.jobTitle && jobData.title) {
        const titleScore = this.fuzzyMatch(searchCriteria.jobTitle, jobData.title, 0.6);
        totalScore += titleScore * weights.title;
        weightSum += weights.title;
      }
      
      if (searchCriteria.keywords && jobData.description) {
        const keywordScore = this.calculateKeywordMatch(jobData.description, searchCriteria.keywords);
        totalScore += keywordScore * weights.description;
        weightSum += weights.description;
      }
      
      if (searchCriteria.location && jobData.location) {
        const locationScore = this.fuzzyMatch(searchCriteria.location, jobData.location, 0.7);
        totalScore += locationScore * weights.location;
        weightSum += weights.location;
      }
      
      if (searchCriteria.company && jobData.company) {
        const companyScore = this.fuzzyMatch(searchCriteria.company, jobData.company, 0.8);
        totalScore += companyScore * weights.company;
        weightSum += weights.company;
      }
      
      return weightSum > 0 ? totalScore / weightSum : 0;
    }
  
    static calculateKeywordMatch(text, keywords) {
      if (!text || !keywords || !Array.isArray(keywords)) return 0;
      
      const textLower = text.toLowerCase();
      const foundKeywords = keywords.filter(keyword => 
        textLower.includes(keyword.toLowerCase())
      );
      
      return foundKeywords.length / keywords.length;
    }
  
    static tokenizeText(text, language = 'en') {
      if (!text || typeof text !== 'string') return [];
      
      const cleaned = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      const tokens = cleaned.split(' ').filter(token => token.length > 2);
      
      const stopWords = this.getStopWords(language);
      return tokens.filter(token => !stopWords.includes(token));
    }
  
    static getStopWords(language) {
      const stopWords = {
        en: ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'],
        fr: ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour', 'dans', 'ce', 'son', 'une', 'sur', 'avec', 'ne', 'se', 'pas', 'tout', 'plus', 'par', 'grand', 'ou', 'si', 'les', 'deux', 'même', 'lui', 'nous', 'comme', 'après', 'sans', 'autre', 'très', 'bien', 'où', 'encore', 'aussi'],
        es: ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'una', 'del', 'los', 'al', 'más', 'pero', 'sus', 'me', 'yo', 'todo', 'muy', 'mi', 'puede', 'bien', 'está', 'ya', 'sí', 'así', 'donde', 'cuando'],
        de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über', 'einen', 'so', 'zum', 'war', 'haben', 'nur', 'oder', 'aber', 'vor', 'zur', 'bis', 'mehr', 'durch', 'man', 'sein', 'wurde', 'sei', 'ihr']
      };
      
      return stopWords[language] || stopWords.en;
    }
  
    static expandSynonyms(keywords, language = 'en') {
      if (!keywords || !Array.isArray(keywords)) return [];
      
      const synonymMap = this.getSynonymMap(language);
      const expandedKeywords = [...keywords];
      
      keywords.forEach(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        if (synonymMap[lowerKeyword]) {
          expandedKeywords.push(...synonymMap[lowerKeyword]);
        }
      });
      
      return [...new Set(expandedKeywords)];
    }
  
    static getSynonymMap(language) {
      const synonymMaps = {
        en: {
          'developer': ['programmer', 'engineer', 'coder', 'dev'],
          'manager': ['lead', 'supervisor', 'director', 'head'],
          'designer': ['ux', 'ui', 'graphic', 'creative'],
          'analyst': ['researcher', 'specialist', 'consultant'],
          'engineer': ['developer', 'architect', 'tech lead'],
          'sales': ['business development', 'account manager', 'commercial'],
          'marketing': ['digital marketing', 'brand', 'communications'],
          'junior': ['entry level', 'associate', 'trainee'],
          'senior': ['principal', 'expert', 'lead'],
          'remote': ['telecommute', 'work from home', 'distributed'],
          'fulltime': ['full time', 'permanent', 'staff'],
          'parttime': ['part time', 'contract', 'freelance']
        },
        fr: {
          'développeur': ['programmeur', 'ingénieur', 'dev'],
          'manager': ['responsable', 'chef', 'directeur'],
          'designer': ['concepteur', 'ux', 'ui'],
          'analyste': ['consultant', 'spécialiste'],
          'ingénieur': ['développeur', 'architecte'],
          'commercial': ['vente', 'business developer'],
          'marketing': ['communication', 'digital'],
          'junior': ['débutant', 'associé'],
          'senior': ['expert', 'principal', 'lead'],
          'télétravail': ['remote', 'distance'],
          'temps plein': ['cdi', 'permanent'],
          'temps partiel': ['freelance', 'consultant']
        }
      };
      
      return synonymMaps[language] || synonymMaps.en;
    }
  
    static normalizeJobTitle(title, language = 'en') {
      if (!title || typeof title !== 'string') return '';
      
      let normalized = title.toLowerCase().trim();
      
      const replacements = {
        en: {
          'sr.': 'senior',
          'jr.': 'junior',
          'mgr.': 'manager',
          'dev.': 'developer',
          'eng.': 'engineer',
          '&': 'and',
          '+': ' plus ',
          '/': ' or '
        },
        fr: {
          'dév.': 'développeur',
          'ing.': 'ingénieur',
          'resp.': 'responsable',
          '&': 'et',
          '+': ' plus ',
          '/': ' ou '
        }
      };
      
      const langReplacements = replacements[language] || replacements.en;
      
      Object.entries(langReplacements).forEach(([key, value]) => {
        normalized = normalized.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), value);
      });
      
      normalized = normalized.replace(/\s+/g, ' ').trim();
      
      return normalized;
    }
  
    static calculateTextSimilarity(text1, text2) {
      if (!text1 || !text2) return 0;
      
      const tokens1 = this.tokenizeText(text1);
      const tokens2 = this.tokenizeText(text2);
      
      if (tokens1.length === 0 || tokens2.length === 0) return 0;
      
      const intersection = tokens1.filter(token => tokens2.includes(token));
      const union = [...new Set([...tokens1, ...tokens2])];
      
      return intersection.length / union.length;
    }
  
    static scoreJobMatch(jobData, searchCriteria, options = {}) {
      const {
        titleWeight = 0.4,
        descriptionWeight = 0.3,
        locationWeight = 0.2,
        companyWeight = 0.1,
        threshold = 0.3
      } = options;
      
      const scores = {
        title: 0,
        description: 0,
        location: 0,
        company: 0,
        overall: 0
      };
      
      if (searchCriteria.jobTitle && jobData.title) {
        scores.title = this.fuzzyMatch(searchCriteria.jobTitle, jobData.title, 0.6);
      }
      
      if (searchCriteria.description && jobData.description) {
        scores.description = this.calculateTextSimilarity(searchCriteria.description, jobData.description);
      }
      
      if (searchCriteria.location && jobData.location) {
        scores.location = this.fuzzyMatch(searchCriteria.location, jobData.location, 0.7);
      }
      
      if (searchCriteria.company && jobData.company) {
        scores.company = this.fuzzyMatch(searchCriteria.company, jobData.company, 0.8);
      }
      
      scores.overall = (scores.title * titleWeight) + 
                      (scores.description * descriptionWeight) + 
                      (scores.location * locationWeight) + 
                      (scores.company * companyWeight);
      
      return scores.overall >= threshold ? scores : null;
    }
  
    static findBestMatches(candidates, searchCriteria, limit = 10) {
      if (!candidates || !Array.isArray(candidates)) return [];
      
      const scoredCandidates = candidates
        .map(candidate => ({
          ...candidate,
          matchScore: this.scoreJobMatch(candidate, searchCriteria)
        }))
        .filter(candidate => candidate.matchScore && candidate.matchScore.overall > 0)
        .sort((a, b) => b.matchScore.overall - a.matchScore.overall)
        .slice(0, limit);
      
      return scoredCandidates;
    }
  
    static deduplicateByUrl(items) {
      if (!items || !Array.isArray(items)) return [];
      
      const uniqueItems = [];
      const seenUrls = new Set();
      
      items
        .sort((a, b) => (b.confidence || b.matchScore?.overall || 0) - (a.confidence || a.matchScore?.overall || 0))
        .forEach(item => {
          if (item.url && !seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            uniqueItems.push(item);
          }
        });
      
      return uniqueItems;
    }
  
    static filterByConfidence(items, minConfidence = 0.3) {
      if (!items || !Array.isArray(items)) return [];
      
      return items.filter(item => {
        const confidence = item.confidence || item.matchScore?.overall || 0;
        return confidence >= minConfidence;
      });
    }
  }
  
  module.exports = MatchingUtils;