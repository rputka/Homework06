/* Talks to the Nearhand API. Every call resolves to the JSON response, which always has ok (true/false), error (a
   message safe to show) when ok is false, and status (the HTTP status; 0 when the server couldn't be reached).
   Writes carry the X-Nearhand header the server requires (see server/http/app.js). */
async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: { 'X-Nearhand': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection and try again.' };
  }
  const data = await res.json().catch(() => ({ ok: false, error: 'The server sent an unexpected response.' }));
  return { ...data, ok: res.ok && data.ok !== false, status: res.status };
}

export const api = {
  get: url => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: url => request('DELETE', url)
};

/* Query string from an object, skipping empty values. */
export const qs = o => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };
