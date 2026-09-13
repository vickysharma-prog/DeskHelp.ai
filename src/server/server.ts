/**
 * The HTTP layer.
 *
 * Built on `node:http` with no framework, so the server half of DeskHelp keeps
 * the property the rest has: it runs with nothing installed. Only the UI needs
 * `npm install`, and only to build itself.
 *
 * This layer computes nothing. Every decision — may we call, what may be said,
 * what the answer meant — already happened in `src/core`. The API's whole job
 * is to hand those results to a screen and to write down what somebody chose.
 * If logic starts appearing here, it belongs a layer down.
 *
 * Binds to 127.0.0.1 by default. An institute's contact list, transcripts and
 * calling controls are not things to expose on an interface by accident.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { Auth, verifyGoogleIdToken } from '../core/auth.ts';
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed.ts';
import { Store } from '../core/store.ts';
import { Ledger } from '../core/ledger.ts';
import { FixtureTransport, HttpTransport, liveGate } from '../core/calle.ts';
import { runAction } from '../core/runner.ts';
import { importContacts } from '../core/import.ts';
import { describe, nextRuns, periodKeyFor } from '../core/schedule.ts';
import { EDUCATION_PACK, actionById } from '../packs/education/actions.ts';
import type { SpokenRegister } from '../core/types.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Schedule } from '../core/schedule.ts';
import type { Institute } from '../core/types.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    // A contact sheet is not a file upload service. Refusing early keeps a
    // stray request from eating memory.
    if (size > 8_000_000) throw new Error('Request body is too large.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export interface ServerOptions {
  readonly store: Store;
  readonly ledger: Ledger;
  readonly auth: Auth;
  readonly env: Record<string, string | undefined>;
  /** Where the built UI lives. Omitted in tests. */
  readonly uiDir?: string;
}

/** The institute used before anybody has configured one. */
const UNCONFIGURED: Institute = {
  id: 'institute',
  displayName: 'Your institute',
  callbackNumber: '',
  timezone: '',
  jurisdiction: '',
  allowedDestinations: [],
};

const COOKIE = 'deskhelp_session';

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * `HttpOnly` so a script on the page cannot read it, `SameSite=Lax` so another
 * site cannot make the browser use it, `Path=/` so signing out clears it
 * everywhere. Not `Secure`, because DeskHelp binds to loopback by default and
 * a Secure cookie would never be sent over plain http://127.0.0.1.
 */
