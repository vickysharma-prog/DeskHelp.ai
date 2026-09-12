# Decision log

Every decision, with the evidence behind it. **Ideas that were investigated and
ruled out are recorded here on purpose** — re-proposing one costs a session.

Last updated: 2026-09-12

---

## Part 1 — Ideas that were killed

### ❌ Inbound calling

**Killed because CALL-E cannot receive calls.** It places them.

Evidence: every occurrence of "inbound" across the CALL-E submissions repo is
one of three things — an inbound HTTP webhook, a Twilio bolt-on
(`muster-phone-to-report`, `e-mploye`), or an explicit *hard exclusion* in a
contributor's own README ("No SMS, email, inbound calls, multilingual flow,
bulk calling or automatic retry").

Building it would mean Twilio plus a public webhook origin plus signature
verification, and the judged artifact would then be mostly not-CALL-E.

### ❌ Cost / usage analytics dashboard

**Killed because the API exposes no cost data.**

Evidence: `cost|credit|usage|billing|duration|minute` grepped across all 287
lines of the CALL-E CLI reference returns two irrelevant hits. No cost field,
no credit balance, no call duration. Spend could only be inferred from event
timestamps against a price we do not know — a dashboard whose headline number
is a guess. That fails the review policy's bar on materially false claims.

### ❌ "Hinglish result checker" as the product

**Killed on the user's instinct, and they were right.**

A layer that verifies whether a call's structured result is trustworthy sits in
the single most saturated bucket in the hackathon — **28 of 380 submissions**
are verification / evidence-gating plays. Tagging it "multilingual" was
rationalisation, not differentiation.

It is also a defensive product: it tells you what *not* to trust, shows a
business judge a technical detail rather than an outcome, and dies the moment
CALL-E improves its own parsing.

*Note: the underlying techniques survive inside DeskHelp's engine — claim vs.
fact, evidence-bound answers, `unknown` as an answer. They are plumbing, not
the pitch.*

### ❌ "One task, many languages, one schema" as the product

**Killed because CALL-E already does it natively.**

Evidence: `POST /v1/calls` accepts batch `recipients[]`, each with its own
`region` and `locale`, plus a `recipient_result_schema` for per-recipient
structured output. A wrapper around that is a thin wrapper.

*Note: DeskHelp uses this native capability. It is just not the product.*

### ❌ Activepieces piece

**Killed because pieces are monorepo-only.**

Evidence: the Activepieces "Start Building" docs open with *Step 1: Fork
Repository*, and `publish-piece.mdx` says the CLI *"scans the `packages/pieces/`
directory"*. There is no standalone scaffold.

That removed the only reason Activepieces was chosen over alternatives —
"judges can run it themselves". Running it would have meant standing up the
whole monorepo: nx/turbo, Docker, Postgres, Redis.

### ❌ n8n community node (deferred, not permanently dead)

**Dropped because it is redundant once DeskHelp has its own scheduler and UI.**

An n8n node only serves institutes that already run n8n. Indian coaching
classes run on WhatsApp and Excel. Real-world overlap is near zero, so shipping
it would be scope inflation dressed as coverage.

It also costs: `CONTRIBUTING.md` says *"choose **one** scoped contribution"*,
and Devpost accepts a single PR URL. Two PRs split reviewer attention.

This forfeits the `plugins/` folder's zero-competition slot. That is an
acceptable trade: the slot was a tactic, not value. The repo's strongest
entries — `muster`, `sticker`, `local-atlas`, `afterword`, `kept`, `casechaser`,
`ringer` — all live in the crowded `apps/` folder. Depth wins, not folder
choice.

---

## Part 2 — Decisions taken

### ✅ Domain: education (schools, colleges, coaching institutes)

Chosen because it is a domain the author actually knows, and "Real World
Impact" is scored on credibility. An invented domain reads as invented.

Saturation check against all 380 PR titles: `coaching` 0, `tuition` 0,
`admission` 0, `education` 0.

**Known adjacent prior art, to be cited rather than ignored:**

