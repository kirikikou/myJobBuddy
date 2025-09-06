const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const User = require('../models/User');
const config = require('../config');

passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      config.smartLog('fail', `Login attempt failed - email not found: ${email.slice(0, 3)}***`);
      return done(null, false, { message: 'Invalid email or password' });
    }
    
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      config.smartLog('fail', `Login attempt failed - invalid password for user: ${user._id.toString().slice(-8)}`);
      return done(null, false, { message: 'Invalid email or password' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    config.smartLog('win', `Local login success - user: ${user._id.toString().slice(-8)}`);
    return done(null, user);
  } catch (error) {
    config.smartLog('fail', `Local login error: ${error.message}`);
    return done(error);
  }
}));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) {
        user.lastLogin = new Date();
        await user.save();
        config.smartLog('win', `Google login success - existing user: ${user._id.toString().slice(-8)}`);
        return done(null, user);
      }
      
      user = await User.findOne({ email: profile.emails[0].value });
      if (user) {
        user.googleId = profile.id;
        user.emailVerified = true;
        user.lastLogin = new Date();
        if (!user.profilePicture && profile.photos[0]) {
          user.profilePicture = profile.photos[0].value;
        }
        await user.save();
        config.smartLog('win', `Google login success - linked existing user: ${user._id.toString().slice(-8)}`);
        return done(null, user);
      }
      
      const newUser = new User({
        googleId: profile.id,
        email: profile.emails[0].value,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        profilePicture: profile.photos[0] ? profile.photos[0].value : null,
        emailVerified: true,
        lastLogin: new Date()
      });
      
      await newUser.save();
      config.smartLog('win', `Google login success - new user created: ${newUser._id.toString().slice(-8)}`);
      return done(null, newUser);
    } catch (error) {
      config.smartLog('fail', `Google login error: ${error.message}`);
      return done(error);
    }
  }));
}

if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  passport.use(new LinkedInStrategy({
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: "/auth/linkedin/callback",
    scope: ['r_emailaddress', 'r_liteprofile']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ linkedinId: profile.id });
      
      if (user) {
        user.lastLogin = new Date();
        await user.save();
        config.smartLog('win', `LinkedIn login success - existing user: ${user._id.toString().slice(-8)}`);
        return done(null, user);
      }
      
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@linkedin.local`;
      
      user = await User.findOne({ email });
      if (user) {
        user.linkedinId = profile.id;
        user.emailVerified = true;
        user.lastLogin = new Date();
        if (!user.profilePicture && profile.photos && profile.photos[0]) {
          user.profilePicture = profile.photos[0].value;
        }
        await user.save();
        config.smartLog('win', `LinkedIn login success - linked existing user: ${user._id.toString().slice(-8)}`);
        return done(null, user);
      }
      
      const newUser = new User({
        linkedinId: profile.id,
        email,
        firstName: profile.name ? profile.name.givenName || profile.displayName.split(' ')[0] : 'User',
        lastName: profile.name ? profile.name.familyName || profile.displayName.split(' ').slice(1).join(' ') : '',
        profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
        emailVerified: true,
        lastLogin: new Date()
      });
      
      await newUser.save();
      config.smartLog('win', `LinkedIn login success - new user created: ${newUser._id.toString().slice(-8)}`);
      return done(null, newUser);
    } catch (error) {
      config.smartLog('fail', `LinkedIn login error: ${error.message}`);
      return done(error);
    }
  }));
}

passport.serializeUser((user, done) => {
  if (!user || !user._id) {
    config.smartLog('fail', `Serialize user failed - invalid user object`);
    return done(new Error('Invalid user object for serialization'));
  }
  config.smartLog('buffer', `User serialized - id: ${user._id.toString().slice(-8)}`);
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    if (!id) {
      config.smartLog('fail', `Deserialize user failed - no ID provided`);
      return done(new Error('No user ID provided for deserialization'));
    }
    
    const user = await User.findById(id);
    
    if (!user) {
      config.smartLog('fail', `Deserialize user failed - user not found for ID: ${id.toString().slice(-8)}`);
      return done(null, false);
    }
    
    if (!user._id) {
      config.smartLog('fail', `Deserialize user failed - user object missing _id: ${id.toString().slice(-8)}`);
      return done(new Error('Deserialized user missing _id'));
    }
    
    config.smartLog('buffer', `User deserialized successfully - id: ${user._id.toString().slice(-8)}`);
    done(null, user);
  } catch (error) {
    const idStr = id ? id.toString().slice(-8) : 'unknown';
    config.smartLog('fail', `Deserialize user error for ID ${idStr}: ${error.message}`);
    
    if (error.name === 'CastError' || error.name === 'ValidationError') {
      return done(null, false);
    }
    
    done(error);
  }
});

module.exports = passport;