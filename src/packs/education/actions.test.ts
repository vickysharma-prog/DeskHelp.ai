import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EDUCATION_PACK, actionById } from './actions.ts';
import { renderCall, buildResultSchema } from '../../core/render.ts';
import type { Contact, FactSheet, Institute } from '../../core/types.ts';

/**
 * These are invariants over the whole pack rather than tests of one workflow.
 * A fifteenth action added to `actions.ts` is checked by all of them without
 * anybody remembering to write a test for it, which is the point: the failure
 * mode of a config-driven design is a config nobody reviewed.
 */

const FICTIONAL = '+15550100001';

const institute: Institute = {
  id: 'inst-1',
  displayName: 'Northline Coaching',
  callbackNumber: '+15550100999',
  timezone: 'Asia/Kolkata',
  jurisdiction: 'IN',
  allowedDestinations: [FICTIONAL],
};

const contact: Contact = {
  id: 'c-1',
  fullName: 'Fictional Guardian',
  phone: FICTIONAL,
  preferredRegister: 'hi-en',
  consent: true,
  doNotCall: false,
};

/** Covers every topic any action in the pack declares. */
const factSheet: FactSheet = {
  instituteId: 'inst-1',
  version: 1,
  approvedBy: 'A. Principal',
  approvedAt: '2026-09-01T00:00:00Z',
  entries: [
    ...new Set(EDUCATION_PACK.flatMap((action) => action.factSheetTopics)),
  ].map((topic) => ({
    id: `fs-${topic}`,
    topic,
    wording: { en: `Approved wording for ${topic}.` },
  })),
};

test('the pack is not empty and every id is unique', () => {
  assert.ok(EDUCATION_PACK.length >= 14, 'expected the full education pack');
  const ids = EDUCATION_PACK.map((action) => action.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate action id');
});

test('lookup by id finds every action and nothing else', () => {
  for (const action of EDUCATION_PACK) {
    assert.equal(actionById(action.id)?.id, action.id);
  }
  assert.equal(actionById('no-such-action'), undefined);
});

test('every action discloses that the caller is automated', () => {
  // A recipient must know within the first sentence that they are talking to
  // a machine. This is not a nicety: an undisclosed automated call is the
  // thing that makes people hang up and report it as a scam.
  for (const action of EDUCATION_PACK) {
    assert.match(
      action.disclosure.toLowerCase(),
      /automated/,
      `${action.id} does not disclose automation`,
    );
    assert.ok(
      action.disclosure.length > 40,
      `${action.id} has a disclosure too short to be a real one`,
    );
  }
});

test('no action smuggles "unknown" into its own answers', () => {
  // The engine appends it. An action that also lists it would produce a
  // duplicate enum value and imply it is one outcome among several rather
  // than the absence of one.
  for (const action of EDUCATION_PACK) {
    for (const question of action.questions) {
      assert.ok(
        !question.answers.includes('unknown'),
        `${action.id}/${question.id} lists "unknown" itself`,
      );
      assert.ok(
        question.answers.length >= 2,
        `${action.id}/${question.id} needs at least two answers to be a question`,
      );
    }
  }
});

test('every claim answer is an answer the question actually allows', () => {
  for (const action of EDUCATION_PACK) {
    for (const question of action.questions) {
      for (const claim of question.claimAnswers ?? []) {
        assert.ok(
          question.answers.includes(claim),
          `${action.id}/${question.id} marks "${claim}" as a claim but does not allow it`,
        );
      }
    }
  }
});

test('no action allows more than two attempts', () => {
  // Two per day, four hours apart, is the conservative end of common practice
  // and the ceiling the maintainers' own retry-policy.js uses. An action that
  // wanted more would need a reason nobody has yet had.
  for (const action of EDUCATION_PACK) {
    assert.ok(
      action.retry.maxAttempts <= 2,
      `${action.id} allows ${action.retry.maxAttempts} attempts`,
    );
    assert.ok(action.retry.minHoursBetweenAttempts >= 1, `${action.id} retries too fast`);
  }
});

test('anything concerning a child is marked minor-involved', () => {
  // The sensitivity flag is what makes the engine gate the student's name
  // behind guardian confirmation. Getting it wrong on an attendance call
  // means a stranger who picks up hears a child's name and class.
  for (const id of ['attendance-absence', 'dropout-risk']) {
    assert.equal(
      actionById(id)?.sensitivity,
      'minor-involved',
      `${id} must be marked minor-involved`,
    );
  }
});

test('fee actions are financial, and say on the call that no payment is taken', () => {
  for (const id of ['fee-reminder', 'fee-followup']) {
    const action = actionById(id)!;
    assert.equal(action.sensitivity, 'financial', `${id} must be financial`);
  }
  assert.match(actionById('fee-reminder')!.disclosure, /no payment is taken/i);
});

test('a stated intention to pay is a claim, never a plain answer', () => {
  // The single most important claim in the pack. "Kal kar dunga" is a
  // sentence, not a payment.
  const question = actionById('fee-reminder')!.questions.find(
    (q) => q.id === 'intends_to_pay_by_date',
  );
  assert.ok(question, 'fee-reminder must ask about intention to pay');
  assert.deepEqual(question!.claimAnswers, ['yes']);
  assert.equal(question!.requiresEvidence, true);
});

test('the cascade action is the only one, and asks exactly one accept question', () => {
  const cascades = EDUCATION_PACK.filter((action) => action.cascade);
  assert.equal(cascades.length, 1, 'only substitute cover should cascade');
  assert.equal(cascades[0]!.id, 'substitute-cascade');
  assert.equal(
    cascades[0]!.questions.length,
    1,
    'a cascade must turn on a single yes, or two people can both be told they have it',
  );
});

test('the announcement action asks nothing', () => {
  // An announcement that also interrogates people is two workflows wearing
  // one coat, and the second one is never disclosed.
  assert.deepEqual(actionById('announcement')!.questions, []);
});

test('every action renders a task text carrying the full boundary', () => {
  for (const action of EDUCATION_PACK) {
    const rendered = renderCall({ action, contact, institute, factSheet });

    assert.ok(rendered.taskText.includes(action.disclosure), `${action.id}: no disclosure`);
    assert.ok(rendered.taskText.includes('IDENTITY GATE'), `${action.id}: no identity gate`);
    assert.ok(rendered.taskText.includes('Do not give advice'), `${action.id}: no advice ban`);
    assert.ok(rendered.taskText.includes('no card, no UPI'), `${action.id}: no payment ban`);
    assert.ok(
      rendered.taskText.includes('unanswered_questions'),
      `${action.id}: no question capture`,
    );
    assert.deepEqual(
      rendered.missingTopics,
      [],
      `${action.id}: declares a topic the test fact sheet does not cover`,
    );
  }
});

test('a minor-involved action renders the child-disclosure gate', () => {
  const action = actionById('attendance-absence')!;
  const { taskText } = renderCall({ action, contact, institute, factSheet });

  assert.ok(taskText.includes('this call concerns a child'));
  assert.ok(taskText.includes('FIRST NAME'));
  assert.ok(taskText.includes('If you reach voicemail'));
});

test('every action produces a closed result schema', () => {
  for (const action of EDUCATION_PACK) {
    const schema = buildResultSchema(action);
    assert.equal(schema.additionalProperties, false, `${action.id}: schema is open`);
    for (const field of ['identity_confirmed', 'opt_out_requested', 'unanswered_questions']) {
      assert.ok(schema.required.includes(field), `${action.id}: ${field} not required`);
    }
  }
});
