const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const config = require('./config');
const authService = require('../services/authService');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await authService.getUserProfile(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy (only initialize if credentials are provided)
if (config.google.clientId && config.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackURL,
      },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id: googleId, displayName, emails, photos } = profile;
        const email = emails[0].value;
        const profileImage = photos[0]?.value || 'https://via.placeholder.com/40';

        // Check if user exists with this Google ID
        let user = await authService.findUserByGoogleId(googleId);

        if (user) {
          return done(null, user);
        }

        // Check if user exists with this email
        user = await authService.findUserByEmail(email);

        if (user) {
          // Link Google account to existing user
          const { db } = require('./db');
          return new Promise((resolve, reject) => {
            db.run(
              'UPDATE users SET google_id = ? WHERE id = ?',
              [googleId, user.id],
              (err) => {
                if (err) reject(err);
                else resolve(user);
              }
            );
          })
            .then((updatedUser) => done(null, updatedUser))
            .catch((err) => done(err, null));
        }

        // Create new user
        const nameParts = displayName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const username = email.split('@')[0] + '_' + Date.now();

        const newUser = await authService.createUser({
          username,
          firstName,
          lastName,
          email,
          profileImage,
          age: 0, // Default age, can be updated later
          googleId,
        });

        return done(null, newUser);
      } catch (error) {
        return done(error, null);
      }
    }
  )
  );
} else {
  console.warn('⚠️  Google OAuth credentials not found. Google Sign-In will be disabled.');
  console.warn('   Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file');
}

module.exports = passport;

