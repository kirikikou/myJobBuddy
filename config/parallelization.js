const loggingService = require('../services/LoggingService');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let config;

if (IS_PRODUCTION) {
  config = require('./parallelization-server');
  loggingService.service('Parallelization', 'config-selected', { type: 'SERVER', description: 'fixed limits' });
} else {
  config = require('./parallelization-local');
  loggingService.service('Parallelization', 'config-selected', { type: 'LOCAL', description: 'dynamic presets' });
}

module.exports = config;