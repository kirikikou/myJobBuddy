const config = require('../config');
const AuthValidator = require('../security/AuthValidator');
const SecurityMiddleware = require('./SecurityMiddleware');

const isAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated()) {
    AuthValidator.recordFailedAttempt(req.ip, 'access');
    
    const isApiRequest = req.path.startsWith('/api') || 
                         req.headers['accept']?.includes('application/json') ||
                         req.headers['content-type']?.includes('application/json');
    
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        error: 'authentication_required',
        message: 'Authentication required'
      });
    }
    
    return res.redirect('/login');
  }

  const sessionValidation = AuthValidator.validateSession(req);
  if (!sessionValidation.valid) {
    config.smartLog('fail', 'Session validation failed', {
      sessionId: req.sessionID?.slice(-8),
      userId: req.user?._id?.toString().slice(-8),
      error: sessionValidation.error,
      ip: req.ip
    });
    
    req.logout((err) => {
      if (err) {
        config.smartLog('fail', 'Logout error during session validation', { error: err.message });
      }
    });
    
    const isApiRequest = req.path.startsWith('/api') || 
                         req.headers['accept']?.includes('application/json') ||
                         req.headers['content-type']?.includes('application/json');
    
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        error: 'session_invalid',
        message: 'Session validation failed'
      });
    }
    
    return res.redirect('/login');
  }

  AuthValidator.clearFailedAttempts(req.ip, 'access');
  next();
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
      error: 'already_authenticated',
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
        error: 'authentication_required',
        message: 'Authentication required'
      });
    }
    
    const permissionCheck = AuthValidator.validatePermissions(req.user, `plan:${requiredPlan}`);
    if (!permissionCheck.valid) {
      return res.status(403).json({
        success: false,
        error: 'insufficient_permissions',
        message: permissionCheck.error,
        currentPlan: req.user?.subscription?.plan || 'free',
        requiredPlan,
        details: permissionCheck
      });
    }
    
    const userPlan = req.user?.subscription?.plan || 'free';
    const planHierarchy = config.PLAN_HIERARCHY || { free: 0, standard: 1, premium: 2, pro: 3 };
    
    if ((planHierarchy[userPlan] || 0) < (planHierarchy[requiredPlan] || 999)) {
      return res.status(403).json({
        success: false,
        error: 'plan_upgrade_required',
        message: `${requiredPlan} subscription required`,
        currentPlan: userPlan,
        requiredPlan
      });
    }
    
    if (req.user?.subscription?.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'subscription_inactive',
        message: 'Active subscription required',
        subscriptionStatus: req.user.subscription?.status || 'unknown'
      });
    }
    
    next();
  };
};

const requireEmailVerification = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      error: 'authentication_required',
      message: 'Authentication required'
    });
  }
  
  if (!req.user?.emailVerified) {
    return res.status(403).json({
      success: false,
      error: 'email_verification_required',
      message: 'Email verification required'
    });
  }
  
  next();
};

const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const userId = req.user?._id?.toString() || req.sessionID || 'anonymous';
    const endpoint = req.route?.path || req.path;
    
    const rateLimitResult = AuthValidator.validateRateLimit(userId, endpoint, {
      windowMs,
      maxRequests
    });
    
    if (!rateLimitResult.valid) {
      SecurityMiddleware.logSecurityEvent('rate_limit_exceeded', {
        userId: userId.slice(-8),
        endpoint,
        current: rateLimitResult.current,
        max: rateLimitResult.max
      }, req);
      
      return res.status(429).json({
        success: false,
        error: 'rate_limit_exceeded',
        message: rateLimitResult.error,
        retryAfter: rateLimitResult.retryAfter,
        current: rateLimitResult.current,
        max: rateLimitResult.max
      });
    }
    
    res.set({
      'X-RateLimit-Remaining': rateLimitResult.remaining,
      'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
    });
    
    next();
  };
};

const checkAccountLocked = (req, res, next) => {
  const identifier = req.body?.email || req.ip;
  
  if (AuthValidator.isAccountLocked(identifier, 'login')) {
    SecurityMiddleware.logSecurityEvent('account_locked_access_attempt', {
      identifier: identifier.slice(-8),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }, req);
    
    return res.status(423).json({
      success: false,
      error: 'account_locked',
      message: 'Account temporarily locked due to multiple failed attempts',
      retryAfter: 15 * 60
    });
  }
  
  next();
};

