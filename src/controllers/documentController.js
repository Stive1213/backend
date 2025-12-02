const { db } = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure documents upload directory exists
const documentsDir = path.join(__dirname, '../../uploads/documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
  console.log('Created documents upload directory');
}

// Multer configuration for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

// File filter - allow common document types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed',
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Middleware for single file upload
const uploadSingle = upload.single('file');

// Get all documents for a user
const getDocuments = (req, res) => {
  const { category, search } = req.query;
  let query = 'SELECT * FROM documents WHERE user_id = ?';
  const params = [req.user.id];

  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (original_filename LIKE ? OR description LIKE ? OR tags LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY uploaded_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const documents = rows.map((doc) => ({
      ...doc,
      tags: JSON.parse(doc.tags || '[]'),
    }));
    res.json(documents);
  });
};

// Get document categories for a user
const getCategories = (req, res) => {
  db.all(
    'SELECT DISTINCT category, COUNT(*) as count FROM documents WHERE user_id = ? GROUP BY category ORDER BY category',
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
};

// Upload a new document
const uploadDocument = (req, res) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { category = 'Uncategorized', description = '', tags = '[]' } = req.body;
    const tagsArray = typeof tags === 'string' ? JSON.parse(tags || '[]') : tags;

    db.run(
      `INSERT INTO documents 
       (user_id, filename, original_filename, file_path, file_size, mime_type, category, description, tags) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        category,
        description,
        JSON.stringify(tagsArray),
      ],
      function (err) {
        if (err) {
          // Delete uploaded file if database insert fails
          fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: err.message });
        }

        res.status(201).json({
          id: this.lastID,
          filename: req.file.filename,
          original_filename: req.file.originalname,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          category,
          description,
          tags: tagsArray,
          uploaded_at: new Date().toISOString(),
        });
      }
    );
  });
};

// Update document (category, description, tags)
const updateDocument = (req, res) => {
  const { id } = req.params;
  const { category, description, tags } = req.body;

  const updates = [];
  const params = [];

  if (category !== undefined) {
    updates.push('category = ?');
    params.push(category);
  }

  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }

  if (tags !== undefined) {
    const tagsArray = typeof tags === 'string' ? JSON.parse(tags || '[]') : tags;
    updates.push('tags = ?');
    params.push(JSON.stringify(tagsArray));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id, req.user.id);

  db.run(
    `UPDATE documents SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    params,
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ message: 'Document updated successfully' });
    }
  );
};

// Delete a document
const deleteDocument = (req, res) => {
  const { id } = req.params;

  // First, get the file path
  db.get(
    'SELECT file_path FROM documents WHERE id = ? AND user_id = ?',
    [id, req.user.id],
    (err, doc) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Delete from database
      db.run('DELETE FROM documents WHERE id = ? AND user_id = ?', [id, req.user.id], (deleteErr) => {
        if (deleteErr) {
          return res.status(500).json({ error: deleteErr.message });
        }

        // Delete physical file
        if (fs.existsSync(doc.file_path)) {
          fs.unlinkSync(doc.file_path);
        }

        res.json({ message: 'Document deleted successfully' });
      });
    }
  );
};

// Download a document
const downloadDocument = (req, res) => {
  const { id } = req.params;

  db.get(
    'SELECT * FROM documents WHERE id = ? AND user_id = ?',
    [id, req.user.id],
    (err, doc) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (!fs.existsSync(doc.file_path)) {
        return res.status(404).json({ error: 'File not found on server' });
      }

      res.download(doc.file_path, doc.original_filename, (downloadErr) => {
        if (downloadErr) {
          console.error('Download error:', downloadErr);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error downloading file' });
          }
        }
      });
    }
  );
};

module.exports = {
  getDocuments,
  getCategories,
  uploadDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
};

