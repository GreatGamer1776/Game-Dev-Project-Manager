import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Input, Field, Wordmark } from './ui';
import { useAuthStore } from '../stores/useAuthStore';
import { api, ApiError } from '../services/api';

const AuthView: React.FC = () => {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  // 'setup' = no users exist yet; this form creates the admin account.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.setupStatus()
      .then(({ needsSetup }) => { if (!cancelled) setNeedsSetup(needsSetup); })
      // If the status check fails, default to the login form — login attempts
      // will surface the real connectivity error anyway.
      .catch(() => { if (!cancelled) setNeedsSetup(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim();
    if (!trimmed || !password) {
      setError('Enter your username and password.');
      return;
    }
    if (needsSetup && password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (needsSetup) {
        await register(trimmed, password);
      } else {
        await login(trimmed, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check that the API is running.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full overflow-y-auto bg-chrome">
      <main className="m-auto w-full max-w-[24rem] px-4 py-12 animate-fade-in-up">
        <Wordmark className="mb-6" />
        <div className="rounded-xl border border-border bg-bg p-6 shadow-raised sm:p-8">
          <h1 className="font-display text-xl font-semibold text-content">
            {needsSetup ? 'Create the admin account' : 'Sign in'}
          </h1>

          {needsSetup === null ? (
            <div className="mt-6 flex items-center gap-2 text-[0.8125rem] text-faint" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting to the server…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="Username" htmlFor="auth-username">
                <Input
                  id="auth-username"
                  autoFocus
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-10"
                />
              </Field>
              <Field label="Password" hint={needsSetup ? 'At least 8 characters' : undefined} htmlFor="auth-password">
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete={needsSetup ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10"
                />
              </Field>
              {needsSetup && (
                <Field label="Confirm password" htmlFor="auth-confirm">
                  <Input
                    id="auth-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-10"
                  />
                </Field>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8125rem] text-danger">
                  {error}
                </p>
              )}

              <Button variant="primary" size="lg" type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? (needsSetup ? "Creating account…" : "Signing in…") : needsSetup ? 'Create admin account' : 'Sign in'}
              </Button>
            </form>
          )}

        </div>
      </main>
    </div>
  );
};

export default AuthView;
