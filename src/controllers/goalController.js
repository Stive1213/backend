const { db } = require('../config/db');
const { awardPoints, POINT_VALUES } = require('../services/gamificationService');

const getGoals = (req, res) => {
  db.all('SELECT * FROM goals WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

const createGoal = (req, res) => {
  const { title, target, deadline, progress } = req.body;
  db.run(
    'INSERT INTO goals (user_id, title, target, deadline, progress) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, target, deadline, progress || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Award points for goal creation
      awardPoints(
        req.user.id,
        POINT_VALUES.GOAL_CREATED,
        `Created goal: "${title}"`,
        'GOAL_CREATED'
      ).catch((err) => console.error('Error awarding points:', err));
      
      res.status(201).json({ id: this.lastID, title, target, deadline, progress: progress || 0 });
    }
  );
};

const updateGoal = (req, res) => {
  const { title, target, deadline, progress } = req.body;
  
  // Get current goal to check if it's being completed
  db.get(
    'SELECT progress, title FROM goals WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, goal) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!goal) return res.status(404).json({ error: 'Goal not found' });
      
      const wasCompleted = goal.progress >= 100;
      const isNowCompleted = progress >= 100;
      
      db.run(
        'UPDATE goals SET title = ?, target = ?, deadline = ?, progress = ? WHERE id = ? AND user_id = ?',
        [title, target, deadline, progress, req.params.id, req.user.id],
        function (updateErr) {
          if (updateErr || this.changes === 0) {
            return res.status(404).json({ error: 'Goal not found' });
          }
          
          // Award points only if completing for the first time
          if (isNowCompleted && !wasCompleted) {
            awardPoints(
              req.user.id,
              POINT_VALUES.GOAL_COMPLETED,
              `Completed goal: "${goal.title}"`,
              'GOAL_COMPLETED'
            ).catch((err) => console.error('Error awarding points:', err));
          }
          
          res.json({ message: 'Goal updated' });
        }
      );
    }
  );
};

module.exports = { getGoals, createGoal, updateGoal };