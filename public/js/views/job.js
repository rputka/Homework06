/* A job's page: details, schedule and map; bids for the owner, your bid for a worker; the agreement, escrow and
   workflow buttons for the two people on the job; and reviews once it's complete. Data: GET /api/jobs/:id */
import { html } from '../lib/html.js';
import { $, toast, openModal, closeModal } from '../lib/dom.js';
import { STATUSES } from '/shared/constants.js';
import { scheduleText, nextVisit, visitText } from '/shared/schedule.js';
import { money, plural, first, ago, fmtDate } from '/shared/format.js';
import { api } from '../api.js';
import { A, F, onChange, done } from '../actions.js';
import { go, currentPage } from '../router.js';
import { field, empty, avatar, ratingLine, catIcon, statusChip, stepper, reviewItem, bidHistory, photosHtml, messageButton, milesText } from '../ui/components.js';
import { mapBox, createMap, setMarkers } from '../ui/maps.js';
import { uploadPhoto } from '../ui/images.js';

const OPEN = STATUSES[0];
let photos = []; // photos chosen for the bid form (upload URLs)
const page = () => currentPage().data;

function bidCard(b, job, best) {
  const w = b.worker, canAct = job.status === OPEN && b.status === 'active', c = b.counter;
  const chip = b.status === 'accepted' ? html`<span class="chip status s5">Hired</span>` : b.status === 'rejected' ? html`<span class="chip neutral">Not selected</span>` : '';
  const counter = !c ? '' : html`<div class="counter">${c.status === 'pending' ? html`You countered with <b>${money(c.price)}</b>${c.note ? `: "${c.note}"` : ''}. Waiting for ${first(w.name)} to respond.`
    : c.status === 'accepted' ? html`${first(w.name)} accepted your counter-offer of <b>${money(c.price)}</b>.` : html`${first(w.name)} declined your counter-offer of ${money(c.price)}.`}</div>`;
  return html`<article class="bid ${b.status === 'accepted' ? 'accepted' : best ? 'best' : ''}"><div class="bid-top">${avatar(w, 48)}<div class="grow"><a href="#/profile/${w.id}"><b>${w.name}</b></a>
  <div class="meta">${ratingLine(w.rating)}<span>${plural(w.completed, 'job')} done</span>${b.hourlyRate ? html`<span>${money(b.hourlyRate)}/hr</span>` : ''}<span>${w.location}</span></div></div>
  <div style="text-align:right"><div class="price">${money(b.price)}</div>${best && canAct ? html`<span class="chip warn">Lowest bid</span>` : ''}${chip}</div></div>
  <p style="margin:0">${b.message}</p>${photosHtml(b)}${counter}${bidHistory(b)}
  <div class="row">${canAct ? html`<button class="btn btn-primary btn-sm" data-act="askHire" data-bid="${b.id}">Hire for ${money(b.price)}</button><button class="btn btn-outline btn-sm" data-act="askCounter" data-bid="${b.id}">Counter offer</button>` : ''}
  <a class="btn btn-outline btn-sm" href="#/profile/${w.id}">View profile and reviews</a>${messageButton(w)}</div></article>`;
}

const thumbs = () => photos.map((p, i) => html`<span class="thumb" style="cursor:default"><img src="${p}" alt="Selected photo ${i + 1}"><button type="button" class="x" data-act="rmPhoto" data-i="${i}" aria-label="Remove photo ${i + 1}">×</button></span>`);

