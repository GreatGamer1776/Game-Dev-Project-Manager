import React, { useMemo, useState } from 'react';
import { Project, TodoData, KanbanData } from '../types';
import {
  Plus, Download, Trash2, Pencil, Search, MoreHorizontal, BookOpen, FolderOpen, ArrowRight, ArrowUpDown,
  HelpCircle, Settings as SettingsIcon, Users, LogOut, ShieldCheck, FileText, CheckSquare, Bug,
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
  onOpenGuide: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

const Stat: React.FC<{ icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-2">
    <Icon className="h-4 w-4 text-faint" />
    {children}
  </span>
);

/** Home screen: continue the last project, browse all projects, create one. */
const Dashboard: React.FC<DashboardProps> = ({
  projects,
  isLoaded,
  user,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onExportProject,
  onDeleteProject,
  onOpenGuide,
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

  const mostRecent = useMemo(
    () => projects.reduce<Project | null>((best, p) => (!best || p.lastModified > best.lastModified ? p : best), null),
    [projects],
  );
  const recentStats = useMemo(() => (mostRecent ? projectStats(mostRecent) : null), [mostRecent]);

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
      { label: 'Help & shortcuts', icon: HelpCircle, onSelect: onOpenHelp },
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
        <Button variant="ghost" size="sm" icon={BookOpen} onClick={onOpenGuide} className="mr-1 hidden sm:inline-flex">Guide</Button>
        <button type="button" className="icon-btn h-8 w-8" onClick={onOpenHelp} aria-label="Help and shortcuts" data-tip="Help & shortcuts">
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
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
          {/* Greeting */}
          <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-in-up">
            <div className="min-w-0">
              <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-[-0.01em] text-content sm:text-[2rem]">
                {hasProjects ? 'Projects' : 'Plan your first project'}
              </h1>
              <p className="mt-2 text-[0.9375rem] tabular-nums text-muted">
                {!isLoaded
                  ? 'Loading your projects…'
                  : hasProjects
                  ? `${plural(projects.length, 'project', 'projects')} · last edit ${relativeTime(mostRecent!.lastModified)}`
                  : 'Docs, tasks, bugs and a roadmap for one game, app or site, in one place'}
              </p>
            </div>
            {hasProjects && (
              <Button size="lg" icon={Plus} onClick={openCreate}>New project</Button>
            )}
          </div>

          {!isLoaded ? (
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
              {[0, 1, 2].map(i => <div key={i} className="h-40 rounded-xl border border-border bg-bg opacity-60" />)}
            </div>
          ) : !hasProjects ? (
            /* First run: one way in */
            <section className="mt-8 animate-fade-in-up">
              <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border-strong p-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-md text-[0.875rem] leading-6 text-muted">
                  Every project starts with a readme, a task list, a bug tracker, a roadmap and an asset library.{' '}
                  <button type="button" onClick={onOpenGuide} className="font-medium text-content underline-offset-4 hover:underline">Read the guide</button>
                </p>
                <Button size="lg" icon={Plus} onClick={openCreate}>New project</Button>
              </div>
            </section>
          ) : (
            <>
              {/* Continue */}
              {mostRecent && recentStats && !query && (
                <section className="mt-8 animate-fade-in-up" aria-labelledby="continue-heading">
                  <h2 id="continue-heading" className="eyebrow mb-3">Last opened</h2>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectProject(mostRecent.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectProject(mostRecent.id); } }}
                    onContextMenu={e => projectMenu(e, mostRecent, 'cursor')}
                    className="card-link group flex cursor-pointer flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6"
                  >
                    <ProjectIcon project={mostRecent} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-medium text-content">{mostRecent.name}</div>
                      <p className="mt-1 line-clamp-1 text-[0.875rem] text-muted">{mostRecent.description || 'No description'}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] tabular-nums text-muted">
                        <Stat icon={FileText}>{plural(recentStats.files, 'file', 'files')}</Stat>
                        <Stat icon={CheckSquare}>{plural(recentStats.tasks, 'open task', 'open tasks')}</Stat>
                        <Stat icon={Bug}>{plural(recentStats.bugs, 'open bug', 'open bugs')}</Stat>
                        <span className="text-faint">Edited {relativeTime(mostRecent.lastModified)}</span>
                      </div>
                    </div>
                    <span className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border border-border bg-surface-raised px-4 text-[0.8125rem] font-medium text-content shadow-soft transition-colors group-hover:border-border-strong group-hover:bg-surface-hover sm:self-center">
                      Open <ArrowRight className="h-4 w-4 text-muted" />
                    </span>
                  </div>
                </section>
              )}

              {/* All projects */}
              <section className="mt-10" aria-labelledby="all-heading">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 id="all-heading" className="text-[0.9375rem] font-medium text-content">All projects</h2>
                  <span className="count">{projects.length}</span>
                  <div className="flex-1" />
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                  <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    <Input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search"
                      aria-label="Search projects"
                      className="w-full pl-9"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    icon={ArrowUpDown}
                    onClick={e => showMenu(e, [
                      { kind: 'heading', label: 'Sort by' },
                      { label: 'Last edited', checked: sortBy === 'recent', onSelect: () => setSortBy('recent') },
                      { label: 'Name (A to Z)', checked: sortBy === 'name', onSelect: () => setSortBy('name') },
                    ], 'below')}
                  >
                    {sortBy === 'recent' ? 'Last edited' : 'Name'}
                  </Button>
                  </div>
                </div>

                {visibleProjects.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
                    <p className="text-[0.875rem] font-medium text-content">No projects match “{query}”</p>
                    <button type="button" onClick={() => setQuery('')} className="mt-2 text-[0.8125rem] font-medium text-accent hover:underline">Clear search</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleProjects.map((project, i) => {
                      const stats = projectStats(project);
                      return (
                        <div
                          key={project.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${project.name}`}
                          onClick={() => onSelectProject(project.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectProject(project.id); } }}
                          onContextMenu={e => projectMenu(e, project, 'cursor')}
                          className="card-link group flex cursor-pointer flex-col p-5 animate-fade-in-up"
                          style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
                        >
                          <div className="flex items-center gap-3">
                            <ProjectIcon project={project} />
                            <div className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-content">{project.name}</div>
                            <button
                              type="button"
                              aria-label={`Options for ${project.name}`}
                              data-tip="Options"
                              onClick={e => { e.stopPropagation(); projectMenu(e, project, 'below'); }}
                              onKeyDown={e => e.stopPropagation()}
                              className="icon-btn -mr-1 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                          <p className={cn('mt-4 line-clamp-2 min-h-[2.5rem] text-[0.8125rem] leading-5', project.description ? 'text-muted' : 'text-faint')}>
                            {project.description || 'No description'}
                          </p>
                          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 text-xs tabular-nums text-muted">
                            <span>{plural(stats.files, 'file', 'files')}</span>
                            {stats.tasks > 0 && <span>{plural(stats.tasks, 'task', 'tasks')}</span>}
                            {stats.bugs > 0 && <span>{plural(stats.bugs, 'bug', 'bugs')}</span>}
                            <span className="ml-auto text-faint">{relativeTime(project.lastModified)}</span>
                          </div>
                        </div>
                      );
                    })}
                    {!query && (
                      <button
                        type="button"
                        onClick={openCreate}
                        className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-[0.8125rem] font-medium text-muted transition-colors hover:border-faint hover:bg-surface hover:text-content"
                      >
                        <Plus className="h-5 w-5" />
                        New project
                      </button>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {/* Create */}
      <Modal
        open={creating}
        onClose={resetCreate}
        size="lg"
        title="New project"
        description="Starts with a readme, a task list, a bug tracker, a roadmap and an asset library"
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
              placeholder="Space Explorer RPG"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[0.8125rem] font-medium text-content">Icon</span>
            <ProjectIconPicker value={newIcon} onChange={setNewIcon} />
          </div>
          <Field label="Description" hint="Optional, shown on the project card" htmlFor="new-project-desc">
            <Textarea
              id="new-project-desc"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="One line on what you are making"
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
