import React, { useState } from 'react';
import { Project } from '../types';
import { Plus, Code, Gamepad2, Globe, Clock, FileCode, Download, Trash2, HardDrive, Import, Pencil, BookOpen, Settings as SettingsIcon, Search } from 'lucide-react';
import { Button, Card, Modal, Input, Textarea, Field, Select, cn } from './ui';
import { useSettingsStore } from '../stores/useSettingsStore';

type SortKey = 'recent' | 'name' | 'files';

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
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-content tracking-tight">Projects</h1>
          <p className="text-muted mt-2">Manage your development plans, specs, and architectures.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
            <Button variant="secondary" size="icon" onClick={openSettings} title="Settings" aria-label="Settings">
              <SettingsIcon className="w-4 h-4" />
            </Button>
            <Button variant="secondary" icon={BookOpen} onClick={onOpenWhatsNew}>
              What's New
            </Button>
            <Button variant="secondary" icon={Import} onClick={onImportFolder}>
              Import Local Folder
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
              New Project
            </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border-strong rounded-2xl bg-surface/40">
          <FileCode className="w-16 h-16 text-faint mx-auto mb-4" />
          <h3 className="text-xl font-medium text-content">No projects yet</h3>
          <p className="text-muted mt-2 max-w-sm mx-auto">Start planning by creating a new project or importing an existing folder.</p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
              New Project
            </Button>
            <Button variant="secondary" icon={Import} onClick={onImportFolder}>
              Import Local Folder
            </Button>
          </div>
        </div>
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
          <span className="text-xs text-faint ml-auto">{visibleProjects.length} of {projects.length}</span>
        </div>
        {visibleProjects.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-2xl bg-surface/40">
            <Search className="w-10 h-10 text-faint mx-auto mb-3" />
            <p className="text-muted">No projects match “{query}”.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleProjects.map((project) => (
            <Card key={project.id} className="group relative p-6 overflow-hidden flex flex-col">
              {/* Main Clickable Area */}
              <div
                className="cursor-pointer flex-1 relative z-10"
                onClick={() => onSelectProject(project.id)}
              >
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-surface-raised rounded-lg inline-block border border-border group-hover:border-accent/50 transition-colors">
                      {getTypeIcon(project.type)}
                    </div>

                    {/* Local Indicator */}
                    {project.isLocal && (
                        <div className="flex items-center gap-1 bg-accent/10 border border-accent/20 px-2 py-1 rounded text-[10px] text-accent font-bold uppercase tracking-wider">
                            <HardDrive className="w-3 h-3" />
                            Local
                        </div>
                    )}
                </div>

                <h3 className="text-xl font-semibold text-content mb-2 group-hover:text-accent transition-colors">{project.name}</h3>
                <p className="text-muted text-sm line-clamp-2 mb-4 h-10">{project.description || "No description yet."}</p>
                <div className="text-xs text-faint mb-4">
                  {project.files.length} files
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-border mt-auto relative z-20">
                 <div className="flex items-center text-xs text-faint">
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    {new Date(project.lastModified).toLocaleDateString()}
                 </div>
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
        title="Create New Project"
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
        title="Edit Project"
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
