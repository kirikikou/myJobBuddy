const ScoreCache = require('../utils/ScoreCache');
const { MatchingUtils, TextUtils } = require('../shared');

class JobMatchingService {
    constructor(dictionaries, config) {
      this.dictionaries = dictionaries;
      this.config = config;
      this.scoreCache = new ScoreCache(config);
      this.variantsCache = new Map();
      this.patternCache = new Map();
      this.locationCache = new Map();
      this.precomputedScores = new Map();
      this.matchingThresholds = {
        direct: 1.0,
        fuzzy: this.config.matching?.fuzzyThreshold || 0.8,
        partial: this.config.matching?.partialThreshold || 0.6,
        minimum: this.config.matching?.minimumThreshold || 0.3
      };
    }
  
    findJobMatches(pageData, jobTitles, locations = []) {
      const startTime = Date.now();
      const pageTextLower = pageData.text.toLowerCase();
      const pageTitleLower = (pageData.title || '').toLowerCase();
      const combinedText = `${pageTextLower} ${pageTitleLower}`;
      
      const matches = {
        jobTitles: [],
        locations: [],
        links: [],
        priority: 0,
        processingTime: 0
      };
      
      const relevance = this.getCachedRelevance(pageData);
      
      if (!relevance.isJobPage && relevance.confidence < this.matchingThresholds.minimum) {
        this.config.smartLog('steps', 'Page relevance too low, skipping job matching');
        return matches;
      }
      
      const { matchedJobTitles, matchedLinks } = this.processJobTitleMatching(
        pageData, jobTitles, pageTextLower, pageTitleLower, combinedText
      );
      
      if (matchedJobTitles.size === 0) {
        return matches;
      }
      
      matches.jobTitles = Array.from(matchedJobTitles);
      matches.priority = 1;
      
      if (locations && locations.length > 0) {
        matches.locations = this.processLocationMatches(locations, pageTextLower, pageTitleLower);
        if (matches.locations.length > 0) {
          matches.priority = 2;
        }
      }
      
      matches.links = MatchingUtils.deduplicateByUrl(matchedLinks);
      matches.relevance = relevance;
      matches.processingTime = Date.now() - startTime;
      
      this.config.smartLog('steps', 
        `Job matching completed: ${matches.jobTitles.length} titles, ${matches.links.length} links in ${matches.processingTime}ms`
      );
      
      return matches;
    }
  
    processJobTitleMatching(pageData, jobTitles, pageTextLower, pageTitleLower, combinedText) {
      const matchedJobTitles = new Set();
      const matchedLinks = [];
      const jobTitleMatches = new Map();
      
      for (const jobTitle of jobTitles) {
        const matchResult = this.analyzeJobTitleMatch(
          jobTitle, pageTextLower, pageTitleLower, combinedText
        );
        
        if (matchResult.hasMatch) {
          matchedJobTitles.add(jobTitle);
          jobTitleMatches.set(jobTitle, matchResult);
          
          const jobLinks = this.processJobLinksOptimized(
            pageData, jobTitle, matchResult
          );
          matchedLinks.push(...jobLinks);
        }
      }
      
      return { matchedJobTitles, matchedLinks };
    }
  
    analyzeJobTitleMatch(jobTitle, pageTextLower, pageTitleLower, combinedText) {
      const context = { jobTitle, language: 'en' };
      
      return this.scoreCache.getRelevanceScore(
        { content: combinedText, title: pageTitleLower },
        context,
        (data, ctx) => this.calculateJobTitleMatch(data, ctx, pageTextLower, pageTitleLower)
      );
    }
  
