
import React, { useState } from 'react';
import { Project } from '../types';
import { Plus, Code, Gamepad2, Globe, Clock, ChevronRight, FileCode, Download, Trash2, FolderOpen, HardDrive } from 'lucide-react';

interface DashboardProps {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, type: Project['type']) => void;
  onExportProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onOpenWorkspace: () => void;
  isLocalMode: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ 
    projects, 
    onSelectProject, 
    onCreateProject, 
    onExportProject, 
    onDeleteProject,
    onOpenWorkspace,
    isLocalMode
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<Project['type']>('Software');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      onCreateProject(newProjectName, newProjectType);
      setIsModalOpen(false);
      setNewProjectName('');
    }
  };

  const getTypeIcon = (type: Project['type']) => {
    switch (type) {
      case 'Game': return <Gamepad2 className="w-6 h-6 text-purple-400" />;
      case 'Web': return <Globe className="w-6 h-6 text-blue-400" />;
      default: return <Code className="w-6 h-6 text-emerald-400" />;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
             Projects
             {isLocalMode && (
                 <span className="px-3 py-1 bg-emerald-900/30 text-emerald-400 border border-emerald-900 rounded-full text-xs font-medium flex items-center gap-1.5">
                     <HardDrive className="w-3 h-3" />
                     Local Mode Active
                 </span>
             )}
          </h1>
          <p className="text-zinc-400 mt-2">Manage your development plans, specs, and architectures.</p>
        </div>
        
        <div className="flex gap-3">
            {!isLocalMode && (
                <button
                onClick={onOpenWorkspace}
                className="flex items-center gap-2 bg-zinc-800 text-zinc-200 px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-700 transition-colors border border-zinc-700"
                >
                <FolderOpen className="w-5 h-5" />
                Open Local Workspace
                </button>
            )}
            
            <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-white text-zinc-950 px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5"
            >
            <Plus className="w-5 h-5" />
            New Project
            </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
          <FileCode className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-zinc-300">No projects yet</h3>
          <p className="text-zinc-500 mt-2 max-w-sm mx-auto">Start planning your next big idea by creating a new project above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 transition-all hover:shadow-xl hover:shadow-black/50 overflow-hidden flex flex-col"
            >
              {/* Main Clickable Area */}
              <div 
                className="cursor-pointer flex-1 relative z-10"
                onClick={() => onSelectProject(project.id)}
              >
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-zinc-950 rounded-lg inline-block border border-zinc-800 group-hover:border-zinc-700 transition-colors">
                      {getTypeIcon(project.type)}
                    </div>
                </div>
                
                <h3 className="text-xl font-semibold text-zinc-100 mb-2 group-hover:text-blue-400 transition-colors">{project.name}</h3>
                <p className="text-zinc-400 text-sm line-clamp-2 mb-4 h-10">{project.description || "No description yet."}</p>
                <div className="text-xs text-zinc-500 mb-4">
                  {project.files.length} files
                </div>
              </div>
              
              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-zinc-800 mt-auto relative z-20">
                 <div className="flex items-center text-xs text-zinc-500">
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    {new Date(project.lastModified).toLocaleDateString()}
                 </div>
                 <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isLocalMode && (
                        <button 
                        onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            onExportProject(project); 
                        }}
                        className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors"
                        title="Export JSON"
                        >
                        <Download className="w-4 h-4" />
                        </button>
                    )}
                    <button 
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        onDeleteProject(project.id); 
                      }}
                      className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
                      title="Delete Project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Create New Project</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Project Name</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                  placeholder="e.g., Space Explorer RPG"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Software', 'Game', 'Web'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewProjectType(type)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                        newProjectType === type
                          ? 'bg-blue-600/10 border-blue-600 text-blue-400'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-8 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
