const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getHabits, createHabit, updateHabit } = require('../controllers/habitController');

router.get('/', authenticateToken, getHabits);
router.post('/', authenticateToken, createHabit);
router.put('/:id', authenticateToken, updateHabit);

module.exports = router;