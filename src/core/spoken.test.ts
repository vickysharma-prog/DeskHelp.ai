import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auditAgentSpeech } from './spoken.ts';
import { judge } from './disposition.ts';
import type { TranscriptTurn } from './disposition.ts';
import type { ActionDefinition } from './types.ts';

const turns = (...rows: [string, string, number][]): TranscriptTurn[] =>
  rows.map(([speaker, text, offset_seconds]) => ({ speaker, text, offset_seconds }));

const APPROVED = [
  'The term fee is 8400 rupees, due on the 15th.',
  'The morning batch runs 7 to 9 am.',
  'Hello, this is an automated assistant from Northline Coaching.',
  '+15550100999',
];

const audit = (ts: readonly TranscriptTurn[], approvedTexts = APPROVED) =>
  auditAgentSpeech({ turns: ts, approvedTexts });

test('an ordinary call produces no findings', () => {
  // The check must not fire on greetings, questions, or the sign-off, or it
  // will be switched off within a week.
  const findings = audit(
    turns(
      ['bot', 'Hello, this is an automated assistant from Northline Coaching.', 0],
      ['bot', 'Am I speaking to the parent of the student?', 4],
      ['user', 'Haan ji.', 7],
      ['bot', 'Are you planning to continue next term?', 9],
      ['user', 'Haan, kar denge.', 13],
      ['bot', 'Thank you, that is all I needed. Goodbye.', 16],
    ),
  );
  assert.deepEqual(findings, []);
});

test('a number the agent was given is not a finding', () => {
  const findings = audit(
    turns(['bot', 'The term fee is 8400 rupees, due on the 15th.', 2]),
  );
  assert.deepEqual(findings, []);
});

test('a number the agent was never given is a finding', () => {
  // The failure this exists for: the institute quoting a price nobody approved.
  const findings = audit(turns(['bot', 'Your fee this term is 9250 rupees.', 3]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, 'unsourced-number');
  assert.equal(findings[0]!.token, '9250');
  assert.equal(findings[0]!.offsetSeconds, 3);
});

test('small counts in ordinary speech are not findings', () => {
  const findings = audit(
    turns(['bot', 'I have 2 quick questions, it will take 1 minute.', 1]),
  );
  assert.deepEqual(findings, []);
});

test('the institute callback number is a legitimate source', () => {
  const findings = audit(
    turns(['bot', 'Please call the office back on +15550100999.', 5]),
  );
  assert.deepEqual(findings, []);
});

test('committing language is a finding even with no numbers', () => {
  for (const line of [
    'We can offer you a discount this term.',
    'I promise the seat will be held.',
    'Aapko chhoot mil jayegi.',
    'Fees kam kar denge.',
  ]) {
    const findings = audit(turns(['bot', line, 8]));
    assert.ok(findings.length > 0, `should have flagged: ${line}`);
    assert.equal(findings[0]!.kind, 'prohibited-commitment');
  }
});

test("only the agent's turns are audited, never the recipient's", () => {
  // A parent may say whatever they like about discounts and amounts. It is
  // the institute's automated caller that is bound, not the family.
  const findings = audit(
    turns(
      ['user', 'Can I get a discount? Last year it was 7000.', 4],
      ['bot', 'I will have someone from the office confirm and call you back.', 9],
    ),
  );
  assert.deepEqual(findings, []);
});

test('an unapproved statement holds the call open for a person', () => {
  const action: ActionDefinition = {
    id: 'fee-reminder',
    title: 'Fee reminder',
    purpose: 'Remind a guardian a fee is due.',
    audience: 'guardian',
    sensitivity: 'financial',
    disclosure: 'Automated call about a fee.',
    questions: [],
    factSheetTopics: [],
    minHoursBetweenContacts: 72,
    cascade: false,
    retry: { maxAttempts: 2, minHoursBetweenAttempts: 4 },
  };

  const judgement = judge({
    action,
    callId: 'call-1',
    contactId: 'c-1',
    approvedTexts: APPROVED,
    result: {
      status: 'completed',
      transcript_turns: turns(
        ['bot', 'Your fee this term is 9250 rupees.', 3],
        ['user', 'Theek hai.', 7],
      ),
      structured_result: {
        identity_confirmed: 'yes',
        opt_out_requested: 'no',
        unanswered_questions: [],
        evidence_quotes: {},
      },
    },
  });

  assert.equal(judgement.disposition, 'needs-human');
  assert.equal(judgement.spokenFindings.length, 1);
  assert.match(judgement.reasons.join(' '), /appears in no approved wording/);
});

test('a clean call still settles as answered with the audit wired in', () => {
  const action: ActionDefinition = {
    id: 'fee-reminder',
    title: 'Fee reminder',
    purpose: 'Remind a guardian a fee is due.',
    audience: 'guardian',
    sensitivity: 'financial',
    disclosure: 'Automated call about a fee.',
    questions: [],
    factSheetTopics: [],
    minHoursBetweenContacts: 72,
    cascade: false,
    retry: { maxAttempts: 2, minHoursBetweenAttempts: 4 },
  };

  const judgement = judge({
    action,
    callId: 'call-1',
    contactId: 'c-1',
    approvedTexts: APPROVED,
    result: {
      status: 'completed',
      transcript_turns: turns(
        ['bot', 'The term fee is 8400 rupees, due on the 15th.', 2],
        ['user', 'Theek hai, kar denge.', 6],
      ),
      structured_result: {
        identity_confirmed: 'yes',
        opt_out_requested: 'no',
        unanswered_questions: [],
        evidence_quotes: {},
      },
    },
  });

  assert.equal(judgement.disposition, 'answered');
  assert.deepEqual(judgement.spokenFindings, []);
});
