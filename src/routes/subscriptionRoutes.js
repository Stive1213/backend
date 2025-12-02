const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { subscribeToCommunity, unsubscribeFromCommunity, getUserSubscriptions } = require('../controllers/subscriptionController');

router.post('/', authenticateToken, subscribeToCommunity);
router.delete('/', authenticateToken, unsubscribeFromCommunity);
router.get('/', authenticateToken, getUserSubscriptions);

module.exports = router;