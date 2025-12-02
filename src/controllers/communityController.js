const { db } = require('../config/db');

const getCommunities = (req, res) => {
  db.all(`
    SELECT c.*, 
           (SELECT COUNT(*) FROM subscriptions s WHERE s.community_id = c.id) as subscriber_count,
           EXISTS(SELECT 1 FROM subscriptions s WHERE s.community_id = c.id AND s.user_id = ?) as is_subscribed
    FROM communities c
    GROUP BY c.id, c.name, c.description, c.admin_only_post, c.created_by
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      subscribers: row.subscriber_count,
      isSubscribed: !!row.is_subscribed,
    })));
  });
};

const createCommunity = (req, res) => {
  // Only admin (userId === 1) can create communities
  if (req.user.id !== 1) {
    return res.status(403).json({ error: 'Only admins can create communities' });
  }

  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  db.run(
    'INSERT INTO communities (name, description, admin_only_post, created_by) VALUES (?, ?, ?, ?)',
    [name, description, 0, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({
        id: this.lastID,
        name,
        description,
        admin_only_post: 0,
        created_by: req.user.id,
        subscribers: 0,
      });
    }
  );
};

module.exports = { getCommunities, createCommunity };