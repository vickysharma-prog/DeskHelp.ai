# Project Story

Paste everything below the line into Devpost's **About the project** field.

Two notes before you do.

The headings are Devpost's own and say "we". The body says "I", because you
built this alone and that is the part that reads honest. Leave it, or swap
every "I" for "we" if you would rather.

The opening describes the kind of office anybody who has started one has sat
in. If you have your own moment, a particular night, a particular list, put
that in instead. A real one always beats a true one.

---

## Inspiration

I am an early stage founder. I am also, most weeks, the receptionist.

Nobody warns you about that part. You cannot justify a salary for a front desk
yet, so every call that has to happen lands on whoever is holding a phone, and
that is you. I make mine at nine at night, because nine at night is the first
gap in the day. Money owed since last month. Tomorrow's appointments to
confirm. Ask the supplier whether the date still holds. Ring back the people
who enquired weeks ago and never heard from anybody again.

I hate doing it. Not because it is hard. Because it is not. Not one of those
calls needs judgement from me. Every single one is a person reading a sentence
that was already approved and writing down what came back. The only difficulty
is that there are two hundred of them and they all have to happen before
Friday.

So I do them late, badly, and only about a third of them. The alternative is
hiring somebody, which is a salary every month for work that is mostly waiting
for a phone to be picked up.

I wanted a third option, and it did not exist, so I built it.

## What it does

DeskHelp works through the call list your office already keeps, speaks to
people on your behalf, and tells you what each call settled.

You import the list, write down what your callers are allowed to say, and
switch on the kinds of call you make. Everything ships switched off. Each one
runs on the schedule you set, and afterwards you read the conversation itself
rather than a summary of it: both sides of the transcript, the answers it was
willing to keep, the promises filed as promises and never as facts, and every
question it refused.

Fourteen workflows ship written out. Underneath, a workflow is not code. It is
a short description of who to call, what may be said to them, what a useful
answer looks like, and what the caller must never do. The engine has no idea
what a student, an invoice or a delivery is, so the fifteenth workflow, for an
office nothing like the first fourteen, is a description somebody writes rather
than software somebody builds them.

## How we built it

TypeScript on Node, `node:sqlite`, and no runtime dependencies at all. It runs
from a clone with no credentials and dials nobody. The interface is React and
Vite, and calls are placed from the product itself rather than from a terminal,
because an office is never going to open a terminal.

CALL-E is the calling layer and nothing more. Who to call, when, what may be
said, and what the answer meant are all mine.

What I use from the API: structured result schemas for both the aggregate and
each recipient. Batch recipients carrying their own region and locale, so
several languages go out in one request. An idempotency key derived from the
office, action, contact and period rather than from a timestamp. Run metadata,
so a call traces back to the scheduled run that authorised it. A webhook with a
polling fallback, so a restart never loses a result. Transcript turns and
evidence, to ground every field I store in something the person actually said.

Two separate things have to be true before a phone rings. Live calling switched
on, and that exact number on an allow list somebody typed by hand. No wildcard.
I wrote that gate before I wrote the thing it guards.

## Challenges we ran into

**Finding out that my version of the problem was not the problem.** I had lived
this, so I assumed I already understood it. I did not. I went and spoke to
people who actually run offices, the founders doing the calling themselves and
the employees who do it all day, and asked them to walk me through a real week
rather than describe it.

Two things came back again and again, and neither was what I expected. Nobody
was nervous about a machine making calls. They were nervous about it saying
something nobody had approved, and about being told a call had gone well when
it had not. The failure they described was never a rude call. It was a register
saying a payment was settled because somebody had said they would pay tomorrow,
and a month going by before anyone noticed.

That is why the agent only ever asks and never answers, and why a stated
intention is stored as a claim carrying the person's own words rather than as a
fact. Neither of those came out of my own experience. I had only ever seen my
half of it.

**The day the phone would not ring.** Fourteen workflows, a scheduler, a review
queue, a hundred and seventy four tests green. Then I pressed the button for
real and nothing happened. No ring, no error worth reading, and fewer records
on the dashboard than the number of times I had tried. Four weeks of work, and
it would not do the one thing it exists to do.

So I stopped guessing and started proving. The same number worked at 12:07 and
failed at 12:24, so it was not the number. Two numbers failed with two
different codes, 408 and 404, so it was not one bad route. The request bodies
were identical in shape, so it was not my payload. That left the one thing I
could not see from my own machine. The shared pool of outbound numbers does not
reach India.

Nothing I wrote was ever going to fix that. The account had to own a number.
Two dollars a month, a US local line, an identity check, and then I pressed the
button again and my phone rang on the desk beside me.

## Accomplishments that we're proud of

For the demo I called myself and played a parent, in the mix of Hindi and
English people actually speak on the phone. Halfway through I asked for a
discount, which nobody had approved an answer for.

It said it did not have that information and the office would confirm. Then it
said, in Hindi, let us come back to my question, and asked its own question
again.

I sat there holding the phone and grinned. Not because it answered well.
Because it refused, and then it did not get lost. I asked again about combining
two months and it declined again, and both questions were waiting in the review
queue afterwards in my own words, ready to be answered once so the next call to
that person delivers my answer word for word.

Later I said I planned to join. It stored that as a claim carrying my exact
sentence, with `confirmed: false`, and nothing treated it as a decision. On
another call somebody answered for the named person instead of as them, and it
came back with `identity_confirmed: no` and attributed nothing at all to that
person.

Seven calls connected across that day, and all three behaviours held every
time.

## What we learned

Real calls taught me things no test of mine had caught, because every one lived
in the space between my code and the world.

A preview could reach the code that dials. I had a test for exactly this, and
it passed, because it checked the ledger afterwards instead of the transport
itself. It now runs against a transport that throws if anything so much as
touches it.

There is a third speaker label. I had written for two, the bot and the person,
and real calls also carry turns marked `unknown`, some of which are the agent.
That let the agent's own words stand as evidence for an answer a human never
gave, which is the worst class of bug in this product, because the output is
confident and wrong about a real person.

The one I would keep is smaller. An attempt whose start and finish are the same
instant never rang anybody, whatever the text beside it says. A fixture invents
a plausible duration for you, so a classifier built only on fixtures reads every
failed connection as a confirmed no answer, reports it with confidence, and you
never find out.

## What's next for DeskHelp.Ai

I am launching this as a real product, not shelving it when the hackathon ends.
It was never a hackathon idea. It was a thing I needed, and the hackathon is
what made me finish it.

The immediate work is the fifteenth workflow, written by somebody whose office
is nothing like the first fourteen. A clinic confirming tomorrow's
appointments. A workshop asking a supplier whether the date still holds. A
recruiter chasing a document that never arrived. Every one of those is a
description somebody writes, not a release I have to ship, and that is the
whole bet: the offices know their own calls better than I ever will.

After that, inbound. Right now DeskHelp makes the calls a front desk makes. The
other half of that job is answering the phone when it rings.

An office that already has somebody on the front desk gets their week back. An
office that does not gets something better. That founder at nine at night, and
I am one of them, stops being the receptionist. The calls go out on a schedule
while they sleep, the answers are waiting in the morning, and the hire they
could not justify yet is a hire they do not need yet.

It is not that a machine can talk. It is that the cheapest employee you were
about to hire was going to spend most of their day listening to a phone ring.
