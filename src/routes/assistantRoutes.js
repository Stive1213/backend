const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { assistantLimiter } = require('../middleware/rateLimiter');
const { getAssistantResponse, saveAIGeneratedItems } = require('../controllers/assistantController');

// Apply assistant-specific rate limiter (more lenient than general API limiter)
router.post('/', authenticateToken, assistantLimiter, getAssistantResponse);
router.post('/save-items', authenticateToken, saveAIGeneratedItems);

module.exports = router;