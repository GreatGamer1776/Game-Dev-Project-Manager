import React from 'react';
import {
  PanelLeft, LayoutGrid, FileSearch, Terminal, FilePlus2, BookOpen, HelpCircle,
  Settings as SettingsIcon, Users, LogOut, ShieldCheck,
} from 'lucide-react';
import { ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { showMenu } from '../../stores/useMenuStore';
import { AuthUser } from '../../services/api';
import { cn } from '../ui';

interface RibbonProps {
  inProject: boolean;
  leftOpen: boolean;
  onToggleLeft: () => void;
  onHome: () => void;
  onQuickSwitch: () => void;
  onCommandPalette: () => void;
  onNewDocument: () => void;
  /** Project "systems" (task list, bug tracker, ...) pinned as ribbon actions. */
  systemFiles: ProjectFile[];
  activeFileId: string | null;
  onOpenFile: (fileId: string) => void;
  onOpenGuide: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  user: AuthUser | null;
  homeActive: boolean;
}

const RibbonButton: React.FC<{
  label: string;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, active, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={cn('icon-btn h-8 w-8', active && 'is-active text-content')}
  >
    {children}
  </button>
);

/** Obsidian's thin left ribbon: global actions top, app/account actions bottom. */
const Ribbon: React.FC<RibbonProps> = ({
  inProject,
  leftOpen,
  onToggleLeft,
  onHome,
  onQuickSwitch,
  onCommandPalette,
  onNewDocument,
  systemFiles,
  activeFileId,
  onOpenFile,
  onOpenGuide,
  onOpenHelp,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
  user,
  homeActive,
}) => {
  const openAccountMenu = (e: React.MouseEvent) =>
    showMenu(e, [
      { kind: 'heading', label: user?.isAdmin ? `${user.username} · admin` : user?.username || 'Account' },
      ...(user?.isAdmin ? [{ label: 'Manage users', icon: Users, onSelect: onOpenAdmin }] : []),
      { label: 'Settings', icon: SettingsIcon, hint: 'Ctrl+,', onSelect: onOpenSettings },
      { kind: 'separator' as const },
      { label: 'Sign out', icon: LogOut, danger: true, onSelect: onLogout },
    ], 'below');

  return (
    <nav
      aria-label="Ribbon"
      className="flex w-[var(--ribbon-w)] shrink-0 flex-col items-center border-r border-border bg-chrome"
    >
      <div className="flex h-[var(--header-h)] w-full shrink-0 items-center justify-center">
        {inProject && (
          <RibbonButton label={leftOpen ? 'Collapse sidebar (Ctrl+\\)' : 'Expand sidebar (Ctrl+\\)'} onClick={onToggleLeft}>
            <PanelLeft className="h-[18px] w-[18px]" />
          </RibbonButton>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <RibbonButton label="Projects" onClick={onHome} active={homeActive}>
          <LayoutGrid className="h-[18px] w-[18px]" />
        </RibbonButton>
        <RibbonButton label="Quick switcher (Ctrl+O)" onClick={onQuickSwitch}>
          <FileSearch className="h-[18px] w-[18px]" />
        </RibbonButton>
        <RibbonButton label="Command palette (Ctrl+P)" onClick={onCommandPalette}>
          <Terminal className="h-[18px] w-[18px]" />
        </RibbonButton>
        {inProject && (
          <>
            <RibbonButton label="New document (Alt+N)" onClick={onNewDocument}>
              <FilePlus2 className="h-[18px] w-[18px]" />
            </RibbonButton>
            {systemFiles.length > 0 && <div className="my-1 h-px w-5 bg-border" />}
            {systemFiles.map(file => {
              const Icon = getFileTypeMeta(file.type).icon;
              return (
                <RibbonButton
                  key={file.id}
                  label={`Open ${file.name}`}
                  onClick={() => onOpenFile(file.id)}
                  active={activeFileId === file.id}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </RibbonButton>
              );
            })}
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1 pb-2">
        <RibbonButton label="Guide" onClick={onOpenGuide}>
          <BookOpen className="h-[18px] w-[18px]" />
        </RibbonButton>
        <RibbonButton label="Help & shortcuts" onClick={onOpenHelp}>
          <HelpCircle className="h-[18px] w-[18px]" />
        </RibbonButton>
        <RibbonButton label="Settings (Ctrl+,)" onClick={onOpenSettings}>
          <SettingsIcon className="h-[18px] w-[18px]" />
        </RibbonButton>
        <button
          type="button"
          onClick={openAccountMenu}
          title={user?.username}
          aria-label="Account menu"
          className="relative mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold uppercase text-accent hover:bg-accent/30"
        >
          {user?.username?.slice(0, 2) || '??'}
          {user?.isAdmin && (
            <ShieldCheck className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-chrome p-px text-accent" />
          )}
        </button>
      </div>
    </nav>
  );
};

export default Ribbon;