    calculateJobTitleMatch(data, context, pageTextLower, pageTitleLower) {
      const jobTitle = context.jobTitle;
      const originalJobTitleLower = jobTitle.toLowerCase().trim();
      const originalWords = originalJobTitleLower.split(/\s+/).filter(word => word.length > 2);
      
      let bestMatch = {
        hasMatch: false,
        matchType: 'none',
        confidence: 0,
        matchedVariant: null,
        wordMatchRatio: 0,
        position: -1
      };
      
      if (pageTextLower.includes(originalJobTitleLower) || pageTitleLower.includes(originalJobTitleLower)) {
        const position = pageTextLower.indexOf(originalJobTitleLower);
        bestMatch = {
          hasMatch: true,
          matchType: 'direct',
          confidence: 1.0,
          matchedVariant: originalJobTitleLower,
          wordMatchRatio: 1.0,
          position: position >= 0 ? position : pageTitleLower.indexOf(originalJobTitleLower)
        };
      }
      
      if (!bestMatch.hasMatch && originalWords.length >= 2) {
        const wordsFoundInPage = originalWords.filter(word => 
          pageTextLower.includes(word) || pageTitleLower.includes(word)
        );
        const wordMatchRatio = wordsFoundInPage.length / originalWords.length;
        
        if (wordMatchRatio >= this.matchingThresholds.fuzzy) {
          bestMatch = {
            hasMatch: true,
            matchType: 'partial_words',
            confidence: wordMatchRatio,
            matchedVariant: originalJobTitleLower,
            wordMatchRatio: wordMatchRatio,
            position: pageTextLower.indexOf(wordsFoundInPage[0])
          };
        }
      }
      
      if (!bestMatch.hasMatch) {
        const variants = this.getCachedJobTitleVariants(jobTitle);
        for (const variant of variants) {
          const variantLower = variant.toLowerCase().trim();
          if (variantLower === originalJobTitleLower) continue;
          
          if (pageTextLower.includes(variantLower) || pageTitleLower.includes(variantLower)) {
            const position = pageTextLower.indexOf(variantLower);
            bestMatch = {
              hasMatch: true,
              matchType: 'variant',
              confidence: 0.9,
              matchedVariant: variant,
              wordMatchRatio: 0.9,
              position: position >= 0 ? position : pageTitleLower.indexOf(variantLower)
            };
            break;
          }
        }
      }
      
      if (!bestMatch.hasMatch) {
        const fuzzyScore = MatchingUtils.fuzzyMatch(
          originalJobTitleLower,
          data.content.substring(0, 500),
          this.matchingThresholds.minimum
        );
        
        if (fuzzyScore >= this.matchingThresholds.minimum) {
          bestMatch = {
            hasMatch: true,
            matchType: 'fuzzy',
            confidence: fuzzyScore,
            matchedVariant: originalJobTitleLower,
            wordMatchRatio: fuzzyScore,
            position: -1
          };
        }
      }
      
      return bestMatch;
    }
  
    processJobLinksOptimized(pageData, jobTitle, matchResult) {
      if (!pageData.links || pageData.links.length === 0) return [];
  
      const matchedLinks = [];
      const jobTitleLower = jobTitle.toLowerCase();
      const variants = this.getCachedJobTitleVariants(jobTitle);
      const variantsLower = variants.map(v => v.toLowerCase());
      
      const jobURLPatterns = this.getCachedJobURLPatterns();
      const jobDetailURLPatterns = this.getCachedJobDetailURLPatterns();
      
      const highConfidenceLinks = [];
      const standardLinks = [];
      
      for (const link of pageData.links) {
        if (link.isJobPosting && link.matchedJobTitle) {
          highConfidenceLinks.push(link);
        } else if (link.text) {
          standardLinks.push(link);
        }
      }
      
      highConfidenceLinks.forEach(link => {
        const linkResult = this.processHighConfidenceLinkOptimized(
          link, jobTitle, jobTitleLower, variantsLower
        );
        if (linkResult) matchedLinks.push(linkResult);
      });
      
      standardLinks.forEach(link => {
        const linkResult = this.processStandardLinkOptimized(
          link, jobTitle, jobTitleLower, variantsLower, jobURLPatterns, jobDetailURLPatterns
        );
        if (linkResult) matchedLinks.push(linkResult);
      });
  
      return matchedLinks;
    }
  
