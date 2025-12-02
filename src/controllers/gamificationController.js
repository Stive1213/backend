const { db } = require('../config/db');
const { getRank, getUserStats } = require('../services/gamificationService');

// Helper function to handle database errors
const handleDbError = (res, err) => {
  console.error('Database error:', err.message);
  return res.status(500).json({ error: 'Database error: ' + err.message });
};

// Get user's total points
const getPoints = (req, res) => {
  db.get(
    'SELECT COALESCE(points, 0) as totalPoints FROM user_points WHERE user_id = ?',
    [req.user.id],
    (err, row) => {
      if (err) return handleDbError(res, err);
      const totalPoints = row ? row.totalPoints : 0;
      const rank = getRank(totalPoints);
      res.json({ 
        totalPoints,
        rank: {
          name: rank.name,
          icon: rank.icon,
          color: rank.color,
        }
      });
    }
  );
};

// Get user's complete gamification stats (points, rank, badges)
const getStats = (req, res) => {
  getUserStats(req.user.id)
    .then((stats) => {
      res.json(stats);
    })
    .catch((err) => {
      handleDbError(res, err);
    });
};

// Get user's recent point earnings
const getRecentEarnings = (req, res) => {
  db.all(
    `SELECT id, description, points, date(timestamp) as date 
     FROM point_earnings 
     WHERE user_id = ? 
     ORDER BY timestamp DESC 
     LIMIT 10`,
    [req.user.id],
    (err, rows) => {
      if (err) return handleDbError(res, err);
      res.json(rows || []);
    }
  );
};

// Get user's badges
const getBadges = (req, res) => {
  db.all(
    `SELECT id, name, icon 
     FROM badges 
     WHERE user_id = ?`,
    [req.user.id],
    (err, rows) => {
      if (err) return handleDbError(res, err);
      res.json(rows || []);
    }
  );
};

// Get leaderboard
const getLeaderboard = (req, res) => {
  const { optIn } = req.query; // Expect optIn as a query param (true/false)
  const includeUser = optIn === 'true';

  if (includeUser) {
    db.all(
      `SELECT u.id, u.username as name, COALESCE(up.points, 0) as points 
       FROM users u 
       LEFT JOIN user_points up ON u.id = up.user_id 
       WHERE up.opt_in_leaderboard = 1 
       ORDER BY points DESC 
       LIMIT 10`,
      (err, rows) => {
        if (err) return handleDbError(res, err);
        res.json(
          rows.map((row) => ({
            id: row.id.toString(),
            name: row.id === req.user.id ? 'You' : row.name,
            points: row.points,
          }))
        );
      }
    );
  } else {
    db.all(
      `SELECT u.id, u.username as name, COALESCE(up.points, 0) as points 
       FROM users u 
       LEFT JOIN user_points up ON u.id = up.user_id 
       WHERE up.opt_in_leaderboard = 1 AND u.id != ? 
       ORDER BY points DESC 
       LIMIT 10`,
      [req.user.id],
      (err, rows) => {
        if (err) return handleDbError(res, err);
        res.json(rows);
      }
    );
  }
};

// Update leaderboard opt-in preference
const updateLeaderboardOptIn = (req, res) => {
  const { optIn } = req.body;
  if (typeof optIn !== 'boolean') {
    return res.status(400).json({ error: 'optIn must be a boolean' });
  }

  db.run(
    'UPDATE user_points SET opt_in_leaderboard = ? WHERE user_id = ?',
    [optIn ? 1 : 0, req.user.id],
    function (err) {
      if (err) return handleDbError(res, err);
      if (this.changes === 0) {
        return res.status(404).json({ error: 'User points not found' });
      }
      res.json({ message: 'Leaderboard opt-in updated' });
    }
  );
};

module.exports = {
  getPoints,
  getStats,
  getRecentEarnings,
  getBadges,
  getLeaderboard,
  updateLeaderboardOptIn,
};