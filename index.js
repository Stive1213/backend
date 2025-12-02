const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const port = 5000;

app.use(express.json());
app.use(cors());

const db = new sqlite3.Database('./life_management.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database');
});

// Updated Users table with profile_image
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    profile_image TEXT DEFAULT 'https://via.placeholder.com/40'
  )
`, (err) => {
  if (err) console.error('Error creating users table:', err);
  else console.log('Users table ready');
});

// User Points table for gamification
db.run(`
  CREATE TABLE IF NOT EXISTS user_points (
    user_id INTEGER PRIMARY KEY,
    points INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`, (err) => {
  if (err) console.error('Error creating user_points table:', err);
  else console.log('User_points table ready');
});

// Tasks table
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
    )
  `, (err) => {
    if (err) console.error('Error creating tasks table:', err);
    else console.log('Tasks table ready');
  });

// Goals table
db.run(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      target TEXT,
      deadline TEXT,
      progress INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.error('Error creating goals table:', err);
    else console.log('Goals table ready');
  });

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
    )
  `, (err) => {
    if (err) console.error('Error creating transactions table:', err);
    else console.log('Transactions table ready');
  });

db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      inviteLink TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.error('Error creating events table:', err);
    else console.log('Events table ready');
  });

db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      streak INTEGER DEFAULT 0,
      completionHistory TEXT DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.error('Error creating habits table:', err);
    else console.log('Habits table ready');
  });

db.run(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      date TEXT NOT NULL,
      text TEXT NOT NULL,
      mood TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.error('Error creating journal_entries table:', err);
    else console.log('Journal_entries table ready');
  });

// Community table
db.run(`
    CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      admin_only_post INTEGER DEFAULT 0,
      created_by INTEGER,
      subscribers INTEGER DEFAULT 0,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.error('Error creating communities table:', err);
    else console.log('Communities table ready');
  });

// Subscription table
db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      community_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (community_id) REFERENCES communities(id),
      UNIQUE (user_id, community_id)
    )
  `, (err) => {
    if (err) console.error('Error creating subscriptions table:', err);
    else console.log('Subscriptions table ready');
  });

// Posts table
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
  )
`, (err) => {
  if (err) console.error('Error creating posts table:', err);
  else console.log('Posts table ready');
});

// Comments table
db.run(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    content TEXT NOT NULL,
    date TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  )
`, (err) => {
  if (err) console.error('Error creating comments table:', err);
  else console.log('Comments table ready');
});

// Insert initial communities with specific settings
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
});

// Ensure initial points entry for new users
db.run(`
  INSERT OR IGNORE INTO user_points (user_id, points) 
  SELECT id, 0 FROM users WHERE NOT EXISTS (SELECT 1 FROM user_points WHERE user_points.user_id = users.id)
