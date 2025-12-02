const { db } = require('../config/db');
const { awardPoints, POINT_VALUES } = require('../services/gamificationService');

const getTransactions = (req, res) => {
  db.all('SELECT * FROM transactions WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

const createTransaction = (req, res) => {
  const { type, amount, category, date, description } = req.body;
  if (!type || !amount || !category || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    'INSERT INTO transactions (user_id, type, amount, category, date, description) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, type, amount, category, date, description || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Award points for transaction logging
      awardPoints(
        req.user.id,
        POINT_VALUES.TRANSACTION_ADDED,
        `Added ${type} transaction: ${category}`,
        'TRANSACTION_ADDED'
      ).catch((err) => console.error('Error awarding points:', err));
      
      res.status(201).json({
        id: this.lastID,
        type,
        amount,
        category,
        date,
        description: description || '',
      });
    }
  );
};

module.exports = { getTransactions, createTransaction };