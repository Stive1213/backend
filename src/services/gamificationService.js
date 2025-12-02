const { db } = require('../config/db');

// Point values for different actions
const POINT_VALUES = {
  TASK_CREATED: 10,
  TASK_COMPLETED: 25,
  GOAL_CREATED: 15,
  GOAL_COMPLETED: 50,
  HABIT_CREATED: 10,
  HABIT_COMPLETED: 5,
  HABIT_STREAK_7: 20,
  HABIT_STREAK_30: 50,
  HABIT_STREAK_100: 200,
  JOURNAL_ENTRY: 10,
  TRANSACTION_ADDED: 5,
  EVENT_CREATED: 10,
  POST_CREATED: 10,
  COMMENT_CREATED: 5,
  POST_VOTED: 2,
  SUBSCRIPTION_CREATED: 5,
};

// Rank thresholds
const RANKS = [
  { name: 'Bronze', minPoints: 0, maxPoints: 100, icon: '🥉', color: '#CD7F32' },
  { name: 'Silver', minPoints: 101, maxPoints: 500, icon: '🥈', color: '#C0C0C0' },
  { name: 'Gold', minPoints: 501, maxPoints: 1000, icon: '🥇', color: '#FFD700' },
  { name: 'Platinum', minPoints: 1001, maxPoints: 2500, icon: '💎', color: '#E5E4E2' },
  { name: 'Diamond', minPoints: 2501, maxPoints: 5000, icon: '💠', color: '#B9F2FF' },
  { name: 'Master', minPoints: 5001, maxPoints: 10000, icon: '👑', color: '#FF6B9D' },
  { name: 'Legend', minPoints: 10001, maxPoints: Infinity, icon: '🌟', color: '#FFD700' },
];

// Badge definitions
const BADGE_DEFINITIONS = [
  { name: 'First Steps', description: 'Earned your first 10 points', threshold: 10, icon: '🌱' },
  { name: 'Getting Started', description: 'Reached 50 points', threshold: 50, icon: '🚀' },
  { name: 'Task Master', description: 'Completed 10 tasks', threshold: null, icon: '✅', type: 'task_completed', count: 10 },
  { name: 'Goal Getter', description: 'Completed 5 goals', threshold: null, icon: '🎯', type: 'goal_completed', count: 5 },
  { name: 'Habit Hero', description: '7-day habit streak', threshold: null, icon: '🔥', type: 'streak', count: 7 },
  { name: 'Consistency King', description: '30-day habit streak', threshold: null, icon: '👑', type: 'streak', count: 30 },
  { name: 'Centurion', description: 'Reached 100 points', threshold: 100, icon: '💯' },
  { name: 'Half Grand', description: 'Reached 500 points', threshold: 500, icon: '🎖️' },
  { name: 'Grand Master', description: 'Reached 1000 points', threshold: 1000, icon: '🏆' },
  { name: 'Elite', description: 'Reached 2500 points', threshold: 2500, icon: '⭐' },
  { name: 'Supreme', description: 'Reached 5000 points', threshold: 5000, icon: '💫' },
  { name: 'Legendary', description: 'Reached 10000 points', threshold: 10000, icon: '🌟' },
];

/**
 * Award points to a user and track the earning
 * @param {number} userId - User ID
 * @param {number} points - Points to award
 * @param {string} description - Description of why points were awarded
 * @param {string} actionType - Type of action (e.g., 'TASK_CREATED')
 * @returns {Promise<void>}
 */
