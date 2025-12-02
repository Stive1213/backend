const { db } = require('../config/db');
const { awardPoints, POINT_VALUES } = require('../services/gamificationService');

const getTasks = (req, res) => {
  db.all('SELECT * FROM tasks WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const tasks = rows.map((task) => ({
      ...task,
      subtasks: JSON.parse(task.subtasks || '[]'),
      isDone: !!task.isDone,
    }));
    res.json(tasks);
  });
};

const createTask = (req, res) => {
  const { title, deadline, category, subtasks } = req.body;
  const subtasksJson = JSON.stringify(subtasks || []);
  db.run(
    'INSERT INTO tasks (user_id, title, deadline, category, subtasks, isDone) VALUES (?, ?, ?, ?, ?, 0)',
    [req.user.id, title, deadline, category, subtasksJson],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Award points for task creation
      awardPoints(
        req.user.id,
        POINT_VALUES.TASK_CREATED,
        `Created task: "${title}"`,
        'TASK_CREATED'
      ).catch((err) => console.error('Error awarding points:', err));
      
      res.status(201).json({ id: this.lastID, title, deadline, category, subtasks, isDone: false });
    }
  );
};

const updateTask = (req, res) => {
  const { isDone } = req.body;
  
  // First, get the current task to check if it was already completed
  db.get(
    'SELECT isDone, title FROM tasks WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, task) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!task) return res.status(404).json({ error: 'Task not found' });
      
      // Only award points if marking as done (not if unmarking)
      const wasCompleted = task.isDone === 1;
      const isNowCompleted = isDone === true;
      
      db.run(
        'UPDATE tasks SET isDone = ? WHERE id = ? AND user_id = ?',
        [isDone ? 1 : 0, req.params.id, req.user.id],
        function (updateErr) {
          if (updateErr || this.changes === 0) {
            return res.status(404).json({ error: 'Task not found' });
          }
          
          // Award points only if completing for the first time
          if (isNowCompleted && !wasCompleted) {
            awardPoints(
              req.user.id,
              POINT_VALUES.TASK_COMPLETED,
              `Completed task: "${task.title}"`,
              'TASK_COMPLETED'
            ).catch((err) => console.error('Error awarding points:', err));
          }
          
          res.json({ message: 'Task updated' });
        }
      );
    }
  );
};

module.exports = { getTasks, createTask, updateTask };