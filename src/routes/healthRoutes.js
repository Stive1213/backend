const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getFitnessActivities,
  addFitnessActivity,
  deleteFitnessActivity,
  getDietLogs,
  addDietLog,
  deleteDietLog,
  getSleepLogs,
  addSleepLog,
  deleteSleepLog,
  getWaterIntake,
  updateWaterIntake,
  getHealthStats,
} = require('../controllers/healthController');

// All routes require authentication
// Fitness
router.get('/fitness', authenticateToken, getFitnessActivities);
router.post('/fitness', authenticateToken, addFitnessActivity);
router.delete('/fitness/:id', authenticateToken, deleteFitnessActivity);

// Diet
router.get('/diet', authenticateToken, getDietLogs);
router.post('/diet', authenticateToken, addDietLog);
router.delete('/diet/:id', authenticateToken, deleteDietLog);

// Sleep
router.get('/sleep', authenticateToken, getSleepLogs);
router.post('/sleep', authenticateToken, addSleepLog);
router.delete('/sleep/:id', authenticateToken, deleteSleepLog);

// Water
router.get('/water', authenticateToken, getWaterIntake);
router.put('/water', authenticateToken, updateWaterIntake);

// Stats
router.get('/stats', authenticateToken, getHealthStats);

module.exports = router;

