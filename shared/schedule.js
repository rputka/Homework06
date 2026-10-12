/* Job schedules and recurrence (shared by the browser and the server).
   A schedule is { start: 'YYYY-MM-DD', time: 'HH:MM', repeat: 'none'|'weekly'|'biweekly'|'monthly',
   days: [0-6] (weekdays, for weekly/biweekly; 0 = Sunday), until: 'YYYY-MM-DD' (last possible day, for repeating) }.
   Dates and times are local "wall clock" values, like a paper calendar. */

export const REPEATS = { none: 'Does not repeat', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MAX_SCHEDULE_DAYS = 366; // repeating schedules can run for at most a year

export const pad2 = n => String(n).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 ? d : null; };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const fmtTime = t => { const [h, m] = String(t).split(':').map(Number); return `${(h % 12) || 12}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'}`; };
export const fmtDay = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const clockOf = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const visitText = o => `${fmtDay(o.start)}, ${fmtTime(clockOf(o.start))}`; // e.g. "Tue, Oct 20, 4:00 PM"

/* Every visit of a schedule between two dates (inclusive), as { start } (a Date), oldest first. */
export function occurrences(sch, from, to) {
  const first = sch && parseDay(sch.start); if (!first) return [];
  const [h, m] = String(sch.time || '09:00').split(':').map(Number);
  const visit = d => ({ start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m) });
  const lo = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : first;
  const hi = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate()) : addDays(first, MAX_SCHEDULE_DAYS);
  if (sch.repeat === 'none' || !REPEATS[sch.repeat]) return first >= lo && first <= hi ? [visit(first)] : [];
  const last = parseDay(sch.until) || addDays(first, MAX_SCHEDULE_DAYS);
  const end = last < hi ? last : hi, out = [];
  if (sch.repeat === 'monthly') {
    for (let i = 0; ; i++) {
      const d = new Date(first.getFullYear(), first.getMonth() + i, first.getDate());
      if (d > end) break;
      if (d.getDate() === first.getDate() && d >= lo) out.push(visit(d)); // skips months without that date (e.g. the 31st)
    }
    return out;
  }
  const days = (sch.days && sch.days.length ? sch.days : [first.getDay()]).map(Number);
  const weekStart = addDays(first, -first.getDay());
  for (let d = first > lo ? first : lo; d <= end; d = addDays(d, 1)) {
    const week = Math.floor(Math.round((d - weekStart) / 86400000) / 7);
    if (sch.repeat === 'biweekly' && week % 2) continue;
    if (days.includes(d.getDay())) out.push(visit(d));
  }
  return out;
}

export const nextVisit = (sch, now = new Date()) => occurrences(sch, now, null).find(o => o.start >= now) || null;

/* Human-readable summary, e.g. "Weekly on Tue and Thu, 4:00 PM, Oct 20 to Nov 12". */
export function scheduleText(sch) {
  const first = sch && parseDay(sch.start); if (!first) return 'Flexible';
  const at = fmtTime(sch.time);
  if (sch.repeat === 'none') return `${fmtDay(first)}, ${at}`;
  const until = parseDay(sch.until), range = `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${until ? until.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'ongoing'}`;
  if (sch.repeat === 'monthly') return `Monthly on day ${first.getDate()}, ${at}, ${range}`;
  const days = (sch.days && sch.days.length ? sch.days : [first.getDay()]).map(Number).sort();
  const dayList = days.length === 5 && days.join() === '1,2,3,4,5' ? 'weekdays' : days.map(d => WEEKDAYS[d]).join(days.length === 2 ? ' and ' : ', ');
  return `${REPEATS[sch.repeat]} on ${dayList}, ${at}, ${range}`;
}

/* Validates the schedule fields of the job form. Returns { ok, value } where value is a schedule or null (flexible). */
export function readSchedule(d) {
  const start = String(d.schedStart || '').trim();
  if (!start) return { ok: true, value: null };
  const first = parseDay(start); if (!first) return { ok: false, error: 'Enter a valid start date.' };
  const time = String(d.schedTime || '09:00'); if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: 'Enter a valid start time.' };
  const repeat = REPEATS[d.schedRepeat] ? d.schedRepeat : 'none';
  const sch = { start, time, repeat, days: [], until: null };
  if (repeat === 'none') return { ok: true, value: sch };
  const until = parseDay(d.schedUntil);
  if (!until) return { ok: false, error: 'Choose the date the repeating schedule ends.' };
  if (until < first) return { ok: false, error: 'The end date must be on or after the start date.' };
  if ((until - first) / 86400000 > MAX_SCHEDULE_DAYS) return { ok: false, error: 'Repeating schedules can run for up to one year.' };
  sch.until = dayKey(until);
  if (repeat !== 'monthly') {
    const days = [].concat(d.schedDays || []).map(Number).filter(n => n >= 0 && n <= 6);
    sch.days = [...new Set(days.length ? days : [first.getDay()])].sort();
  }
  if (!occurrences(sch).length) return { ok: false, error: 'That schedule has no visits. Check the days and end date.' };
  return { ok: true, value: sch };
}
