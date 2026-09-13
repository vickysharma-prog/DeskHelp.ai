# CALL-E feedback form

Answers for the feedback survey, which is its own prize (five winners, $200
each). Everything here happened during this build and can be reproduced.

---

## What is a calling-related problem you face on a regular basis?

I run a small company, and I am also the person who makes its phone calls.

Every week there is a list. Money owed since last month. Tomorrow's
appointments to confirm. A supplier to check the date with. The people who
enquired weeks ago and never heard back from anybody. None of it needs
judgement from me: each call is reading a sentence I already approved and
writing down what came back. There are just a couple of hundred of them and
they all have to happen before Friday.

So I make them at nine at night, because nine at night is the first gap in the
day, and I get through maybe a third. I cannot justify hiring somebody for work
that is mostly waiting for a phone to be picked up, so the rest of the calls
simply do not happen, and the money and the enquiries sit there.

## How painful is this problem? (1 to 10)

**8.**

Not an emergency, which is exactly why it never gets fixed. It is every single
week, it costs real money in unchased payments and dead enquiries, and the only
two options on offer are doing it badly myself or paying a full salary.

## What bugs or issues did you run into while using CALL-E?

Seven, all found against the live API. Every one of them was invisible against
a fixture.

**1. The shared number pool does not reach India, and nothing in the API says
so.** Four calls in a row failed with zero ring time and two different codes
(408 and 404). The request bodies were structurally identical to a call that
had connected twenty minutes earlier from the same number. I proved it was not
my payload, not one bad route and not the destination before I found the
answer in a Discord announcement. A distinct failure code meaning "no route to
this region from the shared pool, own a number" would have saved several hours
and four of my twenty free calls.

**2. `result_schema_invalid` does not say what it rejected.** My schema used an
open map for evidence quotes. The 400 named the whole schema and nothing else,
so I bisected it by hand. Returning the JSON pointer to the offending node
would turn a twenty minute hunt into a five second fix.

**3. `failure_code` has no published enum, and the real reason is only in
prose.** Classifying an outcome means pattern matching on an English sentence
that is free to change. Anything that reads results programmatically has to
guess.

**4. An attempt that never connected is reported as a no answer.** Both of my
real failures had `started_at` equal to `completed_at`, meaning no phone ever
rang, while the prose beside them said NO ANSWER. Those are completely
different facts: one is about the route, the other is about a person. Believing
the prose writes down something about a human being that nobody actually knows.
The attempt clock is the only reliable signal, and it is not documented as one.

**5. `transcript_turns` is on the attempt, not the recipient.** I read
`recipients[].transcript_turns`, found nothing, and every evidenced answer was
silently discarded. Nothing errored. The correct path is
`recipients[].attempts[].transcript_turns`.

**6. `speaker` has a third value.** Alongside `bot` and `user`, live calls
return turns labelled `unknown`, and some of those turns are the agent
speaking. Code written for two speakers will treat the agent's own words as
something the recipient said. For anything that grounds its output in evidence,
that is the most dangerous bug on this list, because the result is confident
and wrong about a real person.

**7. `offset_seconds` can be null.** Not on every turn, and not predictably.

## What would have given you a better experience with the documentation?

One page listing every field of the completed call object, with its type,
whether it can be null, and **which level it lives on**. Five of the seven
items above are a field being somewhere other than where I looked, or holding a
value I was not told existed.

Specifically:

- The exact JSON Schema subset `result_schema` accepts. In practice it is seven
  keywords (`type`, `properties`, `required`, `enum`, `items`, `description`,
  `additionalProperties`) and six types. I worked that out from 400s.
- The full set of values `speaker` can take, including `unknown`.
- The full set of values `failure_code` can take.
- A worked example of reading a finished call: where the transcript is, and how
  to tell a person who did not answer from a route that never connected.
- Shared pool region coverage next to the quickstart, not in an announcement.
  This is the first thing that will stop a new developer outside the US, and it
  stops them on their very first real call.

## How likely are you to use CALL-E in the future? (1 to 10)

**9.** Scale only, no text box on this question. The reasoning goes in the
answer below instead.

## Any other feedback?

I am launching what I built on it. The reason is not the demo: it is that
`recipients[]` takes a `region` and a `locale` per person, so one request can
call several people in several languages, and the code switching between Hindi
and English held up on a real call better than I expected.

**What worked, and is worth keeping.** Batch recipients with per-recipient
region and locale. `Idempotency-Key` honoured properly, which is what let me
derive a key from the authorisation instead of the attempt. A webhook with
polling as a fallback, so a restart never loses a result. Structured result
schemas at both the aggregate and per-recipient level. On the call itself, the
agent followed a recipient who switched language mid-sentence, refused an
unapproved question, and returned to its own question rather than drifting.
That last behaviour is the whole reason my product works.

**Two things I would add.**

1. **A `caller_number` on the call.** The caller number is an account-wide
   default set in the dashboard. An office calling from two departments, or a
   tenant serving several clients, needs it per call.
2. **Duration and cost on the completed call object.** Neither is exposed
   today, so a product built on CALL-E cannot show an operator what a run cost
   or how long a call ran without inferring it from timestamps.

## Discord

Posting this in `#support` is encouraged and worth doing. The bug list above
is the part worth sharing.

## Are you open to being contacted?

**Yes.** Use the address the CALL-E account is registered under. Read it off
the account rather than typing it from memory.
