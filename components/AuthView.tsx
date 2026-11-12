import React, { useEffect, useState } from 'react';
import { FileText, CheckSquare, Map as MapIcon, Server, Bug, Loader2 } from 'lucide-react';
import { Button, Input, Field, Wordmark, Logo, cn } from './ui';
import { useAuthStore } from '../stores/useAuthStore';
import { api, ApiError } from '../services/api';

const FEATURES = [
  { icon: FileText, title: 'Design docs that link', text: 'Markdown with [[links]], tags, callouts and diagrams' },
  { icon: CheckSquare, title: 'Tasks and bugs on boards', text: 'A task list, a bug tracker and a roadmap in every project' },
  { icon: Server, title: 'Runs on your server', text: 'Projects live in your own database, no email needed' },
];

type Priority = 'High' | 'Medium' | 'Low';
const PRIORITY_DOT: Record<Priority, string> = { High: 'bg-danger', Medium: 'bg-warning', Low: 'bg-faint' };

/** A static task board in the app's own styles, so the sign-in page shows the product. */
const BoardPreview: React.FC = () => {
  const columns: { title: string; cards: { text: string; priority: Priority; sub?: string; due?: string }[] }[] = [
    { title: 'To do', cards: [
      { text: 'Boss 1 attack patterns', priority: 'Medium', due: 'Nov 18' },
      { text: 'Controller remapping', priority: 'Low' },
      { text: 'Storm timer on the HUD', priority: 'Medium', sub: '0/3' },
    ] },
    { title: 'In progress', cards: [
      { text: 'Scrap pickup magnet', priority: 'High', sub: '2/5', due: 'Nov 14' },
      { text: 'Rail cart physics', priority: 'High', sub: '1/4' },
    ] },
    { title: 'Done', cards: [
      { text: 'Main menu music pass', priority: 'Low' },
      { text: 'Save slots', priority: 'Medium' },
    ] },
  ];
  return (
    <div aria-hidden className="overflow-hidden rounded-2xl border border-border bg-bg shadow-pop">
      <div className="flex h-10 items-center gap-2 border-b border-border px-4">
        <CheckSquare className="h-4 w-4 text-muted" />
        <span className="text-xs font-medium text-content">Task List</span>
        <span className="text-xs text-faint">· Ashfall</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-faint"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Saved</span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {columns.map(col => (
          <div key={col.title} className="rounded-xl bg-surface p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-muted">
              {col.title}
              <span className="count">{col.cards.length}</span>
            </div>
            <div className="space-y-2">
              {col.cards.map(card => {
                const done = col.title === 'Done';
                return (
                  <div key={card.text} className="rounded-lg border border-border bg-bg p-2">
                    <div className={cn('text-xs leading-4 text-content', done && 'text-faint line-through')}>{card.text}</div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
                      <span className="flex items-center gap-1"><span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[card.priority])} />{card.priority}</span>
                      {card.sub && !done && <span className="count">{card.sub}</span>}
                      {card.due && !done && <span className="count ml-auto">{card.due}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 border-t border-border px-4 py-3 text-[11px] text-faint">
        <span className="flex items-center gap-1.5"><Bug className="h-3.5 w-3.5" /> <span className="count text-muted">2</span> open bugs</span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <MapIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Vertical slice</span>
          <span className="h-1 min-w-[48px] flex-1 overflow-hidden rounded-full bg-surface-hover"><span className="block h-full w-[70%] rounded-full bg-accent" /></span>
          <span className="count text-muted">70%</span>
        </span>
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
      <aside className="relative hidden w-[50%] max-w-[720px] shrink-0 flex-col overflow-hidden border-r border-border bg-chrome px-12 py-8 lg:flex">
        <Wordmark />
        <div className="my-auto py-12 animate-fade-in-up">
          <h2 className="max-w-md font-display text-[2rem] font-medium leading-[1.15] tracking-[-0.01em] text-content">
            Plan your game, app or site in one workspace
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <span>
                  <span className="block text-[0.875rem] font-medium text-content">{title}</span>
                  <span className="mt-1 block text-[0.8125rem] leading-5 text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-12">
            <BoardPreview />
          </div>
        </div>
        <p className="text-xs text-faint">DevArchitect · self-hosted project planning</p>
      </aside>

      {/* Form side */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[22rem] animate-fade-in-up">
          <Logo size={40} className="mb-6 lg:hidden" />
          <h1 className="font-display text-[1.75rem] font-medium tracking-[-0.01em] text-content">
            {needsSetup ? 'Create the admin account' : 'Sign in'}
          </h1>
          <p className="mt-2 text-[0.875rem] leading-6 text-muted">
            {needsSetup
              ? 'This is the first account on this server. It can create accounts for everyone else.'
              : 'Open your projects on this server'}
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

          {needsSetup === false && (
            <p className="mt-6 border-t border-border pt-6 text-[0.8125rem] leading-5 text-muted">
              No account yet? Accounts are invite-only. Ask the person who runs this server to create one for you.
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

export default AuthView;
