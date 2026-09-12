# DeskHelp

**The front desk that calls back.**

Scheduled phone-work desk for schools, colleges and coaching institutes. One
engine, many bounded call workflows, every answer traced to what was actually
said on the call.

DeskHelp replaces the repetitive outbound calling an institute's front office
does every week: chasing fees, confirming admissions enquiries, following up
demo classes, telling guardians a child is absent, booking parent-teacher
slots, finding a substitute teacher.

---

## Read this first

Three documents carry the live state of this project. Read them before doing
anything, in this order:

| File | What it holds |
| --- | --- |
| [`docs/STATE.md`](docs/STATE.md) | Where the work stands right now, and the next action |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every decision and its reason, **including ideas already killed** |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Dated log of what actually got done |

`DECISIONS.md` matters most. Several plausible-sounding directions were
investigated and ruled out with evidence. Re-proposing one of them wastes a
session. Check it before suggesting an approach.

---

## Context

DeskHelp is being built for the **CALL-E: Your Code Is Calling** hackathon
(AI Rudder), but it is a standalone product that outlives the hackathon and is
intended to be sold.

- Live site: <https://deskhelp.onrender.com>
- Repository: <https://github.com/vickysharma-prog/DeskHelp.ai>
- Hackathon: <https://call-e.devpost.com/>
- Submission: a pull request to <https://github.com/CALLE-AI/awesome-phone-call-agents>
- Local clone of that repo: `C:\Users\admin\calle-hack` (fork: `vickysharma-prog`)
- **Deadline: 14 Sep 2026, 11:45pm SGT — 9:15pm IST**

Judging is on four criteria, weighted equally: Real World Impact, Quality of
Idea, Technical Implementation, and Product Experience & Demo. The demo video
is a full quarter of the score.

---

## Architecture

One engine. A workflow is **not code** — it is a declarative `ActionDefinition`
describing who is called, what may be said to them, and what a useful answer
looks like. Adding the fifteenth workflow is a config file, not a new module.

```
                    ENGINE  (src/core)
  ├─ fact sheet loader (versioned per institute)
  ├─ task renderer (en / hi / hi-en code-switched / ta)
  ├─ refusal boundary + unanswered-question capture
  ├─ calling-window guard (declared IANA timezone)
  ├─ consent + do-not-call
  ├─ idempotency ledger  key = (action, contact, period)
  ├─ fail-closed disposition
  └─ masked writeback
                       |
        ┌──────────────┴──────────────┐
        v                             v
  ACTION CONFIGS                  SURFACES
  14 workflows,                   1. Platform  (own UI + scheduler)
  declarative only                2. Agent Skill (skills/ in CALL-E repo)
```

CALL-E is the calling layer and nothing else. This matches the CALL-E repo's
own stated architecture: *"CALL-E SDKs, provider APIs, authentication, call
execution, billing primitives, and provider-side controls belong upstream with
CALL-E itself. This repository is for community artifacts around those
primitives."*

DeskHelp owns scheduling because CALL-E deliberately does not do recurrence.
The CALL-E repo's rule: *"Host scheduler handles recurrence. Phone-call
provider handles exactly one call per scheduled run."*

---

## Non-negotiable rules

These are product rules, not style preferences. Breaking any of them either
harms a real person or blocks the pull request as a Must Fix.

### 1. The agent asks. It never answers, advises, or commits.

An **ask-shaped** task is safe: confirm, remind, collect a reason, capture a
preference. An **answer-shaped** task is not: advising which course suits
someone, granting a fee discount, negotiating.

A question the agent cannot answer from the approved fact sheet is **captured
verbatim and routed to a person** — never improvised. The recipient hears a
plain "I will have someone confirm that and call you back."

### 2. A claim is not a fact.

"I will pay tomorrow" is recorded as a `Claim` carrying the recipient's own
words. It never marks a fee as paid. Payment is only ever established by the
counter or the online portal. The same separation applies to every
commitment-shaped answer.

DeskHelp never collects payment details on a call. Not card, not UPI, not
bank details. It reminds; it does not collect.

### 3. Never guess a critical value.

Timezone, region, country code and jurisdiction are **declared by the
operator**, never inferred from a phone number, locale, language or IP. A
`+91` prefix does not imply `Asia/Kolkata`.

This mirrors the CALL-E repo's `docs/design-principles.md` Principles 3 and 4,
and the maintainers' own `plugins/zapier-calle/lib/calling-window.js`, which
treats a supplied timezone as the opt-in and enforces nothing without one.

### 4. Minors are disclosed minimally.

On a guardian call about a student, only the student's **first name and class**
may be spoken, and only after the answerer has confirmed they are the named
guardian. Voicemail and anyone else hear nothing identifying — only that the
institute called and would like a call back.

This is the pattern the maintainers have already blessed in `roll-call` (PR
#325). DeskHelp follows it deliberately and cites it as prior art.

### 5. Dry-run is the default. Always.

Nothing dials without explicit opt-in. `DESKHELP_LIVE` must be
exactly `"true"`, **and** the destination must appear on an explicit allow
list. There is no wildcard. Tests, demos and the default CLI path never touch
the network.

### 6. `unknown` is a real answer.

A person who did not say is not the same as a person who was never reached,
and neither is a failure. Refusals stay in the denominator. A completed call
is never reported as a completed outcome.

---

## Using CALL-E properly

"Thorough skill usage" is a scored criterion. DeskHelp uses the real API
surface, not just a one-line `createAndWait`:

| Feature | Used for |
| --- | --- |
| `result_schema` + `recipient_result_schema` | Aggregate and per-recipient structured results |
| batch `recipients[]` with per-recipient `region` + `locale` | Multi-language calling, natively |
| `Idempotency-Key` | Derived from `(action, contact, period)` — never from the attempt |
| `metadata.workflow_run_id` | Correlating a call back to the scheduler run |
| `webhook_url` + polling fallback | Terminal results, resumable after a restart |
| `transcript_turns`, `evidence`, `completion_confidence` | Grounding every stored field |

Supported for India: region `IN`, languages English, Hindi, Tamil,
international line. Full list in the CALL-E integrations README.

---

## Credentials and the test number

- All secrets live in `.env`, which is gitignored. `.env.example` documents
  the shape and is safe to commit.
- **The real test phone number is in `.env` only.** It must never appear in
  code, README, fixtures, commit messages or documentation. Repository rules
  require masked or standards-reserved fictional numbers everywhere else.
- Call budget is **20 free CALL-E calls total** — development, testing and the
  demo recording all come out of it. Reserve several for the video; the first
  take is never the one you ship.

---

## Repository conventions (for the submission PR)

Run from `C:\Users\admin\calle-hack`:

```bash
python scripts/validate_repository.py     # note: `python`, not `python3`, on this machine
python scripts/create_branch.py <type>/<short-kebab-summary>
```

- All repository-facing content in **English**.
- A skill is `SKILL.md` + `references/safety.md` + `references/examples.md`.
  Do **not** put a `README.md` inside a skill directory.
- README list entries use the prescribed one-line format.
- One scoped contribution per PR; Devpost accepts a single PR URL.

---

## Commands

```bash
npm run demo       # end-to-end, fixtures only, no network, no credentials
npm run preview    # render a call plan and exit without dialling
npm test           # node --test
```
