import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importContacts, parseCsv } from './import.ts';
import { Ledger } from './ledger.ts';
import { guard } from './guard.ts';
import type { ActionDefinition, Institute } from './types.ts';

const HEADER = 'id,name,phone,register,consent,do_not_call';

// --- the parser ------------------------------------------------------------

test('quoted fields, embedded commas and escaped quotes survive', () => {
  const rows = parseCsv('a,b\n"x, y","he said ""hi"""');
  assert.deepEqual(rows[1], ['x, y', 'he said "hi"']);
});

test('a BOM and CRLF line endings are handled', () => {
  const rows = parseCsv('﻿id,name\r\n1,Test\r\n');
  assert.deepEqual(rows[0], ['id', 'name']);
  assert.deepEqual(rows[1], ['1', 'Test']);
});

test('blank lines are ignored rather than becoming empty contacts', () => {
  const rows = parseCsv('id,name\n\n1,Test\n\n');
  assert.equal(rows.length, 2);
});

// --- required columns ------------------------------------------------------

test('a missing required column fails the whole import, loudly', () => {
  const result = importContacts('id,name\n1,Test');
  assert.equal(result.contacts.length, 0);
  assert.match(result.rejected[0]!.reason, /Missing required column "phone"/);
});

// --- phone numbers ---------------------------------------------------------

test('a malformed number is rejected, never repaired', () => {
  // Repairing means guessing a country code, which is how somebody in another
  // country gets called about a child they have never met.
  const csv = [
    HEADER,
    'a,Parent A,98765 43210,hi-en,yes,no',
    'b,Parent B,09876543210,hi-en,yes,no',
    'c,Parent C,+15550100001,hi-en,yes,no',
  ].join('\n');

  const result = importContacts(csv);
  assert.equal(result.contacts.length, 1, 'only the valid row should import');
  assert.equal(result.contacts[0]!.id, 'c');
  assert.equal(result.rejected.length, 2);
  for (const row of result.rejected) {
    assert.match(row.reason, /will not be corrected automatically/);
  }
});

test('a rejection carries the line number so somebody can fix the sheet', () => {
  const csv = [HEADER, 'a,Parent A,+15550100001,hi-en,yes,no', 'b,Parent B,bad,hi-en,yes,no'].join(
    '\n',
  );
  const result = importContacts(csv);
  assert.equal(result.rejected[0]!.line, 3);
});

test('rows are never silently dropped', () => {
  // An import that quietly skips forty rows is worse than one that fails,
  // because the institute believes it called everybody.
  const csv = [HEADER, 'a,,+15550100001,hi-en,yes,no', 'b,Parent B,nope,hi-en,yes,no'].join('\n');
  const result = importContacts(csv);
  assert.equal(result.contacts.length, 0);
  assert.equal(result.rejected.length, 2, 'every skipped row must be reported');
});

// --- consent ---------------------------------------------------------------

test('consent is opt-in: blank and unrecognised values are not yes', () => {
  const csv = [
    HEADER,
    'a,Parent A,+15550100001,hi-en,,no',
    'b,Parent B,+15550100002,hi-en,maybe,no',
    'c,Parent C,+15550100003,hi-en,yes,no',
    'd,Parent D,+15550100004,hi-en,haan,no',
  ].join('\n');

  const result = importContacts(csv);
  const consentById = Object.fromEntries(
    result.contacts.map((contact) => [contact.id, contact.consent]),
  );

  assert.equal(consentById.a, false, 'blank is not consent');
  assert.equal(consentById.b, false, 'unrecognised is not consent');
  assert.equal(consentById.c, true);
  assert.equal(consentById.d, true, 'haan should count');
});

test('a contact without consent is imported but flagged, not discarded', () => {
  // The institute can then see who is missing consent and go and ask.
  const result = importContacts([HEADER, 'a,Parent A,+15550100001,hi-en,,no'].join('\n'));
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0]!.consent, false);
  assert.match(result.warnings.join(' '), /no recorded consent and will not be called/);
});

// --- other columns ---------------------------------------------------------

test('do-not-call is read and preserved', () => {
  const result = importContacts([HEADER, 'a,Parent A,+15550100001,hi-en,yes,yes'].join('\n'));
  assert.equal(result.contacts[0]!.doNotCall, true);
});

test('an unknown register falls back to hi-en with a warning', () => {
  const result = importContacts(
    [HEADER, 'a,Parent A,+15550100001,klingon,yes,no'].join('\n'),
  );
  assert.equal(result.contacts[0]!.preferredRegister, 'hi-en');
  assert.match(result.warnings.join(' '), /unknown register/);
});

test('duplicate ids are rejected', () => {
  const csv = [
    HEADER,
    'a,Parent A,+15550100001,hi-en,yes,no',
    'a,Parent A again,+15550100002,hi-en,yes,no',
  ].join('\n');
  const result = importContacts(csv);
  assert.equal(result.contacts.length, 1);
  assert.match(result.rejected[0]!.reason, /Duplicate id/);
});

test('one number on two rows warns, because that person is called twice', () => {
  // Usually two siblings sharing a guardian. Legitimate, but it means two
  // calls to one phone, so the operator should see it.
  const csv = [
    HEADER,
    'a,Sibling One,+15550100001,hi-en,yes,no',
    'b,Sibling Two,+15550100001,hi-en,yes,no',
  ].join('\n');
  const result = importContacts(csv);
  assert.equal(result.contacts.length, 2);
  assert.match(result.warnings.join(' '), /also appears for/);
  assert.ok(
    !result.warnings.join(' ').includes('+15550100001'),
    'the warning must mask the number',
  );
});

// --- the property that matters most ----------------------------------------

test('re-importing a clean sheet cannot revive somebody who opted out', () => {
  // Suppression lives in the ledger, not on the contact record, precisely so
  // that overwriting the contact cannot clear it.
  const action: ActionDefinition = {
    id: 'fee-reminder',
    title: 'Fee reminder',
    purpose: 'Remind about a fee.',
    audience: 'guardian',
    sensitivity: 'financial',
    disclosure: 'This is an automated reminder call from the institute office.',
    questions: [],
    factSheetTopics: [],
    minHoursBetweenContacts: 72,
    cascade: false,
    retry: { maxAttempts: 2, minHoursBetweenAttempts: 4 },
  };

  const institute: Institute = {
    id: 'inst-1',
    displayName: 'Test Institute',
    callbackNumber: '+15550100999',
    timezone: 'Asia/Kolkata',
    jurisdiction: 'IN',
    allowedDestinations: ['+15550100001'],
  };

  const ledger = new Ledger();
  const reservation = ledger.reserve({
    instituteId: 'inst-1',
    actionId: 'fee-reminder',
    contactId: 'a',
    periodKey: '2026-09',
  });
  ledger.markSettled(reservation.idempotencyKey, 'opted-out');

  // The office re-exports the spreadsheet. It says consent: yes, do_not_call: no.
  const reimported = importContacts(
    [HEADER, 'a,Parent A,+15550100001,hi-en,yes,no'].join('\n'),
  );
  const contact = reimported.contacts[0]!;
  assert.equal(contact.consent, true, 'the sheet does say yes');
  assert.equal(contact.doNotCall, false, 'and the sheet does not say do-not-call');

  const decision = guard({
    action,
    contact,
    institute,
    suppressed: ledger.isSuppressed('inst-1', 'a'),
    now: new Date('2026-10-01T05:00:00Z'),
  });

  assert.equal(decision.allowed, false);
  assert.equal(
    decision.allowed === false && decision.reason,
    'contact-suppressed',
    'a re-import must never revive an opt-out',
  );
  ledger.close();
});
