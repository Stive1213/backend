const authService = require('../services/authService');
const emailService = require('../services/emailService');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Created uploads directory');
}

// Multer setup for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const signup = async (req, res, next) => {
  try {
    const { username, firstName, lastName, age, email, password } = req.body;
    const profileImage = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/40';

    if (!username || !firstName || !lastName || !age || !email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'All fields except profile image are required' 
      });
    }

    // Check if user already exists
    const existingUser = await authService.findUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'Username already exists' 
      });
    }

    const existingEmail = await authService.findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ 
        success: false,
        error: 'Email already exists' 
      });
    }

    const hashedPassword = await authService.hashPassword(password);
    const newUser = await authService.createUser({
      username,
      firstName,
      lastName,
      email,
      password: hashedPassword,
      profileImage,
      age: parseInt(age),
    });

    res.status(201).json({ 
      success: true,
      message: 'Signup successful',
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and password are required' 
      });
    }

    const user = await authService.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid username or password' 
      });
    }

    // Check if user has a password (not Google-only account)
    if (!user.password) {
      return res.status(401).json({ 
        success: false,
        error: 'Please sign in with Google' 
      });
    }

    const isValid = await authService.comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid username or password' 
      });
    }

    const token = authService.generateToken(user);
    res.json({ 
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    next(err);
  }
};

const googleCallback = async (req, res) => {
  try {
    // Ensure req.user exists
    if (!req.user) {
      console.error('Google OAuth callback: req.user is missing');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/auth/callback?error=authentication_failed`);
    }

    // Fetch complete user profile to ensure all fields are present
    const userProfile = await authService.getUserProfile(req.user.id);
    
    if (!userProfile) {
      console.error('Google OAuth callback: User profile not found for id:', req.user.id);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/auth/callback?error=user_not_found`);
    }

    // Ensure user has required fields for token generation
    const userForToken = {
      id: userProfile.id,
      username: userProfile.username || userProfile.email?.split('@')[0] || 'user',
      email: userProfile.email || req.user.email || '',
    };

    // Generate token with complete user info
    const token = authService.generateToken(userForToken);
    
    console.log('Google OAuth callback: Successfully authenticated user:', userForToken.username);
    
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?error=authentication_failed`);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const user = await authService.getUserProfile(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Build profile image URL
    let profileImageUrl = user.profile_image || 'https://via.placeholder.com/40';
    if (profileImageUrl && !profileImageUrl.startsWith('http') && !profileImageUrl.startsWith('/')) {
      profileImageUrl = `/${profileImageUrl}`;
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username || 'Guest',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        profileImage: profileImageUrl,
        age: user.age || null,
        email: user.email || '',
        phoneNumber: user.phone_number || null,
        totalPoints: user.points || 0,
        joinedDate: user.created_at || new Date().toISOString().split('T')[0],
      },
    });
  } catch (err) {
    console.error('Error in getUserProfile:', err);
    next(err);
  }
};

const updateUserProfile = async (req, res, next) => {
  try {
    const { username, firstName, lastName, age, email, password, phoneNumber } = req.body;
    const profileImage = req.file ? `/uploads/${req.file.filename}` : req.body.profileImage;

    const updates = {};
    if (username) updates.username = username;
    if (firstName) updates.first_name = firstName;
    if (lastName) updates.last_name = lastName;
    if (age) updates.age = age;
    if (email) updates.email = email;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber || null;
    if (profileImage) updates.profile_image = profileImage;
    if (password) updates.password = await authService.hashPassword(password);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No updates provided' 
      });
    }

    // Check if username or email already exists (if being updated)
    if (username) {
      const existingUser = await authService.findUserByUsername(username);
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({ 
          success: false,
          error: 'Username already exists' 
        });
      }
    }

    if (email) {
      const existingEmail = await authService.findUserByEmail(email);
      if (existingEmail && existingEmail.id !== req.user.id) {
        return res.status(400).json({ 
          success: false,
          error: 'Email already exists' 
        });
      }
    }

    const { db } = require('../config/db');
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), req.user.id];

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET ${setClause} WHERE id = ?`,
        values,
        function (err) {
          if (err) reject(err);
          else if (this.changes === 0) {
            reject(new Error('User not found'));
          } else {
            resolve();
          }
        }
      );
    })
      .then(() => {
        res.json({ 
          success: true,
          message: 'Profile updated successfully' 
        });
      })
      .catch((err) => next(err));
  } catch (err) {
    next(err);
  }
};

const signupWithUpload = [
  upload.single('profileImage'),
  (req, res, next) => {
    if (req.fileValidationError) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid file upload: ' + req.fileValidationError.message 
      });
    }
    next();
  },
  signup,
];

const updateWithUpload = [
  upload.single('profileImage'),
  (req, res, next) => {
    if (req.fileValidationError) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid file upload: ' + req.fileValidationError.message 
      });
    }
    next();
  },
  updateUserProfile,
];

const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email is required' 
      });
    }

    const { db } = require('../config/db');
    
    // Find user by email
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ 
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Store token in database
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, resetToken, expiresAt.toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Send email
    try {
      await emailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Still return success to prevent information leakage
    }

    res.json({ 
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.' 
    });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Token and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 6 characters long' 
      });
    }

    const { db } = require('../config/db');
    
    // Find valid token
    const resetToken = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")',
        [token],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!resetToken) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or expired reset token' 
      });
    }

    // Hash new password
    const hashedPassword = await authService.hashPassword(password);

    // Update user password
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, resetToken.user_id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Mark token as used
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE password_reset_tokens SET used = 1 WHERE token = ?',
        [token],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ 
      success: true,
      message: 'Password has been reset successfully' 
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { 
  signup: signupWithUpload, 
  login, 
  getUserProfile, 
  updateUserProfile: updateWithUpload,
  googleCallback,
  requestPasswordReset,
  resetPassword,
};