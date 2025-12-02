const { db } = require('../config/db');

/**
 * Migration script to make password and age columns nullable
 * This allows Google OAuth users to have NULL passwords
 * Run this: node src/utils/migrate-password.js
 */
const migratePasswordColumn = () => {
  return new Promise((resolve, reject) => {
    console.log('Starting password column migration...\n');

    // SQLite doesn't support ALTER COLUMN directly, so we need to:
    // 1. Create a new table with the correct schema
    // 2. Copy data from old table
    // 3. Drop old table
    // 4. Rename new table

    db.serialize(() => {
      // Step 1: Check if password column has NOT NULL constraint
      db.get(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
        (err, row) => {
          if (err) {
            console.error('Error checking table schema:', err.message);
            reject(err);
            return;
          }

          const tableSql = row.sql;
          console.log('Current table schema detected.');

          // Check if password has NOT NULL
          if (tableSql.includes('password TEXT NOT NULL')) {
            console.log('⚠️  Password column has NOT NULL constraint. Migrating...\n');

            // Step 2: Create new table with nullable password and age
            db.run(`
              CREATE TABLE IF NOT EXISTS users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                profile_image TEXT DEFAULT 'https://via.placeholder.com/40',
                age INTEGER,
                email TEXT NOT NULL UNIQUE,
                password TEXT,
                google_id TEXT
              )
            `, (err) => {
              if (err) {
                console.error('Error creating new table:', err.message);
                reject(err);
                return;
              }
              console.log('✓ Created new users table with nullable columns');

              // Step 3: Copy data from old table to new table
              db.run(`
                INSERT INTO users_new (id, username, first_name, last_name, profile_image, age, email, password, google_id)
                SELECT id, username, first_name, last_name, profile_image, age, email, password, google_id
                FROM users
              `, (err) => {
                if (err) {
                  console.error('Error copying data:', err.message);
                  reject(err);
                  return;
                }
                console.log('✓ Copied data to new table');

                // Step 4: Drop old table
                db.run('DROP TABLE users', (err) => {
                  if (err) {
                    console.error('Error dropping old table:', err.message);
                    reject(err);
                    return;
                  }
                  console.log('✓ Dropped old table');

                  // Step 5: Rename new table
                  db.run('ALTER TABLE users_new RENAME TO users', (err) => {
                    if (err) {
                      console.error('Error renaming table:', err.message);
                      reject(err);
                      return;
                    }
                    console.log('✓ Renamed new table to users');

                    // Step 6: Recreate indexes
                    db.run(
                      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)',
                      (err) => {
                        if (err && !err.message.includes('already exists')) {
                          console.error('Error creating index:', err.message);
                        } else {
                          console.log('✓ Recreated indexes');
                        }
                        console.log('\n✅ Migration completed successfully!');
                        resolve();
                      }
                    );
                  });
                });
              });
            });
          } else {
            console.log('✓ Password column is already nullable. No migration needed.');
            resolve();
          }
        }
      );
    });
  });
};

// Run migration if called directly
if (require.main === module) {
  migratePasswordColumn()
    .then(() => {
      console.log('\nMigration process completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migratePasswordColumn };

