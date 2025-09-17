const IndependentLanguageDetector = require('./IndependentLanguageDetector');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

class EnhancedDomainProfiler {
  static CACHE_DURATION = {
    jobs: 24 * 60 * 60 * 1000,                    
    platform: 3 * 30 * 24 * 60 * 60 * 1000,      
    language: 365 * 24 * 60 * 60 * 1000           
  };

  static profilesPath = path.join(__dirname, '../profiles');

  static async loadDomainProfile(domain) {
    try {
      const profilePath = path.join(this.profilesPath, `${domain}.json`);
      const data = await fs.readFile(profilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      config.smartLog('domain-profile', `No existing profile for ${domain}, creating new`);
      return null;
    }
  }

  static async saveDomainProfile(domain, profile) {
    try {
      await fs.mkdir(this.profilesPath, { recursive: true });
      const profilePath = path.join(this.profilesPath, `${domain}.json`);
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
      config.smartLog('domain-profile', `Profile saved for ${domain}`);
    } catch (error) {
      config.smartLog('fail', `Failed to save profile for ${domain}: ${error.message}`);
    }
  }

  static shouldRedetectLanguage(profile) {
    if (!profile) return true;
    if (!profile.languageDetectedAt) return true;

    if (profile.lastScrapingFailure && profile.lastScrapingFailure > profile.languageDetectedAt) {
      config.smartLog('langue', `Language re-detection needed due to scraping failure`);
      return true;
    }
    
    const oneYearAgo = new Date(Date.now() - this.CACHE_DURATION.language);
    const shouldRedetect = new Date(profile.languageDetectedAt) < oneYearAgo;
    
    if (shouldRedetect) {
      config.smartLog('langue', `Language cache expired (1 year), re-detection needed`);
    }
    
    return shouldRedetect;
  }

  static shouldRedetectPlatform(profile) {
    if (!profile) return true;
    if (!profile.platformDetectedAt) return true;

    if (profile.lastScrapingFailure && profile.lastScrapingFailure > profile.platformDetectedAt) {
      config.smartLog('platform', `Platform re-detection needed due to scraping failure`);
      return true;
    }
    
    const threeMonthsAgo = new Date(Date.now() - this.CACHE_DURATION.platform);
    const shouldRedetect = new Date(profile.platformDetectedAt) < threeMonthsAgo;
    
    if (shouldRedetect) {
      config.smartLog('platform', `Platform cache expired (3 months), re-detection needed`);
    }
    
    return shouldRedetect;
  }

  static async detectAndSaveLanguage(url, domain) {
    config.smartLog('langue', `Detecting language for ${domain}`);
    
    const detectedLanguage = await IndependentLanguageDetector.detectLanguageIndependent(url);
    
    const existingProfile = await this.loadDomainProfile(domain) || {};
    
    const updatedProfile = {
      ...existingProfile,
      domain: domain,
      url: url,
      language: detectedLanguage,
      languageDetectedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    await this.saveDomainProfile(domain, updatedProfile);
    
    config.smartLog('langue', `Language detection complete for ${domain}: ${detectedLanguage || 'null'}`);
    
    return {
      profile: updatedProfile,
      detectedLanguage: detectedLanguage,
      scrapingLanguage: IndependentLanguageDetector.getScrapingLanguage(detectedLanguage)
    };
  }

  static async recordScrapingResult(domain, success, error = null) {
    const profile = await this.loadDomainProfile(domain);
    if (!profile) return;

    const now = new Date().toISOString();
    
    if (success) {
      profile.lastSuccessfulScraping = now;
      profile.successes = (profile.successes || 0) + 1;
      delete profile.lastScrapingFailure;
      config.smartLog('win', `Scraping success recorded for ${domain}`);
    } else {
      profile.lastScrapingFailure = now;
      profile.failures = (profile.failures || 0) + 1;
      if (error) {
        profile.lastError = error;
      }
      config.smartLog('fail', `Scraping failure recorded for ${domain}`);
    }

    profile.lastScrapingAttempt = now;
    await this.saveDomainProfile(domain, profile);
  }

  static async getLanguageForScraping(url, domain) {
    config.smartLog('langue', `Getting language for scraping: ${domain}`);
    
    let profile = await this.loadDomainProfile(domain);
    let detectedLanguage = null;
    
    if (!profile || this.shouldRedetectLanguage(profile)) {
      const result = await this.detectAndSaveLanguage(url, domain);
      profile = result.profile;
      detectedLanguage = result.detectedLanguage;
    } else {
      detectedLanguage = profile.language;
      config.smartLog('langue', `Using cached language for ${domain}: ${detectedLanguage || 'null'}`);
    }

    const scrapingLanguage = IndependentLanguageDetector.getScrapingLanguage(detectedLanguage);
    
    return {
      profile: profile,
      detectedLanguage: detectedLanguage,
      scrapingLanguage: scrapingLanguage
    };
  }

  static extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
      return match ? match[1] : url;
    }
  }

  static async getProfileStats() {
    try {
      const profileFiles = await fs.readdir(this.profilesPath);
      const stats = {
        total: profileFiles.length,
        withLanguage: 0,
        languages: {},
        oldProfiles: 0
      };

      for (const file of profileFiles) {
        if (file.endsWith('.json')) {
          try {
            const profilePath = path.join(this.profilesPath, file);
            const data = await fs.readFile(profilePath, 'utf8');
            const profile = JSON.parse(data);
            
            if (profile.language) {
              stats.withLanguage++;
              stats.languages[profile.language] = (stats.languages[profile.language] || 0) + 1;
            }
            
            if (profile.languageDetectedAt) {
              const oneYearAgo = new Date(Date.now() - this.CACHE_DURATION.language);
              if (new Date(profile.languageDetectedAt) < oneYearAgo) {
                stats.oldProfiles++;
              }
            }
          } catch (parseError) {
            config.smartLog('fail', `Error parsing profile ${file}: ${parseError.message}`);
          }
        }
      }

      return stats;
    } catch (error) {
      config.smartLog('fail', `Error getting profile stats: ${error.message}`);
      return { total: 0, withLanguage: 0, languages: {}, oldProfiles: 0 };
    }
  }
}

module.exports = EnhancedDomainProfiler;