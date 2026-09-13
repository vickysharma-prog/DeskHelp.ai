/**
 * The CALL-E client.
 *
 * CALL-E places the call. DeskHelp decides who is called, when, what may be
 * said, and what the answer meant. That division is CALL-E's own, from the
 * submissions repository: "CALL-E SDKs, provider APIs, authentication, call
 * execution, billing primitives, and provider-side controls belong upstream
 * with CALL-E itself."
 *
 * ## Two gates, not one
 *
 * A real call requires BOTH of:
 *
 *   1. `DESKHELP_LIVE` set to exactly "true". Not "1", not "yes", not "TRUE".
 *   2. The destination present on the institute's allow list.
 *
 * Either alone is not enough. One gate can be left on by accident in a shell
 * profile or a CI variable; two cannot, because the second is a list of
 * specific numbers somebody had to type. Everything else runs against the
 * fixture transport and dials nothing.
 *
 * ## Submission ambiguity is not a retry
 *
 * If `POST /v1/calls` fails in a way that does not say whether the call was
 * accepted — a timeout, a dropped connection — DeskHelp does NOT send it
 * again. A duplicate create is how one authorisation becomes two phone calls.
 * The result is `submission-unknown`, which is a state for a person to resolve
 * with `calle call recover`, exactly as the CALL-E maintainers describe in
 * `docs/adr/0006-a-refusal-is-not-a-missed-call.md`.
 */

import type { JsonSchema } from './render.ts';
import type { CalleRecipientResult } from './disposition.ts';
import type { Institute, SpokenRegister } from './types.ts';

/** What CALL-E returns from `GET /v1/calls/{id}`. */
export interface CalleCallResponse {
  readonly status: string;
  readonly task_completed?: boolean;
  readonly completion_confidence?: { score?: number; label?: string } | null;
  readonly structured_result?: Record<string, unknown> | null;
  readonly recipients?: readonly CalleRecipientResult[];
  /** Why the call did not happen. CALL-E puts the readable reason here. */
  readonly failure_code?: string | number | null;
  readonly failure_message?: string | null;
}

export interface CalleCreateBody {
  readonly task: string;
  readonly recipients: readonly {
    readonly phones: readonly string[];
    readonly region: string;
    readonly locale: string;
  }[];
  readonly result_schema: JsonSchema;
  readonly recipient_result_schema: JsonSchema;
  readonly metadata: Record<string, string>;
  readonly webhook_url?: string;
}

/**
 * The seam between DeskHelp and the network.
 *
 * Everything above this interface is pure and testable; everything below it
 * needs credentials. The fixture implementation is the default path, so the
 * demo, the tests and a judge's first run all work with no account at all.
 */
export interface CalleTransport {
  createCall(
    body: CalleCreateBody,
    idempotencyKey: string,
  ): Promise<{ readonly call_id: string }>;
  getCall(callId: string): Promise<CalleCallResponse>;
}

/**
 * CALL-E accepts a deliberately narrow slice of JSON Schema. Anything outside
 * it comes back as a 400 `result_schema_invalid`, which costs a round trip to
 * learn and reads like a fault in the call rather than in the request.
 *
 * The vocabulary below is the one the maintainers' own `kept` documents and
 * enforces. Checking it here, next to the only code that talks to CALL-E,
 * means a schema mistake fails on the machine that made it.
 */
const SUPPORTED_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'enum',
  'items',
  'description',
  'additionalProperties',
]);

const SUPPORTED_TYPES = new Set([
  'object',
  'array',
  'string',
  'integer',
  'number',
  'boolean',
]);

export class UnsupportedSchemaError extends Error {}

/** Throws if CALL-E would reject this schema, before anything is sent. */
export function assertSchemaSupported(
  node: object,
  path = 'result_schema',
): void {
  const schema = node as Record<string, unknown>;
  const unsupported = Object.keys(schema)
    .filter((keyword) => !SUPPORTED_KEYWORDS.has(keyword))
    .sort();
  if (unsupported.length > 0) {
    throw new UnsupportedSchemaError(
      `${path} uses schema features CALL-E does not support: ${unsupported.join(', ')}.`,
    );
  }

  const declared = schema.type;
  if (Array.isArray(declared)) {
    throw new UnsupportedSchemaError(
      `${path} uses a union type. CALL-E accepts one type per field; carry ` +
        '"not stated" with an enum value such as "unknown" instead.',
    );
  }
  if (declared !== undefined && !SUPPORTED_TYPES.has(String(declared))) {
    throw new UnsupportedSchemaError(
      `${path} declares an unsupported type "${String(declared)}".`,
    );
  }

  // Explicitly false, not merely absent. An object that says nothing is open,
  // and an open object is what CALL-E refuses.
  if (declared === 'object' && schema.additionalProperties !== false) {
    throw new UnsupportedSchemaError(
      `${path} must set additionalProperties to false; CALL-E rejects open objects.`,
    );
  }

  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    if (child && typeof child === 'object') {
      assertSchemaSupported(child, `${path}.${name}`);
    }
  }
  if (schema.items && typeof schema.items === 'object') {
    assertSchemaSupported(schema.items, `${path}.items`);
  }
}

