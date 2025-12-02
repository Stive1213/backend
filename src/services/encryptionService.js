const CryptoJS = require('crypto-js');

// Generate a unique encryption key for each conversation
// In production, this should be stored securely and shared between users
const generateConversationKey = (user1Id, user2Id) => {
  // Create a deterministic key based on user IDs (sorted to ensure consistency)
  const userIds = [user1Id, user2Id].sort().join('-');
  const baseKey = process.env.ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
  return CryptoJS.SHA256(baseKey + userIds).toString();
};

// Encrypt message content
const encryptMessage = (message, user1Id, user2Id) => {
  const key = generateConversationKey(user1Id, user2Id);
  const encrypted = CryptoJS.AES.encrypt(message, key).toString();
  return encrypted;
};

// Decrypt message content
const decryptMessage = (encryptedMessage, user1Id, user2Id) => {
  try {
    const key = generateConversationKey(user1Id, user2Id);
    const decrypted = CryptoJS.AES.decrypt(encryptedMessage, key);
    const message = decrypted.toString(CryptoJS.enc.Utf8);
    return message;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

module.exports = {
  encryptMessage,
  decryptMessage,
  generateConversationKey,
};

