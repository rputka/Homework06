/* Background job "email": sends a notification's email copy through Resend (https://resend.com) and records the
   outcome on the notification. Settings (see server/config.js): RESEND_API_KEY, EMAIL_FROM, EMAIL_REDIRECT_TO, APP_URL. */
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderEmail(n, user, appUrl, redirected) {
  const url = appUrl + '/' + (n.link || '#/dashboard'), firstName = user.name.split(' ')[0];
  const note = redirected ? `<p style="color:#5F6B7A;font-size:13px">Test delivery: this email was addressed to ${escapeHtml(user.email)}.</p>` : '';
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1A202C">
  <div style="padding:20px 0;font-weight:700;font-size:18px"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;background:#1D3A5F;color:#fff;margin-right:8px">N</span>Nearhand</div>
  <div style="border:1px solid #E2E6EB;border-radius:10px;padding:24px">
    <p style="margin:0 0 6px;color:#5F6B7A">Hi ${escapeHtml(firstName)},</p>
    <h1 style="font-size:20px;margin:0 0 10px">${escapeHtml(n.title)}</h1>
    <p style="margin:0 0 20px;line-height:1.5">${escapeHtml(n.body)}</p>
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#1D3A5F;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600">Open in Nearhand</a>
  </div>${note}
  <p style="color:#5F6B7A;font-size:12px;margin-top:18px">You can turn these emails off in Edit profile, under Email notifications.</p></div>`;
  return { subject: n.title, html, text: `Hi ${firstName},\n\n${n.title}\n${n.body}\n\nOpen in Nearhand: ${url}\n\nYou can turn these emails off in Edit profile.` };
}

export function createEmailWorker({ db, config, log = console }) {
  const { apiKey, from, redirectTo, apiUrl } = config.email, configured = !!(apiKey && from);
  if (!configured) log.log('Email: RESEND_API_KEY / EMAIL_FROM not set, so notifications stay in-app only.');
  const setStatus = (id, status, error = null) => db.run('UPDATE notifications SET email_status = ?, email_error = ?, email_at = ? WHERE id = ?', status, error, Date.now(), id);

  return async function sendEmail({ notificationId }) {
    const n = db.get('SELECT * FROM notifications WHERE id = ?', notificationId);
    if (!n || n.email_status !== 'pending') return;
    const user = db.get('SELECT name, email, email_prefs FROM users WHERE id = ?', n.user_id);
    if (!user || JSON.parse(user.email_prefs || '{}')[n.type] === false) return setStatus(n.id, 'skipped');
    if (!configured) return setStatus(n.id, 'not-configured');
    const msg = renderEmail(n, user, config.appUrl, !!redirectTo);
    let res;
    try {
      res = await fetch(apiUrl, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [redirectTo || user.email], subject: msg.subject, html: msg.html, text: msg.text }) });
    } catch (err) { throw new Error(`Could not reach Resend: ${err.message}`); } // network trouble: retry later
    if (res.ok) return setStatus(n.id, 'sent');
    const detail = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (res.status === 429 || res.status >= 500) throw new Error(detail); // busy or down: retry later
    setStatus(n.id, 'failed', detail); // refused (e.g. an address Resend won't deliver to): don't retry
  };
}
