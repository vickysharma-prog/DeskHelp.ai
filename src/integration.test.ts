import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Ledger } from './core/ledger.ts';
import { FixtureTransport } from './core/calle.ts';
import { runAction } from './core/runner.ts';
import { importContacts } from './core/import.ts';
import { isDue, nextRun, periodKeyFor } from './core/schedule.ts';
import { actionById } from './packs/education/actions.ts';
import type { Schedule } from './core/schedule.ts';
import type { CalleCallResponse } from './core/calle.ts';
import type { FactSheet, Institute } from './core/types.ts';

/**
 * The whole system, connected, over a life that spans several calls.
 *
 * The unit tests check each decision in isolation. These check the seams,
 * which is where the loopholes were: a judgement that nothing persisted, a
 * captured question with nowhere to go, a suppression that a re-import could
 * undo. Every one of those looked fine in its own file.
 */

const PARENT = '+15550100001';
const OTHER = '+15550100002';

const institute: Institute = {
  id: 'northline',
  displayName: 'Northline Coaching',
  callbackNumber: '+15550100999',
  timezone: 'Asia/Kolkata',
  jurisdiction: 'IN',
  allowedDestinations: [],
};

const factSheet: FactSheet = {
  instituteId: 'northline',
  version: 4,
  approvedBy: 'A. Principal',
  approvedAt: '2026-09-01T00:00:00Z',
  entries: [
    { id: 'fs-due', topic: 'fee-due-date', wording: { en: 'The instalment is due on the 15th.' } },
    { id: 'fs-pay', topic: 'payment-channels', wording: { en: 'Pay at the counter or on the portal.' } },
    { id: 'fs-hrs', topic: 'office-hours', wording: { en: 'The office is open 9 am to 5 pm.' } },
  ],
};

const CSV = [
  'id,name,phone,register,consent,do_not_call',
  `c-1,Fictional Parent A,${PARENT},hi-en,yes,no`,
  `c-2,Fictional Parent B,${OTHER},hi-en,yes,no`,
].join('\n');

const turn = (speaker: string, text: string, offset_seconds: number) => ({
  speaker,
  text,
  offset_seconds,
});

const noSleep = async () => {};
// 10:00 IST on the day "two days before month end" fires, in each month.
const SEPTEMBER = new Date('2026-09-28T04:30:00Z');
const OCTOBER = new Date('2026-10-29T04:30:00Z');

/** A completed call whose parent asks something nobody approved. */
const asksAboutScholarship: CalleCallResponse = {
  status: 'completed',
  recipients: [
    {
      status: 'completed',
      transcript_turns: [
        turn('bot', 'Hello, this is an automated reminder from Northline Coaching.', 0),
        turn('user', 'Kya scholarship mil sakti hai?', 5),
        turn('user', 'Theek hai, main portal pe 14 tak kar dunga.', 12),
      ],
      structured_result: {
        identity_confirmed: 'yes',
        opt_out_requested: 'no',
        unanswered_questions: [{ quote: 'Kya scholarship mil sakti hai?' }],
        aware_of_due_date: 'yes',
        intends_to_pay_by_date: 'yes',
        preferred_channel: 'portal',
        evidence_quotes: { intends_to_pay_by_date: 'main portal pe 14 tak kar dunga' },
      },
    },
  ],
};

const optsOut: CalleCallResponse = {
  status: 'completed',
  recipients: [
    {
      status: 'completed',
      transcript_turns: [
        turn('bot', 'Hello, this is an automated reminder from Northline Coaching.', 0),
        turn('user', 'Mujhe dobara call mat kijiye.', 4),
      ],
      structured_result: {
        identity_confirmed: 'yes',
        opt_out_requested: 'yes',
        unanswered_questions: [],
        evidence_quotes: {},
      },
    },
  ],
};

