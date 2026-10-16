import React, { useEffect, useState } from 'react';
import { Button, Input, Field } from './ui';
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
      setError('Username and password are required.');
      return;
    }
    if (needsSetup && password !== confirmPassword) {
      setError('Passwords do not match.');
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
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-chrome p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg p-8 shadow-pop animate-scale-in">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
            <span className="text-sm font-extrabold tracking-tight text-accent">DA</span>
          </div>
          <h1 className="text-xl font-semibold text-content">
            {needsSetup ? 'Create admin account' : 'Sign in to DevArchitect'}
          </h1>
        </div>
        <p className="text-[0.8125rem] text-muted text-center mt-1.5 mb-6">
          {needsSetup
            ? 'First run — this account becomes the administrator and can create other users.'
            : 'Sign in to open your workspace.'}
        </p>

        {needsSetup === null ? (
          <p className="text-sm text-faint py-4">Checking server…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username" htmlFor="auth-username">
              <Input
                id="auth-username"
                autoFocus
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. pixelwright"
              />
            </Field>
            <Field label="Password" htmlFor="auth-password">
              <Input
                id="auth-password"
                type="password"
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsSetup ? 'At least 8 characters' : ''}
              />
            </Field>
            {needsSetup && (
              <Field label="Confirm Password" htmlFor="auth-confirm">
                <Input
                  id="auth-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>
            )}

            {error && (
              <p role="alert" className="text-[0.8125rem] text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button variant="primary" type="submit" disabled={busy} className="w-full justify-center">
              {busy ? 'Please wait...' : needsSetup ? 'Create admin account' : 'Sign in'}
            </Button>
          </form>
        )}

        {needsSetup === false && (
          <div className="mt-5 pt-4 border-t border-border text-center">
            <p className="text-xs text-faint">Accounts are invite-only — ask an admin to create yours.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthView;
