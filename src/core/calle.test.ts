import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FixtureTransport,
  assertSchemaSupported,
  awaitTerminal,
  liveGate,
  localeFor,
  placeCall,
} from './calle.ts';
import { buildResultSchema } from './render.ts';
import { EDUCATION_PACK } from '../packs/education/actions.ts';
import type { CalleCreateBody, CalleTransport } from './calle.ts';
import type { Institute } from './types.ts';

const FICTIONAL = '+15550100001';

const institute: Institute = {
  id: 'inst-1',
  displayName: 'Northline Coaching',
  callbackNumber: '+15550100999',
  timezone: 'Asia/Kolkata',
  jurisdiction: 'IN',
  allowedDestinations: [FICTIONAL],
};

const liveEnv = { DESKHELP_LIVE: 'true', CALLE_API_KEY: 'iams_test' };

const body: CalleCreateBody = {
  task: 'Say hello.',
  recipients: [{ phones: [FICTIONAL], region: 'IN', locale: 'hi-IN' }],
  result_schema: { type: 'object', required: [], properties: {}, additionalProperties: false },
  recipient_result_schema: {
    type: 'object',
    required: [],
    properties: {},
    additionalProperties: false,
  },
  metadata: { workflow_run_id: 'run-1' },
};

const noSleep = async () => {};

// --- the two gates ---------------------------------------------------------

test('both gates must pass for a call to be live', () => {
  const gate = liveGate({ env: liveEnv, institute, phone: FICTIONAL });
  assert.equal(gate.live, true);
});

test('a truthy-looking DESKHELP_LIVE that is not exactly "true" stays dry', () => {
  // One gate can be left on by accident in a shell profile or a CI variable.
  for (const value of ['1', 'yes', 'TRUE', 'True', 'on', '']) {
    const gate = liveGate({
      env: { ...liveEnv, DESKHELP_LIVE: value },
      institute,
      phone: FICTIONAL,
    });
    assert.equal(gate.live, false, `${JSON.stringify(value)} must not go live`);
  }
});

test('the allow list is the second gate, and has no wildcard', () => {
  const gate = liveGate({
    env: liveEnv,
    institute: { ...institute, allowedDestinations: [] },
    phone: FICTIONAL,
  });
  assert.equal(gate.live, false);
  assert.match(gate.reason, /allow list/);
});

test('a missing API key keeps it dry even with both other conditions met', () => {
  const gate = liveGate({
    env: { DESKHELP_LIVE: 'true' },
    institute,
    phone: FICTIONAL,
  });
  assert.equal(gate.live, false);
});

test('every refusal explains itself', () => {
  const gate = liveGate({ env: {}, institute, phone: FICTIONAL });
  assert.equal(gate.live, false);
  assert.ok(gate.reason.length > 0);
});

// --- locale mapping --------------------------------------------------------

test('a code-switched register is sent as Hindi, not as a made-up locale', () => {
  // No provider exposes "Hinglish" as a language tag. The mixing instruction
  // lives in the task text instead.
  assert.equal(localeFor('hi-en', 'IN'), 'hi-IN');
  assert.equal(localeFor('hi', 'IN'), 'hi-IN');
  assert.equal(localeFor('en', 'IN'), 'en-IN');
  assert.equal(localeFor('ta', 'IN'), 'ta-IN');
});

// --- placing ---------------------------------------------------------------

test('a dry run reports simulated and says why', async () => {
  const transport = new FixtureTransport();
  const outcome = await placeCall({
    transport,
    gate: liveGate({ env: {}, institute, phone: FICTIONAL }),
    body,
    idempotencyKey: 'dl_abc-a1',
  });

  assert.equal(outcome.kind, 'simulated');
  assert.equal(outcome.kind === 'simulated' && outcome.callId, 'sim_dl_abc-a1');
  assert.ok(outcome.kind === 'simulated' && outcome.reason.length > 0);
});

test('the idempotency key reaches the transport unchanged', async () => {
  const transport = new FixtureTransport();
  await placeCall({
    transport,
    gate: liveGate({ env: {}, institute, phone: FICTIONAL }),
    body,
    idempotencyKey: 'dl_abc-a2',
  });

  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0]!.idempotencyKey, 'dl_abc-a2');
});

test('a simulated call id is derived from the key, so a replay is stable', async () => {
  const transport = new FixtureTransport();
  const gate = liveGate({ env: {}, institute, phone: FICTIONAL });
  const first = await placeCall({ transport, gate, body, idempotencyKey: 'dl_x-a1' });
  const second = await placeCall({ transport, gate, body, idempotencyKey: 'dl_x-a1' });

  assert.equal(
    first.kind === 'simulated' && first.callId,
    second.kind === 'simulated' && second.callId,
  );
});

