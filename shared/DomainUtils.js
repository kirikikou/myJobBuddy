class DomainUtils {
    static extractDomain(url) {
      if (!url || typeof url !== 'string') return '';
      
      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        return urlObj.hostname;
      } catch (error) {
        let cleanUrl = url.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
        return cleanUrl;
      }
    }
  
    static normalizeDomain(domain) {
      if (!domain || typeof domain !== 'string') return '';
      
      let normalized = domain.toLowerCase().trim();
      
      if (normalized.startsWith('www.')) {
        normalized = normalized.substring(4);
      }
      
      normalized = normalized.replace(/^https?:\/\//, '');
      normalized = normalized.split('/')[0].split('?')[0].split('#')[0];
      
      return normalized;
    }
  
    static getSubdomain(domain) {
      if (!domain || typeof domain !== 'string') return '';
      
      const normalized = this.normalizeDomain(domain);
      const parts = normalized.split('.');
      
      if (parts.length <= 2) return '';
      
      return parts.slice(0, -2).join('.');
    }
  
    static extractHostnameForQueue(url) {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname;
      } catch (error) {
        let cleanUrl = url.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
        return cleanUrl;
      }
    }
  
    static extractDomainFromUrl(url) {
      try {
        const urlObj = new URL(url);
        let pathname = urlObj.pathname;
        if (pathname.endsWith('/')) {
          pathname = pathname.slice(0, -1);
        }
        if (pathname === '') {
          pathname = '/';
        }
        return urlObj.hostname + pathname;
      } catch (error) {
        let cleanUrl = url.replace(/^https?:\/\//, '').split('?')[0];
        if (cleanUrl.endsWith('/')) {
          cleanUrl = cleanUrl.slice(0, -1);
        }
        return cleanUrl;
      }
    }
  
    static extractShortDomain(url) {
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
          if (pathParts.length > 1) {
            domain += '/';
          }
        }
        
        return domain;
      } catch (e) {
        return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      }
    }
  
    static isCareerPage(url) {
      if (!url || typeof url !== 'string') return false;
      
      const lowerUrl = url.toLowerCase();
      const careerKeywords = [
        'career', 'job', 'emploi', 'stelle', 'lavoro', 'empleo',
        'recrute', 'offres', 'vacancy', 'position', 'hiring',
        'talent', 'opportunity', 'work', 'join'
      ];
      
      return careerKeywords.some(keyword => lowerUrl.includes(keyword));
    }
  
    static generateCareerUrls(baseDomain) {
      if (!baseDomain) return [];
      
      const normalized = this.normalizeDomain(baseDomain);
      const baseUrl = `https://${normalized}`;
      
      const careerPaths = [
        '/careers',
        '/career',
        '/jobs',
        '/job',
        '/emploi',
        '/emplois',
        '/offres',
        '/recrutement',
        '/recruitment',
        '/hiring',
        '/talent',
        '/opportunities',
        '/work-with-us',
        '/join-us',
        '/team',
        '/about/careers',
        '/company/careers',
        '/hr/careers'
      ];
      
      return careerPaths.map(path => `${baseUrl}${path}`);
    }
  
    static getRootDomain(domain) {
      if (!domain || typeof domain !== 'string') return '';
      
      const normalized = this.normalizeDomain(domain);
      const parts = normalized.split('.');
      
      if (parts.length <= 2) return normalized;
      
      return parts.slice(-2).join('.');
    }
  
    static isSameDomain(url1, url2) {
      if (!url1 || !url2) return false;
      
      const domain1 = this.getRootDomain(this.extractDomain(url1));
      const domain2 = this.getRootDomain(this.extractDomain(url2));
      
      return domain1 === domain2;
    }
  
    static getDomainDepth(url) {
      if (!url) return 0;
      
      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        const pathParts = urlObj.pathname.split('/').filter(part => part && part.length > 0);
        return pathParts.length;
      } catch (error) {
        const pathParts = url.split('/').filter(part => part && part.length > 0);
        return Math.max(0, pathParts.length - 1);
      }
    }
  
    static isValidDomainFormat(domain) {
      if (!domain || typeof domain !== 'string') return false;
      
      const normalized = this.normalizeDomain(domain);
      const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
      
      return domainRegex.test(normalized);
    }
  
    static extractProtocol(url) {
      if (!url || typeof url !== 'string') return 'https';
      
      try {
        const urlObj = new URL(url);
        return urlObj.protocol.replace(':', '');
      } catch (error) {
        return url.startsWith('http://') ? 'http' : 'https';
      }
    }
  
    static buildUrl(domain, path = '', protocol = 'https') {
      if (!domain) return '';
      
      const normalizedDomain = this.normalizeDomain(domain);
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      
      return `${protocol}://${normalizedDomain}${cleanPath}`;
    }
  
    static compareDomainSimilarity(domain1, domain2) {
      if (!domain1 || !domain2) return 0;
      
      const norm1 = this.normalizeDomain(domain1);
      const norm2 = this.normalizeDomain(domain2);
      
      if (norm1 === norm2) return 1.0;
      
      const root1 = this.getRootDomain(norm1);
      const root2 = this.getRootDomain(norm2);
      
      if (root1 === root2) return 0.8;
      
      const parts1 = norm1.split('.');
      const parts2 = norm2.split('.');
      const commonParts = parts1.filter(part => parts2.includes(part));
      
      return commonParts.length / Math.max(parts1.length, parts2.length);
    }
  
    static getDomainType(domain) {
      if (!domain) return 'unknown';
      
      const normalized = this.normalizeDomain(domain);
      
      if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
        return 'local';
      }
      
      const parts = normalized.split('.');
      if (parts.length <= 1) return 'invalid';
      
      const tld = parts[parts.length - 1];
      const commonTlds = ['com', 'org', 'net', 'edu', 'gov', 'mil'];
      const countryTlds = ['fr', 'uk', 'de', 'es', 'it', 'ca', 'au', 'jp'];
      
      if (commonTlds.includes(tld)) return 'commercial';
      if (countryTlds.includes(tld)) return 'country';
      if (tld === 'edu') return 'educational';
      if (tld === 'gov' || tld === 'mil') return 'government';
      
      return 'other';
    }
  }
  
  module.exports = DomainUtils;