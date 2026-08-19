const express = require('express');
const mime = require('mime-types');
const db = require('../lib/db');
const storage = require('../lib/storage');
const { generatePresignedToken } = require('../lib/presign');

const router = express.Router({ mergeParams: true });

function bucketExists(bucket) {
  return !!db.prepare('SELECT name FROM buckets WHERE name = ?').get(bucket);
}

// List objects in a bucket (optional ?prefix=)
router.get('/', (req, res) => {
  const { bucket } = req.params;
  if (!bucketExists(bucket)) return res.status(404).json({ error: 'Bucket not found' });

  const { prefix = '', limit = 1000 } = req.query;
  const rows = db
    .prepare(
      'SELECT key, size, content_type, etag, created_at, updated_at FROM objects WHERE bucket = ? AND key LIKE ? ORDER BY key ASC LIMIT ?'
    )
    .all(bucket, `${prefix}%`, Number(limit));

  res.json({ bucket, prefix, objects: rows });
});

// Upload an object. Body is the raw file bytes; key is the wildcard path.
router.put('/*key', async (req, res) => {
  const { bucket } = req.params;
  const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
  if (!bucketExists(bucket)) return res.status(404).json({ error: 'Bucket not found' });
  if (!key) return res.status(400).json({ error: 'Object key required' });

  try {
    const { size, etag } = await storage.write(bucket, key, req);
    const contentType = req.headers['content-type'] || mime.lookup(key) || 'application/octet-stream';
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO objects (bucket, key, size, content_type, etag, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bucket, key) DO UPDATE SET
         size = excluded.size,
         content_type = excluded.content_type,
         etag = excluded.etag,
         updated_at = excluded.updated_at`
    ).run(bucket, key, size, contentType, etag, now, now);

    res.status(201).json({ bucket, key, size, etag, content_type: contentType });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

// Download an object
router.get('/*key', (req, res) => {
  const { bucket } = req.params;
  const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
  if (!bucketExists(bucket)) return res.status(404).json({ error: 'Bucket not found' });

  const meta = db.prepare('SELECT * FROM objects WHERE bucket = ? AND key = ?').get(bucket, key);
  if (!meta) return res.status(404).json({ error: 'Object not found' });

  const stream = storage.read(bucket, key);
  if (!stream) return res.status(404).json({ error: 'Object not found on disk' });

  res.setHeader('Content-Type', meta.content_type || 'application/octet-stream');
  res.setHeader('Content-Length', meta.size);
  res.setHeader('ETag', meta.etag);
  stream.pipe(res);
});

// Delete an object
router.delete('/*key', async (req, res) => {
  const { bucket } = req.params;
  const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
  if (!bucketExists(bucket)) return res.status(404).json({ error: 'Bucket not found' });

  const meta = db.prepare('SELECT key FROM objects WHERE bucket = ? AND key = ?').get(bucket, key);
  if (!meta) return res.status(404).json({ error: 'Object not found' });

  await storage.delete(bucket, key);
  db.prepare('DELETE FROM objects WHERE bucket = ? AND key = ?').run(bucket, key);

  res.json({ bucket, key, deleted: true });
});

// Generate a presigned URL for temporary GET or PUT access
router.post('/presign/*key', (req, res) => {
  const { bucket } = req.params;
  const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
  const method = (req.query.method || 'GET').toUpperCase();
  const expiresIn = Math.min(Number(req.query.expiresIn) || 3600, 7 * 24 * 3600); // cap at 7 days

  if (!['GET', 'PUT', 'DELETE'].includes(method)) {
    return res.status(400).json({ error: 'method must be GET, PUT, or DELETE' });
  }
  if (!bucketExists(bucket)) return res.status(404).json({ error: 'Bucket not found' });

  const { token, expires } = generatePresignedToken({
    method,
    bucket,
    key,
    expiresInSeconds: expiresIn,
  });

  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${base}/presigned/${bucket}/${encodeURIComponent(key)}?token=${token}`;

  res.json({ url, method, expires_at: new Date(expires * 1000).toISOString() });
});

module.exports = router;
