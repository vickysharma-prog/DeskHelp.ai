/**
 * One real call, to one number you own.
 *
 *   npm run live -- --action fee-reminder            shows the plan, dials nothing
 *   npm run live -- --action fee-reminder --confirm  places the call
 *
 * This exists because a demo video needs a phone that actually rings, and
 * because the first live call is the only way to learn what a Hindi transcript
 * really comes back as.
 *
 * Four things must all be true before anything dials:
 *
 *   DESKHELP_LIVE=true          in .env, exactly that word
 *   CALLE_API_KEY               set
 *   DESKHELP_TEST_PHONE         the E.164 number you are authorised to call
 *   --confirm                   typed on this command, every single time
 *
 * The number stays in .env and never reaches source, a fixture, a commit
 * message or this file. Everything printed here masks it.
 *
 * Each run spends one of the twenty free calls on the account. The plan is
 * printed first so a mistake costs nothing.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';

import { Ledger } from '../core/ledger.ts';
import { Store } from '../core/store.ts';
import { FixtureTransport, HttpTransport, liveGate } from '../core/calle.ts';
import { maskPhone, isValidE164 } from '../core/guard.ts';
import { runAction } from '../core/runner.ts';
import { periodKeyFor } from '../core/schedule.ts';
import { actionById, EDUCATION_PACK } from '../packs/education/actions.ts';
import type { Contact, Institute, SpokenRegister } from '../core/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

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

function rule(text: string): void {
  console.log(`\n${'─'.repeat(72)}\n${text}\n${'─'.repeat(72)}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      action: { type: 'string', default: 'fee-reminder' },
      register: { type: 'string', default: 'hi-en' },
      name: { type: 'string', default: 'Test Recipient' },
      confirm: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const env = { ...(await loadEnv()), ...process.env };
  const action = actionById(values.action!);

  if (!action) {
    console.error(`\nNo workflow called "${values.action}". Available:\n`);
    for (const entry of EDUCATION_PACK) console.error(`  ${entry.id}`);
    process.exit(1);
  }

  const phone = env.DESKHELP_TEST_PHONE ?? '';
  if (!isValidE164(phone)) {
    console.error(
      '\nSet DESKHELP_TEST_PHONE in .env to the E.164 number you are authorised\n' +
        'to call, for example +919876543210. It is never read from anywhere else.\n',
    );
    process.exit(1);
  }

  const dbPath = env.DESKHELP_DB ?? join(root, '.local', 'deskhelp.db');
  const store = new Store(dbPath);
  const ledger = new Ledger(dbPath);

  const saved = store.getInstitute();
  const institute: Institute = {
    id: saved?.id ?? 'institute',
    displayName: saved?.displayName ?? 'Northline Education Hub',
    // Spoken aloud when the wrong person answers, so it has to be real.
    callbackNumber: env.DESKHELP_CALLBACK_NUMBER ?? phone,
    timezone: saved?.timezone || 'Asia/Kolkata',
    jurisdiction: saved?.jurisdiction || 'IN',
    // The allow list holds exactly this one number and nothing else.
    allowedDestinations: [phone],
  };

  const factSheet = store.currentFactSheet(institute.id);
  if (!factSheet) {
    console.error(
      '\nNo fact sheet published yet. Start the app, publish one, then run this.\n',
    );
    process.exit(1);
  }

  const contact: Contact = {
    id: 'live-test',
    fullName: values.name!,
    phone,
    preferredRegister: values.register as SpokenRegister,
    consent: true,
    doNotCall: false,
  };

  const gate = liveGate({ env, institute, phone });
  const now = new Date();
  const periodKey = `live-${periodKeyFor({ kind: 'manual' }, now, institute.timezone)}-${now
    .toISOString()
    .slice(11, 16)
    .replace(':', '')}`;

  rule(`LIVE CALL — ${action.title}`);
  console.log(`Workflow    : ${action.id}`);
  console.log(`Calling     : ${maskPhone(phone)}  as "${contact.fullName}"`);
  console.log(`Language    : ${contact.preferredRegister}`);
  console.log(`Institute   : ${institute.displayName}  (${institute.timezone}, ${institute.jurisdiction})`);
  console.log(`Fact sheet  : v${factSheet.version}`);
  console.log(`Gate        : ${gate.live ? 'OPEN — a phone will ring' : `closed, ${gate.reason}`}`);

  if (!values.confirm) {
    // A preview writes nothing and reserves nothing, so running this as often
    // as you like costs no calls and does not consume the authorisation.
    const preview = await runAction({
      action, institute, factSheet, contacts: [contact], periodKey,
      // Belt and braces. `preview: true` already returns before any transport
      // is touched; handing it a transport with no network makes that true
      // twice over, so a regression in one place cannot dial.
      ledger, transport: new FixtureTransport(), env: {}, now, preview: true,
    });

    rule('WHAT IT WOULD SAY');
    console.log(preview.outcomes[0]?.taskText ?? '(nothing rendered)');
    rule('NOTHING WAS DIALLED');
    console.log('Add --confirm to place this call. It spends one of your twenty.\n');
    ledger.close();
    store.close();
    return;
  }

  if (!gate.live) {
    console.error(`\nRefusing: ${gate.reason}\n`);
    process.exit(1);
  }

  const ask = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await ask.question(
    `\nThis will ring ${maskPhone(phone)} for real. Type the last 4 digits to go ahead: `,
  );
  ask.close();

  if (answer.trim() !== phone.slice(-4)) {
    console.error('\nThat did not match. Nothing was dialled.\n');
    process.exit(1);
  }

  rule('DIALLING');
  console.log('CALL-E waits about a minute before the first status check.\n');

  const result = await runAction({
    action, institute, factSheet, contacts: [contact], periodKey,
    ledger,
    transport: new HttpTransport(env.CALLE_API_KEY!, env.CALLE_BASE_URL),
    env, now,
  });

  const outcome = result.outcomes[0];
  rule('WHAT CAME BACK');

  if (!outcome) {
    console.log('No outcome. Check the CALL-E dashboard.\n');
  } else if (outcome.status === 'refused') {
    console.log(`Refused before dialling: ${outcome.refusalReason}`);
    console.log(outcome.detail);
  } else if (outcome.status === 'submission-unknown') {
    console.log(outcome.detail);
  } else {
    const judgement = outcome.judgement;
    console.log(`Status      : ${outcome.status}`);
    console.log(`Disposition : ${judgement?.disposition}`);

    const answers = Object.entries(judgement?.answers ?? {});
    if (answers.length) {
      console.log('\nAnswers');
      for (const [key, value] of answers) console.log(`  ${key} = ${value}`);
    }
    for (const claim of judgement?.claims ?? []) {
      console.log(`\nCLAIM  ${claim.questionId} = ${claim.statedValue}   (not a fact)`);
      console.log(`       their words: "${claim.quote}"`);
    }
    for (const question of judgement?.unansweredQuestions ?? []) {
      console.log(`\nTO THE OFFICE  "${question.quote}"`);
    }
    for (const drop of judgement?.discarded ?? []) {
      console.log(`\nDISCARDED  ${drop.questionId} reported "${drop.reported}"`);
      console.log(`           ${drop.reason}`);
    }
    for (const finding of judgement?.spokenFindings ?? []) {
      console.log(`\nAGENT SAID  unapproved "${finding.token}" in: "${finding.quote}"`);
    }
    for (const reason of judgement?.reasons ?? []) console.log(`\n  ${reason}`);
  }

  console.log('\nThe call is in your review queue and on the dashboard.\n');
  ledger.close();
  store.close();
}

await main();
