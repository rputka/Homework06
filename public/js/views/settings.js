/* Edit profile: account details, worker or employer profile, email notification switches, and (for workers) the
   portfolio. Data: GET /api/settings. Saved with PUT /api/settings; portfolio items with /api/portfolio. */
import { html, raw } from '../lib/html.js';
import { $, toast } from '../lib/dom.js';
import { NOTIFY_TYPES, PORTFOLIO_MAX } from '/shared/constants.js';
import { api } from '../api.js';
import { session, refreshSession } from '../session.js';
import { F, A, onChange, setCities, done } from '../actions.js';
import { go } from '../router.js';
import { field, avatar, catOptions, cityInput, portfolioCard } from '../ui/components.js';
import { uploadPhoto } from '../ui/images.js';

let newAvatar = null; // upload URL of a newly chosen profile picture

function emailPrefsFields(me) {
  return html`<hr class="divider"><h3>Email notifications</h3><p class="small muted">Everything also appears in your <a href="#/notifications">notifications</a>. Choose what is emailed to ${me.email}.</p>
  <div class="toggles">${Object.entries(NOTIFY_TYPES).filter(([, t]) => t.roles.includes(me.role))
    .map(([k, t]) => html`<label class="toggle"><input type="checkbox" name="emailPrefs" value="${k}" ${me.emailPrefs[k] === false ? '' : raw('checked')}><span>${t.label}</span></label>`)}</div>`;
}

function portfolioManager(items, categories, firstCategory) {
  return html`<section class="card raised form-card" id="portfolio"><div class="spread"><h3 style="margin:0">Portfolio</h3><span class="small muted">${items.length} of ${PORTFOLIO_MAX}</span></div>
  <p class="small muted">Show employers your best work. Before and after pairs are a great way to show the difference you make.</p>
  ${items.length ? html`<div class="pf-grid">${items.map(i => portfolioCard(i, true))}</div>` : ''}
  <form data-form="portfolio" class="pf-add"><h3>Add to portfolio</h3>
  <div class="role-pick pf-kind" role="radiogroup" aria-label="Type of portfolio item"><input type="radio" name="kind" id="pkPhoto" value="photo" checked><label for="pkPhoto">Photo<span>One photo of finished work</span></label><input type="radio" name="kind" id="pkPair" value="pair"><label for="pkPair">Before and after<span>Two photos of the same spot</span></label></div>
  <div class="form-grid"><div class="full photo-only">${field('Photo', html`<input type="file" name="photo" accept="image/*">`)}</div>
  <div class="pair-only">${field('Before photo', html`<input type="file" name="before" accept="image/*">`)}</div><div class="pair-only">${field('After photo', html`<input type="file" name="after" accept="image/*">`)}</div>
  ${field('Caption', html`<input type="text" name="caption" maxlength="140" placeholder="e.g. Rotted deck boards replaced">`)}
  ${field('Category', html`<select name="category"><option value="">No category</option>${catOptions(categories, firstCategory)}</select>`)}</div>
  <button class="btn btn-primary" ${items.length >= PORTFOLIO_MAX ? raw('disabled') : ''}>Add to portfolio</button></form></section>`;
}

