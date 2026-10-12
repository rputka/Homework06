/* Where uploaded photos are kept: the `uploads` table, so they survive hosts whose disk is wiped on restart. Services
   only use put() and isUploadUrl(), so another driver (for example S3 or Cloudflare R2) can replace this one without
   changing them; the HTTP layer serves photos with read(). */
import crypto from 'node:crypto';
import { fail } from './lib/errors.js';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/* Checks the file's first bytes, so a file can't claim to be an image it isn't. */
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  return null;
}

export function createDbStorage(db) {
  const NAME = /^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp|gif))$/;
  return {
    /* Saves image bytes; returns the URL to use in pages. Identical images share one row. */
    async put(bytes) {
      if (bytes.length > MAX_IMAGE_BYTES) fail('That image is too large. Try a smaller photo.', 413);
      const type = sniff(bytes); if (!type) fail('Upload a JPEG, PNG, WebP or GIF image.');
      const name = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '.' + TYPES[type];
      await db.run('INSERT INTO uploads (name, type, size, bytes, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (name) DO NOTHING', name, type, bytes.length, bytes, Date.now());
      return '/uploads/' + name;
    },
    isUploadUrl: url => NAME.test(String(url || '')),
    /* The photo behind an /uploads/... URL path as { type, bytes }, or null. */
    async read(urlPath) {
      const m = NAME.exec(urlPath); if (!m) return null;
      const row = await db.get('SELECT type, bytes FROM uploads WHERE name = ?', m[1]);
      return row ? { type: row.type, bytes: Buffer.from(row.bytes) } : null;
    }
  };
}
