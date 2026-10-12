/* Company pages linked from the footer. */
import { html } from '../lib/html.js';

const page = (title, body) => ({ render: () => html`<div class="page"><div class="narrow stack" style="max-width:720px"><h1 style="font-size:2rem">${title}</h1>${body}</div></div>` });

export const about = page('About Nearhand', html`<p>Nearhand connects people who need local work done with skilled workers nearby. Employers post a job, compare bids, and pay into escrow. Workers bid on jobs that fit their skills and get paid once the work is approved.</p>
  <p>Ratings and reviews from both sides keep everyone accountable, so you can hire, or take a job, with confidence.</p>`);
export const terms = page('Terms of service', html`<p class="muted">Our full terms of service will be published here.</p>`);
export const privacy = page('Privacy policy', html`<p class="muted">Our full privacy policy will be published here.</p>`);
export const contact = page('Contact us', html`<p>Questions, feedback or problems with a job? Email us at <a href="mailto:hello@nearhand.example">hello@nearhand.example</a> and we will get back to you within one business day.</p>`);
