/**
 * Turns an action, a contact and an approved fact sheet into the two things
 * CALL-E needs: the task text the agent follows, and the result schema its
 * answer must validate against.
 *
 * This file is where the product's central rule becomes a concrete instruction
 * to a model: **the agent asks and captures; it never answers, advises or
 * commits.** Every prohibition below exists because the alternative is an
 * automated caller improvising a fee, a discount or a promise on behalf of an
 * institute that never approved it.
 *
 * The task text is deliberately blunt and repetitive. It is read by a model
 * mid-conversation, not by a person at leisure.
 */

import { approvedAnswersFor } from './factsheet.ts';
import { maskPhone } from './guard.ts';
import { buildPriorContext } from './history.ts';
import type {
  ActionDefinition,
  Contact,
  FactSheet,
  Institute,
  PriorCall,
  Question,
  SpokenRegister,
} from './types.ts';

/** A JSON Schema object, as CALL-E's `recipient_result_schema` expects. */
export interface JsonSchema {
  readonly type: 'object';
  readonly required: readonly string[];
  readonly properties: Record<string, unknown>;
  readonly additionalProperties: false;
}

export interface RenderedCall {
  /** Sent to CALL-E as `task`. */
  readonly taskText: string;
  /** Sent to CALL-E as `recipient_result_schema`. */
  readonly resultSchema: JsonSchema;
  /** Pinned so the call record says which wording was live at plan time. */
  readonly factSheetVersion: number;
  readonly register: SpokenRegister;
  /** Topics the action wanted but the fact sheet does not cover. */
  readonly missingTopics: readonly string[];
  /** Masked destination, safe for previews, logs and screenshots. */
  readonly maskedDestination: string;
  /**
   * Every string the agent was legitimately handed for this call.
   *
   * Returned here so the caller passes it straight to `judge()` rather than
   * reconstructing it, which is how the agent-speech audit ends up switched
   * off in practice: a check nobody can conveniently feed is a check nobody
   * feeds.
   */
  readonly approvedTexts: readonly string[];
  /** How many earlier calls this one carries context from. */
  readonly priorCallsReferenced: number;
  /**
   * Questions captured on an earlier call that a person has since answered,
   * and that this call is now able to deliver.
   */
  readonly resolvedQuestionsDelivered: number;
}

/**
 * How the call should be conducted, per register.
 *
 * `hi-en` is not a fallback or a degraded Hindi. It is the register most
 * Indian phone conversations actually happen in, and instructing the agent to
 * follow the recipient's own mix produces a call that sounds like a colleague
 * rather than a translation.
 */
const REGISTER_INSTRUCTION: Record<SpokenRegister, string> = {
  en: 'Conduct the call in English.',
  hi: 'Conduct the call in Hindi.',
  ta: 'Conduct the call in Tamil.',
  'hi-en':
    'Conduct the call in the natural mix of Hindi and English that Indian ' +
    'speakers use on the phone. Follow the recipient: if they answer in ' +
    'English, continue in English; if they answer in Hindi, continue in ' +
    'Hindi; if they mix, mix. Do not correct their language or insist on one.',
};

/** Appended to every question's answer set. Absence of an answer is data. */
const UNKNOWN = 'unknown';

function questionFieldSchema(question: Question): Record<string, unknown> {
  return {
    type: 'string',
    enum: [...question.answers, UNKNOWN],
    description: question.ask,
  };
}

/**
 * Builds the structured result CALL-E must return.
 *
 * Beyond the action's own questions, every call carries four fields that exist
 * so an ambiguous outcome cannot be quietly read as a good one:
 *
 *   `identity_confirmed`     did the right person actually answer
 *   `unanswered_questions`   what the agent was asked and could not answer
 *   `opt_out_requested`      did they ask not to be called again
 *   `evidence_quotes`        the recipient's own words behind each answer
 */