- **`roll-call` (PR #325, open)** — first-hour absence verification for
  schools. A genuinely strong entry: transcript-checked verdicts, minimal
  disclosure, idempotency ledger, safeguarding alerts. DeskHelp's attendance
  action overlaps it and must cite it explicitly, framing the difference
  (scheduled batch across many workflows vs. a single-morning safeguarding
  tool).
- **`school payment assistant` (PR #387, closed unmerged)** — a simpler fee
  reminder. The space is open.

### ✅ Shape: standalone platform, not a plugin

DeskHelp ships its own UI and its own scheduler. It is the author's product and
is meant to be sold after the hackathon.

This also fixes a credibility problem with the earlier plugin-first plan: a
product that only works once the institute has separately installed an
automation platform is not a product an institute would actually adopt.

### ✅ Surfaces: Platform + Agent Skill. One PR.

The skill (`skills/` in the CALL-E repo) makes the workflows installable in any
Agent Skills host — Claude Code, Cursor, Codex.

### ✅ All ~14 workflows ship; the institute enables what it wants

Feasible because every workflow has the same shape — call, disclose, ask a few
bounded questions, capture, write back. So it is one engine plus declarative
configs, not fourteen implementations.

Presented as *"one piece with several small, well-scoped actions sharing a
core"* rather than *"one agent does everything"*, because the CALL-E roadmap
states a preference for *"small, reusable examples over large frameworks."*

### ✅ Name: DeskHelp

Front **desk** + phone **line**. Modern, English, and it says what the product
is in one word.

Rejected: Ghanti, Munshi, Swagat, Haazri (user wanted English and modern);
Switchboard (`surplus-switchboard` already exists in the repo); FrontDesk,
Deskmate (npm taken and generic).

Availability: `n8n-nodes-deskhelp` free on npm; no CALL-E PR mentions it.

### ✅ Node with no native dependencies

`node:sqlite` is built into Node (verified working on Node 24.16 without a
flag). No `better-sqlite3`, so no native compilation — judges on Windows, macOS
or Linux can `npm install` and run.

### ⏸ Demo video story — deferred, deliberately

To be chosen **after** the build, based on which workflow actually turned out
best. Candidates: demo-class follow-up (zero competition, safest), scheduled
fee reminder (shows the scheduler, our real differentiator), admission interest
follow-up (shows fact-sheet + refusal + question capture most clearly).

---

## Part 3 — Facts established by investigation

Worth keeping because they were expensive to establish.

| Fact | Evidence |
| --- | --- |
| Deadline is 14 Sep 2026, 11:45pm SGT (9:15pm IST) | Verified verbatim on the Devpost page after an earlier summary garbled it |
| 380 PRs total: 232 merged, ~125 open, ~37 closed-unmerged | GitHub API |
| Closed-unmerged are mostly authors' own superseded duplicates, not quality rejections | Read the closed list: Rubenskiada ×3, AKSHAJ-SHELL ×2, Akunimal ×2 |
| Genuine rejections are out-of-scope vendor listings, generic non-workflow skills, and emergency/crisis boundary violations | PRs #19, #259, #29 |
| Most saturated buckets | verification 28 · appointment-confirm 16 · supplier quotes 16 · healthcare 12 · escalation 11 · invoice 10 · logistics 10 · lead qualification 9 |
| Merge bar is low; prize bar is not | 232 merged. Merging is not winning. |
| Winning entries share a DNA | dry-run default · `unknown` a valid answer · every field traced to a transcript span · human-in-the-loop before commitment · masked numbers · idempotency · honest denominators · one genuinely hard problem |
| India is supported | region `IN`, +91, English/Hindi/Tamil, international line |
| TRAI: commercial calls 9am–9pm only; DND registry; `140` prefix; penalties to ₹10 lakh | TCCCPR 2018 |
| Plugin contributions can be small | `dify-template` is 3 files / 137 lines; `n8n-calle-api` is 4 files / 510 lines |
| Maintainers' own reference plugin sets the quality bar | `zapier-calle`: 65 files / 11,399 lines, with calling-window, opt-out, retry-policy, idempotency, disposition, grounding, redaction |