export default {
  async load() {
    const [r, cities] = await Promise.all([api.get('/api/settings'), api.get('/api/cities')]);
    if (!r.ok) throw r;
    setCities(cities.cities); newAvatar = null;
    return r;
  },
  render({ profile: p, portfolio, categories }, { query }) {
    const me = session.me, isWorker = me.role === 'worker';
    const role = isWorker ? html`<h3>Worker profile</h3><div class="form-grid"><div class="full">${field('Headline', html`<input type="text" name="headline" maxlength="90" value="${p.headline}" placeholder="e.g. Licensed plumber for repairs and installs">`)}</div>
      <div class="full">${field('Biography', html`<textarea name="bio" rows="5">${p.bio}</textarea>`)}</div>
      <div class="full">${field('Skills and services', html`<input type="text" name="skills" value="${p.skills.join(', ')}" placeholder="Separate with commas">`, 'Separate each skill with a comma.')}</div>
      <div class="full"><div class="field"><label>Categories you work in</label><div class="checks">${categories.map(c => html`<label><input type="checkbox" name="categories" value="${c.id}" ${p.categories.includes(c.id) ? raw('checked') : ''}>${c.name}</label>`)}</div></div></div>
      ${field('Years of experience', html`<input type="number" name="experienceYears" min="0" max="60" value="${p.experienceYears || ''}">`)}${field('Hourly rate ($)', html`<input type="number" name="hourlyRate" min="0" value="${p.hourlyRate || ''}">`)}
      <div class="full">${field('Experience summary', html`<input type="text" name="experience" value="${p.experience}">`)}</div><div class="full">${field('Pricing notes', html`<input type="text" name="pricingNote" value="${p.pricingNote}" placeholder="Minimums, flat rates, estimates">`)}</div></div>`
      : html`<h3>Employer profile</h3>${field('Business name (optional)', html`<input type="text" name="company" value="${p.company}">`)}${field('About you', html`<textarea name="about" rows="4">${p.about}</textarea>`)}`;
    return html`<div class="page form-page"><div class="page-head"><h1 style="font-size:2rem">Edit profile</h1></div><form class="card raised" data-form="settings">
    <div class="row" style="margin-bottom:16px"><span id="avPrev">${avatar(me, 72)}</span><div><label for="avatarInput">Profile picture</label><input id="avatarInput" type="file" accept="image/*"></div></div>
    <div class="form-grid">${field('Full name', html`<input type="text" name="name" required value="${me.name}">`)}${field('Phone', html`<input type="tel" name="phone" required value="${me.phone}">`)}
    <div class="full">${field('City', cityInput(me.location))}</div></div>
    <hr class="divider">${role}${emailPrefsFields(me)}<div class="row" style="margin-top:16px"><button class="btn btn-primary">Save profile</button><a class="btn btn-outline" href="#/profile/${me.id}">Cancel</a></div>
    <p class="small muted" style="margin-top:14px">Your role (${isWorker ? 'Worker' : 'Employer'}) is fixed. To use both sides of the marketplace, create a second account.</p></form>
    ${isWorker ? portfolioManager(portfolio, categories, p.categories[0] || '') : ''}</div>`;
  },
  mount(data) { if (location.hash.includes('section=portfolio')) { const el = $('#portfolio'); if (el) el.scrollIntoView(); } }
};

onChange.avatarInput = async input => {
  if (!input.files[0]) return;
  try { newAvatar = await uploadPhoto(input.files[0], 240); $('#avPrev').innerHTML = String(html`<img class="avatar" src="${newAvatar}" alt="Preview" width="72" height="72" style="width:72px;height:72px">`); }
  catch (err) { toast(err.message, 'error'); }
};

Object.assign(F, {
  async settings(f, d) {
    const body = { ...Object.fromEntries(d), categories: d.getAll('categories'), emailPrefs: d.getAll('emailPrefs'), avatar: newAvatar };
    const r = await api.put('/api/settings', body);
    if (!r.ok) return toast(r.error, 'error');
    await refreshSession(); toast('Profile saved.'); go('#/profile/' + session.me.id);
  },
  async portfolio(f, d) {
    const kind = d.get('kind') === 'pair' ? 'pair' : 'photo', file = name => f.querySelector(`input[name=${name}]`).files[0];
    const photo = name => (file(name) ? uploadPhoto(file(name)) : '');
    let images;
    try { images = kind === 'pair' ? { before: await photo('before'), after: await photo('after') } : { src: await photo('photo') }; }
    catch (err) { return toast(err.message, 'error'); }
    await done(api.post('/api/portfolio', { kind, caption: d.get('caption'), category: d.get('category'), ...images }), 'Added to your portfolio.');
  }
});
A.removePortfolio = el => done(api.del('/api/portfolio/' + el.dataset.id), 'Removed from your portfolio.');
