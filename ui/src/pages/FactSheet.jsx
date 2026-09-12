/**
 * The only thing the agent is allowed to say.
 *
 * Everything written here can be spoken on a call. Everything not written here
 * is captured and handed to a person instead. That is the whole of the
 * product's central rule, and this screen is where an institute exercises it.
 *
 * Publishing creates a new version rather than editing in place, so what the
 * agent said on a call last month can be checked against the wording that was
 * live then — not against whatever the office has changed since.
 */

import { useEffect, useState } from 'react';

import { api } from '../api.js';

/** Topics the shipped workflows can draw on. */
const TOPICS = [
  { id: 'courses-offered', hint: 'Which courses or classes run here.' },
  { id: 'batch-timings', hint: 'When batches run.' },
  { id: 'admission-process', hint: 'What somebody has to do to apply.' },
  { id: 'fee-due-date', hint: 'When the instalment is due. Not the amount, unless approved.' },
  { id: 'payment-channels', hint: 'Where payment is taken. Never on the call.' },
  { id: 'office-hours', hint: 'When somebody can be reached.' },
  { id: 'attendance-policy', hint: 'What the institute expects about attendance.' },
  { id: 'ptm-slots', hint: 'The meeting slots being offered.' },
  { id: 'announcement-text', hint: 'The approved announcement, word for word.' },
];

const LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'Hindi' },
  { key: 'hi-en', label: 'Hindi + English' },
  { key: 'ta', label: 'Tamil' },
];

export function FactSheet({ onChanged }) {
  const [sheet, setSheet] = useState(null);
  const [entries, setEntries] = useState({});
  const [approvedBy, setApprovedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.factSheet().then((current) => {
      setSheet(current);
      const seed = {};
      for (const entry of current?.entries ?? []) {
        seed[entry.topic] = entry.wording;
      }
      setEntries(seed);
      setApprovedBy(current?.approvedBy ?? '');
    });
  }, []);

  const setWording = (topic, language, text) =>
    setEntries((current) => ({
      ...current,
      [topic]: { ...(current[topic] ?? {}), [language]: text },
    }));

  const publish = async () => {
    setBusy(true);
    setProblem('');
    setSaved(false);
    try {
      const payload = Object.entries(entries)
        .map(([topic, wording]) => ({
          id: `fs-${topic}`,
          topic,
          wording: Object.fromEntries(
            Object.entries(wording).filter(([, text]) => text?.trim()),
          ),
        }))
        .filter((entry) => Object.keys(entry.wording).length > 0);

      const published = await api.publishFactSheet(approvedBy, payload);
      setSheet(published);
      setSaved(true);
      onChanged?.();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>Fact sheet</h1>
        <p>
          Your callers may say these things and nothing else. Anything somebody
            asks that is not covered here is written down word for word and sent
            to the review queue, never made up on the phone.
          </p>
        </div>
      </header>

      <div className="stack">
        <div className="row spread">
          <div>
            {sheet ? (
              <span className="pill accent">
                v{sheet.version} · approved by {sheet.approvedBy}
              </span>
            ) : (
              <span className="pill warn">nothing approved yet</span>
            )}
          </div>
          {saved ? <span className="pill ok">published</span> : null}
        </div>

        {problem ? <div className="note stop">{problem}</div> : null}

        <div className="note">
          Leave a language blank and the call falls back along a path you have
          already approved, from Hindi and English to Hindi to English. Nothing
          you have not written is ever translated for you.
        </div>

        {TOPICS.map((topic) => (
          <div className="card" key={topic.id}>
            <div className="card-head">
              <div>
                <h2>{topic.id}</h2>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {topic.hint}
                </div>
              </div>
            </div>
            <div className="card-body">
              {LANGUAGES.map((language) => (
                <label className="field" key={language.key}>
                  <span>{language.label}</span>
                  <textarea
                    style={{ minHeight: 52 }}
                    value={entries[topic.id]?.[language.key] ?? ''}
                    onChange={(event) =>
                      setWording(topic.id, language.key, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="card">
          <div className="card-body">
            <label className="field">
              <span>Approved by</span>
              <input
                type="text"
                value={approvedBy}
                placeholder="Your name"
                onChange={(event) => setApprovedBy(event.target.value)}
              />
              <small>
                Recorded, never spoken. Wording nobody will put their name to is
                wording nobody should be repeating down a phone line.
              </small>
            </label>
            <button
              className="btn primary"
              disabled={busy || !approvedBy.trim()}
              onClick={publish}
            >
              {busy ? 'Publishing' : `Publish v${(sheet?.version ?? 0) + 1}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
