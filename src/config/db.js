require('dotenv').config();
const { Pool } = require('pg');
const config = require('./config');

// Create PostgreSQL connection pool
const poolConfig = config.database.connectionString
  ? {
      connectionString: config.database.connectionString,
      ssl: config.database.ssl,
    }
  : {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl,
    };

const pool = new Pool(poolConfig);

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to PostgreSQL database');
  }
});

// Create a SQLite-compatible wrapper for PostgreSQL
const db = {
  // Convert SQLite ? placeholders to PostgreSQL $1, $2, $3 format
  convertPlaceholders: (query, params) => {
    // Always convert ? to PostgreSQL format, even if params is empty
    // (PostgreSQL will error if params don't match, which is correct behavior)
    let paramIndex = 1;
    // Replace ? with $1, $2, etc.
    return query.replace(/\?/g, () => `$${paramIndex++}`);
  },
  
  // Convert SQLite double-quoted string literals to PostgreSQL single quotes
  convertStringLiterals: (query) => {
    // Convert double quotes around string literals to single quotes
    // Only convert in WHERE clauses: WHERE column = "value"
    // Match pattern: = "value" or LIKE "value" or != "value"
    return query.replace(/(\s+(?:=|LIKE|!=|<>|IN)\s+)"([^"]+)"/gi, "$1'$2'");
  },

  // Wrapper for db.run (INSERT, UPDATE, DELETE)
  run: (query, params, callback) => {
    // Handle case where params might be the callback
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    let modifiedQuery = query;
    
    // Convert SQLite INSERT OR IGNORE to PostgreSQL syntax
    if (/INSERT\s+OR\s+IGNORE/i.test(query)) {
      // Extract table name and columns to determine conflict target
      const match = query.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1];
        const columns = match[2].split(',').map(c => c.trim());
        
        // For known tables, use appropriate conflict targets
        let conflictTarget = '';
        if (tableName === 'subscriptions' && columns.includes('user_id') && columns.includes('community_id')) {
          conflictTarget = '(user_id, community_id)';
        } else if (tableName === 'user_points' && columns.includes('user_id')) {
          conflictTarget = '(user_id)';
        } else if (tableName === 'communities' && columns.includes('id')) {
          conflictTarget = '(id)';
        } else if (tableName === 'water_intake' && columns.includes('user_id') && columns.includes('date')) {
          conflictTarget = '(user_id, date)';
        } else {
          // Default: use first column (usually id or primary key)
          conflictTarget = `(${columns[0]})`;
        }
        
        modifiedQuery = query.replace(
          /INSERT\s+OR\s+IGNORE\s+INTO/i,
          'INSERT INTO'
        ).replace(/;\s*$/, '') + ` ON CONFLICT ${conflictTarget} DO NOTHING`;
      }
    }
    
    // Detect INSERT statements and add RETURNING id if not present
    const isInsert = /^\s*INSERT\s+INTO/i.test(modifiedQuery.trim());
    let needLastId = isInsert && !/RETURNING/i.test(modifiedQuery) && !/ON CONFLICT/i.test(modifiedQuery);
    
    if (needLastId) {
      // Add RETURNING id to INSERT statements (but not for INSERT OR IGNORE which becomes ON CONFLICT)
      // Remove trailing semicolon if present, then add RETURNING id
      modifiedQuery = modifiedQuery.trim().replace(/;\s*$/, '') + ' RETURNING id';
    }
    
    // Convert double quotes to single quotes for PostgreSQL
    modifiedQuery = db.convertStringLiterals(modifiedQuery);
    
    // Convert ? placeholders to PostgreSQL format (must be last)
    modifiedQuery = db.convertPlaceholders(modifiedQuery, params);
    
    pool.query(modifiedQuery, params || [], (err, result) => {
      if (callback) {
        if (err) {
          console.error('Database query error:', err.message);
          console.error('Query:', modifiedQuery);
          console.error('Params:', params);
          callback(err);
        } else {
          // SQLite's run callback receives 'this' with lastID and changes
          const lastID = needLastId && result.rows && result.rows[0] 
            ? result.rows[0].id 
            : null;
          callback.call(
            {
              lastID: lastID,
              changes: result.rowCount || 0,
            },
            err
          );
        }
      }
    });
  },

  // Wrapper for db.get (SELECT single row)
  get: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // Convert double quotes to single quotes for PostgreSQL
    let modifiedQuery = db.convertStringLiterals(query);
    
    // Convert ? placeholders to PostgreSQL format
    modifiedQuery = db.convertPlaceholders(modifiedQuery, params);
    
    pool.query(modifiedQuery, params || [], (err, result) => {
      if (callback) {
        if (err) {
          console.error('Database query error:', err.message);
          console.error('Query:', modifiedQuery);
          console.error('Params:', params);
          callback(err, null);
        } else {
          callback(null, result.rows[0] || null);
        }
      }
    });
  },

  // Wrapper for db.all (SELECT multiple rows)
  all: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // Convert double quotes to single quotes for PostgreSQL
    let modifiedQuery = db.convertStringLiterals(query);
    
    // Convert ? placeholders to PostgreSQL format
    modifiedQuery = db.convertPlaceholders(modifiedQuery, params);
    
    pool.query(modifiedQuery, params || [], (err, result) => {
      if (callback) {
        if (err) {
          callback(err, null);
        } else {
          callback(null, result.rows || []);
        }
      }
    });
  },

  // Wrapper for db.serialize (PostgreSQL doesn't need this, but we'll make it a no-op)
  serialize: (callback) => {
    if (callback) {
      callback();
    }
  },
};

