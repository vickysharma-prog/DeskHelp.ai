/**
 * Who is allowed to open DeskHelp.
 *
 * The thing behind this login is a list of families' phone numbers, a record
 * of what each of them said, and a button that makes real calls. So the bar is
 * not "keep the curious out", it is "an account is the only way in".
 *
 * Passwords are hashed with scrypt from `node:crypto` — deliberately slow, per
 * account salt, constant-time comparison. Sessions are random 256-bit ids
 * stored server-side, so signing out actually ends a session rather than
 * asking a cookie to forget itself.
 *
 * Google sign-in is optional and off unless `GOOGLE_CLIENT_ID` is configured.
 * When it is, the browser obtains an ID token and the server verifies it with
 * Google before trusting a single field in it. An unverified token is a string
 * anybody can type.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface Account {
  readonly id: string;
  readonly email: string;
  readonly instituteName: string;
  /** 'password' or 'google'. An account has exactly one way in. */
  readonly provider: 'password' | 'google';
  readonly createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS account (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  institute_name  TEXT NOT NULL,
  provider        TEXT NOT NULL,
  password_hash   TEXT,
  password_salt   TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  token      TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

/** Sessions last a working week, then a person signs in again. */
const SESSION_DAYS = 7;

const KEY_LENGTH = 64;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, KEY_LENGTH).toString('hex');
}

/**
 * Compares in constant time.
 *
 * A plain `===` on a hash leaks, through timing, how many leading characters
 * were right. It is a small leak and an easy one to close.
 */
function matches(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class Auth {
  #db: DatabaseSync;

  constructor(path = ':memory:') {
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA journal_mode = WAL;');
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  /** True before anybody has signed up. The UI shows setup rather than login. */
  isEmpty(): boolean {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM account').get() as {
      n: number;
    };
    return row.n === 0;
  }

  #rowFor(email: string): Record<string, unknown> | undefined {
    return this.#db
      .prepare('SELECT * FROM account WHERE email = ?')
      .get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  }

  #toAccount(row: Record<string, unknown>): Account {
    return {
      id: String(row.id),
      email: String(row.email),
      instituteName: String(row.institute_name),
      provider: String(row.provider) as Account['provider'],
      createdAt: String(row.created_at),
    };
  }

  createPasswordAccount(args: {
    readonly email: string;
    readonly password: string;
    readonly instituteName: string;
  }): Account {
    const email = args.email.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error('That does not look like an email address.');
    }
    // Length beats complexity rules, which mostly produce "Password1!".
    if (args.password.length < 10) {
      throw new Error('Use at least 10 characters. Length matters more than symbols.');
    }
    if (!args.instituteName.trim()) {
      throw new Error('The institute needs a name. It is spoken on every call.');
    }
    if (this.#rowFor(email)) {
      throw new Error('An account already exists for that email.');
    }

    const id = randomBytes(12).toString('hex');
    const salt = randomBytes(16).toString('hex');
    const createdAt = new Date().toISOString();

    this.#db
      .prepare(
        `INSERT INTO account
           (id, email, institute_name, provider, password_hash, password_salt, created_at)
         VALUES (?, ?, ?, 'password', ?, ?, ?)`,
      )
      .run(id, email, args.instituteName.trim(), hashPassword(args.password, salt), salt, createdAt);

    return this.#toAccount(this.#rowFor(email)!);
  }

  /**
   * Verifies a password.
   *
   * The error is the same whether the email is unknown or the password is
   * wrong, so the response cannot be used to discover which addresses have
   * accounts.
   */
  verifyPassword(email: string, password: string): Account {
    const row = this.#rowFor(email);
    const wrong = new Error('Email or password is not right.');

    if (!row || row.provider !== 'password') throw wrong;
    if (!matches(hashPassword(password, String(row.password_salt)), String(row.password_hash))) {
      throw wrong;
    }
    return this.#toAccount(row);
  }

  /**
   * Signs in, or creates an account, for a Google identity that the SERVER has
   * already verified. Never call this with an unverified token payload.
   */
  upsertGoogleAccount(email: string, instituteName: string): Account {
    const normalised = email.trim().toLowerCase();
    const existing = this.#rowFor(normalised);
    if (existing) return this.#toAccount(existing);

    const id = randomBytes(12).toString('hex');
    this.#db
      .prepare(
        `INSERT INTO account (id, email, institute_name, provider, created_at)
         VALUES (?, ?, ?, 'google', ?)`,
      )
      .run(id, normalised, instituteName.trim() || normalised, new Date().toISOString());

    return this.#toAccount(this.#rowFor(normalised)!);
  }

  /** Starts a session. The token is what goes in the cookie. */
  startSession(accountId: string, now = new Date()): string {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);

    this.#db
      .prepare(
        `INSERT INTO session (token, account_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(token, accountId, now.toISOString(), expires.toISOString());

    return token;
  }

  /** Resolves a cookie to an account, or undefined. Expired sessions are swept. */
  accountForSession(token: string | undefined, now = new Date()): Account | undefined {
    if (!token) return undefined;

    const row = this.#db
      .prepare(
        `SELECT a.* FROM session s
           JOIN account a ON a.id = s.account_id
          WHERE s.token = ? AND s.expires_at > ?`,
      )
      .get(token, now.toISOString()) as Record<string, unknown> | undefined;

    if (!row) {
      this.#db.prepare('DELETE FROM session WHERE expires_at <= ?').run(now.toISOString());
      return undefined;
    }
    return this.#toAccount(row);
  }

  /** Signing out ends the session server-side, not just in the browser. */
  endSession(token: string | undefined): void {
    if (token) this.#db.prepare('DELETE FROM session WHERE token = ?').run(token);
  }
}

/**
 * Verifies a Google ID token with Google.
 *
 * The token arrives from the browser, so nothing in it can be believed until
 * Google confirms the signature and says which client it was issued for. A
 * token minted for somebody else's application is not a login here.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string,
): Promise<{ email: string; name: string }> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!response.ok) throw new Error('Google did not recognise that sign-in.');

  const payload = (await response.json()) as {
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
  };

  if (payload.aud !== expectedClientId) {
    throw new Error('That sign-in was issued for a different application.');
  }
  if (!payload.email) throw new Error('Google returned no email address.');
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new Error('That Google account has no verified email address.');
  }

  return { email: payload.email, name: payload.name ?? '' };
}
