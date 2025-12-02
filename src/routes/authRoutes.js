const express = require('express');
const passport = require('passport');
const config = require('../config/config');
const { signup, login, getUserProfile, updateUserProfile, googleCallback, requestPasswordReset, resetPassword } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Google OAuth routes (only register if credentials are configured)
if (config.google.clientId && config.google.clientSecret) {
  router.get(
    '/google',
    authLimiter,
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    googleCallback
  );
} else {
  // Placeholder routes that return an error if Google OAuth is not configured
  router.get('/google', (req, res) => {
    res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file'
    });
  });
}

// Traditional auth routes
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, requestPasswordReset);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/user', authenticateToken, getUserProfile);
router.put('/user', authenticateToken, updateUserProfile);

module.exports = router;