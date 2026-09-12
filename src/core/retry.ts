/**
 * Whether an authorisation may be attempted again, and under what key.
 *
 * DeskHelp never inherits the provider's retry. CALL-E will, on some outcomes,
 * offer to ring again shortly; the CALL-E maintainers documented in
 * `docs/adr/0006-a-refusal-is-not-a-missed-call.md` why accepting that offer is
 * wrong, after a live call where the recipient hung up because the call felt
 * like a scam and the platform proposed a redial.
 *
 * The rule this file enforces:
 *
 *   Exactly one disposition is retryable — `unreached`. Nobody picked up, or
 *   it went to voicemail. That is a connectivity outcome.
 *
 *   `declined` is not. Somebody answered and withdrew. Ringing again inverts
 *   the meaning of what they did: the more clearly they refuse, the more we
 *   would call.
 *
 *   `needs-human` is not. An ambiguous call is a question for a person, and
 *   redialling on ambiguity is how one confused conversation becomes three.
 *
 *   `opted-out` is not, ever, in any period.
 *
 *   An outcome we could not classify is not. It reaches a human instead of
 *   being quietly filed as a missed call.
 */

import { RETRYABLE_DISPOSITIONS } from './types.ts';
import type { ActionDefinition, Disposition } from './types.ts';

export interface AttemptRecord {
  readonly attemptNumber: number;
  readonly placedAt: Date;
  readonly disposition: Disposition;
}

export type RetryDecision =
  | {
      readonly retry: true;
      readonly attemptNumber: number;
      /** The key to send CALL-E for this attempt. See note below. */
      readonly calleIdempotencyKey: string;
    }
  | { readonly retry: false; readonly reason: string };

/**
 * The key DeskHelp sends CALL-E, which is NOT the ledger key.
 *
 * The ledger key identifies the authorisation and is what stops a second
 * reservation. But CALL-E dedupes on the `Idempotency-Key` header at its own
 * end, so sending the ledger key again on attempt two would make CALL-E return
 * the original call and place nothing. The retry would silently do nothing.
 *
 * So the attempt number is appended. The key is still derived entirely from
 * the authorisation plus a counter — never from a timestamp or a random value,
 * either of which would defeat deduplication altogether.
 */
export function calleKeyFor(ledgerKey: string, attemptNumber: number): string {
  return `${ledgerKey}-a${attemptNumber}`;
}

export function decideRetry(args: {
  readonly action: ActionDefinition;
  readonly ledgerKey: string;
  readonly attempts: readonly AttemptRecord[];
  readonly now: Date;
}): RetryDecision {
  const { action, ledgerKey, attempts, now } = args;
  const policy = action.retry;

  if (attempts.length === 0) {
    return {
      retry: true,
      attemptNumber: 1,
      calleIdempotencyKey: calleKeyFor(ledgerKey, 1),
    };
  }

  const last = attempts[attempts.length - 1]!;

  // A permanent opt-out ends the matter regardless of counts or gaps.
  if (attempts.some((attempt) => attempt.disposition === 'opted-out')) {
    return {
      retry: false,
      reason: 'The recipient asked not to be contacted again.',
    };
  }

  if (!RETRYABLE_DISPOSITIONS.has(last.disposition)) {
    const explanation: Partial<Record<Disposition, string>> = {
      declined:
        'The recipient answered and ended the call. That is a refusal, not a missed call.',
      'needs-human':
        'The last call was ambiguous. A person decides what happens next, not a redial.',
      answered: 'The call already got its answer.',
      'not-called': 'The last attempt was refused before dialling; fix the refusal first.',
    };
    return {
      retry: false,
      reason:
        explanation[last.disposition] ??
        `Disposition "${last.disposition}" is not retryable.`,
    };
  }

  if (attempts.length >= policy.maxAttempts) {
    return {
      retry: false,
      reason:
        `Already attempted ${attempts.length} time(s); this action allows ` +
        `${policy.maxAttempts}.`,
    };
  }

  const hoursSince = (now.getTime() - last.placedAt.getTime()) / 3_600_000;
  if (hoursSince < policy.minHoursBetweenAttempts) {
    return {
      retry: false,
      reason:
        `Last attempt was ${hoursSince.toFixed(1)}h ago; this action requires ` +
        `${policy.minHoursBetweenAttempts}h between attempts.`,
    };
  }

  const attemptNumber = attempts.length + 1;
  return {
    retry: true,
    attemptNumber,
    calleIdempotencyKey: calleKeyFor(ledgerKey, attemptNumber),
  };
}
