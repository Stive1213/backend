const { db } = require('../config/db');
const { awardPoints, POINT_VALUES } = require('../services/gamificationService');

const getJournalEntries = (req, res) => {
  db.all('SELECT * FROM journal_entries WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

const createJournalEntry = (req, res) => {
  const { date, text, mood } = req.body;
  if (!date || !text || !mood) {
    return res.status(400).json({ error: 'Missing required fields (date, text, mood)' });
  }

  db.run(
    'INSERT INTO journal_entries (user_id, date, text, mood) VALUES (?, ?, ?, ?)',
    [req.user.id, date, text, mood],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Award points for journal entry
      awardPoints(
        req.user.id,
        POINT_VALUES.JOURNAL_ENTRY,
        `Created journal entry`,
        'JOURNAL_ENTRY'
      ).catch((err) => console.error('Error awarding points:', err));
      
      res.status(201).json({
        id: this.lastID,
        date,
        text,
        mood,
      });
    }
  );
};

module.exports = { getJournalEntries, createJournalEntry };