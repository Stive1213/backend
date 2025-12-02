const { db } = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure community media upload directory exists
const communityMediaDir = path.join(__dirname, '../../uploads/community-media');
if (!fs.existsSync(communityMediaDir)) {
  fs.mkdirSync(communityMediaDir, { recursive: true });
  console.log('Created community media upload directory');
}

// Multer configuration for community media
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, communityMediaDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

const uploadSingle = upload.single('media');

const getPosts = (req, res) => {
  const { community_id } = req.query;
  if (!community_id) return res.status(400).json({ error: 'Community ID is required' });

  db.all(`
    SELECT p.*, u.email as author 
    FROM posts p 
    JOIN users u ON p.user_id = u.id 
    WHERE p.community_id = ?
    ORDER BY p.date DESC
  `, [community_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

const createPost = (req, res) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { community_id, title, content, category } = req.body;
    if (!community_id || !content || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    db.get('SELECT id FROM communities WHERE id = ?', [community_id], (err, community) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!community) return res.status(404).json({ error: 'Community not found' });

      // Check if user is subscribed (required for all communities - Telegram-style)
      db.get('SELECT id FROM subscriptions WHERE user_id = ? AND community_id = ?', [req.user.id, community_id], (err, subscription) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!subscription) {
          return res.status(403).json({ error: 'You must be subscribed to post in this community' });
        }

        // Handle media upload
        let mediaUrl = '';
        if (req.file) {
          mediaUrl = `/uploads/community-media/${req.file.filename}`;
        } else if (req.body.media) {
          // Support legacy media URL from text input
          mediaUrl = req.body.media;
        }

        const postTitle = title || 'Untitled';

        const insertPost = () => {
          db.run(
            'INSERT INTO posts (user_id, community_id, title, content, category, media) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, community_id, postTitle, content, category, mediaUrl],
            function (err) {
              if (err) {
                // Delete uploaded file if database insert fails
                if (req.file) {
                  fs.unlinkSync(req.file.path);
                }
                return res.status(500).json({ error: err.message });
              }
              db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [req.user.id]); // 10 points for posting
              res.status(201).json({
                id: this.lastID,
                user_id: req.user.id,
                community_id,
                title: postTitle,
                content,
                category,
                media: mediaUrl,
                date: new Date().toISOString(),
                upvotes: 0,
                downvotes: 0,
                flagged: 0,
                author: req.user.email,
              });
            }
          );
        };

        insertPost();
      });
    });
  });
};

const votePost = (req, res) => {
  const { post_id, type } = req.body;
  const field = type === 'upvote' ? 'upvotes' : 'downvotes';
  db.run(
    `UPDATE posts SET ${field} = ${field} + 1 WHERE id = ?`,
    [post_id],
    function (err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Post not found' });
      db.run('UPDATE user_points SET points = points + 2 WHERE user_id = ?', [req.user.id]); // 2 points for voting
      res.json({ message: 'Vote recorded' });
    }
  );
};

const flagPost = (req, res) => {
  const { post_id } = req.body;
  db.run(
    'UPDATE posts SET flagged = 1 WHERE id = ?',
    [post_id],
    function (err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Post not found' });
      res.json({ message: 'Post flagged' });
    }
  );
};

module.exports = { getPosts, createPost, votePost, flagPost };