const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getComments, createComment } = require('../controllers/commentController');

router.get('/', authenticateToken, getComments);
router.post('/', authenticateToken, createComment);

module.exports = router;