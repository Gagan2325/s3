const crypto = require('crypto');

function getValidKeys() {
  return (process.env.API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Requires an `Authorization: Bearer <key>` or `X-Api-Key: <key>` header.
function requireApiKey(req, res, next) {
  const validKeys = getValidKeys();
  const header = req.headers['authorization'];
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  const key = bearer || req.headers['x-api-key'];

  if (!key) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  const ok = validKeys.some((valid) => timingSafeEqual(valid, key));
  if (!ok) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

module.exports = { requireApiKey, getValidKeys };
