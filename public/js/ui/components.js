/* Reusable pieces of pages. Each returns html`...` (see lib/html.js), so text is escaped automatically. */
import { html, raw } from '../lib/html.js';
import { STATUSES, GENERIC_CAT_ICON } from '/shared/constants.js';
import { scheduleText } from '/shared/schedule.js';
import { money, plural, ago, fmtDate } from '/shared/format.js';

export const field = (label, input, hint) => html`<div class="field"><label>${label}</label>${input}${hint ? html`<span class="hint">${hint}</span>` : ''}</div>`;
export const empty = (title, body, cta) => html`<div class="empty"><h3>${title}</h3><p>${body}</p>${cta || ''}</div>`;
export const notFoundPage = (what = 'page') => html`<div class="page">${empty(`We could not find that ${what}`, 'It may have been removed, or the link is out of date.', html`<a class="btn btn-primary" href="#/">Go to your dashboard</a>`)}</div>`;
export const milesText = mi => (mi == null || !Number.isFinite(mi) ? '' : mi < 1 ? 'Under 1 mi away' : `${Math.round(mi)} mi away`);

export function avatar(u, s = 40) {
  if (u && u.avatar) return html`<img class="avatar" src="${u.avatar}" alt="" width="${s}" height="${s}" style="width:${s}px;height:${s}px">`;
  const ini = u ? u.name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() : '?';
  return html`<span class="avatar" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px" aria-hidden="true">${ini}</span>`;
}
export const stars = avg => html`<span class="stars" style="--p:${(avg / 5) * 100}%" role="img" aria-label="${avg.toFixed(1)} out of 5 stars"></span>`;
export const ratingLine = r => (r && r.n ? html`<span class="rating">${stars(r.avg)}<b>${r.avg.toFixed(1)}</b><span class="muted">(${r.n})</span></span>` : html`<span class="rating muted">No reviews yet</span>`);

export const svgIcon = d => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
export const catIcon = (icon, sm) => html`<span class="cat-ico ${sm ? 'sm' : ''}" aria-hidden="true">${svgIcon(icon || GENERIC_CAT_ICON)}</span>`;
export const calIcon = raw('<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>');

export const statusChip = j => html`<span class="chip status s${STATUSES.indexOf(j.status)}">${j.status}</span>`;
export const miniRail = j => { const k = STATUSES.indexOf(j.status); return html`<div class="mini" aria-hidden="true">${STATUSES.map((s, i) => html`<i class="${i <= k ? 'on' : ''}"></i>`)}</div>`; };
export function stepper(j) {
  const k = STATUSES.indexOf(j.status);
  return html`<ol class="rail" aria-label="Job progress">${STATUSES.map((s, i) => html`<li class="${i < k || (i === k && k === 5) ? 'done' : i === k ? 'now' : ''}" ${i === k ? raw('aria-current="step"') : ''}><span class="dot"></span><span>${s}</span></li>`)}</ol>`;
}

/* Category <option>s, or a searchable category box (a text input with the names as suggestions). */
export const catOptions = (cats, sel) => cats.map(c => html`<option value="${c.id}" ${c.id === sel ? raw('selected') : ''}>${c.name}</option>`);
export const catSearch = (cats, value) => html`<input type="text" name="cat" list="catList" autocomplete="off" value="${value || ''}" placeholder="All categories"><datalist id="catList">${cats.map(c => html`<option value="${c.name}"></option>`)}</datalist>`;
export const cityOptions = (cities, sel) => cities.map(c => html`<option ${c === sel ? raw('selected') : ''}>${c}</option>`);

/* City box: matching cities appear under it as you type (see the handlers in actions.js). */
export const cityInput = (value, placeholder = 'Start typing a city') => html`<div class="ac"><input type="text" name="location" required autocomplete="off" value="${value || ''}" placeholder="${placeholder}"
  role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cityList" data-suggest="city"><ul class="ac-list" id="cityList" role="listbox" hidden></ul></div>`;

/* A job card (Find jobs, employer profiles). j comes from GET /api/jobs. */
export const jobCard = (j, showDistance) => html`<a class="job-card" href="#/job/${j.id}">${catIcon(j.categoryIcon)}<div class="jc-body"><h3>${j.title}</h3>
  <div class="meta"><span>${j.categoryName}</span><span>${j.location}</span><span>${j.experience} experience</span><span>Posted ${ago(j.createdAt)}</span></div>
  <p class="excerpt">${j.description}</p>
  <div class="meta"><span>${calIcon}${scheduleText(j.schedule)}</span>${showDistance && milesText(j.distance) ? html`<span>${milesText(j.distance)}</span>` : ''}</div>
  <div class="meta"><span>${j.employer.name}</span>${ratingLine(j.employer.rating)}</div></div>
  <div class="jc-side"><span class="price">${money(j.budgetMin)} to ${money(j.budgetMax)}</span><span class="chip neutral">${plural(j.bidCount, 'bid')}</span></div></a>`;

