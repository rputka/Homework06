/* Photo uploads: shrink the image in the browser, send it to POST /api/uploads, and get back its /uploads/... URL. */
import { api } from '../api.js';

function compress(file, max) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* Resolves to the uploaded photo's URL; throws an Error with a message to show on failure. */
export async function uploadPhoto(file, maxSize = 1280) {
  let dataUrl;
  try { dataUrl = await compress(file, maxSize); } catch { throw new Error('That image could not be read. Try a JPEG or PNG photo.'); }
  const r = await api.post('/api/uploads', { dataUrl });
  if (!r.ok) throw new Error(r.error);
  return r.url;
}
