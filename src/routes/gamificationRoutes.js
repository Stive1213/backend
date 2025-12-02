const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth'); // Assuming this exists
const gamificationController = require('../controllers/gamificationController');

// Gamification Routes
router.get('/points', authenticateToken, gamificationController.getPoints);
router.get('/stats', authenticateToken, gamificationController.getStats);
router.get('/earnings', authenticateToken, gamificationController.getRecentEarnings);
router.get('/badges', authenticateToken, gamificationController.getBadges);
router.get('/leaderboard', authenticateToken, gamificationController.getLeaderboard);
router.put('/leaderboard/opt-in', authenticateToken, gamificationController.updateLeaderboardOptIn);

module.exports = router;