/** Runs one period and returns the result plus the transport used. */
async function runPeriod(args: {
  ledger: Ledger;
  contacts: Parameters<typeof runAction>[0]['contacts'];
  periodKey: string;
  now: Date;
  script?: (keys: string[]) => Record<string, CalleCallResponse>;
}) {
  const action = actionById('fee-reminder')!;
  const base = {
    action,
    institute,
    factSheet,
    contacts: args.contacts,
    periodKey: args.periodKey,
    env: {},
    now: args.now,
    sleep: noSleep,
  };

  // The fixture keys come from the idempotency keys, so a probe run against a
  // throwaway ledger collects them before the real run is scripted.
  const probe = new FixtureTransport();
  await runAction({ ...base, ledger: new Ledger(), transport: probe });
  const keys = probe.sent.map((sent) => `sim_${sent.idempotencyKey}`);

  const transport = new FixtureTransport(
    args.script ? { responses: args.script(keys) } : {},
  );
  const result = await runAction({ ...base, ledger: args.ledger, transport });
  return { result, transport };
}

// ---------------------------------------------------------------------------

test('import → schedule → run → persist → next call carries the answer', async () => {
  const imported = importContacts(CSV);
  assert.equal(imported.contacts.length, 2);
  assert.deepEqual(imported.rejected, []);

  const schedule: Schedule = {
    kind: 'monthly-before-end',
    daysBeforeEnd: 2,
    at: { hour: 10, minute: 0 },
  };

  // The schedule decides both when to run and which window it belongs to.
  assert.equal(isDue(schedule, institute.timezone, SEPTEMBER), true);
  const septemberKey = periodKeyFor(schedule, SEPTEMBER, institute.timezone);
  assert.equal(septemberKey, '2026-09');

  const ledger = new Ledger();

  // --- September ----------------------------------------------------------
  const september = await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: septemberKey,
    now: SEPTEMBER,
    script: (keys) => ({ [keys[0]!]: asksAboutScholarship }),
  });

  const first = september.result.outcomes[0]!;
  assert.equal(first.judgement?.disposition, 'needs-human');
  assert.equal(first.judgement?.claims.length, 1, 'the payment intention is a claim');

  // The judgement survived the run. This is the seam that was broken: nothing
  // used to persist it, so the memory feature was unreachable.
  const stored = ledger.priorCallsFor('northline', 'c-1');
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.answers.intends_to_pay_by_date, 'yes');
  assert.equal(stored[0]!.claims[0]!.quote, 'main portal pe 14 tak kar dunga');

  // --- the office answers the question ------------------------------------
  const queue = ledger.openQuestions('northline');
  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.quote, 'Kya scholarship mil sakti hai?');
  assert.equal(queue[0]!.contactId, 'c-1');

  ledger.resolveQuestion(
    queue[0]!.id,
    'Scholarship forms are at the office until the 20th.',
    'Office admin',
  );
  assert.deepEqual(ledger.openQuestions('northline'), [], 'the queue should empty');

  // --- October ------------------------------------------------------------
  const octoberKey = periodKeyFor(schedule, OCTOBER, institute.timezone);
  assert.notEqual(octoberKey, septemberKey, 'a new month is a new window');

  const october = await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: octoberKey,
    now: OCTOBER,
  });

  const octoberFirst = october.result.outcomes[0]!;
  const taskText = octoberFirst.taskText!;

  // The loop closes: the agent can now deliver the answer it could not give.
  assert.ok(taskText.includes('Kya scholarship mil sakti hai?'));
  assert.ok(taskText.includes('at the office until the 20th'));
  assert.ok(taskText.includes('exactly this and nothing more'));

  // And it remembers the claim without asserting it happened.
  assert.ok(taskText.includes('main portal pe 14 tak kar dunga'));
  assert.ok(taskText.includes('not something that happened'));

  // Ordering is still the safety property, across the seam.
  assert.ok(
    taskText.indexOf('WHAT YOU ALREADY KNOW') > taskText.indexOf('IDENTITY GATE'),
  );

  ledger.close();
});

test('one family\'s history never reaches another family\'s call', async () => {
  const ledger = new Ledger();
  const imported = importContacts(CSV);

  await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: '2026-09',
    now: SEPTEMBER,
    script: (keys) => ({ [keys[0]!]: asksAboutScholarship }),
  });

  const queue = ledger.openQuestions('northline');
  ledger.resolveQuestion(queue[0]!.id, 'Forms are at the office.', 'Office admin');

  const october = await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: '2026-10',
    now: OCTOBER,
  });

  const other = october.result.outcomes.find((o) => o.contactId === 'c-2')!;
  assert.ok(
    !other.taskText!.includes('Kya scholarship'),
    "c-2's call must not carry c-1's question",
  );
  assert.ok(!other.taskText!.includes('WHAT YOU ALREADY KNOW'));
  ledger.close();
});

