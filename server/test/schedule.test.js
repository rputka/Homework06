/* Repeating schedules (shared/schedule.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSchedule, occurrences, scheduleText } from '../../shared/schedule.js';

const days = sch => occurrences(sch).map(o => o.start.toDateString().slice(0, 10));

test('weekly on chosen days, until an end date', () => {
  const r = readSchedule({ schedStart: '2026-10-20', schedTime: '16:00', schedRepeat: 'weekly', schedDays: ['2', '4'], schedUntil: '2026-11-12' });
  assert.equal(r.ok, true);
  assert.equal(occurrences(r.value).length, 8);
  assert.equal(scheduleText(r.value), 'Weekly on Tue and Thu, 4:00 PM, Oct 20 to Nov 12');
});

test('every two weeks skips alternate weeks', () => {
  const r = readSchedule({ schedStart: '2026-10-17', schedTime: '08:00', schedRepeat: 'biweekly', schedUntil: '2026-11-30' });
  assert.deepEqual(days(r.value), ['Sat Oct 17', 'Sat Oct 31', 'Sat Nov 14', 'Sat Nov 28']);
});

test('monthly skips months without that date', () => {
  const r = readSchedule({ schedStart: '2026-01-31', schedTime: '09:30', schedRepeat: 'monthly', schedUntil: '2026-06-30' });
  assert.deepEqual(days(r.value), ['Sat Jan 31', 'Tue Mar 31', 'Sun May 31']);
});

test('invalid schedules are rejected with a clear message', () => {
  assert.match(readSchedule({ schedStart: '2026-10-20', schedRepeat: 'weekly' }).error, /ends/);
  assert.match(readSchedule({ schedStart: '2026-10-20', schedRepeat: 'weekly', schedUntil: '2026-10-01' }).error, /on or after/);
  assert.match(readSchedule({ schedStart: '2026-10-20', schedRepeat: 'weekly', schedUntil: '2028-01-01' }).error, /one year/);
  assert.deepEqual(readSchedule({}), { ok: true, value: null }, 'no start date means flexible');
});