    processHighConfidenceLinkOptimized(link, jobTitle, jobTitleLower, variantsLower) {
      const linkTitleLower = link.matchedJobTitle.toLowerCase();
      const matchContext = { jobTitle, linkTitle: linkTitleLower };
      
      const isRelevant = this.scoreCache.getKeywordMatchScore(
        linkTitleLower,
        [jobTitleLower, ...variantsLower],
        matchContext
      );
      
      if (isRelevant.score > 30) {
        const linkResult = {
          title: link.text || link.title || jobTitle,
          url: link.url,
          description: TextUtils.extractJobDescription(link.text || ''),
          confidence: Math.min(95, isRelevant.score + 50),
          matchType: 'high_confidence'
        };
        
        if (!this.dictionaries.shouldExcludeResult(linkResult.title, linkResult.url)) {
          return linkResult;
        } else {
          this.config.smartLog('steps', `[EXCLUSION] Filtered high confidence link: "${linkResult.title}"`);
        }
      }
      
      return null;
    }
  
    processStandardLinkOptimized(link, jobTitle, jobTitleLower, variantsLower, jobURLPatterns, jobDetailURLPatterns) {
      const linkTextLower = link.text.toLowerCase().trim();
      const linkUrlLower = (link.url || '').toLowerCase();
      const matchContext = { jobTitle, linkText: linkTextLower, linkUrl: linkUrlLower };
      
      const textMatch = this.scoreCache.getKeywordMatchScore(
        linkTextLower,
        [jobTitleLower, ...variantsLower],
        matchContext
      );
      
      if (textMatch.score < 20) return null;
      
      const isJobUrl = this.testURLPatterns(linkUrlLower, jobURLPatterns) ||
                       this.testURLPatterns(linkUrlLower, jobDetailURLPatterns);
      
      const confidence = Math.min(80 + (isJobUrl ? 15 : 0), 95);
      
      const linkResult = {
        title: link.text || link.title || jobTitle,
        url: link.url,
        description: TextUtils.extractJobDescription(link.text || ''),
        confidence: confidence,
        matchType: 'standard',
        textMatchScore: textMatch.score
      };
      
      if (!this.dictionaries.shouldExcludeResult(linkResult.title, linkResult.url)) {
        return linkResult;
      } else {
        this.config.smartLog('steps', `[EXCLUSION] Filtered standard link: "${linkResult.title}"`);
      }
      
      return null;
    }
  
    processLocationMatches(locations, pageTextLower, pageTitleLower) {
      const matchedLocations = [];
      
      for (const location of locations) {
        const locationVariants = this.getCachedLocationVariants(location);
        
        for (const variant of locationVariants) {
          const variantLower = variant.toLowerCase();
          
          if (pageTextLower.includes(variantLower) || pageTitleLower.includes(variantLower)) {
            matchedLocations.push(location);
            break;
          }
        }
      }
      
      return [...new Set(matchedLocations)];
    }
  
    getCachedJobTitleVariants(jobTitle) {
      if (this.variantsCache.has(jobTitle)) {
        return this.variantsCache.get(jobTitle);
      }
      
      const variants = this.dictionaries.generateJobTitleVariants(jobTitle);
      this.variantsCache.set(jobTitle, variants);
      
      if (this.variantsCache.size > 1000) {
        const oldestKey = this.variantsCache.keys().next().value;
        this.variantsCache.delete(oldestKey);
      }
      
      return variants;
    }
  
    getCachedLocationVariants(location) {
      if (this.locationCache.has(location)) {
        return this.locationCache.get(location);
      }
      
      const variants = this.generateLocationVariants(location);
      this.locationCache.set(location, variants);
      
      if (this.locationCache.size > 500) {
        const oldestKey = this.locationCache.keys().next().value;
        this.locationCache.delete(oldestKey);
      }
      
      return variants;
    }
  
    getCachedJobURLPatterns() {
      if (!this.patternCache.has('jobURLPatterns')) {
        this.patternCache.set('jobURLPatterns', this.dictionaries.jobURLPatterns);
      }
      return this.patternCache.get('jobURLPatterns');
    }
  
    getCachedJobDetailURLPatterns() {
      if (!this.patternCache.has('jobDetailURLPatterns')) {
        this.patternCache.set('jobDetailURLPatterns', this.dictionaries.jobDetailURLPatterns);
      }
      return this.patternCache.get('jobDetailURLPatterns');
    }
  
