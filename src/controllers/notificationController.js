const { db } = require('../config/db');

// Get all notifications for a user
const getNotifications = (req, res, next) => {
  try {
    const userId = req.user.id;
    
    db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
      (err, notifications) => {
        if (err) {
          return next(err);
        }
        res.json(notifications.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          read: !!n.read,
          timestamp: n.created_at,
        })));
      }
    );
  } catch (err) {
    next(err);
  }
};

// Mark notification as read
const markAsRead = (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.run(
      'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
      [id, userId],
      function(err) {
        if (err) {
          return next(err);
        }
        if (this.changes === 0) {
          return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        res.json({ success: true, message: 'Notification marked as read' });
      }
    );
  } catch (err) {
    next(err);
  }
};

// Mark all notifications as read
const markAllAsRead = (req, res, next) => {
  try {
    const userId = req.user.id;
    
    db.run(
      'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
      [userId],
      function(err) {
        if (err) {
          return next(err);
        }
        res.json({ success: true, message: 'All notifications marked as read' });
      }
    );
  } catch (err) {
    next(err);
  }
};

// Delete notification
const deleteNotification = (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.run(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId],
      function(err) {
        if (err) {
          return next(err);
        }
        if (this.changes === 0) {
          return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        res.json({ success: true, message: 'Notification deleted' });
      }
    );
  } catch (err) {
    next(err);
  }
};

// Delete all notifications
const deleteAllNotifications = (req, res, next) => {
  try {
    const userId = req.user.id;
    
    db.run(
      'DELETE FROM notifications WHERE user_id = ?',
      [userId],
      function(err) {
        if (err) {
          return next(err);
        }
        res.json({ success: true, message: 'All notifications deleted' });
      }
    );
  } catch (err) {
    next(err);
  }
};

// Helper function to create notification (can be used by other controllers)
const createNotification = (userId, type, title, message) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
      [userId, type, title, message],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  createNotification,
};

