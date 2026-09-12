# Progress log

Newest first. One entry per working session. Keep entries factual — what was
done, what was learned, what broke. Opinions belong in `DECISIONS.md`.

---

## 2026-09-12 (later) — Engine core built, 57 tests green

Named **DeskHelp**. Folder renamed from `ghanti`; all identifiers updated.

### Toolchain findings

- **Node runs `.ts` directly on 24.16, with no flag and no build step.** There
  is no TypeScript dependency and `npm install` is not needed to run or test
  anything. `tsconfig.json` exists for editor support only.
- Node's type stripping is erasable-syntax-only. A TypeScript **parameter
  property** (`constructor(readonly x: T)`) is a hard error — caught in
  `factsheet.ts` and rewritten as an explicit field.
- `npm test` uses `node --test` auto-discovery.

### Built

| File | Responsibility |
| --- | --- |
| `src/core/types.ts` | Domain model. Encodes the two central rules as types: the agent asks and captures, and a `Claim` can never become a fact |
| `src/core/factsheet.ts` | Versioned fact sheets, scoped per action. Register fallback `hi-en → hi → en`, which never invents a translation |
| `src/core/guard.ts` | Seven fail-closed refusal checks, each returning a typed `RefusalReason` |
| `src/core/render.ts` | Builds the CALL-E task text and `recipient_result_schema` |
| `src/core/disposition.ts` | Decides what a finished call actually established |
| `src/core/ledger.ts` | Append-only `node:sqlite` ledger; reserve-before-dial |

### Design decisions taken while building

- **DeskHelp fails closed where the maintainers' `zapier-calle` fails open.**
  Their calling-window guard treats a supplied timezone as opt-in and enforces
  nothing without one, which is right for a generic connector. DeskHelp calls
  guardians and concerns minors, so an unconfigured institute cannot dial at
  all. Documented in `guard.ts`.
- **The idempotency key is derived from the authorisation, not the attempt** —
  `(institute, action, contact, period)`, SHA-256'd so internal ids are not
  leaked to the provider in the `Idempotency-Key` header.
- **Reservation happens before dialling.** A process that dies between
  reserving and dialling leaves a row that blocks the retry. The cost is
  occasional reserved-but-never-placed rows; a call not made is recoverable,
  a call made twice is not.
- **A reserved-but-never-placed call does not count as contact**, so it cannot
  suppress a legitimate later attempt.
- **The agent's own words can never ground an answer.** `disposition.ts`
  matches evidence quotes only against turns the recipient spoke. An agent
  paraphrasing itself and citing the paraphrase is the failure this exists to
  catch, and it has a test.
- **The engine is domain-agnostic.** Nothing in `src/core` knows what a student
  or a fee is. Education is a pack of configs; a `general` pack will follow so
  non-education users can enable what suits them.

### Test coverage

57 tests, all passing. Deliberately weighted towards refusal paths rather than
happy paths: unusable timezones, malformed numbers, ungrounded quotes,
voicemail, unrecognised statuses, opt-outs, duplicate reservations, crash
recovery.

### Retry policy and call-to-call memory (same session, 69 tests green)

Two questions from the user turned into the most consequential design work so
far.

**"How many times does the agent call?"** Led to
`docs/adr/0006-a-refusal-is-not-a-missed-call.md` in the CALL-E repo, written
by the maintainers after their own first live call: the recipient hung up
because the call felt like a scam, and the platform proposed a redial. Their
conclusion — a hang-up is a withdrawal of consent, and treating it as a
connectivity failure means the more clearly somebody refuses, the more they get
rung.

DeskHelp therefore splits what a provider collapses:

| Outcome | Disposition | Retryable |
| --- | --- | --- |
| Nobody picked up, voicemail | `unreached` | yes |
| Answered, then hung up | `declined` | **no** |
| Reached but ambiguous | `needs-human` | no |
| Asked not to be called again | `opted-out` | never, permanently |
| `failed`, `canceled`, unrecognised | `needs-human` | no |

`RETRYABLE_DISPOSITIONS` contains exactly one member. Defaults are 2 attempts,
4 hours apart, taken from the maintainers' own `retry-policy.js`, which calls
that "the conservative end of common practice". The provider's own retry offer
is never inherited.

