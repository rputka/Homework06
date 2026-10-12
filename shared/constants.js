/* Constants shared by the browser and the server. Data shapes are documented in server/db/schema.sql. */

export const STATUSES = ['Open for Bids', 'Worker Selected', 'Payment Funded', 'In Progress', 'Awaiting Approval', 'Completed'];
export const EXPERIENCE = ['0–2 years', '3–5 years', '6–10 years', '10+ years'];
// Notification types; each can be switched off for email in Edit profile. roles: who receives that type.
export const NOTIFY_TYPES = {
  bid: { label: 'New bids, revised bids and withdrawn bids', roles: ['employer'] },
  counter: { label: 'Counter-offers and replies to them', roles: ['employer', 'worker'] },
  hired: { label: 'Hiring decisions on your bids', roles: ['worker'] },
  funded: { label: 'Escrow funded, so work can start', roles: ['worker'] },
  progress: { label: 'Work started, and work waiting for your approval', roles: ['employer'] },
  paid: { label: 'Payments released to you', roles: ['worker'] },
  review: { label: 'New reviews about you', roles: ['employer', 'worker'] },
  job: { label: 'Jobs you bid on being removed', roles: ['worker'] },
  message: { label: 'New messages', roles: ['employer', 'worker'] },
  location: { label: 'Problems placing your city on the map', roles: ['employer', 'worker'] }
};
export const MESSAGE_MAX = 2000;
export const PORTFOLIO_MAX = 24;
// icon: SVG path data for a 24x24 line icon (drawn with stroke, no fill); hue tints generated sample photos.
export const CATS = [
  { id: 'plumbing', name: 'Plumbing', hue: 200, icon: 'M14.7 6.3a4 4 0 0 0-5.3 5.3L3.5 17.5a2.1 2.1 0 0 0 3 3l5.9-5.9a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.6-.4-.4-2.6z' },
  { id: 'cleaning', name: 'Cleaning', hue: 170, icon: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 15l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8zM5.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z' },
  { id: 'photography', name: 'Photography', hue: 285, icon: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z' },
  { id: 'landscaping', name: 'Landscaping & lawn care', hue: 120, icon: 'M5 20c0-8.5 5-14 15-15-.5 9.5-6.5 15-15 15zM5 20l8-8' },
  { id: 'handyman', name: 'Handyman & home repair', hue: 30, icon: 'M14 9.5L4.6 18.9a1.9 1.9 0 0 0 2.7 2.7L16.6 12.2M11.5 5.5L14 3l7 7-2.5 2.5-2.5-2.5-2.5-2.5z' },
  { id: 'moving', name: 'Moving help', hue: 45, icon: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9' },
  { id: 'tutoring', name: 'Tutoring', hue: 245, icon: 'M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20M8 7h8' },
  { id: 'pets', name: 'Pet care & dog walking', hue: 12, icon: 'M12 20.5c-2.8 0-4.5-1.6-4.5-3.4 0-2.3 2.2-4.6 4.5-4.6s4.5 2.3 4.5 4.6c0 1.8-1.7 3.4-4.5 3.4zM5 12a1.7 2 0 1 0 0-.1M19 12a1.7 2 0 1 0 0-.1M9 7a1.7 2 0 1 0 0-.1M15 7a1.7 2 0 1 0 0-.1' },
  { id: 'painting', name: 'Painting', hue: 340, icon: 'M4 4h13v5H4zM17 6.5h3v5h-8.5v3M10 14.5h3V21h-3z' },
  { id: 'tech', name: 'Computer & tech support', hue: 215, icon: 'M5 5h14v10H5zM3 19h18M9 15l-.5 4M15 15l.5 4' }
];
CATS.sort((a, b) => a.name.localeCompare(b.name));

// Icon for categories that employers add (a tag).
export const GENERIC_CAT_ICON = 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01';
export const NEW_CATEGORY = '__new'; // value of the "Add a new category" choice on the job form

/* Cities with built-in coordinates [lat, lon]. Other cities are looked up the first time they are used and saved
   in the database by a background job (see server/workers/geocode.js). */
export const KNOWN_CITIES = {
  'Austin, TX': [30.2672, -97.7431],
  'Round Rock, TX': [30.5083, -97.6789],
  'Cedar Park, TX': [30.5052, -97.8203],
  'Pflugerville, TX': [30.4394, -97.6200],
  'Georgetown, TX': [30.6333, -97.6770],
  'Leander, TX': [30.5788, -97.8531],
  'Hutto, TX': [30.5427, -97.5467],
  'San Marcos, TX': [29.8833, -97.9414],
  'Kyle, TX': [29.9891, -97.8772],
  'Buda, TX': [30.0852, -97.8403]
};
// Compares city names loosely: "Round Rock, TX", "round rock tx" and " Round  Rock,TX" all match.
export const cityKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const DAY = 86400000;
