const { db } = require('../config/db');

const search = (req, res, next) => {
  try {
    const userId = req.user.id;
    const { query } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.json({
        tasks: [],
        goals: [],
        habits: [],
        journal: [],
        documents: [],
        events: [],
      });
    }
    
    const searchTerm = `%${query.trim()}%`;
    const results = {
      tasks: [],
      goals: [],
      habits: [],
      journal: [],
      documents: [],
      events: [],
    };
    
    // Search tasks
    db.all(
      'SELECT id, title, deadline, category, isDone FROM tasks WHERE user_id = ? AND (title LIKE ? OR category LIKE ?)',
      [userId, searchTerm, searchTerm],
      (err, tasks) => {
        if (!err) results.tasks = tasks;
        
        // Search goals
        db.all(
          'SELECT id, title, target, deadline, progress FROM goals WHERE user_id = ? AND (title LIKE ? OR target LIKE ?)',
          [userId, searchTerm, searchTerm],
          (err, goals) => {
            if (!err) results.goals = goals;
            
            // Search habits
            db.all(
              'SELECT id, name, frequency, streak FROM habits WHERE user_id = ? AND name LIKE ?',
              [userId, searchTerm],
              (err, habits) => {
                if (!err) results.habits = habits;
                
                // Search journal entries
                db.all(
                  'SELECT id, date, text, mood FROM journal_entries WHERE user_id = ? AND (text LIKE ? OR mood LIKE ?)',
                  [userId, searchTerm, searchTerm],
                  (err, journal) => {
                    if (!err) results.journal = journal;
                    
                    // Search documents
                    db.all(
                      'SELECT id, filename, original_filename, category, description FROM documents WHERE user_id = ? AND (original_filename LIKE ? OR category LIKE ? OR description LIKE ?)',
                      [userId, searchTerm, searchTerm, searchTerm],
                      (err, documents) => {
                        if (!err) results.documents = documents;
                        
                        // Search events
                        db.all(
                          'SELECT id, title, date, time FROM events WHERE user_id = ? AND title LIKE ?',
                          [userId, searchTerm],
                          (err, events) => {
                            if (!err) results.events = events;
                            
                            res.json(results);
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { search };

