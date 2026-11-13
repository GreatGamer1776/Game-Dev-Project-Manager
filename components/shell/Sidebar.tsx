import React, { useMemo, useState } from 'react';
import {
  ChevronsUpDown, PanelLeftClose, Search, Plus, Waypoints, CalendarDays, ChevronRight, Files, Bookmark, Hash,
  Settings as SettingsIcon, HelpCircle, Users, LogOut, ShieldCheck, LayoutGrid, Command,
} from 'lucide-react';
import { Project, ProjectFile, FileType, TodoData, KanbanData } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { CREATABLE_TYPES } from './FileExplorer';
import { showMenu, MenuEntry } from '../../stores/useMenuStore';
import { AuthUser } from '../../services/api';
import ProjectIcon from './ProjectIcon';
import { cn } from '../ui';

export type LeftTab = 'files' | 'search' | 'bookmarks' | 'tags';

const WORKSPACE_KEY = 'devarchitect-sidebar-workspace';

const TABS: { id: LeftTab; label: string; kbd?: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'search', label: 'Search', kbd: 'Ctrl Shift F' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'tags', label: 'Tags' },
];

/** Open-item count shown beside a project system (unfinished tasks, open bugs). */
const openCount = (file: ProjectFile): number | null => {
  if (file.type === 'todo') {
    const items = (file.content as TodoData)?.items || [];
    return items.filter(i => !i.completed && i.status !== 'Done').length;
  }
  if (file.type === 'kanban') {
    const tasks = (file.content as KanbanData)?.tasks || [];
    return tasks.filter(t => t.status === 'Open' || t.status === 'In Progress').length;
  }
  return null;
};

