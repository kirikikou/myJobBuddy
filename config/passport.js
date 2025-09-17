const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const User = require('../models/User');

passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return done(null, false, { message: 'Invalid email or password' });
    }
    
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return done(null, false, { message: 'Invalid email or password' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    return done(null, user);
  } catch (error) {
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
      return done(null, newUser);
    } catch (error) {
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
      return done(null, newUser);
    } catch (error) {
      return done(error);
    }
  }));
}

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

module.exports = passport;