/**
 * Starts DeskHelp.
 *
 *   npm start          the platform, on http://127.0.0.1:4321
 *
 * Reads `.env` if present. Without it DeskHelp runs in dry-run with no
 * credentials, which is the state a first-time reviewer should land in: the
 * whole product is explorable and nothing can dial.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Auth } from '../core/auth.ts';
import { Store } from '../core/store.ts';
import { Ledger } from '../core/ledger.ts';
import { createDeskHelpServer } from './server.ts';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from './seed.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/**
 * A deliberately small .env reader.
 *
 * Tolerates the two things a person actually does wrong when creating the
 * file by hand: spaces around the `=`, and quotes around the value.
 */
async function loadEnv(path: string): Promise<Record<string, string>> {
  if (!existsSync(path)) return {};
  const text = await readFile(path, 'utf8');
  const env: Record<string, string> = {};

  for (const line of text.replace(/^﻿/, '').split('\n')) {
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
  const fileEnv = await loadEnv(join(root, '.env'));
  const env = { ...fileEnv, ...process.env };

  const dbPath = env.DESKHELP_DB ?? join(root, '.local', 'deskhelp.db');
  if (!existsSync(join(root, '.local'))) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, '.local'), { recursive: true });
  }

  const store = new Store(dbPath);
  const ledger = new Ledger(dbPath);
  const auth = new Auth(dbPath);

  // A fresh database gets a demo institute so the first screen has something
  // on it. Never runs against a database that already has an account.
  const seeded = seedDemo({ store, ledger, auth });

  const uiDir = join(root, 'ui', 'dist');
  const server = createDeskHelpServer({
    store,
    ledger,
    auth,
    env,
    ...(existsSync(uiDir) ? { uiDir } : {}),
  });

  const port = Number(env.PORT ?? env.DESKHELP_PORT ?? 4321);
  // Loopback by default. An institute's contact list, transcripts and calling
  // controls are not things to put on an interface by accident.
  const host = env.DESKHELP_HOST ?? '127.0.0.1';

  server.listen(port, host, () => {
    const live = env.DESKHELP_LIVE === 'true';
    console.log(`\n  DeskHelp  →  http://${host}:${port}`);
    console.log(`  Database  →  ${dbPath}`);
    console.log(
      `  Calling   →  ${live ? 'LIVE — real phones will ring' : 'dry run, nothing dials'}`,
    );
    console.log(
      `  Accounts  →  ${auth.isEmpty() ? 'none yet, the first visit creates one' : 'sign in required'}`,
    );
    if (seeded) {
      console.log(`
  Demo seeded. Sign in with:`);
      console.log(`    ${DEMO_EMAIL}`);
      console.log(`    ${DEMO_PASSWORD}`);
    }
    if (!existsSync(uiDir)) {
      console.log('\n  No UI build found. Run `npm run ui:build`, or');
      console.log('  `npm run ui:dev` in another terminal for hot reload.');
    }
    console.log('');
  });
}

await main();
