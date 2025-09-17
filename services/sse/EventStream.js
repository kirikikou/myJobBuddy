class EventStream {
  constructor(req, res, config) {
    this.req = req;
    this.res = res;
    this.config = config;
    this.isAborted = false;
    this.doneEmitted = false;
    this.setupStream();
  }

  setupStream() {
    try {
      const headers = {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      };

      this.res.writeHead(200, headers);
      
      if (typeof this.res.flushHeaders === 'function') {
        this.res.flushHeaders();
      }

      this.req.on('close', () => {
        this.isAborted = true;
        this.config.smartLog('buffer', 'sse:aborted');
      });

      this.req.on('error', (error) => {
        this.isAborted = true;
        this.config.smartLog('fail', `sse:request-error: ${error.message}`);
      });

      this.res.on('error', (error) => {
        this.isAborted = true;
        this.config.smartLog('fail', `sse:response-error: ${error.message}`);
      });

      this.config.smartLog('buffer', 'sse:start');

    } catch (error) {
      this.config.smartLog('fail', `sse:setup-error: ${error.message}`);
      this.isAborted = true;
    }
  }

  send(eventName, data) {
    if (this.isAborted || this.res.destroyed || this.res.writableEnded) {
      return;
    }

    try {
      const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
      this.res.write(message);
    } catch (error) {
      this.config.smartLog('fail', `sse:send-error: ${error.message}`);
      this.isAborted = true;
    }
  }

  sendProgress(phase, message, extra = {}) {
    this.send('phase', {
      phase,
      message,
      timestamp: Date.now(),
      ...extra
    });
  }

  sendPartialResult(resultData) {
    if (!this.config.flags?.enablePartialEmit || this.isAborted) return;

    const payload = {
      ...resultData,
      payloadId: resultData.payloadId || this.generatePayloadId(resultData.url),
      timestamp: Date.now()
    };

    this.config.smartLog('sse', 'emitting partial', { 
      url: payload.url, 
      status: payload.status, 
      cacheLevel: payload.cacheLevel 
    });

    this.send('sse:partial-result', payload);
    this.send('partial-result', payload);
  }

  sendCacheComplete(results, totalBeforeFilter, excludedCount) {
    this.send('cache-complete', {
      phase: 'cache-complete',
      results,
      count: results.length,
      totalBeforeFilter,
      excludedCount
    });
  }

  sendScrapingProgress(urlResult, completedCount, totalCount) {
    const progressPayload = {
      phase: 'scraping-progress',
      url: urlResult.url,
      source: urlResult.source || 'unknown',
      wasBuffered: urlResult.source === 'cache-shared',
      results: urlResult.results || [],
      totalBeforeFilter: urlResult.totalBeforeFilter || 0,
      excludedCount: urlResult.excludedCount || 0,
      progress: `${completedCount}/${totalCount}`
    };

    this.send('scraping-progress', progressPayload);
    this.send('sse:partial-result', progressPayload);
    this.send('partial-result', progressPayload);
  }

  sendError(errorType, details = {}) {
    this.send('error', {
      phase: 'error',
      errorType,
      ...details
    });
  }

  sendDone(extra = {}) {
    if (this.doneEmitted || this.isAborted || this.res.destroyed || this.res.writableEnded) {
      return;
    }
    this.doneEmitted = true;

    const payload = {
      phase: 'complete',
      cached: extra.cached || 0,
      scraped: extra.scraped || 0,
      ...extra
    };

    this.config.smartLog('sse', 'emitting done', payload);
    this.send('sse:done', payload);
    this.send('done', payload);

    try {
      this.res.write(':\n\n');
    } catch (error) {
      this.config.smartLog('fail', `sse:done-write-error: ${error.message}`);
    }

    setTimeout(() => {
      this.close();
    }, 100);
  }

  close() {
    if (!this.res.writableEnded && !this.res.destroyed) {
      try {
        this.res.end();
      } catch (error) {
        this.config.smartLog('fail', `sse:close-error: ${error.message}`);
      }
    }
    this.config.smartLog('buffer', 'sse:end');
  }

  isClientConnected() {
    return !this.isAborted && !this.res.destroyed && !this.res.writableEnded;
  }

  generatePayloadId(url) {
    if (!url) return null;
    
    try {
      const path = require('path');
      const { getCacheFilename } = require('../../cacheManager');
      return path.basename(getCacheFilename(url));
    } catch (error) {
      return `payload_${Date.now()}`;
    }
  }

  createPartialResultHandler() {
    return (resultData) => {
      this.sendPartialResult(resultData);
    };
  }

  static createEventStream(req, res, config) {
    return new EventStream(req, res, config);
  }

  keepAlive() {
    if (this.isClientConnected()) {
      try {
        this.res.write(': keepalive\n\n');
      } catch (error) {
        this.config.smartLog('fail', `sse:keepalive-error: ${error.message}`);
        this.isAborted = true;
      }
    }
  }

  startKeepAlive(intervalMs = 30000) {
    this.keepAliveInterval = setInterval(() => {
      this.keepAlive();
    }, intervalMs);
  }

  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  onClose(callback) {
    this.req.on('close', callback);
  }

  onError(callback) {
    this.req.on('error', callback);
    this.res.on('error', callback);
  }
}

module.exports = EventStream;