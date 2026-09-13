import { useCallback, useEffect, useState } from 'react';

import { api } from './api.js';
import { Logo } from './Logo.jsx';
import { Landing } from './pages/Landing.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Workflows } from './pages/Workflows.jsx';
import { Contacts } from './pages/Contacts.jsx';
import { FactSheet } from './pages/FactSheet.jsx';
import { Queue } from './pages/Queue.jsx';
import { Calls } from './pages/Calls.jsx';
import { Settings } from './pages/Settings.jsx';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'calls', label: 'Calls' },
  { id: 'queue', label: 'Review queue' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'factsheet', label: 'What we may say' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [session, setSession] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  const loadSession = useCallback(async () => {
    setSession(await api.me());
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const refresh = useCallback(async () => {
    if (!session?.account) return;
    try {
      setOverview(await api.overview());
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh, page]);

  if (!session) {
    return <div className="empty" style={{ paddingTop: 90 }}>Loading</div>;
  }

  if (!session.account) {
    // A stranger meets the product before they meet a password box.
    return showAuth ? (
      <Login
        needsSetup={session.needsSetup}
        googleClientId={session.googleClientId}
        demo={session.demo}
        onSignedIn={() => loadSession()}
      />
    ) : (
      <Landing onSignIn={() => setShowAuth(true)} hasDemo={Boolean(session.demo)} />
    );
  }

  const signOut = async () => {
    await api.logout();
    setOverview(null);
    await loadSession();
  };

  const live = overview?.live ?? false;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <div>
            <div className="wordmark">
              DeskHelp<span className="wordmark-dot">.ai</span>
            </div>
            <div className="brand-sub">
              {overview?.institute?.displayName ?? session.account.instituteName}
            </div>
          </div>
        </div>

        <nav className="nav">
          {PAGES.map((entry) => (
            <button
              key={entry.id}
              aria-current={page === entry.id}
              onClick={() => setPage(entry.id)}
            >
              <span>{entry.label}</span>
              {entry.id === 'workflows' && overview ? (
                <span className="nav-count">
                  {overview.workflowsEnabled}/{overview.workflowsTotal}
                </span>
              ) : null}
              {entry.id === 'queue' && overview?.queueSize > 0 ? (
                <span className="nav-count alert">{overview.queueSize}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          {/*
            Calling mode sits on every screen. Nobody should have to go and
            check whether the next button they press can ring a real phone.
          */}
          <div className={live ? 'mode armed' : 'mode'}>
            <strong>
              <span className="dot" />
              {live ? 'Live calling' : 'Dry run'}
            </strong>
            {live
              ? 'Phones will ring for numbers on your allow list.'
              : 'Nothing dials. Every call is simulated.'}
          </div>

          <div className="who">
            <span title={session.account.email}>{session.account.email}</span>
            <button onClick={signOut}>Sign out</button>
          </div>
        </div>
      </aside>

      <main className="main">
        {error ? (
          <div className="note stop" style={{ marginBottom: 18 }}>
            {error}
          </div>
        ) : null}

        {page === 'dashboard' && <Dashboard overview={overview} onGo={setPage} />}
        {page === 'workflows' && <Workflows onChanged={refresh} />}
        {page === 'calls' && <Calls />}
        {page === 'queue' && <Queue onChanged={refresh} />}
        {page === 'contacts' && <Contacts onChanged={refresh} />}
        {page === 'factsheet' && <FactSheet onChanged={refresh} />}
        {page === 'settings' && <Settings overview={overview} onChanged={refresh} />}
      </main>
    </div>
  );
}
