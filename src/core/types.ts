/**
 * The domain model every Ghanti workflow is built from.
 *
 * There is one engine. A workflow is not code: it is an ActionDefinition, a
 * declarative description of who is called, what may be said to them, and what
 * a useful answer looks like. Adding the sixteenth workflow is a config file.
 *
 * Two rules are encoded in these types rather than left to each workflow:
 *
 *   1. The agent asks and captures. It never advises, negotiates or commits.
 *      A question the agent cannot answer from the fact sheet becomes an
 *      UnansweredQuestion for a person, not an improvised reply.
 *
 *   2. What a person said is not what is true. A spoken intention is recorded
 *      as a Claim with the words that produced it; it never becomes a fact
 *      about the world. "I will pay tomorrow" does not mark a fee as paid.
 */

/** A language a call can actually be conducted in. */
export type Language = 'en' | 'hi' | 'ta';

/**
 * Indian phone conversations are rarely conducted in one language. `hi-en`
 * is the code-switched register ("kal tak ho jayega, do hazaar") that a
 * caller will actually meet, and it is a first-class choice rather than a
 * degraded form of Hindi.
 */
export type SpokenRegister = 'en' | 'hi' | 'hi-en' | 'ta';

/** Who is on the other end. Determines what may be disclosed. */
export type Audience =
  | 'lead' // an enquirer who is not enrolled
  | 'guardian' // the parent or guardian of an enrolled student
  | 'student' // an adult student, never a minor
  | 'staff'; // a teacher or employee of the institute

/**
 * How sensitive the subject matter is. The engine reads this, not the
 * workflow author's prose, when it decides what a call may disclose.
 */
export type Sensitivity =
  /** Involves a minor. Disclosure is gated behind guardian confirmation. */
  | 'minor-involved'
  /** Involves money owed. The call may remind; it may never collect. */
  | 'financial'
  /** Involves an employment relationship. */
  | 'employment'
  /** Ordinary institute business. */
  | 'routine';

/**
 * A bounded question. The agent asks exactly these and nothing else.
 *
 * `answers` is deliberately a closed set. An open-ended question produces
 * prose that nobody can act on and that cannot be checked against a
 * transcript, so the only free-text capture Ghanti performs is the verbatim
 * quote attached to an answer.
 */
export interface Question {
  /** Stable key. Becomes the field name in the structured result. */
  readonly id: string;
  /** What the agent is trying to find out, in English, for the task text. */
  readonly ask: string;
  /**
   * The permitted answers. `unknown` is always appended by the engine and is
   * a real answer, not a failure: a person who did not say is different from
   * a person who was never reached.
   */
  readonly answers: readonly string[];
  /**
   * When true, an answer is kept only if a turn the recipient actually spoke
   * supports it. Use for anything that costs something if it is wrong.
   */
  readonly requiresEvidence: boolean;
  /**
   * When set, an answer matching one of these values is recorded as a Claim
   * rather than a fact, and routed for human confirmation.
   */
  readonly claimAnswers?: readonly string[];
}

/**
 * A statement the institute has approved the agent to make.
 *
 * The agent may speak these and only these. Everything else it is asked about
 * becomes an UnansweredQuestion. Fact sheets are versioned so that what was
 * said on a call can be checked later against the wording that was live when
 * the call was placed, rather than against whatever the institute has edited
 * since.
 */
export interface FactSheetEntry {
  readonly id: string;
  /** What this entry answers, used to match a recipient's question. */
  readonly topic: string;
  /** The approved wording, per register. */
  readonly wording: Partial<Record<SpokenRegister, string>>;
}

export interface FactSheet {
  readonly instituteId: string;
  /** Monotonic. A call records the version that was live when it was planned. */
  readonly version: number;
  /** Who signed off on this version. Recorded, never spoken. */
  readonly approvedBy: string;
  readonly approvedAt: string; // ISO 8601
  readonly entries: readonly FactSheetEntry[];
}

/**
 * A workflow. Fourteen of these ship with Ghanti; an institute enables the
 * ones it wants and ignores the rest.
 */
