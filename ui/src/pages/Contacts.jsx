/**
 * The contact list.
 *
 * Import is deliberately unforgiving: a malformed number is rejected with its
 * line number rather than repaired, because repairing means guessing a country
 * and a guess here is a stranger's phone ringing about somebody else's child.
 *
 * Rejections are shown, never hidden. An import that quietly skipped forty
 * rows would leave the institute believing it had called everybody.
 */

import { useEffect, useRef, useState } from 'react';

import { api } from '../api.js';

const REGISTER_LABEL = {
  'hi-en': 'Hindi + English',
  hi: 'Hindi',
  en: 'English',
  ta: 'Tamil',
};

const SAMPLE = `id,name,phone,register,consent,do_not_call
c-1,Contact A,+15550100001,hi-en,yes,no
c-2,Contact B,+15550100002,en,yes,no`;

export function Contacts({ onChanged }) {
  const [contacts, setContacts] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState({ fullName: '', phone: '' });
  const [addProblem, setAddProblem] = useState('');
  const fileInput = useRef(null);

  const load = async () => setContacts(await api.contacts());

  useEffect(() => {
    load();
  }, []);

  const upload = async (file) => {
    setBusy(true);
    try {
      const csv = await file.text();
      setResult(await api.importContacts(csv));
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const addOne = async (event) => {
    event.preventDefault();
    setBusy(true);
    setAddProblem('');
    try {
      await api.addContact(adding);
      setAdding({ fullName: '', phone: '' });
      await load();
      onChanged?.();
    } catch (error) {
      setAddProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>Contacts</h1>
        <p>
          Import from the spreadsheet your office already keeps. Consent is
          opt in. A blank cell is not a yes, and anybody without consent is
            imported but never called.
          </p>
        </div>
      </header>

      <div className="stack">
        {/*
          Importing a spreadsheet is how a term's intake arrives. This is how
          the one person you actually want to ring arrives, which otherwise
          meant writing a CSV by hand to add a single row.
        */}
        <div className="card">
          <div className="card-head">
            <h2>Add one person</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              keeps the current list
            </span>
          </div>
          <div className="card-body">
            <form className="row" style={{ gap: 10, alignItems: 'flex-end' }} onSubmit={addOne}>
              <label className="field" style={{ marginBottom: 0, flex: 2 }}>
                <span>Name</span>
                <input
                  value={adding.fullName}
                  placeholder="R. Sharma"
                  onChange={(event) =>
                    setAdding({ ...adding, fullName: event.target.value })
                  }
                />
              </label>
              <label className="field" style={{ marginBottom: 0, flex: 2 }}>
                <span>Phone</span>
                <input
                  value={adding.phone}
                  placeholder="+919876543210"
                  onChange={(event) => setAdding({ ...adding, phone: event.target.value })}
                />
                <small>Full international form, country code and all.</small>
              </label>
              <button className="btn primary" disabled={busy} type="submit">
                Add
              </button>
            </form>
            {addProblem ? (
              <div className="notice bad" style={{ marginTop: 10 }}>
                {addProblem}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Import a CSV</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              replaces the current list
            </span>
          </div>
          <div className="card-body stack">
            <div className="row">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                style={{ width: 'auto' }}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload(file);
                }}
              />
              {busy ? <span className="muted">Reading</span> : null}
            </div>

            <details>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
                What the columns should be
              </summary>
              <pre className="task" style={{ marginTop: 10 }}>{SAMPLE}</pre>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Required: <code>id</code>, <code>name</code>, <code>phone</code>,{' '}
                <code>consent</code>. Optional: <code>register</code>,{' '}
                <code>do_not_call</code>, <code>ward_id</code>. Numbers must be
                E.164, so a leading <code>+</code> and country code, with no spaces.
              </div>
            </details>

            {result ? (
              <div className="stack" style={{ gap: 9 }}>
                <div className="note">
                  <strong>{result.imported}</strong> imported ·{' '}
                  <strong>{result.rejected.length}</strong> rejected
                </div>

                {result.rejected.length > 0 ? (
                  <div className="note stop">
                    <strong>These rows were not imported.</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {result.rejected.map((row) => (
                        <li key={`${row.line}-${row.reason}`}>
                          Line {row.line}: {row.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {result.warnings.length > 0 ? (
                  <div className="note warn">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>{contacts.length} contact{contacts.length === 1 ? '' : 's'}</h2>
          </div>
          {contacts.length === 0 ? (
            <div className="empty">No contacts yet. Import a sheet above.</div>
          ) : (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Number</th>
                    <th>Language</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>{contact.fullName}</td>
                      {/*
                        Masked on screen. A contact list is exactly the thing
                        somebody screenshots and pastes into a group chat.
                      */}
                      <td className="mono">
                        {contact.phone.slice(0, 3)}
                        {'•'.repeat(Math.max(0, contact.phone.length - 5))}
                        {contact.phone.slice(-2)}
                      </td>
                      <td className="muted">
                        {REGISTER_LABEL[contact.preferredRegister] ?? contact.preferredRegister}
                      </td>
                      <td>
                        {contact.doNotCall ? (
                          <span className="pill stop">do not call</span>
                        ) : contact.consent ? (
                          <span className="pill ok">consented</span>
                        ) : (
                          <span className="pill warn">no consent</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
