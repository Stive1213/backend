const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getTasks, createTask, updateTask } = require('../controllers/taskController');

router.get('/', authenticateToken, getTasks);
router.post('/', authenticateToken, createTask);
router.put('/:id', authenticateToken, updateTask);

module.exports = router;