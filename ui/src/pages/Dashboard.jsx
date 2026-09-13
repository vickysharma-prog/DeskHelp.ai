/**
 * What an operator sees when they sit down.
 *
 * The banner is the page header rather than something sitting under one. It
 * carries the institute's name, what needs doing, and the same drawing as the
 * sign-in page, so the product looks like itself on the screen people work in
 * all day rather than only on the one they see once.
 *
 * The time of day is greeted on the noticeboard inside the drawing and nowhere
 * else. Saying "Good evening" twice on one screen reads as a template nobody
 * finished.
 */

import { LoginScene } from '../LoginScene.jsx';

const Tile = ({ label, value, note, tone }) => (
  <div className={tone ? `tile ${tone}` : 'tile'}>
    <div className="tile-label">{label}</div>
    <div className="tile-value">{value}</div>
    {note ? <div className="tile-note">{note}</div> : null}
  </div>
);

export function Dashboard({ overview, onGo }) {
  if (!overview) {
    return <div className="empty">Loading</div>;
  }

  const {
    institute,
    configured,
    workflowsEnabled,
    workflowsTotal,
    contacts,
    queueSize,
    factSheetVersion,
    live,
    allowedDestinations,
  } = overview;

  const headline =
    queueSize > 0
      ? `${queueSize} question${queueSize === 1 ? '' : 's'} are waiting for an answer.`
      : workflowsEnabled === 0
        ? 'No workflows are switched on yet, so nothing is calling anybody.'
        : `${workflowsEnabled} workflow${workflowsEnabled === 1 ? '' : 's'} running. Nothing is waiting on you.`;

  return (
    <>
      <div className="banner">
        <div className="banner-text">
          <div className="banner-chips">
            <span className={live ? 'pill ok' : 'pill on-banner'}>
              {live ? 'Live calling' : 'Dry run'}
            </span>
            <span className="pill on-banner">
              {workflowsEnabled} of {workflowsTotal} on
            </span>
          </div>
          <h1 className="banner-name">Hello, {institute.displayName}</h1>
          <p>{headline}</p>
        </div>
        <div className="banner-scene">
          <LoginScene />
        </div>
      </div>

      <div className="stack">
        {!configured ? (
          <div className="note warn">
            <strong>Finish setup before switching a workflow on.</strong> DeskHelp
            needs a timezone, a jurisdiction and a callback number from you. It
            works none of them out from a phone number.{' '}
            <button className="btn" style={{ marginLeft: 6 }} onClick={() => onGo('settings')}>
              Open settings
            </button>
          </div>
        ) : null}

        {queueSize > 0 ? (
          <div className="note warn">
            <strong>
              {queueSize} question{queueSize === 1 ? '' : 's'} waiting.
            </strong>{' '}
            Somebody asked something your callers are not allowed to answer.
            Answer it here and the next call to that person delivers it word for
            word.{' '}
            <button className="btn" style={{ marginLeft: 6 }} onClick={() => onGo('queue')}>
              Open the queue
            </button>
          </div>
        ) : null}

        <div className="grid tiles">
          <Tile
            label="Calling mode"
            value={live ? 'Live' : 'Dry run'}
            tone={live ? 'ok' : ''}
            note={
              live
                ? `${allowedDestinations} number${allowedDestinations === 1 ? '' : 's'} allowed`
                : 'Nothing dials'
            }
          />
          <Tile
            label="Workflows on"
            value={`${workflowsEnabled} / ${workflowsTotal}`}
            note="Each one switched on separately"
          />
          <Tile label="Contacts" value={contacts} note="Imported from a sheet" />
          <Tile
            label="Waiting for a person"
            value={queueSize}
            tone={queueSize > 0 ? 'warn' : ''}
            note="Questions nobody could answer yet"
          />
          <Tile
            label="What we may say"
            value={factSheetVersion ? `v${factSheetVersion}` : '0'}
            note={factSheetVersion ? 'Approved wording' : 'Nothing approved yet'}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>How a call is decided</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              every step, every time
            </span>
          </div>
          <div className="card-body">
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
              <li>
                <strong>Has this person opted out?</strong> Checked first, so
                somebody who asked to be left alone never has their fee balance
                looked at.
              </li>
              <li>
                <strong>Consent, do-not-call, a valid number, calling hours.</strong>{' '}
                Each refusal says which one, so a quiet run is never a mystery.
              </li>
              <li>
                <strong>Reserved before dialling.</strong> A crash mid-call blocks
                the retry instead of producing a second one.
              </li>
              <li>
                <strong>Only approved wording is said.</strong> Anything else goes
                to a person, never made up on the phone.
              </li>
              <li>
                <strong>Answers are checked against the recording.</strong> An
                answer the person never gave is thrown away, not stored.
              </li>
              <li>
                <strong>A stated intention stays a claim.</strong> "I will pay
                tomorrow" never becomes a payment.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
