import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guard, isValidE164, maskPhone, rulesFor } from './guard.ts';
import type { GuardInput } from './guard.ts';
import type { ActionDefinition, Contact, Institute } from './types.ts';

// A reserved fictional number. Real destinations live in .env and never here.
const FICTIONAL = '+15550100001';

const action: ActionDefinition = {
  id: 'test-action',
  title: 'Test action',
  purpose: 'Exercise the guard.',
  audience: 'guardian',
  sensitivity: 'routine',
  disclosure: 'This is an automated call from the institute.',
  questions: [],
  factSheetTopics: [],
  minHoursBetweenContacts: 24,
  cascade: false,
  retry: { maxAttempts: 2, minHoursBetweenAttempts: 4 },
};

const contact: Contact = {
  id: 'c1',
  fullName: 'Fictional Guardian',
  phone: FICTIONAL,
  preferredRegister: 'hi-en',
  consent: true,
  doNotCall: false,
};

const institute: Institute = {
  id: 'inst-test',
  displayName: 'Test Institute',
  callbackNumber: '+15550100999',
  timezone: 'Asia/Kolkata',
  jurisdiction: 'IN',
  allowedDestinations: [FICTIONAL],
};

/** 2026-09-12 14:30 IST — comfortably inside the Indian calling window. */
const insideWindow = new Date('2026-09-12T09:00:00Z');
/** 2026-09-12 23:30 IST — after 21:00, outside it. */
const outsideWindow = new Date('2026-09-12T18:00:00Z');

const input = (over: Partial<GuardInput> = {}): GuardInput => ({
  action,
  contact,
  institute,
  now: insideWindow,
  ...over,
});

test('allows a consented contact on the allow list inside the window', () => {
  assert.deepEqual(guard(input()), { allowed: true, warnings: [] });
});

test('a dry run warns about an unlisted destination instead of refusing it', () => {
  // An institute previewing five hundred students will not maintain a
  // five-hundred-entry allow list, and a preview where every row reads
  // "destination not allowed" tells them nothing.
  const result = guard(
    input({ institute: { ...institute, allowedDestinations: [] }, mode: 'dry-run' }),
  );

  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0]!, /would be refused in live mode/);
    assert.ok(!result.warnings[0]!.includes(FICTIONAL), 'number leaked into a warning');
  }
});

test('live mode is the default when the caller does not say', () => {
  // Forgetting to pass a mode must get the stricter behaviour, not the looser.
  const result = guard(
    input({ institute: { ...institute, allowedDestinations: [] } }),
  );
  assert.equal(result.allowed === false && result.reason, 'destination-not-allowed');
});

test('a dry run still enforces consent, do-not-call and calling hours', () => {
  // Only the allow list softens. Policy checks must show up in a preview, or
  // the preview is lying about what the run would do.
  const dryRun = { mode: 'dry-run' as const };

  assert.equal(
    guard(input({ ...dryRun, contact: { ...contact, consent: false } })).allowed,
    false,
  );
  assert.equal(
    guard(input({ ...dryRun, contact: { ...contact, doNotCall: true } })).allowed,
    false,
  );
  assert.equal(guard(input({ ...dryRun, now: outsideWindow })).allowed, false);
});

test('do-not-call outranks everything, including a valid window', () => {
  const result = guard(input({ contact: { ...contact, doNotCall: true } }));
  assert.equal(result.allowed, false);
  assert.equal(result.allowed === false && result.reason, 'do-not-call');
});

test('an opt-out earned on a call outranks a fresh consent flag', () => {
  // The import says consent: true and doNotCall: false — which is exactly what
  // a re-imported spreadsheet looks like after somebody asked to be left
  // alone. The suppression list, not the contact record, is the authority.
  const result = guard(input({ suppressed: true }));
  assert.equal(result.allowed === false && result.reason, 'contact-suppressed');
});

