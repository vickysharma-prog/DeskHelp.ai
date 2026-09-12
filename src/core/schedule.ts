/**
 * When a workflow runs.
 *
 * CALL-E deliberately does not do recurrence — "Host scheduler handles
 * recurrence. Phone-call provider handles exactly one call per scheduled run."
 * That gap is DeskHelp's, and it is the thing an institute actually wanted:
 * "remind the unpaid families two days before the month ends" is a sentence
 * about a calendar, not about a phone.
 *
 * Three rules, from the CALL-E repository's safety requirements:
 *
 *   **No hidden schedules.** Every schedule is declared here, listed by the
 *   UI, and previewable. `describe()` renders one in a sentence a person can
 *   check, and `nextRuns()` shows the actual dates before anything is armed.
 *
 *   **No duplicate jobs.** Each run derives a `periodKey`, and the ledger
 *   refuses a second reservation for the same key. A scheduler that fires
 *   twice, a server restarted mid-run, an operator pressing Run again — all
 *   land on the same key and only one call goes out.
 *
 *   **Clear cancellation.** A schedule is `enabled: false` and it stops. There
 *   is no queue of armed jobs to drain, because nothing is armed: the next run
 *   is computed from the clock each time it is asked for.
 *
 * All arithmetic happens in the institute's **declared** IANA timezone. None
 * of it is inferred from a phone number, a locale or the host clock.
 */

/** Hour and minute in the institute's local time. */
export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

export type Schedule =
  /** Every day, or every Monday-to-Saturday, at a local time. */
  | { readonly kind: 'daily'; readonly at: TimeOfDay; readonly weekdaysOnly: boolean }
  /** One weekday each week. 0 is Sunday. */
  | { readonly kind: 'weekly'; readonly weekday: number; readonly at: TimeOfDay }
  /** A fixed date each month. Clamped in short months. */
  | { readonly kind: 'monthly-on'; readonly dayOfMonth: number; readonly at: TimeOfDay }
  /**
   * A number of days before the month ends. "Two days before month end" is
   * the 28th in September and the 26th in February, which is what an
   * institute means and what a fixed day-of-month gets wrong.
   */
  | { readonly kind: 'monthly-before-end'; readonly daysBeforeEnd: number; readonly at: TimeOfDay }
  /** Never runs on its own. Somebody presses the button. */
  | { readonly kind: 'manual' };

export interface ScheduledAction {
  readonly actionId: string;
  readonly schedule: Schedule;
  /** Turning this off is the whole of cancellation. */
  readonly enabled: boolean;
}

// --- timezone arithmetic ---------------------------------------------------

/** The offset, in minutes, that `tz` was at the given instant. */
function offsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour') % 24,
    read('minute'),
    read('second'),
  );

  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * Turns a local wall-clock time in `tz` into the instant it refers to.
 *
 * Applied twice because the offset itself depends on the instant: near a
 * daylight-saving boundary the first guess can land on the wrong side. India
 * has no DST, but an institute in another jurisdiction will, and a scheduler
 * that is wrong twice a year is worse than one that is obviously wrong.
 */
export function zonedToInstant(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  tz: string,
): Date {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const first = offsetMinutes(new Date(naive), tz);
  const candidate = new Date(naive - first * 60_000);
  const second = offsetMinutes(candidate, tz);
  return second === first ? candidate : new Date(naive - second * 60_000);
}

