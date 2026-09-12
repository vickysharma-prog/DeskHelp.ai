/**
 * What the institute declares.
 *
 * Every field here is declared rather than detected. DeskHelp will not infer a
 * timezone from a `+91`, a jurisdiction from a locale, or a calling window from
 * anything at all — a guess about which country somebody is in becomes a call
 * at 3am, and the person who receives it has no idea why.
 *
 * The allow list is the second of the two gates that stand between this
 * software and a real phone. It is edited here so that arming it is a
 * deliberate act with the consequence written next to it.
 */

import { useEffect, useState } from 'react';

import { api } from '../api.js';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Dubai',
  'Asia/Jakarta',
  'Asia/Manila',
  'Europe/London',
  'America/New_York',
  'Australia/Sydney',
];

const JURISDICTIONS = [
  { code: 'IN', label: 'India, calls 9am to 9pm (TRAI TCCCPR)' },
  { code: 'SG', label: 'Singapore' },
  { code: 'MY', label: 'Malaysia' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
];

export function Settings({ overview, onChanged }) {
  const [form, setForm] = useState(null);
  const [allowText, setAllowText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!overview?.institute || form) return;
    setForm(overview.institute);
    setAllowText((overview.institute.allowedDestinations ?? []).join('\n'));
  }, [overview, form]);

  if (!form) return <div className="empty">Loading</div>;

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setBusy(true);
    setProblem('');
    setSaved(false);
    try {
      const allowedDestinations = allowText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const bad = allowedDestinations.filter((phone) => !/^\+[1-9]\d{7,14}$/.test(phone));
      if (bad.length > 0) {
        throw new Error(
          `Not valid E.164: ${bad.join(', ')}. Use a leading + and country code, no spaces.`,
        );
      }

      await api.saveSettings({ ...form, allowedDestinations });
      setSaved(true);
      onChanged?.();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  const live = overview?.live ?? false;

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>Settings</h1>
        <p>
            You tell DeskHelp these. It never works them out from a phone
            number, a language setting, or this computer's clock, because a
            guess about which country somebody is in becomes a call at 3am.
          </p>
        </div>
      </header>

      <div className="stack">
        {problem ? <div className="note stop">{problem}</div> : null}
        {saved ? <div className="note">Saved.</div> : null}

        <div className="card">
          <div className="card-head">
            <h2>The institute</h2>
          </div>
          <div className="card-body">
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={form.displayName}
                onChange={(event) => set({ displayName: event.target.value })}
              />
              <small>Spoken at the start of every call.</small>
            </label>

            <label className="field">
              <span>Callback number</span>
              <input
                type="text"
                value={form.callbackNumber}
                placeholder="+91…"
                onChange={(event) => set({ callbackNumber: event.target.value })}
              />
              <small>
                Read aloud when the wrong person answers, so they can reach a
                human instead. Yours, and public by intent.
              </small>
            </label>

            <label className="field">
              <span>Timezone</span>
              <select
                value={form.timezone}
                onChange={(event) => set({ timezone: event.target.value })}
              >
                <option value="">Choose one</option>
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <small>
                Schedules and calling hours are computed in this zone. It is
                never derived from a number's country code.
              </small>
            </label>

            <label className="field" style={{ marginBottom: 0 }}>
              <span>Jurisdiction</span>
              <select
                value={form.jurisdiction}
                onChange={(event) => set({ jurisdiction: event.target.value })}
              >
                <option value="">Choose one</option>
                {JURISDICTIONS.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <small>
                Sets the hours calls are permitted. An unlisted jurisdiction gets
                a conservative 09:00–20:00 rather than a guess.
              </small>
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Live calling</h2>
            <span className={`pill ${live ? 'ok' : ''}`}>
              {live ? 'armed' : 'dry run'}
            </span>
          </div>
          <div className="card-body stack">
            <div className="note">
              A real call needs <strong>both</strong> gates. One can be left on by
              accident in a shell profile; two cannot, because the second is a
              list of specific numbers somebody typed.
              <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                <li>
                  <code>DESKHELP_LIVE=true</code> in <code>.env</code>. Exactly
                  that, not <code>1</code> and not <code>yes</code>. Currently{' '}
                  <strong>{live ? 'set' : 'not set'}</strong>.
                </li>
                <li>The number is on the allow list below. There is no wildcard.</li>
              </ol>
            </div>

            <label className="field" style={{ marginBottom: 0 }}>
              <span>Allowed destinations, one number per line</span>
              <textarea
                value={allowText}
                placeholder="+919876543210"
                onChange={(event) => setAllowText(event.target.value)}
                style={{ fontFamily: 'ui-monospace, Consolas, monospace', minHeight: 96 }}
              />
              <small>
                Empty means nothing can be dialled, which is the right default.
                Only add a number you are authorised to call.
              </small>
            </label>
          </div>
        </div>

        <div>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving' : 'Save settings'}
          </button>
        </div>
      </div>
    </>
  );
}
