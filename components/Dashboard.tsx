import React, { useState } from 'react';
import { Project } from '../types';
import { Plus, Code, Gamepad2, Globe, FileCode, Download, Trash2, HardDrive, Import, Pencil, BookOpen, Settings as SettingsIcon, Search } from 'lucide-react';
import { Button, Card, Modal, Input, Textarea, Field, Select, Eyebrow, TickFrame, cn } from './ui';
import { useSettingsStore } from '../stores/useSettingsStore';

type SortKey = 'recent' | 'name' | 'files';

/** "16 JUN 26" — mono drafting-style date stamp. */
const stampDate = (ts: number) =>
  new Date(ts)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    .toUpperCase();

interface DashboardProps {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, type: Project['type'], description: string) => void;
  onUpdateProject: (id: string, updates: { name: string; description: string }) => void;
  onOpenWhatsNew: () => void;
  onLinkProjectToFolder: (id: string) => void;
  onExportProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onImportFolder: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
    projects,
    onSelectProject,
    onCreateProject,
    onUpdateProject,
    onOpenWhatsNew,
    onLinkProjectToFolder,
    onExportProject,
    onDeleteProject,
    onImportFolder
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectType, setNewProjectType] = useState<Project['type']>('Software');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const openSettings = useSettingsStore((s) => s.openSettings);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  const visibleProjects = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? projects.filter(p =>
          p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
      : projects;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      if (sortBy === 'files') return (b.files?.length || 0) - (a.files?.length || 0);
      return (b.lastModified || 0) - (a.lastModified || 0); // recent
    });
    return sorted;
  }, [projects, query, sortBy]);

  const closeCreateModal = () => {
    setIsModalOpen(false);
    setNewProjectName('');
    setNewProjectDescription('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newProjectName.trim();
    if (trimmedName) {
      onCreateProject(trimmedName, newProjectType, newProjectDescription.trim());
      closeCreateModal();
    }
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingProjectId(null);
    setEditProjectName('');
    setEditProjectDescription('');
  };

  const openEditModal = (project: Project) => {
    setEditingProjectId(project.id);
    setEditProjectName(project.name);
    setEditProjectDescription(project.description || '');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjectId) return;
    const trimmedName = editProjectName.trim();
    if (!trimmedName) return;

    onUpdateProject(editingProjectId, {
      name: trimmedName,
      description: editProjectDescription.trim()
    });
    closeEditModal();
  };

  const getTypeIcon = (type: Project['type']) => {
    switch (type) {
      case 'Game': return <Gamepad2 className="w-6 h-6 text-violet-400" />;
      case 'Web': return <Globe className="w-6 h-6 text-sky-400" />;
      default: return <Code className="w-6 h-6 text-emerald-400" />;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <Eyebrow>Workspace / {String(projects.length).padStart(2, '0')}</Eyebrow>
          <h1 className="font-display text-4xl font-bold text-content tracking-tight mt-1.5">Projects</h1>
          <p className="text-muted mt-2">Plan, document, and architect your software and games.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
            <Button variant="secondary" size="icon" onClick={openSettings} title="Settings" aria-label="Settings">
              <SettingsIcon className="w-4 h-4" />
            </Button>
            <Button variant="secondary" icon={BookOpen} onClick={onOpenWhatsNew}>
              What's new
            </Button>
            <Button variant="secondary" icon={Import} onClick={onImportFolder}>
              Import folder
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
              New project
            </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <TickFrame className="bg-blueprint text-center py-20 px-6 border border-dashed border-border-strong rounded-2xl">
          <FileCode className="w-14 h-14 text-faint mx-auto mb-4" />
          <h3 className="font-display text-2xl font-semibold text-content">Your drafting table is empty</h3>
          <p className="text-muted mt-2 max-w-sm mx-auto">Create a project to start planning, or import a folder you already have on disk.</p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
              New project
            </Button>
            <Button variant="secondary" icon={Import} onClick={onImportFolder}>
              Import folder
            </Button>
          </div>
        </TickFrame>
      ) : (
        <>
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="pl-9"
              aria-label="Search projects"
            />
          </div>
          <div className="w-48">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort projects"
            >
              <option value="recent">Recently updated</option>
              <option value="name">Name (A–Z)</option>
              <option value="files">Most files</option>
            </Select>
          </div>
          <Eyebrow className="ml-auto">{String(visibleProjects.length).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}</Eyebrow>
        </div>
        {visibleProjects.length === 0 ? (
          <div className="bg-blueprint text-center py-16 border border-dashed border-border rounded-2xl">
            <Search className="w-10 h-10 text-faint mx-auto mb-3" />
            <p className="text-muted">No projects match “{query}”. Try a different search.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--grid-gap)]">
          {visibleProjects.map((project) => (
            <Card key={project.id} className="group relative p-[var(--card-pad)] overflow-hidden flex flex-col">
              {/* Registration ticks reveal on hover — the drafting-sheet cue. */}
              <span aria-hidden className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 border-l border-t border-accent/0 group-hover:border-accent/60 transition-colors" />
              <span aria-hidden className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 border-r border-t border-accent/0 group-hover:border-accent/60 transition-colors" />

              {/* Main Clickable Area */}
              <div
                className="cursor-pointer flex-1 relative z-10"
                onClick={() => onSelectProject(project.id)}
              >
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2.5 bg-surface-raised rounded-lg inline-block border border-border group-hover:border-accent/50 transition-colors">
                      {getTypeIcon(project.type)}
                    </div>

                    {/* Local Indicator */}
                    {project.isLocal && (
                        <div className="flex items-center gap-1 bg-accent/10 border border-accent/30 px-2 py-1 rounded font-mono text-[10px] text-accent font-semibold uppercase tracking-wider">
                            <HardDrive className="w-3 h-3" />
                            Local
                        </div>
                    )}
                </div>

                <Eyebrow className="block mb-1.5">{project.type}</Eyebrow>
                <h3 className="font-display text-xl font-semibold text-content mb-2 group-hover:text-accent transition-colors">{project.name}</h3>
                <p className="text-muted text-sm line-clamp-2 h-10">{project.description || "No description yet."}</p>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-border mt-4 relative z-20">
                 <span className="font-mono text-[11px] tracking-wide text-faint">
                    {String(project.files.length).padStart(2, '0')} FILES · {stampDate(project.lastModified)}
                 </span>
                 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconAction title="Edit Project" hoverClass="hover:text-warning"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(project); }}>
                      <Pencil className="w-4 h-4" />
                    </IconAction>
                    <IconAction title={project.isLocal ? "Relink Local Folder" : "Link to Local Folder"} hoverClass="hover:text-success"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLinkProjectToFolder(project.id); }}>
                      <HardDrive className="w-4 h-4" />
                    </IconAction>
                    <IconAction title="Export JSON" hoverClass="hover:text-accent"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExportProject(project); }}>
                      <Download className="w-4 h-4" />
                    </IconAction>
                    <IconAction title={project.isLocal ? "Remove from List" : "Delete Permanently"} hoverClass="hover:text-danger"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteProject(project.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </IconAction>
                 </div>
              </div>
            </Card>
          ))}
        </div>
        )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeCreateModal}
        title="New project"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={closeCreateModal}>Cancel</Button>
            <Button variant="primary" type="submit" form="create-project-form">Create</Button>
          </>
        }
      >
        <form id="create-project-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="Project Name" htmlFor="new-project-name">
            <Input
              id="new-project-name"
              autoFocus
              required
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g., Space Explorer RPG"
            />
          </Field>
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {(['Software', 'Game', 'Web'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewProjectType(type)}
                  className={cn(
                    'py-2 px-3 rounded-lg text-sm font-medium border transition-all',
                    newProjectType === type
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-surface-raised border-border-strong text-muted hover:bg-surface-hover'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Short Description" htmlFor="new-project-desc">
            <Textarea
              id="new-project-desc"
              value={newProjectDescription}
              onChange={(e) => setNewProjectDescription(e.target.value)}
              placeholder="A short summary shown on the dashboard."
              rows={3}
              maxLength={200}
            />
          </Field>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={isEditModalOpen}
        onClose={closeEditModal}
        title="Edit project"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={closeEditModal}>Cancel</Button>
            <Button variant="primary" type="submit" form="edit-project-form">Save</Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={handleEditSubmit} className="space-y-4">
          <Field label="Project Name" htmlFor="edit-project-name">
            <Input
              id="edit-project-name"
              autoFocus
              required
              value={editProjectName}
              onChange={(e) => setEditProjectName(e.target.value)}
            />
          </Field>
          <Field label="Short Description" htmlFor="edit-project-desc">
            <Textarea
              id="edit-project-desc"
              value={editProjectDescription}
              onChange={(e) => setEditProjectDescription(e.target.value)}
              rows={3}
              maxLength={200}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
};

/** Small icon-only action button used in the project card footer. */
const IconAction: React.FC<{
  title: string;
  hoverClass: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}> = ({ title, hoverClass, onClick, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={cn('p-2 rounded-lg text-muted hover:bg-surface-hover transition-colors', hoverClass)}
  >
    {children}
  </button>
);

export default Dashboard;
