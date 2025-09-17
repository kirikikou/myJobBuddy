const fs = require('fs');
const path = require('path');

class CacheIndexer {
  constructor(config) {
    this.config = config;
    this.domainIndex = new Map();
    this.languageIndex = new Map();
    this.keywordIndex = new Map();
    this.urlIndex = new Map();
    this.lastIndexUpdate = new Map();
    this.indexTTL = this.config.cache?.indexTTL || 3600000;
    this.maxIndexSize = this.config.cache?.maxIndexSize || 10000;
  }

  async buildIndex(cacheDir) {
    const startTime = Date.now();
    let filesIndexed = 0;
    let totalOpportunities = 0;

    try {
      const files = await fs.promises.readdir(cacheDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      this.config.smartLog('cache', `Building index for ${jsonFiles.length} cache files`);

      const chunks = this.chunkArray(jsonFiles, 50);
      
      for (const chunk of chunks) {
        await Promise.allSettled(
          chunk.map(file => this.indexFile(path.join(cacheDir, file)))
        );
        filesIndexed += chunk.length;
        
        if (filesIndexed % 100 === 0) {
          this.config.smartLog('cache', `Indexed ${filesIndexed}/${jsonFiles.length} files`);
        }
      }

      totalOpportunities = this.getTotalIndexedOpportunities();
      const indexTime = Date.now() - startTime;
      
      this.config.smartLog('cache', 
        `Index built: ${filesIndexed} files, ${totalOpportunities} opportunities in ${indexTime}ms`
      );

      return { filesIndexed, totalOpportunities, indexTime };
    } catch (error) {
      this.config.smartLog('fail', `Index build failed: ${error.message}`);
      throw error;
    }
  }

  async indexFile(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      const fileName = path.basename(filePath);
      
      if (this.isIndexFresh(fileName, stats.mtime)) {
        return;
      }

      const content = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      if (!data.data || !data.data.links) return;

      const domain = this.extractDomain(data.data.url);
      const language = data.data.language || 'en';
      
      const opportunities = data.data.links
        .filter(link => link.isJobPosting)
        .map(link => ({
          title: (link.title || link.text || '').trim(),
          url: link.url,
          description: (link.text || '').substring(0, 200),
          domain,
          language,
          scrapedAt: data.data.scrapedAt,
          confidence: link.confidence || 80,
          keywords: this.extractKeywords(link.title || link.text || ''),
          source: fileName
        }));

      this.addToIndex(domain, language, opportunities);
      this.lastIndexUpdate.set(fileName, stats.mtime.getTime());
      
    } catch (error) {
      this.config.smartLog('cache', `Failed to index ${filePath}: ${error.message}`);
    }
  }

