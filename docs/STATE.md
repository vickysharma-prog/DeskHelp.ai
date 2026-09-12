# State of the project

**Read this first when resuming.** It says where the work stands and what the
next action is. Update it at the end of every working session.

Last updated: **2026-09-12, late evening**
Phase: **built, deployed and pushed. The live call and the video remain.**

---

## Where things live

| | |
| --- | --- |
| Code | `C:\Users\admin\deskline` (the folder is still named `deskline`; the product is DeskHelp.ai) |
| GitHub | <https://github.com/vickysharma-prog/DeskHelp.ai> |
| Live site | <https://deskhelp.onrender.com> |
| Demo login | `demo@deskhelp.ai` / `demo-northline-2026`, and a button on the sign-in page |
| CALL-E repo clone | `C:\Users\admin\calle-hack` (fork: `vickysharma-prog`) |

---

## Done

- Engine, 14 workflows, scheduler, contact import, review queue, call-to-call
  memory. 163 tests and a typecheck, all green.
- Accounts, sessions, the web interface, a landing page, and a seeded demo of
  124 families with 14 questions waiting in the queue.
- Repository public under MIT, with a README carrying four screenshots taken by
  `scripts/screenshots.mjs`, and a CONTRIBUTING built around the three rules.
- Deployed on Render from `render.yaml`. Every push to `main` redeploys, so the
  live link is always current.
- The link carries an Open Graph card, a favicon, robots and a sitemap.
- `.env` holds the CALL-E key, the live flag and the test number. The live gate
  is open locally and verified: `npm run live` prints "Gate: OPEN".

## Not done

1. **One real call.** Nothing has been dialled yet. All twenty free calls are
   unspent.
2. **The demo video.** About three minutes, on YouTube, publicly visible.
3. **The video on the landing page.** One line: `DEMO_VIDEO_ID` in
   `ui/src/pages/Landing.jsx`. The section already exists and shows a branded
   placeholder until an id is set.
4. **The submission pull request.** `apps/web/deskhelp/README.md` plus a line
   each in `apps/README.md` and the CALL-E repo's root `README.md`. No code
   goes in it: it is a catalogue pointer to this repository, following the
   pattern of the merged entries `speakeasy` and `supplycall-ai`.
5. **The Devpost form**, and the feedback survey, which is a separate prize.

---

## Tomorrow, in order

Only after **9am IST**. The Indian calling window is 09:00 to 21:00 and the
guard refuses outside it. This was hit on the evening of the 12th at 21:52,
which is the safety working rather than a bug.

```bash
npm start                                          # one terminal
npm run live -- --action fee-reminder --confirm    # another
```

It asks for the last four digits of the number before it dials.

The recording, in one take:

1. The dashboard: 124 contacts, 14 questions waiting
2. A dry run on a workflow, showing the exact words
3. The `--confirm` command, and the phone ringing
4. Speak Hindi and English mixed, the way a parent actually would
5. **Ask something the fact sheet does not cover**, for instance whether a
   scholarship is available. This is the moment that separates DeskHelp from a
   voice bot: the caller refuses to answer and writes the question down.
6. The structured result in the terminal: the answers, the claim, the captured
   question
7. Refresh the browser: the same call on the dashboard and in the queue
8. Answer the question in the queue

---

## Standing reminders

- **20 CALL-E calls, none spent.** Keep three or four for the video; the first
  take is never the one that ships.
- **The real number never leaves `.env`.** Fixtures use the NXX-555-01XX range
  that exists so nobody's actual phone rings in a demo.
- Render's free tier sleeps after fifteen minutes. Open the link yourself a
  minute before handing it to anybody.
- The public deployment cannot dial: `DESKHELP_LIVE` is false there and the
  allow list is empty.
- Cite `roll-call` (PR #325) as prior art in the submission.