export function buildResultSchema(action: ActionDefinition): JsonSchema {
  const properties: Record<string, unknown> = {
    identity_confirmed: {
      type: 'string',
      enum: ['yes', 'no', UNKNOWN],
      description:
        'Did the person who answered confirm they are the intended recipient?',
    },
    opt_out_requested: {
      type: 'string',
      enum: ['yes', 'no'],
      description:
        'Did the recipient ask not to be contacted again? Record yes even if ' +
        'they said it in passing.',
    },
    unanswered_questions: {
      type: 'array',
      description:
        'Every question the recipient asked that you could not answer from ' +
        'the approved statements. Quote them word for word.',
      items: {
        type: 'object',
        required: ['quote'],
        properties: {
          quote: {
            type: 'string',
            description: "The recipient's exact words.",
          },
        },
        additionalProperties: false,
      },
    },
  };

  // One named slot per question that demands evidence, rather than a map
  // keyed by anything. CALL-E rejects an open object outright, and the closed
  // form is better regardless: a quote filed under a question that does not
  // exist is a quote nothing will ever check.
  const evidenced = action.questions.filter((question) => question.requiresEvidence);
  if (evidenced.length > 0) {
    properties.evidence_quotes = {
      type: 'object',
      description:
        'For each answered question below, the recipient\'s own words that ' +
        'support the answer. Omit a key rather than invent a quote for it.',
      properties: Object.fromEntries(
        evidenced.map((question) => [
          question.id,
          { type: 'string', description: `What they said that supports ${question.id}.` },
        ]),
      ),
      additionalProperties: false,
    };
  }

  for (const question of action.questions) {
    properties[question.id] = questionFieldSchema(question);
  }

  return {
    type: 'object',
    // Only the always-present fields are required. A question left out
    // because the call ended early must not fail schema validation and lose
    // the transcript along with it.
    required: ['identity_confirmed', 'opt_out_requested', 'unanswered_questions'],
    properties,
    additionalProperties: false,
  };
}

/**
 * The identity gate for calls that concern a minor.
 *
 * Adapted from the pattern the CALL-E maintainers accepted in `roll-call`
 * (PR #325): the student's name is not spoken until the answerer has confirmed
 * they are the named guardian, and anyone else — including voicemail — hears
 * only that the institute called.
 */
function identityGateFor(
  action: ActionDefinition,
  contact: Contact,
  institute: Institute,
): string {
  const callback = institute.callbackNumber;

  if (action.sensitivity === 'minor-involved') {
    return [
      'IDENTITY GATE — this call concerns a child. Follow this exactly.',
      '',
      `1. Ask whether you are speaking to ${contact.fullName}.`,
      '2. Only after they confirm, you may refer to the student by FIRST NAME',
      '   and class. Never the full name, never any other detail.',
      '3. If they do not confirm, or somebody else has answered: do not say the',
      '   student\'s name, the class, or the reason for the call. Say only that',
      `   ${institute.displayName} called and would like a call back on`,
      `   ${callback}. Then end the call politely.`,
      '4. If you reach voicemail: leave only the same neutral message. Do not',
      '   name the student or state the reason.',
    ].join('\n');
  }

  return [
    'IDENTITY GATE',
    '',
    `1. Ask whether you are speaking to ${contact.fullName}.`,
    '2. If somebody else has answered, or they do not confirm: do not discuss',
    `   the matter. Say ${institute.displayName} called and would like a call`,
    `   back on ${callback}, then end the call politely.`,
    '3. If you reach voicemail: leave only that neutral message.',
  ].join('\n');
}

function renderQuestions(questions: readonly Question[]): string {
  if (questions.length === 0) {
    return 'This call asks nothing. Deliver the message and end politely.';
  }

  const lines = questions.map((question, index) => {
    const answers = [...question.answers, UNKNOWN].join(' | ');
    const parts = [
      `${index + 1}. ${question.ask}`,
      `   Record as: ${question.id}`,
      `   Allowed answers: ${answers}`,
    ];

    if (question.requiresEvidence) {
      parts.push(
        '   This answer is kept only if the recipient\'s own words support it.',
        `   Put those words in evidence_quotes["${question.id}"].`,
      );
    }
    if (question.claimAnswers?.length) {
      parts.push(
        `   If the answer is one of [${question.claimAnswers.join(', ')}], the`,
        '   recipient is stating an intention, not a completed fact. Record',
        '   exactly what they said. Do not treat it as done.',
      );
    }
    return parts.join('\n');
  });

  return [
    'WHAT TO FIND OUT — ask these, and nothing beyond them:',
    '',
    ...lines,
    '',
    `If the recipient does not give a usable answer, record "${UNKNOWN}".`,
    `"${UNKNOWN}" is a correct answer. Never guess to fill a field.`,
  ].join('\n');
}

function renderApprovedStatements(
  entries: readonly { topic: string; wording: string }[],
): string {
  if (entries.length === 0) {
    return [
      'WHAT YOU MAY SAY IF ASKED',
      '',
      'Nothing has been approved for this call beyond the disclosure above.',
      'Route every question the recipient asks to a person.',
    ].join('\n');
  }

  return [
    'WHAT YOU MAY SAY IF ASKED — these exact statements and no others:',
    '',
    ...entries.map((entry) => `- ${entry.topic}: "${entry.wording}"`),
  ].join('\n');
}