/* A worker card (Find workers). u comes from GET /api/workers. */
export function workerCard(u) {
  const p = u.profile;
  return html`<a class="worker-card" href="#/profile/${u.id}"><div class="wc-top">${avatar(u, 56)}<div><h3>${u.name}</h3>
  <div class="meta"><span>${u.location}</span>${milesText(u.distance) ? html`<span>${milesText(u.distance)}</span>` : ''}</div>${ratingLine(u.rating)}</div></div>
  <div><b>${p.headline || 'New to Nearhand'}</b>${u.categoryNames.length ? html`<div class="muted small">${u.categoryNames.join(', ')}</div>` : ''}</div>
  <div class="skills">${p.skills.slice(0, 4).map(s => html`<span class="chip">${s}</span>`)}</div>
  <div class="small muted">${plural(u.completed, 'job')} completed${p.hourlyRate ? raw(' &nbsp;&middot;&nbsp; from ') : ''}${p.hourlyRate ? money(p.hourlyRate) + '/hr' : ''}</div></a>`;
}

/* A review. r.from is the reviewer; the job title links to the job only when the viewer may open it. */
export const reviewItem = r => html`<div class="review"><div class="row">${avatar(r.from, 36)}<div><b>${r.from.name}</b> <span class="muted small">${r.from.role === 'employer' ? 'Employer' : 'Worker'}</span>
  <div class="row" style="gap:8px">${stars(r.rating)}<span class="muted small">${fmtDate(r.createdAt)}</span></div></div></div>
  <p style="margin:8px 0 4px">${r.text}</p>${r.jobLinkable === false ? html`<span class="small muted">${r.jobTitle}</span>` : html`<a class="small" href="#/job/${r.jobId}">${r.jobTitle}</a>`}</div>`;

const HISTORY = { bid: 'Bid', revised: 'Revised bid', counter: 'Employer countered', 'accepted-counter': 'Counter accepted', 'declined-counter': 'Counter declined', withdrawn: 'Withdrawn' };
export const bidHistory = b => html`<div class="small muted">Negotiation: ${b.history.map(h => `${HISTORY[h.type] || h.type} ${money(h.price)}`).join(', then ')}</div>`;
export const photosHtml = b => (b.photos.length ? html`<div class="thumbs">${b.photos.map((p, i) => html`<button type="button" class="thumb" data-act="viewPhoto" data-src="${p}" aria-label="View photo ${i + 1} of previous work"><img src="${p}" alt="Previous work example ${i + 1}"></button>`)}</div>` : '');

/* Portfolio. A before/after pair stacks the two photos; dragging the slider reveals more of the "after" photo. */
export const beforeAfter = (item, large) => html`<div class="ba ${large ? 'lg' : ''}" style="--pos:50%">
  <img src="${item.before}" alt="Before: ${item.caption}"><div class="ba-after"><img src="${item.after}" alt="After: ${item.caption}"></div>
  <span class="ba-line" aria-hidden="true"></span><span class="ba-tag before">Before</span><span class="ba-tag after">After</span>
  <input type="range" class="ba-range" min="0" max="100" value="50" aria-label="Drag to compare before and after"></div>`;
export const portfolioCard = (item, manage) => html`<figure class="pf-item">
  ${item.kind === 'pair' ? beforeAfter(item) : html`<button type="button" class="pf-photo" data-act="viewPortfolio" data-id="${item.id}" aria-label="Enlarge: ${item.caption || 'portfolio photo'}"><img src="${item.src}" alt="${item.caption || 'Portfolio photo'}"></button>`}
  <figcaption><span>${item.caption || ''}${item.kind === 'pair' ? html` <span class="chip neutral">Before and after</span>` : ''}</span>
  ${manage ? html`<button type="button" class="btn btn-danger btn-sm" data-act="removePortfolio" data-id="${item.id}">Remove</button>` : item.kind === 'pair' ? html`<button type="button" class="linkbtn small" data-act="viewPortfolio" data-id="${item.id}">Enlarge</button>` : ''}</figcaption></figure>`;

/* "Message <name>" button (starts or opens the conversation). */
export const messageButton = (user, cls = 'btn-outline btn-sm', label) => html`<button type="button" class="btn ${cls}" data-act="messageUser" data-user="${user.id}">${label || 'Message ' + user.name.split(' ')[0]}</button>`;
