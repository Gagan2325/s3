// Storage backend abstraction.
// Today this is local disk. To swap in S3/GCS/Azure later, implement the
// same interface (write, read, delete, exists) and change the export below.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORAGE_ROOT = process.env.STORAGE_ROOT || (process.env.VERCEL ? '/tmp/media-store-objects' : './data/objects');

function objectPath(bucket, key) {
  // Namespace by bucket, then hash the key into subdirectories so a bucket
  // with millions of objects doesn't dump everything into one flat dir.
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const sub1 = hash.slice(0, 2);
  const sub2 = hash.slice(2, 4);
  return path.join(STORAGE_ROOT, bucket, sub1, sub2, encodeURIComponent(key));
}

const localDiskBackend = {
  async write(bucket, key, readStream) {
    const dest = objectPath(bucket, key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    const hash = crypto.createHash('md5');
    let size = 0;

    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(dest);
      readStream.on('data', (chunk) => {
        hash.update(chunk);
        size += chunk.length;
      });
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      readStream.pipe(writeStream);
    });

    return { size, etag: hash.digest('hex') };
  },

  read(bucket, key) {
    const p = objectPath(bucket, key);
    if (!fs.existsSync(p)) return null;
    return fs.createReadStream(p);
  },

  async delete(bucket, key) {
    const p = objectPath(bucket, key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  },

  async deleteBucket(bucket) {
    const dir = path.join(STORAGE_ROOT, bucket);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  },

  exists(bucket, key) {
    return fs.existsSync(objectPath(bucket, key));
  },
};

module.exports = localDiskBackend;
