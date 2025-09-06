const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId && !this.linkedinId;
    }
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  profilePicture: {
    type: String,
    default: null
  },
  googleId: {
    type: String,
    default: null
  },
  linkedinId: {
    type: String,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    theme: {
      type: String,
      default: 'light'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      jobAlerts: {
        type: Boolean,
        default: true
      }
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'standard', 'premium'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'trial'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    usage: {
      companiesCount: {
        type: Number,
        default: 0
      },
      jobTitlesCount: {
        type: Number,
        default: 0
      },
      searchesToday: {
        type: Number,
        default: 0
      },
      lastSearchDate: {
        type: Date,
        default: null
      },
      aiCoverLettersThisMonth: {
        type: Number,
        default: 0
      },
      lastMonthReset: {
        type: Date,
        default: Date.now
      }
    }
  },
  jobSearchPreferences: {
    locations: [{
      city: String,
      country: String,
      radius: Number
    }],
    jobTitles: [String],
    skills: [String],
    experience: {
      type: String,
      enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'executive']
    },
    workMode: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite', 'any']
    }
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getFullName = function() {
  return `${this.firstName} ${this.lastName}`.trim();
};

userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.googleId;
  delete userObject.linkedinId;
  return userObject;
};

userSchema.methods.getPlanLimits = function() {
  const limits = {
    free: {
      maxCompanies: 10,
      maxJobTitles: 5,
      searchesPerDay: 0.5,
      aiCoverLettersPerMonth: 0,
      features: ['tracking', 'cvBuilder', 'linktree']
    },
    standard: {
      maxCompanies: 25,
      maxJobTitles: 10,
      searchesPerDay: 1,
      aiCoverLettersPerMonth: 3,
      features: ['tracking', 'cvBuilder', 'linktree', 'aiAssistant', 'reminders']
    },
    premium: {
      maxCompanies: 50,
      maxJobTitles: 15,
      searchesPerDay: 2,
      aiCoverLettersPerMonth: 10,
      features: ['tracking', 'cvBuilder', 'linktree', 'aiAssistant', 'reminders', 'linkedinIntegration', 'export', 'prioritySupport']
    }
  };
  
  return limits[this.subscription.plan] || limits.free;
};

userSchema.methods.canPerformAction = function(action) {
  const limits = this.getPlanLimits();
  const usage = this.subscription.usage;
  
  const today = new Date();
  const isToday = usage.lastSearchDate && 
    usage.lastSearchDate.toDateString() === today.toDateString();
  
  const currentMonth = today.getMonth();
  const lastResetMonth = usage.lastMonthReset ? usage.lastMonthReset.getMonth() : -1;
  
  switch(action) {
    case 'addCompany':
      return usage.companiesCount < limits.maxCompanies;
    
    case 'addJobTitle':
      return usage.jobTitlesCount < limits.maxJobTitles;
    
    case 'performSearch':
      if (!isToday) return true;
      return usage.searchesToday < limits.searchesPerDay;
    
    case 'generateCoverLetter':
      if (currentMonth !== lastResetMonth) return true;
      return usage.aiCoverLettersThisMonth < limits.aiCoverLettersPerMonth;
    
    default:
      return limits.features.includes(action);
  }
};

userSchema.methods.updateUsage = function(action) {
  const usage = this.subscription.usage;
  const today = new Date();
  
  const isToday = usage.lastSearchDate && 
    usage.lastSearchDate.toDateString() === today.toDateString();
  
  const currentMonth = today.getMonth();
  const lastResetMonth = usage.lastMonthReset ? usage.lastMonthReset.getMonth() : -1;
  
  switch(action) {
    case 'addCompany':
      usage.companiesCount += 1;
      break;
    
    case 'removeCompany':
      usage.companiesCount = Math.max(0, usage.companiesCount - 1);
      break;
    
    case 'addJobTitle':
      usage.jobTitlesCount += 1;
      break;
    
    case 'removeJobTitle':
      usage.jobTitlesCount = Math.max(0, usage.jobTitlesCount - 1);
      break;
    
    case 'performSearch':
      if (!isToday) {
        usage.searchesToday = 1;
        usage.lastSearchDate = today;
      } else {
        usage.searchesToday += 1;
      }
      break;
    
    case 'generateCoverLetter':
      if (currentMonth !== lastResetMonth) {
        usage.aiCoverLettersThisMonth = 1;
        usage.lastMonthReset = today;
      } else {
        usage.aiCoverLettersThisMonth += 1;
      }
      break;
  }
  
  this.markModified('subscription.usage');
};

module.exports = mongoose.model('User', userSchema);