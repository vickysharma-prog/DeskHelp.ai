/**
 * The page a stranger lands on.
 *
 * Its job is to answer "what is this and is it for me" before anybody is asked
 * for an email address. Signing in is a button here, not the front door.
 *
 * Nothing on this page claims a customer, a logo, a testimonial or a number
 * that does not exist. A product on its first day has to be honest about being
 * on its first day, and invented proof is the fastest way to lose somebody who
 * checks.
 */

import { Logo } from '../Logo.jsx';
import { LoginScene } from '../LoginScene.jsx';
import { DemoVideo } from '../DemoVideo.jsx';
import { greeting } from '../greeting.js';

/**
 * The YouTube id of the demo. Empty until the video is up, and the section
 * hides itself rather than showing a broken player.
 */
const DEMO_VIDEO_ID = 'bN7Rh2KrZKo';

const WORKFLOWS = [
  'Fee reminder',
  'Absence check',
  'Admission follow-up',
  'Demo class follow-up',
  'Parent meeting slots',
  'Document chase',
  'Repeated absence',
  'Requested callback',
  'Staff absence',
  'Find a substitute',
  'Next-term enrolment',
  'Announcement',
  'End-of-term feedback',
  'Fee follow-up',
];

const EDU_USES = [
  'Fee reminders, before and after the due date',
  'A child missing from the morning batch',
  'Admission enquiries that went quiet',
  'Demo class follow-ups',
  'Parent meeting slots',
  'Finding cover when a teacher cannot come in',
];

const OFFICE_USES = [
  'Staff attendance, and why somebody has not arrived',
  'Confirming an appointment or a delivery window',
  'Chasing a document somebody owes you',
  'Checking a vendor can still make the date',
  'A short feedback survey after a job',
  'Telling a list of people one approved thing',
];

const BENTO = [
  {
    title: 'It calls in the language they speak',
    body: 'Hindi, English, or the mix of both people actually use on the phone. It follows the parent rather than insisting on one.',
  },
  {
    title: 'It never improvises',
    body: 'Asked something it has no approved answer for, it says somebody will confirm and writes the question down. You answer once, and the next call delivers it.',
  },
  {
    title: 'A promise is not a payment',
    body: '"I will pay tomorrow" is stored as something a parent said, in their words. It never marks a fee paid. Money is taken at your counter or portal.',
  },
  {
    title: 'It runs on your calendar',
    body: 'Two days before the month ends. Weekdays at half past nine. Or only when you press the button. You see the next three dates before switching it on.',
  },
];

const STEPS = [
  {
    title: '1. Bring your list',
    body: 'Import the spreadsheet your office already keeps. A number in the wrong shape is rejected with its row number, never quietly corrected.',
  },
  {
    title: '2. Write what you may say',
    body: 'Fees, timings, the admission process. Your callers may say these things and nothing else.',
  },
  {
    title: '3. Switch on what you need',
    body: 'Pick the calls your office makes and set when they run. Everything starts off.',
  },
];

const FAQ = [
  {
    q: 'Will it call anybody by accident?',
    a: 'No. A real call needs two separate things: live calling turned on, and that exact number on your allow list. Until both are true, every call is simulated and nothing dials.',
  },
  {
    q: 'What happens if somebody asks to be left alone?',
    a: 'It stops, permanently, across every workflow. Re-importing a spreadsheet that says otherwise will not bring them back, because the opt-out is not kept on the contact record.',
  },
  {
    q: 'Is this legal for calls in India?',
    a: 'Commercial calls are permitted between 9am and 9pm under TRAI rules. DeskHelp refuses outside that window, in the timezone you declared. It never guesses a timezone from a phone number.',
  },
  {
    q: 'What about calls that concern a child?',
    a: 'The student is not named until whoever answered confirms they are the guardian. Anyone else, and voicemail, hear only that the institute called and would like a call back.',
  },
  {
    q: 'Can I see what it would say before it says it?',
    a: 'Yes. Every workflow has a dry run showing the exact words, the questions it asks, and everything it is forbidden to do. A dry run records nothing and dials nobody.',
  },
];

/** Rows that look like a real morning, not grey placeholder bars. */
const MOCK_ROWS = [
  ['Sharma', 'Fee reminder', 'answered', 'ok'],
  ['Verma', 'Absence check', 'needs a person', 'warn'],
  ['Iyer', 'Demo follow-up', 'answered', 'ok'],
  ['Khan', 'Fee reminder', 'not reached', ''],
];

