/* Find jobs (workers) and Find workers (employers). Filtering and sorting happen on the server (GET /api/jobs and
   GET /api/workers); typing in the filters re-queries after a short pause and updates the results and map in place. */
import { html, raw } from '../lib/html.js';
import { $ } from '../lib/dom.js';
import { money, plural } from '/shared/format.js';
import { api, qs } from '../api.js';
import { session } from '../session.js';
import { A, onInput } from '../actions.js';
import { render } from '../router.js';
import { field, empty, jobCard, workerCard, catSearch, cityOptions } from '../ui/components.js';
import { mapBox, createMap, setMarkers, RADII, DEFAULT_CENTER } from '../ui/maps.js';

const fresh = kind => (kind === 'jobs' ? { q: '', cat: '', city: '', radius: '', min: '', max: '', sort: 'new' } : { q: '', cat: '', city: '', radius: '', rating: '', rate: '', sort: 'rating' });
const FIL = { jobs: fresh('jobs'), workers: fresh('workers') };
let shared = { categories: [], cities: [] };

async function loadShared() {
  const [c, k] = await Promise.all([api.get('/api/categories'), api.get('/api/cities')]);
  shared = { categories: c.categories || [], cities: k.cities || [] };
}
async function fetchResults(kind) {
  const r = await api.get(`/api/${kind}${qs(FIL[kind])}`);
  if (!r.ok) throw r;
  return r[kind];
}

const myCoords = () => (session.me && session.me.coords) || DEFAULT_CENTER;
const sortSelect = (sel, opts) => html`<select name="sort">${opts.map(([v, label]) => html`<option value="${v}" ${sel === v ? raw('selected') : ''}>${label}</option>`)}</select>`;
const radiusField = sel => field('Distance', html`<select name="radius"><option value="">Any distance</option>${RADII.map(r => html`<option value="${r}" ${String(sel) === String(r) ? raw('selected') : ''}>Within ${r} miles</option>`)}</select>`,
  html`From ${(session.me || {}).location || 'your location'}. <a href="#/settings">Change</a>`);
const filtersHead = count => html`<div class="filters-head"><h3>Filters</h3><span class="muted small" id="count" aria-live="polite">${count}</span></div>`;
const clearButton = kind => html`<button type="button" class="btn btn-outline btn-block" data-act="clearFilters" data-kind="${kind}">Clear filters</button>`;

const resultsHtml = (kind, list) => (kind === 'jobs'
  ? (list.length ? list.map(j => jobCard(j, true)) : empty('No jobs match those filters', 'Try a broader keyword, another category, or clear the filters.', html`<button class="btn btn-outline" data-act="clearFilters" data-kind="jobs">Clear filters</button>`))
  : (list.length ? list.map(workerCard) : empty('No workers match those filters', 'Try removing a filter or searching a different skill.', html`<button class="btn btn-outline" data-act="clearFilters" data-kind="workers">Clear filters</button>`)));
const countText = (kind, list) => plural(list.length, kind === 'jobs' ? 'open job' : 'worker');

function showOnMap(kind, list) {
  const f = FIL[kind], circle = f.radius ? { at: myCoords(), miles: Number(f.radius) } : null;
  setMarkers(kind + 'Map', list.map(x => kind === 'jobs'
    ? { at: x.coords, kind: 'job', popup: html`<a href="#/job/${x.id}"><b>${x.title}</b></a><br>${money(x.budgetMin)} to ${money(x.budgetMax)}<br><span class="muted">${x.location}</span>` }
    : { at: x.coords, kind: 'worker', popup: html`<a href="#/profile/${x.id}"><b>${x.name}</b></a><br>${x.profile.headline}${x.profile.hourlyRate ? html`<br>${money(x.profile.hourlyRate)}/hr` : ''}` }), circle);
}