const awardPoints = (userId, points, description, actionType = null) => {
  return new Promise((resolve, reject) => {
    // Ensure user_points record exists
    db.run(
      'INSERT OR IGNORE INTO user_points (user_id, points) VALUES (?, 0)',
      [userId],
      (err) => {
        if (err) {
          console.error('Error ensuring user_points record:', err);
          return reject(err);
        }

        // Update total points
        db.run(
          'UPDATE user_points SET points = points + ? WHERE user_id = ?',
          [points, userId],
          function (updateErr) {
            if (updateErr) {
              console.error('Error updating points:', updateErr);
              return reject(updateErr);
            }

            // Record the earning
            db.run(
              'INSERT INTO point_earnings (user_id, description, points) VALUES (?, ?, ?)',
              [userId, description, points],
              (earnErr) => {
                if (earnErr) {
                  console.error('Error recording point earning:', earnErr);
                  // Don't reject, just log - points were already awarded
                }

                // Check for new badges
                checkAndAwardBadges(userId, actionType)
                  .then(() => resolve())
                  .catch((badgeErr) => {
                    console.error('Error checking badges:', badgeErr);
                    // Don't reject, badges are secondary
                    resolve();
                  });
              }
            );
          }
        );
      }
    );
  });
};

/**
 * Get user's rank based on total points
 * @param {number} totalPoints - User's total points
 * @returns {Object} Rank object with name, icon, and color
 */
const getRank = (totalPoints) => {
  for (const rank of RANKS) {
    if (totalPoints >= rank.minPoints && totalPoints <= rank.maxPoints) {
      return rank;
    }
  }
  // Fallback to highest rank
  return RANKS[RANKS.length - 1];
};

/**
 * Check and award badges based on points or actions
 * @param {number} userId - User ID
 * @param {string} actionType - Type of action that triggered the check
 * @returns {Promise<void>}
 */
const checkAndAwardBadges = (userId, actionType = null) => {
  return new Promise((resolve, reject) => {
    // Get user's total points
    db.get(
      'SELECT COALESCE(points, 0) as totalPoints FROM user_points WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) return reject(err);

        const totalPoints = row ? row.totalPoints : 0;

        // Check point-based badges
        BADGE_DEFINITIONS.forEach((badgeDef) => {
          if (badgeDef.threshold && totalPoints >= badgeDef.threshold) {
            // Check if user already has this badge
            db.get(
              'SELECT id FROM badges WHERE user_id = ? AND name = ?',
              [userId, badgeDef.name],
              (badgeErr, badgeRow) => {
                if (!badgeErr && !badgeRow) {
                  // Award the badge
                  db.run(
                    'INSERT INTO badges (user_id, name, icon) VALUES (?, ?, ?)',
                    [userId, badgeDef.name, badgeDef.icon],
                    (insertErr) => {
                      if (insertErr) {
                        console.error('Error awarding badge:', insertErr);
                      }
                    }
                  );
                }
              }
            );
          }
        });

        resolve();
      }
    );
  });
};

/**
 * Award a specific badge to a user
 * @param {number} userId - User ID
 * @param {string} badgeName - Name of the badge
 * @param {string} badgeIcon - Icon for the badge
 * @returns {Promise<void>}
 */
const awardBadge = (userId, badgeName, badgeIcon) => {
  return new Promise((resolve, reject) => {
    // Check if user already has this badge
    db.get(
      'SELECT id FROM badges WHERE user_id = ? AND name = ?',
      [userId, badgeName],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          // Badge already exists
          return resolve();
        }

        // Award the badge
        db.run(
          'INSERT INTO badges (user_id, name, icon) VALUES (?, ?, ?)',
          [userId, badgeName, badgeIcon],
          (insertErr) => {
            if (insertErr) return reject(insertErr);
            resolve();
          }
        );
      }
    );
  });
};

/**
 * Get user's gamification stats
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Stats including points, rank, and badges
 */
const getUserStats = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT COALESCE(points, 0) as totalPoints FROM user_points WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) return reject(err);

        const totalPoints = row ? row.totalPoints : 0;
        const rank = getRank(totalPoints);

        // Get badges
        db.all(
          'SELECT id, name, icon FROM badges WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5',
          [userId],
          (badgeErr, badges) => {
            if (badgeErr) return reject(badgeErr);

            resolve({
              totalPoints,
              rank: {
                name: rank.name,
                icon: rank.icon,
                color: rank.color,
              },
              badges: badges || [],
            });
          }
        );
      }
    );
  });
};

module.exports = {
  POINT_VALUES,
  RANKS,
  awardPoints,
  getRank,
  checkAndAwardBadges,
  awardBadge,
  getUserStats,
};