test('an ambiguous live submission is never resent', async () => {
  // The one outcome that must not become a retry: a duplicate create is how
  // one authorisation becomes two phone calls.
  let creates = 0;
  const flaky: CalleTransport = {
    async createCall() {
      creates += 1;
      throw new Error('socket hang up');
    },
    async getCall() {
      return { status: 'in_progress' };
    },
  };

  const outcome = await placeCall({
    transport: flaky,
    gate: liveGate({ env: liveEnv, institute, phone: FICTIONAL }),
    body,
    idempotencyKey: 'dl_abc-a1',
  });

  assert.equal(outcome.kind, 'submission-unknown');
  assert.equal(creates, 1, 'the create must not be retried');
  assert.match(
    outcome.kind === 'submission-unknown' ? outcome.detail : '',
    /calle call recover/,
  );
});

test('a throwing fixture is a bug in the fixture, not an ambiguous submission', async () => {
  const broken: CalleTransport = {
    async createCall() {
      throw new Error('fixture is wrong');
    },
    async getCall() {
      return { status: 'completed' };
    },
  };

  await assert.rejects(
    placeCall({
      transport: broken,
      gate: liveGate({ env: {}, institute, phone: FICTIONAL }),
      body,
      idempotencyKey: 'dl_abc-a1',
    }),
    /fixture is wrong/,
  );
});

// --- polling ---------------------------------------------------------------

test('polling stops at the first terminal status', async () => {
  let reads = 0;
  const transport: CalleTransport = {
    async createCall() {
      return { call_id: 'c1' };
    },
    async getCall() {
      reads += 1;
      return { status: reads < 3 ? 'in_progress' : 'completed' };
    },
  };

  const { response, timedOut } = await awaitTerminal(transport, 'c1', {
    firstPollDelayMs: 0,
    intervalMs: 0,
    sleep: noSleep,
  });

  assert.equal(response.status, 'completed');
  assert.equal(timedOut, false);
  assert.equal(reads, 3);
});

test('every terminal status ends the poll, not only completed', async () => {
  for (const status of ['failed', 'declined', 'voicemail', 'no_answer', 'busy']) {
    const transport: CalleTransport = {
      async createCall() {
        return { call_id: 'c1' };
      },
      async getCall() {
        return { status };
      },
    };
    const { timedOut } = await awaitTerminal(transport, 'c1', {
      firstPollDelayMs: 0,
      intervalMs: 0,
      sleep: noSleep,
    });
    assert.equal(timedOut, false, `${status} should be terminal`);
  }
});

test('a timeout returns what it last saw rather than throwing', async () => {
  // A timeout is not a failed call. The call id is durable and polling can
  // resume; throwing would push a caller towards placing it again.
  const transport: CalleTransport = {
    async createCall() {
      return { call_id: 'c1' };
    },
    async getCall() {
      return { status: 'in_progress' };
    },
  };

  const { response, timedOut } = await awaitTerminal(transport, 'c1', {
    firstPollDelayMs: 0,
    intervalMs: 0,
    timeoutMs: -1,
    sleep: noSleep,
  });

  assert.equal(timedOut, true);
  assert.equal(response.status, 'in_progress');
});

test('a schema CALL-E would reject is refused before the request', () => {
  // Learned the expensive way: an open `evidence_quotes` map came back as a
  // 400 result_schema_invalid, which reads like the call failed rather than
  // the request being malformed. CALL-E takes a narrow slice of JSON Schema,
  // so the slice is checked here instead of on their side.
  assert.throws(
    () => assertSchemaSupported({ type: 'object', additionalProperties: { type: 'string' } }),
    /additionalProperties to false/,
  );

  // Silence is openness. An object that says nothing about extra keys allows
  // them, which is the thing being refused.
  assert.throws(
    () => assertSchemaSupported({ type: 'object', properties: {} }),
    /additionalProperties to false/,
  );

  assert.throws(
    () => assertSchemaSupported({ type: ['string', 'null'] }),
    /union type/,
  );

  assert.throws(
    () =>
      assertSchemaSupported({
        type: 'object',
        additionalProperties: false,
        properties: { when: { type: 'string', format: 'date' } },
      }),
    /does not support: format/,
  );

  // And it names the field rather than making somebody search for it.
  assert.throws(
    () =>
      assertSchemaSupported({
        type: 'object',
        additionalProperties: false,
        properties: { nested: { type: 'object', properties: {} } },
      }),
    /result_schema\.nested/,
  );
});

test('every action in the pack builds a schema CALL-E accepts', () => {
  // The pack-wide check, so a fifteenth workflow cannot ship a schema that
  // only fails on a live call.
  for (const action of EDUCATION_PACK) {
    assert.doesNotThrow(
      () => assertSchemaSupported(buildResultSchema(action)),
      `${action.id} builds a schema CALL-E would reject`,
    );
  }
});
