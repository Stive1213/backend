const { db } = require('../config/db');

// Fitness Activities
const getFitnessActivities = (req, res, next) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM fitness_activities WHERE user_id = ?';
    const params = [userId];
    
    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }
    
    query += ' ORDER BY date DESC, created_at DESC';
    
    db.all(query, params, (err, activities) => {
      if (err) return next(err);
      res.json(activities);
    });
  } catch (err) {
    next(err);
  }
};

const addFitnessActivity = (req, res, next) => {
  try {
    const { type, duration, calories, date } = req.body;
    const userId = req.user.id;
    
    if (!type || !duration || !date) {
      return res.status(400).json({ success: false, error: 'Type, duration, and date are required' });
    }
    
    db.run(
      'INSERT INTO fitness_activities (user_id, type, duration, calories, date) VALUES (?, ?, ?, ?, ?)',
      [userId, type, duration, calories || null, date],
      function(err) {
        if (err) return next(err);
        res.status(201).json({ success: true, id: this.lastID, message: 'Fitness activity added' });
      }
    );
  } catch (err) {
    next(err);
  }
};

const deleteFitnessActivity = (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.run(
      'DELETE FROM fitness_activities WHERE id = ? AND user_id = ?',
      [id, userId],
      function(err) {
        if (err) return next(err);
        if (this.changes === 0) {
          return res.status(404).json({ success: false, error: 'Activity not found' });
        }
        res.json({ success: true, message: 'Activity deleted' });
      }
    );
  } catch (err) {
    next(err);
  }
};

// Diet Logs
const getDietLogs = (req, res, next) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM diet_logs WHERE user_id = ?';
    const params = [userId];
    
    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }
    
    query += ' ORDER BY date DESC, created_at DESC';
    
    db.all(query, params, (err, logs) => {
      if (err) return next(err);
      res.json(logs);
    });
  } catch (err) {
    next(err);
  }
};

const addDietLog = (req, res, next) => {
  try {
    const { meal, calories, date } = req.body;
    const userId = req.user.id;
    
    if (!meal || !date) {
      return res.status(400).json({ success: false, error: 'Meal and date are required' });
    }
    
    db.run(
      'INSERT INTO diet_logs (user_id, meal, calories, date) VALUES (?, ?, ?, ?)',
      [userId, meal, calories || null, date],
      function(err) {
        if (err) return next(err);
        res.status(201).json({ success: true, id: this.lastID, message: 'Diet log added' });
      }
    );
  } catch (err) {
    next(err);
  }
};

const deleteDietLog = (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.run(
      'DELETE FROM diet_logs WHERE id = ? AND user_id = ?',
      [id, userId],
      function(err) {
        if (err) return next(err);
        if (this.changes === 0) {
          return res.status(404).json({ success: false, error: 'Diet log not found' });
        }
        res.json({ success: true, message: 'Diet log deleted' });
      }
    );
  } catch (err) {
    next(err);
  }
};

// Sleep Logs
const getSleepLogs = (req, res, next) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM sleep_logs WHERE user_id = ?';
    const params = [userId];
    
    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }
    
    query += ' ORDER BY date DESC, created_at DESC';
    
    db.all(query, params, (err, logs) => {
      if (err) return next(err);
      res.json(logs);
    });
  } catch (err) {
    next(err);
  }
};

const addSleepLog = (req, res, next) => {
  try {
    const { hours, date } = req.body;
    const userId = req.user.id;
    
    if (!hours || !date) {
      return res.status(400).json({ success: false, error: 'Hours and date are required' });
    }
    
    db.run(
      'INSERT INTO sleep_logs (user_id, hours, date) VALUES (?, ?, ?)',
      [userId, hours, date],
      function(err) {
        if (err) return next(err);
        res.status(201).json({ success: true, id: this.lastID, message: 'Sleep log added' });
      }
    );
  } catch (err) {
    next(err);
  }
};

const deleteSleepLog = (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.run(
      'DELETE FROM sleep_logs WHERE id = ? AND user_id = ?',
      [id, userId],
      function(err) {
        if (err) return next(err);
        if (this.changes === 0) {
          return res.status(404).json({ success: false, error: 'Sleep log not found' });
        }
        res.json({ success: true, message: 'Sleep log deleted' });
      }
    );
  } catch (err) {
    next(err);
  }
};

// Water Intake
const getWaterIntake = (req, res, next) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;
    
    if (date) {
      db.get(
        'SELECT * FROM water_intake WHERE user_id = ? AND date = ?',
        [userId, date],
        (err, intake) => {
          if (err) return next(err);
          res.json(intake || { glasses: 0, date });
        }
      );
    } else {
      // Get today's intake
      const today = new Date().toISOString().split('T')[0];
      db.get(
        'SELECT * FROM water_intake WHERE user_id = ? AND date = ?',
        [userId, today],
        (err, intake) => {
          if (err) return next(err);
          res.json(intake || { glasses: 0, date: today });
        }
      );
    }
  } catch (err) {
    next(err);
  }
};

const updateWaterIntake = (req, res, next) => {
  try {
    const { glasses, date } = req.body;
    const userId = req.user.id;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    if (glasses === undefined) {
      return res.status(400).json({ success: false, error: 'Glasses count is required' });
    }
    
    // Try to update first, if no rows affected, insert
    db.run(
      'UPDATE water_intake SET glasses = ? WHERE user_id = ? AND date = ?',
      [glasses, userId, targetDate],
      function(err) {
        if (err) return next(err);
        if (this.changes === 0) {
          // Insert new record
          db.run(
            'INSERT INTO water_intake (user_id, glasses, date) VALUES (?, ?, ?)',
            [userId, glasses, targetDate],
            function(insertErr) {
              if (insertErr) return next(insertErr);
              res.json({ success: true, id: this.lastID, message: 'Water intake updated' });
            }
          );
        } else {
          res.json({ success: true, message: 'Water intake updated' });
        }
      }
    );
  } catch (err) {
    next(err);
  }
};

// Health Stats Summary
const getHealthStats = (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    
    // Get weekly steps (from fitness activities)
    db.get(
      `SELECT SUM(calories) as total_calories, COUNT(*) as activity_count 
       FROM fitness_activities 
       WHERE user_id = ? AND date BETWEEN ? AND ?`,
      [userId, weekAgoStr, todayStr],
      (err, fitnessStats) => {
        if (err) return next(err);
        
        // Get average sleep
        db.get(
          `SELECT AVG(hours) as avg_sleep 
           FROM sleep_logs 
           WHERE user_id = ? AND date BETWEEN ? AND ?`,
          [userId, weekAgoStr, todayStr],
          (err, sleepStats) => {
            if (err) return next(err);
            
            res.json({
              weeklySteps: fitnessStats?.activity_count * 1000 || 0, // Estimate
              weeklyCalories: fitnessStats?.total_calories || 0,
              averageSleep: sleepStats?.avg_sleep ? parseFloat(sleepStats.avg_sleep).toFixed(1) : 0,
            });
          }
        );
      }
    );
  } catch (err) {
    next(err);
  }
};

module.exports = {
  // Fitness
  getFitnessActivities,
  addFitnessActivity,
  deleteFitnessActivity,
  // Diet
  getDietLogs,
  addDietLog,
  deleteDietLog,
  // Sleep
  getSleepLogs,
  addSleepLog,
  deleteSleepLog,
  // Water
  getWaterIntake,
  updateWaterIntake,
  // Stats
  getHealthStats,
};

