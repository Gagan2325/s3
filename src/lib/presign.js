const crypto = require('crypto');

const SECRET = process.env.PRESIGN_SECRET || 'dev-secret-change-me';

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

// method: 'GET' | 'PUT' | 'DELETE'
function generatePresignedToken({ method, bucket, key, expiresInSeconds = 3600 }) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${method}:${bucket}:${key}:${expires}`;
  const signature = sign(payload);
  const token = Buffer.from(`${payload}:${signature}`).toString('base64url');
  return { token, expires };
}

function verifyPresignedToken(token, { method, bucket, key }) {
  let decoded;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return { valid: false, reason: 'Malformed token' };
  }

  const parts = decoded.split(':');
  if (parts.length !== 5) return { valid: false, reason: 'Malformed token' };
  const [tMethod, tBucket, tKey, tExpires, signature] = parts;

  const payload = `${tMethod}:${tBucket}:${tKey}:${tExpires}`;
  const expected = sign(payload);

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'Invalid signature' };
  }

  if (Number(tExpires) < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'Expired' };
  }

  if (tMethod !== method || tBucket !== bucket || tKey !== key) {
    return { valid: false, reason: 'Token does not match request' };
  }

  return { valid: true };
}

module.exports = { generatePresignedToken, verifyPresignedToken };
