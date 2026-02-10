import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Network, ArrowLeft, Plus, Folder, File, CheckSquare, Bug as BugIcon, Trash2, HardDrive } from 'lucide-react';
import Dashboard from './components/Dashboard';
import FlowchartEditor from './components/FlowchartEditor';
import DocEditor from './components/DocEditor';
import TodoEditor from './components/TodoEditor';
import KanbanBoard from './components/KanbanBoard';
import { Project, ViewState, ProjectFile, FileType, EditorProps } from './types';

// --- UTILS ---

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const scaleSize = MAX_WIDTH / img.width;
        
        if (scaleSize < 1) {
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
        } else {
            canvas.width = img.width;
            canvas.height = img.height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
        }
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

// --- PLUGIN REGISTRY SYSTEM ---

interface EditorPlugin {
  type: FileType;
  label: string;
  pluralLabel: string;
  icon: React.ElementType;
  component: React.FC<EditorProps>;
  createDefaultContent: (name: string) => any;
}

const EDITOR_PLUGINS: EditorPlugin[] = [
  {
    type: 'doc',
    label: 'Document',
    pluralLabel: 'Documents',
    icon: FileText,
    component: DocEditor,
    createDefaultContent: (name) => `# ${name}\n\nCreated on ${new Date().toLocaleDateString()}`
  },
  {
    type: 'flowchart',
    label: 'Flowchart',
    pluralLabel: 'Flowcharts',
    icon: Network,
    component: FlowchartEditor as React.FC<EditorProps>, 
    createDefaultContent: () => ({ nodes: [], edges: [] })
  },
  {
    type: 'todo',
    label: 'Task List',
    pluralLabel: 'Task Lists',
    icon: CheckSquare,
    component: TodoEditor as React.FC<EditorProps>,
    createDefaultContent: () => ({ items: [] })
  },
  {
    type: 'kanban',
    label: 'Bug Tracker',
    pluralLabel: 'Bug Trackers',
    icon: BugIcon,
    component: KanbanBoard as React.FC<EditorProps>,
    createDefaultContent: () => ({ tasks: [] })
  }
];

// --- MOCK DATA ---

