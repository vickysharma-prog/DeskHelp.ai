/**
 * Carries what happened on earlier calls into the next one.
 *
 * A front-office person who rings the same parent twice does not start from
 * nothing the second time. They remember that the parent said they would pay
 * by Friday, and they remember the parent asked about the scholarship and was
 * promised an answer. An automated caller that forgets both is worse than the
 * person it replaces, and sounds it.
 *
 * Three rules keep this from becoming a leak:
 *
 *   1. **Nothing is recalled before identity is confirmed.** The prior-context
 *      block is placed after the identity gate in the task text, and says so
 *      in its own first line. Recalling "you said you'd pay on Friday" to
 *      whoever happened to pick up would disclose a family's finances to a
 *      stranger.
 *
 *   2. **A claim stays a claim forever.** "You said you would pay by Friday"
 *      is a true sentence; "your payment was due Friday and you did not pay"
 *      is not one the call can make. The agent is told to ASK whether the
 *      thing happened, never to assert that it did or did not.
 *
 *   3. **The world is closed.** Only answers that survived the evidence check,
 *      claims, and questions a named person has answered are carried forward.
 *      The agent is told explicitly not to refer to anything else from earlier
 *      calls, because a model given a transcript will otherwise quote from it.
 */

import type { ActionDefinition, PriorCall } from './types.ts';

/**
 * How many earlier calls to carry. Beyond a few, the task text grows without
 * helping: the agent needs the last thing that was said, not a biography.
 */
export const DEFAULT_HISTORY_DEPTH = 3;

export interface PriorContext {
  /** Empty when there is nothing to carry. */
  readonly block: string;
  readonly callsReferenced: number;
  readonly resolvedQuestionsDelivered: number;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an earlier date';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Builds the block of earlier context for one contact's next call.
 *
 * `priorCalls` must already be filtered to this contact. Passing another
 * contact's calls is a programming error the caller must not make; the engine
 * cannot detect it from the data alone, so the assembling layer is where the
 * filtering lives, and it is tested there.
 */
export function buildPriorContext(args: {
  readonly action: ActionDefinition;
  readonly priorCalls: readonly PriorCall[];
  readonly depth?: number;
}): PriorContext {
  const depth = args.depth ?? DEFAULT_HISTORY_DEPTH;

  // Most recent first, bounded, and only calls that actually reached somebody.
  // A call nobody answered has nothing to recall and mentioning it would be
  // odd: "last time you didn't pick up" is not a useful opening.
  const usable = args.priorCalls
    .filter((call) => call.disposition === 'answered' || call.disposition === 'needs-human')
    // A call that established nothing has nothing to recall. Opening with
    // "we spoke on the 28th" and then saying nothing about it is noise that
    // makes the agent sound like it is fishing, and it wastes the recipient's
    // patience on a sentence that carries no information.
    .filter(
      (call) =>
        Object.values(call.answers).some((value) => value && value !== 'unknown') ||
        call.claims.length > 0 ||
        call.resolvedQuestions.length > 0,
    )
    .slice()
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))
    .slice(0, depth);

  if (usable.length === 0) {
    return { block: '', callsReferenced: 0, resolvedQuestionsDelivered: 0 };
  }

  const lines: string[] = [
    'WHAT YOU ALREADY KNOW FROM EARLIER CALLS',
    '',
    'Do not mention ANY of this until the identity gate above has passed.',
    'If somebody else answered, none of it may be said at all.',
    '',
  ];

  let resolvedCount = 0;

  for (const call of usable) {
    const when = formatDate(call.placedAt);
    const parts: string[] = [`On ${when} you spoke to this person.`];

    const answered = Object.entries(call.answers).filter(
      ([, value]) => value && value !== 'unknown',
    );
    if (answered.length > 0) {
      parts.push('  They told you:');
      for (const [questionId, value] of answered) {
        parts.push(`    - ${questionId}: ${value}`);
      }
    }

    for (const claim of call.claims) {
      parts.push(
        `  They SAID they would: ${claim.statedValue} (${claim.questionId}).`,
        `    Their words: "${claim.quote}"`,
        '    This is something they said, not something that happened. You may',
        '    ask whether it has been done. You must NOT state that it was, or',
        '    that it was not, and you must not tell them they failed to do it.',
      );
    }

    for (const resolved of call.resolvedQuestions) {
      resolvedCount += 1;
      parts.push(
        `  They asked: "${resolved.originalQuote}"`,
        '    The office has since answered. If they raise it again, or if it',
        '    fits naturally, you may now say exactly this and nothing more:',
        `    "${resolved.answer}"`,
      );
    }

    lines.push(parts.join('\n'), '');
  }

  lines.push(
    'Do not refer to anything from earlier calls other than what is listed',
    'above. If they mention something you have no record of, treat it as a new',
    'question and capture it.',
  );

  return {
    block: lines.join('\n'),
    callsReferenced: usable.length,
    resolvedQuestionsDelivered: resolvedCount,
  };
}

/**
 * Selects one contact's prior calls from a larger set.
 *
 * Exists so the filtering happens in exactly one place and can be tested. A
 * history block assembled from the wrong contact's calls would read another
 * family's answers down the phone.
 */
export function priorCallsForContact(
  allCalls: readonly PriorCall[],
  contactId: string,
): PriorCall[] {
  return allCalls.filter((call) => call.contactId === contactId);
}
