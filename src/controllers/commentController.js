const { db } = require('../config/db');

const getComments = (req, res) => {
  const { post_id } = req.query;
  if (!post_id) return res.status(400).json({ error: 'Post ID is required' });

  db.all(`
    SELECT c.*, u.email as author 
    FROM comments c 
    JOIN users u ON c.user_id = u.id 
    WHERE c.post_id = ?
  `, [post_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

const createComment = (req, res) => {
  const { post_id, content } = req.body;
  if (!post_id || !content) return res.status(400).json({ error: 'Missing required fields' });

  db.run(
    'INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)',
    [req.user.id, post_id, content],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run('UPDATE user_points SET points = points + 5 WHERE user_id = ?', [req.user.id]); // 5 points for commenting
      res.status(201).json({
        id: this.lastID,
        user_id: req.user.id,
        post_id,
        content,
        date: new Date().toISOString(),
        author: req.user.email,
      });
    }
  );
};

module.exports = { getComments, createComment };