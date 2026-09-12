/**
 * Everything that can stop a call, in one place.
 *
 * The guard runs before a plan is built, never after. A refusal is a typed
 * result with a reason, not a thrown error and never a silent no-op: an
 * operator looking at a run that dialled nobody must be able to see why for
 * each person.
 *
 * The guard is fail-closed throughout. Missing configuration refuses; it does
 * not fall through to permitting a call. This is stricter than the CALL-E
 * maintainers' own `plugins/zapier-calle/lib/calling-window.js`, which treats
 * a supplied timezone as an opt-in and enforces nothing without one. That is
 * right for a generic connector where the author may have their own controls.
 * DeskHelp is an institute-facing product placing calls to guardians and
 * minors, so an unconfigured institute must not be able to dial at all.
 */

import type {
  ActionDefinition,
  Contact,
  Institute,
  RefusalReason,
} from './types.ts';

export interface Refusal {
  readonly allowed: false;
  readonly reason: RefusalReason;
  /** Human-readable, safe to show an operator. Never contains a full number. */
  readonly detail: string;
}

export interface Allowed {
  readonly allowed: true;
  /**
   * Things an operator should see before going live. A warning never stops a
   * dry run, and every warning here becomes a refusal in live mode.
   */
  readonly warnings: readonly string[];
}

export type GuardResult = Allowed | Refusal;

/**
 * Whether this decision is about a call that will actually be placed.
 *
 * The distinction exists for one check. The destination allow list is a rail
 * for live calling: during development and demos it is the thing standing
 * between a bad spreadsheet import and a stranger's phone ringing. But an
 * institute previewing a run across five hundred students is not going to
 * maintain a five-hundred-entry allow list, and a preview where every row
 * reads "destination not allowed" tells them nothing.
 *
 * So in `dry-run` the allow list produces a warning rather than a refusal.
 * Nothing dials in a dry run, and the operator still sees exactly which rows
 * would be blocked when they go live.
 *
 * Every other check applies identically in both modes, because consent,
 * do-not-call, calling hours and contact frequency are policy rather than
 * plumbing, and a preview that hid them would be lying about the run.
 */
export type CallMode = 'live' | 'dry-run';

const refuse = (reason: RefusalReason, detail: string): Refusal => ({
  allowed: false,
  reason,
  detail,
});

/**
 * Calling rules per jurisdiction, keyed by the code the operator **declares**.
 * Never keyed by a phone number's country code — see `CLAUDE.md` rule 3 and
 * the CALL-E repo's design principles 3 and 4.
 *
 * Hours are local to the declared timezone, inclusive of `earliestHour` and
 * exclusive of `latestHour`.
 */
export interface JurisdictionRules {
  readonly code: string;
  readonly earliestHour: number;
  readonly latestHour: number;
  /** Short note shown in the UI so an operator knows what is being enforced. */
  readonly basis: string;
}

export const JURISDICTIONS: Readonly<Record<string, JurisdictionRules>> = {
  IN: {
    code: 'IN',
    earliestHour: 9,
    latestHour: 21,
    basis:
      'TRAI TCCCPR restricts commercial voice calls to 09:00-21:00 local time.',
  },
  // Deliberately conservative default for anywhere not yet researched. An
  // operator in an unlisted jurisdiction must add rules explicitly rather than
  // inherit a guess.
  DEFAULT: {
    code: 'DEFAULT',
    earliestHour: 9,
    latestHour: 20,
    basis:
      'No jurisdiction-specific rules configured; a conservative 09:00-20:00 window applies.',
  },
};

export interface GuardInput {
  readonly action: ActionDefinition;
  readonly contact: Contact;
  readonly institute: Institute;
  /** When this contact was last called by this action. Undefined if never. */
  readonly lastContactedAt?: Date;
  /**
   * For cascade actions: whether an earlier contact in the ordered list has
   * already accepted. Once one substitute says yes, the rest must not be
   * called, because two acceptances are worse than none.
   */
  readonly cascadeSatisfied?: boolean;
  /**
   * Whether this contact has opted out on any previous call, from any action,
   * in any period. Supplied by the caller from `Ledger.isSuppressed`, which is
   * the one place that fact is stored.
   */
  readonly suppressed?: boolean;
  /**
   * Whether this call will actually be placed. Defaults to `live`, so a
   * caller that forgets to say gets the stricter behaviour.
   */
  readonly mode?: CallMode;
  /** Injected so tests are deterministic. */
  readonly now: Date;
}

/**
 * E.164: a leading "+", a non-zero first digit, then 7 to 14 more digits.
 *
 * Deliberately strict and never repairing. A number written as "98765 43210"
 * or "098765 43210" is rejected at import so a person fixes it, rather than
 * silently normalised into a guess about which country it belongs to.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidE164(phone: string): boolean {
  return E164.test(phone);
}

/**
 * Masks a number for display and logs. Keeps the country prefix and the last
 * two digits, which is enough for an operator to recognise a row they are
 * looking at and not enough to dial from a screenshot.
 *
 *   +919876543210  ->  +91•••••••10
 */
