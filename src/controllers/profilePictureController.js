const { db } = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure profile pictures upload directory exists
const profilePicsDir = path.join(__dirname, '../../uploads/profile-pictures');
if (!fs.existsSync(profilePicsDir)) {
  fs.mkdirSync(profilePicsDir, { recursive: true });
  console.log('Created profile pictures upload directory');
}

// Multer configuration for profile pictures
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profilePicsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

const uploadSingle = upload.single('image');

// Upload a profile picture
const uploadProfilePicture = (req, res) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Get current max display_order for user
    db.get(
      'SELECT MAX(display_order) as max_order FROM profile_pictures WHERE user_id = ?',
      [req.user.id],
      (err, row) => {
        if (err) {
          fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: err.message });
        }

        const displayOrder = (row?.max_order ?? -1) + 1;
        const imageUrl = `/uploads/profile-pictures/${req.file.filename}`;

        db.run(
          'INSERT INTO profile_pictures (user_id, image_path, image_url, display_order) VALUES (?, ?, ?, ?)',
          [req.user.id, req.file.path, imageUrl, displayOrder],
          function (err) {
            if (err) {
              fs.unlinkSync(req.file.path);
              return res.status(500).json({ error: err.message });
            }

            res.status(201).json({
              id: this.lastID,
              image_url: imageUrl,
              display_order: displayOrder,
              uploaded_at: new Date().toISOString(),
            });
          }
        );
      }
    );
  });
};

// Get all profile pictures for a user
const getProfilePictures = (req, res) => {
  const { userId } = req.params;

  db.all(
    'SELECT * FROM profile_pictures WHERE user_id = ? ORDER BY display_order DESC, uploaded_at DESC',
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
};

// Delete a profile picture
const deleteProfilePicture = (req, res) => {
  const { pictureId } = req.params;

  // Get picture info
  db.get(
    'SELECT * FROM profile_pictures WHERE id = ? AND user_id = ?',
    [pictureId, req.user.id],
    (err, picture) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!picture) {
        return res.status(404).json({ error: 'Profile picture not found' });
      }

      // Delete from database
      db.run(
        'DELETE FROM profile_pictures WHERE id = ? AND user_id = ?',
        [pictureId, req.user.id],
        (deleteErr) => {
          if (deleteErr) {
            return res.status(500).json({ error: deleteErr.message });
          }

          // Delete physical file
          if (fs.existsSync(picture.image_path)) {
            fs.unlinkSync(picture.image_path);
          }

          res.json({ message: 'Profile picture deleted successfully' });
        }
      );
    }
  );
};

module.exports = {
  uploadProfilePicture,
  getProfilePictures,
  deleteProfilePicture,
};

