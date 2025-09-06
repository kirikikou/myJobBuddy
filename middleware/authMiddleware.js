const config = require('../config');

const detectApiRequest = (req) => {
  const apiPaths = ['/api/', '/plan/', '/email-limits/'];
  const pathMatch = apiPaths.some(path => req.path.startsWith(path));
  const acceptHeader = req.headers['accept']?.includes('application/json');
  const contentTypeHeader = req.headers['content-type']?.includes('application/json');
  const xmlHttpRequest = req.headers['x-requested-with'] === 'XMLHttpRequest';
  
  return pathMatch || acceptHeader || contentTypeHeader || xmlHttpRequest;
};

const hydrateUser = (req) => {
  if (req.user && req.user._id && req.isAuthenticated && req.isAuthenticated()) {
    config.smartLog('gate', `User hydrated - id: ${req.user._id.toString().slice(-8)}`);
    return true;
  }
  return false;
};

const apiOnlyAuth = (req, res, next) => {
  const isApiRequest = detectApiRequest(req);
  
  if (!isApiRequest) {
    return next();
  }
  
  const isAuthenticatedByPassport = req.isAuthenticated();
  const hasValidUser = req.user && req.user._id;
  
  if (!isAuthenticatedByPassport || !hasValidUser) {
    config.smartLog('gate', `API auth failed - passport: ${isAuthenticatedByPassport}, user: ${!!req.user}, userId: ${req.user?._id ? 'present' : 'missing'}, path: ${req.path}`);
    
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      reason: !isAuthenticatedByPassport ? 'not_authenticated' : 'user_data_missing'
    });
  }
  
  const userHydrated = hydrateUser(req);
  if (userHydrated) {
    config.smartLog('gate', `API auth success - user: ${req.user._id.toString().slice(-8)}, path: ${req.path}`);
  }
  
  next();
};

const isAuthenticated = (req, res, next) => {
  const isAuthenticatedByPassport = req.isAuthenticated();
  const hasValidUser = req.user && req.user._id;
  
  if (!isAuthenticatedByPassport || !hasValidUser) {
    config.smartLog('fail', `Authentication failed - passport: ${isAuthenticatedByPassport}, user: ${!!req.user}, userId: ${req.user?._id ? 'present' : 'missing'}`);
    
    const isApiRequest = detectApiRequest(req);
    
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        reason: !isAuthenticatedByPassport ? 'not_authenticated' : 'user_data_missing'
      });
    }
    
    res.redirect('/login');
    return;
  }
  
  hydrateUser(req);
  config.smartLog('win', `Authentication success - user: ${req.user._id.toString().slice(-8)}`);
  next();
};

const isNotAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return next();
  }
  
  const isApiRequest = detectApiRequest(req);
  
  if (isApiRequest) {
    return res.status(400).json({
      success: false,
      error: 'Already authenticated'
    });
  }
  
  res.redirect('/');
};

const requireSubscription = (requiredPlan = 'premium') => {
  return (req, res, next) => {
    if (!req.isAuthenticated() || !req.user || !req.user._id) {
      config.smartLog('fail', `Subscription check failed - no valid user`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const userPlan = req.user?.subscription?.plan || 'free';
    const planHierarchy = config.PLAN_HIERARCHY || { free: 0, standard: 1, premium: 2, pro: 3 };
    
    if ((planHierarchy[userPlan] || 0) < (planHierarchy[requiredPlan] || 999)) {
      config.smartLog('fail', `Subscription insufficient - user: ${userPlan}, required: ${requiredPlan}`);
      return res.status(403).json({
        success: false,
        error: `${requiredPlan} subscription required`,
        currentPlan: userPlan,
        requiredPlan
      });
    }
    
    if (req.user?.subscription?.status !== 'active') {
      config.smartLog('fail', `Subscription inactive - status: ${req.user.subscription?.status}`);
      return res.status(403).json({
        success: false,
        error: 'Active subscription required',
        subscriptionStatus: req.user.subscription?.status || 'unknown'
      });
    }
    
    next();
  };
};

const requireEmailVerification = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user || !req.user._id) {
    config.smartLog('fail', `Email verification check failed - no valid user`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
  
  if (!req.user?.emailVerified) {
    config.smartLog('fail', `Email not verified - user: ${req.user._id.toString().slice(-8)}`);
    return res.status(403).json({
      success: false,
      error: 'Email verification required'
    });
  }
  
  next();
};

const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();
  
  setInterval(() => {
    const now = Date.now();
    for (const [userId, requests] of userRequests.entries()) {
      const filtered = requests.filter(timestamp => timestamp > now - windowMs);
      if (filtered.length === 0) {
        userRequests.delete(userId);
      } else {
        userRequests.set(userId, filtered);
      }
    }
  }, windowMs);
  
  return (req, res, next) => {
    if (!req.isAuthenticated() || !req.user || !req.user._id) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }
    
    const requests = userRequests.get(userId);
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      config.smartLog('fail', `Rate limit exceeded - user: ${userId.slice(-8)}, requests: ${recentRequests.length}/${maxRequests}`);
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }
    
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);
    
    next();
  };
};

const addUserToLocals = (req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated() && req.user && req.user._id;
  next();
};

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
  apiOnlyAuth,
  requireSubscription,
  requireEmailVerification,
  rateLimitByUser,
  addUserToLocals,
  detectApiRequest,
  hydrateUser
};