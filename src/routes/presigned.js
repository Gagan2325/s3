const express = require('express');
const mime = require('mime-types');
const db = require('../lib/db');
const storage = require('../lib/storage');
const { verifyPresignedToken } = require('../lib/presign');

const router = express.Router();

router.all('/:bucket/*key', async (req, res) => {
  const { bucket } = req.params;
  const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
  const token = req.query.token;

  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { valid, reason } = verifyPresignedToken(token, {
    method: req.method,
    bucket,
    key,
  });

  if (!valid) return res.status(403).json({ error: `Invalid presigned URL: ${reason}` });

  if (req.method === 'GET') {
    const meta = db.prepare('SELECT * FROM objects WHERE bucket = ? AND key = ?').get(bucket, key);
    if (!meta) return res.status(404).json({ error: 'Object not found' });
    const stream = storage.read(bucket, key);
    if (!stream) return res.status(404).json({ error: 'Object not found on disk' });

    res.setHeader('Content-Type', meta.content_type || 'application/octet-stream');
    res.setHeader('Content-Length', meta.size);
    return stream.pipe(res);
  }

  if (req.method === 'PUT') {
    try {
      const { size, etag } = await storage.write(bucket, key, req);
      const contentType = req.headers['content-type'] || mime.lookup(key) || 'application/octet-stream';
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO objects (bucket, key, size, content_type, etag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(bucket, key) DO UPDATE SET
           size = excluded.size, content_type = excluded.content_type,
           etag = excluded.etag, updated_at = excluded.updated_at`
      ).run(bucket, key, size, contentType, etag, now, now);
      return res.status(201).json({ bucket, key, size, etag });
    } catch (err) {
      return res.status(500).json({ error: 'Upload failed', detail: err.message });
    }
  }

  if (req.method === 'DELETE') {
    await storage.delete(bucket, key);
    db.prepare('DELETE FROM objects WHERE bucket = ? AND key = ?').run(bucket, key);
    return res.json({ bucket, key, deleted: true });
  }

  res.status(405).json({ error: 'Method not allowed via presigned URL' });
});

module.exports = router;
