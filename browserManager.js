const { chromium } = require('playwright');
const config = require('./config');
const loggingService = require('./services/LoggingService');

let browserInstance = null;

const initBrowser = async () => {
  if (browserInstance) {
    return browserInstance;
  }
  
  loggingService.service('BrowserManager', 'initializing');
  
  const browser = await chromium.launch({
    headless: false,
    args: config.playwrightArgs,
    timeout: 60000
  });
  
  browserInstance = browser;
  return browser;
};

const shutdownBrowser = async () => {
  if (browserInstance) {
    loggingService.service('BrowserManager', 'shutting-down');
    await browserInstance.close();
    browserInstance = null;
  }
};

module.exports = {
  initBrowser,
  shutdownBrowser,
  getBrowserInstance: () => browserInstance
};