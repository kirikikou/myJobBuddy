const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

let scrapingSessions = new Map();
let currentSessionId = null;
let userEmailCache = new Map();
let fileWriteLocks = new Map();

const generateSessionId = (userId, searchQuery, startTime) => {
  const cleanUserId = String(userId).replace(/[^a-zA-Z0-9]/g, '_');
  const cleanQuery = String(searchQuery).replace(/[^a-zA-Z0-9]/g, '_');
  const sessionId = `session_${cleanUserId}_${cleanQuery}_${startTime}`;
  config.smartLog('buffer','[SESSION] Generated sessionId:', sessionId);
  return sessionId;
};

const getUserEmailFromMongoDB = async (userId) => {
  try {
    if (userEmailCache.has(userId)) {
      return userEmailCache.get(userId);
    }

    const User = require('./models/User');
    const user = await User.findById(userId);
    
    if (user) {
      userEmailCache.set(userId, user.email);
      return user.email;
    }
    
    return null;
  } catch (error) {
    config.smartLog('fail',`Failed to get user email for ${userId}:`, error.message);
    return null;
  }
};

const getUserInfoFromMongoDB = async (userId) => {
  try {
    const User = require('./models/User');
    const user = await User.findById(userId);
    
    if (user) {
      return {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        subscription: user.subscription,
        lastLogin: user.lastLogin
      };
    }
    
    return null;
  } catch (error) {
    config.smartLog('fail',`Failed to get user info for ${userId}:`, error.message);
    return null;
  }
};

const findUserByEmail = async (email) => {
  try {
    const User = require('./models/User');
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (user) {
      return {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        subscription: user.subscription,
        lastLogin: user.lastLogin
      };
    }
    
    return null;
  } catch (error) {
    config.smartLog('fail',`Failed to find user by email ${email}:`, error.message);
    return null;
  }
};

const validateJsonContent = (content) => {
  if (!content || content.trim() === '') {
    return { isValid: false, data: [] };
  }
  
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return { isValid: true, data: parsed };
    } else {
      config.smartLog('buffer','JSON content is not an array, initializing empty array');
      return { isValid: false, data: [] };
    }
  } catch (error) {
    config.smartLog('fail','Invalid JSON content:', error.message);
    return { isValid: false, data: [] };
  }
};

const readSessionFileWithValidation = async (sessionFile) => {
  try {
    const content = await fs.readFile(sessionFile, 'utf8');
    const validation = validateJsonContent(content);
    
    if (!validation.isValid) {
      config.smartLog('buffer',`Session file ${sessionFile} is corrupted, creating backup and starting fresh`);
      
      const backupFile = `${sessionFile}.corrupted.${Date.now()}`;
      try {
        await fs.writeFile(backupFile, content);
        config.smartLog('buffer',`Corrupted file backed up to: ${backupFile}`);
      } catch (backupError) {
        config.smartLog('fail','Failed to create backup of corrupted file:', backupError.message);
      }
      
      return [];
    }
    
    return validation.data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    
    config.smartLog('fail',`Error reading session file ${sessionFile}:`, error.message);
    return [];
  }
};

