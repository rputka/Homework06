/* A user's public profile: workers show their portfolio, skills, experience and pricing; employers show their
   open jobs (to workers and themselves). Data: GET /api/users/:id */
import { html } from '../lib/html.js';
import { openModal } from '../lib/dom.js';
import { money, plural, fmtDate, first } from '/shared/format.js';
import { api } from '../api.js';
import { A } from '../actions.js';
import { currentPage } from '../router.js';
import { avatar, stars, ratingLine, reviewItem, portfolioCard, beforeAfter, jobCard, messageButton } from '../ui/components.js';

const ratingCard = (u, dist) => html`<section class="card"><h3>Rating</h3>${u.rating.n ? html`<div class="row"><span class="price" style="font-size:2rem">${u.rating.avg.toFixed(1)}</span>${stars(u.rating.avg)}</div>` : html`<span class="muted">No ratings yet</span>`}
  <div style="margin-top:10px">${dist.map(x => html`<div class="dist"><span>${x.stars}★</span><i><b style="width:${u.rating.n ? (x.count / u.rating.n) * 100 : 0}%"></b></i><span>${x.count}</span></div>`)}</div></section>`;
const reviewsCard = (title, reviews, none) => html`<section class="card"><h3>${title} (${reviews.length})</h3>${reviews.length ? reviews.map(reviewItem) : html`<p class="muted" style="margin:0">${none}</p>`}</section>`;

function workerBody(d) {
  const { user: u, profile: p, portfolio, isMe } = d;
  return html`<div class="layout-main"><div class="stack">
    <section class="card"><h3>About</h3><p style="margin:0">${p.bio || 'This worker has not written a bio yet.'}</p></section>
    <section class="card"><div class="spread"><h3 style="margin:0">Portfolio</h3>${isMe ? html`<a class="small" href="#/settings?section=portfolio">Manage portfolio</a>` : html`<span class="small muted">${plural(portfolio.length, 'item')}</span>`}</div>
      ${portfolio.length ? html`<div class="pf-grid" style="margin-top:12px">${portfolio.map(i => portfolioCard(i))}</div>` : html`<p class="muted" style="margin:10px 0 0">${isMe ? 'Add photos of your work and before/after pairs in Edit profile.' : 'No portfolio photos yet.'}</p>`}</section>
    <section class="card"><h3>Skills and services</h3><div class="skills">${p.skills.length ? p.skills.map(s => html`<span class="chip">${s}</span>`) : html`<span class="muted">No skills listed yet.</span>`}</div>
      <p class="small muted" style="margin:12px 0 0">Categories: ${d.categoryNames.join(', ') || 'None selected'}</p></section>
    <section class="card"><h3>Experience</h3><p style="margin:0">${p.experienceYears ? html`<b>${p.experienceYears} years</b>. ` : ''}${p.experience || 'No experience details yet.'}</p></section>
    ${reviewsCard('Reviews', d.reviews, 'No reviews yet. Reviews appear after a completed job.')}</div>
    <aside><section class="card"><h3>Pricing</h3><div class="price" style="font-size:1.6rem">${p.hourlyRate ? money(p.hourlyRate) + '/hr' : 'Not set'}</div><p class="small muted" style="margin:6px 0 0">${p.pricingNote || ''}</p></section>
    ${ratingCard(u, d.distribution)}
    <section class="card"><h3>Contact</h3>${d.canMessage ? messageButton(u, 'btn-primary btn-block') : html`<p class="small muted" style="margin:0">Employers can message workers from here.</p>`}
      <p class="small muted" style="margin:10px 0 0">To hire ${first(u.name)}, post a job and review their bid.</p></section></aside></div>`;
}

function employerBody(d) {
  const { user: u, profile: e } = d;
  return html`<div class="layout-main"><div class="stack">
    <section class="card"><h3>About</h3><p style="margin:0">${e.about || 'This employer has not written an introduction yet.'}</p></section>
    ${d.openJobs ? html`<section class="card"><h3>Open jobs (${d.openJobs.length})</h3>${d.openJobs.length ? html`<div class="stack">${d.openJobs.map(j => jobCard(j))}</div>` : html`<p class="muted" style="margin:0">No open jobs right now.</p>`}</section>` : ''}
    ${reviewsCard('Reviews from workers', d.reviews, 'No reviews yet.')}</div>
    <aside>${d.canMessage ? html`<section class="card"><h3>Contact</h3>${messageButton(u, 'btn-primary btn-block')}</section>` : ''}
    <section class="card"><h3>Employer summary</h3><dl class="kv" style="grid-template-columns:120px 1fr"><dt>Member since</dt><dd>${fmtDate(u.createdAt)}</dd><dt>Jobs posted</dt><dd>${d.postedCount}</dd><dt>Completed</dt><dd>${u.completed}</dd></dl></section>
    ${ratingCard(u, d.distribution)}</aside></div>`;
}

export default {
  what: 'profile',
  async load([id]) { const r = await api.get('/api/users/' + encodeURIComponent(id)); if (!r.ok) throw r; return r; },
  render(d) {
    const { user: u, profile: p, isMe } = d, isWorker = u.role === 'worker';
    return html`<div class="page"><section class="card raised" style="margin-bottom:20px"><div class="profile-head">${avatar(u, 92)}<div style="flex:1;min-width:220px"><h1>${u.name}</h1>
      <div class="meta" style="margin-bottom:6px"><span>${isWorker ? 'Worker' : 'Employer'}${!isWorker && p.company ? ', ' + p.company : ''}</span><span>${u.location}</span><span>Joined ${fmtDate(u.createdAt)}</span></div>
      ${isWorker && p.headline ? html`<p style="margin:0 0 8px"><b>${p.headline}</b></p>` : ''}${ratingLine(u.rating)}</div>
      <div class="row"><div class="stat" style="min-width:110px"><b>${u.completed}</b><span>Jobs completed</span></div>${isMe ? html`<a class="btn btn-primary" href="#/settings">Edit profile</a>` : ''}</div></div></section>
      ${isWorker ? workerBody(d) : employerBody(d)}</div>`;
  }
};

/* Enlarges a portfolio item (on a profile or in Edit profile). */
A.viewPortfolio = el => {
  const item = ((currentPage().data || {}).portfolio || []).find(i => String(i.id) === el.dataset.id); if (!item) return;
  openModal(item.caption || 'Portfolio photo', item.kind === 'pair' ? beforeAfter(item, true) : html`<img class="big" src="${item.src}" alt="${item.caption || 'Portfolio photo'}">`, true);
};