function myBidPanel(d) {
  const { job, myBid: b, employer } = d, active = b && b.status === 'active';
  const c = active && b.counter && b.counter.status === 'pending' ? b.counter : null;
  return html`${c ? html`<section class="card raised" style="border-color:var(--accent)"><h3>${first(employer.name)} sent a counter-offer</h3><p class="price" style="margin:0 0 6px">${money(c.price)}</p>${c.note ? html`<p class="small">"${c.note}"</p>` : ''}
    <div class="row"><button class="btn btn-primary btn-sm" data-act="answerCounter" data-bid="${b.id}" data-accept="1">Accept ${money(c.price)}</button><button class="btn btn-outline btn-sm" data-act="answerCounter" data-bid="${b.id}" data-accept="0">Decline</button></div>
    <p class="small muted" style="margin:10px 0 0">You can also revise your bid below to propose a different price.</p></section>` : ''}
  <form class="card raised" data-form="bid"><h3>${active ? 'Your bid' : b ? 'Bid withdrawn' : 'Place a bid'}</h3>
  ${active ? html`<div class="small muted" style="margin-bottom:12px">${bidHistory(b)}</div>` : ''}
  ${field('Your price ($)', html`<input type="number" name="price" min="1" step="1" required value="${active ? b.price : ''}">`, `Budget: ${money(job.budgetMin)} to ${money(job.budgetMax)}`)}
  ${field('Why you are a good fit', html`<textarea name="message" rows="5" maxlength="900" required placeholder="Your experience, availability and how you would approach this job">${b ? b.message : ''}</textarea>`)}
  <div class="field"><label for="bidPhotos">Photos of previous work <span class="muted">(optional, up to 4)</span></label><input id="bidPhotos" type="file" accept="image/*" multiple><div class="thumbs" id="photoThumbs" style="margin-top:8px">${thumbs()}</div></div>
  <div class="row"><button class="btn btn-primary">${active ? 'Update bid' : b ? 'Submit bid again' : 'Submit bid'}</button>${active ? html`<button type="button" class="btn btn-danger" data-act="withdrawBid" data-bid="${b.id}">Withdraw bid</button>` : ''}</div></form>`;
}

function agreementPanel(d) {
  const { job, employer: emp, worker: w, transaction: t, isOwner } = d;
  const vault = t ? (t.status === 'held'
    ? html`<div class="vault held"><div><div class="small">Held in escrow by Nearhand</div><strong>${money(t.amount)}</strong></div><div class="small">The money stays here until the employer confirms the work is complete.</div></div>`
    : html`<div class="vault released"><div><div class="small">Released to ${first(w.name)}</div><strong>${money(t.amount)}</strong></div><div class="small">Paid out ${fmtDate(t.events[t.events.length - 1].at)}. Platform fee: $0.00</div></div>`)
    : html`<div class="vault"><div><div class="small">Escrow not funded yet</div><strong>${money(job.agreedPrice)}</strong></div><div class="small">The employer pays this amount into escrow to start the job.</div></div>`;
  const notice = text => html`<div class="notice">${text}</div>`;
  const act = {
    'Worker Selected': isOwner ? html`<button class="btn btn-accent" data-act="askFund">Fund escrow: ${money(job.agreedPrice)}</button>` : notice('You have been selected. Work starts once the employer funds escrow.'),
    'Payment Funded': isOwner ? notice('Escrow is funded. Waiting for the worker to start.') : html`<button class="btn btn-primary" data-act="startWork">Start work</button>`,
    'In Progress': isOwner ? notice('Work is in progress. You will be asked to confirm when the worker marks it complete.')
      : html`<div class="field"><label for="doneNote">Note for the employer (optional)</label><textarea id="doneNote" rows="3" placeholder="Summarize what you completed"></textarea></div><button class="btn btn-primary" data-act="markComplete">Mark work complete</button>`,
    'Awaiting Approval': html`${job.completionNote ? html`<div class="counter" style="margin-bottom:12px"><b>${first(w.name)}'s note:</b> ${job.completionNote}</div>` : ''}${isOwner ? html`<button class="btn btn-accent" data-act="askConfirm">Confirm work and release ${money(job.agreedPrice)}</button>` : notice('You marked this job complete. Payment is released when the employer confirms.')}`
  }[job.status] || '';
  const log = t ? html`<ul class="log">${t.events.map(e => html`<li>${fmtDate(e.at)}: ${e.type === 'funded' ? `${emp.name} paid ${money(t.amount)} into escrow (${t.card})` : `${money(t.amount)} released to ${w.name}`}</li>`)}</ul>` : '';
  return html`<section class="card raised"><div class="spread"><h2 style="margin:0">Agreement</h2>${statusChip(job)}</div>
  <dl class="kv" style="margin-top:14px"><dt>Employer</dt><dd><a href="#/profile/${emp.id}">${emp.name}</a></dd><dt>Worker</dt><dd><a href="#/profile/${w.id}">${w.name}</a></dd><dt>Agreed price</dt><dd><b>${money(job.agreedPrice)}</b> (platform fee $0.00)</dd><dt>Job</dt><dd>${job.title}</dd><dt>Scope of work</dt><dd>${job.description}</dd><dt>Status</dt><dd>${job.status}</dd></dl>
  ${vault}${act}${log}<div class="row" style="margin-top:14px">${messageButton(isOwner ? w : emp)}<button class="btn btn-outline btn-sm" disabled title="Dispute handling is a planned feature">Report a problem (coming soon)</button></div></section>`;
}

