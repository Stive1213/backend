const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getSettings, updateSettings, deleteAccount } = require('../controllers/settingsController');

// All routes require authentication
router.get('/', authenticateToken, getSettings);
router.put('/', authenticateToken, updateSettings);
router.delete('/account', authenticateToken, deleteAccount);

module.exports = router;

