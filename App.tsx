import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Network, ArrowLeft, Plus, Folder, File, CheckSquare, Bug as BugIcon, Trash2, HardDrive, Download, Upload } from 'lucide-react';
import JSZip from 'jszip'; // NEW: Import JSZip
import Dashboard from './components/Dashboard';
import FlowchartEditor from './components/FlowchartEditor';
import DocEditor from './components/DocEditor';
import TodoEditor from './components/TodoEditor';
import KanbanBoard from './components/KanbanBoard';
import { Project, ViewState, ProjectFile, FileType, EditorProps } from './types';

// --- UTILS ---

// Convert Base64 to Blob (for File System API)
const base64ToBlob = (base64: string): Blob => {
  try {
      const arr = base64.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
  } catch (e) {
      console.error("Failed to convert base64 to blob", e);
      return new Blob([]);
  }
};

// IndexedDB Wrapper (For Web Mode persistence)
const IDB = {
    DB_NAME: 'devarchitect_db',
    STORE: 'projects',
    init: function() {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = (e: any) => {
                e.target.result.createObjectStore(this.STORE, { keyPath: 'id' });
            };
            req.onsuccess = () => resolve();
        });
    },
    save: function(project: Project) {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE], 'readwrite');
                tx.objectStore(this.STORE).put(project);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
        });
    },
    loadAll: function() {
        return new Promise<Project[]>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE], 'readonly');
                const store = tx.objectStore(this.STORE);
                const allReq = store.getAll();
                allReq.onsuccess = () => resolve(allReq.result);
                allReq.onerror = () => reject(allReq.error);
            };
            req.onerror = () => resolve([]); 
        });
    },
    delete: function(id: string) {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE], 'readwrite');
                tx.objectStore(this.STORE).delete(id);
                tx.oncomplete = () => resolve();
            };
        });
    }
};

const EDITOR_PLUGINS = [
  { type: 'doc', label: 'Document', pluralLabel: 'Documents', icon: FileText, component: DocEditor, createDefaultContent: (name: string) => `# ${name}\n\nCreated on ${new Date().toLocaleDateString()}` },
  { type: 'flowchart', label: 'Flowchart', pluralLabel: 'Flowcharts', icon: Network, component: FlowchartEditor as React.FC<EditorProps>, createDefaultContent: () => ({ nodes: [], edges: [] }) },
  { type: 'todo', label: 'Task List', pluralLabel: 'Task Lists', icon: CheckSquare, component: TodoEditor as React.FC<EditorProps>, createDefaultContent: () => ({ items: [] }) },
  { type: 'kanban', label: 'Bug Tracker', pluralLabel: 'Bug Trackers', icon: BugIcon, component: KanbanBoard as React.FC<EditorProps>, createDefaultContent: () => ({ tasks: [] }) }
];