/* Live filtering: read the form into FIL, wait for typing to pause, then fetch and update in place. */
const timers = {};
for (const kind of ['jobs', 'workers']) {
  onInput[kind] = box => {
    box.querySelectorAll('[name]').forEach(c => { FIL[kind][c.name] = c.value; });
    clearTimeout(timers[kind]);
    timers[kind] = setTimeout(async () => {
      let list; try { list = await fetchResults(kind); } catch { return; }
      const results = $('#results'); if (!results) return;
      results.innerHTML = String(html`${resultsHtml(kind, list)}`); $('#count').textContent = countText(kind, list);
      showOnMap(kind, list);
    }, 220);
  };
}
A.clearFilters = el => { FIL[el.dataset.kind] = fresh(el.dataset.kind); return render(true); };

export const jobs = {
  async load(params, query) {
    if (query.cat) FIL.jobs.cat = query.cat;
    await loadShared();
    return { list: await fetchResults('jobs') };
  },
  render({ list }) {
    const f = FIL.jobs;
    return html`<div class="page"><div class="page-head"><h1 style="font-size:2rem">Find jobs</h1><p class="muted" style="margin:0">Open jobs near you. Filter by category, location and budget, then place a bid.</p></div>
    <div class="layout-filter"><form class="card filters" data-filters="jobs" onsubmit="return false" role="search">${filtersHead(countText('jobs', list))}
    ${field('Keyword', html`<input type="text" name="q" value="${f.q}" placeholder="faucet, mowing, headshots">`)}
    ${field('Category', catSearch(shared.categories, f.cat))}
    ${field('City', html`<select name="city"><option value="">Any city</option>${cityOptions(shared.cities, f.city)}</select>`)}
    ${radiusField(f.radius)}
    <div class="form-grid"><div class="field"><label>Budget from</label><input type="number" name="min" min="0" value="${f.min}" placeholder="$0"></div><div class="field"><label>Budget to</label><input type="number" name="max" min="0" value="${f.max}" placeholder="$1000"></div></div>
    ${field('Sort by', sortSelect(f.sort, [['new', 'Newest'], ['near', 'Closest to me'], ['employer', 'Best reviewed employers'], ['budget', 'Highest budget'], ['bids', 'Fewest bids']]))}
    ${clearButton('jobs')}</form>
    <section>${mapBox('jobsMap', 'results-map')}<div class="stack" id="results">${resultsHtml('jobs', list)}</div></section></div></div>`;
  },
  mount({ list }) { if (createMap('jobsMap', myCoords(), 10)) showOnMap('jobs', list); }
};

export const workers = {
  async load() { await loadShared(); return { list: await fetchResults('workers') }; },
  render({ list }) {
    const f = FIL.workers;
    return html`<div class="page"><div class="page-head"><h1 style="font-size:2rem">Find workers</h1><p class="muted" style="margin:0">Review ratings, past jobs and pricing before you hire.</p></div>
    <div class="layout-filter"><form class="card filters" data-filters="workers" onsubmit="return false" role="search">${filtersHead(countText('workers', list))}
    ${field('Keyword', html`<input type="text" name="q" value="${f.q}" placeholder="name, skill or service">`)}
    ${field('Category', catSearch(shared.categories, f.cat))}
    ${field('City', html`<select name="city"><option value="">Any city</option>${cityOptions(shared.cities, f.city)}</select>`)}
    ${radiusField(f.radius)}
    ${field('Minimum rating', html`<select name="rating"><option value="">Any rating</option>${[['4', '4.0'], ['4.5', '4.5'], ['4.8', '4.8']].map(([v, l]) => html`<option value="${v}" ${f.rating === v ? raw('selected') : ''}>${l} and up</option>`)}</select>`)}
    ${field('Maximum hourly rate', html`<input type="number" name="rate" min="0" value="${f.rate}" placeholder="$100">`)}
    ${field('Sort by', sortSelect(f.sort, [['rating', 'Top rated'], ['near', 'Closest to me'], ['jobs', 'Most jobs completed'], ['rate', 'Hourly rate: low to high']]))}
    ${clearButton('workers')}</form>
    <section>${mapBox('workersMap', 'results-map')}<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr))" id="results">${resultsHtml('workers', list)}</div></section></div></div>`;
  },
  mount({ list }) { if (createMap('workersMap', myCoords(), 10)) showOnMap('workers', list); }
};
