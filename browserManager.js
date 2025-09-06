const { chromium } = require('playwright');
const config = require('./config');

// Une seule instance de navigateur pour toutes les recherches
let browserInstance = null;

// Initialiser le navigateur (une seule fois)
const initBrowser = async () => {
  if (browserInstance) {
    return browserInstance;
  }
  
  config.smartLog('buffer','Initialisation du navigateur...');
  
  const browser = await chromium.launch({
    headless: false,
    args: config.playwrightArgs,
    timeout: 60000
  });
  
  browserInstance = browser;
  return browser;
};

// Fonction pour arrêter proprement le navigateur
const shutdownBrowser = async () => {
  if (browserInstance) {
    config.smartLog('buffer','Fermeture du navigateur...');
    await browserInstance.close();
    browserInstance = null;
  }
};

module.exports = {
  initBrowser,
  shutdownBrowser,
  getBrowserInstance: () => browserInstance
};