const validateUserAgent = (req, res, next) => {
  const userAgent = req.get('User-Agent');
  
  if (!userAgent) {
    SecurityMiddleware.logSecurityEvent('missing_user_agent', {
      ip: req.ip,
      path: req.path
    }, req);
    
    return res.status(400).json({
      success: false,
      error: 'user_agent_required',
      message: 'User-Agent header is required'
    });
  }
  
  if (userAgent.length > 512) {
    SecurityMiddleware.logSecurityEvent('oversized_user_agent', {
      ip: req.ip,
      userAgentLength: userAgent.length
    }, req);
    
    return res.status(400).json({
      success: false,
      error: 'user_agent_invalid',
      message: 'User-Agent header is too long'
    });
  }
  
  const suspiciousPatterns = [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /masscan/i,
    /<script/i,
    /javascript:/i,
    /python/i,
    /curl/i,
    /wget/i
  ];
  
  if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
    SecurityMiddleware.logSecurityEvent('suspicious_user_agent', {
      ip: req.ip,
      userAgent: userAgent.slice(0, 100),
      path: req.path
    }, req);
    
    return res.status(400).json({
      success: false,
      error: 'user_agent_suspicious',
      message: 'User-Agent not allowed'
    });
  }
  
  next();
};

const requirePermission = (action, resource = null) => {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        error: 'authentication_required',
        message: 'Authentication required'
      });
    }
    
    const permissionCheck = AuthValidator.validatePermissions(req.user, action, resource);
    if (!permissionCheck.valid) {
      SecurityMiddleware.logSecurityEvent('permission_denied', {
        userId: req.user._id.toString().slice(-8),
        action,
        resource,
        error: permissionCheck.error
      }, req);
      
      return res.status(403).json({
        success: false,
        error: 'permission_denied',
        message: permissionCheck.error,
        required: permissionCheck.required,
        current: permissionCheck.current
      });
    }
    
    next();
  };
};

const addUserToLocals = (req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  
  if (req.user) {
    res.locals.userPlan = req.user.subscription?.plan || 'free';
    res.locals.emailVerified = req.user.emailVerified || false;
  }
  
  next();
};

const securityHeaders = (req, res, next) => {
  SecurityMiddleware.setSecurityHeaders(req, res, next);
};

const sanitizeInputs = (req, res, next) => {
  SecurityMiddleware.sanitizeInput(req, res, next);
};

const detectMaliciousInput = (req, res, next) => {
  SecurityMiddleware.detectMaliciousInput(req, res, next);
};

const createCSRFProtection = () => {
  const csrf = require('csrf');
  const tokens = new csrf();
  
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    
    if (!req.session) {
      return res.status(500).json({
        success: false,
        error: 'session_required',
        message: 'Session is required for CSRF protection'
      });
    }
    
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = tokens.secretSync();
    }
    
    const token = req.body._csrf || req.query._csrf || req.get('X-CSRF-Token');
    
    if (!token) {
      SecurityMiddleware.logSecurityEvent('csrf_token_missing', {
        ip: req.ip,
        path: req.path,
        method: req.method
      }, req);
      
      return res.status(403).json({
        success: false,
        error: 'csrf_token_required',
        message: 'CSRF token is required'
      });
    }
    
    if (!tokens.verify(req.session.csrfSecret, token)) {
      SecurityMiddleware.logSecurityEvent('csrf_token_invalid', {
        ip: req.ip,
        path: req.path,
        method: req.method
      }, req);
      
      return res.status(403).json({
        success: false,
        error: 'csrf_token_invalid',
        message: 'Invalid CSRF token'
      });
    }
    
    next();
  };
};

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
  requireSubscription,
  requireEmailVerification,
  rateLimitByUser,
  checkAccountLocked,
  validateUserAgent,
  requirePermission,
  addUserToLocals,
  securityHeaders,
  sanitizeInputs,
  detectMaliciousInput,
  createCSRFProtection
};