export interface ActionDefinition {
  readonly id: string;
  /** Shown in the UI. English, per repository language rules. */
  readonly title: string;
  /** One sentence: the phone work this replaces. */
  readonly purpose: string;
  readonly audience: Audience;
  readonly sensitivity: Sensitivity;
  /**
   * Spoken at the top of every call, before anything else. Names the
   * institute, states that the caller is an automated assistant, and gives
   * the reason for the call.
   */
  readonly disclosure: string;
  readonly questions: readonly Question[];
  /**
   * Topics this action's calls are allowed to draw fact-sheet answers from.
   * A fact sheet entry outside this list is not available to the agent even
   * when the institute has approved it for other calls.
   */
  readonly factSheetTopics: readonly string[];
  /**
   * How often this action may contact the same person, in hours. The engine
   * refuses a second call inside this window regardless of scheduling.
   */
  readonly minHoursBetweenContacts: number;
  /**
   * Whether this action is a cascade: contacts are called one at a time, in
   * order, and the run stops at the first person who accepts. Used where two
   * acceptances would be worse than none, such as filling one substitute slot.
   */
  readonly cascade: boolean;
  /**
   * How many times an unanswered call may be tried again. An action that is
   * time-critical (a child is missing from class) reasonably tries sooner than
   * one that is not (a fee is due next week), so this is per-action rather
   * than global.
   */
  readonly retry: RetryPolicy;
}

/**
 * Everything about the institute that a call depends on.
 *
 * Every field here is **declared by the operator**. Nothing in this object is
 * ever inferred from a phone number, a locale, a language or an IP address.
 */
export interface Institute {
  readonly id: string;
  /** Spoken on every call, in the disclosure. */
  readonly displayName: string;
  /**
   * The number a recipient is asked to call back on. Belongs to the institute,
   * is spoken aloud, and is therefore public by intent.
   */
  readonly callbackNumber: string;
  /** IANA name, e.g. "Asia/Kolkata". Never derived from a phone number. */
  readonly timezone: string;
  /** Jurisdiction code, e.g. "IN". Never derived from a "+91" prefix. */
  readonly jurisdiction: string;
  /**
   * E.164 numbers this installation may dial. There is no wildcard: an empty
   * list means no live call is possible, which is the correct default.
   */
  readonly allowedDestinations: readonly string[];
}

/** A person DeskHelp may call. */
export interface Contact {
  readonly id: string;
  /** Never spoken in full. See `disclosureNameFor`. */
  readonly fullName: string;
  /** E.164. Validated on import, never repaired or guessed. */
  readonly phone: string;
  readonly preferredRegister: SpokenRegister;
  /**
   * Explicit, recorded consent to be called by the institute for this kind of
   * business. Absent consent is not a soft warning: the engine refuses.
   */
  readonly consent: boolean;
  /** Set by a person, honoured forever, never cleared by an import. */
  readonly doNotCall: boolean;
  /** For guardian calls: the student this contact is the guardian of. */
  readonly wardId?: string;
}

/**
 * Why a call was not placed. Every refusal carries one of these, so an
 * operator is never left looking at a silent no-op.
 */
export type RefusalReason =
  | 'no-consent'
  | 'do-not-call'
  /**
   * The contact asked, on a call, not to be contacted again.
   *
   * Distinct from `do-not-call`, which comes from an import. This one is
   * earned during a conversation and must outlive the period, the action and
   * the workflow that produced it: somebody who refuses a fee reminder in
   * September has not consented to an attendance call in October.
   */
  | 'contact-suppressed'
  | 'outside-calling-window'
  | 'destination-not-allowed'
  | 'contacted-too-recently'
  | 'invalid-phone'
  | 'cascade-already-satisfied'
  | 'missing-fact-sheet';

/**
 * What DeskHelp concluded about a call. Deliberately fail-closed: only
 * `answered` is actionable without a person looking at it, and reaching it
 * requires evidence for every question that demanded evidence.
 *
 * `declined` and `unreached` are kept apart on purpose, and the distinction is
 * the whole retry policy. A person who answered and hung up has refused; a
 * person whose phone rang out has not been reached. Collapsing the two means
 * the more clearly somebody refuses, the more often they get rung — which is
 * the failure the CALL-E maintainers documented in
 * `docs/adr/0006-a-refusal-is-not-a-missed-call.md` after their first live call.
 */