function reviewsPanel(d) {
  const { reviews, canReview, isOwner, isHired, employer, worker } = d;
  let form = '';
  if (canReview) {
    const other = isOwner ? worker : employer;
    form = html`<form data-form="review" style="margin-top:${reviews.length ? 16 : 0}px"><h3>Review ${other.name}</h3>
    <div class="field"><label id="rl">Your rating</label><div class="starpick" role="radiogroup" aria-labelledby="rl">${[5, 4, 3, 2, 1].map(n => html`<input type="radio" name="rating" id="rate${n}" value="${n}"><label for="rate${n}" title="${n} star${n > 1 ? 's' : ''}"><span class="sr">${n} stars</span>★</label>`)}</div></div>
    ${field('Your review', html`<textarea name="text" rows="4" required placeholder="${isOwner ? 'How was the work, communication and timing?' : 'How was the employer to work with?'}"></textarea>`)}<button class="btn btn-primary">Submit review</button></form>`;
  } else if (isOwner || isHired) form = html`<p class="muted small" style="margin:12px 0 0">You have reviewed this job. Thank you!</p>`;
  return html`<section class="card"><h3>Reviews</h3>${reviews.map(reviewItem)}${!reviews.length && !form ? html`<p class="muted" style="margin:0">No reviews yet.</p>` : ''}${form}</section>`;
}