test('suppression applies in a dry run too', () => {
  const result = guard(input({ suppressed: true, mode: 'dry-run' }));
  assert.equal(result.allowed === false && result.reason, 'contact-suppressed');
});

test('absence of consent is a refusal, not a warning', () => {
  const result = guard(input({ contact: { ...contact, consent: false } }));
  assert.equal(result.allowed === false && result.reason, 'no-consent');
});

test('a malformed number is refused rather than repaired', () => {
  for (const bad of ['98765 43210', '09876543210', '+0123456789', '', '+91']) {
    const result = guard(input({ contact: { ...contact, phone: bad } }));
    assert.equal(
      result.allowed === false && result.reason,
      'invalid-phone',
      `expected ${JSON.stringify(bad)} to be refused`,
    );
  }
});

test('a number not on the allow list cannot be dialled', () => {
  const result = guard(
    input({ institute: { ...institute, allowedDestinations: [] } }),
  );
  assert.equal(result.allowed === false && result.reason, 'destination-not-allowed');
});

test('the refusal detail masks the number', () => {
  const result = guard(
    input({ institute: { ...institute, allowedDestinations: [] } }),
  );
  assert.equal(result.allowed, false);
  if (result.allowed === false) {
    assert.ok(!result.detail.includes(FICTIONAL), 'full number leaked into detail');
    assert.ok(result.detail.includes('•'), 'expected a masked number');
  }
});

test('calls outside the declared jurisdiction window are refused', () => {
  const result = guard(input({ now: outsideWindow }));
  assert.equal(result.allowed === false && result.reason, 'outside-calling-window');
});

test('an unusable timezone fails closed instead of skipping enforcement', () => {
  for (const tz of ['', '+05:30', 'UTC+5', 'GMT-5', 'Mars/Olympus']) {
    const result = guard(input({ institute: { ...institute, timezone: tz } }));
    assert.equal(
      result.allowed === false && result.reason,
      'outside-calling-window',
      `expected ${JSON.stringify(tz)} to fail closed`,
    );
  }
});

test('contact frequency limit blocks a scheduler misfire', () => {
  const twoHoursAgo = new Date(insideWindow.getTime() - 2 * 3_600_000);
  const result = guard(input({ lastContactedAt: twoHoursAgo }));
  assert.equal(result.allowed === false && result.reason, 'contacted-too-recently');
});

test('contact frequency limit clears once the window has passed', () => {
  const thirtyHoursAgo = new Date(insideWindow.getTime() - 30 * 3_600_000);
  assert.equal(guard(input({ lastContactedAt: thirtyHoursAgo })).allowed, true);
});

test('a cascade stops once somebody has accepted', () => {
  const result = guard(
    input({ action: { ...action, cascade: true }, cascadeSatisfied: true }),
  );
  assert.equal(
    result.allowed === false && result.reason,
    'cascade-already-satisfied',
  );
});

test('an unknown jurisdiction gets conservative rules, not permissive ones', () => {
  const rules = rulesFor('ZZ');
  assert.equal(rules.code, 'DEFAULT');
  assert.ok(rules.latestHour <= 21, 'default window must not be more permissive');
});

test('India rules match TRAI hours', () => {
  const rules = rulesFor('IN');
  assert.equal(rules.earliestHour, 9);
  assert.equal(rules.latestHour, 21);
});

test('E.164 validation accepts real shapes and rejects near-misses', () => {
  assert.ok(isValidE164('+919876543210'));
  assert.ok(isValidE164('+15550100001'));
  assert.ok(!isValidE164('919876543210'), 'missing +');
  assert.ok(!isValidE164('+91987654321012345'), 'too long');
  assert.ok(!isValidE164('+91 98765 43210'), 'spaces');
});

test('masking keeps the prefix and last two digits only', () => {
  const masked = maskPhone('+919876543210');
  assert.ok(masked.startsWith('+91'));
  assert.ok(masked.endsWith('10'));
  assert.ok(!masked.includes('9876543'));
});
