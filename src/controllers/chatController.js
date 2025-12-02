const { db } = require('../config/db');
const { encryptMessage, decryptMessage } = require('../services/encryptionService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure chat media upload directory exists
const chatMediaDir = path.join(__dirname, '../../uploads/chat-media');
if (!fs.existsSync(chatMediaDir)) {
  fs.mkdirSync(chatMediaDir, { recursive: true });
  console.log('Created chat media upload directory');
}

// Multer configuration for chat media
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, chatMediaDir);
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

// Search users by username or phone number
const searchUsers = (req, res) => {
  const { query } = req.query;
  
  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const searchTerm = `%${query}%`;
  
  db.all(
    `SELECT id, username, first_name, last_name, profile_image, phone_number 
     FROM users 
     WHERE (username LIKE ? OR phone_number LIKE ?) AND id != ?
     LIMIT 20`,
    [searchTerm, searchTerm, req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
};

// Get or create conversation
const getOrCreateConversation = (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;

  if (parseInt(userId) === currentUserId) {
    return res.status(400).json({ error: 'Cannot create conversation with yourself' });
  }

  // Check if conversation exists
  db.get(
    `SELECT * FROM conversations 
     WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
    [currentUserId, userId, userId, currentUserId],
    (err, conversation) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (conversation) {
        return res.json(conversation);
      }

      // Create new conversation
      db.run(
        'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
        [currentUserId, userId],
        function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          db.get(
            'SELECT * FROM conversations WHERE id = ?',
            [this.lastID],
            (err, newConversation) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              res.status(201).json(newConversation);
            }
          );
        }
      );
    }
  );
};

// Get all conversations for current user
const getConversations = (req, res) => {
  db.all(
    `SELECT c.*, 
            CASE 
              WHEN c.user1_id = ? THEN u2.id
              ELSE u1.id
            END as other_user_id,
            CASE 
              WHEN c.user1_id = ? THEN u2.username
              ELSE u1.username
            END as other_username,
            CASE 
              WHEN c.user1_id = ? THEN u2.first_name || ' ' || u2.last_name
              ELSE u1.first_name || ' ' || u1.last_name
            END as other_user_name,
            CASE 
              WHEN c.user1_id = ? THEN u2.profile_image
              ELSE u1.profile_image
            END as other_user_image,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.receiver_id = ? AND m.read_at IS NULL) as unread_count
     FROM conversations c
     LEFT JOIN users u1 ON c.user1_id = u1.id
     LEFT JOIN users u2 ON c.user2_id = u2.id
     WHERE c.user1_id = ? OR c.user2_id = ?
     ORDER BY c.updated_at DESC`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
};

// Get messages for a conversation
const getMessages = (req, res) => {
  const { conversationId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  // Verify user is part of conversation
  db.get(
    'SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
    [conversationId, req.user.id, req.user.id],
    (err, conversation) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Get messages
      db.all(
        `SELECT m.*, 
                u.username as sender_username,
                u.first_name || ' ' || u.last_name as sender_name
         FROM messages m
         LEFT JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = ?
         ORDER BY m.created_at DESC
         LIMIT ? OFFSET ?`,
        [conversationId, parseInt(limit), parseInt(offset)],
        (err, rows) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          // Decrypt messages
          const decryptedMessages = rows.map((msg) => {
            const decryptedContent = decryptMessage(
              msg.encrypted_content,
              conversation.user1_id,
              conversation.user2_id
            );
            return {
              ...msg,
              content: decryptedContent,
              encrypted_content: undefined, // Remove encrypted content from response
            };
          }).reverse(); // Reverse to show oldest first

          res.json(decryptedMessages);
        }
      );
    }
  );
};

// Send a message (text or media)
const sendMessage = (req, res) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { conversationId, content, messageType = 'text' } = req.body;
    const currentUserId = req.user.id;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Verify user is part of conversation and get conversation details
    db.get(
      'SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
      [conversationId, currentUserId, currentUserId],
      (err, conversation) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        const receiverId = conversation.user1_id === currentUserId 
          ? conversation.user2_id 
          : conversation.user1_id;

        // Handle different message types
        let messageContent = content || '';
        let mediaUrl = null;
        let mediaType = null;
        let fileName = null;
        let fileSize = null;
        let finalMessageType = messageType;

        if (req.file) {
          mediaUrl = `/uploads/chat-media/${req.file.filename}`;
          mediaType = req.file.mimetype;
          fileName = req.file.originalname;
          fileSize = req.file.size;
          
          // Determine message type from file
          if (mediaType.startsWith('image/')) {
            finalMessageType = 'image';
          } else if (mediaType.startsWith('video/')) {
            finalMessageType = 'video';
          } else if (mediaType.startsWith('audio/')) {
            finalMessageType = 'audio';
          } else {
            finalMessageType = 'file';
          }
        }

        // Encrypt text content (even if empty, for consistency)
        const encryptedContent = encryptMessage(
          messageContent,
          conversation.user1_id,
          conversation.user2_id
        );

        // Insert message
        db.run(
          `INSERT INTO messages 
           (conversation_id, sender_id, receiver_id, message_type, encrypted_content, media_url, media_type, file_name, file_size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [conversationId, currentUserId, receiverId, finalMessageType, encryptedContent, mediaUrl, mediaType, fileName, fileSize],
          function (err) {
            if (err) {
              if (req.file) {
                fs.unlinkSync(req.file.path);
              }
              return res.status(500).json({ error: err.message });
            }

            // Update conversation updated_at and last_message_at
            db.run(
              'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
              [conversationId],
              () => {}
            );

            // Get the created message with sender info
            db.get(
              `SELECT m.*, 
                      u.username as sender_username,
                      u.first_name || ' ' || u.last_name as sender_name
               FROM messages m
               LEFT JOIN users u ON m.sender_id = u.id
               WHERE m.id = ?`,
              [this.lastID],
              (err, message) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }

                // Decrypt for response
                const decryptedContent = decryptMessage(
                  message.encrypted_content,
                  conversation.user1_id,
                  conversation.user2_id
                );

                res.status(201).json({
                  ...message,
                  content: decryptedContent,
                  encrypted_content: undefined,
                });
              }
            );
          }
        );
      }
    );
  });
};

// Mark messages as read
const markAsRead = (req, res) => {
  const { conversationId } = req.params;

  db.run(
    `UPDATE messages 
     SET read_at = CURRENT_TIMESTAMP 
     WHERE conversation_id = ? AND receiver_id = ? AND read_at IS NULL`,
    [conversationId, req.user.id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Messages marked as read', count: this.changes });
    }
  );
};

module.exports = {
  searchUsers,
  getOrCreateConversation,
  getConversations,
  getMessages,
  sendMessage,
  markAsRead,
};

