# State of the project

**Read this first when resuming.** It says where the work stands and what the
next action is. Update it at the end of every working session.

Last updated: **2026-09-13, evening**
Phase: **built, deployed, proven on real calls, video published. The pull request remains.**

---

## Where things live

| | |
| --- | --- |
| Code | `C:\Users\admin\deskline` (the folder is still named `deskline`; the product is DeskHelp.ai) |
| GitHub | <https://github.com/vickysharma-prog/DeskHelp.ai> |
| Live site | <https://deskhelp.onrender.com> |
| Demo login | `demo@deskhelp.ai` / `demo-northline-2026`, and a button on the sign-in page |
| CALL-E repo clone | `C:\Users\admin\calle-hack` (fork: `vickysharma-prog`) |
| **Deadline** | **14 Sep 2026, 9:15pm IST** |

---

## Done

- Engine, 14 workflows, scheduler, contact import, review queue, call-to-call
  memory. **174 tests** and a typecheck, all green.
- Accounts, sessions, the web interface, a landing page, and a seeded demo of
  124 families with questions waiting in the queue.
- **Calls are placed from the product.** A `Call now` button on each workflow,
  scoped to one named person per press, with the name and number on the button.
- **A Calls page**, which reads back the whole conversation: the transcript
  with the two speakers apart, the answers kept, the promises filed as
  promises, the questions refused.
- Adding one contact by hand, without writing a CSV.
- Repository public under MIT, README with screenshots, CONTRIBUTING.
- Deployed on Render from `render.yaml`. Every push to `main` redeploys.
- **Submitted**: <https://github.com/CALLE-AI/awesome-phone-call-agents/pull/539>,
  three files and no code, validator green.
- The public deployment still cannot dial: `DESKHELP_LIVE` is false there and
  the allow list is empty. Verified after every deploy.

## Proven on real calls, not just in tests

Five calls connected across the day and did everything the product claims:

| Behaviour | Evidence |
| --- | --- |
| Calls in Hinglish, follows the recipient | Agent opened in English, switched to Hindi when the parent did |
| Refuses what is not on the sheet | Scholarship, joining date and a discount all refused, three times in one call, without softening |
| Captures the question verbatim | All three landed in the review queue in the caller's own Hindi |
| A promise is a promise, not a fact | `will_join = yes` stored as a claim carrying the exact quote, `confirmed: false` |
| The identity gate holds | A parent answering for the named student produced `identity_confirmed = no`, and nothing was attributed to them |
| The contact cooldown holds | A second reminder an hour later was refused: "Last contacted 1.0h ago; this action requires 120h between calls" |
| It refuses and then returns to its own task | Asked for a discount mid-call, it declined and said "Wapas apne sawaal par aate hain", then repeated its question. Asked again about combining two months, it declined again |
| It reports only what it noted | Closed by summarising the callback request and the two questions it was sending on, and nothing else |

Free workflow and contact pairs, as of the last session: everything except
`fee-reminder` and `fee-followup` on R. Sharma, and `fee-followup`,
`demo-class-followup` and `staff-absence-reason` on S. Verma.

---

## Not done

1. **The Devpost form**, and the feedback survey, which is a separate prize.
2. **A shorter cut of the video.** The published one runs 7:29. The rules say
   it "should be less than three (3) minutes" and that "judges are not required
   to watch beyond three", and the first real call starts at 2:55. Not a
   disqualification, but everything that proves the product sits past the mark
   a judge may stop at.

---

## The video

Published: <https://www.youtube.com/watch?v=bN7Rh2KrZKo>, 7:29, and wired into
the landing page. It was planned as three parts:

1. **About ninety seconds on the product.** What it is, what an institute
   actually does with it, the fourteen workflows, the dry run showing the exact
   words, the review queue.
2. **A real call, placed from the product.** Press `Call now`, the phone rings,
   speak Hinglish as a parent would. Ask something nobody approved, and press
   once when it refuses. Then open **Calls** and read the conversation back.
3. **Close on the line:** *now your agent can call on behalf of you.*

Two things to get right in the take:

- **Let the agent finish.** Speaking over its opening makes it start again. One
  take has that line four times in a row.
- **Confirm identity plainly.** Answer "Kya aap S. Verma hain?" with "haan,
  main S. Verma bol raha hun". Anything less produces `needs-human`, correctly.

---

## Standing reminders

- **20 CALL-E calls, 12 spent, 8 left.**
- **CALL-E's shared number pool does not reach India.** The account now owns
  `+1 208-428-4381` as its default outbound number, $2.00/month, identity
  verified. That is what made calling work. Their announcement of 6 and 7 Sept
  documents the restriction.
- **The real numbers never leave `.env`.** `DESKHELP_TEST_PHONE` and
  `DESKHELP_TEST_PHONE_2`. Fixtures use the NXX-555-01XX range.
- Render's free tier sleeps after fifteen minutes. Open the link yourself a
  minute before handing it to anybody.
- **Nothing in the submission references anybody else's project.** No prior
  art, no comparison, no "unlike X". The entry stands on its own work.
- **Nothing in the submission is written as a shortcoming.** The two gates are
  described as a design, never as what the demo cannot do.
- Speech to text sometimes renders a stumbled greeting as something
  unrepeatable. Check a transcript before putting it in a screenshot;
  `DESKHELP_SHOT_CALL` picks which call `scripts/screenshots.mjs` opens.