/** The prohibitions. Stated plainly, because a model will be tested on them. */
function renderBoundary(institute: Institute): string {
  return [
    'WHAT YOU MUST NOT DO',
    '',
    '- Do not answer anything that is not in the approved statements above,',
    '  even if you believe you know the answer, and even if the recipient',
    '  presses. Say: "I don\'t have that in front of me — I\'ll have someone',
    '  from the office confirm and call you back." Then record their question,',
    '  word for word, in unanswered_questions.',
    '- Do not give advice or recommend anything. You cannot say which course,',
    '  batch, teacher or option suits anybody.',
    '- Do not negotiate, offer, agree to, or hint at any discount, concession,',
    '  extension, waiver or exception.',
    '- Do not promise anything on behalf of ' + institute.displayName + '.',
    '- Do not ask for or accept payment details of any kind: no card, no UPI,',
    '  no bank details, no one-time passwords. If the recipient starts to give',
    '  them, stop them and say payment is only taken at the office or on the',
    '  official portal.',
    '- Do not discuss anything medical, legal or financial beyond the approved',
    '  statements.',
    '- If the recipient asks not to be called again, accept it immediately,',
    '  record opt_out_requested = yes, thank them and end the call.',
    '- If the recipient is distressed, angry or says this is an emergency, do',
    '  not attempt to handle it. Say a person from the office will call, end',
    '  the call, and record it in unanswered_questions.',
  ].join('\n');
}

/**
 * Renders one call.
 *
 * Pure: the same inputs produce byte-identical task text, which is what lets
 * the idempotency key be derived from the authorisation rather than from the
 * attempt.
 */
export function renderCall(args: {
  readonly action: ActionDefinition;
  readonly contact: Contact;
  readonly institute: Institute;
  readonly factSheet: FactSheet;
  /** Overrides the contact's preference, e.g. for a preview in one register. */
  readonly register?: SpokenRegister;
  /**
   * Earlier calls to THIS contact. Must already be filtered — see
   * `priorCallsForContact`. Anything here is spoken only after the identity
   * gate passes.
   */
  readonly priorCalls?: readonly PriorCall[];
}): RenderedCall {
  const { action, contact, institute, factSheet } = args;
  const register = args.register ?? contact.preferredRegister;

  const approved = approvedAnswersFor(factSheet, action, register);

  const priorCalls = args.priorCalls ?? [];
  // Not a defensive nicety. Recalling one family's answers to another is the
  // worst thing this file could do, and a comment asking the caller to filter
  // correctly is not a guarantee. Throwing is: a mixed set is a bug, and a
  // bug here must stop the run rather than reach a phone.
  const foreign = priorCalls.find((call) => call.contactId !== contact.id);
  if (foreign) {
    throw new Error(
      `Refusing to render: prior call ${foreign.callId} belongs to contact ` +
        `${foreign.contactId}, not ${contact.id}.`,
    );
  }

  const prior = buildPriorContext({ action, priorCalls });

  const taskText = [
    `You are an automated assistant calling on behalf of ${institute.displayName}.`,
    `Purpose of this call: ${action.purpose}`,
    '',
    REGISTER_INSTRUCTION[register],
    '',
    'SAY THIS FIRST, before anything else:',
    `"${action.disclosure}"`,
    '',
    identityGateFor(action, contact, institute),
    // Placed deliberately after the identity gate: nothing recalled from an
    // earlier call may reach whoever happened to pick up the phone.
    ...(prior.block ? ['', prior.block] : []),
    '',
    renderQuestions(action.questions),
    '',
    renderApprovedStatements(approved.entries),
    '',
    renderBoundary(institute),
    '',
    'BEFORE YOU END THE CALL',
    '',
    '- Confirm nothing you were not told. Do not summarise an answer back as',
    '  more certain than it was given.',
    '- Thank them and end politely.',
  ].join('\n');

  return {
    taskText,
    resultSchema: buildResultSchema(action),
    factSheetVersion: approved.factSheetVersion,
    register,
    missingTopics: approved.missingTopics,
    maskedDestination: maskPhone(contact.phone),
    approvedTexts: [
      ...approved.entries.map((entry) => entry.wording),
      action.disclosure,
      ...action.questions.map((question) => question.ask),
      institute.callbackNumber,
      // Resolved questions are approved wording too: a person wrote them, and
      // the agent may speak them on this call.
      ...priorCalls.flatMap((call) =>
        call.resolvedQuestions.map((resolved) => resolved.answer),
      ),
    ],
    priorCallsReferenced: prior.callsReferenced,
    resolvedQuestionsDelivered: prior.resolvedQuestionsDelivered,
  };
}
