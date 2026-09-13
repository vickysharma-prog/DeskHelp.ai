/**
 * What happened on the phone.
 *
 * Every other screen shows a conclusion: this family was reminded, that
 * question is waiting, this workflow runs on Friday. This screen shows the
 * thing those conclusions were drawn from, which is the only way anybody can
 * check them. An institute that cannot read the call has to take the summary
 * on trust, and a summary nobody can check is worth very little when the
 * subject is somebody's fees or somebody's child.
 */

import { useEffect, useState } from 'react';

import { api, describeDisposition } from '../api.js';

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const clock = (seconds) => {
  const value = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

/** The agent's turns and the recipient's, told apart at a glance. */
function Transcript({ turns }) {
  if (turns.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 12.5 }}>
        No transcript. The call did not reach a conversation.
      </div>
    );
  }

  return (
    <div className="transcript">
      {turns.map((turn, index) => {
        // Three kinds of turn, not two. CALL-E also returns `unknown`, and on
        // a real call those carried the agent's own words. Showing them as the
        // family's would put words in somebody's mouth on the one screen whose
        // job is to say exactly who said what.
        const speaker = String(turn.speaker ?? '').toLowerCase();
        const isAgent = ['bot', 'agent', 'assistant', 'system', 'ai'].includes(speaker);
        const isPerson = ['user', 'customer', 'callee', 'recipient', 'human', 'person', 'contact']
          .includes(speaker);
        const side = isAgent ? 'agent' : isPerson ? 'person' : 'unattributed';
        return (
          <div key={`${turn.offset_seconds ?? index}-${index}`} className={`turn ${side}`}>
            <div className="turn-who">
              {isAgent ? 'DeskHelp' : isPerson ? 'Them' : 'Unattributed'}
              <span className="turn-at">{clock(turn.offset_seconds)}</span>
            </div>
            <div className="turn-text">{turn.text}</div>
          </div>
        );
      })}
    </div>
  );
}

function CallRow({ call, open, onToggle }) {
  const shown = describeDisposition(call.disposition);
  const answers = Object.entries(call.answers ?? {});

  return (
    <div className="card">
      <div className="card-head" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div>
          <h2 style={{ fontSize: 15 }}>{call.contactName}</h2>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {call.actionTitle} · {when(call.placedAt)}
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className={`pill ${shown.tone}`}>{shown.label}</span>
          <button className="btn">{open ? 'Hide' : 'Read the call'}</button>
        </div>
      </div>

      {open ? (
        <div className="card-body stack">
          <div className="muted" style={{ fontSize: 12.5 }}>
            {shown.detail}
            {call.providerConfidence?.label ? (
              <>
                {' '}CALL-E rated its own reading of this call{' '}
                <strong>{call.providerConfidence.label}</strong>
                {typeof call.providerConfidence.score === 'number'
                  ? ` (${call.providerConfidence.score})`
                  : ''}
                . That is its confidence in the extraction, not evidence that
                anybody said the thing, so it never decides the outcome above.
              </>
            ) : null}
          </div>

          <Transcript turns={call.transcript ?? []} />

          {answers.length > 0 ? (
            <div>
              <h3 className="section-label">What it established</h3>
              <div className="scroll-x">
                <table>
                  <tbody>
                    {answers.map(([key, value]) => (
                      <tr key={key}>
                        <td style={{ width: '48%' }}>{key.replace(/_/g, ' ')}</td>
                        <td>
                          <strong>{value}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {call.claims?.length > 0 ? (
            <div>
              <h3 className="section-label">Said, not done</h3>
              {call.claims.map((claim) => (
                <div key={claim.questionId} className="notice">
                  <strong>{claim.questionId.replace(/_/g, ' ')}</strong>
                  <div style={{ marginTop: 4 }}>“{claim.quote}”</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Recorded as something they said. Nothing is marked done on
                    the strength of it.
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {call.questions?.length > 0 ? (
            <div>
              <h3 className="section-label">Asked, and not answered on the call</h3>
              {call.questions.map((question, index) => (
                <div key={index} className="notice">
                  <div>“{question.quote}”</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {question.answer
                      ? `Answered by ${question.resolvedBy ?? 'the office'}: ${question.answer}`
                      : 'Waiting in the review queue.'}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Calls() {
  const [calls, setCalls] = useState(null);
  const [open, setOpen] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    api.calls().then(setCalls).catch((error) => setProblem(error.message));
  }, []);

  if (problem) return <div className="notice bad">{problem}</div>;
  if (!calls) return <div className="muted">Loading.</div>;

  const withWords = calls.filter((call) => (call.transcript ?? []).length > 0).length;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Calls</h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          {calls.length} call{calls.length === 1 ? '' : 's'}, {withWords} with a
          transcript. Open one to read what was said and check it against what
          DeskHelp concluded.
        </p>
      </div>

      {calls.length === 0 ? (
        <div className="notice">
          Nothing yet. Run a workflow, or press Call now on one, and it will
          appear here.
        </div>
      ) : (
        calls.map((call) => (
          <CallRow
            key={call.id}
            call={call}
            open={open === call.id}
            onToggle={() => setOpen(open === call.id ? '' : call.id)}
          />
        ))
      )}
    </div>
  );
}
