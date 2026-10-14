'use client';
import { useState } from 'react';
import { translate } from '@rental/i18n';
export function Account() {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  async function call(path: string, body?: object) {
    setBusy(true);
    try {
      const response = await fetch(`/api/backend/${path}`, {
        method: body ? 'POST' : 'GET',
        ...(body
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      });
      setMessage(translate('en', response.ok ? 'auth.success' : 'auth.failed'));
      if (response.ok && path === 'me') {
        const profile: unknown = await response.json();
        if (
          profile &&
          typeof profile === 'object' &&
          'name' in profile &&
          typeof profile.name === 'string'
        )
          setName(profile.name);
      }
      if (response.ok && body) setToken('');
    } catch {
      setMessage(translate('en', 'auth.failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 space-y-4">
      <nav className="flex gap-4">
        <a href="/auth/login">{translate('en', 'auth.login')}</a>
        <a href="/auth/logout">{translate('en', 'auth.logout')}</a>
      </nav>
      <button disabled={busy} onClick={() => void call('me')}>
        {translate('en', 'auth.currentUser')}
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void call('invitations/accept', { token });
        }}
      >
        <label>
          {translate('en', 'auth.invitation')}
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="border mx-2"
            required
          />
        </label>
        <button disabled={busy || !token}>
          {translate('en', 'auth.accept')}
        </button>
      </form>
      <p role="status">{message}</p>
      <p>{name}</p>
    </section>
  );
}