const NavItem: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  count?: number | null;
  kbd?: string;
  onClick: () => void;
}> = ({ icon: Icon, label, active, count, kbd, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    data-tip={kbd ? label : undefined}
    data-tip-kbd={kbd}
    data-tip-side="right"
    className={cn('nav-row group px-2', active && 'is-active')}
  >
    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-faint group-hover:text-muted')} />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {count ? <span className="count shrink-0 pr-1">{count}</span> : null}
  </button>
);

interface SidebarProps {
  project: Project;
  user: AuthUser | null;
  systemFiles: ProjectFile[];
  activeFileId: string | null;
  graphActive: boolean;
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  /** The active panel (file tree, search, bookmarks, tags). */
  children: React.ReactNode;
  onProjectMenu: (e: React.MouseEvent) => void;
  onCollapse: () => void;
  onQuickSwitch: () => void;
  onCommandPalette: () => void;
  onNewFile: (type: FileType) => void;
  onOpenFile: (fileId: string) => void;
  onOpenGraph: () => void;
  onOpenDailyNote: () => void;
  onHome: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

/**
 * The left sidebar: project switcher, "go to file", the project's systems
 * with open counts, the file tree (or search / saved / tags), and the account.
 */
const Sidebar: React.FC<SidebarProps> = ({
  project,
  user,
  systemFiles,
  activeFileId,
  graphActive,
  tab,
  onTabChange,
  children,
  onProjectMenu,
  onCollapse,
  onQuickSwitch,
  onCommandPalette,
  onNewFile,
  onOpenFile,
  onOpenGraph,
  onOpenDailyNote,
  onHome,
  onOpenHelp,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
}) => {
  const [workspaceOpen, setWorkspaceOpen] = useState(() => {
    try { return window.localStorage.getItem(WORKSPACE_KEY) !== 'false'; } catch { return true; }
  });
  const toggleWorkspace = () => setWorkspaceOpen(open => {
    try { window.localStorage.setItem(WORKSPACE_KEY, String(!open)); } catch { /* in-memory only */ }
    return !open;
  });

  const counts = useMemo(() => new Map(systemFiles.map(f => [f.id, openCount(f)])), [systemFiles]);

  const newFileMenu = (e: React.MouseEvent) =>
    showMenu(e, [
      { kind: 'heading', label: 'Create' },
      ...CREATABLE_TYPES.map((type): MenuEntry => {
        const meta = getFileTypeMeta(type);
        return { label: meta.label, icon: meta.icon, hint: type === 'doc' ? 'Alt+N' : undefined, onSelect: () => onNewFile(type) };
      }),
    ], 'below');

  const accountMenu = (e: React.MouseEvent) =>
    showMenu(e, [
      { kind: 'heading', label: user?.isAdmin ? `${user.username} · admin` : user?.username || 'Account' },
      { label: 'All projects', icon: LayoutGrid, onSelect: onHome },
      ...(user?.isAdmin ? [{ label: 'Manage users', icon: Users, onSelect: onOpenAdmin }] : []),
      { label: 'Settings', icon: SettingsIcon, hint: 'Ctrl+,', onSelect: onOpenSettings },
      { label: 'Keyboard shortcuts', icon: HelpCircle, onSelect: onOpenHelp },
      { kind: 'separator' },
      { label: 'Sign out', icon: LogOut, danger: true, onSelect: onLogout },
    ], 'below');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Project switcher + collapse */}
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <button
          type="button"
          onClick={onProjectMenu}
          data-tip="Switch project"
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-surface-hover"
        >
          <ProjectIcon project={project} size="sm" />
          <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium leading-5 text-content">{project.name}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-faint group-hover:text-muted" />
        </button>
        <button type="button" className="icon-btn" onClick={onCollapse} aria-label="Hide sidebar" data-tip="Hide sidebar" data-tip-kbd="Ctrl \">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Go to file + new */}
      <div className="flex shrink-0 items-center gap-2 px-2 pb-2 pt-2">
        <button
          type="button"
          onClick={onQuickSwitch}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-2 text-[0.8125rem] text-faint shadow-soft transition-colors hover:border-border-strong hover:text-muted"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">Go to file</span>
          <span className="kbd hidden sm:inline-flex">Ctrl O</span>
        </button>
        <button
          type="button"
          onClick={newFileMenu}
          aria-label="New file"
          data-tip="New file"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-muted shadow-soft transition-[background-color,border-color,color,transform] hover:border-border-strong hover:text-content active:scale-[0.96]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Project systems */}
      <div className="shrink-0 px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={toggleWorkspace}
          aria-expanded={workspaceOpen}
          className="group flex h-6 w-full items-center gap-1 rounded-md px-2 text-left"
        >
          <span className="eyebrow group-hover:text-muted">Workspace</span>
          <ChevronRight className={cn('h-3 w-3 text-faint transition-transform', workspaceOpen && 'rotate-90')} />
        </button>
        {workspaceOpen && (
          <div className="mt-1 flex flex-col gap-0.5">
            {systemFiles.map(file => (
              <NavItem
                key={file.id}
                icon={getFileTypeMeta(file.type).icon}
                label={file.name}
                active={activeFileId === file.id}
                count={counts.get(file.id)}
                onClick={() => onOpenFile(file.id)}
              />
            ))}
            <NavItem icon={Waypoints} label="Graph view" active={graphActive} kbd="Ctrl G" onClick={onOpenGraph} />
            <NavItem icon={CalendarDays} label="Today's note" kbd="Alt D" onClick={onOpenDailyNote} />
          </div>
        )}
      </div>

      {/* Panel tabs */}
      <div className="shrink-0 px-2 pb-1 pt-4">
        <div className="seg" role="tablist" aria-label="Sidebar panels">
          {TABS.map(({ id, label, kbd }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              data-tip={kbd ? 'Search all files' : undefined}
              data-tip-kbd={kbd}
              className="seg-item"
            >
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">{children}</div>

      {/* Account */}
      <div className="flex shrink-0 items-center gap-0.5 border-t border-border px-2 py-2">
        <button
          type="button"
          onClick={accountMenu}
          aria-label="Account menu"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-surface-hover"
        >
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-xs font-medium text-content">
            {(user?.username?.charAt(0) || '?').toUpperCase()}
            {user?.isAdmin && <ShieldCheck className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-chrome p-0.5 text-muted" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-content">{user?.username}</span>
        </button>
        <button type="button" className="icon-btn" onClick={onCommandPalette} aria-label="Command palette" data-tip="Command palette" data-tip-kbd="Ctrl P" data-tip-side="top">
          <Command className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn" onClick={onOpenHelp} aria-label="Keyboard shortcuts" data-tip="Keyboard shortcuts" data-tip-side="top">
          <HelpCircle className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Settings" data-tip="Settings" data-tip-kbd="Ctrl ," data-tip-side="top">
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
