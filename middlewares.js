const config = require('./config');
const express = require('express');

const setupMiddlewares = (app) => {
  const errorCaptureMiddleware = require('./middleware/errorCaptureMiddleware');
  
  app.use(errorCaptureMiddleware);
  config.smartLog('buffer', 'errorCapture:middleware:mounted');

  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('User-Agent') || 'unknown';
    const isStressTest = req.headers['x-stress-test'] === 'true';
    const userId = req.user?._id || req.headers['x-user-id'] || 'anonymous';
    
    const logEntry = `${timestamp} | ${req.method} ${req.url}`;
    
    if (isStressTest) {
      config.smartLog('stress', `${logEntry} | stress:${userId}`);
    } else {
      config.smartLog('buffer', `${logEntry} | ${userAgent.substring(0, 50)}`);
    }
    
    next();
  });

  app.use(express.static('public', {
    maxAge: config.static?.maxAge || '1d',
    etag: true,
    lastModified: true,
    index: false
  }));

  config.smartLog('buffer', 'middlewares:setup:complete');
};

module.exports = {
  setupMiddlewares
};