`);

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (email, password, profile_image) VALUES (?, ?, ?)',
      [email, hashedPassword, 'https://via.placeholder.com/40'],
      function (err) {
        if (err) return res.status(400).json({ error: 'Email already exists' });
        const userId = this.lastID;
        // Insert initial points for new user
        db.run('INSERT INTO user_points (user_id, points) VALUES (?, 0)', [userId], (err) => {
          if (err) console.error('Error initializing points:', err);
        });
        res.status(201).json({ message: 'Signup successful' });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid email or password' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email }, 'your-secret-key', {
      expiresIn: '1h',
    });
    res.json({ token });
  });
});

app.get('/api/user', authenticateToken, (req, res) => {
    console.log('Fetching user data for ID:', req.user.id); // Debug log
    db.get(`
      SELECT u.id, u.email, u.profile_image, COALESCE(up.points, 0) as points
      FROM users u
      LEFT JOIN user_points up ON u.id = up.user_id
      WHERE u.id = ?
    `, [req.user.id], (err, user) => {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!user) {
        console.log('No user found for ID:', req.user.id); // Debug log
        return res.status(404).json({ error: 'User not found' });
      }
      console.log('User found:', user); // Debug log
      res.json({
        points: user.points,
        username: user.email.split('@')[0],
        profileImage: user.profile_image,
      });
    });
  });

// Tasks endpoints
app.get('/api/tasks', authenticateToken, (req, res) => {
  db.all('SELECT * FROM tasks WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const tasks = rows.map((task) => ({
      ...task,
      subtasks: JSON.parse(task.subtasks || '[]'),
      isDone: !!task.isDone,
    }));
    res.json(tasks);
  });
});

app.post('/api/tasks', authenticateToken, (req, res) => {
  const { title, deadline, category, subtasks } = req.body;
  const subtasksJson = JSON.stringify(subtasks || []);
  db.run(
    'INSERT INTO tasks (user_id, title, deadline, category, subtasks, isDone) VALUES (?, ?, ?, ?, ?, 0)',
    [req.user.id, title, deadline, category, subtasksJson],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Add points for task creation (e.g., 10 points)
      db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [req.user.id]);
      res.status(201).json({ id: this.lastID, title, deadline, category, subtasks, isDone: false });
    }
  );
});

app.put('/api/tasks/:id', authenticateToken, (req, res) => {
  const { isDone } = req.body;
  db.run(
    'UPDATE tasks SET isDone = ? WHERE id = ? AND user_id = ?',
    [isDone ? 1 : 0, req.params.id, req.user.id],
    function (err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Task not found' });
      // Add points for completing a task (e.g., 20 points)
      if (isDone) {
        db.run('UPDATE user_points SET points = points + 20 WHERE user_id = ?', [req.user.id]);
      }
      res.json({ message: 'Task updated' });
    }
  );
});

// Goals endpoints
app.get('/api/goals', authenticateToken, (req, res) => {
  db.all('SELECT * FROM goals WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/goals', authenticateToken, (req, res) => {
  const { title, target, deadline, progress } = req.body;
  db.run(
    'INSERT INTO goals (user_id, title, target, deadline, progress) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, target, deadline, progress || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Add points for goal creation (e.g., 15 points)
      db.run('UPDATE user_points SET points = points + 15 WHERE user_id = ?', [req.user.id]);
      res.status(201).json({ id: this.lastID, title, target, deadline, progress: progress || 0 });
    }
  );
});

app.put('/api/goals/:id', authenticateToken, (req, res) => {
  const { title, target, deadline, progress } = req.body;
  db.run(
    'UPDATE goals SET title = ?, target = ?, deadline = ?, progress = ? WHERE id = ? AND user_id = ?',
    [title, target, deadline, progress, req.params.id, req.user.id],
    function (err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Goal not found' });
      res.json({ message: 'Goal updated' });
    }
  );
});

// Transactions endpoints
app.get('/api/transactions', authenticateToken, (req, res) => {
  db.all('SELECT * FROM transactions WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/transactions', authenticateToken, (req, res) => {
  const { type, amount, category, date, description } = req.body;
  db.run(
    'INSERT INTO transactions (user_id, type, amount, category, date, description) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, type, amount, category, date, description || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Add points for transaction logging (e.g., 5 points)
      db.run('UPDATE user_points SET points = points + 5 WHERE user_id = ?', [req.user.id]);
      res.status(201).json({ id: this.lastID, type, amount, category, date, description: description || '' });
    }
  );
});

// Events endpoints
app.get('/api/events', authenticateToken, (req, res) => {
  db.all('SELECT * FROM events WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/events', authenticateToken, (req, res) => {
  const { title, date, time, inviteLink } = req.body;
  db.run(
    'INSERT INTO events (user_id, title, date, time, inviteLink) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, date, time, inviteLink || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Add points for event creation (e.g., 10 points)
      db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [req.user.id]);
      res.status(201).json({ id: this.lastID, title, date, time, inviteLink: inviteLink || '' });
    }
  );
});

// Habits endpoints
app.get('/api/habits', authenticateToken, (req, res) => {
  db.all('SELECT * FROM habits WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const habits = rows.map((habit) => ({
      ...habit,
      completionHistory: JSON.parse(habit.completionHistory || '[]'),
    }));
    res.json(habits);
  });
});

app.post('/api/habits', authenticateToken, (req, res) => {
  const { name, frequency } = req.body;
  const completionHistory = JSON.stringify([]);
  db.run(
    'INSERT INTO habits (user_id, name, frequency, streak, completionHistory) VALUES (?, ?, ?, 0, ?)',
    [req.user.id, name, frequency, completionHistory],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Add points for habit creation (e.g., 10 points)
      db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [req.user.id]);
      res.status(201).json({ id: this.lastID, name, frequency, streak: 0, completionHistory: [] });
    }
  );
});

app.put('/api/habits/:id', authenticateToken, (req, res) => {
  const { streak, completionHistory } = req.body;
  const completionHistoryJson = JSON.stringify(completionHistory);
  db.run(
    'UPDATE habits SET streak = ?, completionHistory = ? WHERE id = ? AND user_id = ?',
    [streak, completionHistoryJson, req.params.id, req.user.id],
    function (err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Habit not found' });
      // Add points for habit update (e.g., 5 points per streak increment)
      if (streak > 0) {
        db.run('UPDATE user_points SET points = points + 5 WHERE user_id = ?', [req.user.id]);
      }
      res.json({ message: 'Habit updated' });
    }
  );
});

// Journal endpoints
app.get('/api/journal', authenticateToken, (req, res) => {
  db.all('SELECT * FROM journal_entries WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/journal', authenticateToken, (req, res) => {
  const { date, text, mood } = req.body;
  db.run(
    'INSERT INTO journal_entries (user_id, date, text, mood) VALUES (?, ?, ?, ?)',
    [req.user.id, date, text, mood],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Add points for journal entry (e.g., 10 points)
      db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [req.user.id]);
      res.status(201).json({ id: this.lastID, date, text, mood });
    }
  );
});

// Communities endpoints
app.get('/api/communities', authenticateToken, (req, res) => {
  db.all(`
    SELECT c.*, 
           (SELECT COUNT(*) FROM subscriptions s WHERE s.community_id = c.id) as subscriber_count,
           EXISTS(SELECT 1 FROM subscriptions s WHERE s.community_id = c.id AND s.user_id = ?) as is_subscribed
    FROM communities c
    GROUP BY c.id, c.name, c.description, c.admin_only_post, c.created_by
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      subscribers: row.subscriber_count,
      isSubscribed: !!row.is_subscribed
    })));
  });
});