**A real bug caught before it shipped.** CALL-E deduplicates on the
`Idempotency-Key` header at its end. Sending the ledger key again on attempt
two would have made CALL-E return the original call and place nothing — the
retry would have silently done nothing at all. Fixed by separating the two
keys: the ledger key identifies the authorisation, while CALL-E receives
`<ledgerKey>-a<n>`. Still derived from the authorisation plus a counter, never
a timestamp or random value, which would defeat deduplication entirely.

**"Each call should iterate on what was said last time."** Built `history.ts`.
A front-office person ringing the same parent twice does not start from
nothing; an automated caller that forgets is worse than the person it replaces.

Three rules keep it from leaking:

1. The prior-context block sits **after** the identity gate in the task text,
   and says so in its own first line. There is an ordering test.
2. A claim stays a claim forever. The agent may ask whether the thing happened;
   it may never assert that it did, and is explicitly told not to accuse
   anybody of breaking a promise.
3. The world is closed. Only evidenced answers, claims, and questions a named
   person has answered are carried. The agent is told not to refer to anything
   else, because a model given a transcript will otherwise quote from it.

This also closes the loop that made question-capture worth building: a question
captured on call one, answered by a person in the review queue, is delivered
verbatim on call two. Without it, every captured question was a dead end.

### Engine hardening pass — three real bugs found, 92 tests green

Ran a deliberate bug-hunt before moving on, at the user's request. Also added a
real typecheck: **Node strips types without checking them**, so type errors had
been passing silently. `npm run check` now runs `tsc --noEmit` and the tests.

**1. A fabricated quote could ground an answer.** Found by probing, not by the
suite. The recipient said only "Hmm."; the agent reported the quote "Hmm, yes I
will pay before Friday" and it settled as `answered` / `will_pay: yes`.

Cause: containment was matched in both directions, so any short recipient
utterance grounded an arbitrarily long fabricated quote padded around it. The
existing test passed only by luck — its fabricated quote did not happen to
contain the recipient's word. Fixed to one-directional containment, with
consecutive-turn joining so genuinely multi-turn quotes still match.

**2. An opt-out did not survive the period.** The worst of the three. Proved by
probe:

```
September settled as: opted-out
October reservation : reserved
October guard       : ALLOWED — call goes out
```

Cause: the opt-out lived only on the ledger row, which is scoped to one action
and one period. `guard()` consulted `contact.doNotCall`, which comes from
import and was never set by a call outcome. A parent who refused September's
fee reminder was called again in October — and by a different workflow the next
morning.

Fixed with a `contact_suppression` table keyed on `(institute, contact)` only,
written by `markSettled` itself so no call site can forget, and deliberately
kept out of the contacts table so a spreadsheet re-import cannot revive
somebody who asked to be left alone.

**3. Cross-contact history leakage was prevented by a comment.** `renderCall`
trusted the caller to have filtered `priorCalls`. `contactId` now lives on the
record and the renderer throws on a mismatch.

### The agent-speech audit, wired (`spoken.ts`)

`isApprovedStatement` had been written and never called: the engine checked
that a *recipient's* answer was grounded in what they said, but nothing checked
that what the *agent* said was approved. Rule 1 had a task-text prohibition and
no runtime check.

The naive version — flag any agent sentence not matching the fact sheet —
fires on every call, because greetings, questions and sign-offs are all
unmatched. It would be switched off within a week. So the audit targets the two
things that actually cause harm:

- **An unsourced number.** Amounts, dates, times. Digits are a good proxy:
  harmless agent speech rarely contains them and dangerous assertions almost
  always do. Runs of one or two digits are ignored as ordinary speech.
- **Committing vocabulary.** Discounts, waivers, guarantees, in English and
  Hinglish. Never approved wording anywhere, and offering one creates an
  obligation somebody must honour or retract.

Findings are advisory: they route to `needs-human` rather than discarding the
recipient's answers, which are the recipient's regardless of what the agent
said around them.

`renderCall` now returns `approvedTexts` so the caller feeds `judge()` directly
instead of reconstructing it — the same convenience gap that left the original
function dead.

### Scope

The deadline arithmetic was put to the user (engine done; client, configs,
scheduler, import, UI, skill, PR and video not started). They chose to keep the
full scope including the UI, on the grounds that the UI is what differentiates
the product. Recorded here as their decision.

### CALL-E client, education pack, runner, demo, scheduler, import — 154 tests green

**`calle.ts`.** Two independent gates: `DESKHELP_LIVE` exactly `"true"`, AND the
destination on the institute allow list. One gate can be left on by accident in
a shell profile; two cannot, because the second is a list somebody typed.
`FixtureTransport` is the default path, not a test double — the demo, the suite
and a reviewer's first run all go through the transport that cannot dial.

