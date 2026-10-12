/* Seed data: example accounts, jobs in every stage, bids, reviews, payments, portfolios, notifications and
   conversations. buildSeed() returns plain objects with readable ids ('e1', 'j3', ...); server/seed/index.js
   inserts them into the database. */
import { STATUSES, KNOWN_CITIES, DAY } from '../../shared/constants.js';
import { dayKey, addDays } from '../../shared/schedule.js';
import { hashPassword } from '../lib/passwords.js';
import { hash, portrait, workPhoto, portfolioPhoto } from './placeholders.js';

export function buildSeed() {
  const now = Date.now(), demoPassword = hashPassword('demo1234'); // every seeded account shares this password
  const db = { users: [], employerProfiles: [], workerProfiles: [], jobs: [], bids: [], reviews: [], transactions: [], notifications: [], categories: [], cities: [], conversations: [], messages: [], session: { userId: null, pending: null, resetFor: null } };
  // Map pins are scattered a mile or two around each city's center so markers don't overlap.
  const jitter = (key, i) => ((hash(key + i) % 1000) / 1000 - 0.5) * 0.06;
  const pinNear = (loc, key) => { const c = KNOWN_CITIES[loc]; return c ? { lat: +(c[0] + jitter(key, 'a')).toFixed(5), lon: +(c[1] + jitter(key, 'o')).toFixed(5) } : { lat: null, lon: null }; };
  const U = (id, role, name, loc, days, phone) => db.users.push({ id, role, name, email: name.split(' ')[0].toLowerCase() + '@example.com', password: demoPassword, phone, location: loc, ...pinNear(loc, id), verified: true, avatar: portrait(id + name), emailPrefs: {}, createdAt: now - days * DAY });
  const E = (userId, company, about) => db.employerProfiles.push({ userId, company, about });
  const W = (userId, headline, bio, skills, categories, years, experience, rate, pricingNote) => db.workerProfiles.push({ userId, headline, bio, skills, categories, experienceYears: years, experience, hourlyRate: rate, pricingNote, portfolio: [] });

  U('e1', 'employer', 'Dana Whitfield', 'Austin, TX', 210, '(512) 555-0142');
  U('e2', 'employer', 'Priya Raman', 'Round Rock, TX', 160, '(512) 555-0188');
  U('e3', 'employer', 'Tom Okafor', 'Cedar Park, TX', 120, '(512) 555-0126');
  U('e4', 'employer', 'Helen Brooks', 'Austin, TX', 300, '(512) 555-0171');
  U('e5', 'employer', 'Luis Mendez', 'Pflugerville, TX', 90, '(512) 555-0109');
  E('e1', '', 'Homeowner in East Austin working through a long list of house projects. I communicate quickly and keep the space ready for whoever I hire.');
  E('e2', '', 'Parent and part-time nurse. I post clear jobs with realistic budgets and pay promptly.');
  E('e3', '', 'Dad of two, one very energetic dog. Happy to give detailed instructions and plenty of notice.');
  E('e4', 'Brooks & Bean Café', 'Owner of a neighborhood café. I hire local people for the odd jobs that keep a small business running.');
  E('e5', '', 'First-time homeowner learning as I go. Always grateful for pros who explain what they are doing.');

  U('w1', 'worker', 'Marcus Reyes', 'Austin, TX', 400, '(512) 555-0201');
  U('w2', 'worker', 'Aisha Bello', 'Austin, TX', 350, '(512) 555-0202');
  U('w3', 'worker', 'Jordan Kim', 'Round Rock, TX', 280, '(512) 555-0203');
  U('w4', 'worker', 'Carlos Ortega', 'Cedar Park, TX', 330, '(512) 555-0204');
  U('w5', 'worker', 'Nina Petrova', 'Austin, TX', 240, '(512) 555-0205');
  U('w6', 'worker', 'Ben Foster', 'Pflugerville, TX', 260, '(512) 555-0206');
  U('w7', 'worker', 'Tasha Greene', 'Austin, TX', 200, '(512) 555-0207');
  U('w8', 'worker', 'Omar Haddad', 'Round Rock, TX', 310, '(512) 555-0208');
  U('w9', 'worker', 'Kelly Nguyen', 'Georgetown, TX', 270, '(512) 555-0209');
  U('w10', 'worker', 'Rick Dunn', 'Austin, TX', 180, '(512) 555-0210');
  W('w1', 'Licensed plumber for repairs, fixtures and drains', 'Master plumber with 12 years in residential work. I handle leaks, fixture installs, water heaters and stubborn drains. You get an upfront price, no surprise fees, and a clean workspace when I leave.', ['Faucet & fixture install', 'Drain clearing', 'Water heaters', 'Leak repair', 'Garbage disposals'], ['plumbing'], 12, 'Master plumber, 12 years residential. Previously with Lone Star Mechanical.', 85, 'Free estimates. $85/hr with a one-hour minimum; flat quotes for most small jobs.');
  W('w2', 'Detail-focused home and move-out cleaning', 'I run a small two-person cleaning crew. We bring our own eco-friendly supplies and work from a checklist so nothing gets missed. Move-out cleans are our specialty.', ['Deep cleaning', 'Move-out cleans', 'Post-construction', 'Eco-friendly products'], ['cleaning'], 6, '6 years cleaning homes and short-term rentals; insured.', 40, '$40/hr per cleaner or flat price by square footage.');
  W('w3', 'Portrait and small-business photographer', 'I shoot headshots, team photos and product images with natural light and a simple studio kit. Edited photos are delivered within three days.', ['Headshots', 'Product photography', 'Family portraits', 'Photo editing'], ['photography'], 8, '8 years shooting for local businesses and families.', 120, 'Sessions start at $150. Includes 15 edited photos.');
  W('w4', 'Lawn care, planting and yard cleanup', 'Born and raised in Cedar Park. I keep lawns healthy and yards tidy: mowing, edging, mulching, hedge trimming and seasonal cleanup. I bring all equipment.', ['Mowing & edging', 'Mulch & beds', 'Aeration', 'Hedge trimming', 'Sprinkler checks'], ['landscaping'], 9, '9 years running my own lawn care route.', 45, '$45/hr or per-visit pricing for regular service.');
  W('w5', 'Math and test-prep tutor for grades 6 to 12', 'Former high-school math teacher. I break problems into small steps and help students build confidence, not just finish homework.', ['Algebra', 'Geometry', 'SAT/ACT math', 'Study skills'], ['tutoring'], 5, '5 years teaching, 3 years tutoring privately.', 50, '$50 per 60-minute session; discounts for 8-session packs.');
  W('w6', 'Handyman for the small stuff that piles up', 'I take care of the repairs nobody has time for: sticky doors, drywall patches, shelves, TV mounting and furniture assembly. Honest quotes and tidy work.', ['Drywall patching', 'Doors & hardware', 'Shelving & mounting', 'Furniture assembly', 'Interior touch-up paint'], ['handyman', 'painting'], 7, '7 years as a general handyman; former property maintenance tech.', 55, '$55/hr, two-hour minimum. Flat quotes after a photo review.');
  W('w7', 'Insured dog walker and pet sitter', 'I treat every pet like family. Daily walks, drop-in visits and overnight sitting, with photo updates after each visit.', ['Dog walking', 'Pet sitting', 'Medication help', 'Puppy care'], ['pets'], 4, '4 years of professional pet care; pet first-aid certified.', 25, '$25 per 30-minute walk; $60 per overnight.');
  W('w8', 'Friendly computer and home-network help', 'I fix the tech problems that make people groan: slow laptops, Wi-Fi dead zones, printers and small-business setups. I explain things in plain language.', ['Wi-Fi setup', 'Virus removal', 'Data backup', 'Printer & POS setup', 'Windows & Mac'], ['tech'], 10, '10 years in IT support, now freelancing.', 65, '$65/hr, billed in 30-minute increments.');
  W('w9', 'Interior and exterior painter', 'Clean lines, careful prep and respect for your home. I protect floors and furniture, patch and sand properly, and leave the room ready to use.', ['Interior painting', 'Trim & cabinets', 'Color consulting', 'Wall prep'], ['painting'], 11, '11 years painting residential and small commercial spaces.', 48, 'Quotes by room or square footage; paint supplied at cost if needed.');
  W('w10', 'Moving help with a truck and strong arms', 'Local moves, apartment loading, and heavy-item hauling. I come with a 15-foot truck, dollies, blankets and a helper.', ['Loading & unloading', 'Furniture disassembly', 'Packing', 'Stairs & heavy items'], ['moving'], 7, '7 years doing local moves.', 60, '$60/hr for two movers plus truck; two-hour minimum.');

  let jn = 0, bn = 0, rn = 0, tn = 1000;
  const job = o => {
    const k = STATUSES.indexOf(o.status || STATUSES[0]);
    const created = now - o.days * DAY;
    const history = []; for (let i = 0; i <= k; i++) history.push({ status: STATUSES[i], at: created + i * Math.min(DAY * 0.8, (o.days * DAY) / 8) });
    const emp = db.users.find(u => u.id === o.emp);
    const j = { id: 'j' + (++jn), employerId: o.emp, title: o.title, description: o.desc || (o.title + '. Details are in the agreement below; message me through the app once it is available.'), category: o.cat, location: emp.location, experience: o.exp || '3–5 years', budgetMin: o.min, budgetMax: o.max, ...pinNear(emp.location, 'job' + jn), schedule: o.sch || null, status: STATUSES[k], workerId: o.worker || null, agreedPrice: o.price || null, completionNote: o.note || '', history, createdAt: created, dispute: null };
    db.jobs.push(j); return j;
  };
  const bid = (j, w, price, message, o = {}) => db.bids.push({ id: 'b' + (++bn), jobId: j.id, workerId: w, price, message, photos: Array.from({ length: o.photos || 0 }, (_, i) => workPhoto(j.category, i)), status: o.status || 'active', counter: o.counter || null, history: [{ type: 'bid', price, at: j.createdAt + DAY * 0.4 }], createdAt: j.createdAt + DAY * 0.4 + (o.lag || 0) * 3600000 });
  const tx = (j, status) => {
    const fundedAt = (j.history[2] || j.history[j.history.length - 1]).at;
    const t = { id: 'TX-' + (++tn), jobId: j.id, employerId: j.employerId, workerId: j.workerId, amount: j.agreedPrice, fee: 0, status, card: 'Visa •••• 4242', events: [{ type: 'funded', at: fundedAt }], createdAt: fundedAt };
    if (status === 'released') t.events.push({ type: 'released', at: j.history[5].at });
    db.transactions.push(t);
  };
  const review = (j, from, to, rating, text, offset) => db.reviews.push({ id: 'r' + (++rn), jobId: j.id, fromId: from, toId: to, rating, text, createdAt: j.history[5].at + offset * 3600000 });

  /* Schedules, relative to today. on(n): the date n days from today; nextDay(dow, n): first given weekday at least n days away. */
  const today = new Date(), on = n => dayKey(addDays(today, n));
  const nextDay = (dow, n) => { let d = addDays(today, n); while (d.getDay() !== dow) d = addDays(d, 1); return d; };
  const once = (start, time) => ({ start, time, repeat: 'none', days: [], until: null });
  const weekly = (startDate, days, time, weeks, repeat = 'weekly') => ({ start: dayKey(startDate), time, repeat, days, until: dayKey(addDays(startDate, weeks * 7 - 1)) });

  /* Historical completed jobs (with reviews both ways) */
  [
    ['e1', 'w1', 'plumbing', 'Water heater flush and inspection', 160, 95, 5, 'Marcus arrived on time, explained exactly what he was doing and left the utility closet cleaner than he found it. Fair price too.', 5, 'Dana made access easy and paid right away. Great client.'],
    ['e3', 'w1', 'plumbing', 'Replace toilet fill valve', 95, 70, 5, 'Fast, friendly and fixed it in under an hour. Will hire again.', 5, 'Clear instructions and a pleasant home to work in.'],
    ['e4', 'w1', 'plumbing', 'Clear floor drain in café kitchen', 180, 150, 4, 'Solved a drain that had been slow for months. Came after closing so we lost no business.', 5, 'Helen had everything ready and was flexible with timing.'],
    ['e2', 'w2', 'cleaning', 'Deep clean for 2BR apartment', 220, 80, 5, 'Spotless. They got into corners I had given up on. Booking them again before our next move.', 5, 'Priya was organized and the apartment was easy to work in.'],
    ['e4', 'w2', 'cleaning', 'Post-renovation cleanup', 340, 130, 5, 'Dust everywhere after our remodel and the crew handled it all. Professional and efficient.', 5, 'Great communication about what needed doing.'],
    ['e4', 'w3', 'photography', 'Staff headshots (6 people)', 450, 110, 5, 'Jordan made the whole team comfortable and the photos look fantastic. Delivered ahead of schedule.', 5, 'Helen coordinated everyone perfectly.'],
    ['e5', 'w3', 'photography', 'Family portraits at the park', 300, 60, 4, 'Lovely photos and great with the kids. A couple of shots needed extra editing but overall very happy.', 5, 'Luis was relaxed and fun to work with.'],
    ['e3', 'w4', 'landscaping', 'Spring aeration and overseeding', 280, 100, 5, 'The lawn has never looked better. Carlos showed up when he said and explained the watering schedule.', 5, 'Tom was responsive and had gates unlocked.'],
    ['e1', 'w4', 'landscaping', 'Flower bed redesign and mulch', 360, 140, 4, 'Great eye for plants and a tidy finish. Took one extra day because of rain, but he kept me posted.', 5, 'Dana knew what she wanted and was open to suggestions.'],
    ['e2', 'w5', 'tutoring', 'SAT math prep, 4 sessions', 240, 55, 5, 'My daughter went from dreading math to asking for practice problems. Patient and well prepared.', 5, 'Priya made sure sessions were quiet and on schedule.'],
    ['e5', 'w6', 'handyman', 'Mount TV and hide cables', 140, 45, 5, 'Perfectly level and you cannot see a single wire. Quick, tidy and fairly priced.', 5, 'Luis had the wall plan ready. Easy job.'],
    ['e1', 'w6', 'handyman', 'Replace cabinet hinges, fix squeaky door', 110, 170, 4, 'Everything works smoothly now. Ben was upfront about one hinge that needed a different part.', 5, 'Dana was clear about priorities.'],
    ['e3', 'w7', 'pets', 'Dog sitting over a long weekend', 210, 75, 5, 'Tasha sent daily photos and our dog was relaxed when we came home. We have already booked her for summer.', 5, 'Tom left detailed notes about the dog. Thank you!'],
    ['e4', 'w8', 'tech', 'Laptop cleanup and data backup', 120, 85, 5, 'Omar removed the malware and set up automatic backups. Explained it all in plain English.', 5, 'Helen was prepared and appreciative.'],
    ['e1', 'w9', 'painting', 'Paint guest bedroom', 420, 120, 5, 'Sharp lines, great prep and zero mess. The room looks brand new.', 5, 'Dana had colors chosen and the room cleared.'],
    ['e5', 'w9', 'painting', 'Exterior trim repaint', 520, 50, 5, 'Kelly scraped, primed and painted every window frame. Looks fantastic.', 4, 'Luis was friendly; payment confirmation took a day.'],
    ['e2', 'w10', 'moving', 'Move couch and dresser across town', 190, 65, 4, 'On time, careful with furniture and very friendly. Truck was a little tight but it all fit.', 5, 'Priya had everything labeled. Smooth move.']
  ].forEach(([emp, w, cat, title, price, days, r1, t1, r2, t2]) => {
    const j = job({ emp, title, cat, min: Math.round(price * 0.8), max: Math.round(price * 1.2), status: 'Completed', worker: w, price, days });
    j.schedule = once(dayKey(new Date(j.history[3].at)), '10:00');
    bid(j, w, price, 'Happy to take this on. I can start as soon as you confirm the schedule.', { status: 'accepted' });
    tx(j, 'released');
    review(j, emp, w, r1, t1, 20); review(j, w, emp, r2, t2, 30);
  });

  /* Open jobs with bids */
  let j;
  j = job({ emp: 'e1', title: 'Replace kitchen faucet and fix slow drain', sch: once(on(5), '09:00'), cat: 'plumbing', min: 120, max: 220, days: 2, exp: '3–5 years', desc: 'Our kitchen faucet drips constantly and the sink drains slowly. I already bought a new pull-down faucet that needs installing, and I would like the drain snaked while you are here. The shut-off valves under the sink are easy to reach.' });
  bid(j, 'w1', 175, 'I have installed dozens of pull-down faucets and always test the drain afterwards. I can come Thursday or Saturday morning, bring a drain snake, and replace supply lines if the old ones are worn (parts at cost). Past work attached.', { photos: 2 });
  bid(j, 'w6', 150, 'I can handle both the faucet and the drain in about two hours. I do a lot of small plumbing for homeowners and will clean up after.', { lag: 5 });
  j = job({ emp: 'e1', title: 'Paint living room and hallway (about 650 sq ft of wall)', sch: once(on(12), '08:00'), cat: 'painting', min: 500, max: 900, days: 3, exp: '3–5 years', desc: 'Looking for a careful painter to repaint our living room and hallway in two soft neutrals. Walls need light patching and sanding first. Ceilings stay as they are. Furniture can be moved to the center of the room.' });
  bid(j, 'w9', 720, 'I would patch, sand, prime stains and apply two coats, including cutting in clean lines at ceilings and trim. I can help with color choices and use low-VOC paint. Two to three days of work.', { photos: 3 });
  db.bids[db.bids.length - 1].counter = { price: 650, note: 'Could you do it for $650 if I buy the paint myself?', status: 'pending', at: now - 1 * DAY };
  db.bids[db.bids.length - 1].history.push({ type: 'counter', price: 650, at: now - 1 * DAY });
  bid(j, 'w6', 640, 'I can do both rooms in two days. Price includes patching and two coats; paint at cost if you want me to buy it.', { lag: 9, photos: 1 });
  j = job({ emp: 'e2', title: 'Move-out deep clean for 3BR/2BA apartment', sch: once(dayKey(nextDay(6, 2)), '10:00'), cat: 'cleaning', min: 200, max: 350, days: 1, exp: '0–2 years', desc: 'We are handing back the keys on the 30th and need a thorough move-out clean: kitchen appliances inside and out, bathrooms, baseboards, blinds, and carpets vacuumed. Apartment will be empty.' });
  bid(j, 'w2', 265, 'My crew has done dozens of move-out cleans and we work from a landlord-style checklist. We can finish a 3BR in about four hours with two people.', { photos: 2 });
  j = job({ emp: 'e2', title: 'Algebra I tutoring for a 9th grader, twice a week', sch: weekly(nextDay(2, 3), [2, 4], '16:00', 4), cat: 'tutoring', min: 300, max: 500, days: 4, exp: '3–5 years', desc: 'My son is struggling with equations and word problems. We would like 8 sessions (two per week, one hour each) with someone patient who can rebuild his confidence.' });
  bid(j, 'w5', 400, 'Eight one-hour sessions at $50 each. I will begin with a short diagnostic, then focus on the exact skills that are holding him back, and send you a brief summary after every session.');
  j = job({ emp: 'e3', title: 'Weekly lawn mowing and edging (quarter-acre) for the summer', sch: weekly(nextDay(6, 2), [6], '08:00', 12), cat: 'landscaping', min: 300, max: 520, days: 2, exp: '0–2 years', desc: 'Need reliable weekly mowing, edging and blowing off the driveway for a quarter-acre lot with a fenced backyard. Gate code provided. Sprinkler heads are marked.' });
  bid(j, 'w4', 420, '12 weekly visits for $35 each. I use mulching blades, edge every cut and blow off hard surfaces. I will send a quick photo after each visit.', { photos: 2 });
  j = job({ emp: 'e3', title: 'Weekday midday dog walks for a friendly lab mix', sch: weekly(nextDay(1, 1), [1, 2, 3, 4, 5], '12:00', 2), cat: 'pets', min: 150, max: 250, days: 1, exp: '0–2 years', desc: 'Our 3-year-old lab mix needs a 30-minute midday walk on weekdays for two weeks while we are at the office. He is good on a leash and loves meeting people.' });
  bid(j, 'w7', 190, 'Ten 30-minute walks at about $19 each. I will send a photo and a short report after every walk, and I am pet first-aid certified.', { photos: 1 });
  j = job({ emp: 'e4', title: 'Product photos for our new café menu (12 items)', sch: once(on(9), '07:00'), cat: 'photography', min: 350, max: 600, days: 3, exp: '6–10 years', desc: 'We are launching a new seasonal menu and need bright, appetizing photos of 12 drinks and pastries for our website and Instagram. Shoot would happen in the café before opening.' });
  bid(j, 'w3', 480, 'I shoot menu photography with natural light and a small reflector kit. $480 covers a 2-hour session, 36 edited images and web-sized files delivered in 3 days.', { photos: 3 });
  j = job({ emp: 'e4', title: 'Set up café Wi-Fi, receipt printer and POS tablet', sch: once(on(4), '14:00'), cat: 'tech', min: 150, max: 300, days: 2, exp: '3–5 years', desc: 'We bought a new router, a thermal receipt printer and a tablet POS stand. Need everything installed, secured with a guest/staff network split, and tested with a couple of transactions.' });
  bid(j, 'w8', 220, 'I can set up the network with separate staff and guest Wi-Fi, connect the printer and POS, and train your team in 20 minutes. Estimated 3 hours onsite.', { photos: 1 });
  j = job({ emp: 'e5', title: 'Fix sticking bedroom door and patch two drywall holes', cat: 'handyman', min: 80, max: 180, days: 1, exp: '0–2 years', desc: 'The bedroom door sticks at the top corner, and there are two fist-sized holes in the hallway drywall that need patching, sanding and priming (I will paint).' });
  bid(j, 'w6', 120, 'I can plane the door and patch both holes in a single visit. I will leave them primed and ready for paint.', { photos: 2 });
  j = job({ emp: 'e5', title: 'Load and unload a 1BR apartment (third-floor walk-up)', sch: once(dayKey(nextDay(6, 6)), '09:00'), cat: 'moving', min: 200, max: 400, days: 2, exp: '0–2 years', desc: 'Moving about 4 miles. One bedroom, couch, bed frame, dresser, 20 boxes. Third-floor walk-up on the loading side; elevator at the new place.' });
  bid(j, 'w10', 320, 'My 15-foot truck and a helper can do this in about 4 hours. Price includes blankets, dollies and basic disassembly of the bed frame.', { photos: 1 });
  bid(j, 'w6', 380, 'I have a pickup and a friend who helps. Could do it in two trips.', { lag: 12 });

  /* Jobs further along the workflow */
  j = job({ emp: 'e1', title: 'Replace garbage disposal', sch: once(on(3), '10:00'), cat: 'plumbing', min: 150, max: 250, days: 2, status: 'Worker Selected', worker: 'w1', price: 210, desc: 'The existing disposal jams and hums. A new 1/2 HP disposal is already at the house and needs to be swapped in, including the electrical connection.' });
  bid(j, 'w1', 210, 'I can swap the disposal and test the dishwasher connection while I am there. Happy to dispose of the old unit.', { status: 'accepted', photos: 1 });
  bid(j, 'w6', 190, 'I can do this next week.', { status: 'rejected', lag: 8 });
  j = job({ emp: 'e1', title: 'Install floating shelves in living room', sch: once(on(-2), '13:00'), cat: 'handyman', min: 180, max: 300, days: 6, status: 'Awaiting Approval', worker: 'w6', price: 240, note: 'All three shelves are installed and level, anchored into studs. I also patched two old anchor holes. Let me know if you would like anything adjusted!', desc: 'Three 48-inch floating shelves on the main living room wall. Brackets and boards already purchased.' });
  bid(j, 'w6', 240, 'I will locate studs, mark everything out with a level and install all three shelves in one visit.', { status: 'accepted' }); tx(j, 'held');
  j = job({ emp: 'e2', title: 'Fix leaking bathroom sink trap', sch: once(on(0), '15:00'), cat: 'plumbing', min: 90, max: 180, days: 3, status: 'In Progress', worker: 'w1', price: 135, desc: 'Slow leak under the bathroom sink at the trap connection. Likely needs a new trap assembly and gasket.' });
  bid(j, 'w1', 135, 'Likely a worn trap and slip-joint washers. I carry those parts so this should be a one-visit fix.', { status: 'accepted' }); tx(j, 'held');
  j = job({ emp: 'e3', title: 'Backyard cleanup and hedge trimming', sch: once(on(1), '08:00'), cat: 'landscaping', min: 250, max: 400, days: 4, status: 'Payment Funded', worker: 'w4', price: 320, desc: 'Clear fallen branches, trim the front and back hedges, and bag the clippings. Disposal included.' });
  bid(j, 'w4', 320, 'I can haul everything away and have a crew of two. About half a day of work.', { status: 'accepted' }); tx(j, 'held');
  j = job({ emp: 'e4', title: 'Repaint café back room', sch: weekly(nextDay(1, -6), [1], '07:00', 3), cat: 'painting', min: 600, max: 900, days: 7, status: 'In Progress', worker: 'w9', price: 780, desc: 'Repaint the back storage and prep room in a washable semi-gloss. Includes trim and door. Work will happen on Mondays when we are closed.' });
  bid(j, 'w9', 780, 'Two Mondays should do it. I will use a scrubbable semi-gloss and protect all shelving.', { status: 'accepted' }); tx(j, 'held');

  /* Portfolios: two finished-work photos and two before/after pairs per worker */
  const CAPTIONS = {
    plumbing: ['Pull-down faucet install', 'Tankless water heater swap', 'Rusted shut-off valves replaced', 'Corroded drain line rebuilt'],
    cleaning: ['Move-out kitchen clean', 'Bathroom deep clean', 'Grease-coated range hood', 'Post-renovation dust cleanup'],
    photography: ['Café team headshots', 'Seasonal menu product shoot', 'Dim lobby relit for listing photos', 'Retouched family portrait'],
    landscaping: ['Native plant bed', 'Edged and striped lawn', 'Overgrown backyard cleared', 'Patchy lawn overseeded'],
    handyman: ['Floating shelves, anchored to studs', 'Mounted TV with hidden cables', 'Hole in drywall patched', 'Sagging cabinet doors rehung'],
    moving: ['Two-bedroom move, packed truck', 'Piano moved down two flights', 'Cluttered garage cleared out', 'Storage unit consolidated'],
    tutoring: ['SAT practice workbook plan', 'Algebra study guide', 'Quiz scores over 6 weeks', 'Messy notes to organized binder'],
    pets: ['Afternoon walk route', 'Puppy training session', 'Matted coat after grooming', 'Muddy pup, bath day'],
    painting: ['Two-tone living room', 'Glossy white trim', 'Scuffed hallway repainted', 'Faded front door refreshed'],
    tech: ['Small-office Wi-Fi rack', 'POS and receipt printer setup', 'Cable mess under desk tidied', 'Slow laptop cleaned up']
  };
  let pn = 0;
  db.workerProfiles.forEach((p, wi) => {
    const cat = p.categories[0], caps = CAPTIONS[cat], at = i => now - (40 + wi * 3 + i * 9) * DAY;
    p.portfolio = [
      { id: 'p' + (++pn), kind: 'pair', before: portfolioPhoto(cat, 2, 'before'), after: portfolioPhoto(cat, 2, 'after'), caption: caps[2], category: cat, createdAt: at(0) },
      { id: 'p' + (++pn), kind: 'photo', src: portfolioPhoto(cat, 0), caption: caps[0], category: cat, createdAt: at(1) },
      { id: 'p' + (++pn), kind: 'pair', before: portfolioPhoto(cat, 3, 'before'), after: portfolioPhoto(cat, 3, 'after'), caption: caps[3], category: cat, createdAt: at(2) },
      { id: 'p' + (++pn), kind: 'photo', src: portfolioPhoto(cat, 1), caption: caps[1], category: cat, createdAt: at(3) }
    ];
  });

  /* A few notifications so the inbox isn't empty. email.status 'sample' means no email was sent for them. */
  let nn = 0;
  const jobNamed = t => db.jobs.find(x => x.title === t);
  const note = (userId, type, title, body, link, hoursAgo, read) => db.notifications.push({ id: 'n' + (++nn), userId, type, title, body, link, read, email: { status: 'sample' }, createdAt: now - hoursAgo * 3600000 });
  const shelves = jobNamed('Install floating shelves in living room'), faucet = jobNamed('Replace kitchen faucet and fix slow drain');
  const paint = jobNamed('Paint living room and hallway (about 650 sq ft of wall)'), disposal = jobNamed('Replace garbage disposal');
  note('e1', 'progress', `Approval needed: "${shelves.title}"`, 'Ben Foster marked the work complete. Review it and release $240 from escrow.', '#/job/' + shelves.id, 20, false);
  note('e1', 'bid', `New bid on "${paint.title}"`, 'Ben Foster bid $640: "I can do both rooms in two days."', '#/job/' + paint.id, 30, false);
  note('e1', 'bid', `New bid on "${faucet.title}"`, 'Ben Foster bid $150: "I can handle both the faucet and the drain in about two hours."', '#/job/' + faucet.id, 40, true);
  note('e1', 'bid', `New bid on "${faucet.title}"`, 'Marcus Reyes bid $175: "I have installed dozens of pull-down faucets."', '#/job/' + faucet.id, 44, true);
  note('w1', 'hired', `You're hired for "${disposal.title}"`, 'Dana Whitfield accepted your bid of $210. You can start once they fund escrow.', '#/job/' + disposal.id, 30, false);
  note('w9', 'counter', `Counter-offer on "${paint.title}"`, 'Dana Whitfield offered $650 instead of your $720. Note: "Could you do it for $650 if I buy the paint myself?"', '#/job/' + paint.id, 24, false);
  note('w4', 'funded', 'Escrow funded for "Backyard cleanup and hedge trimming"', '$320 is held in escrow. You can start the work.', '#/job/' + jobNamed('Backyard cleanup and hedge trimming').id, 50, false);

  /* Sample conversations */
  let mn = 0;
  const chat = (id, a, b, lines) => {
    const start = now - lines.length * 3 * 3600000;
    lines.forEach(([from, text], i) => db.messages.push({ id: 'm' + (++mn), conversationId: id, fromId: from === 'a' ? a : b, text, createdAt: start + i * 3 * 3600000 }));
    const last = db.messages[db.messages.length - 1].createdAt;
    db.conversations.push({ id, participants: [a, b], lastRead: { [a]: last, [b]: lines[lines.length - 1][0] === 'b' ? last : last - 1 }, createdAt: start, updatedAt: last });
  };
  chat('c1', 'e1', 'w1', [
    ['a', 'Hi Marcus, thanks for taking the garbage disposal job. Does Thursday morning still work for you?'],
    ['b', 'Thursday works. I can be there at 10. Is the new disposal already under the sink?'],
    ['a', 'Yes, it is in the box under the sink. I will fund escrow today.']
  ]);
  chat('c2', 'e1', 'w9', [
    ['a', 'Hi Kelly, I sent a counter-offer on the living room painting. Happy to talk it through.'],
    ['b', 'Thanks Dana! If you buy the paint, $650 could work. What colors are you thinking?']
  ]);

  return db;
}
