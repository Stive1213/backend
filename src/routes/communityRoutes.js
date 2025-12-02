const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getCommunities, createCommunity } = require('../controllers/communityController');

router.get('/', authenticateToken, getCommunities);
router.post('/', authenticateToken, createCommunity);

module.exports = router;