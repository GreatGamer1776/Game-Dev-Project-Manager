import React, { useState } from 'react';
import { Button, Card, Input, Field, Eyebrow } from './ui';
import { useAuthStore } from '../stores/useAuthStore';
import { ApiError } from '../services/api';

type Mode = 'login' | 'register';

const AuthView: React.FC = () => {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim();
    if (!trimmed || !password) {
      setError('Username and password are required.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
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
    <div className="h-full flex items-center justify-center bg-bg p-6">
      <Card className="w-full max-w-sm p-8">
        <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center shadow-soft mb-5">
          <span className="font-display text-sm font-extrabold tracking-tight text-accent-content">DA</span>
        </div>
        <Eyebrow className="block mb-1">DevArchitect</Eyebrow>
        <h1 className="font-display text-2xl font-bold text-content tracking-tight">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="text-sm text-muted mt-1.5 mb-6">
          {mode === 'login'
            ? 'Sign in to open your workspace.'
            : 'Pick a username and password — no email or personal info needed.'}
        </p>

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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : ''}
            />
          </Field>
          {mode === 'register' && (
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
            <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button variant="primary" type="submit" disabled={busy} className="w-full justify-center">
            {busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-5 pt-4 border-t border-border text-center">
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-sm text-muted hover:text-accent transition-colors"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
          </button>
        </div>
      </Card>
    </div>
  );
};

export default AuthView;
