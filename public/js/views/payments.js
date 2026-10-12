/* Payment history (escrow ledger). Data: GET /api/payments */
import { html } from '../lib/html.js';
import { money, fmtDate } from '/shared/format.js';
import { api } from '../api.js';

export default {
  async load() { const r = await api.get('/api/payments'); if (!r.ok) throw r; return r; },
  render(d) {
    const isE = d.role === 'employer', stat = (v, l) => html`<div class="stat"><b>${v}</b><span>${l}</span></div>`;
    const row = t => html`<tr><td>${t.id}</td><td><a href="#/job/${t.jobId}">${t.title}</a></td><td>${t.other}</td><td><b>${money(t.amount)}</b></td>
      <td>${t.status === 'held' ? html`<span class="chip warn">Held in escrow</span>` : html`<span class="chip status s5">Released</span>`}</td><td>${fmtDate(t.fundedAt)}</td><td>${t.releasedAt ? fmtDate(t.releasedAt) : 'Pending approval'}</td></tr>`;
    return html`<div class="page"><div class="page-head"><h1 style="font-size:2rem">Payment history</h1><p class="muted" style="margin:0">${isE ? 'Track the money you have put into escrow and released to workers.' : 'Track the money held in escrow for you and paid out to you.'}</p></div>
    <div class="stats">${stat(money(d.totals.held), isE ? 'You have in escrow' : 'Held for you in escrow')}${stat(money(d.totals.released), isE ? 'Released to workers' : 'Paid out to you')}${stat(money(d.totals.pending), isE ? 'Waiting for you to fund' : 'Waiting on employer to fund')}${stat('$0.00', 'Platform fees')}</div>
    ${d.pending.map(j => html`<div class="attn"><span><b>${j.title}</b>: ${money(j.amount)} ${isE ? 'needs to be funded' : 'is not funded yet'}.</span><a class="btn btn-accent btn-sm" href="#/job/${j.id}">${isE ? 'Fund escrow' : 'View job'}</a></div>`)}
    <section class="card" style="margin-top:14px"><h3>Transactions</h3>${d.transactions.length ? html`<div class="scroll-x"><table class="ledger"><thead><tr><th>ID</th><th>Job</th><th>${isE ? 'Worker' : 'Employer'}</th><th>Amount</th><th>Status</th><th>Funded</th><th>Released</th></tr></thead><tbody>${d.transactions.map(row)}</tbody></table></div>` : html`<p class="muted" style="margin:0">No transactions yet.</p>`}</section></div>`;
  }
};
