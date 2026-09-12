import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  describe,
  isDue,
  localParts,
  nextRun,
  nextRuns,
  periodKeyFor,
  zonedToInstant,
} from './schedule.ts';
import type { Schedule } from './schedule.ts';

const IST = 'Asia/Kolkata';

/** Renders an instant as local wall time in a zone, for readable assertions. */
const wall = (instant: Date, tz = IST) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);

// --- timezone arithmetic ---------------------------------------------------

test('a local wall time maps to the right instant', () => {
  // 09:30 IST is 04:00 UTC.
  const instant = zonedToInstant(
    { year: 2026, month: 9, day: 14, hour: 9, minute: 30 },
    IST,
  );
  assert.equal(instant.toISOString(), '2026-09-14T04:00:00.000Z');
});

test('the same wall time in a DST zone lands correctly on both sides', () => {
  // London is UTC+1 in July and UTC+0 in January. A scheduler that is wrong
  // twice a year is worse than one that is obviously wrong.
  const summer = zonedToInstant(
    { year: 2026, month: 7, day: 15, hour: 9, minute: 0 },
    'Europe/London',
  );
  const winter = zonedToInstant(
    { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
    'Europe/London',
  );
  assert.equal(summer.toISOString(), '2026-07-15T08:00:00.000Z');
  assert.equal(winter.toISOString(), '2026-01-15T09:00:00.000Z');
});

test('local parts are read in the declared zone, not the host zone', () => {
  // 2026-09-14T20:00Z is already the 15th in India.
  const parts = localParts(new Date('2026-09-14T20:00:00Z'), IST);
  assert.equal(parts.day, 15);
  assert.equal(parts.month, 9);
});

// --- daily -----------------------------------------------------------------

test('a daily schedule fires at the declared local time', () => {
  const schedule: Schedule = {
    kind: 'daily',
    at: { hour: 9, minute: 30 },
    weekdaysOnly: false,
  };
  const next = nextRun(schedule, IST, new Date('2026-09-14T01:00:00Z'));
  assert.equal(wall(next!), '14/09/2026, 09:30');
});

test('a daily schedule rolls to tomorrow once today has passed', () => {
  const schedule: Schedule = {
    kind: 'daily',
    at: { hour: 9, minute: 30 },
    weekdaysOnly: false,
  };
  // 12:00 IST on the 14th, so 09:30 has gone.
  const next = nextRun(schedule, IST, new Date('2026-09-14T06:30:00Z'));
  assert.equal(wall(next!), '15/09/2026, 09:30');
});

test('weekdays-only skips Sunday but keeps Saturday', () => {
  // Saturday is a working day at most Indian institutes; Sunday is not.
  const schedule: Schedule = {
    kind: 'daily',
    at: { hour: 9, minute: 0 },
    weekdaysOnly: true,
  };
  // 2026-09-19 is a Saturday, 2026-09-20 a Sunday.
  const saturday = nextRun(schedule, IST, new Date('2026-09-19T01:00:00Z'));
  assert.equal(wall(saturday!), '19/09/2026, 09:00');

  const afterSaturday = nextRun(schedule, IST, new Date('2026-09-19T06:00:00Z'));
  assert.equal(wall(afterSaturday!), '21/09/2026, 09:00', 'Sunday must be skipped');
});

// --- monthly ---------------------------------------------------------------

test('"two days before month end" is the 28th in September', () => {
  // The institute's actual sentence. A fixed day-of-month gets this wrong.
  const schedule: Schedule = {
    kind: 'monthly-before-end',
    daysBeforeEnd: 2,
    at: { hour: 10, minute: 0 },
  };
  const next = nextRun(schedule, IST, new Date('2026-09-01T00:00:00Z'));
  assert.equal(wall(next!), '28/09/2026, 10:00');
});

test('"two days before month end" moves with the month length', () => {
  const schedule: Schedule = {
    kind: 'monthly-before-end',
    daysBeforeEnd: 2,
    at: { hour: 10, minute: 0 },
  };
  // February 2027 has 28 days, so two days before the end is the 26th.
  const february = nextRun(schedule, IST, new Date('2027-02-01T00:00:00Z'));
  assert.equal(wall(february!), '26/02/2027, 10:00');
});

test('a fixed day-of-month clamps in a short month instead of skipping it', () => {
  const schedule: Schedule = {
    kind: 'monthly-on',
    dayOfMonth: 31,
    at: { hour: 10, minute: 0 },
  };
  // A month with no 31st must still get its run, on the last day.
  const february = nextRun(schedule, IST, new Date('2027-02-01T00:00:00Z'));
  assert.equal(wall(february!), '28/02/2027, 10:00');
});

// --- weekly ----------------------------------------------------------------

test('a weekly schedule finds the right weekday', () => {
  const schedule: Schedule = { kind: 'weekly', weekday: 6, at: { hour: 11, minute: 0 } };
  const next = nextRun(schedule, IST, new Date('2026-09-14T01:00:00Z'));
  assert.equal(wall(next!), '19/09/2026, 11:00', 'the coming Saturday');
});

// --- manual ----------------------------------------------------------------

test('a manual schedule never fires on its own', () => {
  const schedule: Schedule = { kind: 'manual' };
  assert.equal(nextRun(schedule, IST, new Date()), undefined);
  assert.equal(isDue(schedule, IST, new Date()), false);
  assert.match(describe(schedule, IST), /Only when somebody runs it/);
});

// --- period keys -----------------------------------------------------------

test('a period key never contains a timestamp', () => {
  // A key that changes every second deduplicates nothing.
  const at = new Date('2026-09-14T04:00:00Z');
  const daily: Schedule = { kind: 'daily', at: { hour: 9, minute: 30 }, weekdaysOnly: false };
  const monthly: Schedule = {
    kind: 'monthly-before-end',
    daysBeforeEnd: 2,
    at: { hour: 10, minute: 0 },
  };

  assert.equal(periodKeyFor(daily, at, IST), '2026-09-14');
  assert.equal(periodKeyFor(monthly, at, IST), '2026-09');
});

test('two firings inside one window produce the same key', () => {
  // This is what stops a restarted scheduler calling everybody twice.
  const monthly: Schedule = {
    kind: 'monthly-before-end',
    daysBeforeEnd: 2,
    at: { hour: 10, minute: 0 },
  };
  const first = periodKeyFor(monthly, new Date('2026-09-28T04:30:00Z'), IST);
  const second = periodKeyFor(monthly, new Date('2026-09-28T04:35:00Z'), IST);
  assert.equal(first, second);
});

test('the next window produces a different key', () => {
  const monthly: Schedule = {
    kind: 'monthly-before-end',
    daysBeforeEnd: 2,
    at: { hour: 10, minute: 0 },
  };
  assert.notEqual(
    periodKeyFor(monthly, new Date('2026-09-28T04:30:00Z'), IST),
    periodKeyFor(monthly, new Date('2026-10-29T04:30:00Z'), IST),
  );
});

test('a period key is computed in the declared zone', () => {
  // 20:00 UTC on the 14th is already the 15th in India. A key computed in the
  // host zone would split one local day across two windows.
  const daily: Schedule = { kind: 'daily', at: { hour: 9, minute: 0 }, weekdaysOnly: false };
  assert.equal(periodKeyFor(daily, new Date('2026-09-14T20:00:00Z'), IST), '2026-09-15');
});

// --- previewing and cancelling ---------------------------------------------

test('an operator can preview the next few runs before arming anything', () => {
  const schedule: Schedule = {
    kind: 'monthly-before-end',
    daysBeforeEnd: 2,
    at: { hour: 10, minute: 0 },
  };
  const runs = nextRuns(schedule, IST, 3, new Date('2026-09-01T00:00:00Z'));
  assert.equal(runs.length, 3);
  assert.deepEqual(runs.map((r) => wall(r)), [
    '28/09/2026, 10:00',
    '29/10/2026, 10:00',
    '28/11/2026, 10:00',
  ]);
});

test('every schedule describes itself in a sentence a person can check', () => {
  const cases: [Schedule, RegExp][] = [
    [{ kind: 'daily', at: { hour: 9, minute: 30 }, weekdaysOnly: true }, /except Sunday.*09:30/],
    [{ kind: 'weekly', weekday: 6, at: { hour: 11, minute: 0 } }, /Saturday.*11:00/],
    [{ kind: 'monthly-on', dayOfMonth: 3, at: { hour: 10, minute: 0 } }, /3rd of each month/],
    [
      { kind: 'monthly-before-end', daysBeforeEnd: 2, at: { hour: 10, minute: 0 } },
      /2 days before each month ends/,
    ],
  ];
  for (const [schedule, pattern] of cases) {
    assert.match(describe(schedule, IST), pattern);
    assert.match(describe(schedule, IST), /Asia\/Kolkata/);
  }
});

// --- due -------------------------------------------------------------------

test('a schedule is due within the tick tolerance and not long after', () => {
  const schedule: Schedule = {
    kind: 'daily',
    at: { hour: 9, minute: 30 },
    weekdaysOnly: false,
  };
  // 09:32 IST, two minutes after the mark.
  assert.equal(isDue(schedule, IST, new Date('2026-09-14T04:02:00Z')), true);
  // 08:00 IST, before it.
  assert.equal(isDue(schedule, IST, new Date('2026-09-14T02:30:00Z')), false);
  // 11:00 IST, well past the tolerance.
  assert.equal(isDue(schedule, IST, new Date('2026-09-14T05:30:00Z')), false);
});
