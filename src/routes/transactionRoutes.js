const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getTransactions, createTransaction } = require('../controllers/transactionController');

router.get('/', authenticateToken, getTransactions);
router.post('/', authenticateToken, createTransaction);

module.exports = router;