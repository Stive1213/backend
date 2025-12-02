const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getPosts, createPost, votePost, flagPost } = require('../controllers/postController');

router.get('/', authenticateToken, getPosts);
router.post('/', authenticateToken, createPost); // File upload handled in controller
router.post('/vote', authenticateToken, votePost);
router.post('/flag', authenticateToken, flagPost);

module.exports = router;