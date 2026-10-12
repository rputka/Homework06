/* Sign in, sign up, verify email, and forgot / reset password. */
import { html, raw } from '../lib/html.js';
import { toast } from '../lib/dom.js';
import { first } from '/shared/format.js';
import { api } from '../api.js';
import { session, refreshSession } from '../session.js';
import { A, F, setCities, ui } from '../actions.js';
import { go, render } from '../router.js';
import { field, empty, cityInput } from '../ui/components.js';

let resetSent = null; // after "Send reset link": { found }

const narrow = (title, intro, body) => html`<div class="page"><div class="narrow stack"><div><h1 style="font-size:2rem">${title}</h1>${intro ? html`<p class="muted">${intro}</p>` : ''}</div>${body}</div></div>`;
const mail = (subject, body) => html`<div class="inbox"><div class="bar">From: Nearhand &lt;hello@nearhand.example&gt;<br>Subject: ${subject}</div><div class="msg">${body}</div></div>`;

export const login = {
  render: () => narrow('Sign in', 'Welcome back to Nearhand.', html`<form class="card raised" data-form="login">${field('Email', html`<input type="email" name="email" required autocomplete="email">`)}${field('Password', html`<input type="password" name="password" required autocomplete="current-password">`)}
    <button class="btn btn-primary btn-block">Sign in</button><p class="small" style="margin:12px 0 0"><a href="#/forgot">Forgot your password?</a></p></form>
    <p class="small">New here? <a href="#/signup">Create an account</a></p>`)
};

export const signup = {
  load: async () => { const r = await api.get('/api/cities'); setCities(r.cities); return {}; },
  render: (data, { query }) => {
    const pre = query.role === 'worker' || query.role === 'employer' ? query.role : '';
    return narrow('Create your account', 'Pick one role. It cannot be changed later, and one account cannot be both.', html`<form class="card raised" data-form="signup">
    <div class="role-pick" role="radiogroup" aria-label="Account role"><input type="radio" name="role" id="roleE" value="employer" ${pre === 'employer' ? raw('checked') : ''}><label for="roleE">Employer<span>I need work done</span></label><input type="radio" name="role" id="roleW" value="worker" ${pre === 'worker' ? raw('checked') : ''}><label for="roleW">Worker<span>I want to bid on jobs</span></label></div>
    ${field('Full name', html`<input type="text" name="name" required autocomplete="name">`)}${field('Email', html`<input type="email" name="email" required autocomplete="email">`)}${field('Password', html`<input type="password" name="password" required minlength="8" autocomplete="new-password">`, 'At least 8 characters.')}
    ${field('Phone number', html`<input type="tel" name="phone" required autocomplete="tel" placeholder="(512) 555-0100">`)}${field('City', cityInput(''))}
    <button class="btn btn-primary btn-block">Create account</button></form><p class="small">Already have an account? <a href="#/login">Sign in</a></p>`);
  }
};

export const verify = {
  render: () => {
    const u = session.pending;
    if (!u) return html`<div class="page"><div class="narrow">${empty('Nothing to verify', 'Your email is already verified, or no signup is in progress.', html`<a class="btn btn-primary" href="#/login">Sign in</a>`)}</div></div>`;
    return narrow('Check your email', html`We sent a verification link to <b>${u.email}</b>. Open the message below to finish signing up.`, html`
    ${mail('Verify your email', html`<p>Hi ${first(u.name)}, welcome to Nearhand! Confirm your email address to finish creating your ${u.role} account.</p><button class="btn btn-primary" data-act="verifyNow">Verify my email</button>`)}
    <p class="small">Did not get it? <button class="linkbtn" data-act="resend">Resend the email</button></p>`);
  }
};

export const forgot = {
  render: () => narrow('Reset your password', 'Enter your account email and we will send a reset link.', html`<form class="card raised" data-form="forgot">${field('Email', html`<input type="email" name="email" required>`)}<button class="btn btn-primary btn-block">Send reset link</button></form>
    ${resetSent ? mail('Reset your password', resetSent.found ? html`<p>Someone asked to reset the password for your Nearhand account. Use the button below to choose a new one.</p><a class="btn btn-primary" href="#/reset">Choose a new password</a>`
      : html`<p>We could not find an account with that email. Check the spelling or create a new account.</p>`) : ''}
    <p class="small"><a href="#/login">Back to sign in</a></p>`)
};

export const reset = {
  render: () => !session.resetFor
    ? html`<div class="page"><div class="narrow">${empty('This reset link has expired', 'Request a new link to continue.', html`<a class="btn btn-primary" href="#/forgot">Request a new link</a>`)}</div></div>`
    : narrow('Choose a new password', `For ${session.resetFor.email}`, html`<form class="card raised" data-form="reset">${field('New password', html`<input type="password" name="password" required minlength="8" autocomplete="new-password">`, 'At least 8 characters.')}${field('Confirm password', html`<input type="password" name="confirm" required autocomplete="new-password">`)}<button class="btn btn-primary btn-block">Update password</button></form>`)
};

Object.assign(F, {
  async login(f, d) {
    const r = await api.post('/api/auth/login', { email: d.get('email'), password: d.get('password') });
    await refreshSession();
    if (r.code === 'unverified') { toast(r.error, 'error'); return go('#/verify'); }
    if (!r.ok) return toast(r.error, 'error');
    ui.showTodos = true; toast('Welcome back, ' + first(r.name) + '.'); go('#/dashboard');
  },
  async signup(f, d) {
    const r = await api.post('/api/auth/signup', Object.fromEntries(d));
    if (!r.ok) return toast(r.error, 'error');
    await refreshSession(); go('#/verify');
  },
  async forgot(f, d) {
    const r = await api.post('/api/auth/forgot', { email: d.get('email') });
    if (!r.ok) return toast(r.error, 'error');
    resetSent = { found: r.found }; await refreshSession(); render(true);
  },
  async reset(f, d) {
    if (d.get('password') !== d.get('confirm')) return toast('Passwords do not match.', 'error');
    const r = await api.post('/api/auth/reset', { password: d.get('password') });
    if (!r.ok) return toast(r.error, 'error');
    resetSent = null; await refreshSession(); toast('Password updated. Sign in with your new password.'); go('#/login');
  }
});

Object.assign(A, {
  async verifyNow() {
    const r = await api.post('/api/auth/verify');
    if (!r.ok) return toast(r.error, 'error');
    await refreshSession(); ui.showTodos = true; toast('Email verified. Welcome to Nearhand!'); go('#/dashboard');
  },
  resend() { toast('Verification email sent again.'); }
});