const acquireFileLock = async (filePath) => {
  const lockKey = filePath;
  
  while (fileWriteLocks.has(lockKey)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  fileWriteLocks.set(lockKey, Date.now());
};

const releaseFileLock = (filePath) => {
  const lockKey = filePath;
  fileWriteLocks.delete(lockKey);
};

const writeSessionFileAtomically = async (sessionFile, sessions) => {
  const tempFile = `${sessionFile}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const jsonContent = JSON.stringify(sessions, null, 2);
    
    const validation = validateJsonContent(jsonContent);
    if (!validation.isValid) {
      throw new Error('Generated JSON content is invalid');
    }
    
    await fs.writeFile(tempFile, jsonContent, 'utf8');
    
    try {
      await fs.stat(tempFile);
    } catch (statError) {
      throw new Error(`Temporary file was not created successfully: ${statError.message}`);
    }
    
    await fs.rename(tempFile, sessionFile);
    
    return true;
  } catch (error) {
    try {
      await fs.unlink(tempFile);
    } catch (cleanupError) {
    }
    
    throw error;
  }
};

const loadSessionsFromFiles = async () => {
  try {
    const debugDir = config.DEBUG_DIR;
    
    try {
      await fs.access(debugDir);
    } catch (error) {
      config.smartLog('buffer',`Debug directory does not exist, creating: ${debugDir}`);
      await fs.mkdir(debugDir, { recursive: true });
    }
    
    const files = await fs.readdir(debugDir);
    const sessionFiles = files.filter(file => file.startsWith('scraping-sessions-') && file.endsWith('.json'));
    
    config.smartLog('buffer',`Loading sessions from ${sessionFiles.length} files`);
    
    for (const file of sessionFiles) {
      try {
        const filePath = path.join(debugDir, file);
        const sessions = await readSessionFileWithValidation(filePath);
        
        for (const session of sessions) {
          if (!scrapingSessions.has(session.id)) {
            if (!session.userEmail && session.userId) {
              session.userEmail = await getUserEmailFromMongoDB(session.userId);
            }
            scrapingSessions.set(session.id, session);
          }
        }
        
        config.smartLog('buffer',`Loaded ${sessions.length} sessions from ${file}`);
      } catch (error) {
        config.smartLog('fail',`Failed to load session file ${file}:`, error.message);
      }
    }
    
    config.smartLog('buffer',`Total sessions loaded: ${scrapingSessions.size}`);
  } catch (error) {
    config.smartLog('fail','Failed to load sessions from files:', error.message);
  }
};

const getAllSessions = async (filters = {}) => {
  await loadSessionsFromFiles();
  
  let sessions = Array.from(scrapingSessions.values());
  
  config.smartLog('buffer',`getAllSessions: Starting with ${sessions.length} total sessions`);
  config.smartLog('buffer',`Filters:`, filters);
  
  if (filters.status) {
    sessions = sessions.filter(session => session.status === filters.status);
    config.smartLog('buffer',`After status filter (${filters.status}): ${sessions.length} sessions`);
  }
  
  if (filters.userId) {
    sessions = sessions.filter(session => 
      session.userId && session.userId.toLowerCase().includes(filters.userId.toLowerCase())
    );
    config.smartLog('buffer',`After userId filter (${filters.userId}): ${sessions.length} sessions`);
  }
  
  if (filters.userEmail) {
    const userByEmail = await findUserByEmail(filters.userEmail);
    
    sessions = sessions.filter(session => {
      const emailMatch = session.userEmail && session.userEmail.toLowerCase().includes(filters.userEmail.toLowerCase());
      const userIdMatch = userByEmail && session.userId === userByEmail._id.toString();
      return emailMatch || userIdMatch;
    });
    
    config.smartLog('buffer',`After userEmail filter (${filters.userEmail}): ${sessions.length} sessions`);
    
    if (userByEmail) {
      config.smartLog('buffer',`Found user in MongoDB: ${userByEmail.email} (ID: ${userByEmail._id})`);
    }
  }
  
  const sortedSessions = sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  config.smartLog('buffer',`Returning ${sortedSessions.length} filtered sessions`);
  
  return sortedSessions;
};

const getSessionById = async (sessionId) => {
  await loadSessionsFromFiles();
  return scrapingSessions.get(sessionId);
};

const organizeLogsByDomain = (logs) => {
  const domainLogs = {};
  
  logs.forEach(log => {
    if (log.url) {
      try {
        const domain = new URL(log.url).hostname;
        if (!domainLogs[domain]) {
          domainLogs[domain] = [];
        }
        domainLogs[domain].push(log);
      } catch (error) {
        if (!domainLogs['invalid-urls']) {
          domainLogs['invalid-urls'] = [];
        }
        domainLogs['invalid-urls'].push(log);
      }
    } else {
      if (!domainLogs['general']) {
        domainLogs['general'] = [];
      }
      domainLogs['general'].push(log);
    }
  });
  
  Object.keys(domainLogs).forEach(domain => {
    domainLogs[domain].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  });
  
  return domainLogs;
};

const getSessionLogsByDomain = async (sessionId) => {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }
  
  return {
    session: session,
    logsByDomain: organizeLogsByDomain(session.logs),
    domainSummary: getDomainSummary(session.logs)
  };
};

const getDomainSummary = (logs) => {
  const domainStats = {};
  
  logs.forEach(log => {
    let domain = 'general';
    if (log.url) {
      try {
        domain = new URL(log.url).hostname;
      } catch (error) {
        domain = 'invalid-urls';
      }
    }
    
    if (!domainStats[domain]) {
      domainStats[domain] = {
        total: 0,
        errors: 0,
        warnings: 0,
        successes: 0,
        lastActivity: null
      };
    }
    
    domainStats[domain].total++;
    
    if (log.level === 'error') {
      domainStats[domain].errors++;
    } else if (log.level === 'warn') {
      domainStats[domain].warnings++;
    } else if (log.message.includes('✅') || log.message.includes('Successfully') || log.message.includes('Cache hit')) {
      domainStats[domain].successes++;
    }
    
    if (!domainStats[domain].lastActivity || new Date(log.timestamp) > new Date(domainStats[domain].lastActivity)) {
      domainStats[domain].lastActivity = log.timestamp;
    }
  });
  
  return domainStats;
};

const startSession = async (userId, userEmail, searchQuery, urls = [], req = null) => {
  const sessionId = generateSessionId(userId, searchQuery, Date.now());
  
  if (!userEmail && userId) {
    userEmail = await getUserEmailFromMongoDB(userId);
  }
  
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
    userAgent: req ? req.get('User-Agent') : null,
    ipAddress: req ? req.ip || req.connection.remoteAddress : null,
    duration: null
  };
  
  config.smartLog('buffer',`Creating session for user: ${userId} (${userEmail}) with ${urls.length} URLs`);
  
  scrapingSessions.set(sessionId, session);
  currentSessionId = sessionId;
  await saveSessionToFile(session);
  
  return sessionId;
};

const endSession = async (sessionId, status = 'completed') => {
  const session = scrapingSessions.get(sessionId);
  if (session) {
    session.endTime = new Date().toISOString();
    session.status = status;
    session.duration = new Date(session.endTime) - new Date(session.startTime);
    await saveSessionToFile(session);
    
    config.smartLog('buffer',`Session ${sessionId} ended with status: ${status}`);
  }
  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }
  return session;
};

const getSessionInfo = (sessionId) => {
  return scrapingSessions.get(sessionId);
};

const getAllActiveSessions = () => {
  return Array.from(scrapingSessions.values()).filter(session => session.status === 'running');
};

const getSessionsByUser = (userId) => {
  return Array.from(scrapingSessions.values()).filter(session => session.userId === userId);
};

const forceEndUserSessions = (userId, reason = 'force_ended') => {
  let count = 0;
  for (const [sessionId, session] of scrapingSessions.entries()) {
    if (session.userId === userId && session.status === 'running') {
      endSession(sessionId, reason);
      count++;
    }
  }
  return count;
};

const forceEndAllSessions = (reason = 'forced_end') => {
  let count = 0;
  for (const [sessionId, session] of scrapingSessions.entries()) {
    if (session.status === 'running') {
      endSession(sessionId, reason);
      count++;
    }
  }
  return count;
};

const getSessionStats = async () => {
  await loadSessionsFromFiles();
  const sessions = Array.from(scrapingSessions.values());
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter(s => s.status === 'running').length;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const failedSessions = sessions.filter(s => s.status === 'failed').length;
  
  return {
    totalSessions: totalSessions,
    runningCount: activeSessions,
    completedCount: completedSessions,
    failedCount: failedSessions,
    uniqueUsers: [...new Set(sessions.map(s => s.userId))].length,
    total: totalSessions,
    active: activeSessions,
    completed: completedSessions,
    failed: failedSessions,
    users: [...new Set(sessions.map(s => s.userId))].length
  };
};

const getDebugInfo = async (userId = null, userEmail = null) => {
  await loadSessionsFromFiles();
  
  let userInfo = null;
  let sessions = [];
  
  if (userId) {
    userInfo = await getUserInfoFromMongoDB(userId);
    sessions = Array.from(scrapingSessions.values()).filter(s => s.userId === userId);
  } else if (userEmail) {
    userInfo = await findUserByEmail(userEmail);
    if (userInfo) {
      userId = userInfo._id.toString();
      sessions = Array.from(scrapingSessions.values()).filter(s => 
        s.userId === userId || (s.userEmail && s.userEmail.toLowerCase() === userEmail.toLowerCase())
      );
    }
  }
  
  return {
    userInfo,
    sessions,
    sessionCount: sessions.length,
    totalSessionsInMemory: scrapingSessions.size,
    userEmailCache: Array.from(userEmailCache.entries())
  };
};

const logProgress = (sessionId, url, message, level = 'info') => {
  const session = scrapingSessions.get(sessionId);
  if (session) {
    const logEntry = {
      id: Date.now() + Math.random(),
      level: level,
      message: message,
      url: url,
      timestamp: new Date().toISOString(),
      sessionId: sessionId
    };
    
    session.logs.push(logEntry);
    
    if (level === 'error') session.errorCount++;
    else if (level === 'warn') session.warningCount++;
    
    if (message.includes('Successfully') || message.includes('Cache hit') || message.includes('✅')) {
      session.successCount++;
      session.processedUrls++;
    } else if (message.includes('Error') || message.includes('Failed') || message.includes('❌')) {
      session.processedUrls++;
    }
    
    saveSessionToFile(session).catch(error => {
      config.smartLog('fail','Failed to save session after logging:', error.message);
    });
  }
};

const logSuccess = (sessionId, url, message) => {
  logProgress(sessionId, url, `✅ ${message}`, 'info');
};

const logError = (sessionId, url, message, error = null) => {
  const fullMessage = error ? `❌ ${message}: ${error.message}` : `❌ ${message}`;
  logProgress(sessionId, url, fullMessage, 'error');
};

const logWarning = (sessionId, url, message) => {
  logProgress(sessionId, url, `⚠️ ${message}`, 'warn');
};

const logUserAction = (sessionId, action, data = {}) => {
  logProgress(sessionId, null, `User action: ${action} - ${JSON.stringify(data)}`, 'info');
};

const logCacheHit = (sessionId, url) => {
  logProgress(sessionId, url, 'Cache hit - using cached data', 'info');
};

const logCacheMiss = (sessionId, url) => {
  logProgress(sessionId, url, 'Cache miss - fresh scraping required', 'info');
};

const logScrapingStart = (sessionId, url, method) => {
  logProgress(sessionId, url, `Starting scraping with ${method}`, 'info');
};

const logScrapingComplete = (sessionId, url, linksCount, duration) => {
  logProgress(sessionId, url, `Scraping completed: ${linksCount} links found in ${duration}ms`, 'info');
};

const logScrapingFailed = (sessionId, url, reason) => {
  logProgress(sessionId, url, `Scraping failed: ${reason}`, 'error');
};

const logJobsFound = (sessionId, url, jobCount, totalLinks) => {
  logProgress(sessionId, url, `Jobs found: ${jobCount}/${totalLinks} job postings`, 'info');
};

const logRetry = (sessionId, url, attempt, maxRetries) => {
  logProgress(sessionId, url, `Retry attempt ${attempt}/${maxRetries}`, 'warn');
};

const logTechnicalDetails = (sessionId, url, details) => {
  const detailsStr = Object.entries(details).map(([key, value]) => `${key}:${value}`).join(', ');
  logProgress(sessionId, url, `Technical details: ${detailsStr}`, 'info');
};

const logDetectionBypass = (sessionId, url, method) => {
  logProgress(sessionId, url, `Detection bypass using: ${method}`, 'info');
};

const saveSessionToFile = async (session) => {
  const sessionFile = path.join(config.DEBUG_DIR, `scraping-sessions-${new Date().toISOString().split('T')[0]}.json`);
  
  try {
    await acquireFileLock(sessionFile);
    
    const existingSessions = await readSessionFileWithValidation(sessionFile);
    
    const sessionIndex = existingSessions.findIndex(s => s.id === session.id);
    if (sessionIndex !== -1) {
      existingSessions[sessionIndex] = session;
    } else {
      existingSessions.unshift(session);
    }
    
    if (existingSessions.length > 1000) {
      existingSessions.splice(1000);
    }
    
    await writeSessionFileAtomically(sessionFile, existingSessions);
    
  } catch (error) {
    config.smartLog('fail',`Failed to save session ${session.id}:`, error.message);
    
    const backupFile = path.join(config.DEBUG_DIR, `session-backup-${session.id}-${Date.now()}.json`);
    try {
      await fs.writeFile(backupFile, JSON.stringify(session, null, 2));
      config.smartLog('buffer',`Session saved to backup file: ${backupFile}`);
    } catch (backupError) {
      config.smartLog('fail','Failed to create session backup:', backupError.message);
    }
  } finally {
    releaseFileLock(sessionFile);
  }
};

const withSession = (sessionId) => {
  return {
    logProgress: (url, message, level = 'info') => logProgress(sessionId, url, message, level),
    logSuccess: (url, message) => logSuccess(sessionId, url, message),
    logError: (url, message, error) => logError(sessionId, url, message, error),
    logWarning: (url, message) => logWarning(sessionId, url, message),
    logUserAction: (action, data) => logUserAction(sessionId, action, data),
    logCacheHit: (url) => logCacheHit(sessionId, url),
    logCacheMiss: (url) => logCacheMiss(sessionId, url),
    logScrapingStart: (url, method) => logScrapingStart(sessionId, url, method),
    logScrapingComplete: (url, linksCount, duration) => logScrapingComplete(sessionId, url, linksCount, duration),
    logScrapingFailed: (url, reason) => logScrapingFailed(sessionId, url, reason),
    logJobsFound: (url, jobCount, totalLinks) => logJobsFound(sessionId, url, jobCount, totalLinks),
    logRetry: (url, attempt, maxRetries) => logRetry(sessionId, url, attempt, maxRetries),
    logTechnicalDetails: (url, details) => logTechnicalDetails(sessionId, url, details),
    logDetectionBypass: (url, method) => logDetectionBypass(sessionId, url, method)
  };
};

const updateSessionResults = (sessionId, results) => {
  const session = scrapingSessions.get(sessionId);
  if (session) {
    session.results = results;
    session.updatedAt = new Date().toISOString();
  }
};


module.exports = {
  sessionManager: {
    startSession,
    endSession,
    getSessionInfo,
    getAllActiveSessions,
    getSessionsByUser,
    forceEndUserSessions,
    forceEndAllSessions,
    getSessionStats,
    getAllSessions,
    getSessionById,
    getSessionLogsByDomain,
    organizeLogsByDomain,
    getDomainSummary,
    loadSessionsFromFiles,
    getUserEmailFromMongoDB,
    getUserInfoFromMongoDB,
    findUserByEmail,
    getDebugInfo,
    logProgress,
    logSuccess,
    logError,
    logWarning,
    logUserAction,
    logCacheHit,
    logCacheMiss,
    logScrapingStart,
    logScrapingComplete,
    logScrapingFailed,
    logJobsFound,
    logRetry,
    logTechnicalDetails,
    logDetectionBypass, 
    updateSessionResults
  },
  withSession
};