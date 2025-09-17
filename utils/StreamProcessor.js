const fs = require('fs');
const { Transform, Readable, pipeline } = require('stream');
const { promisify } = require('util');

class StreamProcessor {
  constructor(config) {
    this.config = config;
    this.chunkSize = this.config.streaming?.chunkSize || 100;
    this.maxMemoryMB = this.config.streaming?.maxMemoryMB || 50;
    this.processTimeout = this.config.streaming?.processTimeout || 30000;
    this.pipelineAsync = promisify(pipeline);
  }

  async processFilesStream(fileList, processor, options = {}) {
    const startTime = Date.now();
    const { 
      maxConcurrency = 5,
      errorThreshold = 0.1,
      enableEarlyStop = true,
      targetResults = null
    } = options;

    const results = [];
    let processedCount = 0;
    let errorCount = 0;
    let memoryPeak = 0;

    try {
      const fileStream = Readable.from(fileList);
      const chunks = this.createChunks(fileList, this.chunkSize);
      
      this.config.smartLog('stream', 
        `Processing ${fileList.length} files in ${chunks.length} chunks (concurrency: ${maxConcurrency})`
      );

      for (const chunk of chunks) {
        const chunkStartTime = Date.now();
        const chunkPromises = chunk.map(file => 
          this.processFileWithRetry(file, processor).catch(error => {
            errorCount++;
            this.config.smartLog('fail', `Stream processing error for ${file}: ${error.message}`);
            return null;
          })
        );

        const chunkResults = await Promise.allSettled(chunkPromises);
        const validResults = chunkResults
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value);

        results.push(...validResults);
        processedCount += chunk.length;

        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        if (currentMemory > memoryPeak) memoryPeak = currentMemory;

        if (currentMemory > this.maxMemoryMB) {
          this.config.smartLog('stream', `Memory threshold exceeded: ${currentMemory.toFixed(1)}MB, forcing GC`);
          if (global.gc) global.gc();
        }

        const errorRate = errorCount / processedCount;
        if (errorRate > errorThreshold) {
          this.config.smartLog('fail', `Error rate too high: ${(errorRate * 100).toFixed(1)}%`);
          break;
        }

        if (enableEarlyStop && targetResults && results.length >= targetResults) {
          this.config.smartLog('stream', `Target results reached: ${results.length}`);
          break;
        }

        const chunkTime = Date.now() - chunkStartTime;
        if (processedCount % 100 === 0) {
          this.config.smartLog('stream', 
            `Processed ${processedCount}/${fileList.length} files (${chunkTime}ms/chunk, ${currentMemory.toFixed(1)}MB)`
          );
        }
      }

      const totalTime = Date.now() - startTime;
      this.config.smartLog('stream', 
        `Stream processing complete: ${results.length} results from ${processedCount} files in ${totalTime}ms (peak: ${memoryPeak.toFixed(1)}MB)`
      );

      return {
        results,
        stats: {
          processedFiles: processedCount,
          totalFiles: fileList.length,
          successRate: (processedCount - errorCount) / processedCount,
          processingTime: totalTime,
          memoryPeak: memoryPeak,
          errorCount
        }
      };

    } catch (error) {
      this.config.smartLog('fail', `Stream processing failed: ${error.message}`);
      throw error;
    }
  }

  async processFileWithRetry(filePath, processor, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Processing timeout')), this.processTimeout)
        );
        
        const processingPromise = processor(filePath);
        const result = await Promise.race([processingPromise, timeoutPromise]);
        
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await this.sleep(delay);
          this.config.smartLog('retry', `Retrying ${filePath} after ${delay}ms (attempt ${attempt + 1})`);
        }
      }
    }
    
    throw lastError;
  }

  createPaginatedStream(dataArray, pageSize = 50) {
    let currentIndex = 0;
    
    return new Readable({
      objectMode: true,
      read() {
        if (currentIndex >= dataArray.length) {
          this.push(null);
          return;
        }
        
        const chunk = dataArray.slice(currentIndex, currentIndex + pageSize);
        currentIndex += pageSize;
        
        this.push({
          data: chunk,
          page: Math.ceil(currentIndex / pageSize),
          hasMore: currentIndex < dataArray.length,
          total: dataArray.length
        });
      }
    });
  }

  createFilterTransform(filterFn, options = {}) {
    const { maxItems = null, skipEmpty = true } = options;
    let itemCount = 0;
    
    return new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          if (maxItems && itemCount >= maxItems) {
            return callback();
          }
          
          const filtered = chunk.data ? 
            chunk.data.filter(item => filterFn(item)) :
            (Array.isArray(chunk) ? chunk.filter(filterFn) : [chunk].filter(filterFn));
          
          if (skipEmpty && filtered.length === 0) {
            return callback();
          }
          
          itemCount += filtered.length;
          
          const result = chunk.data ? { ...chunk, data: filtered } : filtered;
          callback(null, result);
        } catch (error) {
          callback(error);
        }
      }
    });
  }

  createMapTransform(mapFn, options = {}) {
    const { parallel = false, concurrency = 5 } = options;
    
    if (!parallel) {
      return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          try {
            const mapped = chunk.data ?
              { ...chunk, data: chunk.data.map(mapFn) } :
              (Array.isArray(chunk) ? chunk.map(mapFn) : mapFn(chunk));
            callback(null, mapped);
          } catch (error) {
            callback(error);
          }
        }
      });
    }
    
    return new Transform({
      objectMode: true,
      async transform(chunk, encoding, callback) {
        try {
          if (chunk.data && Array.isArray(chunk.data)) {
            const chunks = this.createChunks(chunk.data, concurrency);
            const mappedChunks = await Promise.all(
              chunks.map(subChunk => Promise.all(subChunk.map(mapFn)))
            );
            const mapped = mappedChunks.flat();
            callback(null, { ...chunk, data: mapped });
          } else {
            const mapped = Array.isArray(chunk) ? 
              await Promise.all(chunk.map(mapFn)) : 
              await mapFn(chunk);
            callback(null, mapped);
          }
        } catch (error) {
          callback(error);
        }
      }
    });
  }

  createAggregateTransform(options = {}) {
    const { 
      key = null, 
      aggregateFn = (items) => items,
      sortFn = null,
      limit = null 
    } = options;
    
    const groups = new Map();
    
    return new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          const items = chunk.data || (Array.isArray(chunk) ? chunk : [chunk]);
          
          if (key) {
            items.forEach(item => {
              const keyValue = typeof key === 'function' ? key(item) : item[key];
              if (!groups.has(keyValue)) {
                groups.set(keyValue, []);
              }
              groups.get(keyValue).push(item);
            });
          } else {
            const existingData = groups.get('all') || [];
            groups.set('all', [...existingData, ...items]);
          }
          
          callback();
        } catch (error) {
          callback(error);
        }
      },
      flush(callback) {
        try {
          let results = [];
          
          for (const [groupKey, groupItems] of groups.entries()) {
            const aggregated = aggregateFn(groupItems);
            if (key) {
              results.push({ [key]: groupKey, data: aggregated });
            } else {
              results = aggregated;
            }
          }
          
          if (sortFn && Array.isArray(results)) {
            results.sort(sortFn);
          }
          
          if (limit && Array.isArray(results)) {
            results = results.slice(0, limit);
          }
          
          callback(null, results);
        } catch (error) {
          callback(error);
        }
      }
    });
  }

  async streamToArray(stream) {
    const results = [];
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => {
        if (Array.isArray(chunk)) {
          results.push(...chunk);
        } else {
          results.push(chunk);
        }
      });
      stream.on('end', () => resolve(results));
      stream.on('error', reject);
    });
  }

  async *createJobOpportunityGenerator(fileList, filterFn = null) {
    for (const filePath of fileList) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        if (data.data && data.data.links) {
          const opportunities = data.data.links
            .filter(link => link.isJobPosting)
            .map(link => ({
              title: (link.title || link.text || '').trim(),
              url: link.url,
              description: (link.text || '').substring(0, 200),
              source: data.data.url,
              confidence: link.confidence || 80,
              scrapedAt: data.data.scrapedAt
            }));
          
          const filtered = filterFn ? opportunities.filter(filterFn) : opportunities;
          yield* filtered;
        }
      } catch (error) {
        this.config.smartLog('stream', `Error processing ${filePath}: ${error.message}`);
      }
    }
  }

  createChunks(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  estimateMemoryUsage(dataSize, itemSize = 1024) {
    return (dataSize * itemSize) / 1024 / 1024;
  }

  shouldUseStreaming(dataSize, memoryLimit = null) {
    const limit = memoryLimit || this.maxMemoryMB;
    const estimatedMemory = this.estimateMemoryUsage(dataSize);
    return estimatedMemory > limit * 0.7;
  }
}

module.exports = StreamProcessor;