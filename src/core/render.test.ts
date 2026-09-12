import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderCall, buildResultSchema } from './render.ts';
import type {
  ActionDefinition,
  Contact,
  FactSheet,
  Institute,
} from './types.ts';

const FICTIONAL = '+15550100001';

const institute: Institute = {
  id: 'inst-1',
  displayName: 'Northline Coaching',
  callbackNumber: '+15550100999',
  timezone: 'Asia/Kolkata',
  jurisdiction: 'IN',
  allowedDestinations: [FICTIONAL],
};

const factSheet: FactSheet = {
  instituteId: 'inst-1',
  version: 7,
  approvedBy: 'A. Principal',
  approvedAt: '2026-09-01T00:00:00Z',
  entries: [
    {
      id: 'fs-timing',
      topic: 'batch-timings',
      wording: {
        en: 'The morning batch runs 7 to 9 am, Monday to Saturday.',
        hi: 'Subah ka batch somvaar se shanivaar, 7 se 9 baje tak chalta hai.',
      },
    },
    {
      id: 'fs-fee',
      topic: 'fee-amount',
      wording: { en: 'The term fee is printed on your admission letter.' },
    },
    {
      id: 'fs-secret',
      topic: 'internal-only',
      wording: { en: 'Never speak this aloud.' },
    },
  ],
};

