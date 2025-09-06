const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const { createBaseLayout, createBreadcrumb } = require('./utils/htmlTemplates');
const { formatDate, formatConsoleError } = require('./utils/formatters');
const { validateConsoleErrorParams } = require('./utils/validators');

const router = express.Router();

let allConsoleLogs = [];
let consoleErrors = [];
let scrapingSessions = new Map();
let maxLogsInMemory = 2000;
let currentSessionId = null;

const generateSessionId = (userId, searchQuery, startTime) => {
  const cleanUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');
  const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9]/g, '_');
  return `session_${cleanUserId}_${cleanQuery}_${startTime}`;
};

const createScrapingSession = (sessionId, userId, userEmail, searchQuery, urls = []) => {
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
  
  scrapingSessions.set(sessionId, session);
  currentSessionId = sessionId;
  return session;
};

const endScrapingSession = (sessionId, status = 'completed') => {
  const session = scrapingSessions.get(sessionId);
  if (session) {
    session.endTime = new Date().toISOString();
    session.status = status;
    session.duration = new Date(session.endTime) - new Date(session.startTime);
  }
  currentSessionId = null;
  return session;
};

const captureConsoleLog = (level, message, stack, url, lineNumber, userAgent, sessionId = null) => {
  const logEntry = {
    id: Date.now() + Math.random(),
    level: level || 'log',
    message: message || 'Empty message',
    stack: stack || null,
    url: url || null,
    lineNumber: lineNumber || null,
    timestamp: new Date().toISOString(),
    userAgent: userAgent || null,
    sessionId: sessionId || currentSessionId
  };
  
  allConsoleLogs.unshift(logEntry);
  
  if (level === 'error' || level === 'warn') {
    consoleErrors.unshift(logEntry);
  }
  
  if (logEntry.sessionId && scrapingSessions.has(logEntry.sessionId)) {
    const session = scrapingSessions.get(logEntry.sessionId);
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
  
  if (allConsoleLogs.length > maxLogsInMemory) {
    allConsoleLogs = allConsoleLogs.slice(0, maxLogsInMemory);
  }
  
  if (consoleErrors.length > maxLogsInMemory / 2) {
    consoleErrors = consoleErrors.slice(0, maxLogsInMemory / 2);
  }
  
  saveLogToFile(logEntry);
};

const saveLogToFile = async (logEntry) => {
  try {
    const logFile = path.join(config.DEBUG_DIR, `console-logs-${new Date().toISOString().split('T')[0]}.json`);
    
    let existingLogs = [];
    try {
      const content = await fs.readFile(logFile, 'utf8');
      existingLogs = JSON.parse(content);
    } catch (e) {
    }
    
    existingLogs.unshift(logEntry);
    
    if (existingLogs.length > 20000) {
      existingLogs = existingLogs.slice(0, 20000);
    }
    
    await fs.writeFile(logFile, JSON.stringify(existingLogs, null, 2));
  } catch (error) {
    config.smartLog('fail','Failed to save console log:', error.message);
  }
};

const saveSessionToFile = async (session) => {
  try {
    const sessionFile = path.join(config.DEBUG_DIR, `scraping-sessions-${new Date().toISOString().split('T')[0]}.json`);
    
    let existingSessions = [];
    try {
      const content = await fs.readFile(sessionFile, 'utf8');
      existingSessions = JSON.parse(content);
    } catch (e) {
    }
    
    const sessionIndex = existingSessions.findIndex(s => s.id === session.id);
    if (sessionIndex !== -1) {
      existingSessions[sessionIndex] = session;
    } else {
      existingSessions.unshift(session);
    }
    
    if (existingSessions.length > 1000) {
      existingSessions = existingSessions.slice(0, 1000);
    }
    
    await fs.writeFile(sessionFile, JSON.stringify(existingSessions, null, 2));
  } catch (error) {
    config.smartLog('fail','Failed to save session:', error.message);
  }
};

const loadLogsFromFile = async (date) => {
  try {
    const logFile = path.join(config.DEBUG_DIR, `console-logs-${date}.json`);
    const content = await fs.readFile(logFile, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return [];
  }
};

const loadSessionsFromFile = async (date) => {
  try {
    const sessionFile = path.join(config.DEBUG_DIR, `scraping-sessions-${date}.json`);
    const content = await fs.readFile(sessionFile, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return [];
  }
};

const loadAllSessionsFromFiles = async () => {
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
        config.smartLog('fail',`Failed to load session file ${file}:`, error.message);
      }
    }
    
    return allSessions;
  } catch (error) {
    config.smartLog('fail','Failed to load sessions from files:', error.message);
    return new Map();
  }
};

const organizeLogsByDomain = (logs) => {
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
};

const initializeConsoleCapture = () => {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalInfo = console.info;
  
  console.error = function(...args) {
    originalError.apply(console, args);
    const message = args.join(' ');
    captureConsoleLog('error', message, null, null, null, 'server');
  };
  
  console.warn = function(...args) {
    originalWarn.apply(console, args);
    const message = args.join(' ');
    captureConsoleLog('warn', message, null, null, null, 'server');
  };
  
  console.log = function(...args) {
    originalLog.apply(console, args);
    const message = args.join(' ');
    captureConsoleLog('log', message, null, null, null, 'server');
  };
  
  console.info = function(...args) {
    originalInfo.apply(console, args);
    const message = args.join(' ');
    captureConsoleLog('info', message, null, null, null, 'server');
  };
};

initializeConsoleCapture();

