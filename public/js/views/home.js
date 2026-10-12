/* Welcome page for signed-out visitors (signed-in users are sent to their dashboard). */
import { html } from '../lib/html.js';
import { CATS } from '/shared/constants.js';
import { catIcon } from '../ui/components.js';

export default {
  render: () => html`<section class="hero"><div><h1>Local work, bid on by people nearby.</h1>
  <p class="lead">Post a job, compare bids from workers in your area, and release payment only after the work is approved.</p>
  <div class="row" style="margin:22px 0 14px"><a class="btn btn-accent" href="#/signup">Create an account</a><a class="btn btn-outline" href="#/login">Sign in</a></div>
  <p class="muted small">Sign in or create an account to browse jobs and workers.</p></div>
  <aside class="board" aria-label="Ways to use Nearhand"><h2>Get started</h2>
  <a class="b-row" href="#/signup?role=employer"><span class="b-t">I need work done</span><span class="b-p">Employer</span><span class="b-m">Post a job and compare bids from local workers.</span></a>
  <a class="b-row" href="#/signup?role=worker"><span class="b-t">I want to find work</span><span class="b-p">Worker</span><span class="b-m">Build a profile and bid on jobs near you.</span></a></aside></section>
  <section class="section" style="margin-top:8px"><h2>Popular categories</h2><div class="cat-grid">${CATS.map(c => html`<div class="cat-tile">${catIcon(c.icon)}${c.name}</div>`)}</div></section>
  <section class="section"><h2>How a job works</h2><div class="steps">
    <div class="card step"><h3>Post and compare</h3><p class="muted" style="margin:0">Describe the work and set a budget. Nearby workers send bids with a price, a message and photos of past work.</p></div>
    <div class="card step"><h3>Hire and fund escrow</h3><p class="muted" style="margin:0">Pick a worker, agree on the price, and put the payment in escrow. Nearhand holds it while the work happens.</p></div>
    <div class="card step"><h3>Approve and pay</h3><p class="muted" style="margin:0">When the worker marks the job done and you confirm, the payment is released. Then you both leave reviews.</p></div></div></section>`
};
