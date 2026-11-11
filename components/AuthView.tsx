import React, { useEffect, useState } from 'react';
import { FileText, CheckSquare, Map as MapIcon, Server, Bug, Loader2 } from 'lucide-react';
import { Button, Input, Field, Wordmark, Logo, cn } from './ui';
import { useAuthStore } from '../stores/useAuthStore';
import { api, ApiError } from '../services/api';

const FEATURES = [
  { icon: FileText, title: 'Design docs that link', text: 'Markdown with [[links]], tags, callouts and diagrams.' },
  { icon: CheckSquare, title: 'Tasks and bugs on boards', text: 'A task list, a bug tracker and a roadmap in every project.' },
  { icon: Server, title: 'Runs on your server', text: 'Projects live in your own database. No email needed.' },
];

/** A small static board, in the app's own styles, so the sign-in page shows the product. */
const BoardPreview: React.FC = () => {
  const columns: { title: string; cards: { text: string; tag: string; tone: string }[] }[] = [
    { title: 'To do', cards: [{ text: 'Boss 1 attack patterns', tag: 'Medium', tone: 'bg-warning/15 text-warning' }, { text: 'Controller remapping', tag: 'Low', tone: 'bg-surface-hover text-muted' }] },
    { title: 'In progress', cards: [{ text: 'Scrap pickup magnet', tag: 'High', tone: 'bg-danger/15 text-danger' }] },
    { title: 'Done', cards: [{ text: 'Main menu music pass', tag: 'Low', tone: 'bg-success/15 text-success' }] },
  ];
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border border-border bg-bg shadow-pop">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <CheckSquare className="h-3.5 w-3.5 text-accent" />
        <span className="text-xs font-medium text-content">Task List</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-faint"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Saved</span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {columns.map(col => (
          <div key={col.title} className="rounded-lg bg-surface p-2">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              {col.title}
              <span className="rounded-full bg-surface-hover px-1.5 text-[10px] font-medium text-faint">{col.cards.length}</span>
            </div>
            <div className="space-y-1.5">
              {col.cards.map(card => (
                <div key={card.text} className="rounded-md border border-border bg-bg p-2">
                  <div className={cn('text-[11px] leading-snug text-content', col.title === 'Done' && 'text-faint line-through')}>{card.text}</div>
                  <span className={cn('mt-1.5 inline-block rounded px-1 text-[9px] font-semibold uppercase', card.tone)}>{card.tag}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[10px] text-faint">
        <span className="flex items-center gap-1"><Bug className="h-3 w-3" /> 2 open bugs</span>
        <span className="flex items-center gap-1"><MapIcon className="h-3 w-3" /> Vertical slice · 70%</span>
      </div>
    </div>
  );
};

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
    <div className="flex h-full overflow-y-auto bg-bg">
      {/* Product side */}
      <aside className="relative hidden w-[46%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-chrome px-12 py-10 lg:flex">
        <Wordmark />
        <div className="my-10 animate-fade-in-up">
          <h2 className="max-w-md font-display text-[2rem] font-semibold leading-[1.15] tracking-tight text-content">
            Plan your game, app or site in one workspace.
          </h2>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/20">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[0.875rem] font-semibold text-content">{title}</span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-10 max-w-md">
            <BoardPreview />
          </div>
        </div>
        <p className="text-xs text-faint">DevArchitect · self-hosted project planning</p>
      </aside>

      {/* Form side */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[22rem] animate-fade-in-up">
          <Logo size={40} className="mb-6 lg:hidden" />
          <h1 className="font-display text-[1.625rem] font-semibold tracking-tight text-content">
            {needsSetup ? 'Create the admin account' : 'Sign in'}
          </h1>
          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
            {needsSetup
              ? 'This is the first account on this server. It can create accounts for everyone else.'
              : 'Welcome back. Sign in to open your projects.'}
          </p>

          {needsSetup === null ? (
            <div className="mt-8 flex items-center gap-2 text-[0.8125rem] text-faint" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting to the server…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <Field label="Username" htmlFor="auth-username">
                <Input
                  id="auth-username"
                  autoFocus
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="pixelwright"
                  className="h-10"
                />
              </Field>
              <Field label="Password" hint={needsSetup ? 'At least 8 characters.' : undefined} htmlFor="auth-password">
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

          {needsSetup === false && (
            <p className="mt-6 border-t border-border pt-5 text-[0.8125rem] leading-relaxed text-muted">
              No account yet? Accounts are invite-only. Ask the person who runs this server to create one for you.
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

export default AuthView;
