# State of the project

**Read this first when resuming.** It says where the work stands and what the
next action is. Update it at the end of every working session.

Last updated: **2026-09-12**
Phase: **engine, platform and website built; skill, PR and video outstanding**

---

## ⏰ Time

**Deadline: 14 Sep 2026, 11:45pm SGT = 9:15pm IST.**

Nothing is built yet. The build has not started because planning was
deliberately front-loaded; several directions were killed with evidence rather
than discovered halfway through implementation (see `DECISIONS.md`).

The remaining time is short relative to the scope agreed. If it becomes clear
the full scope will not land, the correct move is **fewer workflows, fully
finished**, not many workflows half-done. The CALL-E review policy is explicit:
*"Accept a smaller complete contribution after removing unfinished features."*

---

## Where things stand

### Done

- Hackathon researched end to end: rules, deadline, judging criteria, review
  policy, merge gate, contribution structure
- All 380 submissions analysed for saturation and for the pattern shared by the
  strongest entries
- Idea settled: **DeskHelp**, a scheduled phone-work desk for education
  institutes
- Architecture settled: one engine + declarative action configs
- Safety model settled and written into `CLAUDE.md`
- Name settled: **DeskHelp**
- CALL-E account live, API key verified working (read-only probe: authenticated
  `404` vs unauthenticated `401`)
- Fork of the submissions repo cloned to `C:\Users\admin\calle-hack`;
  `validate_repository.py` passes on a clean tree
- `node:sqlite` verified working — no native build needed
- Authorized test number obtained (stored in `.env` only)

### Draft files present, nothing runs yet

```
C:\Users\admin\deskhelp\
├── CLAUDE.md
├── package.json
├── .gitignore
├── .env.example
├── docs/
│   ├── STATE.md        <- this file
│   ├── DECISIONS.md
│   └── PROGRESS.md
└── src/core/types.ts   <- domain model only
```

`src/core/types.ts` is the real starting point: it encodes the two core rules
(the agent asks and captures; a claim is not a fact) as types rather than as
prose, so a workflow author cannot quietly bypass them.

---

## Next action

**Build the engine** (`src/core`), in this order. Each step is testable on
fixtures with no network and no credentials.

1. `factsheet.ts` — versioned load, topic lookup scoped to an action
2. `render.ts` — task text per register (`en` / `hi` / `hi-en` / `ta`),
   disclosure first, bounded questions, explicit refusal instruction
3. `guard.ts` — consent, do-not-call, declared calling window, destination
   allow list, contact-frequency limit. Every refusal returns a `RefusalReason`
4. `idempotency.ts` — ledger keyed on `(action, contact, period)`
5. `disposition.ts` — fail-closed classification; evidence required where the
   question demands it
6. `calle.ts` — client with dry-run as the default path and live behind two
   independent gates
7. Fixtures + tests covering the refusal paths, not only the happy path

Then: action configs → scheduler → data import → UI → skill → PR → video.

---

## Open questions

| # | Question | Blocks |
| --- | --- | --- |
| 1 | Which workflow becomes the demo video story? | Deliberately deferred until after the build, so the best-turned-out workflow can be chosen |
| 2 | UI stack — React + Vite, or server-rendered HTML? | The UI step. Server-rendered is lighter for judges to run; React is nicer to demo |
| 3 | GitHub repo name under `vickysharma-prog` | Publishing. Default to `deskhelp` |
| 4 | Does a Hindi transcript come back Devanagari or romanised? | Parser behaviour. **Unknown until the first live Hindi call** — budget 1–2 calls to find out. Handle both regardless |

---

## Standing reminders

- **20 CALL-E calls total.** Development, testing and the video all come out of
  this. Reserve 3–4 for the video.
- **Real phone number never leaves `.env`.** Fixtures use masked or
  standards-reserved fictional numbers.
- A feedback-survey prize exists ($200 × 5 winners) and is nearly free to
  claim. Do it regardless of how the build goes.
- Cite `roll-call` (PR #325) as prior art in the attendance workflow.