export default {
  what: 'job',
  async load([id]) {
    const r = await api.get('/api/jobs/' + encodeURIComponent(id));
    if (!r.ok) throw r;
    photos = r.myBid && r.myBid.status === 'active' ? [...r.myBid.photos] : [];
    return r;
  },
  render(d) {
    const { job, category: c, employer: emp, isOwner, isHired } = d, isWorker = 'myBid' in d, open = job.status === OPEN; // the server sends myBid only to workers
    const next = job.schedule && nextVisit(job.schedule);
    let main = html`<section class="card"><div class="row" style="align-items:flex-start">${catIcon(c.icon)}<div style="flex:1;min-width:220px"><h1 style="font-size:clamp(1.5rem,3vw,2rem);margin-bottom:6px">${job.title}</h1>
      <div class="meta"><span>${c.name}</span><span>${job.location}</span><span>Posted ${ago(job.createdAt)}</span></div></div><div style="text-align:right"><div class="price" style="font-size:1.4rem">${money(job.budgetMin)} to ${money(job.budgetMax)}</div>${statusChip(job)}</div></div>${stepper(job)}</section>
    <section class="card"><h3>Description</h3><p style="white-space:pre-wrap">${job.description}</p>
    <dl class="kv"><dt>Experience</dt><dd>${job.experience}</dd><dt>Schedule</dt><dd>${scheduleText(job.schedule)}</dd>${next && job.status !== 'Completed' ? html`<dt>Next visit</dt><dd>${visitText(next)}</dd>` : ''}</dl></section>
    <section class="card"><div class="spread"><h3 style="margin:0">Location</h3><span class="muted small">${job.location}${milesText(d.distance) ? ' · ' + milesText(d.distance) : ''}</span></div>
    ${job.coords ? mapBox('jobMap', 'detail-map') : html`<p class="muted small" style="margin:10px 0 0">This city isn't on the map yet.</p>`}</section>`;
    if (isOwner && open) {
      const active = d.bids.filter(b => b.status === 'active').sort((a, b) => a.price - b.price), lowest = active.length ? active[0].price : null;
      main = html`${main}<section class="stack"><div class="spread"><h2 style="margin:0">Bids (${active.length})</h2><div class="row"><a class="btn btn-outline btn-sm" href="#/post/${job.id}">Edit job</a><button class="btn btn-danger btn-sm" data-act="askDelete" data-id="${job.id}" data-title="${job.title}">Remove job</button></div></div>
      ${active.length ? active.map(b => bidCard(b, job, active.length > 1 && b.price === lowest)) : empty('No bids yet', 'Workers nearby can see this job. Check back soon or browse workers and share the link.', html`<a class="btn btn-outline" href="#/workers">Browse workers</a>`)}</section>`;
    }
    if (job.workerId && (isOwner || isHired)) main = html`${main}${agreementPanel(d)}`;
    if (isOwner && !open) main = html`${main}<section class="card"><h3>Bids received</h3><div class="stack">${d.bids.map(b => html`<div class="row" style="justify-content:space-between"><span class="row">${avatar(b.worker, 32)}<a href="#/profile/${b.worker.id}">${b.worker.name}</a></span>
      <span class="row"><b>${money(b.price)}</b>${b.status === 'accepted' ? html`<span class="chip status s5">Hired</span>` : html`<span class="chip neutral">Not selected</span>`}</span></div>`)}</div></section>`;
    if (job.status === 'Completed') main = html`${main}${reviewsPanel(d)}`;

    // Employers can only open their own jobs, so the page is a single column for them; workers get a sidebar.
    if (isOwner) return html`<div class="page"><p class="small"><a href="#/dashboard">← Dashboard</a></p><div class="stack">${main}</div></div>`;
    let side = html`<section class="card"><h3>About the employer</h3><div class="row">${avatar(emp, 48)}<div><a href="#/profile/${emp.id}"><b>${emp.name}</b></a><div>${ratingLine(emp.rating)}</div></div></div>
      <dl class="kv" style="grid-template-columns:110px 1fr;margin-top:12px"><dt>Location</dt><dd>${emp.location}</dd><dt>Member since</dt><dd>${fmtDate(emp.createdAt)}</dd><dt>Jobs completed</dt><dd>${emp.completed}</dd></dl>${messageButton(emp, 'btn-outline btn-block', 'Message the employer')}</section>`;
    if (isWorker && open) side = html`${myBidPanel(d)}${side}`;
    else if (isWorker && !isHired) side = html`<section class="card"><h3>Bidding closed</h3><p class="muted" style="margin:0">An employer selected a worker, so this job no longer accepts bids.</p></section>${side}`;
    return html`<div class="page"><p class="small"><a href="#/jobs">← All jobs</a></p><div class="layout-main"><div class="stack">${main}</div><aside>${side}</aside></div></div>`;
  },
  mount(d) { if (d.job.coords && createMap('jobMap', d.job.coords, 13)) setMarkers('jobMap', [{ at: d.job.coords, kind: 'job', popup: html`${d.job.title}` }], null); }
};

const jobUrl = (step = '') => `/api/jobs/${page().job.id}${step}`;
const bidById = id => page().bids.find(b => String(b.id) === String(id));

