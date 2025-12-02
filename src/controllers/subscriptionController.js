const { db } = require('../config/db');

const subscribeToCommunity = (req, res) => {
  const { community_id } = req.body;
  if (!community_id) return res.status(400).json({ error: 'Community ID is required' });

  db.get('SELECT id FROM communities WHERE id = ?', [community_id], (err, community) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    db.run(
      'INSERT OR IGNORE INTO subscriptions (user_id, community_id) VALUES (?, ?)',
      [req.user.id, community_id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Already subscribed' });
        db.run('UPDATE communities SET subscribers = subscribers + 1 WHERE id = ?', [community_id]);
        db.run('UPDATE user_points SET points = points + 5 WHERE user_id = ?', [req.user.id]); // 5 points for subscribing
        res.status(201).json({ message: 'Subscribed successfully' });
      }
    );
  });
};

const unsubscribeFromCommunity = (req, res) => {
  const { community_id } = req.body;
  if (!community_id) return res.status(400).json({ error: 'Community ID is required' });

  db.run(
    'DELETE FROM subscriptions WHERE user_id = ? AND community_id = ?',
    [req.user.id, community_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not subscribed' });
      db.run('UPDATE communities SET subscribers = subscribers - 1 WHERE id = ? AND subscribers > 0', [community_id]);
      res.json({ message: 'Unsubscribed successfully' });
    }
  );
};

const getUserSubscriptions = (req, res) => {
  db.all(`
    SELECT c.*, 
           (SELECT COUNT(*) FROM subscriptions s WHERE s.community_id = c.id) as subscriber_count
    FROM communities c
    INNER JOIN subscriptions s ON c.id = s.community_id
    WHERE s.user_id = ?
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      subscribers: row.subscriber_count,
      isSubscribed: true,
    })));
  });
};

module.exports = { subscribeToCommunity, unsubscribeFromCommunity, getUserSubscriptions };