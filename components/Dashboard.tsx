import React, { useMemo, useState } from 'react';
import { Project, TodoData, KanbanData } from '../types';
import {
  Plus, Download, Trash2, Pencil, Search, MoreHorizontal, BookOpen, FolderOpen, ArrowRight, ArrowUpDown,
  HelpCircle, Settings as SettingsIcon, Users, LogOut, ShieldCheck, FileText, CheckSquare, Bug, Check,
} from 'lucide-react';
import { Button, Modal, Input, Textarea, Field, Wordmark, cn } from './ui';
import { showMenu } from '../stores/useMenuStore';
import { AuthUser } from '../services/api';
import ProjectIcon, { PROJECT_TYPE_META } from './shell/ProjectIcon';
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
  onCreateProject: (name: string, type: Project['type'], description: string) => void;
  onUpdateProject: (id: string, updates: { name: string; description: string }) => void;
  onExportProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onOpenGuide: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

const PROJECT_TYPES: Project['type'][] = ['Game', 'Software', 'Web'];

/** Three large radio cards for the project type. */
const TypePicker: React.FC<{ value: Project['type']; onChange: (type: Project['type']) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Project type">
    {PROJECT_TYPES.map(type => {
      const selected = value === type;
      return (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(type)}
          className={cn(
            'relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors sm:flex-col sm:gap-2',
            selected ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-border-strong hover:bg-surface-hover/50',
          )}
        >
          <ProjectIcon type={type} size="sm" />
          <span className="min-w-0">
            <span className="block text-[0.8125rem] font-semibold text-content">{type}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">{PROJECT_TYPE_META[type].blurb}</span>
          </span>
          {selected && (
            <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-content">
              <Check className="h-3 w-3" />
            </span>
          )}
        </button>
      );
    })}
  </div>
);