const createTables = async () => {
  try {
    // Users table (updated to support Google OAuth)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        profile_image TEXT DEFAULT 'https://via.placeholder.com/40',
        age INTEGER,
        email VARCHAR(255) NOT NULL UNIQUE,
        password TEXT,
        google_id VARCHAR(255),
        phone_number VARCHAR(20)
      )
    `);
    console.log('Users table ready');

    // Create unique index on google_id
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)
      WHERE google_id IS NOT NULL
    `).catch(err => {
      if (!err.message.includes('already exists')) {
        console.error('Error creating unique index on google_id:', err.message);
      }
    });

    // Check and add columns if they don't exist (for existing databases)
    const columnChecks = [
      { name: 'google_id', type: 'VARCHAR(255)' },
      { name: 'phone_number', type: 'VARCHAR(20)' },
    ];

    for (const col of columnChecks) {
      const columnExists = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='users' AND column_name=$1
      `, [col.name]);
      
      if (columnExists.rows.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`)
          .then(() => console.log(`${col.name} column added successfully`))
          .catch(err => console.error(`Error adding ${col.name} column:`, err.message));
      }
    }

    // User Points table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_points (
        user_id INTEGER PRIMARY KEY,
        points INTEGER DEFAULT 0,
        opt_in_leaderboard INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('User_points table ready');

    // Point Earnings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS point_earnings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        points INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Point_earnings table ready');

    // Badges table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS badges (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Badges table ready');

    // Tasks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        title TEXT NOT NULL,
        deadline TEXT,
        category TEXT,
        subtasks TEXT,
        isDone INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Tasks table ready');

    // Goals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        title TEXT NOT NULL,
        target TEXT,
        deadline TEXT,
        progress INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Goals table ready');

    // Transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Transactions table ready');

    // Events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        inviteLink TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Events table ready');

    // Habits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        name TEXT NOT NULL,
        frequency TEXT NOT NULL,
        streak INTEGER DEFAULT 0,
        completionHistory TEXT DEFAULT '[]',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Habits table ready');

    // Journal Entries table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        date TEXT NOT NULL,
        text TEXT NOT NULL,
        mood TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Journal_entries table ready');

    // Communities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        admin_only_post INTEGER DEFAULT 0,
        created_by INTEGER,
        subscribers INTEGER DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Communities table ready');

    // Subscriptions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        community_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
        UNIQUE (user_id, community_id)
      )
    `);
    console.log('Subscriptions table ready');

    // Posts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        community_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        media TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        flagged INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
      )
    `);
    console.log('Posts table ready');

    // Comments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        post_id INTEGER,
        content TEXT NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);
    console.log('Comments table ready');

    // Documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        category TEXT DEFAULT 'Uncategorized',
        description TEXT,
        tags TEXT DEFAULT '[]',
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Documents table ready');

    // Profile Pictures table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profile_pictures (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        image_url TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        display_order INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Profile_pictures table ready');

    // Conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user1_id INTEGER NOT NULL,
        user2_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_message_at TIMESTAMP,
        FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user1_id, user2_id)
      )
    `);
    console.log('Conversations table ready');

    // Messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        encrypted_content TEXT NOT NULL,
        media_url TEXT,
        media_type TEXT,
        file_name TEXT,
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Messages table ready');

    // Add opt_in_leaderboard column if it doesn't exist
    const optInExists = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='user_points' AND column_name='opt_in_leaderboard'
    `);
    
    if (optInExists.rows.length === 0) {
      await pool.query(`
        ALTER TABLE user_points ADD COLUMN opt_in_leaderboard INTEGER DEFAULT 1
      `).then(() => console.log('opt_in_leaderboard column added successfully'))
        .catch(err => {
          if (!err.message.includes('duplicate column')) {
            console.error('Error adding opt_in_leaderboard column:', err.message);
          }
        });
    }

    // Password reset tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Password_reset_tokens table ready');

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Notifications table ready');

    // Health & Wellness tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fitness_activities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        duration TEXT NOT NULL,
        calories INTEGER,
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Fitness_activities table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS diet_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        meal TEXT NOT NULL,
        calories INTEGER,
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Diet_logs table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sleep_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        hours REAL NOT NULL,
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Sleep_logs table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS water_intake (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        glasses INTEGER DEFAULT 0,
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, date)
      )
    `);
    console.log('Water_intake table ready');

    // User settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        notifications_enabled INTEGER DEFAULT 1,
        leaderboard_opt_in INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('User_settings table ready');

    // Initial data setup
    try {
      await pool.query('DELETE FROM communities');
      
      await pool.query(`
        INSERT INTO communities (id, name, description, admin_only_post, created_by) 
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [1, 'LifeHub Tips', 'Tips and tricks for using LifeHub.', 1, 1]);
      
      await pool.query(`
        INSERT INTO communities (id, name, description, admin_only_post, created_by) 
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [2, 'Job Finder', 'Post hiring opportunities or job-seeking offers.', 0, 1]);

      // Ensure initial points entry for existing users
      await pool.query(`
        INSERT INTO user_points (user_id, points, opt_in_leaderboard) 
        SELECT id, 0, 1 FROM users 
        WHERE NOT EXISTS (
          SELECT 1 FROM user_points WHERE user_points.user_id = users.id
        )
      `);
    } catch (err) {
      console.error('Error in initial data setup:', err.message);
    }

  } catch (err) {
    console.error('Error creating tables:', err.message);
  }
};

// Initialize tables
createTables();

// Export both the wrapper (for backward compatibility) and the pool (for advanced usage)
module.exports = { db, pool };
