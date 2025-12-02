const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./life_management.db', (err) => {
  if (err) console.error('Database connection error:', err.message);
  else console.log('Connected to SQLite database');
});

const createTables = () => {
  // Users table (updated to support Google OAuth)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      profile_image TEXT DEFAULT 'https://via.placeholder.com/40',
      age INTEGER,
      email TEXT NOT NULL UNIQUE,
      password TEXT,
      google_id TEXT
    )`, (err) => {
      if (err) console.error('Error creating users table:', err.message);
      else {
        console.log('Users table ready');
        // Create unique index on google_id for new tables
        db.run(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)',
          (err) => {
            if (err && !err.message.includes('already exists')) {
              console.error('Error creating unique index on google_id:', err.message);
            }
          }
        );
      }
    });

  // Add google_id column if it doesn't exist (for existing databases)
  // SQLite doesn't support UNIQUE in ALTER TABLE, so we add column then create index
  db.get(
    "SELECT name FROM pragma_table_info('users') WHERE name='google_id'",
    (err, row) => {
      if (err) {
        console.error('Error checking for google_id column:', err.message);
      } else if (!row) {
        // Column doesn't exist, add it
        db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, (err) => {
          if (err) {
            console.error('Error adding google_id column:', err.message);
          } else {
            // Create unique index on google_id
            db.run(
              'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)',
              (err) => {
                if (err) {
                  console.error('Error creating unique index on google_id:', err.message);
                } else {
                  console.log('google_id column and unique index added successfully');
                }
              }
            );
          }
        });
      } else {
        console.log('google_id column already exists');
      }
    }
  );

  // Add phone_number column if it doesn't exist
  db.get(
    "SELECT name FROM pragma_table_info('users') WHERE name='phone_number'",
    (err, row) => {
      if (err) {
        console.error('Error checking for phone_number column:', err.message);
      } else if (!row) {
        db.run(`ALTER TABLE users ADD COLUMN phone_number TEXT`, (err) => {
          if (err) {
            console.error('Error adding phone_number column:', err.message);
          } else {
            console.log('phone_number column added successfully');
          }
        });
      } else {
        console.log('phone_number column already exists');
      }
    }
  );

  // User Points table (includes opt_in_leaderboard from the start)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_points (
      user_id INTEGER PRIMARY KEY,
      points INTEGER DEFAULT 0,
      opt_in_leaderboard INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating user_points table:', err.message);
      else console.log('User_points table ready');
    });

  // Point Earnings table (new for recent earnings)
  db.run(`
    CREATE TABLE IF NOT EXISTS point_earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      points INTEGER NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating point_earnings table:', err.message);
      else console.log('Point_earnings table ready');
    });

  // Badges table (new for badge gallery)
  db.run(`
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating badges table:', err.message);
      else console.log('Badges table ready');
    });

  // Tasks table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      deadline TEXT,
      category TEXT,
      subtasks TEXT,
      isDone INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating tasks table:', err.message);
      else console.log('Tasks table ready');
    });

  // Goals table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      target TEXT,
      deadline TEXT,
      progress INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating goals table:', err.message);
      else console.log('Goals table ready');
    });

  // Transactions table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating transactions table:', err.message);
      else console.log('Transactions table ready');
    });

  // Events table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      inviteLink TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating events table:', err.message);
      else console.log('Events table ready');
    });

  // Habits table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      streak INTEGER DEFAULT 0,
      completionHistory TEXT DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating habits table:', err.message);
      else console.log('Habits table ready');
    });

  // Journal Entries table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      mood TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating journal_entries table:', err.message);
      else console.log('Journal_entries table ready');
    });

  // Communities table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      admin_only_post INTEGER DEFAULT 0,
      created_by INTEGER,
      subscribers INTEGER DEFAULT 0,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating communities table:', err.message);
      else console.log('Communities table ready');
    });

  // Subscriptions table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      community_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (community_id) REFERENCES communities(id),
      UNIQUE (user_id, community_id)
    )`, (err) => {
      if (err) console.error('Error creating subscriptions table:', err.message);
      else console.log('Subscriptions table ready');
    });

  // Posts table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      community_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      media TEXT,
      date TEXT DEFAULT CURRENT_TIMESTAMP,
      upvotes INTEGER DEFAULT 0,
      downvotes INTEGER DEFAULT 0,
      flagged INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (community_id) REFERENCES communities(id)
    )`, (err) => {
      if (err) console.error('Error creating posts table:', err.message);
      else console.log('Posts table ready');
    });

  // Comments table (unchanged)
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      post_id INTEGER,
      content TEXT NOT NULL,
      date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )`, (err) => {
      if (err) console.error('Error creating comments table:', err.message);
      else console.log('Comments table ready');
    });

  // Documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      category TEXT DEFAULT 'Uncategorized',
      description TEXT,
      tags TEXT DEFAULT '[]',
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating documents table:', err.message);
      else console.log('Documents table ready');
    });

  // Profile Pictures table
  db.run(`
    CREATE TABLE IF NOT EXISTS profile_pictures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      image_url TEXT NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      display_order INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating profile_pictures table:', err.message);
      else console.log('Profile_pictures table ready');
    });

  // Conversations table
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_message_at TEXT,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id),
      UNIQUE (user1_id, user2_id)
    )`, (err) => {
      if (err) console.error('Error creating conversations table:', err.message);
      else console.log('Conversations table ready');
    });

  // Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      encrypted_content TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT,
      file_name TEXT,
      file_size INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      read_at TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating messages table:', err.message);
      else console.log('Messages table ready');
    });

  // Ensure opt_in_leaderboard exists for existing tables
  db.run(`
    ALTER TABLE user_points ADD COLUMN opt_in_leaderboard INTEGER DEFAULT 1
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding opt_in_leaderboard column:', err.message);
    } else {
      console.log('opt_in_leaderboard column added or already exists');
    }
  });

  // Password reset tokens table
  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating password_reset_tokens table:', err.message);
      else console.log('Password_reset_tokens table ready');
    });

  // Notifications table
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating notifications table:', err.message);
      else console.log('Notifications table ready');
    });

  // Health & Wellness tables
  db.run(`
    CREATE TABLE IF NOT EXISTS fitness_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      duration TEXT NOT NULL,
      calories INTEGER,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating fitness_activities table:', err.message);
      else console.log('Fitness_activities table ready');
    });

  db.run(`
    CREATE TABLE IF NOT EXISTS diet_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      meal TEXT NOT NULL,
      calories INTEGER,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating diet_logs table:', err.message);
      else console.log('Diet_logs table ready');
    });

  db.run(`
    CREATE TABLE IF NOT EXISTS sleep_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      hours REAL NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating sleep_logs table:', err.message);
      else console.log('Sleep_logs table ready');
    });

  db.run(`
    CREATE TABLE IF NOT EXISTS water_intake (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      glasses INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE (user_id, date)
    )`, (err) => {
      if (err) console.error('Error creating water_intake table:', err.message);
      else console.log('Water_intake table ready');
    });

  // User settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      notifications_enabled INTEGER DEFAULT 1,
      leaderboard_opt_in INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('Error creating user_settings table:', err.message);
      else console.log('User_settings table ready');
    });

  // Initial data setup
  db.serialize(() => {
    db.run('DELETE FROM communities'); // Remove in production
    db.run(
      'INSERT OR IGNORE INTO communities (id, name, description, admin_only_post, created_by) VALUES (?, ?, ?, ?, ?)',
      [1, 'LifeHub Tips', 'Tips and tricks for using LifeHub.', 1, 1]
    );
    db.run(
      'INSERT OR IGNORE INTO communities (id, name, description, admin_only_post, created_by) VALUES (?, ?, ?, ?, ?)',
      [2, 'Job Finder', 'Post hiring opportunities or job-seeking offers.', 0, 1]
    );

    // Ensure initial points entry for existing users
    db.run(`
      INSERT OR IGNORE INTO user_points (user_id, points, opt_in_leaderboard) 
      SELECT id, 0, 1 FROM users WHERE NOT EXISTS (SELECT 1 FROM user_points WHERE user_points.user_id = users.id)
    `);
  });
};

createTables();

module.exports = { db };