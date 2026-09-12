/**
 * Everything an institute configures, and nothing it discovers.
 *
 * The ledger holds what happened — calls, outcomes, suppressions, the review
 * queue. This holds what somebody decided: which workflows are on, when they
 * run, who is in the contact list, and what the agent is allowed to say.
 *
 * They are separate on purpose. Configuration is edited constantly and can be
 * wrong; history is written once and must not be. Keeping them apart means a
 * misconfigured schedule cannot corrupt a record of a call that already
 * happened, and an operator resetting their setup does not erase an opt-out.
 *
 * Both live in the same SQLite file so a single `.local/deskhelp.db` is the
 * whole of an installation's state, and backing it up is copying one file.
 */

import { DatabaseSync } from 'node:sqlite';

import type { Contact, FactSheet, Institute, SpokenRegister } from './types.ts';
import type { Schedule } from './schedule.ts';

export interface ActionConfig {
  readonly actionId: string;
  /**
   * Whether this workflow runs at all. Every workflow ships disabled: an
   * institute opts into each one deliberately, rather than discovering that
   * installing DeskHelp started calling people.
   */
  readonly enabled: boolean;
  readonly schedule: Schedule;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS institute (
  id                    TEXT PRIMARY KEY,
  display_name          TEXT NOT NULL,
  callback_number       TEXT NOT NULL,
  timezone              TEXT NOT NULL,
  jurisdiction          TEXT NOT NULL,
  allowed_destinations  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_config (
  action_id     TEXT PRIMARY KEY,
  enabled       INTEGER NOT NULL DEFAULT 0,
  schedule_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact (
  id          TEXT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  register    TEXT NOT NULL,
  consent     INTEGER NOT NULL,
  do_not_call INTEGER NOT NULL,
  ward_id     TEXT
);

-- Fact sheets are versioned, and old versions are never deleted. A call
-- records the version that was live when it was planned, so what the agent
-- said can be checked later against the wording that authorised it rather
-- than against whatever the institute has edited since.
CREATE TABLE IF NOT EXISTS fact_sheet (
  version     INTEGER PRIMARY KEY,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  entries_json TEXT NOT NULL
);
`;

export class Store {
  #db: DatabaseSync;

  constructor(path = ':memory:') {
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA journal_mode = WAL;');
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  // --- institute -----------------------------------------------------------

  saveInstitute(institute: Institute): void {
    this.#db
      .prepare(
        `INSERT INTO institute
           (id, display_name, callback_number, timezone, jurisdiction, allowed_destinations)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           display_name = excluded.display_name,
           callback_number = excluded.callback_number,
           timezone = excluded.timezone,
           jurisdiction = excluded.jurisdiction,
           allowed_destinations = excluded.allowed_destinations`,
      )
      .run(
        institute.id,
        institute.displayName,
        institute.callbackNumber,
        institute.timezone,
        institute.jurisdiction,
        JSON.stringify(institute.allowedDestinations),
      );
  }

  getInstitute(): Institute | undefined {
    const row = this.#db.prepare('SELECT * FROM institute LIMIT 1').get() as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;

    return {
      id: String(row.id),
      displayName: String(row.display_name),
      callbackNumber: String(row.callback_number),
      timezone: String(row.timezone),
      jurisdiction: String(row.jurisdiction),
      allowedDestinations: JSON.parse(String(row.allowed_destinations)) as string[],
    };
  }

  // --- which workflows are on ----------------------------------------------

  /**
   * Reads a workflow's configuration, defaulting to **off**.
   *
   * An unconfigured action is disabled and manual. Installing DeskHelp must
   * never be the same thing as starting to call people.
   */
  getActionConfig(actionId: string): ActionConfig {
    const row = this.#db
      .prepare('SELECT enabled, schedule_json FROM action_config WHERE action_id = ?')
      .get(actionId) as { enabled: number; schedule_json: string } | undefined;

    if (!row) {
      return { actionId, enabled: false, schedule: { kind: 'manual' } };
    }
    return {
      actionId,
      enabled: row.enabled === 1,
      schedule: JSON.parse(row.schedule_json) as Schedule,
    };
  }

  setActionConfig(config: ActionConfig): void {
    this.#db
      .prepare(
        `INSERT INTO action_config (action_id, enabled, schedule_json)
         VALUES (?, ?, ?)
         ON CONFLICT (action_id) DO UPDATE SET
           enabled = excluded.enabled,
           schedule_json = excluded.schedule_json`,
      )
      .run(config.actionId, config.enabled ? 1 : 0, JSON.stringify(config.schedule));
  }

  allActionConfigs(): ActionConfig[] {
    const rows = this.#db
      .prepare('SELECT action_id, enabled, schedule_json FROM action_config')
      .all() as { action_id: string; enabled: number; schedule_json: string }[];

    return rows.map((row) => ({
      actionId: row.action_id,
      enabled: row.enabled === 1,
      schedule: JSON.parse(row.schedule_json) as Schedule,
    }));
  }

  // --- contacts ------------------------------------------------------------

  /**
   * Replaces the contact list.
   *
   * Note what this does NOT touch: `contact_suppression` in the ledger. A
   * fresh spreadsheet cannot revive somebody who asked on a call to be left
   * alone, however cheerfully its consent column reads. See `import.ts`.
   */
  replaceContacts(contacts: readonly Contact[]): void {
    this.#db.exec('DELETE FROM contact');
    const insert = this.#db.prepare(
      `INSERT INTO contact (id, full_name, phone, register, consent, do_not_call, ward_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const contact of contacts) {
      insert.run(
        contact.id,
        contact.fullName,
        contact.phone,
        contact.preferredRegister,
        contact.consent ? 1 : 0,
        contact.doNotCall ? 1 : 0,
        contact.wardId ?? null,
      );
    }
  }

  contacts(): Contact[] {
    const rows = this.#db
      .prepare('SELECT * FROM contact ORDER BY full_name')
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      phone: String(row.phone),
      preferredRegister: String(row.register) as SpokenRegister,
      consent: row.consent === 1,
      doNotCall: row.do_not_call === 1,
      ...(row.ward_id ? { wardId: String(row.ward_id) } : {}),
    }));
  }

  // --- fact sheet ----------------------------------------------------------

  /** Publishes a new version. Earlier versions stay readable forever. */
  publishFactSheet(
    instituteId: string,
    approvedBy: string,
    entries: FactSheet['entries'],
    at = new Date(),
  ): FactSheet {
    const current = this.#db
      .prepare('SELECT MAX(version) AS version FROM fact_sheet')
      .get() as { version: number | null };

    const version = (current.version ?? 0) + 1;

    this.#db
      .prepare(
        `INSERT INTO fact_sheet (version, approved_by, approved_at, entries_json)
         VALUES (?, ?, ?, ?)`,
      )
      .run(version, approvedBy, at.toISOString(), JSON.stringify(entries));

    return {
      instituteId,
      version,
      approvedBy,
      approvedAt: at.toISOString(),
      entries,
    };
  }

  /** The version a call placed now would be planned against. */
  currentFactSheet(instituteId: string): FactSheet | undefined {
    const row = this.#db
      .prepare('SELECT * FROM fact_sheet ORDER BY version DESC LIMIT 1')
      .get() as Record<string, unknown> | undefined;

    if (!row) return undefined;
    return {
      instituteId,
      version: Number(row.version),
      approvedBy: String(row.approved_by),
      approvedAt: String(row.approved_at),
      entries: JSON.parse(String(row.entries_json)) as FactSheet['entries'],
    };
  }

  /** For checking, later, what the agent was allowed to say at the time. */
  factSheetVersion(instituteId: string, version: number): FactSheet | undefined {
    const row = this.#db
      .prepare('SELECT * FROM fact_sheet WHERE version = ?')
      .get(version) as Record<string, unknown> | undefined;

    if (!row) return undefined;
    return {
      instituteId,
      version: Number(row.version),
      approvedBy: String(row.approved_by),
      approvedAt: String(row.approved_at),
      entries: JSON.parse(String(row.entries_json)) as FactSheet['entries'],
    };
  }
}
