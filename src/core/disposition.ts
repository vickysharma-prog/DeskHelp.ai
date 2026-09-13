/**
 * Works out what a finished call actually established.
 *
 * A structured result is a **report about a conversation**, not a fact about
 * the world. CALL-E returns what its agent believes it heard; this file
 * decides how much of that survives contact with the transcript.
 *
 * The classification is fail-closed. `answered` — the only disposition that
 * can be acted on without a person looking — requires every one of:
 *
 *   - the call reached a terminal state of `completed`
 *   - the right person confirmed their identity
 *   - every question marked `requiresEvidence` has a quote
 *   - every such quote is found in a turn the RECIPIENT spoke, not the agent
 *
 * Anything else routes to a human. Voicemail is not a soft yes, an agent
 * paraphrasing itself is not evidence, and a call that completed is not the
 * same as an outcome that completed.
 */

import { auditAgentSpeech, describeFinding } from './spoken.ts';
import type { SpokenFinding } from './spoken.ts';
import type {
  ActionDefinition,
  Claim,
  Disposition,
  UnansweredQuestion,
} from './types.ts';

/** One turn of the conversation, as CALL-E reports it. */
export interface TranscriptTurn {
  readonly offset_seconds: number;
  readonly speaker: string;
  readonly text: string;
}

/** One dialling attempt CALL-E made for a recipient. */
export interface CalleAttempt {
  readonly id?: string;
  readonly status?: string;
  readonly started_at?: string;
  readonly transcript_turns?: readonly TranscriptTurn[];
  readonly failure_code?: string | number | null;
  readonly failure_message?: string | null;
}

/** The shape DeskHelp reads back from CALL-E for a single recipient. */
export interface CalleRecipientResult {
  readonly status: string;
  readonly structured_result?: Record<string, unknown> | null;
  readonly transcript_turns?: readonly TranscriptTurn[];
  readonly attempts?: readonly CalleAttempt[];
  readonly completion_confidence?: { score?: number; label?: string } | null;
  readonly failure_code?: string | number | null;
  readonly failure_message?: string | null;
}

/**
 * Everything CALL-E said about why a call did not happen, in one string.
 *
 * It arrives in three places — on the call, on the recipient, and on the
 * attempt — and which one carries the useful sentence varies. Reading only the
 * recipient found nothing, which is how a call nobody answered was filed as
 * one a person must look at.
 */
function failureTextOf(result: CalleRecipientResult): string {
  const latest = (result.attempts ?? []).at(-1);
  return [
    result.failure_message,
    result.failure_code,
    latest?.failure_message,
    latest?.status,
  ]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' ');
}

/**
 * The words the recipient actually spoke, wherever CALL-E filed them.
 *
 * CALL-E reports turns per attempt, at
 * `recipients[].attempts[].transcript_turns`, not on the recipient. Reading
 * the recipient level found nothing, so every answer that needed evidence was
 * discarded for want of anything to check it against and every call landed on
 * a person. Failing closed was right; failing closed on all of them was a bug.
 *
 * The last attempt is the call being judged. If it reports no turns, that is
 * an answer in itself and grounding should fail, so an older attempt's words
 * are never borrowed to support it.
 */
export function transcriptTurnsOf(
  result: CalleRecipientResult,
): readonly TranscriptTurn[] {
  const latest = (result.attempts ?? []).at(-1);
  if (latest?.transcript_turns) return latest.transcript_turns;
  return result.transcript_turns ?? [];
}

export interface Judgement {
  readonly disposition: Disposition;
  /** Every reason this was not a clean `answered`. Empty when it was. */
  readonly reasons: readonly string[];
  /** Answers that survived the evidence check. */
  readonly answers: Readonly<Record<string, string>>;
  /** Stated intentions, kept separate from fact for their whole life. */
  readonly claims: readonly Claim[];
  readonly unansweredQuestions: readonly UnansweredQuestion[];
  readonly optOutRequested: boolean;
  /**
   * Answers that were reported but discarded because nothing the recipient
   * said supported them. Kept so an operator can see what was dropped and
   * why, rather than wondering where a field went.
   */
  readonly discarded: readonly { questionId: string; reported: string; reason: string }[];
  /**
   * Things the AGENT said that it had no approval for. The mirror of the
   * grounding check: that one stops invented answers, this one stops invented
   * statements. Advisory — it routes the call to a person rather than
   * discarding the recipient's answers, which are the recipient's regardless
   * of what the agent said around them.
   */
  readonly spokenFindings: readonly SpokenFinding[];
}

