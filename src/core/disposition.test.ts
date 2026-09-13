import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judge, transcriptTurnsOf } from './disposition.ts';
import type { CalleRecipientResult, TranscriptTurn } from './disposition.ts';
import type { ActionDefinition } from './types.ts';

const action: ActionDefinition = {
  id: 'fee-reminder',
  title: 'Fee reminder',
  purpose: 'Remind a guardian that a term fee is due.',
  audience: 'guardian',
  sensitivity: 'financial',
  disclosure: 'Automated call from the institute about a fee due date.',
  questions: [
    {
      id: 'will_pay',
      ask: 'Do they intend to pay before the due date?',
      answers: ['yes', 'no'],
      requiresEvidence: true,
      claimAnswers: ['yes'],
    },
    {
      id: 'preferred_channel',
      ask: 'How would they prefer to pay?',
      answers: ['portal', 'counter'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['fee-due-date'],
  minHoursBetweenContacts: 72,
  cascade: false,
  retry: { maxAttempts: 2, minHoursBetweenAttempts: 4 },
};

const turns = (...rows: [string, string, number][]): TranscriptTurn[] =>
  rows.map(([speaker, text, offset_seconds]) => ({ speaker, text, offset_seconds }));

const judgeWith = (result: CalleRecipientResult) =>
  judge({ action, callId: 'call-1', contactId: 'c-1', result });

const goodTurns = turns(
  ['bot', 'Hello, this is an automated call about the term fee.', 0],
  ['user', 'Haan ji, main portal pe kal kar dunga.', 6],
);

test('a clean, grounded call is answered', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      preferred_channel: 'portal',
      evidence_quotes: { will_pay: 'main portal pe kal kar dunga' },
    },
  });

  assert.equal(judgement.disposition, 'answered');
  assert.deepEqual(judgement.reasons, []);
  assert.equal(judgement.answers.will_pay, 'yes');
});

test("an agent's own words never count as evidence", () => {
  // The agent paraphrased the recipient. The paraphrase appears in the
  // transcript, but only on the bot's side. It must not ground an answer.
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: turns(
      ['bot', 'So you will pay before Friday, is that right?', 0],
      ['user', 'Hmm.', 4],
    ),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'you will pay before Friday' },
    },
  });

  assert.equal(judgement.disposition, 'needs-human');
  assert.equal(judgement.answers.will_pay, 'unknown');
  assert.equal(judgement.discarded.length, 1);
  assert.match(judgement.discarded[0]!.reason, /recipient spoke/);
});

test('a quote padded around a single syllable is not evidence', () => {
  // Regression. Matching used to run in both directions, so a recipient who
  // said only "Hmm." grounded a fabricated quote that merely contained "hmm".
  // The agent could pad any answer it liked around one syllable.
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: turns(
      ['bot', 'Will you pay before Friday?', 0],
      ['user', 'Hmm.', 3],
    ),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'Hmm, yes I will pay before Friday' },
    },
  });

  assert.equal(judgement.disposition, 'needs-human');
  assert.equal(judgement.answers.will_pay, 'unknown');
  assert.equal(judgement.discarded.length, 1);
});

test('a quote spanning two recipient turns is still evidence', () => {
  // The legitimate case the one-directional rule must not break: a sentence
  // the recipient finished across two turns.
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: turns(
      ['bot', 'About the term fee.', 0],
      ['user', 'Haan ji main portal pe', 5],
      ['user', 'kal kar dunga', 7],
    ),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'main portal pe kal kar dunga' },
    },
  });

  assert.equal(judgement.disposition, 'answered');
  assert.equal(judgement.answers.will_pay, 'yes');
  assert.equal(
    judgement.claims[0]!.offsetSeconds,
    5,
    'the offset should point at where the recipient started saying it',
  );
});

test('a trivially short quote is not evidence', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: turns(['user', 'Haan ji theek hai.', 4]),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'a' },
    },
  });

  assert.equal(judgement.answers.will_pay, 'unknown');
});

test('an evidenced answer that needs evidence but has none is discarded', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: {},
    },
  });

  assert.equal(judgement.disposition, 'needs-human');
  assert.equal(judgement.answers.will_pay, 'unknown');
});

test('a stated intention becomes a claim, never a fact', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'main portal pe kal kar dunga' },
    },
  });

  assert.equal(judgement.claims.length, 1);
  const claim = judgement.claims[0]!;
  assert.equal(claim.questionId, 'will_pay');
  assert.equal(claim.statedValue, 'yes');
  assert.equal(claim.confirmed, false);
  assert.equal(claim.offsetSeconds, 6, 'claim should point at the recipient turn');
});

test('unconfirmed identity blocks every answer on the call', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: {
      identity_confirmed: 'no',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'main portal pe kal kar dunga' },
    },
  });

  assert.equal(judgement.disposition, 'needs-human');
  assert.match(judgement.reasons.join(' '), /Identity was not confirmed/);
});