/**
 * Maps a spoken register onto a CALL-E locale for a given region.
 *
 * `hi-en` has no locale of its own, because no provider exposes "Hinglish" as
 * a language tag, so it is sent as Hindi and the code-switching instruction
 * lives in the task text where it belongs. See `render.ts`.
 *
 * The locale strings follow the pattern in CALL-E's API example ("en-US")
 * against its supported-regions table. If a region rejects one, it is a
 * configuration value to correct here rather than a guess to spread through
 * the codebase.
 */
export function localeFor(register: SpokenRegister, region: string): string {
  const language = register === 'hi-en' ? 'hi' : register;
  return `${language}-${region}`;
}

/**
 * The single recipient's result, with the call-level failure reason folded in.
 *
 * CALL-E puts the readable reason for a failure on the call rather than on the
 * recipient, so a recipient read on its own says only "failed" and a phone
 * nobody answered cannot be told apart from one that was answered and hung up.
 *
 * This lives here rather than in the caller because it was duplicated once and
 * the copy was immediately wrong: the runner folded the reason in and the
 * re-judging tool did not, so the same call read differently depending on
 * which one looked at it.
 */
export function recipientResultOf(
  response: CalleCallResponse,
): CalleRecipientResult {
  const reported = response.recipients?.[0];
  if (!reported) {
    return {
      status: response.status,
      structured_result: response.structured_result ?? null,
      failure_code: response.failure_code ?? null,
      failure_message: response.failure_message ?? null,
    };
  }
  return {
    ...reported,
    failure_code: reported.failure_code ?? response.failure_code ?? null,
    failure_message: reported.failure_message ?? response.failure_message ?? null,
  };
}

export type PlaceOutcome =
  /** CALL-E accepted it. A real phone will ring. */
  | { readonly kind: 'placed'; readonly callId: string }
  /** Nothing dialled. The fixture transport produced a response. */
  | { readonly kind: 'simulated'; readonly callId: string; readonly reason: string }
  /**
   * We do not know whether a call was placed. Never retried automatically.
   */
  | { readonly kind: 'submission-unknown'; readonly detail: string };

export interface LiveGate {
  readonly live: boolean;
  /** Why live calling is off. Always present when `live` is false. */
  readonly reason: string;
}

/**
 * Decides whether this specific call may reach the network.
 *
 * Reads the environment rather than taking a boolean, so there is one place
 * that knows what "live" means and no caller can pass `true` by accident.
 */
export function liveGate(args: {
  readonly env: Record<string, string | undefined>;
  readonly institute: Institute;
  readonly phone: string;
}): LiveGate {
  const { env, institute, phone } = args;

  if (env.DESKHELP_LIVE !== 'true') {
    return {
      live: false,
      reason:
        'DESKHELP_LIVE is not exactly "true". DeskHelp is in dry-run; nothing will dial.',
    };
  }

  if (!env.CALLE_API_KEY) {
    return { live: false, reason: 'CALLE_API_KEY is not set.' };
  }

  if (!institute.allowedDestinations.includes(phone)) {
    return {
      live: false,
      reason:
        'The destination is not on the institute allow list. There is no wildcard.',
    };
  }

  return { live: true, reason: '' };
}

/** Talks to the real CALL-E API. */
export class HttpTransport implements CalleTransport {
  #apiKey: string;
  #baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.heycall-e.com') {
    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async createCall(
    body: CalleCreateBody,
    idempotencyKey: string,
  ): Promise<{ call_id: string }> {
    const response = await fetch(`${this.#baseUrl}/v1/calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        'Content-Type': 'application/json',
        // CALL-E deduplicates on this at its end. It carries the attempt
        // number, because the ledger key alone would make a legitimate retry
        // return the original call and dial nothing. See `retry.ts`.
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `CALL-E create failed: ${response.status} ${await response.text()}`,
      );
    }

    const json = (await response.json()) as { call_id?: string; id?: string };
    const callId = json.call_id ?? json.id;
    if (!callId) {
      throw new Error('CALL-E create returned no call id.');
    }
    return { call_id: callId };
  }

  async getCall(callId: string): Promise<CalleCallResponse> {
    const response = await fetch(
      `${this.#baseUrl}/v1/calls/${encodeURIComponent(callId)}`,
      { headers: { Authorization: `Bearer ${this.#apiKey}` } },
    );

    if (!response.ok) {
      throw new Error(
        `CALL-E read failed: ${response.status} ${await response.text()}`,
      );
    }
    return (await response.json()) as CalleCallResponse;
  }
}

/**
 * A transport that dials nothing.
 *
 * This is the default, not a test double bolted on afterwards. The demo, the
 * whole test suite, and a reviewer's first run all go through it, so the
 * normal path through this codebase is the one that cannot ring a stranger.
 */
export class FixtureTransport implements CalleTransport {
  #responses: Map<string, CalleCallResponse>;
  #fallback: CalleCallResponse;
  /** Every body it was handed, so a test can assert on what would have been sent. */
  readonly sent: { body: CalleCreateBody; idempotencyKey: string }[] = [];