test('running the same period twice calls nobody a second time', async () => {
  const ledger = new Ledger();
  const imported = importContacts(CSV);

  const first = await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: '2026-09',
    now: SEPTEMBER,
  });
  assert.equal(first.transport.sent.length, 2, 'both contacts called once');

  const second = await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: '2026-09',
    now: SEPTEMBER,
  });
  assert.equal(second.transport.sent.length, 0, 'a re-run must dial nobody');
  assert.ok(second.result.outcomes.every((o) => o.status === 'skipped'));
  ledger.close();
});

test('an opt-out on one workflow silences every workflow, permanently', async () => {
  const ledger = new Ledger();
  const imported = importContacts(CSV);

  await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: '2026-09',
    now: SEPTEMBER,
    script: (keys) => ({ [keys[0]!]: optsOut }),
  });

  assert.equal(ledger.isSuppressed('northline', 'c-1'), true);

  // A different action, a different month, and a freshly re-imported contact
  // record that still says consent: yes.
  const attendance = actionById('attendance-absence')!;
  const reimported = importContacts(CSV);
  const transport = new FixtureTransport();

  const later = await runAction({
    action: attendance,
    institute,
    factSheet: {
      ...factSheet,
      entries: [
        { id: 'fs-att', topic: 'attendance-policy', wording: { en: 'Attendance is taken daily.' } },
        ...factSheet.entries,
      ],
    },
    contacts: reimported.contacts,
    periodKey: '2026-10-29',
    ledger,
    transport,
    env: {},
    now: OCTOBER,
    sleep: noSleep,
  });

  const silenced = later.outcomes.find((o) => o.contactId === 'c-1')!;
  assert.equal(silenced.status, 'refused');
  assert.equal(silenced.refusalReason, 'contact-suppressed');

  // The other family is unaffected.
  assert.notEqual(later.outcomes.find((o) => o.contactId === 'c-2')!.status, 'refused');
  ledger.close();
});

test('nothing reaches the network without both gates, end to end', async () => {
  const ledger = new Ledger();
  const imported = importContacts(CSV);

  const { result } = await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: '2026-09',
    now: SEPTEMBER,
  });

  assert.equal(result.live, false);
  for (const outcome of result.outcomes) {
    assert.notEqual(outcome.status, 'placed', 'nothing may be placed in a dry run');
    assert.match(
      outcome.warnings.join(' '),
      /would be refused in live mode/,
      'the operator must see which rows the allow list would block',
    );
  }
  ledger.close();
});

test('a run outside the calling window dials nobody', async () => {
  const ledger = new Ledger();
  const imported = importContacts(CSV);
  const schedule: Schedule = {
    kind: 'daily',
    at: { hour: 22, minute: 0 },
    weekdaysOnly: false,
  };

  // 22:00 IST is past the TRAI window, so the schedule can fire and every
  // call still refuses. The guard is the authority, not the scheduler.
  const at = nextRun(schedule, institute.timezone, SEPTEMBER)!;
  const { result, transport } = await runPeriod({
    ledger,
    contacts: imported.contacts,
    periodKey: periodKeyFor(schedule, at, institute.timezone),
    now: at,
  });

  assert.equal(transport.sent.length, 0);
  assert.ok(
    result.outcomes.every((o) => o.refusalReason === 'outside-calling-window'),
  );
  ledger.close();
});

