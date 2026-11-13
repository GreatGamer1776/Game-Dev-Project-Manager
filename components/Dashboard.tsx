import React, { useMemo, useState } from 'react';
import { Project, TodoData, KanbanData } from '../types';
import {
  Plus, Download, Trash2, Pencil, Search, MoreHorizontal, FolderOpen, ArrowUpDown,
  HelpCircle, Settings as SettingsIcon, Users, LogOut, ShieldCheck,
} from 'lucide-react';
import { Button, Modal, Input, Textarea, Field, Wordmark, cn } from './ui';
import { showMenu } from '../stores/useMenuStore';
import { AuthUser } from '../services/api';
import ProjectIcon, { DEFAULT_PROJECT_ICON, ProjectIconPicker, projectIconKey } from './shell/ProjectIcon';
import { SINGLE_INSTANCE_FILE_TYPES } from './fileTypes';

type SortKey = 'recent' | 'name';

const relativeTime = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Files the user made (the four project systems are left out), open tasks, open bugs. */
const projectStats = (project: Project) => {
  let tasks = 0;
  let bugs = 0;
  let files = 0;
  for (const f of project.files) {
    if (f.type === 'todo') tasks += ((f.content as TodoData)?.items || []).filter(i => !i.completed && i.status !== 'Done').length;
    else if (f.type === 'kanban') bugs += ((f.content as KanbanData)?.tasks || []).filter(t => t.status === 'Open' || t.status === 'In Progress').length;
    if (!SINGLE_INSTANCE_FILE_TYPES.has(f.type)) files += 1;
  }
  return { files, tasks, bugs };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface DashboardProps {
  projects: Project[];
  isLoaded: boolean;
  user: AuthUser | null;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, description: string, icon: string) => void;
  onUpdateProject: (id: string, updates: { name: string; description: string; icon?: string }) => void;
  onExportProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

/** Home screen: every project as a card, plus search, sort and create. */
const Dashboard: React.FC<DashboardProps> = ({
  projects,
  isLoaded,
  user,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onExportProject,
  onDeleteProject,
  onOpenHelp,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIcon, setNewIcon] = useState(DEFAULT_PROJECT_ICON);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIcon, setEditIcon] = useState(DEFAULT_PROJECT_ICON);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? projects.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
      : projects;
    return [...filtered].sort((a, b) =>
      sortBy === 'name'
        ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        : (b.lastModified || 0) - (a.lastModified || 0));
  }, [projects, query, sortBy]);

  const openCreate = () => setCreating(true);

  const resetCreate = () => {
    setCreating(false);
    setNewName('');
    setNewDescription('');
    setNewIcon(DEFAULT_PROJECT_ICON);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onCreateProject(name, newDescription.trim(), newIcon);
    resetCreate();
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setEditName(project.name);
    setEditDescription(project.description || '');
    setEditIcon(projectIconKey(project));
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    onUpdateProject(editing.id, { name: editName.trim(), description: editDescription.trim(), icon: editIcon });
    setEditing(null);
  };

  const projectMenu = (e: React.MouseEvent, project: Project, placement: 'cursor' | 'below') =>
    showMenu(e, [
      { label: 'Open', icon: FolderOpen, onSelect: () => onSelectProject(project.id) },
      { label: 'Edit details', icon: Pencil, onSelect: () => openEdit(project) },
      { label: 'Export as ZIP', icon: Download, onSelect: () => onExportProject(project) },
      { kind: 'separator' },
      { label: 'Delete project', icon: Trash2, danger: true, onSelect: () => onDeleteProject(project.id) },
    ], placement);

  const accountMenu = (e: React.MouseEvent) =>
    showMenu(e, [
      { kind: 'heading', label: user?.isAdmin ? `${user.username} · admin` : user?.username || 'Account' },
      ...(user?.isAdmin ? [{ label: 'Manage users', icon: Users, onSelect: onOpenAdmin }] : []),
      { label: 'Settings', icon: SettingsIcon, hint: 'Ctrl+,', onSelect: onOpenSettings },
      { label: 'Keyboard shortcuts', icon: HelpCircle, onSelect: onOpenHelp },
      { kind: 'separator' },
      { label: 'Sign out', icon: LogOut, danger: true, onSelect: onLogout },
    ], 'below');

  const hasProjects = projects.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-1 px-4 sm:px-6">
        <Wordmark />
        <div className="flex-1" />
        <button type="button" className="icon-btn h-8 w-8" onClick={onOpenHelp} aria-label="Keyboard shortcuts" data-tip="Keyboard shortcuts">
          <HelpCircle className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn h-8 w-8" onClick={onOpenSettings} aria-label="Settings" data-tip="Settings" data-tip-kbd="Ctrl ,">
          <SettingsIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={accountMenu}
          aria-label="Account menu"
          data-tip={user?.username}
          className="relative ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-raised text-xs font-medium text-content transition-colors hover:border-border-strong hover:bg-surface-hover"
        >
          {(user?.username?.charAt(0) || '?').toUpperCase()}
          {user?.isAdmin && <ShieldCheck className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-chrome p-0.5 text-muted" />}
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-8 sm:pt-12">
          <div className="flex flex-wrap items-center gap-3 pb-4">
            <h1 className="font-display text-2xl font-semibold leading-tight text-content">Projects</h1>
            {isLoaded && hasProjects && <span className="count mt-1">{projects.length}</span>}
            <div className="flex-1" />
            {isLoaded && hasProjects && (
              <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
                <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search projects"
                    aria-label="Search projects"
                    className="w-full pl-9"
                  />
                </div>
                <Button
                  variant="secondary"
                  icon={ArrowUpDown}
                  aria-label="Sort projects"
                  onClick={e => showMenu(e, [
                    { kind: 'heading', label: 'Sort by' },
                    { label: 'Last edited', checked: sortBy === 'recent', onSelect: () => setSortBy('recent') },
                    { label: 'Name (A to Z)', checked: sortBy === 'name', onSelect: () => setSortBy('name') },
                  ], 'below')}
                >
                  {sortBy === 'recent' ? 'Last edited' : 'Name'}
                </Button>
              </div>
            )}
            {isLoaded && hasProjects && <Button icon={Plus} onClick={openCreate}>New project</Button>}
          </div>

          {!isLoaded ? (
            <div className="mt-2 border-t border-border" aria-hidden>
              {[0, 1, 2].map(i => <div key={i} className="h-14 border-b border-border" />)}
            </div>
          ) : !hasProjects ? (
            <div className="mt-2 flex flex-col items-start gap-4 border-t border-border py-12 animate-fade-in-up">
              <p className="text-[0.875rem] text-muted">No projects on this server</p>
              <Button icon={Plus} onClick={openCreate}>New project</Button>
            </div>
          ) : visibleProjects.length === 0 ? (
            <div className="empty-line mt-2 justify-start border-t border-border">
              <span>No projects match “{query}”</span>
              <button type="button" onClick={() => setQuery('')} className="link-action">Clear search</button>
            </div>
          ) : (
            <div className="mt-2" role="table" aria-label="Projects">
              <div role="row" className="hidden grid-cols-[minmax(0,1fr)_64px_96px_96px_112px_28px] items-center gap-4 border-b border-border px-3 py-2 text-xs text-faint sm:grid">
                <span role="columnheader">Name</span>
                <span role="columnheader" className="text-right">Files</span>
                <span role="columnheader" className="text-right">Open tasks</span>
                <span role="columnheader" className="text-right">Open bugs</span>
                <span role="columnheader" className="text-right">Edited</span>
                <span />
              </div>
              {visibleProjects.map(project => {
                const stats = projectStats(project);
                const figure = (n: number) => <span className={cn('count text-right text-[0.8125rem]', n > 0 ? 'text-content' : 'text-faint')}>{n}</span>;
                return (
                  <div
                    key={project.id}
                    role="row"
                    tabIndex={0}
                    aria-label={`Open ${project.name}`}
                    onClick={() => onSelectProject(project.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectProject(project.id); } }}
                    onContextMenu={e => projectMenu(e, project, 'cursor')}
                    className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_28px] items-center gap-4 border-b border-border px-3 py-3 outline-none transition-colors hover:bg-surface focus-visible:bg-surface sm:grid-cols-[minmax(0,1fr)_64px_96px_96px_112px_28px]"
                  >
                    <div role="cell" className="flex min-w-0 items-center gap-3">
                      <ProjectIcon project={project} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-[0.875rem] font-medium text-content">{project.name}</div>
                        {project.description && <div className="truncate text-xs text-faint">{project.description}</div>}
                        <div className="count mt-1 sm:hidden">
                          {stats.files} files · {stats.tasks} tasks · {stats.bugs} bugs · {relativeTime(project.lastModified)}
                        </div>
                      </div>
                    </div>
                    <span role="cell" className="hidden sm:contents">
                      {figure(stats.files)}
                      {figure(stats.tasks)}
                      {figure(stats.bugs)}
                      <span className="text-right text-xs tabular-nums text-faint">{relativeTime(project.lastModified)}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Options for ${project.name}`}
                      data-tip="Options"
                      onClick={e => { e.stopPropagation(); projectMenu(e, project, 'below'); }}
                      onKeyDown={e => e.stopPropagation()}
                      className="icon-btn opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create */}
      <Modal
        open={creating}
        onClose={resetCreate}
        size="lg"
        title="New project"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={resetCreate}>Cancel</Button>
            <Button type="submit" form="create-project-form" disabled={!newName.trim()}>Create project</Button>
          </>
        }
      >
        <form id="create-project-form" onSubmit={handleCreate} className="space-y-5">
          <Field label="Name" htmlFor="new-project-name">
            <Input
              id="new-project-name"
              autoFocus
              required
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[0.8125rem] font-medium text-content">Icon</span>
            <ProjectIconPicker value={newIcon} onChange={setNewIcon} />
          </div>
          <Field label="Description" htmlFor="new-project-desc">
            <Textarea
              id="new-project-desc"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              rows={2}
              maxLength={200}
            />
          </Field>
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title="Edit project"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="edit-project-form">Save changes</Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={handleEdit} className="space-y-4">
          <Field label="Name" htmlFor="edit-project-name">
            <Input id="edit-project-name" autoFocus required value={editName} onChange={e => setEditName(e.target.value)} />
          </Field>
          {editing && (
            <div className="flex flex-col gap-2">
              <span className="text-[0.8125rem] font-medium text-content">Icon</span>
              <ProjectIconPicker value={editIcon} onChange={setEditIcon} />
            </div>
          )}
          <Field label="Description" htmlFor="edit-project-desc">
            <Textarea id="edit-project-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} maxLength={200} />
          </Field>
        </form>
      </Modal>
    </div>
  );
};

export default Dashboard;
