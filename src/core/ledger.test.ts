import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Ledger, idempotencyKeyFor } from './ledger.ts';
import type { CallAuthorisation } from './ledger.ts';

const auth: CallAuthorisation = {
  instituteId: 'inst-1',
  actionId: 'fee-reminder',
  contactId: 'c-1',
  periodKey: '2026-09',
};

test('the same authorisation always yields the same key', () => {
  assert.equal(idempotencyKeyFor(auth), idempotencyKeyFor({ ...auth }));
});

test('a different period is a different call', () => {
  assert.notEqual(
    idempotencyKeyFor(auth),
    idempotencyKeyFor({ ...auth, periodKey: '2026-10' }),
  );
});

test('a different contact is a different call', () => {
  assert.notEqual(
    idempotencyKeyFor(auth),
    idempotencyKeyFor({ ...auth, contactId: 'c-2' }),
  );
});

test('the key does not leak institute or contact ids', () => {
  const key = idempotencyKeyFor(auth);
  for (const secret of ['inst-1', 'c-1', 'fee-reminder']) {
    assert.ok(!key.includes(secret), `key leaked ${secret}`);
  }
});

test('the first reservation succeeds and the second is refused', () => {
  const ledger = new Ledger();
  const first = ledger.reserve(auth);
  assert.equal(first.kind, 'reserved');

  const second = ledger.reserve(auth);
  assert.equal(second.kind, 'already-held');
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  ledger.close();
});

test('a crash after reserving still blocks the retry', () => {
  // Reserve, then never mark it placed - the shape of a process dying between
  // reserving and dialling. The retry must still be refused.
  const ledger = new Ledger();
  ledger.reserve(auth);

  const retry = ledger.reserve(auth);
  assert.equal(retry.kind, 'already-held');
  assert.equal(retry.kind === 'already-held' && retry.status, 'reserved');
  ledger.close();
});

test('next period is allowed even though this one is held', () => {
  const ledger = new Ledger();
  ledger.reserve(auth);
  assert.equal(ledger.reserve({ ...auth, periodKey: '2026-10' }).kind, 'reserved');
  ledger.close();
});

test('a refusal is recorded with its reason', () => {
  const ledger = new Ledger();
  const reservation = ledger.reserve(auth);
  ledger.markRefused(reservation.idempotencyKey, 'outside-calling-window');

  const row = ledger.get(reservation.idempotencyKey);
  assert.equal(row?.status, 'refused');
  assert.equal(row?.refusalReason, 'outside-calling-window');
  ledger.close();
});

test('settling twice is safe, as an at-least-once webhook requires', () => {
  const ledger = new Ledger();
  const reservation = ledger.reserve(auth);
  ledger.markPlaced(reservation.idempotencyKey, 'call_abc');
  ledger.markSettled(reservation.idempotencyKey, 'answered');
  ledger.markSettled(reservation.idempotencyKey, 'answered');

  const row = ledger.get(reservation.idempotencyKey);
  assert.equal(row?.status, 'settled');
  assert.equal(row?.disposition, 'answered');
  assert.equal(row?.calleCallId, 'call_abc');
  ledger.close();
});

test('a reservation that never dialled does not count as contact', () => {
  const ledger = new Ledger();
  ledger.reserve(auth);
  assert.equal(
    ledger.lastContactedAt('inst-1', 'fee-reminder', 'c-1'),
    undefined,
    'a reserved-but-never-placed call must not suppress a later attempt',
  );
  ledger.close();
});

test('a placed call does count as contact', () => {
  const ledger = new Ledger();
  const reservation = ledger.reserve(auth, new Date('2026-09-01T10:00:00Z'));
  ledger.markPlaced(reservation.idempotencyKey, 'call_abc');

  const at = ledger.lastContactedAt('inst-1', 'fee-reminder', 'c-1');
  assert.equal(at?.toISOString(), '2026-09-01T10:00:00.000Z');
  ledger.close();
});

