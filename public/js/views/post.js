/* Post or edit a job. Data: categories and cities (and the job, when editing). Saved with POST/PUT /api/jobs. */
import { html, raw } from '../lib/html.js';
import { toast } from '../lib/dom.js';
import { STATUSES, EXPERIENCE, NEW_CATEGORY } from '/shared/constants.js';
import { REPEATS, WEEKDAYS } from '/shared/schedule.js';
import { api } from '../api.js';
import { F, setCities } from '../actions.js';
import { go } from '../router.js';
import { field, empty, catOptions, cityInput } from '../ui/components.js';

/* Schedule fields. The repeat-only and weekly-only rows are shown with CSS (:has) based on the Repeats choice. */
function scheduleFields(sch) {
  const s = sch || { start: '', time: '09:00', repeat: 'none', days: [], until: '' };
  return html`<fieldset class="sched full"><legend>Schedule</legend>
  <p class="small muted" style="margin:0 0 12px">When should the work happen? Leave the start date empty if you're flexible. Workers see the schedule before they bid.</p>
  <div class="form-grid">
  ${field('Start date', html`<input type="date" name="schedStart" value="${s.start}">`)}
  ${field('Start time', html`<input type="time" name="schedTime" value="${s.time}">`)}
  ${field('Repeats', html`<select name="schedRepeat">${Object.entries(REPEATS).map(([k, label]) => html`<option value="${k}" ${s.repeat === k ? raw('selected') : ''}>${label}</option>`)}</select>`)}
  <div class="full weekly-only"><div class="field"><label>On these days</label><div class="checks">${[1, 2, 3, 4, 5, 6, 0].map(d => html`<label><input type="checkbox" name="schedDays" value="${d}" ${(s.days || []).includes(d) ? raw('checked') : ''}>${WEEKDAYS[d]}</label>`)}</div><span class="hint">Leave empty to repeat on the start date's weekday.</span></div></div>
  <div class="repeat-only">${field('Repeat until', html`<input type="date" name="schedUntil" value="${s.until || ''}">`, 'Up to one year after the start date.')}</div>
  </div></fieldset>`;
}

export default {
  what: 'job',
  async load([id]) {
    const [cats, cities, job] = await Promise.all([api.get('/api/categories'), api.get('/api/cities'), id ? api.get('/api/jobs/' + encodeURIComponent(id)) : null]);
    if (job && !job.ok) throw job;
    if (job && !job.isOwner) throw { status: 404 };
    setCities(cities.cities);
    return { categories: cats.categories, job: job ? job.job : null };
  },
  render({ categories, job: j }) {
    if (j && j.status !== STATUSES[0]) return html`<div class="page">${empty('This job can no longer be edited', 'Jobs are locked once a worker is selected.', html`<a class="btn btn-primary" href="#/job/${j.id}">Back to job</a>`)}</div>`;
    const v = j || { title: '', description: '', category: '', location: '', experience: '', budgetMin: '', budgetMax: '', schedule: null };
    return html`<div class="page form-page"><div class="page-head"><h1 style="font-size:2rem">${j ? 'Edit job' : 'Post a job'}</h1><p class="muted">Clear details and a realistic budget bring better bids.</p></div>
    <form class="card raised" data-form="job" data-id="${j ? j.id : ''}"><div class="form-grid">
    <div class="full">${field('Job title', html`<input type="text" name="title" maxlength="90" required value="${v.title}" placeholder="e.g. Replace kitchen faucet and fix slow drain">`)}</div>
    ${field('City', cityInput(v.location))}
    <div class="cat-pick">${field('Category', html`<select name="category" required><option value="">Choose a category</option>${catOptions(categories, v.category)}<option value="${NEW_CATEGORY}">+ Add a new category…</option></select>`)}
    <div class="new-cat">${field('New category name', html`<input type="text" name="newCategory" maxlength="40" placeholder="e.g. Pool cleaning">`)}</div></div>
    ${field('Experience required', html`<select name="experience" required><option value="">Choose years of experience</option>${EXPERIENCE.map(x => html`<option ${x === v.experience ? raw('selected') : ''}>${x}</option>`)}</select>`)}
    ${field('Budget ($)', html`<div class="range-inputs"><input type="number" name="budgetMin" min="1" required value="${v.budgetMin}" placeholder="Min" aria-label="Budget minimum"><span>to</span><input type="number" name="budgetMax" min="1" required value="${v.budgetMax}" placeholder="Max" aria-label="Budget maximum"></div>`)}
    <div class="full">${field('Description of the work', html`<textarea name="description" rows="6" required placeholder="What needs to be done, the size of the job, access details…">${v.description}</textarea>`)}</div>
    ${scheduleFields(v.schedule)}</div>
    <div class="row"><button class="btn btn-primary">${j ? 'Save changes' : 'Post job'}</button><a class="btn btn-outline" href="${j ? '#/job/' + j.id : '#/dashboard'}">Cancel</a></div></form></div>`;
  }
};

F.job = async (f, d) => {
  const body = { ...Object.fromEntries(d), schedDays: d.getAll('schedDays') }, id = f.dataset.id;
  const r = id ? await api.put('/api/jobs/' + id, body) : await api.post('/api/jobs', body);
  if (!r.ok) return toast(r.error, 'error');
  toast(id ? 'Changes saved.' : 'Job posted. Workers can bid now.'); go('#/job/' + r.id);
};
