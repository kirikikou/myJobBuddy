const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const config = require('../../config');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class FileCache {
  constructor(options = {}) {
    this.basePath = options.basePath || './cache';
    this.maxSizeMB = options.maxSizeMB || 1000;
    this.maxSizeBytes = this.maxSizeMB * 1024 * 1024;
    this.compression = options.compression || false;
    this.namespace = options.namespace || 'default';
    
    this.index = new Map();
    this.currentSizeBytes = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.writeCount = 0;
    this.evictionCount = 0;
    this.compressionRatio = 0;
    
    this.indexPath = path.join(this.basePath, '.index.json');
    this.initialized = false;
  }

  async init() {
    await this.ensureCacheDir();
    await this.loadIndex();
    await this.calculateCurrentSize();
    
    this.initialized = true;
    config.smartLog('cache', `File cache initialized: ${this.basePath}, ${this.maxSizeMB}MB, compression: ${this.compression}`);
  }

  async ensureCacheDir() {
    try {
      await fs.access(this.basePath);
    } catch {
      await fs.mkdir(this.basePath, { recursive: true });
      config.smartLog('cache', `Created cache directory: ${this.basePath}`);
    }
  }

  async get(key, options = {}) {
    const { allowStale = false } = options;
    const filePath = this.getFilePath(key);
    
    try {
      const metadata = this.index.get(key);
      if (!metadata) {
        this.missCount++;
        return null;
      }
      
      if (!allowStale && this.isExpired(metadata)) {
        await this.delete(key);
        this.missCount++;
        return null;
      }
      
      const data = await fs.readFile(filePath);
      let content;
      
      if (metadata.compressed) {
        const decompressed = await gunzip(data);
        content = JSON.parse(decompressed.toString());
      } else {
        content = JSON.parse(data.toString());
      }
      
      metadata.lastAccessed = Date.now();
      metadata.accessCount = (metadata.accessCount || 0) + 1;
      this.index.set(key, metadata);
      
      this.hitCount++;
      return content;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.index.delete(key);
        this.missCount++;
        return null;
      }
      
      config.smartLog('fail', `File cache read error for ${key}: ${error.message}`);
      this.missCount++;
      return null;
    }
  }

  async set(key, value, ttl = null, options = {}) {
    const { compression = this.compression } = options;
    const filePath = this.getFilePath(key);
    
    try {
      let serialized = JSON.stringify(value);
      let finalData = Buffer.from(serialized);
      let isCompressed = false;
      
      if (compression && serialized.length > 1024) {
        try {
          const compressed = await gzip(serialized);
          if (compressed.length < serialized.length * 0.8) {
            finalData = compressed;
            isCompressed = true;
            this.compressionRatio = compressed.length / serialized.length;
          }
        } catch (compressionError) {
          config.smartLog('cache', `Compression failed for ${key}, using uncompressed`);
        }
      }
      
      const metadata = {
        key,
        size: finalData.length,
        originalSize: serialized.length,
        compressed: isCompressed,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        ttl: ttl ? Date.now() + ttl : null,
        priority: value.metadata?.priority || 5
      };
      
      const existingMetadata = this.index.get(key);
      const oldSize = existingMetadata ? existingMetadata.size : 0;
      const newTotalSize = this.currentSizeBytes - oldSize + finalData.length;
      
      if (newTotalSize > this.maxSizeBytes) {
        const bytesToEvict = newTotalSize - (this.maxSizeBytes * 0.9);
        await this.evictBytes(bytesToEvict);
      }
      
      await fs.writeFile(filePath, finalData);
      
      this.index.set(key, metadata);
      this.currentSizeBytes = this.currentSizeBytes - oldSize + finalData.length;
      this.writeCount++;
      
      await this.saveIndexThrottled();
      
      return true;
      
    } catch (error) {
      config.smartLog('fail', `File cache write error for ${key}: ${error.message}`);
      return false;
    }
  }

  async delete(key) {
    const filePath = this.getFilePath(key);
    const metadata = this.index.get(key);
    
    try {
      await fs.unlink(filePath);
      
      if (metadata) {
        this.currentSizeBytes -= metadata.size;
      }
      
      this.index.delete(key);
      await this.saveIndexThrottled();
      
      return true;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.index.delete(key);
        return true;
      }
      
      config.smartLog('fail', `File cache delete error for ${key}: ${error.message}`);
      return false;
    }
  }

  async exists(key) {
    const metadata = this.index.get(key);
    if (!metadata) return false;
    
    if (this.isExpired(metadata)) {
      await this.delete(key);
      return false;
    }
    
    const filePath = this.getFilePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      this.index.delete(key);
      return false;
    }
  }

  async clear(pattern = null, namespace = null) {
    let cleared = 0;
    const keysToDelete = [];
    
    for (const [key, metadata] of this.index.entries()) {
      let shouldDelete = false;
      
      if (!pattern && !namespace) {
        shouldDelete = true;
      } else {
        if (namespace && key.startsWith(`${namespace}:`)) {
          shouldDelete = true;
        }
        if (pattern && key.includes(pattern)) {
          shouldDelete = true;
        }
      }
      
      if (shouldDelete) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      await this.delete(key);
      cleared++;
    }
    
    if (!pattern && !namespace) {
      this.currentSizeBytes = 0;
    }
    
    await this.saveIndex();
    config.smartLog('cache', `File cache cleared: ${cleared} entries`);
    
    return cleared;
  }

  async getMultiple(keys, options = {}) {
    const results = new Map();
    
    const chunks = this.chunkArray(keys, 10);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async key => {
        const value = await this.get(key, options);
        return { key, value };
      });
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      chunkResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.value !== null) {
          results.set(result.value.key, result.value.value);
        }
      });
    }
    
    return results;
  }

  async setMultiple(entries, options = {}) {
    let successCount = 0;
    
    const chunks = this.chunkArray(Array.from(entries.entries()), 5);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async ([key, value]) => {
        return await this.set(key, value, options.ttl, options);
      });
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      successCount += chunkResults.filter(r => r.status === 'fulfilled' && r.value).length;
    }
    
    return successCount;
  }

  async evictBytes(bytesToEvict) {
    const candidates = this.getEvictionCandidates();
    let evictedBytes = 0;
    let evictedCount = 0;
    
    for (const [key, metadata] of candidates) {
      if (evictedBytes >= bytesToEvict) break;
      
      await this.delete(key);
      evictedBytes += metadata.size;
      evictedCount++;
      this.evictionCount++;
    }
    
    config.smartLog('cache', `File eviction: ${evictedCount} entries, ${Math.round(evictedBytes/1024/1024)}MB freed`);
    return evictedCount;
  }

  getEvictionCandidates() {
    const entries = Array.from(this.index.entries());
    
    return entries.sort((a, b) => {
      const [keyA, metaA] = a;
      const [keyB, metaB] = b;
      
      const scoreA = this.calculateEvictionScore(metaA);
      const scoreB = this.calculateEvictionScore(metaB);
      
      return scoreA - scoreB;
    });
  }

  calculateEvictionScore(metadata) {
    const now = Date.now();
    const age = now - metadata.createdAt;
    const timeSinceAccess = now - metadata.lastAccessed;
    const accessCount = metadata.accessCount || 0;
    const priority = metadata.priority || 5;
    
    const ageScore = Math.min(age / (24 * 60 * 60 * 1000), 10);
    const accessScore = Math.min(timeSinceAccess / (60 * 60 * 1000), 10);
    const frequencyScore = Math.max(0, 5 - Math.log(accessCount + 1));
    const priorityScore = Math.max(0, 10 - priority);
    
    return ageScore + accessScore + frequencyScore + priorityScore;
  }

  async cleanupExpired() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, metadata] of this.index.entries()) {
      if (this.isExpired(metadata)) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      await this.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      config.smartLog('cache', `File cleanup: ${expiredKeys.length} expired entries removed`);
    }
    
    return expiredKeys.length;
  }

  async loadIndex() {
    try {
      const indexData = await fs.readFile(this.indexPath, 'utf8');
      const indexObj = JSON.parse(indexData);
      
      this.index.clear();
      for (const [key, metadata] of Object.entries(indexObj)) {
        this.index.set(key, metadata);
      }
      
      config.smartLog('cache', `File cache index loaded: ${this.index.size} entries`);
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        config.smartLog('fail', `Index load error: ${error.message}`);
      }
      this.index.clear();
    }
  }

  async saveIndex() {
    try {
      const indexObj = Object.fromEntries(this.index);
      await fs.writeFile(this.indexPath, JSON.stringify(indexObj, null, 2));
      
    } catch (error) {
      config.smartLog('fail', `Index save error: ${error.message}`);
    }
  }

  saveIndexThrottled() {
    if (this._indexSaveTimeout) return;
    
    this._indexSaveTimeout = setTimeout(async () => {
      await this.saveIndex();
      this._indexSaveTimeout = null;
    }, 5000);
  }

  async calculateCurrentSize() {
    let totalSize = 0;
    
    for (const metadata of this.index.values()) {
      totalSize += metadata.size;
    }
    
    this.currentSizeBytes = totalSize;
    config.smartLog('cache', `File cache size calculated: ${Math.round(totalSize/1024/1024)}MB`);
  }

  async repairIndex() {
    const repairedIndex = new Map();
    let repairCount = 0;
    
    try {
      const files = await fs.readdir(this.basePath);
      const cacheFiles = files.filter(f => f.endsWith('.cache'));
      
      for (const file of cacheFiles) {
        const key = this.extractKeyFromFilename(file);
        const filePath = path.join(this.basePath, file);
        
        try {
          const stats = await fs.stat(filePath);
          const existingMetadata = this.index.get(key);
          
          if (!existingMetadata) {
            const metadata = {
              key,
              size: stats.size,
              originalSize: stats.size,
              compressed: false,
              createdAt: stats.birthtimeMs || stats.ctimeMs,
              lastAccessed: stats.atimeMs,
              accessCount: 0,
              ttl: null,
              priority: 5
            };
            
            repairedIndex.set(key, metadata);
            repairCount++;
          } else {
            repairedIndex.set(key, existingMetadata);
          }
          
        } catch (fileError) {
          config.smartLog('cache', `Removing orphaned file: ${file}`);
          await fs.unlink(filePath);
        }
      }
      
      this.index = repairedIndex;
      await this.saveIndex();
      await this.calculateCurrentSize();
      
      config.smartLog('cache', `Index repaired: ${repairCount} entries recovered`);
      return repairCount;
      
    } catch (error) {
      config.smartLog('fail', `Index repair error: ${error.message}`);
      return 0;
    }
  }

  getFilePath(key) {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const filename = `${hash.substring(0, 8)}_${this.sanitizeFilename(key)}.cache`;
    return path.join(this.basePath, filename);
  }

  extractKeyFromFilename(filename) {
    const parts = filename.replace('.cache', '').split('_');
    return parts.slice(1).join('_');
  }

  sanitizeFilename(key) {
    return key.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  }

  isExpired(metadata) {
    return metadata.ttl && Date.now() > metadata.ttl;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async getStats() {
    const totalRequests = this.hitCount + this.missCount;
    const hitRatio = totalRequests > 0 ? (this.hitCount / totalRequests * 100) : 0;
    const usageRatio = (this.currentSizeBytes / this.maxSizeBytes * 100);
    
    let compressionStats = { enabled: false };
    if (this.compression) {
      let compressedEntries = 0;
      let totalCompressionRatio = 0;
      
      for (const metadata of this.index.values()) {
        if (metadata.compressed) {
          compressedEntries++;
          totalCompressionRatio += (metadata.size / metadata.originalSize);
        }
      }
      
      compressionStats = {
        enabled: true,
        compressedEntries,
        avgCompressionRatio: compressedEntries > 0 ? 
          Math.round((totalCompressionRatio / compressedEntries) * 100) / 100 : 0
      };
    }
    
    return {
      type: 'file',
      entries: this.index.size,
      maxSizeMB: this.maxSizeMB,
      usedSizeMB: Math.round(this.currentSizeBytes / (1024 * 1024) * 100) / 100,
      usagePercent: Math.round(usageRatio * 100) / 100,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRatio: Math.round(hitRatio * 100) / 100,
      writeCount: this.writeCount,
      evictionCount: this.evictionCount,
      basePath: this.basePath,
      compression: compressionStats,
      avgEntrySize: this.index.size > 0 ? Math.round(this.currentSizeBytes / this.index.size) : 0
    };
  }

  async healthCheck() {
    const stats = await this.getStats();
    
    try {
      await fs.access(this.basePath);
      const testFile = path.join(this.basePath, 'health_check.tmp');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      
      return {
        healthy: stats.usagePercent < 95 && stats.hitRatio > 50,
        usagePercent: stats.usagePercent,
        hitRatio: stats.hitRatio,
        entries: stats.entries,
        writable: true
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        writable: false
      };
    }
  }
}

module.exports = FileCache;