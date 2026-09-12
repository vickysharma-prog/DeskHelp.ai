import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPriorContext, priorCallsForContact } from './history.ts';
import type { ActionDefinition, PriorCall } from './types.ts';

const action: ActionDefinition = {
  id: 'fee-reminder',
  title: 'Fee reminder',
  purpose: 'Remind a guardian that a term fee is due.',
  audience: 'guardian',
  sensitivity: 'financial',
  disclosure: 'Automated call about a fee due date.',
  questions: [],
  factSheetTopics: [],
  minHoursBetweenContacts: 72,
  cascade: false,
  retry: { maxAttempts: 2, minHoursBetweenAttempts: 4 },
};

const priorCall = (over: Partial<PriorCall> = {}): PriorCall => ({
  callId: 'call-1',
  contactId: 'c-1',
  actionId: 'fee-reminder',
  placedAt: '2026-09-05T10:00:00Z',
  disposition: 'answered',
  answers: { will_pay: 'yes' },
  claims: [
    {
      questionId: 'will_pay',
      statedValue: 'yes',
      quote: 'main portal pe kal kar dunga',
      offsetSeconds: 6,
      confirmed: false,
    },
  ],
  resolvedQuestions: [],
  ...over,
});

const build = (priorCalls: readonly PriorCall[], depth?: number) =>
  buildPriorContext({ action, priorCalls, ...(depth ? { depth } : {}) });

test('no history produces no block at all', () => {
  const context = build([]);
  assert.equal(context.block, '');
  assert.equal(context.callsReferenced, 0);
});

test('the block refuses to be spoken before identity is confirmed', () => {
  const { block } = build([priorCall()]);
  assert.ok(block.includes('Do not mention ANY of this until the identity gate'));
  assert.ok(block.includes('If somebody else answered'));
});

test('a claim is carried as something said, never as something done', () => {
  const { block } = build([priorCall()]);
  assert.ok(block.includes('They SAID they would'));
  assert.ok(block.includes('main portal pe kal kar dunga'));
  assert.ok(block.includes('not something that happened'));
  assert.ok(block.includes('You must NOT state that it was'));
  assert.ok(
    block.includes('must not tell them they failed'),
    'the agent must not accuse somebody of breaking a promise',
  );
});

test('a resolved question is delivered on the next call', () => {
  // The loop this whole design exists to close: captured on call one,
  // answered by a person, spoken on call two.
  const { block, resolvedQuestionsDelivered } = build([
    priorCall({
      resolvedQuestions: [
        {
          originalQuote: 'Kya scholarship mil sakti hai?',
          answer: 'Scholarship forms are available at the office until the 20th.',
          resolvedBy: 'Office admin',
          resolvedAt: '2026-09-06T09:00:00Z',
        },
      ],
    }),
  ]);

  assert.equal(resolvedQuestionsDelivered, 1);
  assert.ok(block.includes('Kya scholarship mil sakti hai?'));
  assert.ok(block.includes('available at the office until the 20th'));
  assert.ok(
    block.includes('exactly this and nothing more'),
    'the approved answer must be spoken verbatim, not paraphrased',
  );
});

test('the world is closed: nothing beyond the listed context may be recalled', () => {
  const { block } = build([priorCall()]);
  assert.ok(block.includes('Do not refer to anything from earlier calls other than'));
  assert.ok(block.includes('treat it as a new'));
});

test('calls nobody answered are not recalled', () => {
  // "Last time you did not pick up" is not a useful thing to open with.
  const context = build([
    priorCall({ disposition: 'unreached' }),
    priorCall({ callId: 'call-2', disposition: 'declined' }),
  ]);
  assert.equal(context.block, '');
  assert.equal(context.callsReferenced, 0);
});

test('history is bounded, most recent first', () => {
  const calls = [
    priorCall({ callId: 'old', placedAt: '2026-01-01T10:00:00Z' }),
    priorCall({ callId: 'mid', placedAt: '2026-06-01T10:00:00Z' }),
    priorCall({ callId: 'new', placedAt: '2026-09-01T10:00:00Z' }),
  ];
  const context = build(calls, 2);
  assert.equal(context.callsReferenced, 2);

  const septemberAt = context.block.indexOf('1 September 2026');
  const juneAt = context.block.indexOf('1 June 2026');
  assert.ok(septemberAt > -1 && juneAt > -1);
  assert.ok(septemberAt < juneAt, 'most recent call should come first');
  assert.ok(!context.block.includes('1 January 2026'), 'depth was not enforced');
});

test('unknown answers are not recalled as if they were answers', () => {
  const { block } = build([
    priorCall({ answers: { will_pay: 'unknown' }, claims: [] }),
  ]);
  assert.ok(!block.includes('will_pay: unknown'));
});

test("one contact's history never includes another's", () => {
  const all = [
    priorCall({ callId: 'mine' }),
    priorCall({ callId: 'theirs', contactId: 'c-2' }),
  ];
  const mine = priorCallsForContact(all, 'c-1');
  assert.equal(mine.length, 1);
  assert.equal(mine[0]!.callId, 'mine');
});