/**
 * Speaker labels that mean "the machine". Everything else is treated as the
 * far end, because mislabelling the agent as the recipient would let the
 * agent's own words count as evidence — the exact failure this guards against.
 */
const AGENT_SPEAKERS = new Set(['bot', 'agent', 'assistant', 'system', 'ai']);

function isRecipientTurn(turn: TranscriptTurn): boolean {
  return !AGENT_SPEAKERS.has(turn.speaker.trim().toLowerCase());
}

/**
 * Loose comparison for matching a quote against a transcript turn.
 *
 * Speech-to-text is inconsistent about punctuation, casing and spacing, and
 * a quote that differs only in a comma is still the same sentence. Letters and
 * digits in any script — Latin, Devanagari, Tamil — are preserved.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}\-‐-―‘-‟]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Is this quote actually something the recipient said?
 *
 * Containment runs in ONE direction only: the quote must be contained in what
 * the recipient said. The reverse — accepting a quote because it contains a
 * recipient turn — is a hole wide enough to drive the whole failure through.
 *
 * Concretely, with bidirectional matching a recipient who says only "Hmm."
 * grounds a reported quote of "Hmm, yes I will pay before Friday", because the
 * fabricated sentence contains "hmm". The agent can then pad any answer it
 * likes around a single syllable and it reads as evidence. This was a real bug
 * here, found by probing rather than by the test suite, which happened to pass
 * only because its fabricated quote did not contain the recipient's word.
 *
 * A quote that legitimately spans several turns is still matched, by checking
 * runs of consecutive recipient turns joined together. That covers the real
 * case (a sentence finished across two turns) without admitting padding.
 */