/** The local calendar date in `tz` at a given instant. */
export function localParts(
  instant: Date,
  tz: string,
): { year: number; month: number; day: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(instant);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    weekday: Math.max(0, weekdays.indexOf(read('weekday'))),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// --- next run --------------------------------------------------------------

/**
 * The next instant this schedule fires, strictly after `after`.
 *
 * Computed on demand rather than armed in advance, so disabling a schedule
 * cancels it completely and there is no queue of pending jobs to forget about.
 */
export function nextRun(
  schedule: Schedule,
  tz: string,
  after: Date = new Date(),
): Date | undefined {
  if (schedule.kind === 'manual') return undefined;

  const { at } = schedule;
  const start = localParts(after, tz);

  // Walk forward a day at a time. Slow in principle, irrelevant in practice:
  // the worst case is about 62 iterations, and the alternative is calendar
  // arithmetic that gets month lengths and weekday wrapping subtly wrong.
  for (let step = 0; step <= 400; step += 1) {
    const probe = new Date(
      Date.UTC(start.year, start.month - 1, start.day + step, 12, 0, 0),
    );
    const day = localParts(probe, tz);

    if (!firesOn(schedule, day)) continue;

    const instant = zonedToInstant(
      { year: day.year, month: day.month, day: day.day, hour: at.hour, minute: at.minute },
      tz,
    );
    if (instant.getTime() > after.getTime()) return instant;
  }

  return undefined;
}

function firesOn(
  schedule: Exclude<Schedule, { kind: 'manual' }>,
  day: { year: number; month: number; day: number; weekday: number },
): boolean {
  switch (schedule.kind) {
    case 'daily':
      // Saturday is a working day at most Indian institutes; Sunday is not.
      return schedule.weekdaysOnly ? day.weekday !== 0 : true;
    case 'weekly':
      return day.weekday === schedule.weekday;
    case 'monthly-on': {
      const last = daysInMonth(day.year, day.month);
      return day.day === Math.min(schedule.dayOfMonth, last);
    }
    case 'monthly-before-end': {
      const last = daysInMonth(day.year, day.month);
      return day.day === Math.max(1, last - schedule.daysBeforeEnd);
    }
  }
}

/** The next few runs, for a preview an operator can check before arming it. */
export function nextRuns(
  schedule: Schedule,
  tz: string,
  count = 3,
  after: Date = new Date(),
): Date[] {
  const runs: Date[] = [];
  let cursor = after;
  for (let i = 0; i < count; i += 1) {
    const next = nextRun(schedule, tz, cursor);
    if (!next) break;
    runs.push(next);
    cursor = next;
  }
  return runs;
}

// --- period keys -----------------------------------------------------------

/**
 * The window a run belongs to.
 *
 * This is what stops a duplicate call. Two firings of the same schedule inside
 * the same window produce the same key, the ledger refuses the second
 * reservation, and nobody is called twice. So it must never contain a
 * timestamp: a key that changes every second deduplicates nothing.
 */
export function periodKeyFor(schedule: Schedule, instant: Date, tz: string): string {
  const day = localParts(instant, tz);
  const pad = (n: number) => String(n).padStart(2, '0');

  switch (schedule.kind) {
    case 'daily':
      return `${day.year}-${pad(day.month)}-${pad(day.day)}`;
    case 'weekly':
      return `${day.year}-W${pad(isoWeek(day.year, day.month, day.day))}`;
    case 'monthly-on':
    case 'monthly-before-end':
      return `${day.year}-${pad(day.month)}`;
    case 'manual':
      // A manual run is its own window: pressing the button twice on the same
      // day is usually a mistake, and the ledger will catch it.
      return `manual-${day.year}-${pad(day.month)}-${pad(day.day)}`;
  }
}

function isoWeek(year: number, month: number, day: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604_800_000);
}

// --- description -----------------------------------------------------------

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** One sentence a person can check. Shown next to every schedule in the UI. */
export function describe(schedule: Schedule, tz: string): string {
  if (schedule.kind === 'manual') {
    return 'Only when somebody runs it. Never on its own.';
  }

  const time = `${String(schedule.at.hour).padStart(2, '0')}:${String(
    schedule.at.minute,
  ).padStart(2, '0')}`;

  switch (schedule.kind) {
    case 'daily':
      return schedule.weekdaysOnly
        ? `Every day except Sunday, at ${time} ${tz}.`
        : `Every day, at ${time} ${tz}.`;
    case 'weekly':
      return `Every ${WEEKDAY_NAMES[schedule.weekday] ?? 'week'}, at ${time} ${tz}.`;
    case 'monthly-on':
      return `On the ${schedule.dayOfMonth}${ordinal(schedule.dayOfMonth)} of each month, at ${time} ${tz}.`;
    case 'monthly-before-end':
      return (
        `${schedule.daysBeforeEnd} day${schedule.daysBeforeEnd === 1 ? '' : 's'} ` +
        `before each month ends, at ${time} ${tz}.`
      );
  }
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

// --- due check -------------------------------------------------------------

/**
 * Whether a schedule is due to run now.
 *
 * `toleranceMinutes` exists because a scheduler tick is never exactly on the
 * minute. It is deliberately small: a wide tolerance combined with a restart
 * loop is how a morning reminder becomes four morning reminders. The ledger
 * would catch those anyway, but a guard that relies on the next guard is not
 * a guard.
 */
export function isDue(
  schedule: Schedule,
  tz: string,
  now: Date,
  toleranceMinutes = 5,
): boolean {
  if (schedule.kind === 'manual') return false;

  const lookBack = new Date(now.getTime() - toleranceMinutes * 60_000);
  const next = nextRun(schedule, tz, lookBack);
  if (!next) return false;

  return next.getTime() <= now.getTime();
}
