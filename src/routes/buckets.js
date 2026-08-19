const express = require('express');
const db = require('../lib/db');
const storage = require('../lib/storage');

const router = express.Router();

const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

// List all buckets
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT name, created_at, owner FROM buckets ORDER BY created_at DESC').all();
  res.json({ buckets: rows });
});

// Create a bucket
router.put('/:bucket', (req, res) => {
  const { bucket } = req.params;
  if (!BUCKET_NAME_RE.test(bucket)) {
    return res.status(400).json({
      error: 'Invalid bucket name. Use 3-63 lowercase letters, numbers, or hyphens.',
    });
  }

  const existing = db.prepare('SELECT name FROM buckets WHERE name = ?').get(bucket);
  if (existing) {
    return res.status(409).json({ error: 'Bucket already exists' });
  }

  db.prepare('INSERT INTO buckets (name, created_at, owner) VALUES (?, ?, ?)').run(
    bucket,
    new Date().toISOString(),
    req.headers['x-api-key'] || 'api-key'
  );

  res.status(201).json({ bucket, created: true });
});

// Delete a bucket (must be empty)
router.delete('/:bucket', async (req, res) => {
  const { bucket } = req.params;
  const b = db.prepare('SELECT name FROM buckets WHERE name = ?').get(bucket);
  if (!b) return res.status(404).json({ error: 'Bucket not found' });

  const count = db.prepare('SELECT COUNT(*) AS c FROM objects WHERE bucket = ?').get(bucket).c;
  if (count > 0 && req.query.force !== 'true') {
    return res.status(409).json({
      error: `Bucket is not empty (${count} objects). Pass ?force=true to delete anyway.`,
    });
  }

  db.prepare('DELETE FROM objects WHERE bucket = ?').run(bucket);
  db.prepare('DELETE FROM buckets WHERE name = ?').run(bucket);
  await storage.deleteBucket(bucket);

  res.json({ bucket, deleted: true });
});

module.exports = router;