const MOCK_PROJECTS: Project[] = [{
    id: '1', name: 'Cosmic Invaders', type: 'Game', description: 'A retro-style space shooter.', lastModified: Date.now(),
    files: [{ id: 'f1', name: 'Game Design Document', type: 'doc', content: '# Cosmic Invaders' }], assets: {}
}];

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Initial Load
  useEffect(() => {
    if (!isLocalMode) {
        IDB.init().then(() => {
            return IDB.loadAll();
        }).then(loaded => {
            setProjects(loaded.length > 0 ? loaded : MOCK_PROJECTS);
        }).catch(e => {
            console.error("IDB Error:", e);
            setProjects(MOCK_PROJECTS);
        }).finally(() => {
            setIsLoaded(true);
        });
    }
  }, [isLocalMode]);

  // Auto-save (Web Mode)
  useEffect(() => {
    if (!isLocalMode && isLoaded && projects.length > 0) {
        projects.forEach(p => IDB.save(p));
    }
  }, [projects, isLocalMode, isLoaded]);

  // --- LOCAL MODE (DISK) ---

  const saveProjectToDisk = async (project: Project) => {
    if (!directoryHandle) return;
    try {
        const folderName = `${project.name.replace(/[^a-z0-9]/gi, '_')}_${project.id}`;
        const projectDir = await directoryHandle.getDirectoryHandle(folderName, { create: true });

        // Save lean JSON (no assets inside JSON)
        const leanProject = { ...project, assets: {} }; 
        
        const fileHandle = await projectDir.getFileHandle('project.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(leanProject, null, 2));
        await writable.close();

        // Save Assets
        if (project.assets && Object.keys(project.assets).length > 0) {
            const assetsDir = await projectDir.getDirectoryHandle('assets', { create: true });
            
            for (const [id, base64] of Object.entries(project.assets)) {
                const ext = base64.startsWith('data:image/png') ? 'png' : 'jpg';
                const filename = `${id}.${ext}`;
                const assetFile = await assetsDir.getFileHandle(filename, { create: true });
                const assetWriter = await assetFile.createWritable();
                await assetWriter.write(base64ToBlob(base64));
                await assetWriter.close();
            }
        }
    } catch (err) {
        console.error("Failed to save to disk:", err);
    }
  };

  const deleteProjectFromDisk = async (project: Project) => {
      if (!directoryHandle) return;
      try {
          const folderName = `${project.name.replace(/[^a-z0-9]/gi, '_')}_${project.id}`;
          await directoryHandle.removeEntry(folderName, { recursive: true });
      } catch (err) {
          console.error("Failed to delete from disk:", err);
      }
  };

  const handleOpenWorkspace = async () => {
      // @ts-ignore
      if (typeof window.showDirectoryPicker !== 'function') {
        alert("Browser not supported. Please use Chrome, Edge, or Opera on desktop.");
        return;
      }

      try {
          // @ts-ignore
          const rootHandle = await window.showDirectoryPicker();
          setDirectoryHandle(rootHandle);
          setIsLocalMode(true);
          
          const loadedProjects: Project[] = [];
          
          // @ts-ignore
          for await (const entry of rootHandle.values()) {
              if (entry.kind === 'directory') {
                  try {
                      const projectDir = await rootHandle.getDirectoryHandle(entry.name);
                      const jsonHandle = await projectDir.getFileHandle('project.json');
                      const jsonFile = await jsonHandle.getFile();
                      const jsonText = await jsonFile.text();
                      const projectData = JSON.parse(jsonText);

                      // Load Assets
                      const assetsMap: Record<string, string> = {};
                      try {
                        const assetsDir = await projectDir.getDirectoryHandle('assets');
                        // @ts-ignore
                        for await (const assetEntry of assetsDir.values()) {
                            if (assetEntry.kind === 'file') {
                                const assetFile = await assetEntry.getFile();
                                const reader = new FileReader();
                                const base64 = await new Promise<string>((resolve) => {
                                    reader.onload = (e) => resolve(e.target?.result as string);
                                    reader.readAsDataURL(assetFile);
                                });
                                const id = assetEntry.name.split('.')[0];
                                assetsMap[id] = base64;
                            }
                        }
                      } catch (e) {}

                      projectData.assets = assetsMap;
                      loadedProjects.push(projectData);
                  } catch (e) {}
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
      name, type, description: '', lastModified: Date.now(),
      files: [{ id: crypto.randomUUID(), name: 'Readme', type: 'doc', content: defaultDocPlugin ? defaultDocPlugin.createDefaultContent(name) : '' }],
      assets: {}
    };
    
    setProjects(prev => [newProject, ...prev]);
    if (isLocalMode) await saveProjectToDisk(newProject);
    else IDB.save(newProject);
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm("Delete project?")) {
      const projectToDelete = projects.find(p => p.id === id);
      if (projectToDelete) {
          if (isLocalMode) await deleteProjectFromDisk(projectToDelete);
          else await IDB.delete(id);
      }
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) { setActiveProjectId(null); setCurrentView(ViewState.DASHBOARD); }
    }
  };

  // --- ZIP EXPORT ---
  const handleExportProject = async (project: Project) => {
    const zip = new JSZip();
    
    // 1. Add project.json (Clean, no asset data strings)
    const leanProject = { ...project, assets: {} }; 
    zip.file("project.json", JSON.stringify(leanProject, null, 2));

    // 2. Add Assets folder
    const assetsFolder = zip.folder("assets");
    if (project.assets && assetsFolder) {
        Object.entries(project.assets).forEach(([id, base64]) => {
            // Remove data URL prefix (data:image/png;base64,)
            const data = base64.split(',')[1]; 
            // Detect extension from header
            const ext = base64.substring(base64.indexOf('/') + 1, base64.indexOf(';'));
            assetsFolder.file(`${id}.${ext}`, data, {base64: true});
        });
    }

    // 3. Generate & Download
    const content = await zip.generateAsync({type:"blob"});
    const url = window.URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.zip`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const updateProjectState = (updatedProject: Project) => {
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      if (isLocalMode) saveProjectToDisk(updatedProject);
      else IDB.save(updatedProject);
  };

  const handleAddAsset = async (file: File): Promise<string> => {
    if (!activeProjectId) throw new Error("No active project");
    const reader = new FileReader();
    return new Promise((resolve) => {
        reader.onload = async (e) => {
            const base64 = e.target?.result as string;
            const assetId = crypto.randomUUID();
            const project = projects.find(p => p.id === activeProjectId);
            if (project) {
                const updatedProject = {
                    ...project,
                    lastModified: Date.now(),
                    assets: { ...(project.assets || {}), [assetId]: base64 }
                };
                updateProjectState(updatedProject);
                resolve(`asset://${assetId}`);
            }
        };
        reader.readAsDataURL(file);
    });
  };

  // File Operations
  const handleCreateFile = (type: FileType) => {
    if (!activeProjectId) return;
    const plugin = EDITOR_PLUGINS.find(p => p.type === type);
    if (!plugin) return;
    const name = prompt(`Enter name for new ${plugin.label}:`);
    if (!name) return;
    const newFile: ProjectFile = { id: crypto.randomUUID(), name, type, content: plugin.createDefaultContent(name) };
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
        updateProjectState({ ...project, lastModified: Date.now(), files: [...project.files, newFile] });
        setActiveFileId(newFile.id);
    }
  };

  const handleDeleteFile = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (!activeProjectId) return;
    if (confirm("Delete file?")) {
        const project = projects.find(p => p.id === activeProjectId);
        if (project) {
            updateProjectState({ ...project, files: project.files.filter(f => f.id !== fileId) });
            if (activeFileId === fileId) setActiveFileId(null);
        }
    }
  };

  const updateFileContent = (content: any) => {
    if (!activeProjectId || !activeFileId) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
        updateProjectState({
            ...project, lastModified: Date.now(),
            files: project.files.map(f => f.id === activeFileId ? { ...f, content } : f)
        });
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeFile = activeProject?.files.find(f => f.id === activeFileId);

  const renderSidebar = () => {
    if (currentView === ViewState.DASHBOARD || !activeProject) {
      return (
        <aside className="w-16 md:w-20 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-6 gap-6 z-20">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 mb-4"><Folder className="w-6 h-6 text-white" /></div>
          <button className="p-3 rounded-xl bg-zinc-800 text-white shadow-md" title="Dashboard"><LayoutDashboard className="w-5 h-5" /></button>
        </aside>
      );
    }
    return (
      <aside className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 shrink-0">
          <button onClick={() => { setActiveProjectId(null); setCurrentView(ViewState.DASHBOARD); }} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm font-medium"><ArrowLeft className="w-4 h-4" /> Back to Dashboard</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          <div className="mb-6">
             <div className="flex items-center gap-2 mb-1"><h2 className="text-zinc-100 font-semibold truncate">{activeProject.name}</h2>{isLocalMode && <HardDrive className="w-3 h-3 text-emerald-500" />}</div>
             <p className="text-xs text-zinc-500 uppercase tracking-wider">{activeProject.type} Project</p>
          </div>
          <div className="space-y-6">{EDITOR_PLUGINS.map(plugin => {
                const PluginIcon = plugin.icon;
                const files = activeProject.files.filter(f => f.type === plugin.type);
                return (
                    <div key={plugin.type}>
                        <div className="flex items-center justify-between mb-2 px-2"><span className="text-xs font-semibold text-zinc-500 uppercase">{plugin.pluralLabel}</span><button onClick={() => handleCreateFile(plugin.type)} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800"><Plus className="w-3.5 h-3.5" /></button></div>
                        <div className="space-y-1">{files.map(file => (
                                <div key={file.id} className="group flex items-center gap-1 rounded-lg hover:bg-zinc-900 pr-1 transition-colors">
                                    <button onClick={() => setActiveFileId(file.id)} className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left ${activeFileId === file.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}><PluginIcon className="w-4 h-4 shrink-0" /><span className="truncate">{file.name}</span></button>
                                    <button onClick={(e) => handleDeleteFile(e, file.id)} className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}{files.length === 0 && <p className="text-xs text-zinc-600 px-3 italic">No {plugin.pluralLabel.toLowerCase()}</p>}
                        </div>
                    </div>
                );
            })}</div>
        </div>
      </aside>
    );
  };

  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans overflow-hidden">
      {renderSidebar()}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        <div className="flex-1 overflow-hidden relative">
          {currentView === ViewState.DASHBOARD ? (
            <Dashboard
              projects={projects}
              onSelectProject={(id) => { setActiveProjectId(id); const p = projects.find(x => x.id === id); setActiveFileId(p?.files[0]?.id || null); setCurrentView(ViewState.PROJECT); }}
              onCreateProject={handleCreateProject}
              onExportProject={handleExportProject} 
              onDeleteProject={handleDeleteProject}
              onOpenWorkspace={handleOpenWorkspace}
              isLocalMode={isLocalMode}
            />
          ) : (
            activeProject && activeFile ? (
                React.createElement(EDITOR_PLUGINS.find(p => p.type === activeFile.type)!.component, {
                    key: activeFile.id,
                    fileName: activeFile.name,
                    initialContent: activeFile.content,
                    onSave: updateFileContent,
                    assets: activeProject.assets || {},
                    onAddAsset: handleAddAsset
                })
            ) : <div className="flex flex-col items-center justify-center h-full text-zinc-500"><File className="w-16 h-16 mb-4 opacity-20" /><p>Select a file to edit</p></div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;