  addToIndex(domain, language, opportunities) {
    if (!this.domainIndex.has(domain)) {
      this.domainIndex.set(domain, new Map());
    }
    
    const domainMap = this.domainIndex.get(domain);
    if (!domainMap.has(language)) {
      domainMap.set(language, []);
    }
    
    const existingOpps = domainMap.get(language);
    domainMap.set(language, [...existingOpps, ...opportunities]);
    
    if (!this.languageIndex.has(language)) {
      this.languageIndex.set(language, []);
    }
    this.languageIndex.get(language).push(...opportunities);
    
    opportunities.forEach(opp => {
      opp.keywords.forEach(keyword => {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, []);
        }
        this.keywordIndex.get(keyword).push(opp);
      });
      
      if (opp.url) {
        this.urlIndex.set(opp.url, opp);
      }
    });

    if (this.urlIndex.size > this.maxIndexSize) {
      this.evictOldEntries();
    }
  }

  searchByDomain(domain, language = null, limit = 100, offset = 0) {
    const domainMap = this.domainIndex.get(domain);
    if (!domainMap) return { results: [], total: 0, hasMore: false };
    
    let opportunities = [];
    if (language) {
      opportunities = domainMap.get(language) || [];
    } else {
      for (const langOpps of domainMap.values()) {
        opportunities.push(...langOpps);
      }
    }
    
    const total = opportunities.length;
    const results = opportunities
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(offset, offset + limit);
    
    return {
      results,
      total,
      hasMore: offset + limit < total,
      nextOffset: offset + limit < total ? offset + limit : null
    };
  }

  searchByKeywords(keywords, language = null, limit = 100, offset = 0) {
    if (!Array.isArray(keywords)) keywords = [keywords];
    
    const keywordLower = keywords.map(k => k.toLowerCase());
    const scoredOpportunities = new Map();
    
    keywordLower.forEach(keyword => {
      const keywordVariants = this.generateKeywordVariants(keyword);
      
      keywordVariants.forEach(variant => {
        const opps = this.keywordIndex.get(variant) || [];
        opps.forEach(opp => {
          if (language && opp.language !== language) return;
          
          const existing = scoredOpportunities.get(opp.url) || { ...opp, matchScore: 0 };
          existing.matchScore += this.calculateKeywordScore(variant, opp);
          scoredOpportunities.set(opp.url, existing);
        });
      });
    });
    
    const opportunities = Array.from(scoredOpportunities.values())
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    
    const total = opportunities.length;
    const results = opportunities.slice(offset, offset + limit);
    
    return {
      results,
      total,
      hasMore: offset + limit < total,
      nextOffset: offset + limit < total ? offset + limit : null
    };
  }

  searchByJobTitle(jobTitle, language = null, fuzzyThreshold = 0.8, limit = 100, offset = 0) {
    const jobTitleLower = jobTitle.toLowerCase().trim();
    const jobWords = jobTitleLower.split(/\s+/).filter(w => w.length > 2);
    
    const candidates = new Map();
    
    jobWords.forEach(word => {
      const wordVariants = this.generateKeywordVariants(word);
      wordVariants.forEach(variant => {
        const opps = this.keywordIndex.get(variant) || [];
        opps.forEach(opp => {
          if (language && opp.language !== language) return;
          
          const titleLower = (opp.title || '').toLowerCase();
          const fuzzyScore = this.calculateFuzzyMatch(jobTitleLower, titleLower);
          
          if (fuzzyScore >= fuzzyThreshold) {
            candidates.set(opp.url, {
              ...opp,
              relevanceScore: fuzzyScore * (opp.confidence || 80) / 100
            });
          }
        });
      });
    });
    
    const opportunities = Array.from(candidates.values())
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    const total = opportunities.length;
    const results = opportunities.slice(offset, offset + limit);
    
    return {
      results,
      total,
      hasMore: offset + limit < total,
      nextOffset: offset + limit < total ? offset + limit : null
    };
  }

  isIndexFresh(fileName, fileModTime) {
    const lastUpdate = this.lastIndexUpdate.get(fileName);
    if (!lastUpdate) return false;
    
    return fileModTime.getTime() <= lastUpdate && 
           (Date.now() - lastUpdate) < this.indexTTL;
  }

  extractDomain(url) {
    if (!url) return 'unknown';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  extractKeywords(text) {
    if (!text) return [];
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));
    
    return [...new Set(words)];
  }

  generateKeywordVariants(keyword) {
    const variants = new Set([keyword]);
    
    variants.add(keyword.replace(/s$/, ''));
    variants.add(keyword + 's');
    variants.add(keyword.replace(/ies$/, 'y'));
    variants.add(keyword.replace(/y$/, 'ies'));
    variants.add(keyword.replace(/ed$/, ''));
    variants.add(keyword.replace(/ing$/, ''));
    
    return Array.from(variants);
  }

  calculateKeywordScore(keyword, opportunity) {
    const title = (opportunity.title || '').toLowerCase();
    const description = (opportunity.description || '').toLowerCase();
    
    let score = 0;
    
    if (title.includes(keyword)) score += 5;
    if (description.includes(keyword)) score += 2;
    if (title.startsWith(keyword)) score += 3;
    
    return score;
  }

  calculateFuzzyMatch(str1, str2) {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const matches = words1.filter(word => 
      words2.some(w2 => w2.includes(word) || word.includes(w2))
    );
    
    return matches.length / Math.max(words1.length, words2.length);
  }

  isStopWord(word) {
    const stopWords = ['the', 'and', 'or', 'but', 'for', 'with', 'at', 'by', 'from', 'to', 'in', 'on', 'of', 'as'];
    return stopWords.includes(word);
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  evictOldEntries() {
    const entries = Array.from(this.urlIndex.entries());
    entries.sort((a, b) => (a[1].scrapedAt || '').localeCompare(b[1].scrapedAt || ''));
    
    const toRemove = entries.slice(0, Math.floor(this.maxIndexSize * 0.2));
    toRemove.forEach(([url]) => this.urlIndex.delete(url));
    
    this.config.smartLog('cache', `Evicted ${toRemove.length} old index entries`);
  }

  getTotalIndexedOpportunities() {
    return this.urlIndex.size;
  }

  getIndexStats() {
    return {
      domains: this.domainIndex.size,
      languages: this.languageIndex.size,
      keywords: this.keywordIndex.size,
      totalOpportunities: this.urlIndex.size,
      lastUpdate: Math.max(...this.lastIndexUpdate.values(), 0)
    };
  }
}

module.exports = CacheIndexer;