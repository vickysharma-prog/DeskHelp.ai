/**
 * Bringing an institute's contact list in from a spreadsheet.
 *
 * This is the most dangerous file in the project. Everything else decides
 * whether to call a number; this decides what the numbers ARE. A digit
 * transposed here is a stranger's phone ringing with somebody else's child's
 * attendance on it, and no downstream guard can catch that because the row
 * looks perfectly valid.
 *
 * So it is built to refuse rather than to cope:
 *
 *   **Nothing is repaired.** "98765 43210" is not silently turned into
 *   "+919876543210", because doing so requires guessing a country — the exact
 *   thing `CLAUDE.md` rule 3 forbids. The row is rejected with its line number
 *   and a person fixes the sheet.
 *
 *   **Consent is opt-in, and only an explicit yes counts.** A blank cell is
 *   not consent. Neither is "maybe", "1?", or anything the parser does not
 *   recognise.
 *
 *   **A re-import can never revive somebody who opted out.** Suppression lives
 *   in the ledger, not on the contact record, precisely so that overwriting
 *   the contact cannot clear it. This file says so out loud because it is the
 *   mistake somebody will otherwise make later.
 *
 *   **Rejections are reported, never dropped.** An import that quietly skips
 *   forty rows is worse than one that fails, because the institute believes
 *   it called everybody.
 */

import { isValidE164, maskPhone } from './guard.ts';
import type { Contact, SpokenRegister } from './types.ts';

export interface RejectedRow {
  /** 1-based line number in the source file, including the header. */
  readonly line: number;
  readonly reason: string;
  /** The offending value, masked if it looks like a phone number. */
  readonly value: string;
}

export interface ImportResult {
  readonly contacts: readonly Contact[];
  readonly rejected: readonly RejectedRow[];
  /** Things that imported but an operator should look at. */
  readonly warnings: readonly string[];
}

/**
 * A minimal RFC 4180 reader.
 *
 * Written rather than depended on so the project keeps its property of running
 * with nothing installed. It handles quoted fields, embedded commas, escaped
 * quotes, CRLF and a BOM, which is the whole of what a spreadsheet export
 * produces.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

/** Only these mean yes. Everything else, including blank, means no. */
const AFFIRMATIVE = new Set(['yes', 'y', 'true', '1', 'haan', 'ha']);

const REGISTERS = new Set<SpokenRegister>(['en', 'hi', 'hi-en', 'ta']);

function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Reads a contact sheet.
 *
 * Required columns: `id`, `name`, `phone`, `consent`.
 * Optional: `register`, `do_not_call`, `ward_id`.
 */
export function importContacts(csv: string): ImportResult {
  const rows = parseCsv(csv);
  const rejected: RejectedRow[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    return { contacts: [], rejected, warnings: ['The file is empty.'] };
  }

  const header = rows[0]!.map(normaliseHeader);
  const index = (name: string) => header.indexOf(name);

  for (const required of ['id', 'name', 'phone', 'consent']) {
    if (index(required) === -1) {
      return {
        contacts: [],
        rejected: [
          { line: 1, reason: `Missing required column "${required}".`, value: header.join(',') },
        ],
        warnings,
      };
    }
  }

  const contacts: Contact[] = [];
  const seenIds = new Set<string>();
  const seenPhones = new Map<string, string>();

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r]!;
    const line = r + 1;
    const cell = (name: string) => (cells[index(name)] ?? '').trim();

    const id = cell('id');
    const name = cell('name');
    const phone = cell('phone');

    if (!id) {
      rejected.push({ line, reason: 'Missing id.', value: cells.join(',') });
      continue;
    }
    if (seenIds.has(id)) {
      rejected.push({ line, reason: `Duplicate id "${id}".`, value: id });
      continue;
    }
    if (!name) {
      rejected.push({ line, reason: 'Missing name.', value: id });
      continue;
    }

    if (!isValidE164(phone)) {
      // Deliberately not repaired. Turning "98765 43210" into a +91 number
      // means guessing a country, which is how somebody in another country
      // gets called about a child they have never met.
      rejected.push({
        line,
        reason:
          'Phone is not valid E.164. It must start with "+" and a country ' +
          'code, with no spaces. It will not be corrected automatically.',
        value: phone,
      });
      continue;
    }

    const previous = seenPhones.get(phone);
    if (previous) {
      // Two rows, one phone. Usually two siblings sharing a guardian, which is
      // legitimate — but it means two calls to one person, so it is surfaced.
      warnings.push(
        `Line ${line}: ${maskPhone(phone)} also appears for "${previous}". ` +
          'That person will be called once per row.',
      );
    } else {
      seenPhones.set(phone, id);
    }

    const registerRaw = (cell('register') || 'hi-en') as SpokenRegister;
    let register: SpokenRegister = 'hi-en';
    if (REGISTERS.has(registerRaw)) {
      register = registerRaw;
    } else if (cell('register')) {
      warnings.push(
        `Line ${line}: unknown register "${cell('register')}". Using hi-en.`,
      );
    }

    const consent = AFFIRMATIVE.has(cell('consent').toLowerCase());
    if (!consent) {
      // Imported, but the guard will refuse to call them. Better than dropping
      // the row: the institute can see who is missing consent and go and ask.
      warnings.push(
        `Line ${line}: "${name}" has no recorded consent and will not be called.`,
      );
    }

    const wardId = cell('ward_id');

    contacts.push({
      id,
      fullName: name,
      phone,
      preferredRegister: register,
      consent,
      doNotCall: AFFIRMATIVE.has(cell('do_not_call').toLowerCase()),
      ...(wardId ? { wardId } : {}),
    });

    seenIds.add(id);
  }

  if (contacts.length === 0 && rejected.length > 0) {
    warnings.push('No rows imported. Fix the rejections above and try again.');
  }

  return { contacts, rejected, warnings };
}

/**
 * A reminder, in code, of something that is true elsewhere.
 *
 * An opt-out earned on a call is stored in the ledger's `contact_suppression`
 * table, keyed on (institute, contact) alone. Importing a fresh spreadsheet
 * replaces contact records; it does not touch that table, so somebody who
 * asked to be left alone stays left alone even if the sheet says
 * `consent: yes`.
 *
 * Anybody tempted to "clean up" by moving suppression onto the contact record
 * should read `ledger.ts` first.
 */
export const SUPPRESSION_SURVIVES_IMPORT = true;