const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Cosmic Invaders',
    type: 'Game',
    description: 'A retro-style space shooter with RPG elements.',
    lastModified: Date.now(),
    files: [
      {
        id: 'f1',
        name: 'Game Design Document',
        type: 'doc',
        content: '# Cosmic Invaders\n\n## 1. Introduction\nA fast-paced shooter set in the Andromeda galaxy.\n\n## 2. Core Mechanics\n- Ship customization\n- Loot drops\n- Boss battles'
      }
    ],
    assets: {}
  },
];

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLocalMode) {
        try {
            const saved = localStorage.getItem('devarchitect_projects');
            if (saved) {
                const parsed = JSON.parse(saved);
                setProjects(parsed);
            } else {
                setProjects(MOCK_PROJECTS);
            }
        } catch (e) {
            console.error("Failed to load projects", e);
            setProjects(MOCK_PROJECTS);
        } finally {
            setIsLoaded(true);
        }
    }
  }, [isLocalMode]);

  useEffect(() => {
    if (!isLocalMode && isLoaded) {
      localStorage.setItem('devarchitect_projects', JSON.stringify(projects));
    }
  }, [projects, isLocalMode, isLoaded]);

  // --- FILE SYSTEM API HANDLERS ---

  const saveProjectToDisk = async (project: Project) => {
    if (!directoryHandle) return;
    try {
        const fileName = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${project.id}.json`;
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(project, null, 2));
        await writable.close();
    } catch (err) {
        console.error("Failed to save to disk:", err);
    }
  };

  const deleteProjectFromDisk = async (project: Project) => {
      if (!directoryHandle) return;
      try {
          const fileName = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${project.id}.json`;
          await directoryHandle.removeEntry(fileName);
      } catch (err) {
          console.error("Failed to delete from disk:", err);
      }
  };

  const handleOpenWorkspace = async () => {
      // @ts-ignore
      if (typeof window.showDirectoryPicker !== 'function') {
        alert("Browser not supported. Please use Chrome/Edge on desktop.");
        return;
      }

      try {
          // @ts-ignore
          const dirHandle = await window.showDirectoryPicker();
          setDirectoryHandle(dirHandle);
          setIsLocalMode(true);
          
          const loadedProjects: Project[] = [];
          
          // @ts-ignore
          for await (const entry of dirHandle.values()) {
              if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                  const file = await entry.getFile();
                  const text = await file.text();
                  try {
                      const json = JSON.parse(text);
                      if (json.id && json.name && json.files) {
                          // Ensure assets object exists for legacy files
                          if (!json.assets) json.assets = {};
                          loadedProjects.push(json);
                      }
                  } catch (e) {
                      console.warn(`Skipping invalid JSON file: ${entry.name}`);
                  }
              }
          }
          
          setProjects(loadedProjects);
      } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.error("Error opening workspace:", err);
          alert("Failed to access local folder.");
      }
  };

  // --- ACTIONS ---

  const handleCreateProject = async (name: string, type: Project['type']) => {
    const defaultDocPlugin = EDITOR_PLUGINS.find(p => p.type === 'doc');
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      type,
      description: '',
      lastModified: Date.now(),
      files: [
        {
          id: crypto.randomUUID(),
          name: 'Readme',
          type: 'doc',
          content: defaultDocPlugin ? defaultDocPlugin.createDefaultContent(name) : ''
        }
      ],
      assets: {} // Initialize assets
    };
    
    setProjects(prev => [newProject, ...prev]);
    
    if (isLocalMode) {
        await saveProjectToDisk(newProject);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm("Are you sure you want to delete this project? This cannot be undone.")) {
      const projectToDelete = projects.find(p => p.id === id);
      if (projectToDelete && isLocalMode) {
          await deleteProjectFromDisk(projectToDelete);
      }
      
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setCurrentView(ViewState.DASHBOARD);
      }
    }
  };

  const handleExportProject = (project: Project) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${project.name.replace(/\s+/g, '_')}_data.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const updateProjectState = (updatedProject: Project) => {
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      if (isLocalMode) {
          saveProjectToDisk(updatedProject);
      }
  };

  // --- ASSET HANDLING ---

  const handleAddAsset = async (file: File): Promise<string> => {
    if (!activeProjectId) throw new Error("No active project");
    
    // 1. Compress
    const base64 = await compressImage(file);
    
    // 2. Generate ID
    const assetId = crypto.randomUUID();
    
    // 3. Update Project State
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
        const updatedProject = {
            ...project,
            lastModified: Date.now(),
            assets: {
                ...(project.assets || {}),
                [assetId]: base64
            }
        };
        updateProjectState(updatedProject);
        return `asset://${assetId}`;
    }
    throw new Error("Project not found");
  };

  // --- FILE ACTIONS ---

  const handleCreateFile = (type: FileType) => {
    if (!activeProjectId) return;
    const plugin = EDITOR_PLUGINS.find(p => p.type === type);
    if (!plugin) return;
    const name = prompt(`Enter name for new ${plugin.label}:`);
    if (!name) return;
    const newFile: ProjectFile = {
      id: crypto.randomUUID(), name, type,
      content: plugin.createDefaultContent(name)
    };
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
        const updatedProject = {
            ...project, lastModified: Date.now(),
            files: [...project.files, newFile]
        };
        updateProjectState(updatedProject);
        setActiveFileId(newFile.id);
    }
  };

  const handleDeleteFile = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (!activeProjectId) return;
    if (confirm("Are you sure you want to delete this file?")) {
        const project = projects.find(p => p.id === activeProjectId);
        if (project) {
            const updatedProject = {
                ...project,
                files: project.files.filter(f => f.id !== fileId)
            };
            updateProjectState(updatedProject);
            if (activeFileId === fileId) setActiveFileId(null);
        }
    }
  };

  const updateFileContent = (content: any) => {
    if (!activeProjectId || !activeFileId) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
        const updatedProject = {
            ...project, lastModified: Date.now(),
            files: project.files.map(f => f.id === activeFileId ? { ...f, content } : f)
        };
        updateProjectState(updatedProject);
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeFile = activeProject?.files.find(f => f.id === activeFileId);

  // --- RENDER HELPERS ---

  const renderSidebar = () => {
    if (currentView === ViewState.DASHBOARD || !activeProject) {
      return (
        <aside className="w-16 md:w-20 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-6 gap-6 z-20">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 mb-4">
            <Folder className="w-6 h-6 text-white" />
          </div>
          <nav className="flex-1 flex flex-col gap-4 w-full px-2">
            <button className="p-3 rounded-xl bg-zinc-800 text-white shadow-md flex justify-center" title="Dashboard">
              <LayoutDashboard className="w-5 h-5" />
            </button>
          </nav>
        </aside>
      );
    }

    return (
      <aside className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 shrink-0">
          <button 
             onClick={() => { setActiveProjectId(null); setCurrentView(ViewState.DASHBOARD); }}
             className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
           >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          <div className="mb-6">
             <div className="flex items-center gap-2 mb-1">
                 <h2 className="text-zinc-100 font-semibold truncate" title={activeProject.name}>{activeProject.name}</h2>
                 {isLocalMode && <HardDrive className="w-3 h-3 text-emerald-500 shrink-0" title="Saved to disk" />}
             </div>
             <p className="text-xs text-zinc-500 uppercase tracking-wider">{activeProject.type} Project</p>
          </div>
          <div className="space-y-6">
            {EDITOR_PLUGINS.map(plugin => {
                const PluginIcon = plugin.icon;
                const files = activeProject.files.filter(f => f.type === plugin.type);
                return (
                    <div key={plugin.type}>
                        <div className="flex items-center justify-between mb-2 px-2">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{plugin.pluralLabel}</span>
                            <button onClick={() => handleCreateFile(plugin.type)} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="space-y-1">
                            {files.map(file => (
                                <div key={file.id} className="group flex items-center gap-1 rounded-lg hover:bg-zinc-900 pr-1 transition-colors">
                                    <button
                                        onClick={() => setActiveFileId(file.id)}
                                        className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                                            activeFileId === file.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                                        }`}
                                    >
                                        <PluginIcon className="w-4 h-4 shrink-0" />
                                        <span className="truncate">{file.name}</span>
                                    </button>
                                    <button 
                                        onClick={(e) => handleDeleteFile(e, file.id)}
                                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            {files.length === 0 && <p className="text-xs text-zinc-600 px-3 italic">No {plugin.pluralLabel.toLowerCase()}</p>}
                        </div>
                    </div>
                );
            })}
          </div>
        </div>
      </aside>
    );
  };

  const renderContent = () => {
    if (currentView === ViewState.DASHBOARD) {
      return (
        <Dashboard
          projects={projects}
          onSelectProject={(id) => {
            setActiveProjectId(id);
            const project = projects.find(p => p.id === id);
            if (project && project.files.length > 0) setActiveFileId(project.files[0].id);
            else setActiveFileId(null);
            setCurrentView(ViewState.PROJECT);
          }}
          onCreateProject={handleCreateProject}
          onExportProject={handleExportProject}
          onDeleteProject={handleDeleteProject}
          onOpenWorkspace={handleOpenWorkspace}
          isLocalMode={isLocalMode}
        />
      );
    }

    if (!activeProject) return <div>Project not found</div>;
    if (!activeFile) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500">
          <File className="w-16 h-16 mb-4 opacity-20" />
          <p>Select a file to edit or create a new one.</p>
        </div>
      );
    }

    const plugin = EDITOR_PLUGINS.find(p => p.type === activeFile.type);
    if (plugin) {
        const EditorComponent = plugin.component;
        return (
            <EditorComponent
                key={activeFile.id}
                fileName={activeFile.name}
                initialContent={activeFile.content}
                onSave={updateFileContent}
                // NEW: Pass asset props down
                assets={activeProject.assets || {}}
                onAddAsset={handleAddAsset}
            />
        );
    }
    return <div className="text-red-400">Unknown file type: {activeFile.type}</div>;
  };

  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans overflow-hidden">
      {renderSidebar()}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        <div className="flex-1 overflow-hidden relative">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;