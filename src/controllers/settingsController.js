const { db } = require('../config/db');
const authService = require('../services/authService');

// Get user settings
const getSettings = (req, res, next) => {
  try {
    const userId = req.user.id;
    
    db.get(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId],
      (err, settings) => {
        if (err) return next(err);
        
        if (!settings) {
          // Create default settings
          db.run(
            'INSERT INTO user_settings (user_id, notifications_enabled, leaderboard_opt_in) VALUES (?, 1, 1)',
            [userId],
            function(insertErr) {
              if (insertErr) return next(insertErr);
              res.json({
                notificationsEnabled: true,
                leaderboardOptIn: true,
              });
            }
          );
        } else {
          res.json({
            notificationsEnabled: !!settings.notifications_enabled,
            leaderboardOptIn: !!settings.leaderboard_opt_in,
          });
        }
      }
    );
  } catch (err) {
    next(err);
  }
};

// Update user settings
const updateSettings = (req, res, next) => {
  try {
    const userId = req.user.id;
    const { notificationsEnabled, leaderboardOptIn } = req.body;
    
    const updates = {};
    if (notificationsEnabled !== undefined) updates.notifications_enabled = notificationsEnabled ? 1 : 0;
    if (leaderboardOptIn !== undefined) updates.leaderboard_opt_in = leaderboardOptIn ? 1 : 0;
    updates.updated_at = new Date().toISOString();
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }
    
    // Check if settings exist
    db.get(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId],
      (err, settings) => {
        if (err) return next(err);
        
        if (!settings) {
          // Create new settings
          db.run(
            'INSERT INTO user_settings (user_id, notifications_enabled, leaderboard_opt_in, updated_at) VALUES (?, ?, ?, ?)',
            [
              userId,
              updates.notifications_enabled !== undefined ? updates.notifications_enabled : 1,
              updates.leaderboard_opt_in !== undefined ? updates.leaderboard_opt_in : 1,
              updates.updated_at
            ],
            function(insertErr) {
              if (insertErr) return next(insertErr);
              res.json({ success: true, message: 'Settings updated' });
            }
          );
        } else {
          // Update existing settings
          const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
          const values = [...Object.values(updates), userId];
          
          db.run(
            `UPDATE user_settings SET ${setClause} WHERE user_id = ?`,
            values,
            function(updateErr) {
              if (updateErr) return next(updateErr);
              res.json({ success: true, message: 'Settings updated' });
            }
          );
        }
      }
    );
  } catch (err) {
    next(err);
  }
};

// Delete user account
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;
    
    // Verify password if user has one
    db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, user) => {
      if (err) return next(err);
      
      if (user.password) {
        if (!password) {
          return res.status(400).json({ success: false, error: 'Password is required to delete account' });
        }
        
        const isValid = await authService.comparePassword(password, user.password);
        if (!isValid) {
          return res.status(401).json({ success: false, error: 'Invalid password' });
        }
      }
      
      // Delete user data (cascade should handle related data, but we'll be explicit)
      db.serialize(() => {
        db.run('DELETE FROM notifications WHERE user_id = ?', [userId]);
        db.run('DELETE FROM fitness_activities WHERE user_id = ?', [userId]);
        db.run('DELETE FROM diet_logs WHERE user_id = ?', [userId]);
        db.run('DELETE FROM sleep_logs WHERE user_id = ?', [userId]);
        db.run('DELETE FROM water_intake WHERE user_id = ?', [userId]);
        db.run('DELETE FROM user_settings WHERE user_id = ?', [userId]);
        db.run('DELETE FROM user_points WHERE user_id = ?', [userId]);
        db.run('DELETE FROM badges WHERE user_id = ?', [userId]);
        db.run('DELETE FROM tasks WHERE user_id = ?', [userId]);
        db.run('DELETE FROM goals WHERE user_id = ?', [userId]);
        db.run('DELETE FROM transactions WHERE user_id = ?', [userId]);
        db.run('DELETE FROM events WHERE user_id = ?', [userId]);
        db.run('DELETE FROM habits WHERE user_id = ?', [userId]);
        db.run('DELETE FROM journal_entries WHERE user_id = ?', [userId]);
        db.run('DELETE FROM documents WHERE user_id = ?', [userId]);
        db.run('DELETE FROM profile_pictures WHERE user_id = ?', [userId]);
        db.run('DELETE FROM subscriptions WHERE user_id = ?', [userId]);
        db.run('DELETE FROM comments WHERE user_id = ?', [userId]);
        db.run('DELETE FROM posts WHERE user_id = ?', [userId]);
        
        // Delete user
        db.run('DELETE FROM users WHERE id = ?', [userId], function(deleteErr) {
          if (deleteErr) return next(deleteErr);
          res.json({ success: true, message: 'Account deleted successfully' });
        });
      });
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  deleteAccount,
};

