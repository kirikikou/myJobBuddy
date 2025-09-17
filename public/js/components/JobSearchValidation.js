class JobSearchValidation {
    constructor() {
      this.patterns = {
        url: /^https?:\/\/.+/i,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        domain: /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
        jobTitle: /^[a-zA-Z0-9\s\-\+\.\(\)\/&]{2,100}$/,
        companyName: /^[a-zA-Z0-9\s\-\+\.\(\)\/&]{1,100}$/
      };
  
      this.limits = {
        jobTitles: {
          min: 1,
          max: 20,
          lengthMin: 2,
          lengthMax: 100
        },
        careerPages: {
          min: 1,
          max: 100,
          urlLengthMax: 2000
        },
        searchResults: {
          max: 1000
        }
      };
  
      this.domainNormalizations = new Map([
        ['linkedin.com', 'LinkedIn'],
        ['indeed.com', 'Indeed'],
        ['glassdoor.com', 'Glassdoor'],
        ['monster.com', 'Monster'],
        ['ziprecruiter.com', 'ZipRecruiter'],
        ['careerbuilder.com', 'CareerBuilder'],
        ['simplyhired.com', 'Simply Hired']
      ]);
  
      this.commonJobTitleVariations = new Map([
        ['dev', 'Developer'],
        ['eng', 'Engineer'],
        ['mgr', 'Manager'],
        ['sr', 'Senior'],
        ['jr', 'Junior'],
        ['lead', 'Lead'],
        ['assoc', 'Associate'],
        ['coord', 'Coordinator'],
        ['spec', 'Specialist'],
        ['admin', 'Administrator']
      ]);
  
      this.restrictedDomains = new Set([
        'localhost',
        '127.0.0.1',
        'example.com',
        'test.com',
        'invalid.com'
      ]);
  
      this.suspiciousPatterns = [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /file:/i,
        /ftp:/i
      ];
    }
  
    validateJobTitles(jobTitles) {
      const errors = [];
      
      if (!Array.isArray(jobTitles)) {
        errors.push('Job titles must be an array');
        return { isValid: false, errors, normalized: [] };
      }
  
      if (jobTitles.length < this.limits.jobTitles.min) {
        errors.push(`At least ${this.limits.jobTitles.min} job title is required`);
      }
  
      if (jobTitles.length > this.limits.jobTitles.max) {
        errors.push(`Maximum ${this.limits.jobTitles.max} job titles allowed`);
      }
  
      const normalized = [];
      const seen = new Set();
  
      for (const title of jobTitles) {
        const result = this.validateJobTitle(title);
        
        if (result.isValid) {
          const normalizedTitle = result.normalized;
          if (!seen.has(normalizedTitle.toLowerCase())) {
            normalized.push(normalizedTitle);
            seen.add(normalizedTitle.toLowerCase());
          }
        } else {
          errors.push(`Invalid job title "${title}": ${result.errors.join(', ')}`);
        }
      }
  
      return {
        isValid: errors.length === 0,
        errors,
        normalized,
        duplicatesRemoved: jobTitles.length - normalized.length
      };
    }
  
    validateJobTitle(title) {
      const errors = [];
      
      if (typeof title !== 'string') {
        errors.push('must be a string');
        return { isValid: false, errors, normalized: '' };
      }
  
      const trimmed = title.trim();
      
      if (trimmed.length < this.limits.jobTitles.lengthMin) {
        errors.push(`must be at least ${this.limits.jobTitles.lengthMin} characters`);
      }
  
      if (trimmed.length > this.limits.jobTitles.lengthMax) {
        errors.push(`must be at most ${this.limits.jobTitles.lengthMax} characters`);
      }
  
      if (!this.patterns.jobTitle.test(trimmed)) {
        errors.push('contains invalid characters');
      }
  
      const normalized = this.normalizeJobTitle(trimmed);
  
      return {
        isValid: errors.length === 0,
        errors,
        normalized
      };
    }
  
    normalizeJobTitle(title) {
      let normalized = title
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2');
  
      for (const [abbrev, full] of this.commonJobTitleVariations) {
        const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
        normalized = normalized.replace(regex, full);
      }
  
      return normalized
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
  
    validateCareerPages(careerPages) {
      const errors = [];
      
      if (!Array.isArray(careerPages)) {
        errors.push('Career pages must be an array');
        return { isValid: false, errors, normalized: [] };
      }
  
      if (careerPages.length < this.limits.careerPages.min) {
        errors.push(`At least ${this.limits.careerPages.min} career page URL is required`);
      }
  
      if (careerPages.length > this.limits.careerPages.max) {
        errors.push(`Maximum ${this.limits.careerPages.max} career page URLs allowed`);
      }
  
      const normalized = [];
      const seen = new Set();
  
      for (const url of careerPages) {
        const result = this.validateCareerPageUrl(url);
        
        if (result.isValid) {
          const normalizedUrl = result.normalized;
          if (!seen.has(normalizedUrl)) {
            normalized.push(normalizedUrl);
            seen.add(normalizedUrl);
          }
        } else {
          errors.push(`Invalid URL "${url}": ${result.errors.join(', ')}`);
        }
      }
  
      return {
        isValid: errors.length === 0,
        errors,
        normalized,
        duplicatesRemoved: careerPages.length - normalized.length
      };
    }
  
    validateCareerPageUrl(url) {
      const errors = [];
      
      if (typeof url !== 'string') {
        errors.push('must be a string');
        return { isValid: false, errors, normalized: '' };
      }
  
      const trimmed = url.trim();
      
      if (trimmed.length === 0) {
        errors.push('cannot be empty');
        return { isValid: false, errors, normalized: '' };
      }
  
      if (trimmed.length > this.limits.careerPages.urlLengthMax) {
        errors.push(`must be at most ${this.limits.careerPages.urlLengthMax} characters`);
      }
  
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(trimmed)) {
          errors.push('contains suspicious protocol');
          return { isValid: false, errors, normalized: '' };
        }
      }
  
      let normalizedUrl;
      try {
        normalizedUrl = this.normalizeUrl(trimmed);
        const urlObj = new URL(normalizedUrl);
        
        if (this.restrictedDomains.has(urlObj.hostname)) {
          errors.push('restricted domain not allowed');
        }
        
      } catch (error) {
        errors.push('invalid URL format');
        return { isValid: false, errors, normalized: '' };
      }
  
      return {
        isValid: errors.length === 0,
        errors,
        normalized: normalizedUrl
      };
    }
  
    validateAndFixUrl(url) {
      const trimmed = url.trim();
      const lowerUrl = trimmed.toLowerCase();
      
      if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
        return 'https://' + trimmed;
      }
      
      return trimmed;
    }
  
    normalizeUrl(url) {
      let normalized = this.validateAndFixUrl(url);
      
      try {
        const urlObj = new URL(normalized);
        
        urlObj.hostname = urlObj.hostname.toLowerCase();
        
        if (urlObj.pathname === '/') {
          urlObj.pathname = '';
        }
        
        urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
        
        urlObj.search = '';
        urlObj.hash = '';
        
        return urlObj.toString();
      } catch (error) {
        throw new Error('Invalid URL format');
      }
    }
  
    validateSearchData(data) {
      const errors = [];
      const normalized = {};
  
      if (!data || typeof data !== 'object') {
        errors.push('Search data must be an object');
        return { isValid: false, errors, normalized: {} };
      }
  
      const jobTitlesResult = this.validateJobTitles(data.jobTitles || []);
      if (!jobTitlesResult.isValid) {
        errors.push('Job titles: ' + jobTitlesResult.errors.join(', '));
      } else {
        normalized.jobTitles = jobTitlesResult.normalized;
      }
  
      const careerPagesResult = this.validateCareerPages(data.careerPages || []);
      if (!careerPagesResult.isValid) {
        errors.push('Career pages: ' + careerPagesResult.errors.join(', '));
      } else {
        normalized.careerPages = careerPagesResult.normalized;
      }
  
      if (data.site && typeof data.site === 'string') {
        normalized.site = data.site.trim().toLowerCase();
      } else {
        normalized.site = 'career-pages';
      }
  
      normalized.cacheOnly = Boolean(data.cacheOnly);
  
      return {
        isValid: errors.length === 0,
        errors,
        normalized,
        warnings: {
          jobTitleDuplicates: jobTitlesResult.duplicatesRemoved || 0,
          careerPageDuplicates: careerPagesResult.duplicatesRemoved || 0
        }
      };
    }
  
    validateSearchResults(results) {
      if (!Array.isArray(results)) {
        return { isValid: false, errors: ['Results must be an array'], normalized: [] };
      }
  
      if (results.length > this.limits.searchResults.max) {
        return { 
          isValid: false, 
          errors: [`Too many results (${results.length}), maximum allowed: ${this.limits.searchResults.max}`], 
          normalized: [] 
        };
      }
  
      const normalized = [];
      const errors = [];
  
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const normalizedResult = this.normalizeSearchResult(result);
        
        if (normalizedResult.isValid) {
          normalized.push(normalizedResult.data);
        } else {
          errors.push(`Result ${i}: ${normalizedResult.errors.join(', ')}`);
        }
      }
  
      return {
        isValid: errors.length === 0,
        errors,
        normalized
      };
    }
  
    normalizeSearchResult(result) {
      const errors = [];
      const normalized = {};
  
      if (!result || typeof result !== 'object') {
        return { isValid: false, errors: ['Result must be an object'], data: {} };
      }
  
      normalized.title = this.sanitizeString(result.title || '');
      if (!normalized.title) {
        errors.push('title is required');
      }
  
      normalized.url = result.url || '';
      if (normalized.url) {
        try {
          const urlValidation = this.validateCareerPageUrl(normalized.url);
          if (urlValidation.isValid) {
            normalized.url = urlValidation.normalized;
          } else {
            errors.push('invalid URL: ' + urlValidation.errors.join(', '));
          }
        } catch (error) {
          errors.push('URL validation failed');
        }
      }
  
      normalized.description = this.sanitizeString(result.description || '');
      normalized.date = this.validateDate(result.date);
      normalized.source = this.sanitizeString(result.source || this.extractCleanDomain(normalized.url));
      normalized.confidence = this.validateConfidence(result.confidence);
  
      if (result.cacheAge && typeof result.cacheAge === 'number') {
        normalized.cacheAge = Math.max(0, result.cacheAge);
      }
  
      return {
        isValid: errors.length === 0,
        errors,
        data: normalized
      };
    }
  
    sanitizeString(str, maxLength = 500) {
      if (typeof str !== 'string') return '';
      
      return str
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s\-\.\(\)\/&@,;:!?]/g, '')
        .slice(0, maxLength);
    }
  
    validateDate(dateInput) {
      if (!dateInput) return null;
      
      if (dateInput instanceof Date) {
        return isNaN(dateInput.getTime()) ? null : dateInput.toISOString();
      }
      
      if (typeof dateInput === 'string') {
        const parsed = new Date(dateInput);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
      
      if (typeof dateInput === 'number') {
        const parsed = new Date(dateInput);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
      
      return null;
    }
  
    validateConfidence(confidence) {
      if (typeof confidence !== 'number') return 0;
      return Math.max(0, Math.min(100, confidence));
    }
  
    extractCleanDomain(url) {
      if (!url) return '';
      
      try {
        const urlObj = new URL(url);
        let domain = urlObj.hostname;
        
        if (domain.startsWith('www.')) {
          domain = domain.substring(4);
        }
        
        const pathParts = urlObj.pathname.split('/').filter(part => part && part.length > 0);
        if (pathParts.length > 0) {
          domain += '/' + pathParts[0];
        }
        
        return domain;
      } catch (error) {
        return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      }
    }
  
    extractShortDomain(url) {
      if (!url) return '';
      
      try {
        const urlObj = new URL(url);
        let domain = urlObj.hostname;
        if (domain.startsWith('www.')) {
          domain = domain.substring(4);
        }
        return domain;
      } catch (error) {
        return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      }
    }
  
    extractCompanyFromDomain(domain) {
      if (!domain) return 'Unknown Company';
      
      const normalized = this.domainNormalizations.get(domain);
      if (normalized) return normalized;
      
      const parts = domain.split('.');
      if (parts.length > 0) {
        let companyPart = parts[0];
        if (companyPart === 'www') {
          companyPart = parts[1] || parts[0];
        }
        
        return companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
      }
      
      return 'Unknown Company';
    }
  
    validateBulkUrls(urlsString, separator = ',') {
      if (typeof urlsString !== 'string') {
        return { isValid: false, errors: ['Input must be a string'], urls: [] };
      }
  
      const urls = urlsString
        .split(separator)
        .map(url => url.trim())
        .filter(url => url.length > 0);
  
      const validUrls = [];
      const errors = [];
  
      for (const url of urls) {
        const result = this.validateCareerPageUrl(url);
        if (result.isValid) {
          validUrls.push(result.normalized);
        } else {
          errors.push(`"${url}": ${result.errors.join(', ')}`);
        }
      }
  
      return {
        isValid: errors.length === 0,
        errors,
        urls: validUrls,
        validCount: validUrls.length,
        totalCount: urls.length
      };
    }
  
    sanitizeUserInput(input, type = 'default') {
      if (typeof input !== 'string') return '';
  
      let sanitized = input.trim();
  
      switch (type) {
        case 'jobTitle':
          sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-\+\.\(\)\/&]/g, '');
          break;
        case 'url':
          sanitized = sanitized.replace(/[^\w\s\-\.:\/\?&=]/g, '');
          break;
        case 'companyName':
          sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-\+\.\(\)\/&]/g, '');
          break;
        default:
          sanitized = sanitized.replace(/[<>\"']/g, '');
      }
  
      return sanitized.slice(0, 200);
    }
  
    validateSearchLimits(userData, searchType = 'cache') {
      const validation = {
        canSearch: true,
        errors: [],
        warnings: [],
        limits: {}
      };
  
      if (!userData) {
        validation.canSearch = false;
        validation.errors.push('User data not available');
        return validation;
      }
  
      const jobTitles = userData.jobTitles || [];
      const activeList = userData.currentActiveList || 'listA';
      const careerPages = userData.careerPageLists?.[activeList] || [];
  
      if (jobTitles.length === 0) {
        validation.canSearch = false;
        validation.errors.push('At least one job title is required');
      }
  
      if (careerPages.length === 0) {
        const hasVisibleCompanies = this.hasVisibleCompanies(userData);
        if (!hasVisibleCompanies) {
          validation.canSearch = false;
          validation.errors.push('At least one career page URL is required');
        }
      }
  
      validation.limits = {
        jobTitles: {
          current: jobTitles.length,
          max: this.limits.jobTitles.max
        },
        careerPages: {
          current: careerPages.length,
          max: this.limits.careerPages.max
        }
      };
  
      if (jobTitles.length > this.limits.jobTitles.max) {
        validation.warnings.push(`Using first ${this.limits.jobTitles.max} job titles`);
      }
  
      if (careerPages.length > this.limits.careerPages.max) {
        validation.warnings.push(`Using first ${this.limits.careerPages.max} career pages`);
      }
  
      return validation;
    }
  
    hasVisibleCompanies(userData) {
      const companies = Object.values(userData.companies || {});
      
      if (userData.showFavoritesInCareerList) {
        const favorites = companies.filter(company => 
          company.favorite && (company.career || company.website || company.linkedin)
        );
        if (favorites.length > 0) return true;
      }
  
      ['A', 'B', 'C'].forEach(selection => {
        if (userData[`showSelection${selection}InCareerList`]) {
          const selectionCompanies = companies.filter(company =>
            company.selection === selection && (company.career || company.website || company.linkedin)
          );
          if (selectionCompanies.length > 0) return true;
        }
      });
  
      return false;
    }
  
    getValidationSummary(validationResults) {
      const summary = {
        isValid: validationResults.every(result => result.isValid),
        totalErrors: 0,
        totalWarnings: 0,
        categories: {}
      };
  
      for (const result of validationResults) {
        const category = result.category || 'general';
        
        if (!summary.categories[category]) {
          summary.categories[category] = {
            errors: [],
            warnings: [],
            isValid: true
          };
        }
  
        if (result.errors) {
          summary.categories[category].errors.push(...result.errors);
          summary.categories[category].isValid = false;
          summary.totalErrors += result.errors.length;
        }
  
        if (result.warnings) {
          summary.categories[category].warnings.push(...result.warnings);
          summary.totalWarnings += result.warnings.length;
        }
      }
  
      return summary;
    }
  
    createValidationError(field, message, code = 'VALIDATION_ERROR') {
      return {
        field,
        message,
        code,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  if (typeof window !== 'undefined') {
    window.JobSearchValidation = JobSearchValidation;
  }