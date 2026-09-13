# Devpost submission

Copy each block into the matching field. Nothing here needs editing.

Deadline: **14 Sep 2026, 11:45pm SGT** (9:15pm IST).

---

## Project name

```
DeskHelp
```

## Elevator pitch

Devpost caps this at 200 characters. This one is 155.

```
DeskHelp makes the calls your office repeats every week and tells you what each one settled. The front desk you cannot afford to hire yet, already at work.
```

## Built with

Type these as separate tags:

```
typescript
node.js
call-e
react
vite
sqlite
render
```

## Try it out links

```
https://deskhelp.onrender.com
https://github.com/vickysharma-prog/DeskHelp.ai
```

Demo sign-in, which is also a button on the page:

```
demo@deskhelp.ai / demo-northline-2026
```

## Video demo link

```
https://www.youtube.com/watch?v=bN7Rh2KrZKo
```

## Pull request URL

```
https://github.com/CALLE-AI/awesome-phone-call-agents/pull/539
```

## Testing instructions

Paste this block into the testing instructions field.

---

**Nothing to install.** Open <https://deskhelp.onrender.com> and press **Take a
look around the demo** on the sign-in page. No account, no card. The host sleeps
when idle, so the first load can take up to a minute.

Then, in this order:

1. **Workflows.** Fourteen kinds of call, each with its own switch and
   schedule. Press **Dry run** on any of them and scroll to *Exactly what the
   caller would say*: that is the whole instruction the caller follows,
   including everything it is forbidden to do. A dry run records nothing.
2. **Review queue.** Questions somebody asked that the callers were not allowed
   to answer, captured word for word. Type an answer into one. It is delivered
   on the next call to that person, verbatim.
3. **What we may say.** The approved wording. Callers may say these things and
   nothing else.
4. **Contacts.** Import from a spreadsheet, consent opt-in per row, numbers
   masked.

**To see an actual call**, the demo workspace is seeded, so watch the video
instead: <https://www.youtube.com/watch?v=bN7Rh2KrZKo>. The call is placed from
the product at **2:55**, and the two questions it refuses are at **4:35**.

**To run it yourself**, Node 22.5 or later and nothing else:

```bash
git clone https://github.com/vickysharma-prog/DeskHelp.ai
cd DeskHelp.ai && npm install
npm run demo    # end to end, no credentials needed
npm run check   # typecheck and 174 tests
npm start       # the product, at http://127.0.0.1:4321
```

---

## CALL-E account email

The address the CALL-E account is registered under. Fill this from the account,
not from memory.

---

## Project details

Paste everything below this line into the long description field.

### What it does

Every office has a list it works through by phone, and the list refills itself.
Money owed on Friday. Tomorrow's appointments to confirm. Somebody who has not
turned up. Twenty people who enquired in June and were never called back. It
takes a person most of a week, and the week after that it starts again.

DeskHelp makes those calls and tells you what each one settled.

You import the list your office already keeps, write down what your callers are
allowed to say, and switch on the kinds of call you make. Each one runs on the
schedule you set. Afterwards you read the conversation itself, not a summary of
it: the transcript with both sides apart, the answers it was willing to keep,
the promises filed as promises, and every question it refused.

Fourteen workflows ship written out and switched off, covering the calling a
school or coaching institute does weekly. The engine underneath has no idea
what a student, an invoice or a delivery is, so the fifteenth workflow, for any
office at all, is a description you write rather than software somebody builds
you.

### What happened on a real phone

Placed from the product to a handset I own, playing the part of a parent, in
the mix of Hindi and English people actually speak on the phone.

I asked for a discount in the middle of the call, which is not something the
office had approved an answer for:

> **Me:** कुछ डिस्काउंट मिल सकता है क्या इस महीने मेरे को?
>
> **DeskHelp:** Discount ya concession ke baare mein mujhe yahan koi jaankari
> nahi hai. Yeh cheez office hi confirm kar sakta hai.
>
> **DeskHelp:** Wapas apne sawaal par aate hain, aap sochte hain ki payment kab
> tak ho jayegi?

It declined, then went back to its own question instead of following me away
from it. I asked again about combining two months and it declined again. Both
questions reached the review queue in my own words, and the call closed by
reporting only what it had noted.

