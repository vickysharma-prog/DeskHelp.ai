/**
 * Choosing which phone work DeskHelp does.
 *
 * Every workflow ships **off**. Installing DeskHelp must never be the same
 * thing as starting to call people, so each one is an explicit decision with
 * its schedule and its consequences visible at the moment it is made.
 */

import { useEffect, useState } from 'react';

import { api, describeDisposition } from '../api.js';

const SENSITIVITY = {
  'minor-involved': { tone: 'stop', label: 'Involves a child' },
  financial: { tone: 'warn', label: 'Money' },
  employment: { tone: 'accent', label: 'Staff' },
  routine: { tone: '', label: 'Routine' },
};

const SCHEDULE_KINDS = [
  { kind: 'manual', label: 'Only when I run it' },
  { kind: 'daily', label: 'Every day' },
  { kind: 'weekly', label: 'Once a week' },
  { kind: 'monthly-on', label: 'A date each month' },
  { kind: 'monthly-before-end', label: 'Before the month ends' },
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const defaultsFor = (kind) => {
  const at = { hour: 10, minute: 0 };
  switch (kind) {
    case 'daily':
      return { kind, at, weekdaysOnly: true };
    case 'weekly':
      return { kind, at, weekday: 1 };
    case 'monthly-on':
      return { kind, at, dayOfMonth: 1 };
    case 'monthly-before-end':
      return { kind, at, daysBeforeEnd: 2 };
    default:
      return { kind: 'manual' };
  }
};

function ScheduleEditor({ schedule, onChange }) {
  const at = schedule.at ?? { hour: 10, minute: 0 };
  const setAt = (patch) => onChange({ ...schedule, at: { ...at, ...patch } });

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>When</span>
        <select
          value={schedule.kind}
          onChange={(event) => onChange(defaultsFor(event.target.value))}
        >
          {SCHEDULE_KINDS.map((entry) => (
            <option key={entry.kind} value={entry.kind}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      {schedule.kind === 'weekly' ? (
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Day</span>
          <select
            value={schedule.weekday}
            onChange={(event) => onChange({ ...schedule, weekday: Number(event.target.value) })}
          >
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {schedule.kind === 'monthly-on' ? (
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Day of month</span>
          <input
            type="number"
            min="1"
            max="31"
            value={schedule.dayOfMonth}
            onChange={(event) =>
              onChange({ ...schedule, dayOfMonth: Number(event.target.value) })
            }
          />
          <small>A month with no such date runs on its last day instead.</small>
        </label>
      ) : null}

      {schedule.kind === 'monthly-before-end' ? (
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Days before the month ends</span>
          <input
            type="number"
            min="0"
            max="27"
            value={schedule.daysBeforeEnd}
            onChange={(event) =>
              onChange({ ...schedule, daysBeforeEnd: Number(event.target.value) })
            }
          />
          <small>
            Two days before the end is the 28th in September and the 26th in
            February. A fixed date would get that wrong.
          </small>
        </label>
      ) : null}

      {schedule.kind === 'daily' ? (
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={schedule.weekdaysOnly}
            onChange={(event) =>
              onChange({ ...schedule, weekdaysOnly: event.target.checked })
            }
          />
          <span style={{ fontSize: 13 }}>Skip Sundays</span>
        </label>
      ) : null}

      {schedule.kind !== 'manual' ? (
        <div className="row" style={{ gap: 8 }}>
          <label className="field" style={{ marginBottom: 0, flex: 1 }}>
            <span>Hour</span>
            <input
              type="number"
              min="0"
              max="23"
              value={at.hour}
              onChange={(event) => setAt({ hour: Number(event.target.value) })}
            />
          </label>
          <label className="field" style={{ marginBottom: 0, flex: 1 }}>
            <span>Minute</span>
            <input
              type="number"
              min="0"
              max="59"
              value={at.minute}
              onChange={(event) => setAt({ minute: Number(event.target.value) })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Collapses a run into one row per distinct outcome and reason. */
function groupOutcomes(outcomes) {
  const groups = new Map();

  for (const outcome of outcomes) {
    const key = outcome.judgement?.disposition ?? outcome.status;
    const detail = outcome.detail ?? '';
    const id = `${key}::${detail}`;

    const existing = groups.get(id);
    if (existing) {
      existing.count += 1;
      if (existing.examples.length < 3) existing.examples.push(outcome.contactId);
      continue;
    }

    const shown = describeDisposition(key);
    groups.set(id, {
      key: id,
      label: shown.label,
      tone: shown.tone,
      detail,
      count: 1,
      examples: [outcome.contactId],
    });
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * Choosing who to ring, and saying so plainly before it happens.
 *
 * One person per press. A button that fans a workflow out across every family
 * on the list is not something an office should be able to lean on by
 * accident, and "who is about to be called" is the one thing worth being sure
 * of, so the name and the number are on the button itself.
 */
function CallPanel({ workflow, onClose, onPlaced }) {
  const [contacts, setContacts] = useState([]);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState(null);

  const [allowed, setAllowed] = useState([]);

  useEffect(() => {
    Promise.all([api.contacts(), api.overview()])
      .then(([list, overview]) => {
        setContacts(list);
        setAllowed(overview.institute?.allowedDestinations ?? []);
      })
      .catch((error) => setProblem(error.message));
  }, []);

  const contact = contacts.find((entry) => entry.id === chosen);

  // Sorted by whether a phone can actually ring, because in a list of a few
  // hundred families the handful on the allow list are the ones somebody is
  // looking for, and scrolling past the rest to find them is how you end up
  // picking the wrong row.
  const canRing = contacts.filter((entry) => allowed.includes(entry.phone));
  const cannot = contacts.filter((entry) => !allowed.includes(entry.phone));
  const label = (entry) => `${entry.fullName} · ${entry.phone}`;

  const place = async () => {
    setBusy(true);
    setProblem('');
    try {
      setResult(await api.callNow(workflow.id, chosen));
      onPlaced?.();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  const outcome = result?.outcomes?.[0];

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{workflow.title}</h2>
            <div className="muted" style={{ fontSize: 12.5 }}>
              One call, to one person, now.
            </div>
          </div>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body stack">
          {problem ? <div className="notice bad">{problem}</div> : null}

          {outcome ? (
            <>
              <div className={`notice ${outcome.status === 'placed' ? 'good' : ''}`}>
                {outcome.status === 'placed'
                  ? 'The call was placed and has finished.'
                  : outcome.status === 'simulated'
                    ? 'Nothing was dialled: live calling is off, or this number is not on the allow list.'
                    : outcome.detail}
              </div>

              {outcome.judgement ? (
                <div className="stack">
                  <div>
                    <strong>{describeDisposition(outcome.judgement.disposition).label}</strong>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {describeDisposition(outcome.judgement.disposition).detail}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Open Calls to read what was said.
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <label className="field">
                <span>Who should be called?</span>
                <select value={chosen} onChange={(event) => setChosen(event.target.value)}>
                  <option value="">Choose somebody</option>
                  {canRing.length > 0 ? (
                    <optgroup label="On the allow list, so a phone will ring">
                      {canRing.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {label(entry)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup
                    label={
                      canRing.length > 0
                        ? 'Everybody else, who will not be dialled'
                        : 'Nobody is on the allow list, so none of these will be dialled'
                    }
                  >
                    {cannot.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {label(entry)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              <div className="muted" style={{ fontSize: 12.5 }}>
                A phone only rings if live calling is on and this number is on
                the allow list in Settings. Otherwise the whole run happens
                exactly as it would, and dials nobody.
              </div>

              <button
                className="btn primary"
                disabled={!chosen || busy}
                onClick={place}
              >
                {busy
                  ? 'Calling, this takes about a minute'
                  : contact
                    ? allowed.includes(contact.phone)
                      ? `Call ${contact.fullName} on ${contact.phone}`
                      : `Run it for ${contact.fullName} without dialling`
                    : 'Call now'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ title, result, onClose }) {
  const first = result.outcomes.find((outcome) => outcome.taskText);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Dry run. Nothing was dialled and nothing was recorded.
            </div>
          </div>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

      <div className="modal-body stack">
        {/*
          Grouped rather than listed. A run over a few hundred families
          produces a few hundred rows that mostly say the same thing, and an
          operator wants to know how many of each, not to scroll past them.
        */}
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>How many</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {groupOutcomes(result.outcomes).map((group) => (
                <tr key={group.key}>
                  <td>
                    <span className={`pill ${group.tone}`}>{group.label}</span>
                  </td>
                  <td className="num">
                    <strong>{group.count}</strong>
                  </td>
                  <td className="muted">
                    {group.detail}
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      {group.examples.join(', ')}
                      {group.count > group.examples.length
                        ? ` and ${group.count - group.examples.length} more`
                        : ''}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {first ? (
          <div>
            <h3 style={{ marginBottom: 6 }}>Exactly what the caller would say</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
              Read this before you go live. It is the whole instruction,
              including everything the caller is forbidden to do.
            </p>
            <pre className="task">{first.taskText}</pre>
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}

export function Workflows({ onChanged }) {
  const [workflows, setWorkflows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [calling, setCalling] = useState(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');

  const load = async () => setWorkflows(await api.workflows());

  useEffect(() => {
    load();
  }, []);

  const save = async (id, patch) => {
    setBusy(id);
    setProblem('');
    try {
      await api.saveWorkflow(id, patch);
      await load();
      onChanged?.();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy('');
    }
  };

  const runPreview = async (id, title) => {
    setBusy(id);
    setProblem('');
    try {
      setPreview({ id, title, result: await api.preview(id) });
    } catch (error) {
      setProblem(error.message);
      setPreview(null);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>Workflows</h1>
        <p>
          Fourteen kinds of call. Switch on the ones your office actually makes
          and leave the rest alone. Every one starts off, and turning one on is a
          decision you make yourself.
          </p>
        </div>
      </header>

      {problem ? (
        <div className="note stop" style={{ marginBottom: 14 }}>
          {problem}
        </div>
      ) : null}

      <div className="grid cards">
        {workflows.map((workflow) => {
          const sensitivity = SENSITIVITY[workflow.sensitivity] ?? SENSITIVITY.routine;
          const isEditing = editing === workflow.id;

          return (
            <div className={workflow.enabled ? 'card on' : 'card'} key={workflow.id}>
              <div className="wf">
                <div className="wf-top">
                  <div>
                    <div className="wf-title">{workflow.title}</div>
                    <div className="wf-purpose">{workflow.purpose}</div>
                  </div>
                  <button
                    className="switch"
                    role="switch"
                    aria-checked={workflow.enabled}
                    aria-label={`${workflow.enabled ? 'Disable' : 'Enable'} ${workflow.title}`}
                    disabled={busy === workflow.id}
                    onClick={() => save(workflow.id, { enabled: !workflow.enabled })}
                  />
                </div>

                <div className="wf-meta">
                  <span className={`pill ${sensitivity.tone}`}>{sensitivity.label}</span>
                  <span className="pill">{workflow.audience}</span>
                  {workflow.cascade ? (
                    <span className="pill accent">stops at first yes</span>
                  ) : null}
                  <span className="pill">
                    {workflow.questions.length === 0
                      ? 'asks nothing'
                      : `${workflow.questions.length} question${workflow.questions.length === 1 ? '' : 's'}`}
                  </span>
                  <span className="pill">
                    max {workflow.retry.maxAttempts} attempt
                    {workflow.retry.maxAttempts === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="wf-sched">
                  {workflow.scheduleText}
                  {workflow.nextRuns?.length ? (
                    <div className="wf-next">
                      Next:{' '}
                      {workflow.nextRuns
                        .map((iso) =>
                          new Date(iso).toLocaleString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        )
                        .join(' · ')}
                    </div>
                  ) : null}
                </div>

                <div className="row">
                  <button
                    className="btn"
                    onClick={() => setEditing(isEditing ? null : workflow.id)}
                  >
                    {isEditing ? 'Done' : 'Schedule'}
                  </button>
                  <button
                    className="btn"
                    disabled={busy === workflow.id}
                    onClick={() => runPreview(workflow.id, workflow.title)}
                  >
                    {busy === workflow.id ? 'Running' : 'Dry run'}
                  </button>
                  <button className="btn" onClick={() => setCalling(workflow)}>
                    Call now
                  </button>
                </div>

                {isEditing ? (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <ScheduleEditor
                      schedule={workflow.schedule}
                      onChange={(schedule) => save(workflow.id, { schedule })}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {calling ? (
        <CallPanel
          workflow={calling}
          onClose={() => setCalling(null)}
          onPlaced={() => onChanged?.()}
        />
      ) : null}

      {preview ? (
        <PreviewPanel
          title={preview.title}
          result={preview.result}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
