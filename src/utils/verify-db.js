const { db } = require('../config/db');

console.log('Checking database schema...\n');

// Check columns
db.all("SELECT name FROM pragma_table_info('users')", (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    db.close();
    return;
  }
  
  console.log('Users table columns:');
  rows.forEach(row => {
    console.log(`  - ${row.name}`);
  });
  
  const hasGoogleId = rows.some(row => row.name === 'google_id');
  console.log(`\n✓ google_id column exists: ${hasGoogleId ? 'YES' : 'NO'}\n`);
  
  // Check indexes
  db.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users'", (err, indexRows) => {
    if (err) {
      console.error('Error checking indexes:', err.message);
      db.close();
      return;
    }
    
    console.log('Users table indexes:');
    indexRows.forEach(row => {
      console.log(`  - ${row.name}`);
    });
    
    const hasGoogleIdIndex = indexRows.some(row => row.name === 'idx_users_google_id');
    console.log(`\n✓ google_id unique index exists: ${hasGoogleIdIndex ? 'YES' : 'NO'}\n`);
    
    db.close();
  });
});