  constructor(args: {
    readonly responses?: Record<string, CalleCallResponse>;
    readonly fallback?: CalleCallResponse;
  } = {}) {
    this.#responses = new Map(Object.entries(args.responses ?? {}));
    this.#fallback = args.fallback ?? {
      status: 'completed',
      task_completed: true,
      recipients: [],
    };
  }

  async createCall(
    body: CalleCreateBody,
    idempotencyKey: string,
  ): Promise<{ call_id: string }> {
    this.sent.push({ body, idempotencyKey });
    // Derived from the key, so a replayed authorisation yields the same id.
    return { call_id: `sim_${idempotencyKey}` };
  }

  async getCall(callId: string): Promise<CalleCallResponse> {
    return this.#responses.get(callId) ?? this.#fallback;
  }
}

/**
 * Places one call, or explains why it did not.
 *
 * The transport is chosen here rather than by the caller, so "am I live?" is
 * answered once, next to the gate that decides it.
 */
export async function placeCall(args: {
  readonly transport: CalleTransport;
  readonly gate: LiveGate;
  readonly body: CalleCreateBody;
  readonly idempotencyKey: string;
}): Promise<PlaceOutcome> {
  const { transport, gate, body, idempotencyKey } = args;

  // Before the network, not after. A schema CALL-E will not accept is a fault
  // in this codebase, and finding out by spending a round trip makes it look
  // like a fault in the call. This throws on every path, fixtures included, so
  // the test suite catches it rather than a live run.
  assertSchemaSupported(body.result_schema);
  if (body.recipient_result_schema) {
    assertSchemaSupported(
      body.recipient_result_schema,
      'recipient_result_schema',
    );
  }

  try {
    const { call_id } = await transport.createCall(body, idempotencyKey);
    return gate.live
      ? { kind: 'placed', callId: call_id }
      : { kind: 'simulated', callId: call_id, reason: gate.reason };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    if (!gate.live) {
      // A fixture transport that throws is a bug in the fixture, not an
      // ambiguous submission. Surface it rather than dressing it up.
      throw error;
    }

    // Live, and we do not know whether a phone rang. This is the one outcome
    // that must never be retried automatically.
    return {
      kind: 'submission-unknown',
      detail:
        `${detail}. DeskHelp will NOT resend this call: a duplicate create is ` +
        'how one authorisation becomes two phone calls. Resolve it with ' +
        '`calle call recover`, or check the CALL-E dashboard.',
    };
  }
}

export interface PollOptions {
  /**
   * CALL-E's own guidance is to wait about a minute before the first poll,
   * then every five to ten seconds. Overridable so tests do not sleep.
   */
  readonly firstPollDelayMs?: number;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const TERMINAL = new Set([
  'completed',
  'failed',
  'canceled',
  'declined',
  'no_answer',
  'voicemail',
  'busy',
]);

/**
 * Polls until the call reaches a terminal state.
 *
 * A timeout here is not a failure of the call. The call may still be in
 * progress, or may already have finished; either way the `call_id` is durable
 * and polling can resume later. What must not happen is a second create, so
 * this returns the last response it saw rather than throwing a caller into a
 * retry path.
 */
export async function awaitTerminal(
  transport: CalleTransport,
  callId: string,
  options: PollOptions = {},
): Promise<{ readonly response: CalleCallResponse; readonly timedOut: boolean }> {
  const firstDelay = options.firstPollDelayMs ?? 60_000;
  const interval = options.intervalMs ?? 8_000;
  const timeout = options.timeoutMs ?? 600_000;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const startedAt = Date.now();
  await sleep(firstDelay);

  let last: CalleCallResponse = { status: 'in_progress' };

  while (Date.now() - startedAt < timeout) {
    last = await transport.getCall(callId);
    if (TERMINAL.has(last.status?.trim().toLowerCase() ?? '')) {
      return { response: last, timedOut: false };
    }
    await sleep(interval);
  }

  return { response: last, timedOut: true };
}
