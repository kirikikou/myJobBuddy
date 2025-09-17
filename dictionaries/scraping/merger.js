const config = require('../../config')

class ScrapingPatternMerger {
  static getBasePatterns() {
    try {
      return require('./base')
    } catch (error) {
      config.smartLog('fail', `Error loading base patterns: ${error.message}`)
      return {}
    }
  }

  static merge(languagePatterns) {
    const basePatterns = this.getBasePatterns()
    
    const merged = {
      showMore: {
        level1_specific: [
          ...(basePatterns.showMore?.level1_specific || []),
          ...(languagePatterns.showMore?.level1_specific || [])
        ],
        level2_text: languagePatterns.showMore?.level2_text || {},
        level3_fallback: [
          ...(basePatterns.showMore?.level3_fallback || [])
        ]
      },

      cookies: {
        level1_frameworks: { 
          ...(basePatterns.cookies?.level1_frameworks || {}),
          ...(languagePatterns.cookies?.level1_frameworks || {})
        },
        level2_text: languagePatterns.cookies?.level2_text || {}
      },

      pagination: {
        level1_specific: [
          ...(basePatterns.pagination?.level1_specific || []),
          ...(languagePatterns.pagination?.level1_specific || [])
        ],
        level2_text: languagePatterns.pagination?.level2_text || {}
      },

      jobTerms: languagePatterns.jobTerms || [],

      navigation: languagePatterns.navigation || {},

      filters: languagePatterns.filters || {},

      emptyStates: languagePatterns.emptyStates || {},

      loadingStates: languagePatterns.loadingStates || {},

      jobListing: {
        selectors: [
          ...(basePatterns.jobListing?.selectors || []),
          ...(languagePatterns.jobListing?.selectors || [])
        ]
      },

      blockingContent: {
        selectors: [
          ...(basePatterns.blockingContent?.selectors || []),
          ...(languagePatterns.blockingContent?.selectors || [])
        ],
        text: languagePatterns.blockingContent?.text || []
      }
    }

    return merged
  }

  static getPatterns(language) {
    try {
      let languagePatterns = {}
      
      try {
        languagePatterns = require(`./${language}`)
      } catch (langError) {
        config.smartLog('langue', `Optimized patterns not found for ${language}, trying fallback`)
        
        try {
          const fullPatterns = require(`./full/${language}`)
          languagePatterns = fullPatterns
        } catch (fullError) {
          config.smartLog('langue', `No patterns found for ${language}, using English`)
          languagePatterns = require('./en')
        }
      }
      
      return this.merge(languagePatterns)
    } catch (error) {
      config.smartLog('fail', `Error getting patterns for ${language}: ${error.message}`)
      
      try {
        const englishPatterns = require('./en')
        return this.merge(englishPatterns)
      } catch (enError) {
        config.smartLog('fail', `Critical: Cannot load English patterns: ${enError.message}`)
        return this.getEmptyPatterns()
      }
    }
  }

  static getEmptyPatterns() {
    return {
      showMore: { level1_specific: [], level2_text: {}, level3_fallback: [] },
      cookies: { level1_frameworks: {}, level2_text: {} },
      pagination: { level1_specific: [], level2_text: {} },
      jobTerms: [],
      navigation: {},
      filters: {},
      emptyStates: {},
      loadingStates: {},
      jobListing: { selectors: [] },
      blockingContent: { selectors: [], text: [] }
    }
  }

  static isOptimizedVersion(patterns) {
    if (!patterns.showMore) return false
    
    const baseLength = this.getBasePatterns().showMore?.level1_specific?.length || 0
    const currentLength = patterns.showMore.level1_specific?.length || 0
    
    return currentLength < (baseLength + 20)
  }

  static validatePatterns(patterns) {
    const required = ['showMore', 'cookies', 'pagination', 'jobTerms', 'navigation']
    return required.every(key => patterns.hasOwnProperty(key))
  }
}

module.exports = ScrapingPatternMerger