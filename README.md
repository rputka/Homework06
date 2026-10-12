# Nearhand: Local Freelance Marketplace (Prototype)

Nearhand is a prototype of a freelance marketplace that connects employers who need local work done with workers who bid on those jobs. It covers the full job lifecycle, from posting and bidding through simulated escrow payment to two-way reviews.

> **This is a prototype.** Emails and payments are simulated: no real money moves and no real emails are sent. Passwords are hashed, but the app has not had a security review. Do not enter real personal or payment information.

## Running it locally

You need [Node.js](https://nodejs.org/) 22.13 or newer. There is no build step and nothing to install: the server uses only Node's built-in modules, including its built-in SQLite database.

1. Download or clone this repository.
2. Run `npm start` in the project folder.
3. Open http://localhost:3000.

The first start creates the database at `server/data/nearhand.db` and fills it with the seed data. The data then persists across restarts and is shared by everyone using that server. To start over, stop the server and run `npm run reset-db`. A database from before the relational schema is moved aside to `nearhand.legacy.db` automatically.

Run the automated tests with `npm test` (Node's built-in test runner; no outside services are called).

The site must be opened through the server, because the pages load their data from it. Maps load from the internet (Leaflet from cdnjs, map tiles from OpenStreetMap), so they need a connection.

### Email notifications (optional)

Every notification appears in the in-app inbox (the bell in the header). To also send them by email, create a free account at [resend.com](https://resend.com), create an API key, and start the server with these environment variables:

| Variable | Example | Purpose |
|---|---|---|
| `RESEND_API_KEY` | `re_123…` | Your Resend API key. Without it, emails are not sent (the inbox shows "Email not set up"). |
| `EMAIL_FROM` | `Nearhand <onboarding@resend.dev>` | Sender. `onboarding@resend.dev` works right away but only delivers to the email address on your Resend account; verify your own domain in Resend to email anyone. |
| `EMAIL_REDIRECT_TO` | `you@gmail.com` | Optional. Sends every email to this one address, which is handy while testing with the seeded `@example.com` accounts. |
| `APP_URL` | `https://nearhand.onrender.com` | Optional. The site address used for links in emails (default `http://localhost:3000`). |

The easiest way is a `.env` file in the project folder, which `npm start` loads automatically and git ignores:

```
RESEND_API_KEY=re_xxx
EMAIL_FROM="Nearhand <onboarding@resend.dev>"
```

Emails that Resend refuses (for example, to an address it isn't allowed to deliver to yet) show as "Email failed" in the recipient's notifications.

Each user can choose which notification types are emailed to them in Edit profile.

## Hosting

The site needs a running Node server, so static hosts such as GitHub Pages can't run it on their own. Any host that runs Node with a persistent disk works (for example Render, Railway or Fly.io): use `npm start` as the start command, and set `DB_FILE` to a path on the persistent disk (uploaded photos are stored in an `uploads` folder next to it). The server reads `PORT` from the environment.

## Try it in two minutes

Everything requires signing in. Seeded accounts use the password `demo1234`; switch users by signing out from the profile menu (top right) and signing in again.

| Account | Email |
|---|---|
| Dana Whitfield (employer, jobs in every stage) | `dana@example.com` |
| Marcus Reyes (worker, plumber with active jobs) | `marcus@example.com` |
| Kelly Nguyen (worker, has a counter-offer waiting) | `kelly@example.com` |

1. Sign in as **Dana** and post a job.
2. Sign in as **Marcus**, find the job and submit a bid.
3. Sign in as Dana. Optionally send a counter-offer, then hire Marcus.
4. Fund escrow with the pre-filled card.
5. Sign in as Marcus. Start the work and mark it complete.
6. Sign in as Dana. Confirm completion, and the payment shows as released.
7. Both users can now leave a review, and ratings update automatically.

Along the way, check the bell for notifications, the job pages for schedules and maps, and Marcus's profile for his portfolio.

To restore the starting data, stop the server and run `npm run reset-db`.

## Features

**Accounts**
- Two roles, Employer and Worker, chosen at signup and fixed afterward
- Signup requires name, email, password, phone and location
- Simulated email verification and password reset (an on-screen mock inbox)
- Your city places you on the map (near its center), which distance search measures from

**Messaging**
- Employers and workers can message each other from a worker's profile, a bid, the job page or the job agreement
- A Messages page with your conversations and the open thread; new messages appear instantly, and the Messages tab shows how many conversations are unread
- New messages also arrive as a notification (and email), at most one unread alert per conversation

**Notifications**
- In-app inbox with an unread count, for new and revised bids, counter-offers and replies, hiring decisions, escrow funded, work started, approval needed, payment released, new reviews and removed jobs
- The same notifications by email through Resend, with a per-type on/off switch for each user

**Employers**
- Create, edit and remove job postings with title, description, one of ten categories, city (shown on a map), required experience (in years), budget range and schedule
- Pick one of the categories or add a new one, which then appears for everyone (in filters and in workers' category choices)
- Any US city: cities the app doesn't know yet are looked up in the background on OpenStreetMap (Nominatim) and saved, so they work on maps and in distance search; if a city can't be found, its owner gets a notification
- Schedules: a start date and time, and an optional repeat (weekly on chosen days, every 2 weeks, or monthly) up to an end date
- Employers only see their own jobs
- Dashboard of posted jobs with status and a progress indicator, plus a to-do pop-up on sign-in
- View all bids, inspect worker profiles and reviews, send counter-offers, and hire
- Search and browse worker profiles, on a map and by distance

**Workers**
- Search open jobs by keyword, category, city, distance (within 5 to 50 miles) and budget, with results on a map; sort by newest, distance, employer rating, budget or bid count
- Detailed profile: photo, bio, skills, experience, pricing, average rating, reviews and completed-job count
- Portfolio of up to 24 photos and before/after pairs (drag the slider to compare), managed in Edit profile
- Submit bids with a price, message and optional photos of past work
- Edit or withdraw bids while a job is open, and respond to counter-offers

**Job workflow**

`Open for Bids` → `Worker Selected` → `Payment Funded` → `In Progress` → `Awaiting Approval` → `Completed`

- Bidding closes once a worker is selected
- An agreement summary shows the employer, worker, agreed price, description and status

**Simulated escrow**
- The employer funds the agreed amount, and the platform shows it as held
- Payment is released after the employer confirms completion
- No platform fees, and all card data is fake

**Reviews**
- One to five stars plus written feedback, both directions (employer to worker, worker to employer)
- Only available after a job is completed, and only to the two people on that job
- Average ratings and completed-job counts update automatically

## Architecture

Nearhand is a client–server app with no third-party packages: a Node server with a relational SQLite database and a JSON API, and a browser front end written as native ES modules (no build step).

```
package.json              npm start / npm test / npm run reset-db  ("type": "module")
shared/                   ES modules used by both the browser and the server
  constants.js            Statuses, built-in categories and cities, notification types
  schedule.js             Schedules and repeating visits
  format.js               Money, dates, distances
server/
  index.js                Starts the app (config from environment variables / .env)
  app.js                  Wires the database, services, queue, workers, storage and HTTP server together
  config.js               Settings
  db/schema.js            The relational schema, as ordered migrations
  db/index.js             Opens SQLite (node:sqlite), runs migrations, query and transaction helpers
  services/               Business rules, one module per area: accounts, jobs (bids, escrow, reviews,
                          dashboard, payments), profiles (workers, settings, portfolio), messaging,
                          notifications; common.js has shared helpers
  http/app.js             HTTP server: routing, CSRF checks, rate limits, security headers, static files
  http/routes.js          The REST endpoints
  http/sessions.js        Expiring sign-in sessions; the token changes when you sign in or out
  events.js               Live updates to the browser over Server-Sent Events (GET /api/events)
  queue.js                Background jobs stored in the database, with retries and backoff
  workers/email.js        Background job: email a notification through Resend
  workers/geocode.js      Background job: look up a new city on OpenStreetMap and place it on the map
  storage.js              Uploaded photos (local-disk driver; another driver, e.g. S3, can replace it)
  seed/                   Example data and generated placeholder images
  test/                   Automated tests (npm test)
  data/                   The database and uploaded photos (not committed to git)
public/
  index.html              Page shell; loads Leaflet (maps) and js/main.js
  css/                    Styles: tokens (colors, fonts, light/dark), base, layout, components, pages, features
  js/main.js              Boot: session, live updates, router
  js/router.js            Hash routes; each page loads its own data, renders, then mounts live parts (maps)
  js/api.js               API client
  js/session.js           Signed-in user, unread counts, and the live event stream
  js/registry.js          Where pages register their click, form and input handlers
  js/actions.js           One set of document listeners that dispatches to those handlers
  js/lib/html.js          html`...` templates that escape interpolated values automatically
  js/ui/                  Shared components, header and footer, maps, photo uploads
  js/views/               One module per page
```

**How data flows.** Each page asks the API for just the data it shows (for example `GET /api/jobs?radius=10&sort=near` or `GET /api/jobs/12`), and the server filters, sorts and decides what that viewer may see: signed-out visitors get nothing, employers only their own jobs, workers only their own bids and conversations, and password hashes and other people's contact details are never sent. Actions are REST calls (`POST /api/bids/7/hire`, `PUT /api/settings`, ...) that run a business rule on the server as the signed-in user, inside a database transaction. Changes are pushed to the people involved over `/api/events`, so dashboards, job pages, the bell and open conversations update without reloading. Emails and city lookups run as background jobs, so a slow outside service never holds up a page.

**Security.** Passwords are hashed with scrypt. Sessions live in the database, expire after 30 days without use, and get a new token on every sign-in and sign-out. Writes need a custom request header and a same-site origin (CSRF protection), sign-in, sign-up, password resets, uploads and messages are rate limited, uploads must really be images, and every response carries security headers (including a Content Security Policy).

## Planned features

These are not implemented, but the data model leaves room for them (for example, `Job.dispute` and the `Transaction` status field).

- Real payment processing
- Administrative dispute resolution
- Real email delivery for verification and password resets (the notification emails above already work)
- Visit reminders by email the day before, and changing a schedule after hiring
- Exact job locations (address search and map pins); jobs and people are currently placed near their city's center

## Contributing and forking

Fork the repository, make your changes on a branch, and open a pull request. Ideas for classmates:

- Add a feature from the planned list
- Add tests for more of the business rules in `server/services/`
- Add an S3 or Cloudflare R2 driver next to `server/storage.js`
- Improve accessibility or the mobile layout

## License

Add a license of your choice, for example MIT. See [choosealicense.com](https://choosealicense.com/).