app.post('/api/subscriptions', authenticateToken, (req, res) => {
  const { community_id } = req.body;
  if (!community_id) return res.status(400).json({ error: 'Community ID is required' });

  db.get('SELECT id FROM communities WHERE id = ?', [community_id], (err, community) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    db.run(
      'INSERT OR IGNORE INTO subscriptions (user_id, community_id) VALUES (?, ?)',
      [req.user.id, community_id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Already subscribed' });
        db.run('UPDATE communities SET subscribers = subscribers + 1 WHERE id = ?', [community_id]);
        // Add points for subscribing (e.g., 5 points)
        db.run('UPDATE user_points SET points = points + 5 WHERE user_id = ?', [req.user.id]);
        res.status(201).json({ message: 'Subscribed successfully' });
      }
    );
  });
});

app.delete('/api/subscriptions', authenticateToken, (req, res) => {
  const { community_id } = req.body;
  if (!community_id) return res.status(400).json({ error: 'Community ID is required' });

  db.run(
    'DELETE FROM subscriptions WHERE user_id = ? AND community_id = ?',
    [req.user.id, community_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not subscribed' });
      db.run('UPDATE communities SET subscribers = subscribers - 1 WHERE id = ? AND subscribers > 0', [community_id]);
      res.json({ message: 'Unsubscribed successfully' });
    }
  );
});

