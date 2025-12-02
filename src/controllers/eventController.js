const { db } = require('../config/db');
const { awardPoints, POINT_VALUES } = require('../services/gamificationService');

const getEvents = (req, res) => {
  db.all('SELECT * FROM events WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

const createEvent = (req, res) => {
  const { title, date, time, inviteLink } = req.body;
  if (!title || !date || !time) {
    return res.status(400).json({ error: 'Missing required fields (title, date, time)' });
  }

  db.run(
    'INSERT INTO events (user_id, title, date, time, inviteLink) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, date, time, inviteLink || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Award points for event creation
      awardPoints(
        req.user.id,
        POINT_VALUES.EVENT_CREATED,
        `Created event: "${title}"`,
        'EVENT_CREATED'
      ).catch((err) => console.error('Error awarding points:', err));
      
      res.status(201).json({
        id: this.lastID,
        title,
        date,
        time,
        inviteLink: inviteLink || '',
      });
    }
  );
};

module.exports = { getEvents, createEvent };