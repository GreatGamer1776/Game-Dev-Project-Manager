import React, { useMemo, useState } from 'react';
import { Project } from '../types';
import {
  Plus, Code, Gamepad2, Globe, Download, Trash2, Pencil, Search, MoreHorizontal, ArrowLeft, BookOpen, FolderOpen,
} from 'lucide-react';
import { Button, Modal, Input, Textarea, Field, cn } from './ui';
import { showMenu } from '../stores/useMenuStore';

type SortKey = 'recent' | 'name';

const relativeTime = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

interface DashboardProps {
  projects: Project[];
  isLoaded: boolean;
  username?: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, type: Project['type'], description: string) => void;
  onUpdateProject: (id: string, updates: { name: string; description: string }) => void;
  onExportProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onOpenGuide: () => void;
}

const TYPE_ICON: Record<Project['type'], React.ComponentType<{ className?: string }>> = {
  Game: Gamepad2,
  Web: Globe,
  Software: Code,
};

const PROJECT_TYPES: Project['type'][] = ['Game', 'Software', 'Web'];

/** One row in the right-hand "options" column, Obsidian setting-item style. */
const OptionRow: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="flex items-center gap-4 border-t border-border py-4 first:border-t-0">
    <div className="min-w-0 flex-1">
      <div className="text-[0.875rem] font-medium text-content">{title}</div>
      <div className="mt-0.5 text-xs text-muted">{description}</div>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/**
 * Project picker modelled on Obsidian's vault switcher: project list on the
 * left, create/open actions on the right.
 */
const Dashboard: React.FC<DashboardProps> = ({
  projects,
  isLoaded,
  username,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onExportProject,
  onDeleteProject,
  onOpenGuide,
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

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Project list */}
      <aside className="flex max-h-[45vh] min-h-0 shrink-0 flex-col border-b border-border bg-chrome md:max-h-none md:w-80 md:border-b-0 md:border-r">
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
              className="w-full rounded-md border border-border bg-bg py-1.5 pl-7 pr-2 text-[0.8125rem] text-content placeholder:text-faint outline-none focus:border-accent"
            />
          </div>
          <button
            type="button"
            className="icon-btn"
            title={sortBy === 'recent' ? 'Sorted by last modified' : 'Sorted by name'}
            aria-label="Change sort order"
            onClick={e => showMenu(e, [
              { kind: 'heading', label: 'Sort by' },
              { label: 'Last modified', checked: sortBy === 'recent', onSelect: () => setSortBy('recent') },
              { label: 'Name (A to Z)', checked: sortBy === 'name', onSelect: () => setSortBy('name') },
            ], 'below')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {!isLoaded ? (
            <p className="px-2 py-6 text-center text-xs text-faint">Loading projects…</p>
          ) : visibleProjects.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-faint">
              {projects.length === 0 ? 'No projects yet.' : `No projects match “${query}”.`}
            </p>
          ) : (
            visibleProjects.map((project, i) => {
              const Icon = TYPE_ICON[project.type] || Code;
              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectProject(project.id)}
                  onKeyDown={e => { if (e.key === 'Enter') onSelectProject(project.id); }}
                  onContextMenu={e => projectMenu(e, project, 'cursor')}
                  className="group flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-surface-hover animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-faint group-hover:text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.875rem] font-medium text-content">{project.name}</div>
                    <div className="truncate text-[11px] text-faint">
                      {project.type} · {project.files.length} files · {relativeTime(project.lastModified)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Options for ${project.name}`}
                    onClick={e => projectMenu(e, project, 'below')}
                    className="icon-btn h-6 w-6 opacity-0 focus:opacity-100 group-hover:opacity-100"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Actions */}
      <section className="flex min-h-0 flex-1 overflow-y-auto bg-bg">
        <div className="m-auto w-full max-w-lg px-6 py-10">
          {creating ? (
            <form onSubmit={handleCreate} className="animate-fade-in-up">
              <button type="button" onClick={resetCreate} className="mb-6 flex items-center gap-1.5 text-[0.8125rem] text-muted hover:text-content">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h1 className="mb-6 text-xl font-semibold text-content">Create new project</h1>
              <div className="divide-y divide-border">
                <div className="flex items-center gap-4 py-4">
                  <label htmlFor="new-project-name" className="min-w-0 flex-1">
                    <div className="text-[0.875rem] font-medium text-content">Project name</div>
                    <div className="mt-0.5 text-xs text-muted">Shown in the sidebar and switcher.</div>
                  </label>
                  <Input
                    id="new-project-name"
                    autoFocus
                    required
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Space Explorer RPG"
                    className="w-52"
                  />
                </div>
                <div className="flex items-center gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.875rem] font-medium text-content">Type</div>
                    <div className="mt-0.5 text-xs text-muted">Used for the project icon.</div>
                  </div>
                  <div className="flex rounded-md border border-border bg-surface-raised p-0.5" role="radiogroup" aria-label="Project type">
                    {PROJECT_TYPES.map(type => (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={newType === type}
                        onClick={() => setNewType(type)}
                        className={cn(
                          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                          newType === type ? 'bg-accent text-accent-content' : 'text-muted hover:text-content',
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="py-4">
                  <label htmlFor="new-project-desc" className="mb-2 block text-[0.875rem] font-medium text-content">Description</label>
                  <Textarea
                    id="new-project-desc"
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    placeholder="Optional short summary."
                    rows={3}
                    maxLength={200}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="submit" disabled={!newName.trim()}>Create</Button>
              </div>
            </form>
          ) : (
            <div className="animate-fade-in-up">
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 ring-1 ring-accent/30">
                  <span className="text-xl font-extrabold tracking-tight text-accent">DA</span>
                </div>
                <h1 className="text-2xl font-semibold text-content">DevArchitect</h1>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  {username ? `Signed in as ${username}` : 'Plan, document, and architect your projects.'}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface px-4">
                <OptionRow title="Create new project" description="A fresh workspace with a task list, bug tracker, roadmap, and asset library.">
                  <Button icon={Plus} onClick={() => setCreating(true)}>Create</Button>
                </OptionRow>
                {mostRecent && (
                  <OptionRow title="Open most recent" description={mostRecent.name}>
                    <Button variant="secondary" onClick={() => onSelectProject(mostRecent.id)}>Open</Button>
                  </OptionRow>
                )}
                <OptionRow title="Read the guide" description="File types, linking, shortcuts, and workflows.">
                  <Button variant="secondary" icon={BookOpen} onClick={onOpenGuide}>Guide</Button>
                </OptionRow>
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit project"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="edit-project-form">Save</Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={handleEdit} className="space-y-4">
          <Field label="Project name" htmlFor="edit-project-name">
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
