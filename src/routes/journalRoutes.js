const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getJournalEntries, createJournalEntry } = require('../controllers/journalController');

router.get('/', authenticateToken, getJournalEntries);
router.post('/', authenticateToken, createJournalEntry);

module.exports = router;