test('an opt-out suppresses the contact permanently, not just this period', () => {
  // Regression, found by probing. The opt-out used to live only on the ledger
  // row, which is scoped to one action and one period. A parent who refused
  // September's fee reminder was called again in October, and by a different
  // workflow the next morning.
  const ledger = new Ledger();
  const september = ledger.reserve(auth);
  ledger.markPlaced(september.idempotencyKey, 'call_1');
  ledger.markSettled(september.idempotencyKey, 'opted-out');

  assert.equal(ledger.isSuppressed('inst-1', 'c-1'), true);

  // A new period does not clear it.
  const october = ledger.reserve({ ...auth, periodKey: '2026-10' });
  assert.equal(october.kind, 'reserved', 'the ledger still allows a reservation');
  assert.equal(
    ledger.isSuppressed('inst-1', 'c-1'),
    true,
    'but the contact remains suppressed, so the guard refuses',
  );

  // Nor does a different action.
  assert.equal(ledger.isSuppressed('inst-1', 'c-1'), true);
  ledger.close();
});

test('suppression is per contact, and does not spill onto anybody else', () => {
  const ledger = new Ledger();
  const reservation = ledger.reserve(auth);
  ledger.markSettled(reservation.idempotencyKey, 'opted-out');

  assert.equal(ledger.isSuppressed('inst-1', 'c-2'), false);
  assert.equal(ledger.isSuppressed('inst-2', 'c-1'), false);
  ledger.close();
});

test('settling as opted-out twice does not error', () => {
  const ledger = new Ledger();
  const reservation = ledger.reserve(auth);
  ledger.markSettled(reservation.idempotencyKey, 'opted-out');
  ledger.markSettled(reservation.idempotencyKey, 'opted-out');
  assert.equal(ledger.isSuppressed('inst-1', 'c-1'), true);
  ledger.close();
});

test('an ordinary disposition does not suppress anybody', () => {
  const ledger = new Ledger();
  const reservation = ledger.reserve(auth);
  ledger.markSettled(reservation.idempotencyKey, 'answered');
  assert.equal(ledger.isSuppressed('inst-1', 'c-1'), false);
  ledger.close();
});

test('a retry within the same authorisation is not blocked by the contact limit', () => {
  // Regression, found by probing the education pack. An urgent action - a
  // child missing from class, retry after one hour - had its retry refused by
  // its own twelve-hour between-contacts limit, so the retry never fired at
  // all. Each limit was correct on its own; stacking them disabled one.
  const ledger = new Ledger();
  const at = new Date('2026-09-14T04:00:00Z');
  const reservation = ledger.reserve(auth, at);
  ledger.markPlaced(reservation.idempotencyKey, 'call_1');
  ledger.markSettled(reservation.idempotencyKey, 'unreached');

  assert.equal(
    ledger.lastContactedAt('inst-1', 'fee-reminder', 'c-1', auth.periodKey),
    undefined,
    'the current authorisation must not count against its own retry',
  );

  assert.ok(
    ledger.lastContactedAt('inst-1', 'fee-reminder', 'c-1'),
    'but it still counts for a new authorisation',
  );
  ledger.close();
});

test('a previous period still counts against a new authorisation', () => {
  const ledger = new Ledger();
  const september = ledger.reserve(auth, new Date('2026-09-01T10:00:00Z'));
  ledger.markPlaced(september.idempotencyKey, 'call_1');

  const at = ledger.lastContactedAt('inst-1', 'fee-reminder', 'c-1', '2026-10');
  assert.equal(at?.toISOString(), '2026-09-01T10:00:00.000Z');
  ledger.close();
});

test('a run can be read back for the operator', () => {
  const ledger = new Ledger();
  ledger.reserve(auth);
  ledger.reserve({ ...auth, contactId: 'c-2' });
  ledger.reserve({ ...auth, contactId: 'c-3', periodKey: '2026-10' });

  const rows = ledger.forPeriod('inst-1', 'fee-reminder', '2026-09');
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.contactId).sort(),
    ['c-1', 'c-2'],
  );
  ledger.close();
});
