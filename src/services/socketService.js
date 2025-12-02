const jwt = require('jsonwebtoken');
const { db } = require('../config/db');
const { encryptMessage, decryptMessage } = require('./encryptionService');

const setupSocketIO = (io) => {
  // Authentication middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      socket.userId = decoded.id;
      socket.username = decoded.username;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Handle joining a conversation room
    socket.on('join-conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} joined conversation ${conversationId}`);
    });

    // Handle leaving a conversation room
    socket.on('leave-conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} left conversation ${conversationId}`);
    });

    // Handle sending a message via WebSocket
    socket.on('send-message', async (data) => {
      const { conversationId, content, messageType = 'text', mediaUrl, mediaType, fileName, fileSize } = data;

      try {
        // Verify user is part of conversation
        db.get(
          'SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
          [conversationId, socket.userId, socket.userId],
          (err, conversation) => {
            if (err || !conversation) {
              socket.emit('error', { message: 'Conversation not found' });
              return;
            }

            const receiverId = conversation.user1_id === socket.userId 
              ? conversation.user2_id 
              : conversation.user1_id;

            // Encrypt message
            const encryptedContent = encryptMessage(
              content || '',
              conversation.user1_id,
              conversation.user2_id
            );

            // Save message to database
            db.run(
              `INSERT INTO messages 
               (conversation_id, sender_id, receiver_id, message_type, encrypted_content, media_url, media_type, file_name, file_size)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [conversationId, socket.userId, receiverId, messageType, encryptedContent, mediaUrl, mediaType, fileName, fileSize],
              function (err) {
                if (err) {
                  socket.emit('error', { message: 'Failed to save message' });
                  return;
                }

                // Update conversation
                db.run(
                  'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
                  [conversationId],
                  () => {}
                );

                // Get sender info
                db.get(
                  'SELECT username, first_name, last_name FROM users WHERE id = ?',
                  [socket.userId],
                  (err, sender) => {
                    if (err) {
                      socket.emit('error', { message: 'Failed to get sender info' });
                      return;
                    }

                    const messageData = {
                      id: this.lastID,
                      conversation_id: conversationId,
                      sender_id: socket.userId,
                      receiver_id: receiverId,
                      message_type: messageType,
                      content: content,
                      media_url: mediaUrl,
                      media_type: mediaType,
                      file_name: fileName,
                      file_size: fileSize,
                      created_at: new Date().toISOString(),
                      sender_username: sender.username,
                      sender_name: `${sender.first_name} ${sender.last_name}`,
                    };

                    // Emit to conversation room (both users)
                    io.to(`conversation:${conversationId}`).emit('new-message', messageData);
                    
                    // Also emit to receiver's personal room for notifications
                    io.to(`user:${receiverId}`).emit('message-received', {
                      conversationId,
                      message: messageData,
                    });
                  }
                );
              }
            );
          }
        );
      } catch (error) {
        console.error('Error handling send-message:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      const { conversationId, isTyping } = data;
      socket.to(`conversation:${conversationId}`).emit('user-typing', {
        userId: socket.userId,
        username: socket.username,
        isTyping,
      });
    });

    // Handle message read status
    socket.on('mark-read', (data) => {
      const { conversationId } = data;
      
      db.run(
        `UPDATE messages 
         SET read_at = CURRENT_TIMESTAMP 
         WHERE conversation_id = ? AND receiver_id = ? AND read_at IS NULL`,
        [conversationId, socket.userId],
        () => {
          // Notify sender that messages were read
          socket.to(`conversation:${conversationId}`).emit('messages-read', {
            conversationId,
            readBy: socket.userId,
          });
        }
      );
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.username} (${socket.userId})`);
    });
  });
};

module.exports = { setupSocketIO };