export function maskPhone(phone: string): string {
  if (!isValidE164(phone)) return '•••invalid•••';
  const prefix = phone.slice(0, 3);
  const tail = phone.slice(-2);
  return `${prefix}${'•'.repeat(Math.max(0, phone.length - 5))}${tail}`;
}

/** Rejects raw UTC offsets such as "+05:30", "UTC+7", "GMT-5". */
const RAW_UTC_OFFSET = /^(UTC|GMT)?\s*[+-]\d{1,2}(:\d{2})?$/i;

function isUsableTimezone(timezone: string): boolean {
  if (!timezone || RAW_UTC_OFFSET.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The local hour in a timezone, 0-23.
 *
 * Some runtimes report midnight as hour 24 under `hour12: false`; that is
 * normalised here rather than left to surprise a caller at 00:30.
 */
function localHourIn(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(at);

  const raw = Number(parts.find((part) => part.type === 'hour')?.value);
  return raw === 24 ? 0 : raw;
}

export function rulesFor(jurisdiction: string): JurisdictionRules {
  return JURISDICTIONS[jurisdiction] ?? FALLBACK_RULES;
}

/** Named separately so the lookup above cannot resolve to undefined. */
const FALLBACK_RULES: JurisdictionRules = {
  code: 'DEFAULT',
  earliestHour: 9,
  latestHour: 20,
  basis:
    'No jurisdiction-specific rules configured; a conservative 09:00-20:00 window applies.',
};

/**
 * Decides whether one call to one contact may be placed right now.
 *
 * Checks run cheapest-and-most-absolute first, so the reason an operator sees
 * is the most fundamental one. A contact who has withdrawn consent is reported
 * as such even if the call would also have been outside the calling window.
 */
export function guard(input: GuardInput): GuardResult {
  const { action, contact, institute, now } = input;
  const mode: CallMode = input.mode ?? 'live';
  const warnings: string[] = [];

  // 1. A person's own decision outranks everything, permanently.
  if (contact.doNotCall) {
    return refuse('do-not-call', 'This contact is on the do-not-call list.');
  }

  // 2. An opt-out earned on a previous call, from any action, in any period.
  //    Read from the suppression list rather than from the contact record,
  //    because a spreadsheet re-import would otherwise quietly revive it.
  if (input.suppressed) {
    return refuse(
      'contact-suppressed',
      'This contact asked on a previous call not to be contacted again.',
    );
  }

  // 3. No consent, no call. Absence of a recorded yes is a no.
  if (!contact.consent) {
    return refuse(
      'no-consent',
      'No recorded consent for this contact to be called by the institute.',
    );
  }

  // 3. A number we cannot parse is never repaired into one we can.
  if (!isValidE164(contact.phone)) {
    return refuse(
      'invalid-phone',
      'Phone number is not valid E.164. Fix it at import; it will not be guessed.',
    );
  }

  // 4. Cascades stop the moment somebody accepts.
  if (action.cascade && input.cascadeSatisfied) {
    return refuse(
      'cascade-already-satisfied',
      'An earlier contact in this cascade already accepted.',
    );
  }

  // 5. The destination allow list. This is what stands between a bug in a
  //    spreadsheet import and a real stranger's phone ringing. It blocks in
  //    live mode and warns in a dry run, where nothing dials — see CallMode.
  if (!institute.allowedDestinations.includes(contact.phone)) {
    if (mode === 'live') {
      return refuse(
        'destination-not-allowed',
        `${maskPhone(contact.phone)} is not on the allowed-destinations list.`,
      );
    }
    warnings.push(
      `${maskPhone(contact.phone)} is not on the allowed-destinations list and ` +
        'would be refused in live mode.',
    );
  }

  // 6. Contact frequency, so a scheduler misfire cannot become harassment.
  if (input.lastContactedAt) {
    const hoursSince =
      (now.getTime() - input.lastContactedAt.getTime()) / 3_600_000;
    if (hoursSince < action.minHoursBetweenContacts) {
      return refuse(
        'contacted-too-recently',
        `Last contacted ${hoursSince.toFixed(1)}h ago; this action requires ` +
          `${action.minHoursBetweenContacts}h between calls.`,
      );
    }
  }

  // 7. The calling window, in the timezone the institute declared.
  if (!isUsableTimezone(institute.timezone)) {
    return refuse(
      'outside-calling-window',
      `"${institute.timezone}" is not a usable IANA timezone name. ` +
        'Declare one, e.g. "Asia/Kolkata". It is never inferred from a phone number.',
    );
  }

  const rules = rulesFor(institute.jurisdiction);
  const hour = localHourIn(institute.timezone, now);

  if (hour < rules.earliestHour || hour >= rules.latestHour) {
    return refuse(
      'outside-calling-window',
      `Local time in ${institute.timezone} is ${String(hour).padStart(2, '0')}:xx. ` +
        `Calling window is ${rules.earliestHour}:00-${rules.latestHour}:00. ${rules.basis}`,
    );
  }

  return { allowed: true, warnings };
}
