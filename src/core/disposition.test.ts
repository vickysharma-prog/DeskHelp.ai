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

test('a phone nobody answered is retryable; one that was hung up on is not', () => {
  // From a real call. CALL-E reports an unanswered phone as status "failed"
  // with the reason only in prose, so reading the status alone filed it as
  // work for a person and the retry never fired. The one case that should be
  // rung again was the one case that never was.
  const judgeWith = (status: string, failure: string | null) =>
    judge({
      action,
      callId: 'call_x',
      contactId: 'c-1',
      result: { status, failure_message: failure },
    }).disposition;

  assert.equal(
    judgeWith('failed', 'calling task status=NO ANSWER (Hangup by: bot)'),
    'unreached',
    'the platform gave up on a phone nobody answered',
  );
  assert.equal(judgeWith('failed', 'calling task status=BUSY'), 'unreached');
  assert.equal(judgeWith('failed', 'VOICEMAIL reached'), 'unreached');

  // The far end ended it. A hang-up is consent withdrawn, and redialling it
  // means the more clearly somebody refuses, the more often they are rung.
  assert.equal(
    judgeWith('failed', 'calling task status=DECLINED (Hangup by: user)'),
    'declined',
  );
  assert.equal(judgeWith('failed', 'Hangup by: callee'), 'declined');

  // A refusal beats a non-connection when a message somehow carries both.
  assert.equal(
    judgeWith('failed', 'NO ANSWER then DECLINED (Hangup by: user)'),
    'declined',
    'the refusal has to win, or a refusal gets retried',
  );

  // Still unrecognised, still a person's problem. Never a silent redial.
  assert.equal(judgeWith('failed', 'gateway exploded'), 'needs-human');
  assert.equal(judgeWith('failed', null), 'needs-human');
  assert.equal(judgeWith('canceled', null), 'needs-human');
});

test('the failure reason CALL-E gave is kept, not thrown away', () => {
  // Otherwise the operator sees "not completed" and has to go to the provider
  // dashboard to learn it was simply not answered.
  const verdict = judge({
    action,
    callId: 'call_x',
    contactId: 'c-1',
    result: {
      status: 'failed',
      failure_message: 'calling task status=NO ANSWER (Hangup by: bot)',
    },
  });
  assert.match(verdict.reasons[0]!, /NO ANSWER/);
});

test('a phone that never rang is not a phone nobody answered', () => {
  // Both real failures on this project had an attempt that started and
  // finished in the same instant, and one of them said "NO ANSWER" in its
  // prose. Reading that prose filed a route that never connected as a person
  // who did not pick up, which is information about the recipient that
  // nobody has. `ringfence` in the CALL-E submissions repository hit the same
  // mislabel against the live API and split the two apart.
  const zeroRing = (failure: string) => ({
    status: 'failed',
    failure_message: failure,
    attempts: [
      {
        status: 'failed',
        started_at: '2026-09-13T07:03:30Z',
        completed_at: '2026-09-13T07:03:30Z',
      },
    ],
  });

  assert.equal(
    judge({ action, callId: 'c', contactId: 'c-1', result: zeroRing('calling task status=NO ANSWER (Hangup by: bot)') })
      .disposition,
    'needs-human',
    'zero ring time is a connection failure, whatever the prose says',
  );

  // The same prose, with the phone actually ringing for twenty seconds, is a
  // genuine no-answer and stays retryable.
  assert.equal(
    judge({
      action,
      callId: 'c',
      contactId: 'c-1',
      result: {
        status: 'failed',
        failure_message: 'calling task status=NO ANSWER (Hangup by: bot)',
        attempts: [
          {
            status: 'failed',
            started_at: '2026-09-13T07:03:30Z',
            completed_at: '2026-09-13T07:03:50Z',
          },
        ],
      },
    }).disposition,
    'unreached',
  );

  // A refusal is still a refusal even with no ring time recorded, because
  // being hung up on is a statement and this must never become a retry.
  assert.equal(
    judge({ action, callId: 'c', contactId: 'c-1', result: zeroRing('DECLINED (Hangup by: user)') })
      .disposition,
    'declined',
  );
});

test("a turn the provider could not attribute is nobody's evidence", () => {
  // Found on a real call. CALL-E returns a third speaker label, `unknown`, and
  // the turns it carried were the agent's own words: "Wapas apne sawaal par
  // aate hain — aap sochte hain ki payment kab tak ho jayegi?"
  //
  // The old rule was anything-but-the-agent, so those were filed as the
  // recipient's and the agent's own question became available to ground the
  // answer to itself. That is the exact hole this check exists to close,
  // handed over by the provider rather than invented by the model.
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: turns(
      ['bot', 'Aap kab tak payment karenge?', 0],
      ['unknown', 'Wapas apne sawaal par aate hain, aap kab tak payment karenge?', 4],
      ['user', 'Haan ji.', 9],
    ),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'Wapas apne sawaal par aate hain' },
    },
  });

  assert.equal(judgement.answers.will_pay, 'unknown');
  assert.equal(judgement.disposition, 'needs-human');
  assert.match(judgement.discarded[0]!.reason, /recipient spoke/);
});

test('a null offset does not become a claim nobody can find', () => {
  // CALL-E returns offset_seconds as null on some turns. A Claim carrying null
  // points at no moment in the recording.
  const judgement = judgeWith({
    status: 'completed',
    transcript_turns: [
      { speaker: 'user', text: 'Haan main kal portal pe kar dunga.', offset_seconds: null },
    ],
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'main kal portal pe kar dunga' },
    },
  });

  assert.equal(judgement.claims.length, 1);
  assert.equal(judgement.claims[0]!.offsetSeconds, 0);
});

test("CALL-E's own confidence is carried, and decides nothing", () => {
  // Worth showing beside the verdict: a high score next to a discarded answer
  // is a useful thing for an operator to notice. It is a statement about the
  // provider's extraction, not about whether the recipient said the thing, so
  // it must never move a disposition.
  const withConfidence = (score: number, label: string) =>
    judgeWith({
      status: 'completed',
      completion_confidence: { score, label },
      transcript_turns: turns(
        ['bot', 'Will you pay before Friday?', 0],
        ['user', 'Hmm.', 4],
      ),
      structured_result: {
        identity_confirmed: 'yes',
        opt_out_requested: 'no',
        unanswered_questions: [],
        will_pay: 'yes',
        evidence_quotes: { will_pay: 'yes I will pay before Friday' },
      },
    });

  const sure = withConfidence(0.99, 'high');
  assert.equal(sure.providerConfidence?.label, 'high');
  assert.equal(sure.providerConfidence?.score, 0.99);

  // Near-certain, and still discarded, because the recipient said "Hmm."
  assert.equal(sure.disposition, 'needs-human');
  assert.equal(sure.answers.will_pay, 'unknown');
  assert.equal(sure.discarded.length, 1);

  // And a low score changes nothing about a call that was properly grounded.
  const shaky = judgeWith({
    status: 'completed',
    completion_confidence: { score: 0.1, label: 'low' },
    transcript_turns: turns(['user', 'Haan ji main portal pe kal kar dunga.', 5]),
    structured_result: {
      identity_confirmed: 'yes',
      opt_out_requested: 'no',
      unanswered_questions: [],
      will_pay: 'yes',
      evidence_quotes: { will_pay: 'main portal pe kal kar dunga' },
    },
  });
  assert.equal(shaky.disposition, 'answered');
  assert.equal(shaky.providerConfidence?.label, 'low');
});
