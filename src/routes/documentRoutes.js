const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getDocuments,
  getCategories,
  uploadDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
} = require('../controllers/documentController');

// All routes require authentication
router.get('/', authenticateToken, getDocuments);
router.get('/categories', authenticateToken, getCategories);
router.post('/upload', authenticateToken, uploadDocument);
router.put('/:id', authenticateToken, updateDocument);
router.delete('/:id', authenticateToken, deleteDocument);
router.get('/:id/download', authenticateToken, downloadDocument);

module.exports = router;

