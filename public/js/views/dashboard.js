/* Dashboard: stats, to-dos (also shown in a pop-up once per sign-in) and job or bid rows. Data: GET /api/dashboard */
import { html } from '../lib/html.js';
import { openModal } from '../lib/dom.js';
import { STATUSES } from '/shared/constants.js';
import { money, plural, ago } from '/shared/format.js';
import { api } from '../api.js';
import { session } from '../session.js';
import { A, ui } from '../actions.js';
import { render } from '../router.js';
import { empty, statusChip, miniRail } from '../ui/components.js';

const OPEN = STATUSES[0], IN_FLIGHT = ['Worker Selected', 'Payment Funded', 'In Progress', 'Awaiting Approval'];
const todoItem = t => html`<div class="attn"><span><b>${t.strong}</b>${t.text}</span><a class="btn ${t.primary ? 'btn-accent' : 'btn-outline'} btn-sm" href="${t.href}">${t.label}</a></div>`;
/* A row; the title link covers the whole row, so the row is clickable. acts === null means no actions column. */
const row = (j, meta, status, amount, sub, acts = null) => html`<article class="rj ${acts === null ? 'no-acts' : ''}"><div><a class="t" href="#/job/${j.id}">${j.title}</a><div class="meta">${meta}</div></div>
  <div>${status}</div><div><div class="money">${amount}</div><div class="small muted">${sub}</div></div>${acts === null ? '' : html`<div class="acts">${acts}</div>`}</article>`;
const tabsBar = (act, current, tabs) => html`<div class="tabs" role="group" aria-label="Sections" style="margin-top:14px">${tabs.map(([k, label, n]) => html`<button class="tab" data-act="${act}" data-tab="${k}" aria-pressed="${current === k}">${label} (${n})</button>`)}</div>`;
const stat = (value, label) => html`<div class="stat"><b>${value}</b><span>${label}</span></div>`;

function employer(d) {
  const tab = ui.dashTab, jobs = d.jobs;
  const list = jobs.filter(j => tab === 'all' || (tab === 'open' ? j.status === OPEN : tab === 'hired' ? IN_FLIGHT.includes(j.status) : j.status === 'Completed'));
  const jobRow = j => row(j, html`<span>${j.categoryName}</span><span>Posted ${ago(j.createdAt)}</span>${j.worker ? html`<span>Hired: ${j.worker.name}</span>` : ''}`,
    html`${statusChip(j)}${miniRail(j)}`, money(j.agreedPrice || j.budgetMax), j.agreedPrice ? 'agreed price' : 'up to, ' + plural(j.bidCount, 'bid'),
    j.status === OPEN ? html`<a class="btn btn-outline btn-sm" href="#/post/${j.id}">Edit</a><button class="btn btn-danger btn-sm" data-act="askDelete" data-id="${j.id}" data-title="${j.title}">Remove</button>` : '');
  return html`<div class="page"><div class="page-head spread"><div><h1 style="font-size:2rem">Your jobs</h1><p class="muted" style="margin:0">Track every job you have posted and what needs your attention.</p></div><a class="btn btn-accent" href="#/post">Post a job</a></div>
  <div class="stats">${stat(d.stats.open, 'Open for bids')}${stat(d.stats.inFlight, 'Hired and active')}${stat(d.stats.completed, 'Completed')}${stat(money(d.stats.held), 'Currently in escrow')}</div>
  ${d.todos.map(todoItem)}${tabsBar('dashTab', tab, [['all', 'All jobs', jobs.length], ['open', 'Open for bids', d.stats.open], ['hired', 'Hired and active', d.stats.inFlight], ['done', 'Completed', d.stats.completed]])}
  ${list.length ? list.map(jobRow) : empty('No jobs here yet', 'Post your first job to start receiving bids.', html`<a class="btn btn-primary" href="#/post">Post a job</a>`)}</div>`;
}

function worker(d, me) {
  const tab = ui.workerTab, active = d.jobs.filter(j => j.status !== 'Completed'), finished = d.jobs.filter(j => j.status === 'Completed');
  const label = b => (b.status === 'accepted' ? ['Hired', 'status s5'] : b.status === 'rejected' ? ['Not selected', 'neutral'] : b.status === 'withdrawn' ? ['Withdrawn', 'neutral'] : b.counterPending ? ['Counter-offer received', 'warn'] : ['Pending', 'neutral']);
  const bidRow = b => { const [text, cls] = label(b); return row({ id: b.jobId, title: b.title }, html`<span>${b.employer.name}</span><span>${b.location}</span><span>Bid ${ago(b.createdAt)}</span>`, html`<span class="chip ${cls}">${text}</span>`, money(b.price), 'your bid'); };
  const jobRow = j => row(j, html`<span>${j.employer.name}</span><span>${j.location}</span>`, html`${statusChip(j)}${miniRail(j)}`, money(j.agreedPrice), 'agreed price');
  const find = html`<a class="btn btn-primary" href="#/jobs">Find jobs</a>`;
  const list = tab === 'bids' ? (d.bids.length ? d.bids.map(bidRow) : empty('No bids yet', 'Browse open jobs and send your first bid.', find))
    : tab === 'done' ? (finished.length ? finished.map(jobRow) : empty('No completed jobs yet', 'Completed jobs and payments appear here.'))
    : (active.length ? active.map(jobRow) : empty('No active jobs', 'When an employer hires you, the job shows up here.', find));
  const r = d.stats.rating;
  return html`<div class="page"><div class="page-head spread"><div><h1 style="font-size:2rem">Welcome back, ${me.name.split(' ')[0]}</h1><p class="muted" style="margin:0">Your bids, active jobs and earnings in one place.</p></div><a class="btn btn-accent" href="#/jobs">Find jobs</a></div>
  <div class="stats">${stat(r.n ? r.avg.toFixed(1) : '–', `Average rating (${plural(r.n, 'review')})`)}${stat(d.stats.completed, 'Jobs completed')}${stat(money(d.stats.held), 'Held in escrow for you')}${stat(money(d.stats.paid), 'Paid out to you')}</div>
  ${d.todos.map(todoItem)}${tabsBar('workerTab', tab, [['action', 'Active jobs', active.length], ['bids', 'My bids', d.bids.length], ['done', 'Completed', finished.length]])}${list}</div>`;
}

export default {
  async load() { const r = await api.get('/api/dashboard'); if (!r.ok) throw r; return r; },
  render: d => (d.role === 'employer' ? employer(d) : worker(d, session.me)),
  mount(d) {
    if (!ui.showTodos) return;
    ui.showTodos = false;
    if (d.todos.length) openModal(`You have ${plural(d.todos.length, 'thing')} to do`, html`<div class="todo-list">${d.todos.map(todoItem)}</div><button class="btn btn-outline btn-block" data-act="closeModal">Go to dashboard</button>`, true);
  }
};

Object.assign(A, {
  dashTab(el) { ui.dashTab = el.dataset.tab; return render(true); },
  workerTab(el) { ui.workerTab = el.dataset.tab; return render(true); }
});
