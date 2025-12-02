const { db } = require('../config/db');

/**
 * Migration script to add google_id column to users table
 * Run this if the column is missing: node src/utils/migrate.js
 */
const addGoogleIdColumn = () => {
  return new Promise((resolve, reject) => {
    // Check if column exists
    db.get(
      "SELECT name FROM pragma_table_info('users') WHERE name='google_id'",
      (err, row) => {
        if (err) {
          console.error('Error checking for google_id column:', err.message);
          reject(err);
          return;
        }

        if (row) {
          console.log('✓ google_id column already exists');
          resolve();
          return;
        }

        // Column doesn't exist, add it
        // SQLite doesn't support UNIQUE in ALTER TABLE, so we add the column first
        // then create a unique index
        console.log('Adding google_id column to users table...');
        db.run(
          'ALTER TABLE users ADD COLUMN google_id TEXT',
          (err) => {
            if (err) {
              console.error('✗ Error adding google_id column:', err.message);
              reject(err);
              return;
            }
            
            // Create unique index on google_id
            console.log('Creating unique index on google_id...');
            db.run(
              'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)',
              (err) => {
                if (err) {
                  console.error('✗ Error creating unique index:', err.message);
                  reject(err);
                } else {
                  console.log('✓ google_id column and unique index added successfully');
                  resolve();
                }
              }
            );
          }
        );
      }
    );
  });
};

// Run migration if called directly
if (require.main === module) {
  addGoogleIdColumn()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { addGoogleIdColumn };

