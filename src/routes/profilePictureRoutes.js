const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  uploadProfilePicture,
  getProfilePictures,
  deleteProfilePicture,
} = require('../controllers/profilePictureController');

router.post('/upload', authenticateToken, uploadProfilePicture);
router.get('/:userId', getProfilePictures);
router.delete('/:pictureId', authenticateToken, deleteProfilePicture);

module.exports = router;