function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function createDeskHelpServer(options: ServerOptions) {
  const { store, ledger, auth, env } = options;

  const institute = () => store.getInstitute() ?? UNCONFIGURED;

  /**
   * The transport for a run.
   *
   * A live transport is only ever built when the gate has already said yes,
   * so there is no path where a bug in the UI produces a real call: the
   * fixture is what the code falls back to, not an error.
   */
  const transportFor = (phone: string) => {
    const gate = liveGate({ env, institute: institute(), phone });
    if (gate.live && env.CALLE_API_KEY) {
      return new HttpTransport(env.CALLE_API_KEY, env.CALLE_BASE_URL);
    }
    return new FixtureTransport();
  };

  const handlers: Record<string, (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>> = {
    // --- overview ---------------------------------------------------------
    'GET /api/overview': async (_req, res) => {
      const config = institute();
      const configs = new Map(
        store.allActionConfigs().map((entry) => [entry.actionId, entry]),
      );

      const enabled = EDUCATION_PACK.filter(
        (action) => configs.get(action.id)?.enabled,
      ).length;

      const queue = ledger.openQuestions(config.id);
      const configured = Boolean(
        config.timezone && config.jurisdiction && config.callbackNumber,
      );

      json(res, 200, {
        institute: config,
        configured,
        workflowsTotal: EDUCATION_PACK.length,
        workflowsEnabled: enabled,
        contacts: store.contacts().length,
        queueSize: queue.length,
        factSheetVersion: store.currentFactSheet(config.id)?.version ?? 0,
        live: env.DESKHELP_LIVE === 'true',
        allowedDestinations: config.allowedDestinations.length,
      });
    },

    // --- workflows --------------------------------------------------------
    'GET /api/workflows': async (_req, res) => {
      const config = institute();
      const configs = new Map(
        store.allActionConfigs().map((entry) => [entry.actionId, entry]),
      );

      json(
        res,
        200,
        EDUCATION_PACK.map((action) => {
          const entry = configs.get(action.id) ?? {
            actionId: action.id,
            enabled: false,
            schedule: { kind: 'manual' } as Schedule,
          };
          const tz = config.timezone || 'UTC';
          return {
            id: action.id,
            title: action.title,
            purpose: action.purpose,
            audience: action.audience,
            sensitivity: action.sensitivity,
            questions: action.questions.map((q) => ({ id: q.id, ask: q.ask, answers: q.answers })),
            factSheetTopics: action.factSheetTopics,
            cascade: action.cascade,
            retry: action.retry,
            enabled: entry.enabled,
            schedule: entry.schedule,
            scheduleText: describe(entry.schedule, tz),
            nextRuns: config.timezone
              ? nextRuns(entry.schedule, tz, 3).map((d) => d.toISOString())
              : [],
          };
        }),
      );
    },

    'POST /api/workflows': async (req, res, url) => {
      const actionId = url.searchParams.get('id') ?? '';
      if (!actionById(actionId)) return json(res, 404, { error: 'Unknown workflow.' });

      const body = JSON.parse(await readBody(req)) as {
        enabled?: boolean;
        schedule?: Schedule;
      };
      const existing = store.getActionConfig(actionId);

      store.setActionConfig({
        actionId,
        enabled: body.enabled ?? existing.enabled,
        schedule: body.schedule ?? existing.schedule,
      });
      json(res, 200, store.getActionConfig(actionId));
    },

    // --- preview / run ----------------------------------------------------
    'POST /api/workflows/preview': async (req, res, url) => {
      const actionId = url.searchParams.get('id') ?? '';
      const action = actionById(actionId);
      if (!action) return json(res, 404, { error: 'Unknown workflow.' });

      const config = institute();
      const factSheet = store.currentFactSheet(config.id);
      if (!factSheet) {
        return json(res, 400, {
          error: 'Publish a fact sheet first: the agent has nothing it is allowed to say.',
        });
      }
      if (!config.timezone || !config.jurisdiction) {
        return json(res, 400, {
          error:
            'Declare a timezone and jurisdiction first. Neither is ever inferred from a phone number.',
        });
      }

      const contacts = store.contacts();
      const now = new Date();
      const schedule = store.getActionConfig(actionId).schedule;

      const result = await runAction({
        action,
        institute: config,
        factSheet,
        contacts,
        periodKey: periodKeyFor(schedule, now, config.timezone),
        ledger,
        transport: transportFor(contacts[0]?.phone ?? ''),
        env,
        now,
        // Looking at a run must never consume it.
        preview: true,
      });

      json(res, 200, result);
    },

    /**
     * Places one real call, to one named person, now.
     *
     * Deliberately not the preview endpoint without `preview`. That one runs
     * across every contact, and a button labelled "Call now" that fans out
     * over the whole list is not something anybody should be able to press by
     * accident. One press, one phone.
     *
     * Whether it actually rings is still the gate's decision, not this
     * endpoint's: the public demo has live calling off and an empty allow
     * list, so the same button there walks the same path and dials nobody.
     */
    'POST /api/workflows/call': async (req, res, url) => {
      const actionId = url.searchParams.get('id') ?? '';
      const action = actionById(actionId);
      if (!action) return json(res, 404, { error: 'Unknown workflow.' });

      const body = JSON.parse(await readBody(req)) as { contactId?: string };
      const contact = store
        .contacts()
        .find((entry) => entry.id === body.contactId);
      if (!contact) return json(res, 404, { error: 'Unknown contact.' });

      const config = institute();
      const factSheet = store.currentFactSheet(config.id);
      if (!factSheet) {
        return json(res, 400, {
          error:
            'Publish a fact sheet first: the agent has nothing it is allowed to say.',
        });
      }

      const now = new Date();
      const result = await runAction({
        action,
        institute: config,
        factSheet,
        contacts: [contact],
        periodKey: periodKeyFor(
          store.getActionConfig(actionId).schedule,
          now,
          config.timezone,
        ),
        ledger,
        transport: transportFor(contact.phone),
        env,
        now,
      });

      json(res, 200, result);
    },

    // --- contacts ---------------------------------------------------------
    'GET /api/contacts': async (_req, res) => {
      json(res, 200, store.contacts());
    },

    // --- calls ------------------------------------------------------------
    'GET /api/calls': async (_req, res) => {
      const config = institute();
      const names = new Map(
        store.contacts().map((contact) => [contact.id, contact.fullName]),
      );
      const titles = new Map(
        EDUCATION_PACK.map((action) => [action.id, action.title]),
      );

      json(
        res,
        200,
        ledger.recentCalls(config.id).map((call) => ({
          ...call,
          // A call placed from the command line has no contact row behind it,
          // and that call is the one somebody most wants to see. Falling back
          // to the id keeps it on the page instead of dropping it.
          contactName: names.get(call.contactId) ?? call.contactId,
          actionTitle: titles.get(call.actionId) ?? call.actionId,
        })),
      );
    },

    'POST /api/contacts': async (req, res) => {
      const body = JSON.parse(await readBody(req)) as {
        fullName?: string;
        phone?: string;
        preferredRegister?: string;
      };

      const fullName = (body.fullName ?? '').trim();
      const phone = (body.phone ?? '').trim();

      if (!fullName) return json(res, 400, { error: 'Give the person a name.' });
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        return json(res, 400, {
          error:
            'The number must be in full international form, starting with + and the country code.',
        });
      }
      if (store.contactByPhone(phone)) {
        return json(res, 400, { error: 'That number is already on the list.' });
      }

      const contact = {
        id: `c-${randomUUID().slice(0, 8)}`,
        fullName,
        phone,
        preferredRegister: (body.preferredRegister ?? 'hi-en') as SpokenRegister,
        // Added by hand, one at a time, by somebody who knows this person
        // agreed to be called. The CSV path asks for consent as a column
        // because a spreadsheet carries no such knowledge.
        consent: true,
        doNotCall: false,
      };

      store.saveContact(contact);
      json(res, 200, contact);
    },

    'POST /api/contacts/import': async (req, res) => {
      const csv = await readBody(req);
      const result = importContacts(csv);
      if (result.contacts.length > 0) store.replaceContacts(result.contacts);
      json(res, 200, {
        imported: result.contacts.length,
        rejected: result.rejected,
        warnings: result.warnings,
      });
    },

    // --- fact sheet -------------------------------------------------------
    'GET /api/factsheet': async (_req, res) => {
      const config = institute();
      json(res, 200, store.currentFactSheet(config.id) ?? null);
    },

    'POST /api/factsheet': async (req, res) => {
      const config = institute();
      const body = JSON.parse(await readBody(req)) as {
        approvedBy: string;
        entries: { id: string; topic: string; wording: Record<string, string> }[];
      };
      if (!body.approvedBy?.trim()) {
        return json(res, 400, {
          error: 'Approved wording needs a named approver.',
        });
      }
      json(res, 200, store.publishFactSheet(config.id, body.approvedBy, body.entries));
    },

    // --- review queue -----------------------------------------------------
    'GET /api/queue': async (_req, res) => {
      json(res, 200, ledger.openQuestions(institute().id));
    },

    'POST /api/queue/resolve': async (req, res, url) => {
      const id = Number(url.searchParams.get('id'));
      const body = JSON.parse(await readBody(req)) as {
        answer: string;
        resolvedBy: string;
      };
      try {
        ledger.resolveQuestion(id, body.answer, body.resolvedBy || 'office');
        json(res, 200, { ok: true });
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },

    // --- authentication ---------------------------------------------------
    'GET /api/auth/me': async (req, res) => {
      const account = auth.accountForSession(readCookie(req, COOKIE));
      json(res, 200, {
        account: account ?? null,
        needsSetup: auth.isEmpty(),
        // The button is hidden rather than shown-and-broken when Google
        // sign-in has not been configured.
        googleClientId: env.GOOGLE_CLIENT_ID ?? null,
        // Offered only where the operator turned the shared demo on. These
        // credentials are published on the page, so anything typed into that
        // workspace is visible to the next visitor.
        demo:
          env.DESKHELP_DEMO === 'true'
            ? { email: DEMO_EMAIL, password: DEMO_PASSWORD }
            : null,
      });
    },

    'POST /api/auth/signup': async (req, res) => {
      // Only the first account can be created without being signed in.
      // Otherwise anybody who reaches the page could add themselves.
      const signedIn = auth.accountForSession(readCookie(req, COOKIE));
      if (!auth.isEmpty() && !signedIn) {
        return json(res, 403, { error: 'This DeskHelp already has an account. Sign in instead.' });
      }

      const body = JSON.parse(await readBody(req)) as {
        email: string;
        password: string;
        instituteName: string;
      };

      try {
        const account = auth.createPasswordAccount(body);
        // The institute the account signed up as is the institute it operates.
        const existing = store.getInstitute();
        store.saveInstitute({
          ...(existing ?? UNCONFIGURED),
          displayName: existing?.displayName && existing.displayName !== UNCONFIGURED.displayName
            ? existing.displayName
            : account.instituteName,
        });

        const token = auth.startSession(account.id);
        res.setHeader('Set-Cookie', sessionCookie(token, 7 * 86400));
        json(res, 200, { account });
      } catch (error) {
        json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },

    'POST /api/auth/login': async (req, res) => {
      const body = JSON.parse(await readBody(req)) as { email: string; password: string };
      try {
        const account = auth.verifyPassword(body.email, body.password);
        const token = auth.startSession(account.id);
        res.setHeader('Set-Cookie', sessionCookie(token, 7 * 86400));
        json(res, 200, { account });
      } catch (error) {
        json(res, 401, { error: error instanceof Error ? error.message : String(error) });
      }
    },

    'POST /api/auth/google': async (req, res) => {
      const clientId = env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return json(res, 400, {
          error: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID in .env.',
        });
      }

      const body = JSON.parse(await readBody(req)) as { credential: string };
      try {
        // Verified with Google before a single field is trusted. The token
        // arrives from the browser, so nothing in it can be believed yet.
        const identity = await verifyGoogleIdToken(body.credential, clientId);
        const first = auth.isEmpty();
        const account = auth.upsertGoogleAccount(identity.email, identity.name);

        if (first) {
          store.saveInstitute({
            ...(store.getInstitute() ?? UNCONFIGURED),
            displayName: account.instituteName,
          });
        }

        const token = auth.startSession(account.id);
        res.setHeader('Set-Cookie', sessionCookie(token, 7 * 86400));
        json(res, 200, { account });
      } catch (error) {
        json(res, 401, { error: error instanceof Error ? error.message : String(error) });
      }
    },

    'POST /api/auth/logout': async (req, res) => {
      auth.endSession(readCookie(req, COOKIE));
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      json(res, 200, { ok: true });
    },

    // --- settings ---------------------------------------------------------
    'POST /api/settings': async (req, res) => {
      const body = JSON.parse(await readBody(req)) as Institute;
      store.saveInstitute({ ...institute(), ...body });
      json(res, 200, institute());
    },
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const key = `${req.method} ${url.pathname}`;

    try {
      const handler = handlers[key];
      if (handler) {
        // Everything except the auth endpoints themselves needs a session.
        // Behind this login sit families' phone numbers, transcripts of what
        // they said, and a button that makes real calls.
        if (!url.pathname.startsWith('/api/auth/')) {
          if (!auth.accountForSession(readCookie(req, COOKIE))) {
            return json(res, 401, { error: 'Sign in to continue.' });
          }
        }
        await handler(req, res, url);
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        return json(res, 404, { error: 'No such endpoint.' });
      }

      if (!options.uiDir) {
        return json(res, 404, { error: 'No UI build present. Run `npm run ui:build`.' });
      }

      // Static files, with the built UI's index as the SPA fallback. The
      // normalize/startsWith pair is what stops `../../` walking out of the
      // build directory.
      const requested = url.pathname === '/' ? '/index.html' : url.pathname;
      const candidate = normalize(join(options.uiDir, requested));
      const path = candidate.startsWith(normalize(options.uiDir))
        ? candidate
        : join(options.uiDir, 'index.html');

      try {
        const file = await readFile(path);
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
        res.end(file);
      } catch {
        const fallback = await readFile(join(options.uiDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': MIME['.html']! });
        res.end(fallback);
      }
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return server;
}