Object.assign(A, {
  viewPhoto(el) { openModal('Previous work', html`<img class="big" src="${el.dataset.src}" alt="Example of previous work">`, true); },
  rmPhoto(el) { photos.splice(+el.dataset.i, 1); $('#photoThumbs').innerHTML = String(html`${thumbs()}`); },
  askHire(el) {
    const b = bidById(el.dataset.bid);
    openModal(`Hire ${b.worker.name}?`, html`<p>You are selecting <b>${b.worker.name}</b> at <b>${money(b.price)}</b>. Other workers will no longer be able to bid, and you will be asked to fund escrow next.</p>
      <div class="row"><button class="btn btn-primary" data-act="doHire" data-bid="${b.id}">Hire for ${money(b.price)}</button><button class="btn btn-outline" data-act="closeModal">Cancel</button></div>`);
  },
  doHire: el => done(api.post(`/api/bids/${el.dataset.bid}/hire`), 'Worker selected. Fund escrow to start the job.'),
  askCounter(el) {
    const b = bidById(el.dataset.bid), name = first(b.worker.name);
    openModal(`Counter ${name}'s bid`, html`<form data-form="counter" data-bid="${b.id}"><p class="muted small">Current bid: ${money(b.price)}. ${name} can accept, decline or revise the bid.</p>
      ${field('Your offer ($)', html`<input type="number" name="price" min="1" required value="${Math.round(b.price * 0.9)}">`)}${field('Note (optional)', html`<textarea name="note" rows="3" placeholder="e.g. Could you do it for this price if I buy the materials?"></textarea>`)}
      <div class="row"><button class="btn btn-primary">Send counter-offer</button><button type="button" class="btn btn-outline" data-act="closeModal">Cancel</button></div></form>`);
  },
  answerCounter: el => done(api.post(`/api/bids/${el.dataset.bid}/respond`, { accept: el.dataset.accept === '1' }), el.dataset.accept === '1' ? 'Counter-offer accepted. Your bid price was updated.' : 'Counter-offer declined.'),
  withdrawBid: el => done(api.post(`/api/bids/${el.dataset.bid}/withdraw`), 'Bid withdrawn.'),
  askDelete(el) {
    openModal('Remove this job?', html`<p><b>${el.dataset.title}</b> and all of its bids will be permanently removed.</p>
      <div class="row"><button class="btn btn-danger" data-act="doDelete" data-id="${el.dataset.id}">Remove job</button><button class="btn btn-outline" data-act="closeModal">Keep job</button></div>`);
  },
  async doDelete(el) {
    const r = await api.del('/api/jobs/' + el.dataset.id);
    if (!r.ok) return toast(r.error, 'error');
    closeModal(); toast('Job removed.'); go('#/dashboard');
  },
  askFund() {
    const { job, worker } = page();
    openModal('Fund escrow', html`<form data-form="fund"><div class="form-grid"><div class="full">${field('Name on card', html`<input type="text" name="cardName" required value="${page().employer.name}">`)}</div>
      <div class="full">${field('Card number', html`<input type="text" name="card" required value="4242 4242 4242 4242" inputmode="numeric">`)}</div>${field('Expiry', html`<input type="text" name="exp" required value="12/29">`)}${field('CVC', html`<input type="text" name="cvc" required value="123">`)}</div>
      <dl class="kv" style="grid-template-columns:140px 1fr;margin-bottom:14px"><dt>Agreed price</dt><dd>${money(job.agreedPrice)}</dd><dt>Platform fee</dt><dd>$0.00</dd><dt>Total into escrow</dt><dd><b>${money(job.agreedPrice)}</b></dd></dl>
      <p class="small muted">Nearhand holds this money while the work is done. It is released to ${first(worker.name)} only after you confirm completion.</p><button class="btn btn-accent btn-block">Pay ${money(job.agreedPrice)} into escrow</button></form>`);
  },
  startWork: () => done(api.post(jobUrl('/start')), 'Work started. Status is now In Progress.'),
  markComplete: () => done(api.post(jobUrl('/complete'), { note: ($('#doneNote') || {}).value || '' }), 'Marked complete. Waiting for the employer to approve.'),
  askConfirm() {
    const { job, worker } = page();
    openModal('Confirm the work is done?', html`<p>Confirming releases <b>${money(job.agreedPrice)}</b> from escrow to <b>${worker.name}</b>.</p>
      <div class="row"><button class="btn btn-accent" data-act="doConfirm">Confirm and release payment</button><button class="btn btn-outline" data-act="closeModal">Not yet</button></div>`);
  },
  doConfirm: () => done(api.post(jobUrl('/confirm')), 'Payment released. You can now leave a review.')
});

Object.assign(F, {
  bid: (f, d) => done(api.post(jobUrl('/bids'), { price: d.get('price'), message: d.get('message'), photos: photos.slice(0, 4) }), 'Bid submitted. The employer can see it now.'),
  counter: (f, d) => done(api.post(`/api/bids/${f.dataset.bid}/counter`, { price: d.get('price'), note: d.get('note') }), 'Counter-offer sent.'),
  fund: () => done(api.post(jobUrl('/fund')), 'Escrow funded. The worker can start now.'),
  review: (f, d) => done(api.post(jobUrl('/reviews'), { rating: d.get('rating'), text: d.get('text') }), 'Review posted. Thank you!')
});

onChange.bidPhotos = async input => {
  for (const file of [...input.files]) {
    if (photos.length >= 4) { toast('You can attach up to 4 photos.', 'error'); break; }
    try { photos.push(await uploadPhoto(file, 640)); } catch (err) { toast(err.message, 'error'); }
  }
  $('#photoThumbs').innerHTML = String(html`${thumbs()}`); input.value = '';
};
