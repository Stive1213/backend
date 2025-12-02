const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  searchUsers,
  getOrCreateConversation,
  getConversations,
  getMessages,
  sendMessage,
  markAsRead,
} = require('../controllers/chatController');

// All routes require authentication
router.get('/search', authenticateToken, searchUsers);
router.get('/conversations', authenticateToken, getConversations);
router.get('/conversations/:conversationId/messages', authenticateToken, getMessages);
router.post('/conversations/:userId', authenticateToken, getOrCreateConversation);
router.post('/messages', authenticateToken, sendMessage);
router.put('/conversations/:conversationId/read', authenticateToken, markAsRead);

module.exports = router;

