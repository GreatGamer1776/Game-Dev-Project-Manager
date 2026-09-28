import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, PanelLeft, Search, Settings as SettingsIcon, HelpCircle,
  BookOpen, LogOut, Users, ChevronDown, FilePlus, FolderPlus, ShieldCheck,
} from 'lucide-react';
import { Button, Eyebrow, cn } from './ui';
import { AuthUser } from '../services/api';

interface AppTopBarProps {
  inProject: boolean;
  projectName?: string;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onBack: () => void;
  onOpenPalette: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onOpenGuide: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  user: AuthUser | null;
}

const iconBtn =
  'p-2 rounded-lg text-faint hover:text-content hover:bg-surface-hover transition-colors';

/** Unified top bar for every view — replaces the old left sidebar rails. */
const AppTopBar: React.FC<AppTopBarProps> = ({
  inProject,
  projectName,
  drawerOpen,
  onToggleDrawer,
  onBack,
  onOpenPalette,
  onNewFile,
  onNewFolder,
  onOpenGuide,
  onOpenHelp,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
  user,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="h-14 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-surface/90 backdrop-blur-sm z-40">
      {/* Brand */}
      <button
        onClick={onBack}
        title="DevArchitect — Dashboard"
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-hover transition-colors"
      >
        <span className="w-8 h-8 bg-accent-soft rounded-lg flex items-center justify-center shadow-soft">
          <span className="font-display text-[11px] font-extrabold tracking-tight text-accent-content">DA</span>
        </span>
        {!inProject && (
          <span className="hidden sm:block font-display font-semibold text-content tracking-tight">
            DevArchitect
          </span>
        )}
      </button>

      {inProject ? (
        <>
          <button onClick={onBack} className={iconBtn} title="Back to dashboard">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleDrawer}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
              drawerOpen ? 'bg-accent/10 text-accent' : 'text-muted hover:text-content hover:bg-surface-hover'
            )}
            title="Toggle file panel (Ctrl+\)"
          >
            <PanelLeft className="w-4 h-4" />
            <span className="hidden md:inline">Files</span>
          </button>
          <div className="min-w-0 ml-1">
            <Eyebrow className="block leading-none">Project</Eyebrow>
            <span className="font-display text-sm font-semibold text-content truncate block leading-tight mt-0.5 max-w-[200px]">
              {projectName}
            </span>
          </div>
        </>
      ) : null}

      {/* Command palette trigger */}
      <button
        onClick={onOpenPalette}
        className="ml-auto hidden sm:flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-faint hover:text-muted hover:border-border-strong transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span>Search…</span>
        <kbd className="ml-1 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-faint">Ctrl K</kbd>
      </button>
      <button onClick={onOpenPalette} className={cn(iconBtn, 'ml-auto sm:hidden')} title="Search (Ctrl+K)">
        <Search className="w-4 h-4" />
      </button>

      {inProject && (
        <div className="hidden md:flex items-center gap-1">
          <Button size="sm" variant="secondary" icon={FilePlus} onClick={onNewFile}>
            File
          </Button>
          <Button size="sm" variant="ghost" onClick={onNewFolder} title="New folder">
            <FolderPlus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      <div className="h-5 w-px bg-border mx-1 hidden sm:block" />

      <button onClick={onOpenGuide} className={iconBtn} title="Guide">
        <BookOpen className="w-4 h-4" />
      </button>
      <button onClick={onOpenHelp} className={iconBtn} title="Help">
        <HelpCircle className="w-4 h-4" />
      </button>
      <button onClick={onOpenSettings} className={iconBtn} title="Settings">
        <SettingsIcon className="w-4 h-4" />
      </button>
      {user?.isAdmin && (
        <button onClick={onOpenAdmin} className={iconBtn} title="Manage users">
          <Users className="w-4 h-4" />
        </button>
      )}

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className={cn(
            'flex items-center gap-2 rounded-lg pl-1.5 pr-2 py-1.5 transition-colors',
            menuOpen ? 'bg-surface-hover text-content' : 'text-muted hover:text-content hover:bg-surface-hover'
          )}
          title={user?.username}
        >
          <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center font-mono text-xs font-bold uppercase">
            {user?.username?.slice(0, 2) || '??'}
          </span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border-strong bg-surface shadow-pop p-1.5 animate-fade-in z-50">
            <div className="px-2.5 py-2 border-b border-border mb-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-content truncate">
                {user?.username}
                {user?.isAdmin && (
                  <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    <ShieldCheck className="w-3 h-3" /> Admin
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setMenuOpen(false); onLogout(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-danger hover:bg-surface-hover transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default AppTopBar;