test('a preview writes nothing, so looking at a run never consumes it', async () => {
  // Otherwise pressing a button labelled "Dry run" quietly cancels the
  // month's reminders: the ledger holds the period, and the real run an hour
  // later skips every contact as already handled.
  const ledger = new Ledger();
  const imported = importContacts(CSV);
  const action = actionById('fee-reminder')!;

  const base = {
    action,
    institute,
    factSheet,
    contacts: imported.contacts,
    periodKey: '2026-09',
    ledger,
    env: {},
    now: SEPTEMBER,
    sleep: noSleep,
  };

  const looked = new FixtureTransport();
  await runAction({ ...base, transport: looked, preview: true });
  await runAction({ ...base, transport: looked, preview: true });

  assert.deepEqual(
    ledger.forPeriod('northline', 'fee-reminder', '2026-09'),
    [],
    'a preview must leave the ledger untouched',
  );

  // This assertion is the one that was missing, and its absence hid a real
  // bug: the preview reached the transport for every allowed contact and the
  // fixture accepted the calls without complaint. With an HTTP transport in
  // its place, reading a plan dialled a phone.
  assert.equal(
    looked.sent.length,
    0,
    'a preview must not hand a body to the transport at all',
  );

  // The real run still reaches everybody.
  const real = new FixtureTransport();
  const result = await runAction({ ...base, transport: real });
  assert.equal(real.sent.length, 2);
  assert.ok(result.outcomes.every((outcome) => outcome.status !== 'skipped'));
  ledger.close();
});

test('a preview cannot dial, whatever transport it is handed', async () => {
  // The rule is not "previews are given a safe transport". It is "a preview
  // never reaches one". A caller who passes the live transport by mistake, or
  // a future surface that only has the live one to hand, must still be unable
  // to ring a phone by looking at a plan. This transport makes contact loud:
  // if the preview touches it, the test fails instead of quietly succeeding.
  const ledger = new Ledger();
  const imported = importContacts(CSV);

  const explodes = {
    async createCall(): Promise<{ call_id: string }> {
      throw new Error('a preview reached the transport');
    },
    async getCall(): Promise<CalleCallResponse> {
      throw new Error('a preview polled for a result');
    },
  };

  const result = await runAction({
    action: actionById('fee-reminder')!,
    institute,
    factSheet,
    contacts: imported.contacts,
    periodKey: '2026-09',
    ledger,
    transport: explodes,
    env: {},
    now: SEPTEMBER,
    sleep: noSleep,
    preview: true,
  });

  // And it still answers the question the operator opened it to ask.
  assert.equal(result.outcomes.length, 2);
  for (const outcome of result.outcomes) {
    assert.ok(
      outcome.taskText && outcome.taskText.length > 0,
      'a preview exists to show the words, so it must still render them',
    );
  }
  ledger.close();
});

test('a webhook delivered twice does not duplicate the review queue', () => {
  // CALL-E webhooks are at-least-once. A second delivery must not make a
  // person work through the same question again.
  const ledger = new Ledger();
  const payload = {
    idempotencyKey: 'dl_key',
    instituteId: 'northline',
    contactId: 'c-1',
    actionId: 'fee-reminder',
    callId: 'call_1',
    placedAt: SEPTEMBER,
    disposition: 'needs-human' as const,
    answers: {},
    claims: [],
    unansweredQuestions: [
      { contactId: 'c-1', callId: 'call_1', quote: 'Kya scholarship?', offsetSeconds: 5, reason: 'outside-fact-sheet' as const },
    ],
  };

  ledger.recordOutcome(payload);
  ledger.recordOutcome(payload);

  assert.equal(ledger.openQuestions('northline').length, 1);
  assert.equal(ledger.priorCallsFor('northline', 'c-1').length, 1);
  ledger.close();
});

test('an empty answer is refused rather than delivered as one', () => {
  const ledger = new Ledger();
  ledger.recordOutcome({
    idempotencyKey: 'dl_key',
    instituteId: 'northline',
    contactId: 'c-1',
    actionId: 'fee-reminder',
    callId: 'call_1',
    placedAt: SEPTEMBER,
    disposition: 'needs-human',
    answers: {},
    claims: [],
    unansweredQuestions: [
      { contactId: 'c-1', callId: 'call_1', quote: 'Kya?', offsetSeconds: 5, reason: 'outside-fact-sheet' },
    ],
  });

  const queue = ledger.openQuestions('northline');
  assert.throws(() => ledger.resolveQuestion(queue[0]!.id, '   ', 'Office'), /not an answer/);
  assert.equal(ledger.openQuestions('northline').length, 1, 'it stays open');
  ledger.close();
});
