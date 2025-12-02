const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/db');
const config = require('../config/config');

class AuthService {
  async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  generateToken(user) {
    return jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  async findUserByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
  }

  async findUserByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
  }

  async findUserByGoogleId(googleId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE google_id = ?', [googleId], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });
  }

  async createUser(userData) {
    return new Promise((resolve, reject) => {
      const {
        username,
        firstName,
        lastName,
        email,
        password,
        profileImage,
        age,
        googleId,
      } = userData;

      const query = googleId
        ? `INSERT INTO users (username, first_name, last_name, email, profile_image, age, google_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO users (username, first_name, last_name, email, password, profile_image, age) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`;

      const params = googleId
        ? [username, firstName, lastName, email, profileImage, age || null, googleId]
        : [username, firstName, lastName, email, password, profileImage, age || null];

      db.run(query, params, function (err) {
        if (err) reject(err);
        else {
          const userId = this.lastID;
          // Initialize points for new user
          db.run(
            'INSERT INTO user_points (user_id, points) VALUES (?, 0)',
            [userId],
            (err) => {
              if (err) console.error('Error initializing points:', err);
            }
          );
          resolve({ id: userId, ...userData });
        }
      });
    });
  }

  async getUserProfile(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT u.id, u.username, u.first_name, u.last_name, u.profile_image, u.age, u.email, 
                COALESCE(up.points, 0) as points
         FROM users u
         LEFT JOIN user_points up ON u.id = up.user_id
         WHERE u.id = ?`,
        [userId],
        (err, user) => {
          if (err) reject(err);
          else {
            // Add a default joined date (we can enhance this later with a created_at column)
            if (user) {
              user.created_at = new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
            }
            resolve(user);
          }
        }
      );
    });
  }
}

module.exports = new AuthService();

