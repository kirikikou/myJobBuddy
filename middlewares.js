const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const loggingService = require('./services/LoggingService');

const setupMiddlewares = (app) => {
  app.use(cors());
  
  app.use(bodyParser.json({ limit: '10mb' }));
  
  app.use((req, res, next) => {
    loggingService.service('Middleware', 'request', { method: req.method, url: req.url, timestamp: new Date().toISOString() });
    next();
  });
};

module.exports = {
  setupMiddlewares
};