/**
 * Re-judges a call that CALL-E has already completed, using the current engine.
 *
 *   node scripts/rejudge.ts --call call_xxx
 *
 * A judgement is a reading of a transcript, and the reading can improve after
 * the call is over. When it does, the stored outcome is the old reading, and
 * the next call to that person carries it as history. Nothing here dials, and
 * the transcript is fetched rather than replayed, so this costs no calls.
 *
 * Written after the first real call: the grounding check had been looking for
 * the transcript in the wrong place, so a good answer was discarded and the
 * call was filed as needing a person. The call itself was fine.
 */

import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { judge } from '../src/core/disposition.ts';
import { transcriptTurnsOf } from '../src/core/disposition.ts';
import { actionById } from '../src/packs/education/actions.ts';
import { recipientResultOf } from '../src/core/calle.ts';

const root = join(import.meta.dirname, '..');

async function loadEnv(): Promise<Record<string, string>> {
  const path = join(root, '.env');
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of (await readFile(path, 'utf8')).replace(/^﻿/, '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at === -1) continue;
    const key = trimmed.slice(0, at).trim();
    const value = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '');
    if (key) env[key] = value;
  }
  return env;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { call: { type: 'string' }, apply: { type: 'boolean', default: false } },
  });

  if (!values.call) {
    console.error('\nPass the CALL-E call id: --call call_xxx\n');
    process.exit(1);
  }

  const env = { ...(await loadEnv()), ...process.env };
  if (!env.CALLE_API_KEY) {
    console.error('\nCALLE_API_KEY is not set.\n');
    process.exit(1);
  }

  const dbPath = env.DESKHELP_DB ?? join(root, '.local', 'deskhelp.db');
  const db = new DatabaseSync(dbPath);

  const row = db
    .prepare('SELECT * FROM call_ledger WHERE calle_call_id = ?')
    .get(values.call) as Record<string, string> | undefined;

  if (!row) {
    console.error(`\nNo ledger row for ${values.call}.\n`);
    process.exit(1);
  }

  const action = actionById(row.action_id!);
  if (!action) {
    console.error(`\nNo workflow called "${row.action_id}".\n`);
    process.exit(1);
  }

  const response = await fetch(
    `https://api.heycall-e.com/v1/calls/${encodeURIComponent(values.call)}`,
    { headers: { Authorization: `Bearer ${env.CALLE_API_KEY}` } },
  );
  if (!response.ok) {
    console.error(`\nCALL-E returned ${response.status}.\n`);
    process.exit(1);
  }

  // Through the same folding the runner uses, so a call reads the same way
  // here as it did when it was placed.
  const recipient = recipientResultOf(await response.json());

  const verdict = judge({
    action,
    result: recipient,
    callId: values.call,
    contactId: row.contact_id!,
  });

  const stored = db
    .prepare('SELECT disposition, answers_json FROM call_outcome WHERE idempotency_key = ?')
    .get(row.idempotency_key!) as { disposition: string; answers_json: string } | undefined;

  console.log(`\n  call        ${values.call}`);
  console.log(`  workflow    ${row.action_id}`);
  console.log(`  turns seen  ${transcriptTurnsOf(recipient).length}`);
  console.log('');
  console.log(`  stored      ${stored?.disposition ?? '(none)'}  ${stored?.answers_json ?? ''}`);
  console.log(`  now reads   ${verdict.disposition}  ${JSON.stringify(verdict.answers)}`);
  if (verdict.discarded.length > 0) {
    console.log(`  discarded   ${JSON.stringify(verdict.discarded)}`);
  }

  if (!values.apply) {
    console.log('\n  Nothing written. Add --apply to store this reading.\n');
    db.close();
    return;
  }

  db.prepare(
    `UPDATE call_outcome
        SET disposition = ?, answers_json = ?, claims_json = ?,
            transcript_json = ?, calle_call_id = ?
      WHERE idempotency_key = ?`,
  ).run(
    verdict.disposition,
    JSON.stringify(verdict.answers),
    JSON.stringify(verdict.claims),
    JSON.stringify(transcriptTurnsOf(recipient)),
    values.call,
    row.idempotency_key!,
  );

  db.prepare('UPDATE call_ledger SET disposition = ? WHERE idempotency_key = ?').run(
    verdict.disposition,
    row.idempotency_key!,
  );

  console.log('\n  Stored.\n');
  db.close();
}

await main();