const action: ActionDefinition = {
  id: 'demo-followup',
  title: 'Demo class follow-up',
  purpose: 'Find out whether a student who attended a demo class will enrol.',
  audience: 'lead',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated assistant calling from Northline Coaching ' +
    'about the demo class you attended.',
  questions: [
    {
      id: 'will_enrol',
      ask: 'Are they planning to enrol?',
      answers: ['yes', 'no', 'undecided'],
      requiresEvidence: true,
      claimAnswers: ['yes'],
    },
    {
      id: 'blocker',
      ask: 'If not enrolling, what is holding them back?',
      answers: ['fee', 'timing', 'distance', 'other-institute', 'other'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['batch-timings', 'fee-amount'],
  minHoursBetweenContacts: 48,
  cascade: false,
  retry: { maxAttempts: 2, minHoursBetweenAttempts: 4 },
};

const contact: Contact = {
  id: 'lead-1',
  fullName: 'Fictional Parent',
  phone: FICTIONAL,
  preferredRegister: 'hi-en',
  consent: true,
  doNotCall: false,
};

const render = (over: Partial<Parameters<typeof renderCall>[0]> = {}) =>
  renderCall({ action, contact, institute, factSheet, ...over });

test('the disclosure is instructed to come first', () => {
  const { taskText } = render();
  const disclosureAt = taskText.indexOf(action.disclosure);
  const questionsAt = taskText.indexOf('WHAT TO FIND OUT');
  assert.ok(disclosureAt > -1, 'disclosure missing');
  assert.ok(disclosureAt < questionsAt, 'disclosure must precede the questions');
});

test('only fact-sheet topics this action declares are exposed', () => {
  const { taskText } = render();
  // The contact prefers 'hi-en', so batch-timings resolves along
  // hi-en -> hi -> en and lands on the approved Hindi wording.
  assert.ok(taskText.includes('Subah ka batch'));
  // fee-amount has English only, so it falls through to the approved English.
  assert.ok(taskText.includes('printed on your admission letter'));
  assert.ok(
    !taskText.includes('Never speak this aloud'),
    'an approved entry outside the action topics leaked into the task text',
  );
});

test('an English call gets the English wording, not the Hindi one', () => {
  const { taskText } = render({ register: 'en' });
  assert.ok(taskText.includes('The morning batch runs 7 to 9 am'));
  assert.ok(!taskText.includes('Subah ka batch'));
});

test('a code-switched register tells the agent to follow the recipient', () => {
  const { taskText } = render();
  assert.ok(taskText.includes('natural mix of Hindi and English'));
  assert.ok(taskText.includes('Do not correct their language'));
});

test('register falls back along an approved path, never inventing wording', () => {
  // 'fee-amount' has English only. A Hindi call falls back to the approved
  // English text rather than producing an unapproved translation.
  const { taskText } = render({ register: 'hi' });
  assert.ok(taskText.includes('printed on your admission letter'));
});

test('a topic with no approved wording is reported, not silently dropped', () => {
  const widened = {
    ...action,
    factSheetTopics: [...action.factSheetTopics, 'refund-policy'],
  };
  const { missingTopics } = render({ action: widened });
  assert.deepEqual(missingTopics, ['refund-policy']);
});

test('the boundary forbids advice, discounts, promises and payment details', () => {
  const { taskText } = render();
  for (const phrase of [
    'Do not give advice',
    'discount',
    'Do not promise',
    'no card, no UPI',
    'one-time passwords',
  ]) {
    assert.ok(
      taskText.toLowerCase().includes(phrase.toLowerCase()),
      `boundary is missing: ${phrase}`,
    );
  }
});

test('an unanswerable question is routed to a person, not improvised', () => {
  const { taskText } = render();
  assert.ok(taskText.includes('unanswered_questions'));
  assert.ok(taskText.includes('call you back'));
  assert.ok(taskText.includes('word for word'));
});

test('a claim answer is marked as an intention rather than a completed fact', () => {
  const { taskText } = render();
  assert.ok(taskText.includes('stating an intention, not a completed fact'));
  assert.ok(taskText.includes('Do not treat it as done'));
});

test('a minor-involved action gates the student name behind guardian confirmation', () => {
  const { taskText } = render({
    action: { ...action, sensitivity: 'minor-involved' },
  });
  assert.ok(taskText.includes('this call concerns a child'));
  assert.ok(taskText.includes('FIRST NAME'));
  assert.ok(taskText.includes('If you reach voicemail'));
  assert.ok(taskText.includes('Do not name the student') === false);
  assert.ok(taskText.includes("student's name"), 'voicemail rule must be explicit');
});

test('earlier-call context is placed after the identity gate, never before', () => {
  // Ordering is the safety property. Recalling "you said you would pay on
  // Friday" before knowing who picked up discloses a family's finances to
  // whoever answered.
  const rendered = render({
    priorCalls: [
      {
        callId: 'call-0',
        contactId: contact.id,
        actionId: action.id,
        placedAt: '2026-09-05T10:00:00Z',
        disposition: 'answered',
        answers: { will_enrol: 'undecided' },
        claims: [],
        resolvedQuestions: [
          {
            originalQuote: 'Kya scholarship mil sakti hai?',
            answer: 'Scholarship forms are at the office until the 20th.',
            resolvedBy: 'Office admin',
            resolvedAt: '2026-09-06T09:00:00Z',
          },
        ],
      },
    ],
  });

  const gateAt = rendered.taskText.indexOf('IDENTITY GATE');
  const historyAt = rendered.taskText.indexOf('WHAT YOU ALREADY KNOW FROM EARLIER CALLS');

  assert.ok(gateAt > -1 && historyAt > -1, 'both sections must be present');
  assert.ok(historyAt > gateAt, 'earlier-call context must follow the identity gate');
  assert.equal(rendered.priorCallsReferenced, 1);
  assert.equal(rendered.resolvedQuestionsDelivered, 1);
});

test("rendering refuses a prior call belonging to somebody else", () => {
  // The worst thing this file could do is read one family's answers to
  // another. A comment asking the caller to filter correctly is not a
  // guarantee; throwing is.
  assert.throws(
    () =>
      render({
        priorCalls: [
          {
            callId: 'call-x',
            contactId: 'somebody-else',
            actionId: action.id,
            placedAt: '2026-09-05T10:00:00Z',
            disposition: 'answered',
            answers: { will_enrol: 'yes' },
            claims: [],
            resolvedQuestions: [],
          },
        ],
      }),
    /belongs to contact somebody-else/,
  );
});

test('with no history the task text carries no earlier-call section', () => {
  const { taskText, priorCallsReferenced } = render();
  assert.ok(!taskText.includes('WHAT YOU ALREADY KNOW'));
  assert.equal(priorCallsReferenced, 0);
});

test('the destination is masked in the rendered output', () => {
  const rendered = render();
  assert.ok(!rendered.maskedDestination.includes('0100001'));
  assert.ok(rendered.maskedDestination.startsWith('+15'));
});

test('the render hands back every string the agent is allowed to say', () => {
  // So the caller can feed the agent-speech audit without reconstructing it.
  // A check nobody can conveniently feed is a check nobody feeds.
  const { approvedTexts } = render();

  assert.ok(approvedTexts.includes(action.disclosure), 'disclosure missing');
  assert.ok(approvedTexts.includes(institute.callbackNumber), 'callback missing');
  assert.ok(
    approvedTexts.some((text) => text.includes('Subah ka batch')),
    'approved fact-sheet wording missing',
  );
  assert.ok(
    approvedTexts.some((text) => text.includes('Are they planning to enrol?')),
    'question text missing',
  );
  assert.ok(
    !approvedTexts.some((text) => text.includes('Never speak this aloud')),
    'an out-of-scope fact-sheet entry became a legitimate source',
  );
});

test('the fact sheet version is pinned to the render', () => {
  assert.equal(render().factSheetVersion, 7);
});

test('rendering is pure: identical inputs give identical task text', () => {
  assert.equal(render().taskText, render().taskText);
});

test('unknown is an allowed answer for every question', () => {
  const schema = buildResultSchema(action);
  for (const question of action.questions) {
    const field = schema.properties[question.id] as { enum: string[] };
    assert.ok(
      field.enum.includes('unknown'),
      `${question.id} must allow "unknown"`,
    );
  }
});

test('every call carries identity, opt-out and unanswered-question fields', () => {
  const schema = buildResultSchema(action);
  for (const field of [
    'identity_confirmed',
    'opt_out_requested',
    'unanswered_questions',
    'evidence_quotes',
  ]) {
    assert.ok(field in schema.properties, `schema is missing ${field}`);
  }
  assert.ok(schema.required.includes('identity_confirmed'));
  assert.ok(schema.required.includes('opt_out_requested'));
  assert.ok(schema.required.includes('unanswered_questions'));
});

test('the schema is closed, so an invented field fails validation', () => {
  assert.equal(buildResultSchema(action).additionalProperties, false);
});

test('an action with no questions still renders a usable call', () => {
  const announcement = { ...action, questions: [] };
  const { taskText } = render({ action: announcement });
  assert.ok(taskText.includes('This call asks nothing'));
});