function PreviewMock() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-bar">
        <span />
        <span />
        <span />
      </div>
      <div className="mock-body">
        <div className="mock-side">
          <div className="mock-brand" />
          {['Dashboard', 'Workflows', 'Review queue', 'Contacts', 'What we may say', 'Settings'].map(
            (label, i) => (
              <div key={label} className={i === 0 ? 'mock-nav on' : 'mock-nav'}>
                {label}
              </div>
            ),
          )}
        </div>
        <div className="mock-main">
          <div className="mock-banner">
            <b>{greeting()}</b>
            <i>2 questions are waiting for an answer.</i>
          </div>
          <div className="mock-tiles">
            {[
              ['Dry run', 'nothing dials'],
              ['4 / 14', 'workflows on'],
              ['312', 'contacts'],
              ['2', 'waiting'],
            ].map(([v, l]) => (
              <div className="mock-tile" key={l}>
                <b>{v}</b>
                <i>{l}</i>
              </div>
            ))}
          </div>
          <div className="mock-rows">
            {MOCK_ROWS.map(([name, flow, label, tone]) => (
              <div className="mock-row" key={name}>
                <span className="mock-dot" />
                <span className="mock-who">
                  <b>{name}</b>
                  <i>{flow}</i>
                </span>
                <span className={`mock-pill ${tone}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Landing({ onSignIn, hasDemo, signedIn = false }) {
  // Somebody already signed in is looking at this page on purpose, so every
  // call to action becomes the way back to their own desk rather than an
  // invitation to sign in again.
  const cta = signedIn ? 'Back to your desk' : 'Get started';
  return (
    <div className="landing">
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a className="lp-brand" href="#top">
            <Logo />
            <span className="wordmark">
              DeskHelp<span className="wordmark-dot">.ai</span>
            </span>
          </a>
          <nav className="lp-links">
            <a href="#uses">Use cases</a>
            <a href="#what">What it does</a>
            <a href="#how">How it works</a>
            <a href="#faq">Questions</a>
          </nav>
          <button className="lp-btn solid" onClick={onSignIn}>
            {cta}
          </button>
        </div>
      </header>

      <section className="lp-hero" id="top">
        <span className="lp-badge rise">
          <span className="lp-badge-dot" />
          Specially designed for education hubs
        </span>

        <h1 className="rise" style={{ animationDelay: '0.05s' }}>
          Your agentic assistant for <span className="lp-grad">everyday office calls</span>
        </h1>

        <p className="rise" style={{ animationDelay: '0.1s' }}>
          DeskHelp rings people, asks what you need to know, and tells you what
          each call settled. Built for schools, colleges and coaching
          institutes, and it works in any office that runs on the phone.
        </p>

        <div className="lp-cta rise" style={{ animationDelay: '0.15s' }}>
          <button className="lp-btn solid lg" onClick={onSignIn}>
            {cta}
          </button>
          <button className="lp-btn lg" onClick={onSignIn}>
            {signedIn ? 'Open the dashboard' : hasDemo ? 'Take a look around' : 'See how it works'}
          </button>
        </div>

        <p className="lp-fine rise" style={{ animationDelay: '0.2s' }}>
          Nothing calls anybody until you turn a workflow on.
        </p>
      </section>

      <div className="lp-shot pop" style={{ animationDelay: '0.18s' }}>
        <PreviewMock />
      </div>

      <section className="lp-section" id="video">
          <div className="lp-head">
            <h2>See a real call, start to finish</h2>
            <p>
              One workflow, one phone, and what came back afterwards.
            </p>
          </div>
          <DemoVideo id={DEMO_VIDEO_ID} />
        </section>

      <section className="lp-strip">
        <div className="lp-strip-head">
          <h2>Fourteen kinds of call, and you choose</h2>
          <p>Every one starts switched off.</p>
        </div>
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...WORKFLOWS, ...WORKFLOWS].map((name, i) => (
              <span className="lp-chip" key={`${name}-${i}`}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="uses">
        <div className="lp-head">
          <h2>What people put it to work on</h2>
          <p>
            Fourteen education workflows ship ready to switch on. Everything
            else is the same engine with different questions.
          </p>
        </div>
        <div className="lp-uses">
          <div className="lp-use">
            <div className="lp-use-head">
              <h3>Education hubs</h3>
              <span className="pill accent">ready to switch on</span>
            </div>
            <ul>
              {EDU_USES.map((use) => (
                <li key={use}>{use}</li>
              ))}
            </ul>
          </div>
          <div className="lp-use">
            <div className="lp-use-head">
              <h3>Any office</h3>
              <span className="pill">write your own</span>
            </div>
            <ul>
              {OFFICE_USES.map((use) => (
                <li key={use}>{use}</li>
              ))}
            </ul>
            <p className="lp-use-note">
              A workflow is a short description of who to call, what may be
              said, and what a useful answer looks like. Nothing under it knows
              what a student is.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="what">
        <div className="lp-head">
          <h2>Built for calls that reach real families</h2>
          <p>Rules in the code, not settings somebody can leave off.</p>
        </div>
        <div className="lp-bento">
          {BENTO.map((cell) => (
            <div className="lp-bento-cell" key={cell.title}>
              <h3>{cell.title}</h3>
              <p>{cell.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="how">
        <div className="lp-head">
          <h2>Three things to set up, then it runs</h2>
          <p>No training, no scripts to record, no phone system to replace.</p>
        </div>
        <div className="lp-steps">
          <div className="lp-steps-list">
            {STEPS.map((step) => (
              <div className="lp-step" key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
          <div className="lp-steps-art">
            <LoginScene />
          </div>
        </div>
      </section>

      <section className="lp-section" id="faq">
        <div className="lp-head">
          <h2>Questions people ask first</h2>
        </div>
        <div className="lp-faq">
          {FAQ.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <h2>Give your desk its week back.</h2>
        <p>Set it up in an afternoon. It calls nobody until you say so.</p>
        <button className="lp-btn solid lg" onClick={onSignIn}>
          {cta}
        </button>
      </section>

      <footer className="lp-foot">
        <div className="row" style={{ gap: 9 }}>
          <Logo />
          <span className="wordmark">
            DeskHelp<span className="wordmark-dot">.ai</span>
          </span>
        </div>
        <span>Your agentic assistant for everyday office calls.</span>
      </footer>
    </div>
  );
}
