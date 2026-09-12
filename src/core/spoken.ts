/**
 * Checks what the AGENT said, against what it was allowed to say.
 *
 * `disposition.ts` is the other half of this: it checks that a recipient's
 * answer is grounded in words the recipient actually spoke. That stops the
 * agent inventing answers. It does nothing about the agent inventing
 * statements — volunteering a fee, a due date, or a concession that nobody at
 * the institute approved.
 *
 * The pattern comes from `before-we-go`, a merged CALL-E app:
 *
 *   "AI explanations have separate bot-speaker excerpts and must be checked
 *    against the persisted fact sheet."
 *
 * ## Why this does not simply flag everything unapproved
 *
 * An agent legitimately says a great deal that is not in a fact sheet: the
 * greeting, the disclosure, its questions, "I'll have someone confirm that and
 * call you back", the sign-off. A check that flagged any unmatched sentence
 * would fire on every single call and be switched off within a week.
 *
 * So this targets the two things that actually cause harm when unapproved:
 *
 *   1. **A number the agent had no source for.** Amounts, dates, times,
 *      percentages. "Your fee is eight thousand four hundred" spoken to a
 *      parent, when no approved wording contains 8400, is the institute
 *      quoting a price it never signed off. Digits are a good proxy: harmless
 *      agent speech rarely contains them, and the dangerous assertions almost
 *      always do.
 *
 *   2. **Commitment vocabulary.** Discounts, waivers, guarantees. These are
 *      never approved wording in any institute, and an agent that offers one
 *      has made a promise somebody now has to honour or retract.
 *
 * Findings are advisory: they route the call to `needs-human` rather than
 * discarding the recipient's answers, which remain the recipient's regardless
 * of what the agent said around them.
 */

import type { TranscriptTurn } from './disposition.ts';

export interface SpokenFinding {
  readonly kind: 'unsourced-number' | 'prohibited-commitment';
  /** The token or phrase that triggered it. */
  readonly token: string;
  /** The agent's sentence it appeared in, so a reviewer can judge it. */
  readonly quote: string;
  readonly offsetSeconds: number;
}

const AGENT_SPEAKERS = new Set(['bot', 'agent', 'assistant', 'system', 'ai']);

function isAgentTurn(turn: TranscriptTurn): boolean {
  return AGENT_SPEAKERS.has(turn.speaker.trim().toLowerCase());
}

/**
 * Vocabulary an institute's automated caller must never produce.
 *
 * Deliberately short. Every entry is a thing that creates an obligation the
 * institute did not agree to, in English or in the Hinglish an Indian caller
 * would actually use. A longer list would start catching ordinary speech.
 */
const PROHIBITED = [
  'discount',
  'concession',
  'waive',
  'waiver',
  'rebate',
  'i promise',
  'we promise',
  'guarantee',
  'guaranteed',
  'chhoot',
  'chhut',
  'maaf kar',
  'kam kar denge',
  'kam kar dunga',
] as const;

/** Digit runs, which is what a spoken amount, date or time reduces to. */
function numericTokens(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Audits the agent's side of a transcript.
 *
 * `approvedTexts` should carry every string the agent was legitimately given:
 * the approved fact-sheet wording live at plan time, the action's disclosure,
 * its question texts, and the institute's own callback number. Anything the
 * agent was handed is a valid source for a number it then speaks.
 */
export function auditAgentSpeech(args: {
  readonly turns: readonly TranscriptTurn[];
  readonly approvedTexts: readonly string[];
}): SpokenFinding[] {
  const sourcedNumbers = new Set<string>();
  for (const text of args.approvedTexts) {
    for (const token of numericTokens(text)) {
      sourcedNumbers.add(token);
    }
  }

  const findings: SpokenFinding[] = [];

  for (const turn of args.turns) {
    if (!isAgentTurn(turn)) continue;

    const spoken = normalise(turn.text);

    for (const token of numericTokens(turn.text)) {
      // A bare one or two is ordinary speech ("option one", "two things"),
      // and flagging it would bury the findings that matter under noise.
      if (token.length < 3) continue;
      if (sourcedNumbers.has(token)) continue;

      findings.push({
        kind: 'unsourced-number',
        token,
        quote: turn.text,
        offsetSeconds: turn.offset_seconds,
      });
    }

    for (const phrase of PROHIBITED) {
      if (spoken.includes(phrase)) {
        findings.push({
          kind: 'prohibited-commitment',
          token: phrase,
          quote: turn.text,
          offsetSeconds: turn.offset_seconds,
        });
      }
    }
  }

  return findings;
}

/** One line per finding, for the reviewer's queue. */
export function describeFinding(finding: SpokenFinding): string {
  return finding.kind === 'unsourced-number'
    ? `The agent said "${finding.token}", which appears in no approved wording ` +
        `for this call. It said: "${finding.quote}"`
    : `The agent used committing language ("${finding.token}"), which it is ` +
        `never permitted to. It said: "${finding.quote}"`;
}