An ambiguous submission is never resent. A timeout on `POST /v1/calls` returns
`submission-unknown`, for a person to resolve with `calle call recover`. A
duplicate create is how one authorisation becomes two phone calls.

`hi-en` is sent as `hi-IN`: no provider exposes Hinglish as a language tag, so
the code-switching instruction stays in the task text where it belongs.

**Education pack — 14 workflows**, all declarative. A pack-wide invariants
suite checks every entry automatically, so a fifteenth action is covered
without anybody writing a test for it: disclosure must contain "automated",
no action may list `unknown` itself, `claimAnswers` must be answers the
question allows, nothing may exceed two attempts, child-related actions must be
`minor-involved`, only one action may cascade and it must turn on a single
question.

**`runner.ts`** — the assembly layer, in the order that is the safety:
suppression → guard → reserve → retry → render → place → judge → settle.

**`npm run demo`** runs the whole loop on fixtures with no credentials and
shows four scripted calls, each a different failure mode: a clean claim, a
captured question, a fabricated quote plus an unapproved figure, and a refusal
for missing consent. The safety properties are visible rather than asserted.

**A third bug, found by probing the pack.** `attendance-absence` retries after
one hour but sets a twelve-hour between-contacts limit, and the guard's
frequency check was counting the current authorisation's own attempt. The
retry could never fire — silently. Two limits governing different things had
been stacked. `Ledger.lastContactedAt` now takes an `excludePeriodKey`, so
`retry.ts` is the only authority on attempts inside one authorisation.

**`schedule.ts`.** Own scheduler, because CALL-E does not do recurrence.
Daily / weekly / monthly-on / monthly-before-end / manual, all computed in the
declared IANA timezone. "Two days before month end" is the 28th in September
and the 26th in February — a fixed day-of-month gets that wrong. Nothing is
armed in advance: the next run is computed from the clock each time, so
disabling a schedule cancels it completely. Period keys never contain a
timestamp, which is what makes a restarted scheduler harmless.

**`import.ts`.** The most dangerous file in the project: everything else
decides whether to call a number, this decides what the numbers are. It
refuses rather than copes — a malformed number is rejected with its line
number, never repaired, because repairing means guessing a country. Consent is
opt-in and only an explicit yes counts. Rejections are reported, never dropped:
an import that quietly skips forty rows is worse than one that fails.

The property that matters most has a test: re-importing a clean spreadsheet
that says `consent: yes` cannot revive somebody who opted out on a call.

### Renamed to DeskHelp.ai, and the product came first

The user reframed the project: the website is the product, to be sold after the
hackathon with payments added, and CALL-E is one integration inside it rather
than the point of it. That framing already matched the architecture, since
`src/core` reaches CALL-E only through the `CalleTransport` interface.

`Deskline` became `DeskHelp.ai` across 30 files, including env vars, the
database filename and the session cookie. The folder on disk is still
`deskline`; a handle kept the rename from completing and it is cosmetic.

### Auth, the platform shell, and a landing page

- `auth.ts`: scrypt password hashing with a per-account salt, constant-time
  comparison, server-side sessions in an HttpOnly SameSite=Lax cookie. Google
  sign-in is optional and its button is hidden unless `GOOGLE_CLIENT_ID` is
  set, because a button that cannot work is worse than no button. The ID token
  is verified with Google before a single field in it is believed.
- `store.ts`: what an institute configures, kept apart from the ledger's record
  of what happened. Every workflow ships disabled, so installing DeskHelp is
  never the same thing as starting to call people.
- `server.ts`: `node:http`, no framework, so the server half still runs with
  nothing installed. Every endpoint except the auth ones requires a session.
- A React and Vite UI: dashboard, workflow switches with schedule editors and
  dry run, contact import, the versioned fact sheet, the review queue, and
  settings that hold both live-calling gates.
- A landing page, so a stranger meets the product before a password box.

### Two bugs the UI surfaced

**A dry run consumed the run it was previewing.** `runAction` reserved in the
ledger whichever mode it was in, so pressing a button labelled Dry run quietly
cancelled the month's reminders: the real run an hour later skipped everybody
as already handled. `preview: true` now reads everything and writes nothing,
with a test that proves the ledger is untouched and the real run still reaches
both contacts.

