const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getAssistantResponse, saveAIGeneratedItems } = require('../controllers/assistantController');

router.post('/', authenticateToken, getAssistantResponse);
router.post('/save-items', authenticateToken, saveAIGeneratedItems);

module.exports = router;