    testURLPatterns(url, patterns) {
      return patterns.some(pattern => {
        try {
          return pattern.test(url);
        } catch (error) {
          return false;
        }
      });
    }
  
    getCachedRelevance(pageData) {
      const context = { type: 'job_relevance', url: pageData.url };
      
      return this.scoreCache.getRelevanceScore(
        { 
          content: (pageData.text || '').substring(0, 1000),
          title: pageData.title || '',
          url: pageData.url || ''
        },
        context,
        (data, ctx) => this.calculateJobRelevance(data, ctx)
      );
    }
  
    calculateJobRelevance(data, context) {
      const pageTextLower = (data.content || '').toLowerCase();
      const pageTitleLower = (data.title || '').toLowerCase();
      const combinedText = `${pageTextLower} ${pageTitleLower}`;
      
      let jobTermCount = 0;
      const foundTerms = [];
      const jobTerms = this.dictionaries.jobTerms || [];
      const jobURLPatterns = this.getCachedJobURLPatterns();
      
      for (const term of jobTerms) {
        if (combinedText.includes(term.toLowerCase())) {
          jobTermCount++;
          foundTerms.push(term);
        }
      }
      
      const isJobPage = jobTermCount >= 3 || 
                       data.pageType === 'job_page' || 
                       data.hasJobListings ||
                       this.testURLPatterns(data.url || '', jobURLPatterns);
      
      return {
        isJobPage,
        jobTermCount,
        foundTerms,
        confidence: Math.min(jobTermCount / 10, 1)
      };
    }
  
    generateLocationVariants(location) {
      const original = location.toLowerCase().trim();
      const variants = [original, original.replace(/\s+/g, ''), original.replace(/\s+/g, '-')];
      const patterns = this.dictionaries.getPatterns();
      const locationData = patterns.locationVariants || {};
      
      if (locationData.shortForms) {
        for (const [key, values] of Object.entries(locationData.shortForms)) {
          if (original.includes(key)) {
            variants.push(...values);
          } else if (values.some(v => original.includes(v))) {
            variants.push(key);
          }
        }
      }
      
      if (locationData.multilingualMappings) {
        for (const [english, translations] of Object.entries(locationData.multilingualMappings)) {
          if (original.includes(english)) {
            variants.push(...translations);
          } else if (translations.some(t => original.includes(t))) {
            variants.push(english);
          }
        }
      }
      
      if (locationData.remoteTerms && locationData.remoteTerms.some(term => original.includes(term))) {
        variants.push(...(locationData.remoteTerms || []));
      }
      
      return [...new Set(variants)];
    }
  
    optimizeAndDeduplicateLinks(links) {
      return MatchingUtils.deduplicateByUrl(links);
    }
  
    filterJobResultsWithFuzzyMatching(results, jobTitles, threshold) {
      return MatchingUtils.filterByConfidence(results, threshold);
    }
  
    extractJobDescription(text) {
      return TextUtils.extractJobDescription(text);
    }
  
    precomputeCommonScores(jobTitles, commonTexts) {
      const contexts = jobTitles.map(title => ({ jobTitle: title, language: 'en' }));
      const data = commonTexts.map(text => ({ content: text }));
      
      return this.scoreCache.precomputeScores(data, contexts, (data, context) => 
        this.calculateJobTitleMatch(data, context, data.content.toLowerCase(), '')
      );
    }
  
    getMatchingStats() {
      return {
        scoreCache: this.scoreCache.getStats(),
        variantsCacheSize: this.variantsCache.size,
        locationCacheSize: this.locationCache.size,
        patternCacheSize: this.patternCache.size,
        thresholds: this.matchingThresholds
      };
    }
  
    clearCaches() {
      this.scoreCache.clear();
      this.variantsCache.clear();
      this.locationCache.clear();
      this.patternCache.clear();
      this.config.smartLog('cache', 'JobMatchingService caches cleared');
    }
}
  
module.exports = JobMatchingService;