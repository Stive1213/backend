const { db } = require('../config/db');
const { awardPoints, POINT_VALUES, awardBadge } = require('../services/gamificationService');

const getHabits = (req, res) => {
  db.all('SELECT * FROM habits WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const habits = rows.map((habit) => ({
      ...habit,
      completionHistory: JSON.parse(habit.completionHistory || '[]'),
    }));
    res.json(habits);
  });
};

const createHabit = (req, res) => {
  const { name, frequency } = req.body;
  if (!name || !frequency) {
    return res.status(400).json({ error: 'Missing required fields (name, frequency)' });
  }

  const completionHistory = JSON.stringify([]);
  db.run(
    'INSERT INTO habits (user_id, name, frequency, streak, completionHistory) VALUES (?, ?, ?, 0, ?)',
    [req.user.id, name, frequency, completionHistory],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Award points for habit creation
      awardPoints(
        req.user.id,
        POINT_VALUES.HABIT_CREATED,
        `Created habit: "${name}"`,
        'HABIT_CREATED'
      ).catch((err) => console.error('Error awarding points:', err));
      
      res.status(201).json({
        id: this.lastID,
        name,
        frequency,
        streak: 0,
        completionHistory: [],
      });
    }
  );
};

const updateHabit = (req, res) => {
  const { streak, completionHistory } = req.body;
  if (streak === undefined || !completionHistory) {
    return res.status(400).json({ error: 'Missing required fields (streak, completionHistory)' });
  }

  // Get current habit to check streak changes
  db.get(
    'SELECT streak, name, completionHistory FROM habits WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, habit) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!habit) return res.status(404).json({ error: 'Habit not found' });

      const oldStreak = habit.streak || 0;
      const newStreak = streak;
      const oldCompletionHistory = JSON.parse(habit.completionHistory || '[]');
      const streakIncreased = newStreak > oldStreak;
      const isNewCompletion = completionHistory.length > oldCompletionHistory.length;

      const completionHistoryJson = JSON.stringify(completionHistory);
      db.run(
        'UPDATE habits SET streak = ?, completionHistory = ? WHERE id = ? AND user_id = ?',
        [streak, completionHistoryJson, req.params.id, req.user.id],
        function (updateErr) {
          if (updateErr || this.changes === 0) {
            return res.status(404).json({ error: 'Habit not found' });
          }

          // Award points for habit completion
          if (isNewCompletion) {
            awardPoints(
              req.user.id,
              POINT_VALUES.HABIT_COMPLETED,
              `Completed habit: "${habit.name}"`,
              'HABIT_COMPLETED'
            ).catch((err) => console.error('Error awarding points:', err));
          }

          // Award bonus points for streak milestones
          if (streakIncreased) {
            if (newStreak === 7 && oldStreak < 7) {
              awardPoints(
                req.user.id,
                POINT_VALUES.HABIT_STREAK_7,
                `7-day streak for "${habit.name}"!`,
                'HABIT_STREAK_7'
              ).catch((err) => console.error('Error awarding points:', err));
              awardBadge(req.user.id, 'Habit Hero', '🔥').catch(() => {});
            } else if (newStreak === 30 && oldStreak < 30) {
              awardPoints(
                req.user.id,
                POINT_VALUES.HABIT_STREAK_30,
                `30-day streak for "${habit.name}"!`,
                'HABIT_STREAK_30'
              ).catch((err) => console.error('Error awarding points:', err));
              awardBadge(req.user.id, 'Consistency King', '👑').catch(() => {});
            } else if (newStreak === 100 && oldStreak < 100) {
              awardPoints(
                req.user.id,
                POINT_VALUES.HABIT_STREAK_100,
                `100-day streak for "${habit.name}"!`,
                'HABIT_STREAK_100'
              ).catch((err) => console.error('Error awarding points:', err));
            }
          }

          res.json({ message: 'Habit updated' });
        }
      );
    }
  );
};

module.exports = { getHabits, createHabit, updateHabit };