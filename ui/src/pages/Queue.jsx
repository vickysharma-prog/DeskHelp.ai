/**
 * The review queue.
 *
 * This is the screen that makes capturing a question worth doing. On the call
 * the agent said "I'll have someone confirm that"; here a person writes the
 * answer; on the next call to that family the agent says it word for word.
 *
 * Without this screen every captured question is a dead end, and the promise
 * the agent made on the phone is one nobody keeps.
 */

import { useEffect, useState } from 'react';

import { api } from '../api.js';

function QuestionRow({ question, onResolved }) {
  const [answer, setAnswer] = useState('');
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const resolve = async () => {
    setBusy(true);
    setProblem('');
    try {
      await api.resolveQuestion(question.id, answer, by);
      onResolved();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-body stack">
        <div>
          <div className="row spread" style={{ marginBottom: 6 }}>
            <span className="pill warn">waiting</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {question.contactId} ·{' '}
              {new Date(question.askedAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>
          <div className="quote">{question.quote}</div>
        </div>

        <label className="field" style={{ marginBottom: 0 }}>
          <span>What should we say next time?</span>
          <textarea
            value={answer}
            placeholder="Scholarship forms are at the office until the 20th."
            onChange={(event) => setAnswer(event.target.value)}
          />
          <small>
            Said word for word on the next call to this family. Nobody will reword
            it, add to it, or answer anything beyond it.
          </small>
        </label>

        <div className="row spread">
          <label className="field" style={{ marginBottom: 0, flex: 1, maxWidth: 260 }}>
            <span>Answered by</span>
            <input
              type="text"
              value={by}
              placeholder="Your name"
              onChange={(event) => setBy(event.target.value)}
            />
          </label>
          <button
            className="btn primary"
            disabled={busy || !answer.trim()}
            onClick={resolve}
          >
            {busy ? 'Saving' : 'Approve this answer'}
          </button>
        </div>

        {problem ? <div className="note stop">{problem}</div> : null}
      </div>
    </div>
  );
}

export function Queue({ onChanged }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setQuestions(await api.queue());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleResolved = async () => {
    await load();
    onChanged?.();
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>Review queue</h1>
        <p>
          Questions people asked that your callers were not allowed to answer. It
          told them somebody would confirm and call back. This is where that
            promise gets kept.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="empty">Loading</div>
      ) : questions.length === 0 ? (
        <div className="card">
          <div className="empty">
            <strong style={{ color: 'var(--text)' }}>Nothing waiting.</strong>
            <div style={{ marginTop: 5 }}>
              When somebody asks a question outside your approved wording, it lands
              here instead of being answered on the spot.
            </div>
          </div>
        </div>
      ) : (
        <div className="stack">
          {questions.map((question) => (
            <QuestionRow
              key={question.id}
              question={question}
              onResolved={handleResolved}
            />
          ))}
        </div>
      )}
    </>
  );
}