On another call I said I planned to join. That was stored as a claim carrying
the exact sentence I said, with `confirmed: false`, and nothing in the system
treated it as an enrolment. On a third, I answered for the named person rather
than as them. `identity_confirmed` came back `no` and not one answer was
attributed to that person.

Seven calls connected across the day. Every behaviour above also has a test.

### How I built it

One engine, and a workflow is configuration rather than code. An
`ActionDefinition` says who is called, what may be said to them, what a useful
answer looks like, and what the caller is forbidden to do. Adding a workflow is
an object in a file.

CALL-E is the calling layer. Everything about who to call, when, what may be
said and what the answer meant belongs to DeskHelp. The parts of the API it
uses:

| Feature | What it is for |
| --- | --- |
| `result_schema` and `recipient_result_schema` | Aggregate and per-recipient structured results, both closed objects |
| Batch `recipients[]` with per-recipient `region` and `locale` | Calling several people in several languages in one request |
| `Idempotency-Key` | Derived from the institute, action, contact and period, never from a timestamp |
| `metadata.workflow_run_id` | Tying a call back to the scheduled run that authorised it |
| `webhook_url` with a polling fallback | Terminal results that survive a restart |
| `transcript_turns` and `evidence` | Grounding every stored field in something the recipient actually said |
| `completion_confidence` | Recorded beside the verdict, never in place of it |

Node 22.5 or later, TypeScript, `node:sqlite`, and no runtime dependencies. The
interface is React and Vite. 174 tests and a typecheck, all green. It runs from
a clone with no credentials and dials nobody.

### What I learned

Five things were wrong in ways only a real call could show, and every one lived
in the seam between my code and the live API.

**A preview could reach the transport.** Reading a plan is supposed to dial
nobody, and the early return that guaranteed it only covered contacts the
guards had already refused. The test that was supposed to catch this checked
the ledger rather than the transport, so it passed while the bug was live. It
now runs against a transport that throws if anything touches it.

**CALL-E accepts a narrow slice of JSON Schema.** An open map inside a result
schema is rejected with `result_schema_invalid`. Schemas are now validated
against the supported keywords before the request is built, so the failure
arrives as a readable error at author time rather than a 400 at call time.

**The transcript is on the attempt, not the recipient.** Reading the wrong
level found no turns, which meant every evidenced answer was discarded and
every completed call was sent to a human.

**There is a third speaker label.** Alongside `bot` and `user`, real calls carry
turns labelled `unknown`, and some of them are the agent talking. Treating
anything that was not the bot as the recipient let the agent's own words stand
as evidence for an answer. Evidence now requires positive identification of the
recipient.

**A failed route is not a person who did not answer.** An attempt whose
`started_at` equals its `completed_at` never rang anybody, whatever the prose
says, and `failure_code` has no published enum to lean on. Reading it as a
no-answer wrote down a fact about somebody that nobody had, and it also spent
the five-day cooldown that should protect them from being called again.

The last one is the one I would keep. A fixture invents a plausible duration,
so a classifier built only on fixtures reads every connection failure as a
confirmed no-answer and reports it with confidence.

### What it will not do

The agent asks. It never answers, advises or commits. A question it has no
approved answer for is captured word for word and routed to a person, and you
answer it once in the review queue so the next call to that person delivers
your answer verbatim.

A stated intention stays a claim. "I will pay tomorrow" is stored as something
the person said, in their words, and never marks anything paid.

Timezone, region and calling hours are declared by the operator. A `+91` prefix
does not imply `Asia/Kolkata`, and DeskHelp refuses outside the window you
declared. India permits commercial calls between 9am and 9pm under TRAI's
TCCCPR rules.

On a call about a child, the first name is spoken only after the answerer
confirms they are the named guardian. Anyone else, voicemail included, hears
only that the office called and would like a call back.

Two separate things have to be true before a phone rings: live calling switched
on, and that exact number on an allow list an operator typed. There is no
wildcard.

### What is next

The fifteenth workflow, written by somebody whose office is not a school. The
engine is ready for it and the pack format is the whole of the work.

---

## Feedback survey

A separate prize, five winners at $200 each, and it needs the survey completed.
Worth doing after the form is in.
