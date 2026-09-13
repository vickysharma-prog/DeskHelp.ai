# Decision log

Every decision, with the evidence behind it. **Ideas that were investigated and
ruled out are recorded here on purpose** — re-proposing one costs a session.

Last updated: 2026-09-13

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

### ❌ Killed: citing other entries as prior art

An earlier plan was to name adjacent submissions in the README and in source
comments, framing how DeskHelp differed from each. Every version of that
writing did the same two things: it spent the reader's attention on somebody
else's work, and it described DeskHelp in the smaller half of the comparison.

**DeskHelp publishes no reference to anybody else's project.** Not in the
submission, not in the README, not in a source comment. The patterns involved —
confirm who answered before naming a child, treat a zero-length attempt as a
failed route — are ordinary engineering, not anybody's invention, and the code
here is written from scratch. The work stands on itself.

The same rule covers self-deprecation. Nothing DeskHelp publishes is phrased as
a shortcoming. The safety gates are a design and are described as one.

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


### ✅ Calls are placed from the product, not a command line

An institute does not have a terminal, and neither does a judge watching a
demo. `Call now` sits on the workflow, asks who to ring, and puts the name and
the number on the button.

It is deliberately **not** the preview endpoint with the flag removed. That one
runs across every contact, and a button labelled "Call now" that fans a
workflow out over the whole list is not something an office should be able to
lean on by accident. One press is one call to one person.

Whether a phone rings is still the gate's decision, so the same button on the
public demo walks the same path and dials nobody. That is what makes the live
link safe to hand to strangers who can also see Settings.

### ✅ The Calls page, and storing the transcript

Every other screen shows a conclusion. This one shows what those conclusions
were drawn from, which is the only way anybody can check them. An institute
that cannot read the call has to take the summary on trust, and a summary
nobody can check is worth very little when the subject is somebody's fees or
somebody's child.

The transcript is **stored** rather than fetched on view, so reading a call
does not depend on holding a live API key. The public demo has no key.

### ✅ A call that never connected is not a contact

Four provider failures in a row each started a five-day cooldown on that
person. An institute whose route has a bad afternoon would be locked out of
calling anybody for a week, and the ledger would claim those families had been
contacted.

A connected call always carries the agent's own opening line, so no turns at
all means the line was never joined. Those no longer count. A call that did
reach somebody still counts whatever it concluded.

### ✅ CALL-E's narrow JSON Schema slice is checked before sending

CALL-E accepts `type`, `properties`, `required`, `enum`, `items`,
`description` and `additionalProperties: false`, and nothing else. A schema
mistake is otherwise discovered by a round trip that returns
`result_schema_invalid`, which reads like the call failed rather than the
request being malformed. The vocabulary is the one the maintainers' own `kept`
documents and enforces.

### ✅ A refusal beats a non-connection, and an unknown outcome beats both

CALL-E reports an unanswered phone as `status: failed` with the reason only in
prose, and its own documentation says the API does not guarantee a distinct
no-answer or callee-decline value. So the prose is a hint, never a verdict.

The order is the safety. A hang-up wins over a no-answer, because mistaking a
refusal for a missed call means the more clearly somebody refuses the more
often they are rung. An attempt whose start and finish are the same instant is
a connection failure and says nothing about the recipient, whatever the prose
claims. A fixture invents a plausible duration and hides this entirely; it only
surfaces against the live API.
Anything still unrecognised reaches a person, as ADR 0006 requires.

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

---

## Part 4 — Facts established by placing real calls

Expensive to learn, and none of them visible against a fixture.

| Fact | Evidence |
| --- | --- |
| CALL-E's shared number pool does not reliably reach India | Their own announcements, 6 and 7 Sept: the pool "may be unavailable in certain regions" and is "intended for development and dialing tests" |
| The fix is to own an outbound number | A US local number, $2.00/month, plus identity verification to enable outbound. The number itself lives in the CALL-E dashboard and in `.env`, never here. Every call since has connected |
| The API has no way to choose the caller number | Nothing in any of the 380 submissions sends one. CALL-E picks the account default, which is set in the dashboard |
| Failed attempts still cost credits | 6 credits each, against 47 for a connected minute |
| There is no account, usage or billing endpoint | `/v1/account`, `/v1/usage`, `/v1/balance`, `/v1/credits`, `/v1/limits` all 404. The dashboard is the only source |
| A hackathon testing hotline exists | `+1 276-322-9632`, English, offered by a maintainer for exactly this disruption |
| Speech to text will occasionally render a stumbled greeting as an obscenity | Seen once. A transcript is a record, so the fix is to choose a different call for a screenshot, never to edit one |