export type Disposition =
  | 'answered' // reached, every required answer evidenced
  | 'needs-human' // reached, but something must be decided by a person
  | 'unreached' // nobody picked up, or voicemail — retryable
  | 'declined' // answered, then withdrew. A refusal, never a missed call
  | 'opted-out' // asked not to be contacted again. Permanent
  | 'not-called'; // a RefusalReason stopped it before dialling

/** Dispositions a bounded automatic retry may follow. Exactly one. */
export const RETRYABLE_DISPOSITIONS: ReadonlySet<Disposition> = new Set<Disposition>([
  'unreached',
]);

/**
 * How many times one authorisation may be attempted, and how far apart.
 *
 * Defaults follow the CALL-E maintainers' own `plugins/zapier-calle/lib/
 * retry-policy.js`, which describes 2 per day, 4 hours apart as "the
 * conservative end of common practice" rather than a citable constant.
 *
 * The provider's own retry offer is never inherited. A platform that proposes
 * ringing again in forty-five minutes is answering a different question from
 * the one the institute authorised.
 */
export interface RetryPolicy {
  /** Total attempts allowed for one authorisation, including the first. */
  readonly maxAttempts: number;
  readonly minHoursBetweenAttempts: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 2,
  minHoursBetweenAttempts: 4,
};

/**
 * A spoken intention. Kept separate from fact for the whole life of the
 * record. A Claim is evidence that somebody said something, and nothing more.
 */
export interface Claim {
  readonly questionId: string;
  readonly statedValue: string;
  /** The recipient's own words, verbatim, that produced `statedValue`. */
  readonly quote: string;
  /** Offset into the call, so the quote can be found in the transcript. */
  readonly offsetSeconds: number;
  /** Always false on creation. Only a person, or a system of record, sets it. */
  readonly confirmed: false;
}

/**
 * A question a caller asked, that a person at the institute has since
 * answered.
 *
 * This is what makes capturing a question worth doing. On the first call the
 * agent says "I'll have someone confirm that"; a human writes the answer in
 * the review queue; on the next call to that same person, the agent may
 * finally deliver it. Without this, every captured question is a dead end.
 *
 * The answer is approved wording like any other: written by a named person,
 * spoken verbatim, and never paraphrased or extended by the agent.
 */
export interface ResolvedQuestion {
  /** The caller's original words, so the agent can recognise the topic. */
  readonly originalQuote: string;
  /** Approved wording. Spoken as given. */
  readonly answer: string;
  readonly resolvedBy: string;
  readonly resolvedAt: string; // ISO 8601
}

/**
 * What a previous call to this same contact established.
 *
 * Only ever assembled from that contact's own calls. Nothing from another
 * person's call can enter here, and the engine has a test for it.
 */
export interface PriorCall {
  readonly callId: string;
  /**
   * Whose call this was. Carried on the record itself rather than left to the
   * caller to filter correctly, so the renderer can refuse a set that mixes
   * contacts. One wrong variable at the assembly layer would otherwise read
   * another family's answers down the phone.
   */
  readonly contactId: string;
  readonly actionId: string;
  readonly placedAt: string; // ISO 8601
  readonly disposition: Disposition;
  /** Answers that survived the evidence check. Never the discarded ones. */
  readonly answers: Readonly<Record<string, string>>;
  /** Things they said they would do. Still not facts. */
  readonly claims: readonly Claim[];
  /** Questions they asked that a person has since answered. */
  readonly resolvedQuestions: readonly ResolvedQuestion[];
}

/** A question the agent could not answer, routed to a person. */
export interface UnansweredQuestion {
  readonly contactId: string;
  readonly callId: string;
  /** What the recipient asked, verbatim. */
  readonly quote: string;
  readonly offsetSeconds: number;
  /** Why it was not answered: no approved wording covered it. */
  readonly reason: 'outside-fact-sheet' | 'outside-action-topics';
}
