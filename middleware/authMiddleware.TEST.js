// MOCK AUTH POUR STRESS TESTS - NE PAS UTILISER EN PRODUCTION
const isAuthenticated = (req, res, next) => {
  if (req.headers['x-stress-test'] === 'true') {
    req.isAuthenticated = () => true;
    req.user = {
      _id: req.headers['x-user-id'] || 'stress_test_user',
      email: req.headers['x-user-email'] || 'test@test.com',
      subscription: { 
        plan: 'theSentinel',
        status: 'active',
        maxScrapingRequests: 999999,
        maxCacheSearches: 999999
      },
      emailVerified: true,
      // Ajout des limites pour bypasser userPreferencesManager
      limits: {
        maxScrapingRequests: 999999,
        maxCacheSearches: 999999,
        scrapingRequests: 0,
        cacheSearches: 0
      }
    };
    return next();
  }
  
  if (req.xhr || req.headers['content-type'] === 'application/json') {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  res.redirect('/login');
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
      message: 'Authentication required (test mode)'
    });
  };
};

const requireEmailVerification = (req, res, next) => {
  if (req.headers['x-stress-test'] === 'true') return next();
  return res.status(403).json({
    success: false,
    message: 'Email verification required (test mode)'
  });
};

// IMPORTANT: Désactiver complètement le rate limiting pour les tests
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    // Bypass complet pour les stress tests
    if (req.headers['x-stress-test'] === 'true') {
      return next();
    }
    // Pour les autres, on laisse passer aussi temporairement
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