const Stat: React.FC<{ icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1.5">
    <Icon className="h-3.5 w-3.5 text-faint" />
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
  const [newType, setNewType] = useState<Project['type']>('Game');
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
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

  const openCreate = (type: Project['type'] = 'Game') => {
    setNewType(type);
    setCreating(true);
  };

  const resetCreate = () => {
    setCreating(false);
    setNewName('');
    setNewDescription('');
    setNewType('Game');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onCreateProject(name, newType, newDescription.trim());
    resetCreate();
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setEditName(project.name);
    setEditDescription(project.description || '');
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    onUpdateProject(editing.id, { name: editName.trim(), description: editDescription.trim() });
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
      <header className="flex h-14 shrink-0 items-center gap-2 px-4 sm:px-6">
        <Wordmark />
        <div className="flex-1" />
        <Button variant="ghost" size="sm" icon={BookOpen} onClick={onOpenGuide} className="hidden sm:inline-flex">Guide</Button>
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
          className="relative ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold uppercase text-accent transition-colors hover:bg-accent/25"
        >
          {user?.username?.slice(0, 2) || '??'}
          {user?.isAdmin && <ShieldCheck className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-chrome p-px text-accent" />}
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
          {/* Greeting */}
          <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-in-up">
            <div className="min-w-0">
              <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-content sm:text-[2rem]">
                {hasProjects ? `Welcome back, ${user?.username ?? 'there'}` : 'Plan your first project'}
              </h1>
              <p className="mt-1.5 text-[0.9375rem] text-muted">
                {!isLoaded
                  ? 'Loading your projects…'
                  : hasProjects
                  ? `${plural(projects.length, 'project', 'projects')} · last edit ${relativeTime(mostRecent!.lastModified)}`
                  : 'Docs, tasks, bugs and a roadmap for one game, app or site, in one place.'}
              </p>
            </div>
            {hasProjects && (
              <Button size="lg" icon={Plus} onClick={() => openCreate()}>New project</Button>
            )}
          </div>

          {!isLoaded ? (
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
              {[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-bg" />)}
            </div>
          ) : !hasProjects ? (
            /* First run: pick a type to start */
            <section className="mt-8 animate-fade-in-up">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {PROJECT_TYPES.map(type => (
                  <button key={type} type="button" onClick={() => openCreate(type)} className="card-link group flex flex-col items-start gap-4 p-5 text-left">
                    <ProjectIcon type={type} size="lg" />
                    <span>
                      <span className="block text-base font-semibold text-content">{type} project</span>
                      <span className="mt-1 block text-[0.8125rem] leading-relaxed text-muted">{PROJECT_TYPE_META[type].blurb}</span>
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-accent">
                      Create {type.toLowerCase()} project <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-5 text-[0.8125rem] text-muted">
                Every project starts with a readme, a task list, a bug tracker, a roadmap and an asset library.{' '}
                <button type="button" onClick={onOpenGuide} className="font-medium text-accent underline-offset-4 hover:underline">Read the guide</button>
              </p>
            </section>
          ) : (
            <>
              {/* Continue */}
              {mostRecent && recentStats && !query && (
                <section className="mt-8 animate-fade-in-up" aria-labelledby="continue-heading">
                  <h2 id="continue-heading" className="eyebrow mb-3">Continue where you left off</h2>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectProject(mostRecent.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectProject(mostRecent.id); } }}
                    onContextMenu={e => projectMenu(e, mostRecent, 'cursor')}
                    className="card-link group flex cursor-pointer flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5"
                  >
                    <ProjectIcon type={mostRecent.type} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold tracking-tight text-content">{mostRecent.name}</div>
                      <p className="mt-0.5 line-clamp-1 text-[0.875rem] text-muted">{mostRecent.description || `${mostRecent.type} project`}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted">
                        <Stat icon={FileText}>{plural(recentStats.files, 'file', 'files')}</Stat>
                        <Stat icon={CheckSquare}>{plural(recentStats.tasks, 'open task', 'open tasks')}</Stat>
                        <Stat icon={Bug}>{plural(recentStats.bugs, 'open bug', 'open bugs')}</Stat>
                        <span className="text-faint">Edited {relativeTime(mostRecent.lastModified)}</span>
                      </div>
                    </div>
                    <span className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md bg-accent px-3.5 text-[0.8125rem] font-medium text-accent-content shadow-soft transition-colors group-hover:bg-accent-hover sm:self-center">
                      Open project <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </section>
              )}

              {/* All projects */}
              <section className="mt-10" aria-labelledby="all-heading">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 id="all-heading" className="text-[0.9375rem] font-semibold text-content">All projects</h2>
                  <span className="rounded-full bg-surface-hover px-2 text-xs font-medium tabular-nums text-muted">{projects.length}</span>
                  <div className="flex-1" />
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                  <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                    <Input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search projects"
                      aria-label="Search projects"
                      className="w-full pl-8"
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
                  <div className="rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
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
                          className="card-link group flex cursor-pointer flex-col p-4 animate-fade-in-up"
                          style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                        >
                          <div className="flex items-start gap-3">
                            <ProjectIcon type={project.type} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[0.9375rem] font-semibold text-content">{project.name}</div>
                              <div className="text-xs text-faint">{project.type}</div>
                            </div>
                            <button
                              type="button"
                              aria-label={`Options for ${project.name}`}
                              data-tip="Options"
                              onClick={e => { e.stopPropagation(); projectMenu(e, project, 'below'); }}
                              onKeyDown={e => e.stopPropagation()}
                              className="icon-btn -mr-1 -mt-1 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                          <p className={cn('mt-3 line-clamp-2 min-h-[2.5rem] text-[0.8125rem] leading-5', project.description ? 'text-muted' : 'text-faint')}>
                            {project.description || 'No description yet.'}
                          </p>
                          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 text-xs text-muted">
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
                        onClick={() => openCreate()}
                        className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-[0.8125rem] font-medium text-muted transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent active:translate-y-px"
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
        description="Starts with a readme, a task list, a bug tracker, a roadmap and an asset library."
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
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.8125rem] font-medium text-content">Type</span>
            <TypePicker value={newType} onChange={setNewType} />
          </div>
          <Field label="Description" hint="Optional. Shown on the project card." htmlFor="new-project-desc">
            <Textarea
              id="new-project-desc"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="One line on what you are making."
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
          <Field label="Description" htmlFor="edit-project-desc">
            <Textarea id="edit-project-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} maxLength={200} />
          </Field>
        </form>
      </Modal>
    </div>
  );
};

export default Dashboard;
