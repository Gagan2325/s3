require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');

const { requireApiKey } = require('./lib/auth');
const bucketsRouter = require('./routes/buckets');
const objectsRouter = require('./routes/objects');
const presignedRouter = require('./routes/presigned');

const PORT = process.env.PORT || 4000;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024 * 1024;

const app = express();
app.use(cors());
app.use(morgan('combined'));

// Health check - no auth required
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Simple browser-based admin UI - no auth on the static shell itself,
// the UI calls authenticated endpoints using a key the user enters.
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));

// Presigned URLs are self-authenticating via signed token, not API key.
// IMPORTANT: raw body needed for PUT uploads via presigned URL.
app.use('/presigned', presignedRouter);

// Everything else requires an API key
app.use('/buckets', requireApiKey);
app.use('/buckets', (req, res, next) => {
  // Enforce max upload size for raw-body PUT requests
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'Payload too large' });
  }
  next();
});
app.use('/buckets', bucketsRouter);
app.use('/buckets/:bucket/objects', objectsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`media-store listening on http://localhost:${PORT}`);
  console.log(`Admin UI: http://localhost:${PORT}/admin`);
});
