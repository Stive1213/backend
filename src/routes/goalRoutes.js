const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getGoals, createGoal, updateGoal } = require('../controllers/goalController');

router.get('/', authenticateToken, getGoals);
router.post('/', authenticateToken, createGoal);
router.put('/:id', authenticateToken, updateGoal);

module.exports = router;