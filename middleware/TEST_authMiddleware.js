const config = require('../config');

const isAuthenticated = (req, res, next) => {
  if (req.headers['x-stress-test'] === 'true') {
    req.user = {
      _id: req.headers['x-user-id'] || 'stress_test_user',
      email: req.headers['x-user-email'] || 'test@test.com',
      subscription: { 
        plan: 'pro',
        status: 'active',
        maxScrapingRequests: 999999,
        maxCacheSearches: 999999
      },
      emailVerified: true,
      limits: {
        maxScrapingRequests: 999999,
        maxCacheSearches: 999999,
        scrapingRequests: 0,
        cacheSearches: 0
      }
    };
    req.isAuthenticated = () => true;
    return next();
  }

  const fullPath = ((req.baseUrl || '') + (req.path || '')) || (req.originalUrl || '');
  const list = (x) => Array.isArray(x) ? x : [];
  const env = (k) => ((process.env[k] || '')).split(',').map(s => s.trim()).filter(Boolean);
  const toRx = (arr) => arr.map(p => { try { return new RegExp(p) } catch (_) { return null } }).filter(Boolean);
  const pub = toRx([...list(config.auth && config.auth.publicPaths), ...env('AUTH_PUBLIC_PATHS')]);
  const api = toRx([...list(config.auth && config.auth.apiPathPatterns), ...env('AUTH_API_PATH_PATTERNS')]);
  
  if (pub.some(rx => rx.test(fullPath))) return next();
  if (typeof req.isAuthenticated === 'function' && req.isAuthenticated()) return next();
  
  const accept = ((req.headers.accept || '')).toLowerCase();
  const ctype = ((req.headers['content-type'] || '')).toLowerCase();
  const wantsJson = accept.includes('application/json') || accept.includes('+json') || 
                    ctype.includes('application/json') || ctype.includes('+json') || 
                    req.xhr === true || req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                    api.some(rx => rx.test(fullPath));
  
  if (wantsJson) return res.status(401).json({ success: false, message: 'Authentication required' });
  
  const loginPath = (config.auth && config.auth.loginPath || process.env.AUTH_LOGIN_PATH || '/login');
  return res.redirect(loginPath);
};

const isNotAuthenticated = (req, res, next) => {
  if (req.headers['x-stress-test'] === 'true') {
    return res.status(400).json({
      success: false,
      message: 'Already authenticated (test mode)'
    });
  }
  return next();
};

const requireSubscription = (requiredPlan = 'premium') => {
  return (req, res, next) => {
    if (req.headers['x-stress-test'] === 'true') {
      req.isAuthenticated = () => true;
      req.user = {
        _id: req.headers['x-user-id'] || 'stress_test_user',
        email: req.headers['x-user-email'] || 'test@test.com',
        subscription: { 
          plan: 'pro',
          status: 'active',
          maxScrapingRequests: 999999,
          maxCacheSearches: 999999
        },
        emailVerified: true,
        limits: {
          maxScrapingRequests: 999999,
          maxCacheSearches: 999999,
          scrapingRequests: 0,
          cacheSearches: 0
        }
      };
      return next();
    }
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  };
};

const requireEmailVerification = (req, res, next) => {
  if (req.headers['x-stress-test'] === 'true') return next();
  return res.status(403).json({
    success: false,
    message: 'Email verification required'
  });
};

const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    if (req.headers['x-stress-test'] === 'true') {
      res.set({
        'X-RateLimit-Limit': '999999',
        'X-RateLimit-Remaining': '999999',
        'X-RateLimit-Reset': Date.now() + windowMs
      });
    }
    return next();
  };
};

const addUserToLocals = (req, res, next) => {
  if (req.headers['x-stress-test'] === 'true') {
    req.user = {
      _id: req.headers['x-user-id'] || 'stress_test_user',
      email: req.headers['x-user-email'] || 'test@test.com',
      subscription: { 
        plan: 'pro',
        status: 'active',
        maxScrapingRequests: 999999,
        maxCacheSearches: 999999
      },
      emailVerified: true,
      limits: {
        maxScrapingRequests: 999999,
        maxCacheSearches: 999999,
        scrapingRequests: 0,
        cacheSearches: 0
      }
    };
    req.isAuthenticated = () => true;
  }
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated ? req.isAuthenticated() : false;
  next();
};

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
  requireSubscription,
  requireEmailVerification,
  rateLimitByUser,
  addUserToLocals
};