**The preview panel rendered below fourteen cards**, off screen, so it looked
like the button did nothing. It is a modal now.

### On taking inspiration from a reference

The user pointed at a site whose design they liked. It blocks automated
fetching, so the way in was extracting frames from a screen recording with
ffmpeg. What was worth borrowing was structural: a floating pill nav, a dotted
grid, a centred hero, bento cells, a marquee, an FAQ. What was not: its
terminal-prompt button icon, which is its signature and was dropped once
copied. The palette, the copy, the reception drawing and the light dashboard
preview inside the page are DeskHelp's own.

### Next

The agent skill, the submission PR and the demo video.

---

## 2026-09-12 — Research, idea selection, project setup

### Hackathon research

- Read the Devpost page, rules, prizes and judging criteria.
- **Corrected a bad date.** An automated summary reported "Registration opens
  September 14" alongside "Deadline September 14", which could not both be
  true. Re-fetched asking for verbatim strings: the real deadline is
  **14 Sep 2026, 11:45pm SGT (9:15pm IST)**.
- Read `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/roadmap.md`,
  `docs/community-review-policy.md` and `docs/design-principles.md` in the
  submissions repo.

### Submission analysis

- Pulled all 380 PRs: 232 merged, ~125 open, ~37 closed-unmerged.
- Established that closed-unmerged are mostly authors' own superseded
  duplicates, not quality rejections — so the merge bar is low and merging is
  not the same as winning.
- Bucketed every PR title. Most saturated: verification 28, appointment
  confirmation 16, supplier quotes 16, healthcare 12, escalation 11.
- Extracted the DNA shared by the strongest entries (dry-run default, `unknown`
  as a real answer, transcript-traced fields, human-in-the-loop, masked
  numbers, idempotency, honest denominators).

### Four candidate directions investigated, three killed

- **Inbound** — killed. CALL-E places calls, it does not receive them.
- **Cost analytics** — killed. No cost, credit or duration field exists in the
  API or CLI.
- **Hinglish result checker** — killed on the user's push-back. It sits in the
  most saturated bucket and is a defensive product.
- **Multi-language batch** — killed. CALL-E already supports per-recipient
  `region` and `locale` plus `recipient_result_schema` natively.

Full reasoning and evidence in `DECISIONS.md`.

### Platform investigation

- Recommended Activepieces, then **found the blocker before writing any code**:
  pieces are monorepo-only (docs open with "Fork Repository"; the publish CLI
  scans `packages/pieces/`). Judges would have had to stand up nx, Docker,
  Postgres and Redis.
- Verified n8n community nodes *are* standalone npm packages
  (`n8n-nodes-starter`), then dropped the plugin surface anyway as redundant
  once DeskHelp has its own scheduler and UI.

### Idea settled

**DeskHelp** — a scheduled phone-work desk for schools, colleges and coaching
institutes. Domain came from the user, not from the assistant; education is
verified open (`coaching` 0, `tuition` 0, `admission` 0, `education` 0 across
all 380 PR titles).

Adjacent prior art found and recorded for citation: `roll-call` (PR #325, open,
strong) and `school payment assistant` (PR #387, closed unmerged).

### Setup completed

- Forked and cloned the submissions repo to `C:\Users\admin\calle-hack`.
- `python scripts/validate_repository.py` → **"Repository validation passed"**
  (exit 0). Note: this machine has `python`, not `python3`.
- CALL-E account created, API key stored in `.env`.
  - Two Notepad artefacts fixed: the file saved as `.env.txt`, and the key was
    written as `KEY = value` with spaces, which bash parsed as a command.
  - Verified by read-only probe, without printing the key: authenticated
    request returns `404 not_found`, unauthenticated returns `401 unauthorized`.
- Confirmed India is supported: region `IN`, +91, English / Hindi / Tamil.
- Confirmed `node:sqlite` works unflagged on Node 24.16 — no native build.
- Obtained an authorized test number; stored in `.env` only.

### Named and scaffolded

- Name went through Ghanti → Munshi → **DeskHelp** (user wanted English and
  modern). Verified `n8n-nodes-deskhelp` free on npm and unused in any CALL-E PR.
- Created `CLAUDE.md`, `docs/DECISIONS.md`, `docs/STATE.md`, this file, and
  `src/core/types.ts`.

### State at end of session

Planning complete. Build not started — paused at the user's instruction to
finish deciding first. Next action is the engine, starting with `factsheet.ts`.
