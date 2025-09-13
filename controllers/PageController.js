const path = require('path');
const serverConfig = require('../config/server');

class PageController {
  static renderHomepage(req, res) {
    if (req.isAuthenticated()) {
      return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, '../', serverConfig.PATHS.PUBLIC_DIR, 'homepage.html'));
  }

  static renderApp(req, res) {
    if (!req.isAuthenticated()) {
      return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, '../', serverConfig.PATHS.PUBLIC_DIR, 'index.html'));
  }

  static renderLogin(req, res) {
    if (req.isAuthenticated()) {
      return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, '../', serverConfig.PATHS.PUBLIC_DIR, 'login.html'));
  }

  static renderRegister(req, res) {
    if (req.isAuthenticated()) {
      return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, '../', serverConfig.PATHS.PUBLIC_DIR, 'register.html'));
  }

  static renderPricing(req, res) {
    res.sendFile(path.join(__dirname, '../', serverConfig.PATHS.PUBLIC_DIR, 'pricing.html'));
  }

  static renderForgotPassword(req, res) {
    if (req.isAuthenticated()) {
      return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, '../', serverConfig.PATHS.PUBLIC_DIR, 'forgot-password.html'));
  }
}

module.exports = PageController;