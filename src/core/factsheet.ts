/**
 * The fact sheet is the only thing the agent is allowed to say.
 *
 * Everything a caller might be asked about — fees, timings, syllabus, refund
 * policy — has to be written down and approved by a named person before the
 * agent can repeat it. Anything not written down is not improvised: it is
 * captured verbatim and handed to a human.
 *
 * Two properties make this hold up after the fact:
 *
 *   Versioning. A call records the version that was live when it was planned.
 *   An institute that edits its fee wording on Tuesday cannot retroactively
 *   change what the agent is understood to have said on Monday.
 *
 *   Action scoping. Approving wording for one workflow does not release it to
 *   every workflow. A fee figure approved for the admissions enquiry call is
 *   not automatically available on an attendance call to a guardian.
 */

import type {
  ActionDefinition,
  FactSheet,
  FactSheetEntry,
  SpokenRegister,
} from './types.ts';

/** A fact sheet that failed validation, with every problem listed at once. */
export class FactSheetInvalid extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Fact sheet is not usable:\n  - ${problems.join('\n  - ')}`);
    this.name = 'FactSheetInvalid';
    this.problems = problems;
  }
}

/**
 * The subset of a fact sheet one action may draw on, pinned to the version it
 * was taken from. This is what gets rendered into a call's task text and what
 * gets stored alongside the call record.
 */
export interface ApprovedAnswers {
  readonly instituteId: string;
  readonly factSheetVersion: number;
  readonly register: SpokenRegister;
  readonly entries: readonly {
    readonly id: string;
    readonly topic: string;
    readonly wording: string;
  }[];
  /**
   * Topics the action declares it needs but which the fact sheet has no
   * approved wording for in this register. Not an error — the agent simply
   * cannot speak to them and will route them to a human — but the operator
   * should see the gap before the calls go out.
   */
  readonly missingTopics: readonly string[];
}

/**
 * Checks a fact sheet is internally coherent. Called on load and before any
 * run, because a malformed fact sheet must fail loudly at setup rather than
 * silently produce an agent with nothing to say.
 */
export function validateFactSheet(sheet: FactSheet): void {
  const problems: string[] = [];

  if (!sheet.instituteId?.trim()) {
    problems.push('instituteId is empty');
  }
  if (!Number.isInteger(sheet.version) || sheet.version < 1) {
    problems.push(`version must be a positive integer, got ${sheet.version}`);
  }
  if (!sheet.approvedBy?.trim()) {
    // Approval is attributed to a person on purpose. Wording nobody will put
    // their name to is wording nobody should be repeating down a phone line.
    problems.push('approvedBy is empty: approved wording needs a named approver');
  }
  if (Number.isNaN(Date.parse(sheet.approvedAt ?? ''))) {
    problems.push(`approvedAt is not a parseable date: ${sheet.approvedAt}`);
  }

  const seenIds = new Set<string>();
  for (const entry of sheet.entries) {
    if (!entry.id?.trim()) {
      problems.push('an entry has an empty id');
      continue;
    }
    if (seenIds.has(entry.id)) {
      problems.push(`duplicate entry id: ${entry.id}`);
    }
    seenIds.add(entry.id);

    if (!entry.topic?.trim()) {
      problems.push(`entry ${entry.id} has an empty topic`);
    }

    const registers = Object.entries(entry.wording).filter(
      ([, text]) => typeof text === 'string' && text.trim().length > 0,
    );
    if (registers.length === 0) {
      problems.push(`entry ${entry.id} has no approved wording in any register`);
    }
  }

  if (problems.length > 0) {
    throw new FactSheetInvalid(problems);
  }
}

/**
 * Resolves the wording for one entry in one register.
 *
 * Falls back only along a deliberate path, and never invents a translation:
 *
 *   hi-en -> hi -> en    A code-switched call can fall back to plain Hindi,
 *                        then to English. All three are languages the
 *                        institute approved text in.
 *   hi    -> en
 *   ta    -> en
 *   en    -> (nothing)
 *
 * If nothing on that path is approved, the answer is absent. The agent then
 * treats the topic as outside the fact sheet and routes it to a person, which
 * is the correct outcome: a missing translation is not a licence to improvise
 * one mid-call.
 */
function resolveWording(
  entry: FactSheetEntry,
  register: SpokenRegister,
): string | undefined {
  const fallbackPath: Record<SpokenRegister, readonly SpokenRegister[]> = {
    'hi-en': ['hi-en', 'hi', 'en'],
    hi: ['hi', 'en'],
    ta: ['ta', 'en'],
    en: ['en'],
  };

  for (const candidate of fallbackPath[register]) {
    const text = entry.wording[candidate];
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim();
    }
  }
  return undefined;
}

/**
 * Selects what one action may say, in one register, from one version of the
 * fact sheet.
 *
 * The `factSheetTopics` on the ActionDefinition are the whole authorisation.
 * An entry the institute approved but did not attach to this action is not
 * returned, and the agent will never see it.
 */
export function approvedAnswersFor(
  sheet: FactSheet,
  action: ActionDefinition,
  register: SpokenRegister,
): ApprovedAnswers {
  validateFactSheet(sheet);

  const allowedTopics = new Set(action.factSheetTopics);
  const entries: { id: string; topic: string; wording: string }[] = [];
  const coveredTopics = new Set<string>();

  for (const entry of sheet.entries) {
    if (!allowedTopics.has(entry.topic)) continue;

    const wording = resolveWording(entry, register);
    if (wording === undefined) continue;

    entries.push({ id: entry.id, topic: entry.topic, wording });
    coveredTopics.add(entry.topic);
  }

  const missingTopics = action.factSheetTopics.filter(
    (topic) => !coveredTopics.has(topic),
  );

  return {
    instituteId: sheet.instituteId,
    factSheetVersion: sheet.version,
    register,
    // Stable order, so two runs of the same action produce identical task text
    // and therefore identical idempotency behaviour.
    entries: entries.slice().sort((a, b) => a.id.localeCompare(b.id)),
    missingTopics,
  };
}

/**
 * Checks whether something the agent said on a completed call was actually
 * approved wording at the time of the call.
 *
 * This establishes provenance, not truth: a match proves the sentence came
 * from the fact sheet, not that the fact sheet is correct. It is used to flag
 * the case that matters — the agent volunteering a fee, a date or a promise
 * that nobody approved.
 */
export function isApprovedStatement(
  approved: ApprovedAnswers,
  spoken: string,
): boolean {
  const normalise = (text: string) =>
    text
      .toLowerCase()
      .replace(/[\s ]+/g, ' ')
      // Strip punctuation that speech-to-text adds or drops inconsistently,
      // while leaving digits and letters (including Devanagari and Tamil)
      // untouched.
      .replace(/[.,!?;:'"()\-‐-―‘-‟]/g, '')
      .trim();

  const spokenNormalised = normalise(spoken);
  if (spokenNormalised.length === 0) return false;

  return approved.entries.some((entry) =>
    spokenNormalised.includes(normalise(entry.wording)),
  );
}
