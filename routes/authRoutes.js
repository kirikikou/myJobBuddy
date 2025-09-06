const config = require('../config');
const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { isAuthenticated, isNotAuthenticated } = require('../middleware/authMiddleware');
const userPreferencesManager = require('../userPreferencesManager');
const queueGate = require('../middleware/queueGate');

const crypto = require('crypto');

const resetTokens = new Map();

const router = express.Router();

router.use(queueGate);
config.smartLog('buffer', 'queue-gate:router-mounted:auth');

router.post('/register', isNotAuthenticated, async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    const language = 'en';
    const plan = 'free';

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }
    
    const validPlans = ['free', 'standard', 'premium'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription plan'
      });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      preferences: { language },
      subscription: {
        plan: plan,
        status: 'active',
        startDate: new Date(),
        endDate: plan === 'free' ? null : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      }
    });
    
    await user.save();
    
    const initialPreferences = {
      userId: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      jobTitles: [],
      locations: [],
      careerPages: [],
      companies: {},
      applications: [],
      coverLetters: {},
      links: {},
      linktrees: {},
      profileComments: ["", "", "", ""],
      profileLinks: Array(10).fill(""),
      lastUsed: new Date().toISOString(),
      cvs: {},
      profile: {},
      settings: {
        reminderSettings: {
          reminder15Days: true,
          reminder30Days: true
        },
        appearance: {
          theme: "dark"
        },
        popupNotifications: {
          template: "discrete",
          types: {
            searchComplete: true,
            jobMatch: true,
            reminder15: true,
            reminder30: true
          }
        }
      },
      dashboardWidgets: {},
      jobSearchData: {
        lastSearchResults: [],
        lastSearchDate: null,
        selectedSite: "career-pages"
      },
      careerPageLists: {
        listA: [],
        listB: [],
        listC: [],
        listD: [],
        listE: []
      },
      currentActiveList: "listA",
      showFavoritesInCareerList: true
    };
    
    await userPreferencesManager.saveUserPreferences(user._id.toString(), initialPreferences);
    
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Registration successful but login failed'
        });
      }
      
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        user: user.toSafeObject(),
        redirectUrl: '/app'
      });
    });
    
  } catch (error) {
    config.smartLog('fail','Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

router.post('/login', isNotAuthenticated, (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: info.message || 'Invalid credentials'
      });
    }
    
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Login failed'
        });
      }
      
      res.json({
        success: true,
        message: 'Login successful',
        user: user.toSafeObject()
      });
    });
  })(req, res, next);
});

router.post('/logout', isAuthenticated, (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Session destruction failed'
        });
      }
      
      res.clearCookie('connect.sid');
      res.json({
        success: true,
        message: 'Logout successful'
      });
    });
  });
});

const resetTokensStorage = {};

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        success: false,
        message: 'No account found with this email'
      });
    }
    
    const token = crypto.randomInt(100000, 999999).toString();
    const expiry = Date.now() + 3600000;
    
    resetTokensStorage[email] = {
      token: token,
      userId: user._id.toString(),
      expiry: expiry
    };
    
    res.json({
      success: true,
      message: 'Reset code generated',
      token: token
    });
  } catch (error) {
    config.smartLog('fail','Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request'
    });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    
    const resetData = resetTokensStorage[email];
    if (!resetData || resetData.token !== token || resetData.expiry < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }
    
    const user = await User.findById(resetData.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    user.password = newPassword;
    await user.save();
    
    delete resetTokensStorage[email];
    
    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    config.smartLog('fail','Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

router.get('/me', isAuthenticated, (req, res) => {
  res.json({
    success: true,
    user: req.user.toSafeObject()
  });
});

router.put('/me', isAuthenticated, async (req, res) => {
  try {
    const { firstName, lastName, preferences } = req.body;
    const userId = req.user._id;
    
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (preferences) updateData.preferences = { ...req.user.preferences, ...preferences };
    
    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toSafeObject()
    });
  } catch (error) {
    config.smartLog('fail','Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Profile update failed'
    });
  }
});

router.put('/change-password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change password for OAuth accounts'
      });
    }
    
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    config.smartLog('fail','Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Password change failed'
    });
  }
});

router.get('/google', isNotAuthenticated, passport.authenticate('google', {
  scope: ['profile', 'email']
}));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
  async (req, res) => {
    try {
      const user = req.user;
      const userPrefs = await userPreferencesManager.getUserPreferences(user._id.toString());
      
      if (!userPrefs.userId) {
        const initialPreferences = {
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          jobTitles: [],
          locations: [],
          careerPages: [],
          companies: [],
          applications: [],
          coverLetters: [],
          links: [],
          linktrees: {},
          profileComments: ["", "", "", ""],
          profileLinks: Array(10).fill(""),
          lastUsed: new Date().toISOString()
        };
        await userPreferencesManager.saveUserPreferences(user._id.toString(), initialPreferences);
      }
      
      res.redirect('/app?auth=success');
    } catch (error) {
      config.smartLog('fail','Google auth callback error:', error);
      res.redirect('/login?error=google_auth_failed');
    }
  }
);

router.get('/linkedin', isNotAuthenticated, passport.authenticate('linkedin'));

router.get('/linkedin/callback',
  passport.authenticate('linkedin', { failureRedirect: '/login?error=linkedin_auth_failed' }),
  async (req, res) => {
    try {
      const user = req.user;
      const userPrefs = await userPreferencesManager.getUserPreferences(user._id.toString());
      
      if (!userPrefs.userId) {
        const initialPreferences = {
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          jobTitles: [],
          locations: [],
          careerPages: [],
          companies: [],
          applications: [],
          coverLetters: [],
          links: [],
          linktrees: {},
          profileComments: ["", "", "", ""],
          profileLinks: Array(10).fill(""),
          lastUsed: new Date().toISOString()
        };
        await userPreferencesManager.saveUserPreferences(user._id.toString(), initialPreferences);
      }
      
      res.redirect('/app?auth=success');
    } catch (error) {
      config.smartLog('fail','LinkedIn auth callback error:', error);
      res.redirect('/login?error=linkedin_auth_failed');
    }
  }
);

router.get('/status', (req, res) => {
  res.json({
    isAuthenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? req.user.toSafeObject() : null
  });
});

module.exports = router;