function quoteIsGrounded(
  quote: string,
  turns: readonly TranscriptTurn[],
): TranscriptTurn | undefined {
  const target = normalise(quote);

  // A one-character "quote" would match almost anything. Evidence has to be
  // long enough to mean something.
  if (target.length < 2) return undefined;

  const spokenTurns = turns.filter(isRecipientTurn);

  // The common case: the quote sits inside one turn.
  for (const turn of spokenTurns) {
    if (normalise(turn.text).includes(target)) return turn;
  }

  // The quote runs across consecutive turns. Return the turn it starts in, so
  // the recorded offset points at where the recipient began saying it.
  for (let start = 0; start < spokenTurns.length; start += 1) {
    let joined = '';
    for (let end = start; end < spokenTurns.length; end += 1) {
      const next = normalise(spokenTurns[end]!.text);
      joined = joined.length === 0 ? next : `${joined} ${next}`;
      if (joined.includes(target)) return spokenTurns[start];
    }
  }

  return undefined;
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Terminal statuses meaning the phone rang and nobody engaged. Retryable.
 */
const NOT_REACHED = new Set(['no_answer', 'voicemail', 'busy', 'ring_no_answer']);

/**
 * Terminal statuses meaning somebody answered and then ended it. Never
 * retryable: a hang-up is a withdrawal of consent expressed the only way
 * available to someone who does not want to talk to a machine.
 */
const DECLINED = new Set(['declined', 'rejected', 'hangup_by_callee']);

/**
 * Maps a provider status onto a disposition without inheriting the provider's
 * vocabulary.
 *
 * Anything unrecognised — including `failed` and `canceled`, which are
 * genuinely ambiguous about whether a phone ever rang — resolves to
 * `needs-human`. That is deliberate: an unknown outcome must reach a person
 * rather than be filed as a missed call and quietly redialled.
 */
/**
 * The far end ended the call. Never retryable, whatever else is in the message.
 *
 * "Hangup by: bot" is the opposite case and must not match here: that is the
 * platform giving up on a phone nobody answered.
 */
const CALLEE_ENDED =
  /hangup\s*by:?\s*(user|callee|customer|human|recipient)|by\s*callee|declined|rejected|refus/i;

/** The phone was never engaged. Retryable, within the action's own limit. */
const NEVER_ENGAGED =
  /no[\s_-]*answer|busy|voicemail|answer(ing)?\s*machine|unavailable|not\s*reachable|no[\s_-]*response|timeout/i;

/**
 * Maps a provider outcome onto a disposition without inheriting the provider's
 * vocabulary or its retry.
 *
 * CALL-E reports a phone nobody picked up as `status: "failed"` with the real
 * reason in prose: `calling task status=NO ANSWER (Hangup by: bot)`. Reading
 * the status alone made that unrecognised, so it became `needs-human` and the
 * retry never fired. A person who does not answer is exactly the one case that
 * should be rung again, so that filed every missed call as work for a human
 * and never called anybody back.
 *
 * The order below is the safety. A refusal wins over a non-connection, because
 * mistaking a hang-up for a missed call means the more clearly somebody
 * refuses, the more often they are rung. Anything still unrecognised reaches a
 * person, as `docs/adr/0006-a-refusal-is-not-a-missed-call.md` requires.
 */
function dispositionForStatus(status: string, failureText = ''): Disposition {
  if (NOT_REACHED.has(status)) return 'unreached';
  if (DECLINED.has(status)) return 'declined';

  if (CALLEE_ENDED.test(failureText)) return 'declined';
  if (NEVER_ENGAGED.test(failureText)) return 'unreached';

  return 'needs-human';
}

export function judge(args: {
  readonly action: ActionDefinition;
  readonly callId: string;
  readonly contactId: string;
  readonly result: CalleRecipientResult;
  /**
   * Every string the agent was legitimately given for this call: the approved
   * fact-sheet wording live at plan time, the disclosure, the question texts,
   * the institute's callback number.
   *
   * Omit it and the agent's own speech goes unchecked, which is the state this
   * file was in until the audit was wired. Callers should pass it.
   */
  readonly approvedTexts?: readonly string[];
}): Judgement {
  const { action, result, callId, contactId } = args;

  const reasons: string[] = [];
  const answers: Record<string, string> = {};
  const claims: Claim[] = [];
  const unansweredQuestions: UnansweredQuestion[] = [];
  const discarded: { questionId: string; reported: string; reason: string }[] = [];

  const turns = transcriptTurnsOf(result);
  const structured = result.structured_result ?? {};

  // 1. Did the call even get there? A non-terminal or failed status cannot be
  //    reasoned about further, and an absent structured result is not an
  //    outcome of "no".
  const status = result.status?.trim().toLowerCase() ?? '';
  if (status !== 'completed') {
    const failureText = failureTextOf(result);
    return {
      disposition: dispositionForStatus(status, failureText),
      reasons: [
        failureText
          ? `Call status was "${result.status}", not "completed": ${failureText}`
          : `Call status was "${result.status}", not "completed".`,
      ],
      answers: {},
      claims: [],
      unansweredQuestions: [],
      optOutRequested: false,
      discarded: [],
      // Nothing was said, so there is nothing of the agent's to audit.
      spokenFindings: [],
    };
  }

  // What the agent said, against what it was allowed to say. Run before the
  // disposition is settled so a finding can hold the call open.
  const spokenFindings = auditAgentSpeech({
    turns,
    approvedTexts: args.approvedTexts ?? [],
  });

  // 2. An opt-out outranks whatever else was said. Honour it and stop.
  const optOutRequested = readString(structured, 'opt_out_requested') === 'yes';

  // 3. Collect the questions the agent could not answer. These are the point
  //    of the call as much as the answers are: they tell the institute what
  //    its fact sheet is missing.
  const rawUnanswered = structured.unanswered_questions;
  if (Array.isArray(rawUnanswered)) {
    for (const item of rawUnanswered) {
      if (item && typeof item === 'object' && 'quote' in item) {
        const quote = String((item as { quote: unknown }).quote ?? '').trim();
        if (quote.length === 0) continue;
        const turn = quoteIsGrounded(quote, turns);
        unansweredQuestions.push({
          contactId,
          callId,
          quote,
          offsetSeconds: turn?.offset_seconds ?? 0,
          reason: 'outside-fact-sheet',
        });
      }
    }
  }

  // 4. Identity. Talking to the wrong person means nothing said is usable,
  //    however confident the agent sounds about it.
  const identity = readString(structured, 'identity_confirmed') ?? 'unknown';
  if (identity !== 'yes') {
    reasons.push(
      `Identity was not confirmed (identity_confirmed = "${identity}"). ` +
        'Nothing said on this call can be attributed to the intended recipient.',
    );
  }

  // 5. Each question, against the transcript.
  const evidence =
    (structured.evidence_quotes as Record<string, unknown> | undefined) ?? {};

  for (const question of action.questions) {
    const reported = readString(structured, question.id);

    if (reported === undefined || reported === 'unknown') {
      // Not a failure. A person who did not say is a real, recordable state.
      answers[question.id] = 'unknown';
      continue;
    }

    if (!question.answers.includes(reported)) {
      discarded.push({
        questionId: question.id,
        reported,
        reason: 'Value is outside the allowed answers for this question.',
      });
      reasons.push(`${question.id} came back as "${reported}", which is not an allowed answer.`);
      answers[question.id] = 'unknown';
      continue;
    }

    if (question.requiresEvidence) {
      const quote = typeof evidence[question.id] === 'string'
        ? String(evidence[question.id]).trim()
        : '';

      if (quote.length === 0) {
        discarded.push({
          questionId: question.id,
          reported,
          reason: 'No supporting quote was returned for a question that requires evidence.',
        });
        reasons.push(`${question.id} has no supporting quote.`);
        answers[question.id] = 'unknown';
        continue;
      }

      const turn = quoteIsGrounded(quote, turns);
      if (!turn) {
        // The most important check in this file: the agent reported a quote
        // that nobody on the far end actually said.
        discarded.push({
          questionId: question.id,
          reported,
          reason:
            'The supporting quote does not appear in any turn the recipient spoke.',
        });
        reasons.push(
          `${question.id} is not grounded: its quote was not spoken by the recipient.`,
        );
        answers[question.id] = 'unknown';
        continue;
      }

      if (question.claimAnswers?.includes(reported)) {
        claims.push({
          questionId: question.id,
          statedValue: reported,
          quote,
          offsetSeconds: turn.offset_seconds,
          confirmed: false,
        });
      }
      answers[question.id] = reported;
      continue;
    }

    // No evidence demanded. Still record a claim if the answer is one.
    if (question.claimAnswers?.includes(reported)) {
      const quote = typeof evidence[question.id] === 'string'
        ? String(evidence[question.id]).trim()
        : '';
      const turn = quote ? quoteIsGrounded(quote, turns) : undefined;
      claims.push({
        questionId: question.id,
        statedValue: reported,
        quote,
        offsetSeconds: turn?.offset_seconds ?? 0,
        confirmed: false,
      });
    }
    answers[question.id] = reported;
  }

  // 6. Anything the agent said without approval holds the call open. A parent
  //    quoted a fee nobody signed off needs a person to look, whatever the
  //    parent then answered.
  for (const finding of spokenFindings) {
    reasons.push(describeFinding(finding));
  }

  // 7. Settle the disposition.
  let disposition: Disposition;
  if (optOutRequested) {
    // Permanent, and it outranks everything else the call produced.
    disposition = 'opted-out';
  } else if (reasons.length > 0) {
    disposition = 'needs-human';
  } else if (unansweredQuestions.length > 0) {
    // The call went fine, but somebody is waiting on an answer. That is work
    // for a person, so it does not silently close.
    disposition = 'needs-human';
    reasons.push(
      `${unansweredQuestions.length} question(s) need an answer from the office.`,
    );
  } else {
    disposition = 'answered';
  }

  return {
    disposition,
    reasons,
    answers,
    claims,
    unansweredQuestions,
    optOutRequested,
    discarded,
    spokenFindings,
  };
}