test('voicemail is unreached, not a quiet no', () => {
  for (const status of ['voicemail', 'no_answer', 'busy', 'ring_no_answer']) {
    const judgement = judgeWith({ status, structured_result: null });
    assert.equal(judgement.disposition, 'unreached', `${status} should be unreached`);
    assert.deepEqual(judgement.answers, {});
  }
});

test('answering and hanging up is declined, never unreached', () => {
  // The distinction the whole retry policy rests on. Filing a hang-up as a
  // missed call means the more clearly somebody refuses, the more we ring them.
  for (const status of ['declined', 'rejected', 'hangup_by_callee']) {
    const judgement = judgeWith({ status, structured_result: null });
    assert.equal(judgement.disposition, 'declined', `${status} should be declined`);
  }
});

test('an ambiguous status is never filed as a missed call', () => {
  // `failed` and `canceled` do not say whether a phone ever rang, so they
  // must not become retryable. A person decides.
  for (const status of ['failed', 'canceled', 'something_new', '']) {
    const judgement = judgeWith({ status, structured_result: null });
    assert.equal(
      judgement.disposition,
      'needs-human',
      `${status || '(empty)'} should reach a human`,
    );
  }
});

test('an opt-out outranks everything else said on the call', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'yes',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'main portal pe kal kar dunga' },
    },
  });

  assert.equal(judgement.disposition, 'opted-out');
  assert.equal(judgement.optOutRequested, true);
});

test('unknown is recorded as an answer, not treated as a failure', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'unknown',
      preferred_channel: 'unknown',
      evidence_quotes: {},
    },
  });

  assert.equal(judgement.disposition, 'answered');
  assert.equal(judgement.answers.will_pay, 'unknown');
  assert.deepEqual(judgement.discarded, []);
});

test('a value outside the allowed answers is discarded', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'maybe-later',
      evidence_quotes: { will_pay: 'main portal pe kal kar dunga' },
    },
  });

  assert.equal(judgement.answers.will_pay, 'unknown');
  assert.match(judgement.discarded[0]!.reason, /outside the allowed answers/);
});

test('a captured question keeps the call open for a person', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: turns(
      ['bot', 'This is about the term fee.', 0],
      ['user', 'Kya scholarship mil sakti hai?', 5],
      ['user', 'Theek hai, main counter pe aaunga.', 11],
    ),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [{ quote: 'Kya scholarship mil sakti hai?' }],
      preferred_channel: 'counter',
      evidence_quotes: {},
    },
  });

  assert.equal(judgement.disposition, 'needs-human');
  assert.equal(judgement.unansweredQuestions.length, 1);
  assert.equal(judgement.unansweredQuestions[0]!.offsetSeconds, 5);
  assert.match(judgement.reasons.join(' '), /need an answer from the office/);
});

test('punctuation and casing differences do not break grounding', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: turns(
      ['bot', 'About the fee.', 0],
      ['user', 'Haan ji, main portal pe kal kar dunga!', 6],
    ),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'Main portal pe kal kar dunga.' },
    },
  });

  assert.equal(judgement.disposition, 'answered');
});

test('a missing structured result does not become a negative answer', () => {
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: goodTurns,
    structured_result: null,
  });

  assert.notEqual(judgement.disposition, 'answered');
  assert.equal(judgement.answers.will_pay, 'unknown');
});

test('turns are read from the attempt, which is where CALL-E files them', () => {
  // Found on the first real call. CALL-E reports turns at
  // recipients[].attempts[].transcript_turns, and this read them one level up
  // where nothing was. Grounding then had nothing to check against, so every
  // evidenced answer was discarded and every call went to a person. The
  // fixtures used the flat shape, so the suite was green throughout.
  const spoken = [
    { offset_seconds: 0, speaker: 'bot', text: 'Kya aapko due date ke baare mein pata hai?' },
    { offset_seconds: 6, speaker: 'user', text: 'Haan ji pata hai mere ko.' },
  ];

  assert.equal(
    transcriptTurnsOf({ status: 'completed', attempts: [{ transcript_turns: spoken }] }).length,
    2,
    'the attempt is where the words are',
  );

  // The flat shape still works, because fixtures and older responses use it.
  assert.equal(
    transcriptTurnsOf({ status: 'completed', transcript_turns: spoken }).length,
    2,
  );

  // A later attempt with no turns must not borrow the earlier one's words.
  // Those were spoken on a different call to the same person.
  assert.equal(
    transcriptTurnsOf({
      status: 'completed',
      attempts: [{ transcript_turns: spoken }, { transcript_turns: [] }],
    }).length,
    0,
    'an attempt that reports no turns has none, and grounding must fail closed',
  );

  assert.equal(transcriptTurnsOf({ status: 'completed' }).length, 0);
});
