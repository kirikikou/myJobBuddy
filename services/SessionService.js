const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const loggingService = require('./LoggingService');

class SessionService {
  constructor() {
    this.allConsoleLogs = [];
    this.consoleErrors = [];
    this.scrapingSessions = new Map();
    this.maxLogsInMemory = config.DEBUG_MAX_LOGS || 2000;
    this.currentSessionId = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) {
      loggingService.service('SessionService', 'already-initialized');
      return;
    }

    this.initializeLogCapture();
    this.initialized = true;
    loggingService.service('SessionService', 'initialized', { maxLogsInMemory: this.maxLogsInMemory });
  }

  generateSessionId(userId, searchQuery, startTime) {
    const cleanUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9]/g, '_');
    return `session_${cleanUserId}_${cleanQuery}_${startTime}`;
  }

  createScrapingSession(sessionId, userId, userEmail, searchQuery, urls = []) {
    const session = {
      id: sessionId,
      userId: userId,
      userEmail: userEmail,
      searchQuery: searchQuery,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'running',
      totalUrls: urls.length,
      processedUrls: 0,
      successCount: 0,
      errorCount: 0,
      warningCount: 0,
      logs: [],
      urls: urls,
      userAgent: null,
      ipAddress: null
    };
    
    this.scrapingSessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    loggingService.service('SessionService', 'session-created', { sessionId, userId, totalUrls: urls.length });
    return session;
  }

  endScrapingSession(sessionId, status = 'completed') {
    const session = this.scrapingSessions.get(sessionId);
    if (session) {
      session.endTime = new Date().toISOString();
      session.status = status;
      session.duration = new Date(session.endTime) - new Date(session.startTime);
      loggingService.service('SessionService', 'session-ended', { 
        sessionId, 
        status, 
        duration: session.duration,
        processedUrls: session.processedUrls,
        successCount: session.successCount 
      });
    }
    
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
    return session;
  }

  captureConsoleLog(level, message, stack, url, lineNumber, userAgent, sessionId = null) {
    const logEntry = {
      id: Date.now() + Math.random(),
      level: level || 'log',
      message: message || 'Empty message',
      stack: stack || null,
      url: url || null,
      lineNumber: lineNumber || null,
      timestamp: new Date().toISOString(),
      userAgent: userAgent || null,
      sessionId: sessionId || this.currentSessionId
    };
    
    this.allConsoleLogs.unshift(logEntry);
    
    if (level === 'error' || level === 'warn') {
      this.consoleErrors.unshift(logEntry);
    }
    
    if (logEntry.sessionId && this.scrapingSessions.has(logEntry.sessionId)) {
      const session = this.scrapingSessions.get(logEntry.sessionId);
      session.logs.push(logEntry);
      
      if (level === 'error') session.errorCount++;
      else if (level === 'warn') session.warningCount++;
      
      if (message.includes('Successfully scraped') || message.includes('Cache hit') || message.includes('✅')) {
        session.successCount++;
        session.processedUrls++;
      } else if (message.includes('Error during scraping') || message.includes('Scraping failed') || message.includes('❌')) {
        session.processedUrls++;
      }
    }
    
    if (this.allConsoleLogs.length > this.maxLogsInMemory) {
      this.allConsoleLogs = this.allConsoleLogs.slice(0, this.maxLogsInMemory);
    }
    
    if (this.consoleErrors.length > this.maxLogsInMemory / 2) {
      this.consoleErrors = this.consoleErrors.slice(0, this.maxLogsInMemory / 2);
    }
    
    this.saveLogToFile(logEntry);
  }

  async saveLogToFile(logEntry) {
    try {
      const logFile = path.join(config.DEBUG_DIR, `console-logs-${new Date().toISOString().split('T')[0]}.json`);
      
      let existingLogs = [];
      try {
        const content = await fs.readFile(logFile, 'utf8');
        existingLogs = JSON.parse(content);
      } catch (e) {
        loggingService.service('SessionService', 'log-file-new', { logFile });
      }
      
      existingLogs.unshift(logEntry);
      
      const maxFileSize = config.DEBUG_MAX_FILE_LOGS || 20000;
      if (existingLogs.length > maxFileSize) {
        existingLogs = existingLogs.slice(0, maxFileSize);
      }
      
      await fs.writeFile(logFile, JSON.stringify(existingLogs, null, 2));
    } catch (error) {
      loggingService.error('Failed to save console log', { error: error.message, logEntry: logEntry.id });
    }
  }

  async saveSessionToFile(session) {
    try {
      const sessionFile = path.join(config.DEBUG_DIR, `scraping-sessions-${new Date().toISOString().split('T')[0]}.json`);
      
      let existingSessions = [];
      try {
        const content = await fs.readFile(sessionFile, 'utf8');
        existingSessions = JSON.parse(content);
      } catch (e) {
        loggingService.service('SessionService', 'session-file-new', { sessionFile });
      }
      
      const sessionIndex = existingSessions.findIndex(s => s.id === session.id);
      if (sessionIndex !== -1) {
        existingSessions[sessionIndex] = session;
      } else {
        existingSessions.unshift(session);
      }
      
      const maxSessions = config.DEBUG_MAX_FILE_SESSIONS || 1000;
      if (existingSessions.length > maxSessions) {
        existingSessions = existingSessions.slice(0, maxSessions);
      }
      
      await fs.writeFile(sessionFile, JSON.stringify(existingSessions, null, 2));
    } catch (error) {
      loggingService.error('Failed to save session', { error: error.message, sessionId: session.id });
    }
  }

  async loadLogsFromFile(date) {
    try {
      const logFile = path.join(config.DEBUG_DIR, `console-logs-${date}.json`);
      const content = await fs.readFile(logFile, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return [];
    }
  }

  async loadSessionsFromFile(date) {
    try {
      const sessionFile = path.join(config.DEBUG_DIR, `scraping-sessions-${date}.json`);
      const content = await fs.readFile(sessionFile, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return [];
    }
  }

  async loadAllSessionsFromFiles() {
    try {
      const debugDir = config.DEBUG_DIR;
      const files = await fs.readdir(debugDir);
      const sessionFiles = files.filter(file => file.startsWith('scraping-sessions-') && file.endsWith('.json'));
      
      const allSessions = new Map();
      
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(debugDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const sessions = JSON.parse(content);
          
          if (Array.isArray(sessions)) {
            sessions.forEach(session => {
              if (session && session.id && !allSessions.has(session.id)) {
                allSessions.set(session.id, session);
              }
            });
          }
        } catch (error) {
          loggingService.error('Failed to load session file', { file, error: error.message });
        }
      }
      
      return allSessions;
    } catch (error) {
      loggingService.error('Failed to load sessions from files', { error: error.message });
      return new Map();
    }
  }

  organizeLogsByDomain(logs) {
    const domainLogs = {};
    
    logs.forEach(log => {
      let domain = 'general';
      
      if (log.url) {
        try {
          const url = new URL(log.url);
          domain = url.hostname;
        } catch (error) {
          domain = 'invalid-urls';
        }
      } else if (log.message) {
        const urlPattern = /https?:\/\/([^\/\s\)\,\;\:\!\?\>\<\[\]]+)/g;
        const matches = log.message.match(urlPattern);
        
        if (matches && matches.length > 0) {
          try {
            const url = new URL(matches[0]);
            domain = url.hostname;
          } catch (error) {
            const domainMatch = matches[0].match(/https?:\/\/([^\/\s\)\,\;\:\!\?\>\<\[\]]+)/);
            if (domainMatch && domainMatch[1]) {
              domain = domainMatch[1];
            }
          }
        }
      }
      
      if (!domainLogs[domain]) {
        domainLogs[domain] = {
          logs: [],
          stats: {
            total: 0,
            errors: 0,
            warnings: 0,
            successes: 0,
            lastActivity: null
          }
        };
      }
      
      domainLogs[domain].logs.push(log);
      domainLogs[domain].stats.total++;
      
      if (log.level === 'error') {
        domainLogs[domain].stats.errors++;
      } else if (log.level === 'warn') {
        domainLogs[domain].stats.warnings++;
      } else if (log.message.includes('✅') || log.message.includes('Successfully') || log.message.includes('Cache hit')) {
        domainLogs[domain].stats.successes++;
      }
      
      if (!domainLogs[domain].stats.lastActivity || new Date(log.timestamp) > new Date(domainLogs[domain].stats.lastActivity)) {
        domainLogs[domain].stats.lastActivity = log.timestamp;
      }
    });
    
    Object.keys(domainLogs).forEach(domain => {
      domainLogs[domain].logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    });
    
    return domainLogs;
  }

  async loadScrapingErrorsByDomain() {
    try {
      const scrapingErrorsFile = path.join(config.DEBUG_DIR, 'scraping_errors.json');
      const scrapingMetricsFile = path.join(config.DEBUG_DIR, 'scraping_metrics.json');
      
      let scrapingErrors = {};
      let scrapingMetrics = {};
      
      try {
        const errorsContent = await fs.readFile(scrapingErrorsFile, 'utf8');
        scrapingErrors = JSON.parse(errorsContent);
      } catch (e) {
        loggingService.service('SessionService', 'no-scraping-errors-file');
      }
      
      try {
        const metricsContent = await fs.readFile(scrapingMetricsFile, 'utf8');
        scrapingMetrics = JSON.parse(metricsContent);
      } catch (e) {
        loggingService.service('SessionService', 'no-scraping-metrics-file');
      }
      
      const domainLogs = {};
      
      Object.keys(scrapingErrors).forEach(domain => {
        const errorData = scrapingErrors[domain];
        
        if (!domainLogs[domain]) {
          domainLogs[domain] = {
            logs: [],
            stats: {
              total: 0,
              errors: 0,
              warnings: 0,
              successes: 0,
              lastActivity: null
            }
          };
        }
        
        if (errorData.errorHistory && Array.isArray(errorData.errorHistory)) {
          errorData.errorHistory.forEach(error => {
            const logEntry = {
              id: Date.now() + Math.random(),
              level: 'error',
              message: `[${error.step}] ${error.message} (Execution time: ${error.executionTime}ms)`,
              timestamp: error.timestamp,
              url: scrapingMetrics[domain]?.url || `https://${domain}`,
              domain: domain,
              step: error.step,
              type: error.type,
              executionTime: error.executionTime
            };
            
            domainLogs[domain].logs.push(logEntry);
            domainLogs[domain].stats.total++;
            domainLogs[domain].stats.errors++;
            
            if (!domainLogs[domain].stats.lastActivity || new Date(error.timestamp) > new Date(domainLogs[domain].stats.lastActivity)) {
              domainLogs[domain].stats.lastActivity = error.timestamp;
            }
          });
        }
      });
      
      Object.keys(scrapingMetrics).forEach(domain => {
        const metrics = scrapingMetrics[domain];
        
        if (!domainLogs[domain]) {
          domainLogs[domain] = {
            logs: [],
            stats: {
              total: 0,
              errors: 0,
              warnings: 0,
              successes: 0,
              lastActivity: null
            }
          };
        }
        
        if (metrics.steps) {
          Object.keys(metrics.steps).forEach(stepName => {
            const step = metrics.steps[stepName];
            
            if (step.successes > 0) {
              const logEntry = {
                id: Date.now() + Math.random(),
                level: 'info',
                message: `[${stepName}] ${step.successes} successful attempts (${step.attempts} total attempts)`,
                timestamp: metrics.lastAttempt || new Date().toISOString(),
                url: metrics.url || `https://${domain}`,
                domain: domain,
                step: stepName,
                type: 'Success'
              };
              
              domainLogs[domain].logs.push(logEntry);
              domainLogs[domain].stats.total++;
              domainLogs[domain].stats.successes += step.successes;
            }
          });
        }
        
        if (metrics.detectedPlatform) {
          const logEntry = {
            id: Date.now() + Math.random(),
            level: 'info',
            message: `Platform detected: ${metrics.detectedPlatform.name} (Complexity: ${metrics.complexityCategory || 'Unknown'})`,
            timestamp: metrics.firstSeen || new Date().toISOString(),
            url: metrics.url || `https://${domain}`,
            domain: domain,
            type: 'PlatformDetection'
          };
          
          domainLogs[domain].logs.push(logEntry);
          domainLogs[domain].stats.total++;
        }
      });
      
      Object.keys(domainLogs).forEach(domain => {
        domainLogs[domain].logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      });
      
      return domainLogs;
    } catch (error) {
      loggingService.error('Error loading scraping errors by domain', { error: error.message });
      return {};
    }
  }

  initializeLogCapture() {
    const origSmartLog = config.smartLog.bind(config);
    config.smartLog = (category, message, meta) => {
      const level = meta && meta.level ? meta.level : 'info';
      const source = meta && meta.source ? meta.source : 'server';
      const stack = meta && meta.stack ? meta.stack : null;
      const url = meta && meta.url ? meta.url : null;
      const lineNumber = meta && meta.lineNumber ? meta.lineNumber : null;
      const sessionId = meta && meta.sessionId ? meta.sessionId : null;
      const msg = typeof message === 'string' ? message : JSON.stringify(message);
      this.captureConsoleLog(level, msg, stack, url, lineNumber, source, sessionId);
      return origSmartLog(category, message, meta);
    };
    
    process.on('uncaughtException', (err) => {
      origSmartLog('service', 'uncaughtException', { 
        level: 'error', 
        source: 'server', 
        stack: err && err.stack ? err.stack : null, 
        error: err && err.message ? err.message : String(err) 
      });
    });
    
    process.on('unhandledRejection', (reason) => {
      origSmartLog('service', 'unhandledRejection', { 
        level: 'error', 
        source: 'server', 
        reason: reason && reason.message ? reason.message : String(reason), 
        stack: reason && reason.stack ? reason.stack : null 
      });
    });
    
    loggingService.service('SessionService', 'log-capture-initialized');
  }

  clearLogs() {
    this.allConsoleLogs = [];
    this.consoleErrors = [];
    loggingService.service('SessionService', 'logs-cleared', { 
      previousLogCount: this.allConsoleLogs.length,
      previousErrorCount: this.consoleErrors.length 
    });
  }

  getStats() {
    return {
      totalLogs: this.allConsoleLogs.length,
      totalErrors: this.consoleErrors.length,
      activeSessions: this.scrapingSessions.size,
      maxLogsInMemory: this.maxLogsInMemory,
      currentSessionId: this.currentSessionId,
      initialized: this.initialized
    };
  }

  getAllLogs() {
    return [...this.allConsoleLogs];
  }

  getAllErrors() {
    return [...this.consoleErrors];
  }

  getAllSessions() {
    return new Map(this.scrapingSessions);
  }

  getSession(sessionId) {
    return this.scrapingSessions.get(sessionId);
  }
}

const sessionService = new SessionService();

module.exports = sessionService;