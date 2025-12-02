const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getEvents, createEvent } = require('../controllers/eventController');

router.get('/', authenticateToken, getEvents);
router.post('/', authenticateToken, createEvent);

module.exports = router;