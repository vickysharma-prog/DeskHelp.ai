# Contributing to DeskHelp

Thanks for looking. This file is short on purpose: three rules carry almost
everything, and the rest is ordinary.

## Before anything

```bash
npm run check     # typecheck and 174 tests, about five seconds
npm run demo      # the whole loop on scripted calls, no credentials
```

Node 22.5 or later. The server has no runtime dependencies and Node runs the
TypeScript directly, so there is nothing to install unless you are touching the
web interface.

## The three rules

Everything else in this file follows from these. They are not style
preferences: breaking one of them puts a wrong call on a real family's phone.

### 1. A workflow asks. It never answers, advises or commits.

Confirm something, remind somebody, collect a reason, capture a preference.
Those are safe.

Advising which course suits a student, granting a concession, negotiating a due
date: those are not, at any setting. No amount of configuration makes an
automated caller competent to do them.

The test: **could a temp on their first morning do this from a script, passing
anything unusual to a colleague?** If yes, it belongs here.

A question the caller cannot answer from approved wording is captured word for
word and handed to a person. It is never improvised.

### 2. A claim is not a fact.

"I will pay tomorrow" is something a parent said. It is stored with their own
words attached and it never marks a fee as paid.

Anything commitment-shaped goes in `claimAnswers` so the engine keeps it apart
from an answer for the whole life of the record.

### 3. Never guess a critical value.

Timezone, region, jurisdiction and calling hours are declared by the operator.
They are never worked out from a phone number, a locale, a language or the
server's clock. A guess about which country somebody is in becomes a call at
3am, and the person who receives it has no idea why.

The same applies to phone numbers on import. A malformed number is rejected
with its row number. It is never repaired, because repairing means guessing a
country.

## Adding a workflow

This is configuration, not code. Add an `ActionDefinition` to
`src/packs/education/actions.ts`, or start a new pack beside it.

```ts
export const libraryBookReturn: ActionDefinition = {
  id: 'library-book-return',
  title: 'Library book return',
  purpose: 'Remind a family that a borrowed book is overdue.',
  audience: 'guardian',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated call from the institute library about a ' +
    'book that is overdue.',
  questions: [
    {
      id: 'will_return',
      ask: 'When will they return it?',
      answers: ['this-week', 'later', 'lost'],
      requiresEvidence: true,
      claimAnswers: ['this-week', 'later'],
    },
  ],
  factSheetTopics: ['office-hours'],
  minHoursBetweenContacts: 168,
  cascade: false,
  retry: DEFAULT_RETRY,
};
```

Add it to `EDUCATION_PACK` and you are done. The pack-wide invariants suite in
`actions.test.ts` then checks it automatically, without anybody remembering to
write a test:

- the disclosure says the caller is automated, and is a real sentence
- no action lists `unknown` itself, because the engine appends it
- every `claimAnswers` entry is an answer that question actually allows
- no action allows more than two attempts
- anything concerning a child is marked `minor-involved`
- only one action cascades, and it turns on a single question
- the rendered task text carries the full boundary

If a check fails, the check is usually right.

## Working on the engine

`src/core` knows nothing about education, and it should stay that way. If you
find yourself writing `student` or `fee` in there, the thing you are adding
belongs in a pack.

The order in `runner.ts` is the safety, not an implementation detail:

```
suppression → guard → reserve → retry decision → render → place → judge → settle
```

Reserving comes before placing so a crash between them blocks the retry rather
than producing a second call. Judging comes before settling so a disposition is
never written that nobody worked out.

## Tests

Weighted towards the refusals rather than the happy path. When you add
something, the useful test is usually the one where it goes wrong: an unusable
timezone, a quote nobody said, a duplicate reservation, a crash halfway.

Three bugs in this codebase were found by writing a small script to probe a
suspicion rather than by the suite. If something feels wrong, probe it. If the
probe confirms it, the fix comes with a regression test.

`npm test` alone is not enough. Node strips TypeScript types without checking
them, so a type error passes silently. `npm run check` runs `tsc --noEmit`
first, and that is the command to run before opening a pull request.

## Placing a real call

Only ever to a number you are authorised to call.

```bash
npm run live -- --action fee-reminder            # shows the words, dials nothing
npm run live -- --action fee-reminder --confirm  # asks for the last four digits
```

Four things must be true before anything rings: `DESKHELP_LIVE=true` exactly,
`CALLE_API_KEY` set, `DESKHELP_TEST_PHONE` set, and `--confirm` typed. Your
number lives in `.env` and nowhere else, and everything printed masks it.

Never put a real number in source, a fixture, a test or a commit message. The
examples use the `NXX-555-01XX` range, which exists so that nobody's actual
phone rings in a demo.

## Pull requests

- One thing per pull request.
- `npm run check` passes.
- If you changed behaviour, a test shows the old behaviour failing.
- Say what you did and why. The why is the part nobody can reconstruct later.

## Licence

DeskHelp is [MIT](LICENSE). By contributing you agree your work is released
under it.
