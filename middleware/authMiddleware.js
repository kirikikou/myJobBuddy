const config = require('../config');

const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  const isApiRequest = req.path.startsWith('/api') || 
                       req.headers['accept']?.includes('application/json') ||
                       req.headers['content-type']?.includes('application/json');
  
  if (isApiRequest) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  res.redirect('/login');
};

const isNotAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return next();
  }
  
  const isApiRequest = req.path.startsWith('/api') || 
                       req.headers['accept']?.includes('application/json') ||
                       req.headers['content-type']?.includes('application/json');
  
  if (isApiRequest) {
    return res.status(400).json({
      success: false,
      message: 'Already authenticated'
    });
  }
  
  res.redirect('/');
};

const requireSubscription = (requiredPlan = 'premium') => {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const userPlan = req.user?.subscription?.plan || 'free';
    const planHierarchy = config.PLAN_HIERARCHY || { free: 0, standard: 1, premium: 2, pro: 3 };
    
    if ((planHierarchy[userPlan] || 0) < (planHierarchy[requiredPlan] || 999)) {
      return res.status(403).json({
        success: false,
        message: `${requiredPlan} subscription required`,
        currentPlan: userPlan,
        requiredPlan
      });
    }
    
    if (req.user?.subscription?.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required',
        subscriptionStatus: req.user.subscription.status
      });
    }
    
    next();
  };
};

const requireEmailVerification = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  if (!req.user?.emailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required'
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
    if (!req.isAuthenticated()) {
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
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
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
  res.locals.isAuthenticated = req.isAuthenticated();
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