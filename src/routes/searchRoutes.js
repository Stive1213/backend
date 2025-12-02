const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { search } = require('../controllers/searchController');

router.get('/', authenticateToken, search);

module.exports = router;