const loadScrapingErrorsByDomain = async () => {
  try {
    const scrapingErrorsFile = path.join(config.DEBUG_DIR, 'scraping_errors.json');
    const scrapingMetricsFile = path.join(config.DEBUG_DIR, 'scraping_metrics.json');
    
    let scrapingErrors = {};
    let scrapingMetrics = {};
    
    try {
      const errorsContent = await fs.readFile(scrapingErrorsFile, 'utf8');
      scrapingErrors = JSON.parse(errorsContent);
    } catch (e) {
      config.smartLog('buffer','No scraping errors file found');
    }
    
    try {
      const metricsContent = await fs.readFile(scrapingMetricsFile, 'utf8');
      scrapingMetrics = JSON.parse(metricsContent);
    } catch (e) {
      config.smartLog('buffer','No scraping metrics file found');
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
    config.smartLog('fail','Error loading scraping errors by domain:', error);
    return {};
  }
};

router.get('/sessions', async (req, res) => {
  try {
    const {
      status = null,
      limit = 50,
      page = 1,
      date = null,
      userId = null,
      userEmail = null
    } = req.query;
    
    let sessions = [];
    
    if (date) {
      sessions = await loadSessionsFromFile(date);
    } else {
      const allSessionsFromFiles = await loadAllSessionsFromFiles();
      const memorySessions = Array.from(scrapingSessions.values());
      
      const sessionMap = new Map();
      allSessionsFromFiles.forEach((session, id) => sessionMap.set(id, session));
      memorySessions.forEach(session => sessionMap.set(session.id, session));
      
      sessions = Array.from(sessionMap.values());
    }

    if (status) {
      sessions = sessions.filter(session => session.status === status);
    }
    
    if (userId) {
      sessions = sessions.filter(session => 
        session.userId && session.userId.toLowerCase().includes(userId.toLowerCase())
      );
    }
    
    if (userEmail) {
      sessions = sessions.filter(session => 
        session.userEmail && session.userEmail.toLowerCase().includes(userEmail.toLowerCase())
      );
    }
    
    sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedSessions = sessions.slice(startIndex, endIndex);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Scraping Sessions', url: '/debug/console/sessions' }
      ]);
      
      const statusOptions = ['', 'running', 'completed', 'failed', 'timeout'].map(s => 
        `<option value="${s}" ${status === s ? 'selected' : ''}>${s || 'All Status'}</option>`
      ).join('');
      
      const sessionsList = paginatedSessions.length > 0 
        ? paginatedSessions.map(session => {
            const successRate = session.totalUrls > 0 ? Math.round((session.successCount / session.totalUrls) * 100) : 0;
            const statusColor = session.status === 'completed' ? '#28a745' : 
                               session.status === 'failed' ? '#dc3545' : 
                               session.status === 'running' ? '#007bff' : '#6c757d';
            
            return `
              <div class="session-card" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <div>
                    <h4 style="margin: 0; color: #333;">${session.searchQuery}</h4>
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">
                      👤 <strong>${session.userId || 'Unknown'}</strong>
                      ${session.userEmail ? `(${session.userEmail})` : ''}
                    </div>
                  </div>
                  <span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px;">${session.status.toUpperCase()}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                  <div><strong>URLs:</strong> ${session.processedUrls}/${session.totalUrls}</div>
                  <div><strong>Success:</strong> ${session.successCount} (${successRate}%)</div>
                  <div><strong>Errors:</strong> ${session.errorCount}</div>
                  <div><strong>Warnings:</strong> ${session.warningCount}</div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #666;">
                  <span>Started: ${formatDate(session.startTime)}</span>
                  ${session.endTime ? `<span>Duration: ${Math.round(session.duration / 1000)}s</span>` : '<span>Running...</span>'}
                </div>
                
                <div style="margin-top: 10px;">
                  <a href="/debug/console/sessions/${session.id}" class="button small">View Details</a>
                  <a href="/debug/console/sessions/${session.id}/logs" class="button small secondary">View Logs</a>
                </div>
              </div>
            `;
          }).join('')
        : '<div class="empty-state"><h3>No scraping sessions found</h3><p>No sessions match current filters.</p></div>';
      
      const pagination = sessions.length > limit ? `
        <div class="actions">
          ${page > 1 ? `<a href="?status=${status || ''}&limit=${limit}&page=${page - 1}&userId=${userId || ''}&userEmail=${userEmail || ''}" class="button secondary">Previous</a>` : ''}
          <span>Page ${page} of ${Math.ceil(sessions.length / limit)} (${sessions.length} total sessions)</span>
          ${endIndex < sessions.length ? `<a href="?status=${status || ''}&limit=${limit}&page=${page + 1}&userId=${userId || ''}&userEmail=${userEmail || ''}" class="button secondary">Next</a>` : ''}
        </div>
      ` : '';
      
      const content = `
        ${breadcrumb}
        
        <h1>Scraping Sessions</h1>
        
        <div class="actions">
          <a href="/debug/console/sessions" class="button" style="background-color: #007bff; color: white; border-color: #007bff;">View Sessions</a>
          <a href="/debug/console/monitor" class="button secondary" style="background-color: #6c757d; color: white; border-color: #6c757d;">Live Monitor</a>
          <a href="/debug" class="button secondary" style="background-color: #6c757d; color: white; border-color: #6c757d;">Back to Debug</a>
        </div>
        
        <div class="filters">
          <form method="get" style="display: flex; gap: 10px; align-items: end; margin-bottom: 20px; flex-wrap: wrap;">
            <div>
              <label for="status">Status:</label>
              <select name="status" id="status">${statusOptions}</select>
            </div>
            <div>
              <label for="userId">User ID:</label>
              <input type="text" name="userId" id="userId" value="${userId || ''}" placeholder="Search by user ID">
            </div>
            <div>
              <label for="userEmail">User Email:</label>
              <input type="text" name="userEmail" id="userEmail" value="${userEmail || ''}" placeholder="alfred@example.com">
            </div>
            <div>
              <label for="limit">Per Page:</label>
              <select name="limit" id="limit">
                <option value="25" ${limit == 25 ? 'selected' : ''}>25</option>
                <option value="50" ${limit == 50 ? 'selected' : ''}>50</option>
                <option value="100" ${limit == 100 ? 'selected' : ''}>100</option>
              </select>
            </div>
<button type="submit" class="button" style="background-color: #007bff; color: white; border-color: #007bff;">Filter</button>          </form>
        </div>
        
        <div class="section">
          <h2>Sessions (${sessions.length})</h2>
          ${userId || userEmail ? `<p class="small">Filtered by user: ${userId ? `ID: ${userId}` : ''} ${userEmail ? `Email: ${userEmail}` : ''}</p>` : ''}
          ${sessionsList}
          ${pagination}
        </div>
      `;
      
      const html = createBaseLayout('Scraping Sessions - Debug Tools', content);
      res.send(html);
    } else {
      res.json({
        success: true,
        sessions: paginatedSessions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: sessions.length,
          pages: Math.ceil(sessions.length / limit)
        },
        filters: { status, userId, userEmail }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    let session = scrapingSessions.get(sessionId);
    if (!session) {
      const allSessionsFromFiles = await loadAllSessionsFromFiles();
      session = allSessionsFromFiles.get(sessionId);
    }
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Scraping Sessions', url: '/debug/console/sessions' },
        { label: `Session ${sessionId.slice(-8)}`, url: `/debug/console/sessions/${sessionId}` }
      ]);
      
      const successRate = session.totalUrls > 0 ? Math.round((session.successCount / session.totalUrls) * 100) : 0;
      const statusColor = session.status === 'completed' ? '#28a745' : 
                         session.status === 'failed' ? '#dc3545' : 
                         session.status === 'running' ? '#007bff' : '#6c757d';
      
      const urlsList = session.urls.length > 0 ? session.urls.map((url, index) => {
        const urlLogs = session.logs.filter(log => log.url === url);
        const hasError = urlLogs.some(log => log.level === 'error');
        const hasSuccess = urlLogs.some(log => log.message.includes('Successfully') || log.message.includes('Cache hit') || log.message.includes('✅'));
        
        const status = hasError ? 'error' : hasSuccess ? 'success' : 'pending';
        const statusIcon = status === 'error' ? '❌' : status === 'success' ? '✅' : '⏳';
        
        return `
          <tr>
            <td>${index + 1}</td>
            <td><a href="${url}" target="_blank">${url.length > 60 ? url.substring(0, 60) + '...' : url}</a></td>
            <td>${statusIcon} ${status}</td>
            <td>${urlLogs.length}</td>
            <td><a href="/debug/console/sessions/${sessionId}/logs?url=${encodeURIComponent(url)}" class="button small">View</a></td>
          </tr>
        `;
      }).join('') : '<tr><td colspan="5">No URLs found</td></tr>';
      
      const content = `
        ${breadcrumb}
        
        <h1>Session Details</h1>
        
        <div class="actions">
          <a href="/debug/console/sessions" class="button secondary">Back to Sessions</a>
          <a href="/debug/console/sessions/${sessionId}/logs" class="button">View All Logs</a>
        </div><a href="/debug/console/sessions/${sessionId}/domains" class="button">View by Domain</a>
        
        <div class="section">
          <h2>Session Information</h2>
          <div class="metrics-grid">
            <div class="metrics-card">
              <h3>Overview</h3>
              <table>
                <tr>
                  <th>User ID</th>
                  <td><strong>${session.userId || 'Unknown'}</strong></td>
                </tr>
                <tr>
                  <th>User Email</th>
                  <td>${session.userEmail || 'N/A'}</td>
                </tr>
                <tr>
                  <th>Search Query</th>
                  <td>${session.searchQuery}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td><span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 3px;">${session.status.toUpperCase()}</span></td>
                </tr>
                <tr>
                  <th>Progress</th>
                  <td>${session.processedUrls}/${session.totalUrls} URLs (${successRate}% success)</td>
                </tr>
                <tr>
                  <th>Started</th>
                  <td>${formatDate(session.startTime)}</td>
                </tr>
                ${session.endTime ? `<tr><th>Ended</th><td>${formatDate(session.endTime)}</td></tr>` : ''}
                ${session.duration ? `<tr><th>Duration</th><td>${Math.round(session.duration / 1000)} seconds</td></tr>` : ''}
              </table>
            </div>
            
            <div class="metrics-card">
              <h3>Statistics</h3>
              <table>
                <tr>
                  <th>Total URLs</th>
                  <td>${session.totalUrls}</td>
                </tr>
                <tr>
                  <th>Processed</th>
                  <td>${session.processedUrls}</td>
                </tr>
                <tr>
                  <th>Successful</th>
                  <td style="color: #28a745;">${session.successCount}</td>
                </tr>
                <tr>
                  <th>Errors</th>
                  <td style="color: #dc3545;">${session.errorCount}</td>
                </tr>
                <tr>
                  <th>Warnings</th>
                  <td style="color: #ffc107;">${session.warningCount}</td>
                </tr>
                <tr>
                  <th>Total Logs</th>
                  <td>${session.logs.length}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>URLs Processing Status</h2>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Logs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${urlsList}
              </tbody>
            </table>
          </div>
        </div>
      `;
      
      const html = createBaseLayout(`Session ${sessionId.slice(-8)} - Debug Tools`, content);
      res.send(html);
    } else {
      res.json({
        success: true,
        session: session
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/sessions/:sessionId/domains', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const selectedDomain = req.query.domain;
    
    let session = scrapingSessions.get(sessionId);
    let sessionFromFile = false;
    
    if (!session) {
      const allSessionsFromFiles = await loadAllSessionsFromFiles();
      session = allSessionsFromFiles.get(sessionId);
      sessionFromFile = true;
    }
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    let httpLogs = session.logs || [];
    
    if (sessionFromFile && httpLogs.length === 0) {
      const sessionDate = session.startTime.split('T')[0];
      const allLogsFromFile = await loadLogsFromFile(sessionDate);
      
      httpLogs = allLogsFromFile.filter(log => {
        if (log.sessionId === sessionId) return true;
        if (log.message && session.userId && log.message.includes(session.userId)) return true;
        
        if (session.urls && session.urls.length > 0) {
          return session.urls.some(sessionUrl => {
            if (log.message && log.message.includes(sessionUrl)) return true;
            if (log.url && log.url === sessionUrl) return true;
            const domain = new URL(sessionUrl).hostname;
            if (log.message && log.message.includes(domain)) return true;
            return false;
          });
        }
        
        return false;
      });
    }
    
    const httpDomainLogs = organizeLogsByDomain(httpLogs);
    const scrapingDomainLogs = await loadScrapingErrorsByDomain();
    
    const combinedDomainLogs = {};
    
    const allDomains = new Set([
      ...Object.keys(httpDomainLogs),
      ...Object.keys(scrapingDomainLogs)
    ]);
    
    allDomains.forEach(domain => {
      combinedDomainLogs[domain] = {
        logs: [
          ...(httpDomainLogs[domain]?.logs || []),
          ...(scrapingDomainLogs[domain]?.logs || [])
        ],
        stats: {
          total: (httpDomainLogs[domain]?.stats.total || 0) + (scrapingDomainLogs[domain]?.stats.total || 0),
          errors: (httpDomainLogs[domain]?.stats.errors || 0) + (scrapingDomainLogs[domain]?.stats.errors || 0),
          warnings: (httpDomainLogs[domain]?.stats.warnings || 0) + (scrapingDomainLogs[domain]?.stats.warnings || 0),
          successes: (httpDomainLogs[domain]?.stats.successes || 0) + (scrapingDomainLogs[domain]?.stats.successes || 0),
          lastActivity: null
        }
      };
      
      const allTimestamps = combinedDomainLogs[domain].logs
        .map(log => log.timestamp)
        .filter(ts => ts)
        .sort((a, b) => new Date(b) - new Date(a));
      
      if (allTimestamps.length > 0) {
        combinedDomainLogs[domain].stats.lastActivity = allTimestamps[0];
      }
      
      combinedDomainLogs[domain].logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    });
    
    const domains = Object.keys(combinedDomainLogs).sort();
    
    const getDomainDisplayName = (domain) => {
      if (domain === 'general') return 'General Logs';
      if (domain === 'invalid-urls') return 'Invalid URLs';
      return domain;
    };
    
    const getDomainIcon = (domain) => {
      if (domain.includes('recruitee')) return '🔍';
      if (domain.includes('linkedin')) return '💼';
      if (domain.includes('indeed')) return '📋';
      if (domain.includes('glassdoor')) return '🏢';
      if (domain === 'general') return '🌐';
      if (domain === 'invalid-urls') return '⚠️';
      return '🌍';
    };
    
    const getDomainDisplayTitle = (domain) => {
      if (domain === 'general') return '🌐 General Logs';
      if (domain === 'invalid-urls') return '⚠️ Invalid URLs';
      if (domain.includes('recruitee')) return `🔍 ${domain}`;
      if (domain.includes('linkedin')) return `💼 ${domain}`;
      if (domain.includes('indeed')) return `📋 ${domain}`;
      if (domain.includes('glassdoor')) return `🏢 ${domain}`;
      return `🌍 ${domain}`;
    };
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Scraping Sessions', url: '/debug/console/sessions' },
        { label: `Session ${sessionId.slice(-8)}`, url: `/debug/console/sessions/${sessionId}` },
        { label: 'Domains', url: '#' }
      ]);
      
      const domainsList = domains.map(domain => {
        const domainData = combinedDomainLogs[domain];
        const isSelected = selectedDomain === domain;
        
        return `
          <div class="domain-card" style="background: ${isSelected ? '#e3f2fd' : '#f8f9fa'}; border: 2px solid ${isSelected ? '#2196f3' : '#dee2e6'}; border-radius: 8px; padding: 15px; margin: 10px 0; cursor: pointer;" onclick="selectDomain('${domain}')">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h4 style="margin: 0; color: #333; font-size: 16px;">${getDomainIcon(domain)} ${getDomainDisplayName(domain)}</h4>
              <span style="background: ${domainData.stats.errors > 0 ? '#dc3545' : domainData.stats.successes > 0 ? '#28a745' : '#6c757d'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                ${domainData.stats.total} logs
              </span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: 8px;">
              <div><strong>Total:</strong> ${domainData.stats.total}</div>
              <div style="color: #28a745;"><strong>Success:</strong> ${domainData.stats.successes}</div>
              <div style="color: #dc3545;"><strong>Errors:</strong> ${domainData.stats.errors}</div>
              <div style="color: #ffc107;"><strong>Warnings:</strong> ${domainData.stats.warnings}</div>
            </div>
            
            <div style="font-size: 12px; color: #666;">
              ${domainData.stats.lastActivity ? `Last activity: ${formatDate(domainData.stats.lastActivity)}` : 'No activity'}
            </div>
          </div>
        `;
      }).join('');
      
      const selectedDomainLogs = selectedDomain && combinedDomainLogs[selectedDomain] 
        ? combinedDomainLogs[selectedDomain].logs.map(log => `
            <div class="console-log-entry" style="background: ${log.level === 'error' ? '#f8d7da' : log.level === 'warn' ? '#fff3cd' : log.level === 'info' ? '#d1ecf1' : '#f8f9fa'}; border: 1px solid ${log.level === 'error' ? '#f5c6cb' : log.level === 'warn' ? '#ffeaa7' : log.level === 'info' ? '#bee5eb' : '#dee2e6'}; border-radius: 4px; padding: 10px; margin: 5px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <strong style="color: ${log.level === 'error' ? '#721c24' : log.level === 'warn' ? '#856404' : log.level === 'info' ? '#0c5460' : '#495057'};">[${log.level.toUpperCase()}]</strong>
                <span class="small">${formatDate(log.timestamp)}</span>
              </div>
              <div style="font-family: monospace; font-size: 13px; word-break: break-word;">${log.message}</div>
              ${log.step ? `<div class="small" style="margin-top: 5px; color: #666;">Step: ${log.step}</div>` : ''}
              ${log.type ? `<div class="small" style="margin-top: 5px; color: #666;">Type: ${log.type}</div>` : ''}
              ${log.executionTime ? `<div class="small" style="margin-top: 5px; color: #666;">Execution time: ${log.executionTime}ms</div>` : ''}
              ${log.url ? `<div class="small" style="margin-top: 5px; color: #666;">URL: ${log.url}</div>` : ''}
            </div>
          `).join('')
        : '';
      
      const content = `
        ${breadcrumb}
        
        <h1>Session Logs by Domain</h1>
        <p class="small">User: <strong>${session.userId || 'Unknown'}</strong> ${session.userEmail ? `(${session.userEmail})` : ''}</p>
        
        <div class="actions">
          <a href="/debug/console/sessions/${sessionId}" class="button secondary" style="background-color: #6c757d; color: white;">Back to Session</a>
          <a href="/debug/console/sessions/${sessionId}/logs" class="button secondary" style="background-color: #6c757d; color: white;">All Logs</a>
          <a href="/debug/console/sessions" class="button secondary" style="background-color: #6c757d; color: white;">All Sessions</a>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
          <div class="section">
            <h2>Domains (${domains.length})</h2>
            <p class="small">Click on a domain to view its logs</p>
            ${domainsList}
          </div>
          
          <div class="section">
            <h2>Domain Logs</h2>
            ${selectedDomain ? `
              <h3>${getDomainDisplayTitle(selectedDomain)} (${combinedDomainLogs[selectedDomain].stats.total} logs)</h3>
              <div style="max-height: 600px; overflow-y: auto;">
                ${selectedDomainLogs}
              </div>
            ` : '<p class="small">Select a domain from the left to view its logs</p>'}
          </div>
        </div>
      `;
      
      const additionalJS = `
        function selectDomain(domain) {
          const url = new URL(window.location);
          url.searchParams.set('domain', domain);
          window.location.href = url.toString();
        }
      `;
      
      const html = createBaseLayout(`Session Domains - Debug Tools`, content, '', additionalJS);
      res.send(html);
    } else {
      res.json({
        success: true,
        sessionId: sessionId,
        domains: combinedDomainLogs,
        selectedDomain: selectedDomain
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/sessions/:sessionId/logs', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const url = req.query.url;
    
    let session = scrapingSessions.get(sessionId);
    let sessionFromFile = false;
    
    if (!session) {
      const allSessionsFromFiles = await loadAllSessionsFromFiles();
      session = allSessionsFromFiles.get(sessionId);
      sessionFromFile = true;
    }
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    let logs = session.logs || [];
    
    if (sessionFromFile && logs.length === 0) {
      const sessionDate = session.startTime.split('T')[0];
      const allLogsFromFile = await loadLogsFromFile(sessionDate);
      
      logs = allLogsFromFile.filter(log => {
        if (log.sessionId === sessionId) return true;
        
        if (log.message && session.userId && log.message.includes(session.userId)) {
          return true;
        }
        
        if (session.urls && session.urls.length > 0) {
          return session.urls.some(sessionUrl => {
            if (log.message && log.message.includes(sessionUrl)) return true;
            if (log.url && log.url === sessionUrl) return true;
            const domain = new URL(sessionUrl).hostname;
            if (log.message && log.message.includes(domain)) return true;
            return false;
          });
        }
        
        return false;
      });
    }
    
    if (url) {
      logs = logs.filter(log => log.url === url || (log.message && log.message.includes(url)));
    }
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Scraping Sessions', url: '/debug/console/sessions' },
        { label: `Session ${sessionId.slice(-8)}`, url: `/debug/console/sessions/${sessionId}` },
        { label: 'Logs', url: '#' }
      ]);
      
      const logsList = logs.length > 0 
        ? logs.map(log => `
            <div class="console-log-entry" style="background: ${log.level === 'error' ? '#f8d7da' : log.level === 'warn' ? '#fff3cd' : log.level === 'info' ? '#d1ecf1' : '#f8f9fa'}; border: 1px solid ${log.level === 'error' ? '#f5c6cb' : log.level === 'warn' ? '#ffeaa7' : log.level === 'info' ? '#bee5eb' : '#dee2e6'}; border-radius: 4px; padding: 10px; margin: 5px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <strong style="color: ${log.level === 'error' ? '#721c24' : log.level === 'warn' ? '#856404' : log.level === 'info' ? '#0c5460' : '#495057'};">[${log.level.toUpperCase()}]</strong>
                <span class="small">${formatDate(log.timestamp)}</span>
              </div>
              <div style="font-family: monospace; font-size: 13px; word-break: break-word;">${log.message}</div>
              ${log.stack ? `<details style="margin-top: 10px;"><summary style="cursor: pointer; color: #666;">Stack Trace</summary><pre style="margin-top: 5px; font-size: 11px; color: #666; overflow-x: auto;">${log.stack}</pre></details>` : ''}
              ${log.url ? `<div class="small" style="margin-top: 5px; color: #666;">URL: ${log.url}</div>` : ''}
            </div>
          `).join('')
        : '<div class="empty-state"><h3>No logs found</h3><p>No logs found for this session.</p></div>';
      
      const content = `
        ${breadcrumb}
        
        <h1>Session Logs</h1>
        <p class="small">User: <strong>${session.userId || 'Unknown'}</strong> ${session.userEmail ? `(${session.userEmail})` : ''}</p>
        
        <div class="actions">
          <a href="/debug/console/sessions/${sessionId}" class="button secondary">Back to Session</a>
          <a href="/debug/console/sessions" class="button secondary">All Sessions</a>
        </div>
        
        <div class="section">
          <h2>Logs (${logs.length})</h2>
          ${url ? `<p class="small">Filtered by URL: <code>${url}</code></p>` : ''}
          ${logsList}
        </div>
      `;
      
      const html = createBaseLayout(`Session Logs - Debug Tools`, content);
      res.send(html);
    } else {
      res.json({
        success: true,
        sessionId: sessionId,
        logs: logs,
        filteredByUrl: !!url
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/sessions/start', async (req, res) => {
  try {
    const { userId, userEmail, searchQuery, urls = [] } = req.body;
    
    if (!userId || !searchQuery) {
      return res.status(400).json({
        success: false,
        message: 'User ID and search query are required'
      });
    }
    
    const sessionId = generateSessionId(userId, searchQuery, Date.now());
    const session = createScrapingSession(sessionId, userId, userEmail, searchQuery, urls);
    
    await saveSessionToFile(session);
    
    res.json({
      success: true,
      sessionId: sessionId,
      session: session
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/sessions/:sessionId/end', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { status = 'completed' } = req.body;
    
    const session = endScrapingSession(sessionId, status);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    await saveSessionToFile(session);
    
    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const validation = validateConsoleErrorParams(req.query);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parameters',
        errors: validation.errors
      });
    }
    
    const {
      level = null,
      limit = 200,
      page = 1,
      date = null,
      domain = null,
      sessionId = null
    } = req.query;
    
    let logs = [];
    
    if (date) {
      logs = await loadLogsFromFile(date);
    } else {
      logs = [...allConsoleLogs];
    }
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    if (domain) {
      logs = logs.filter(log => 
        (log.message && log.message.toLowerCase().includes(domain.toLowerCase())) ||
        (log.url && log.url.includes(domain))
      );
    }
    
    if (sessionId) {
      logs = logs.filter(log => log.sessionId === sessionId);
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedLogs = logs.slice(startIndex, endIndex);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Console Logs', url: '/debug/console/logs' }
      ]);
      
      const levelOptions = ['', 'log', 'info', 'warn', 'error', 'debug'].map(l => 
        `<option value="${l}" ${level === l ? 'selected' : ''}>${l || 'All Levels'}</option>`
      ).join('');
      
      const limitOptions = [100, 200, 500, 1000].map(l => 
        `<option value="${l}" ${limit == l ? 'selected' : ''}>${l}</option>`
      ).join('');
      
      const logList = paginatedLogs.length > 0 
        ? paginatedLogs.map(log => `
            <div class="console-log-entry" style="background: ${log.level === 'error' ? '#f8d7da' : log.level === 'warn' ? '#fff3cd' : log.level === 'info' ? '#d1ecf1' : '#f8f9fa'}; border: 1px solid ${log.level === 'error' ? '#f5c6cb' : log.level === 'warn' ? '#ffeaa7' : log.level === 'info' ? '#bee5eb' : '#dee2e6'}; border-radius: 4px; padding: 10px; margin: 5px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <strong style="color: ${log.level === 'error' ? '#721c24' : log.level === 'warn' ? '#856404' : log.level === 'info' ? '#0c5460' : '#495057'};">[${log.level.toUpperCase()}]</strong>
                <div style="display: flex; gap: 10px; align-items: center;">
                  ${log.sessionId ? `<a href="/debug/console/sessions/${log.sessionId}" class="small" style="color: #007bff;">Session</a>` : ''}
                  <span class="small">${formatDate(log.timestamp)}</span>
                </div>
              </div>
              <div style="font-family: monospace; font-size: 13px; word-break: break-word;">${log.message}</div>
              ${log.stack ? `<details style="margin-top: 10px;"><summary style="cursor: pointer; color: #666;">Stack Trace</summary><pre style="margin-top: 5px; font-size: 11px; color: #666; overflow-x: auto;">${log.stack}</pre></details>` : ''}
              ${log.url ? `<div class="small" style="margin-top: 5px; color: #666;">URL: ${log.url}</div>` : ''}
            </div>
          `).join('')
        : '<div class="empty-state"><h3>No console logs found</h3><p>No logs match current filters. Logs are being captured in real-time.</p></div>';
      
      const pagination = logs.length > limit ? `
        <div class="actions">
          ${page > 1 ? `<a href="?level=${level || ''}&limit=${limit}&page=${page - 1}&domain=${domain || ''}&sessionId=${sessionId || ''}" class="button secondary">Previous</a>` : ''}
          <span>Page ${page} of ${Math.ceil(logs.length / limit)} (${logs.length} total logs)</span>
          ${endIndex < logs.length ? `<a href="?level=${level || ''}&limit=${limit}&page=${page + 1}&domain=${domain || ''}&sessionId=${sessionId || ''}" class="button secondary">Next</a>` : ''}
        </div>
      ` : '';
      
      const content = `
        ${breadcrumb}
        
        <h1>Console Logs</h1>
        
        <div class="actions">
          <a href="/debug/console/sessions" class="button">View Sessions</a>
          <a href="/debug/console/monitor" class="button secondary">Live Monitor</a>
          <a href="/debug" class="button secondary">Back to Debug</a>
        </div>
        
        <div class="filters">
          <form method="get" style="display: flex; gap: 10px; align-items: end; margin-bottom: 20px;">
            <div>
              <label for="level">Level:</label>
              <select name="level" id="level">${levelOptions}</select>
            </div>
            <div>
              <label for="domain">Domain:</label>
              <input type="text" name="domain" id="domain" value="${domain || ''}" placeholder="Filter by domain">
            </div>
            <div>
              <label for="sessionId">Session ID:</label>
              <input type="text" name="sessionId" id="sessionId" value="${sessionId || ''}" placeholder="Filter by session">
            </div>
            <div>
              <label for="limit">Limit:</label>
              <select name="limit" id="limit">${limitOptions}</select>
            </div>
            <button type="submit" class="button">Filter</button>
            <input type="hidden" name="page" value="1">
          </form>
        </div>
        
        <div class="section">
          <h2>Logs (${logs.length})</h2>
          ${sessionId ? `<p class="small">Filtered by session: <code>${sessionId}</code></p>` : ''}
          ${logList}
          ${pagination}
        </div>
      `;
      
      const html = createBaseLayout('Console Logs - Debug Tools', content);
      res.send(html);
    } else {
      res.json({
        success: true,
        logs: paginatedLogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: logs.length,
          pages: Math.ceil(logs.length / limit)
        },
        filters: {
          level,
          domain,
          sessionId
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/errors', async (req, res) => {
  try {
    const validation = validateConsoleErrorParams(req.query);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parameters',
        errors: validation.errors
      });
    }
    
    const {
      level = null,
      limit = 100,
      page = 1,
      date = null
    } = req.query;
    
    let errors = [];
    
    if (date) {
      const logs = await loadLogsFromFile(date);
      errors = logs.filter(log => log.level === 'error' || log.level === 'warn');
    } else {
      errors = [...consoleErrors];
    }
    
    if (level) {
      errors = errors.filter(error => error.level === level);
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedErrors = errors.slice(startIndex, endIndex);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Console Errors', url: '/debug/console/errors' }
      ]);
      
      const levelOptions = ['', 'warn', 'error'].map(l => 
        `<option value="${l}" ${level === l ? 'selected' : ''}>${l || 'All Error Levels'}</option>`
      ).join('');
      
      const errorList = paginatedErrors.length > 0 
        ? paginatedErrors.map(error => formatConsoleError(error)).join('')
        : '<div class="empty-state"><h3>No console errors found</h3><p>No errors match current filters.</p></div>';
      
      const pagination = errors.length > limit ? `
        <div class="actions">
          ${page > 1 ? `<a href="?level=${level || ''}&limit=${limit}&page=${page - 1}" class="button secondary">Previous</a>` : ''}
          <span>Page ${page} of ${Math.ceil(errors.length / limit)} (${errors.length} total errors)</span>
          ${endIndex < errors.length ? `<a href="?level=${level || ''}&limit=${limit}&page=${page + 1}" class="button secondary">Next</a>` : ''}
        </div>
      ` : '';
      
      const content = `
        ${breadcrumb}
        
        <h1>Console Errors & Warnings</h1>
        
        <div class="actions">
          <a href="/debug/console/logs" class="button secondary">All Logs</a>
          <a href="/debug/console/sessions" class="button secondary">Sessions</a>
          <a href="/debug/console/monitor" class="button secondary">Live Monitor</a>
          <button onclick="clearErrors()" class="button danger">Clear All Errors</button>
        </div>
        
        <div class="filters">
          <form method="get" style="display: flex; gap: 10px; align-items: end; margin-bottom: 20px;">
            <div>
              <label for="level">Level:</label>
              <select name="level" id="level">${levelOptions}</select>
            </div>
            <div>
              <label for="limit">Limit:</label>
              <select name="limit" id="limit">
                <option value="50" ${limit == 50 ? 'selected' : ''}>50</option>
                <option value="100" ${limit == 100 ? 'selected' : ''}>100</option>
                <option value="200" ${limit == 200 ? 'selected' : ''}>200</option>
              </select>
            </div>
            <button type="submit" class="button">Filter</button>
            <input type="hidden" name="page" value="1">
          </form>
        </div>
        
        <div class="section">
          <h2>Errors & Warnings (${errors.length})</h2>
          ${errorList}
          ${pagination}
        </div>
      `;
      
      const additionalJS = `
        function clearErrors() {
          if (confirm('Are you sure you want to clear all console errors?')) {
            fetch('/debug/console/clear', { method: 'POST' })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  location.reload();
                } else {
                  alert('Failed to clear errors: ' + data.message);
                }
              })
              .catch(error => {
                alert('Error: ' + error.message);
              });
          }
        }
      `;
      
      const html = createBaseLayout('Console Errors - Debug Tools', content, '', additionalJS);
      res.send(html);
    } else {
      res.json({
        success: true,
        errors: paginatedErrors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: errors.length,
          pages: Math.ceil(errors.length / limit)
        },
        filters: {
          level,
          date
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/monitor', (req, res) => {
  const breadcrumb = createBreadcrumb([
    { label: 'Debug', url: '/debug' },
    { label: 'Console Logs', url: '/debug/console/logs' },
    { label: 'Live Monitor', url: '/debug/console/monitor' }
  ]);
  
  const content = `
    ${breadcrumb}
    
    <h1>Live Console Monitor</h1>
    
    <div class="actions">
      <a href="/debug/console/logs" class="button secondary">View All Logs</a>
      <a href="/debug/console/sessions" class="button secondary">View Sessions</a>
      <a href="/debug/console/errors" class="button secondary">View Errors</a>
      <button onclick="clearMonitor()" class="button secondary">Clear Monitor</button>
      <button onclick="toggleMonitoring()" class="button" id="toggleBtn">Pause Monitoring</button>
    </div>
    
    <div class="section">
      <h2>Real-Time Console Activity</h2>
      <p class="small">Monitoring logs, errors, warnings and info in real-time.</p>
      
      <div id="console-output" style="background: #1e1e1e; color: #fff; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 13px; max-height: 600px; overflow-y: auto;">
        <div style="color: #28a745;">Console monitor initialized. Waiting for activity...</div>
      </div>
    </div>
    
    <div class="section">
      <h2>Statistics</h2>
      <div class="metrics-grid">
        <div class="metrics-card">
          <h3>Current Session</h3>
          <table>
            <tr>
              <th>Logs</th>
              <td id="log-count">0</td>
            </tr>
            <tr>
              <th>Errors</th>
              <td id="error-count">0</td>
            </tr>
            <tr>
              <th>Warnings</th>
              <td id="warn-count">0</td>
            </tr>
            <tr>
              <th>Infos</th>
              <td id="info-count">0</td>
            </tr>
            <tr>
              <th>Session Duration</th>
              <td id="session-duration">0 seconds</td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
  
  const additionalJS = `
    let monitoring = true;
    let logCount = 0;
    let errorCount = 0;
    let warnCount = 0;
    let infoCount = 0;
    let sessionStart = Date.now();
    
    function updateSessionDuration() {
      const duration = Math.floor((Date.now() - sessionStart) / 1000);
      document.getElementById('session-duration').textContent = duration + ' seconds';
    }
    
    setInterval(updateSessionDuration, 1000);
    setInterval(fetchLatestLogs, 2000);
    
    function addToConsole(level, message, timestamp) {
      if (!monitoring) return;
      
      const output = document.getElementById('console-output');
      const time = new Date(timestamp).toLocaleTimeString();
      
      let color = '#fff';
      if (level === 'error') {
        color = '#dc3545';
        errorCount++;
        document.getElementById('error-count').textContent = errorCount;
      } else if (level === 'warn') {
        color = '#ffc107';
        warnCount++;
        document.getElementById('warn-count').textContent = warnCount;
      } else if (level === 'info') {
        color = '#17a2b8';
        infoCount++;
        document.getElementById('info-count').textContent = infoCount;
      } else {
        logCount++;
        document.getElementById('log-count').textContent = logCount;
      }
      
      const entry = document.createElement('div');
      entry.style.color = color;
      entry.style.marginBottom = '5px';
      entry.innerHTML = '[' + time + '] [' + level.toUpperCase() + '] ' + message;
      
      output.appendChild(entry);
      output.scrollTop = output.scrollHeight;
      
      if (output.children.length > 1000) {
        output.removeChild(output.children[0]);
      }
    }
    
    function fetchLatestLogs() {
      if (!monitoring) return;
      
      fetch('/debug/console/logs?limit=50', {
        headers: { 'Accept': 'application/json' }
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.logs.length > 0) {
          data.logs.slice(0, 5).reverse().forEach(log => {
            addToConsole(log.level, log.message, log.timestamp);
          });
        }
      })
      .catch(error => {
        config.smartLog('fail','Failed to fetch logs:', error);
      });
    }
    
    function clearMonitor() {
      document.getElementById('console-output').innerHTML = '<div style="color: #28a745;">Monitor cleared.</div>';
      logCount = 0;
      errorCount = 0;
      warnCount = 0;
      infoCount = 0;
      document.getElementById('log-count').textContent = '0';
      document.getElementById('error-count').textContent = '0';
      document.getElementById('warn-count').textContent = '0';
      document.getElementById('info-count').textContent = '0';
    }
    
    function toggleMonitoring() {
      monitoring = !monitoring;
      const btn = document.getElementById('toggleBtn');
      btn.textContent = monitoring ? 'Pause Monitoring' : 'Resume Monitoring';
      btn.className = monitoring ? 'button' : 'button secondary';
    }
  `;
  
  const html = createBaseLayout('Live Console Monitor - Debug Tools', content, '', additionalJS);
  res.send(html);
});

router.post('/clear', async (req, res) => {
  try {
    allConsoleLogs = [];
    consoleErrors = [];
    
    res.json({
      success: true,
      message: 'Console logs cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});



module.exports = {
  router,
  captureConsoleLog,
  createScrapingSession,
  endScrapingSession,
  generateSessionId,
  loadAllSessionsFromFiles,
  scrapingSessions,
  organizeLogsByDomain,
  loadScrapingErrorsByDomain
};
