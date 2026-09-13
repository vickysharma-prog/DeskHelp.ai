/**
 * The only place the UI talks to the server.
 *
 * Every response is already a decision the engine made. The UI renders it and
 * records what somebody chose; it never recomputes whether a call is allowed,
 * because two implementations of that rule would eventually disagree and the
 * one on screen would be the one people trusted.
 */

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return body;
}

export const api = {
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  overview: () => request('/api/overview'),

  workflows: () => request('/api/workflows'),
  saveWorkflow: (id, patch) =>
    request(`/api/workflows?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify(patch),
    }),
  preview: (id) =>
    request(`/api/workflows/preview?id=${encodeURIComponent(id)}`, { method: 'POST' }),
  callNow: (id, contactId) =>
    request(`/api/workflows/call?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ contactId }),
    }),

  calls: () => request('/api/calls'),

  contacts: () => request('/api/contacts'),
  addContact: (contact) =>
    request('/api/contacts', { method: 'POST', body: JSON.stringify(contact) }),
  importContacts: (csv) =>
    fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csv,
    }).then((r) => r.json()),

  factSheet: () => request('/api/factsheet'),
  publishFactSheet: (approvedBy, entries) =>
    request('/api/factsheet', {
      method: 'POST',
      body: JSON.stringify({ approvedBy, entries }),
    }),

  queue: () => request('/api/queue'),
  resolveQuestion: (id, answer, resolvedBy) =>
    request(`/api/queue/resolve?id=${id}`, {
      method: 'POST',
      body: JSON.stringify({ answer, resolvedBy }),
    }),

  saveSettings: (institute) =>
    request('/api/settings', { method: 'POST', body: JSON.stringify(institute) }),
};

/**
 * One vocabulary for call outcomes, used on every screen.
 *
 * `declined` and `unreached` stay visibly different because the whole retry
 * policy rests on the difference: somebody who hung up has refused, somebody
 * whose phone rang out has not been reached.
 */
export const DISPOSITION = {
  answered: { tone: 'ok', label: 'Answered', note: 'Evidenced. Safe to act on.' },
  'needs-human': { tone: 'warn', label: 'Needs a person', note: 'Something must be decided.' },
  unreached: { tone: '', label: 'Not reached', note: 'Nobody picked up. May be retried.' },
  declined: { tone: 'stop', label: 'Declined', note: 'Answered, then ended it. Not retried.' },
  'opted-out': { tone: 'stop', label: 'Opted out', note: 'Never contacted again.' },
  'not-called': { tone: '', label: 'Not called', note: 'A guard stopped it before dialling.' },
  refused: { tone: '', label: 'Refused', note: 'A guard stopped it before dialling.' },
  skipped: { tone: '', label: 'Skipped', note: 'Already handled for this window.' },
  simulated: { tone: 'accent', label: 'Dry run', note: 'Nothing dialled.' },
  placed: { tone: 'ok', label: 'Placed', note: 'A real call.' },
  'submission-unknown': {
    tone: 'stop',
    label: 'Unknown',
    note: 'We do not know if it dialled. Never retried automatically.',
  },
};

export const describeDisposition = (key) =>
  DISPOSITION[key] ?? { tone: '', label: key, note: '' };