app.get('/api/subscriptions', authenticateToken, (req, res) => {
  db.all(`
    SELECT c.*, 
           (SELECT COUNT(*) FROM subscriptions s WHERE s.community_id = c.id) as subscriber_count
    FROM communities c
    INNER JOIN subscriptions s ON c.id = s.community_id
    WHERE s.user_id = ?
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      subscribers: row.subscriber_count,
      isSubscribed: true
    })));
  });
});

// Posts endpoints
app.get('/api/posts', authenticateToken, (req, res) => {
  const { community_id } = req.query;
  if (!community_id) return res.status(400).json({ error: 'Community ID is required' });

  db.all(`
    SELECT p.*, u.email as author 
    FROM posts p 
    JOIN users u ON p.user_id = u.id 
    WHERE p.community_id = ?
  `, [community_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/posts', authenticateToken, (req, res) => {
  const { community_id, title, content, category, media } = req.body;
  if (!community_id || !title || !content || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.get('SELECT admin_only_post, created_by FROM communities WHERE id = ?', [community_id], (err, community) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    if (community.admin_only_post && req.user.id !== community.created_by) {
      return res.status(403).json({ error: 'Only admins can post in this community' });
    }

    if (!community.admin_only_post) {
      db.get('SELECT id FROM subscriptions WHERE user_id = ? AND community_id = ?', [req.user.id, community_id], (err, subscription) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!subscription) return res.status(403).json({ error: 'You must be subscribed to post in this community' });

        db.run(
          'INSERT INTO posts (user_id, community_id, title, content, category, media) VALUES (?, ?, ?, ?, ?, ?)',
          [req.user.id, community_id, title, content, category, media || ''],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            // Add points for posting (e.g., 10 points)
            db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [req.user.id]);
            res.status(201).json({
              id: this.lastID,
              user_id: req.user.id,
              community_id,
              title,
              content,
              category,
              media: media || '',
              date: new Date().toISOString(),
              upvotes: 0,
              downvotes: 0,
              flagged: 0,
              author: req.user.email
            });
          }
        );
      });
    } else {
      db.run(
        'INSERT INTO posts (user_id, community_id, title, content, category, media) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, community_id, title, content, category, media || ''],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          // Add points for posting (e.g., 10 points)
          db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [req.user.id]);
          res.status(201).json({
            id: this.lastID,
            user_id: req.user.id,
            community_id,
            title,
            content,
            category,
            media: media || '',
            date: new Date().toISOString(),
            upvotes: 0,
            downvotes: 0,
            flagged: 0,
            author: req.user.email
          });
        }
      );
    }
  });
});

app.post('/api/posts/vote', authenticateToken, (req, res) => {
  const { post_id, type } = req.body;
  const field = type === 'upvote' ? 'upvotes' : 'downvotes';
  db.run(
    `UPDATE posts SET ${field} = ${field} + 1 WHERE id = ?`,
    [post_id],
    function (err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Post not found' });
      // Add points for voting (e.g., 2 points)
      db.run('UPDATE user_points SET points = points + 2 WHERE user_id = ?', [req.user.id]);
      res.json({ message: 'Vote recorded' });
    }
  );
});

app.post('/api/posts/flag', authenticateToken, (req, res) => {
  const { post_id } = req.body;
  db.run(
    'UPDATE posts SET flagged = 1 WHERE id = ?',
    [post_id],
    function (err) {
      if (err || this.changes === 0) return res.status(404).json({ error: 'Post not found' });
      res.json({ message: 'Post flagged' });
    }
  );
});

// Comments endpoints
app.get('/api/comments', authenticateToken, (req, res) => {
  const { post_id } = req.query;
  if (!post_id) return res.status(400).json({ error: 'Post ID is required' });

  db.all(`
    SELECT c.*, u.email as author 
    FROM comments c 
    JOIN users u ON c.user_id = u.id 
    WHERE c.post_id = ?
  `, [post_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/comments', authenticateToken, (req, res) => {
  const { post_id, content } = req.body;
  if (!post_id || !content) return res.status(400).json({ error: 'Missing required fields' });

  db.run(
    'INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)',
    [req.user.id, post_id, content],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Add points for commenting (e.g., 5 points)
      db.run('UPDATE user_points SET points = points + 5 WHERE user_id = ?', [req.user.id]);
      res.status(201).json({
        id: this.lastID,
        user_id: req.user.id,
        post_id,
        content,
        date: new Date().toISOString(),
        author: req.user.email
      });
    }
  );
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});