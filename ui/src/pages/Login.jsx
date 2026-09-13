/**
 * The way in.
 *
 * The first person to open a new install creates the account, so setup is a
 * sign-up rather than a password sitting in a config file. After that the page
 * only signs people in.
 */

import { useEffect, useRef, useState } from 'react';

import { Logo } from '../Logo.jsx';
import { LoginScene } from '../LoginScene.jsx';

const POINTS = [
  'Appointment confirmations, payment reminders, document chases and eleven more, each one you switch on yourself.',
  'Calls happen in Hindi, English, or the mix of both that people actually speak.',
  'Every answer is checked against what the person really said, so nothing gets written down that they never told you.',
];

export function Login({ needsSetup, googleClientId, demo, onSignedIn }) {
  const [mode, setMode] = useState(needsSetup ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [instituteName, setInstituteName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const googleSlot = useRef(null);

  useEffect(() => {
    setMode(needsSetup ? 'signup' : 'login');
  }, [needsSetup]);

  // Google Sign-In loads only when an institute has configured it. A button
  // that cannot work is worse than no button.
  useEffect(() => {
    if (!googleClientId || !googleSlot.current) return;

    const start = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setBusy(true);
          setProblem('');
          try {
            const response = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error);
            onSignedIn(body.account);
          } catch (error) {
            setProblem(error.message);
          } finally {
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleSlot.current, {
        theme: 'outline',
        size: 'large',
        width: 340,
        text: 'continue_with',
      });
    };

    if (window.google?.accounts?.id) {
      start();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = start;
    document.head.appendChild(script);
  }, [googleClientId, onSignedIn]);

  const signInWith = async (withEmail, withPassword) => {
    setBusy(true);
    setProblem('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: withEmail, password: withPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onSignedIn(body.account);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      const path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload =
        mode === 'signup' ? { email, password, instituteName } : { email, password };

      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onSignedIn(body.account);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-left">
        <div className="auth-left-inner">
          <div className="row rise" style={{ gap: 12, marginBottom: 32 }}>
            <Logo size="lg" />
            <div>
              <div className="wordmark lg on-dark">
                DeskHelp<span className="wordmark-dot on-dark">.ai</span>
              </div>
              <div className="on-dark-sub">
                for any office that runs on the phone
              </div>
            </div>
          </div>

          <h1 className="pitch-h1 rise" style={{ animationDelay: '0.06s' }}>
            Your agentic assistant for everyday office calls.
          </h1>
          <p className="pitch-sub rise" style={{ animationDelay: '0.12s' }}>
            DeskHelp rings people, asks what you need to know, and tells you
            what each call settled.
          </p>

          <ul className="pitch-points">
            {POINTS.map((point, index) => (
              <li key={point} className="rise" style={{ animationDelay: `${0.18 + index * 0.08}s` }}>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <LoginScene />
      </section>

      <section className="auth-right">
        <div className="auth pop">
          <div className="auth-card">
            <h2 className="auth-title">
              {mode === 'signup' ? 'Create your account' : 'Sign in'}
            </h2>
            <p className="auth-sub">
              {mode === 'signup'
                ? 'This first account belongs to your office.'
                : 'Welcome back.'}
            </p>

            {problem ? (
              <div className="note stop" style={{ marginBottom: 14 }}>
                {problem}
              </div>
            ) : null}

            <form onSubmit={submit}>
              {mode === 'signup' ? (
                <label className="field">
                  <span>Your organisation’s name</span>
                  <input
                    type="text"
                    required
                    value={instituteName}
                    placeholder="Northline Education Hub"
                    onChange={(event) => setInstituteName(event.target.value)}
                  />
                  <small>Spoken at the start of every call you make.</small>
                </label>
              ) : null}

              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {mode === 'signup' ? (
                  <small>At least 10 characters. Length beats punctuation.</small>
                ) : null}
              </label>

              <button className="btn primary wide" type="submit" disabled={busy}>
                {busy
                  ? 'One moment'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Sign in'}
              </button>
            </form>

            {demo || googleClientId ? <div className="divider">or</div> : null}

            {demo ? (
              <>
                <button
                  className="btn wide"
                  type="button"
                  disabled={busy}
                  onClick={() => signInWith(demo.email, demo.password)}
                >
                  Take a look around the demo
                </button>
                <p className="demo-note">
                  A shared workspace with made-up contacts and made-up numbers.
                  Whatever you type there is visible to the next person who
                  opens it.
                </p>
              </>
            ) : null}

            {googleClientId ? (
              <div ref={googleSlot} style={{ display: 'grid', placeItems: 'center', marginTop: 12 }} />
            ) : null}

            {!needsSetup ? (
              <div className="auth-switch">
                {mode === 'signup' ? (
                  <>
                    Already have an account?{' '}
                    <button onClick={() => setMode('login')}>Sign in</button>
                  </>
                ) : (
                  <>
                    Setting up a new office?{' '}
                    <button onClick={() => setMode('signup')}>Create an account</button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <p className="auth-foot">
            Nothing calls anybody until you switch a workflow on.
          </p>
        </div>
      </section>
    </div>
  );
}
