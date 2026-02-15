import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Network, ArrowLeft, Plus, Folder, File, CheckSquare, Bug as BugIcon, Trash2, HardDrive, Download, Upload, Map as MapIcon, Table, PenTool, Image as ImageIcon, HelpCircle } from 'lucide-react';
import JSZip from 'jszip';
import Dashboard from './components/Dashboard';
import FlowchartEditor from './components/FlowchartEditor';
import DocEditor from './components/DocEditor';
import TodoEditor from './components/TodoEditor';
import KanbanBoard from './components/KanbanBoard';
import RoadmapEditor from './components/RoadmapEditor';
import DataGridEditor from './components/DataGridEditor';
import WhiteboardEditor from './components/WhiteboardEditor';
import AssetBrowser from './components/AssetBrowser';
import CommandPalette from './components/CommandPalette';
import HelpModal from './components/HelpModal';
import { Project, ViewState, ProjectFile, FileType, EditorProps } from './types';

// --- UTILS ---

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

// IndexedDB Wrapper
const IDB = {
    DB_NAME: 'devarchitect_db',
    STORE_PROJECTS: 'projects',
    STORE_HANDLES: 'handles',
    init: function() {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 2);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = (e: any) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_PROJECTS)) {
                    db.createObjectStore(this.STORE_PROJECTS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.STORE_HANDLES)) {
                    db.createObjectStore(this.STORE_HANDLES); 
                }
            };
            req.onsuccess = () => resolve();
        });
    },
    saveProject: function(project: Project) {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 2);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE_PROJECTS], 'readwrite');
                tx.objectStore(this.STORE_PROJECTS).put(project);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
        });
    },
    saveHandle: function(id: string, handle: any) {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 2);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE_HANDLES], 'readwrite');
                tx.objectStore(this.STORE_HANDLES).put(handle, id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
        });
    },
    loadAllProjects: function() {
        return new Promise<Project[]>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 2);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE_PROJECTS], 'readonly');
                const reqAll = tx.objectStore(this.STORE_PROJECTS).getAll();
                reqAll.onsuccess = () => resolve(reqAll.result);
                reqAll.onerror = () => reject(reqAll.error);
            };
            req.onerror = () => resolve([]); 
        });
    },
    loadHandle: function(id: string) {
        return new Promise<any>((resolve, reject) => {
             const req = indexedDB.open(this.DB_NAME, 2);
             req.onsuccess = (e: any) => {
                 const tx = e.target.result.transaction([this.STORE_HANDLES], 'readonly');
                 const reqGet = tx.objectStore(this.STORE_HANDLES).get(id);
                 reqGet.onsuccess = () => resolve(reqGet.result);
                 reqGet.onerror = () => resolve(null);
             };
             req.onerror = () => resolve(null);
        });
    },
    delete: function(id: string) {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 2);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE_PROJECTS, this.STORE_HANDLES], 'readwrite');
                tx.objectStore(this.STORE_PROJECTS).delete(id);
                tx.objectStore(this.STORE_HANDLES).delete(id);
                tx.oncomplete = () => resolve();
            };
        });
    }
};

const EDITOR_PLUGINS = [
  { type: 'doc', label: 'Document', pluralLabel: 'Documents', icon: FileText, component: DocEditor, createDefaultContent: (name: string) => `# ${name}\n\nCreated on ${new Date().toLocaleDateString()}` },
  { type: 'flowchart', label: 'Flowchart', pluralLabel: 'Flowcharts', icon: Network, component: FlowchartEditor as React.FC<EditorProps>, createDefaultContent: () => ({ nodes: [], edges: [] }) },
  { type: 'todo', label: 'Task List', pluralLabel: 'Task Lists', icon: CheckSquare, component: TodoEditor as React.FC<EditorProps>, createDefaultContent: () => ({ items: [] }) },
  { type: 'kanban', label: 'Bug Tracker', pluralLabel: 'Bug Trackers', icon: BugIcon, component: KanbanBoard as React.FC<EditorProps>, createDefaultContent: () => ({ tasks: [] }) },
  { type: 'roadmap', label: 'Roadmap', pluralLabel: 'Roadmaps', icon: MapIcon, component: RoadmapEditor as React.FC<EditorProps>, createDefaultContent: () => ({ items: [] }) },
  { type: 'grid', label: 'Data Grid', pluralLabel: 'Data Grids', icon: Table, component: DataGridEditor as React.FC<EditorProps>, createDefaultContent: () => ({ columns: [], rows: [] }) },
  { type: 'whiteboard', label: 'Whiteboard', pluralLabel: 'Whiteboards', icon: PenTool, component: WhiteboardEditor as React.FC<EditorProps>, createDefaultContent: () => '' },
  { type: 'asset-gallery', label: 'Asset Library', pluralLabel: 'Asset Libraries', icon: ImageIcon, component: AssetBrowser as React.FC<EditorProps>, createDefaultContent: () => ({}) }
];

const MOCK_PROJECTS: Project[] = [{
    id: '1', name: 'Cosmic Invaders', type: 'Game', description: 'A retro-style space shooter.', lastModified: Date.now(),
    files: [{ id: 'f1', name: 'Game Design Document', type: 'doc', content: '# Cosmic Invaders' }], assets: {}
}];

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const isSavingRef = React.useRef(false);
  const saveQueueRef = React.useRef<Project | null>(null);
  const projectHandlesRef = React.useRef<Map<string, any>>(new Map());

  useEffect(() => {
    const load = async () => {
        try {
            await IDB.init();
            const loaded = await IDB.loadAllProjects();
            for (const p of loaded) {
                if (p.isLocal) {
                    const handle = await IDB.loadHandle(p.id);
                    if (handle) projectHandlesRef.current.set(p.id, handle);
                }
            }
            setProjects(loaded.length > 0 ? loaded : MOCK_PROJECTS);
        } catch (e) {
            console.error("Init error", e);
            setProjects(MOCK_PROJECTS);
        } finally {
            setIsLoaded(true);
        }
    };
    load();
  }, []);

  useEffect(() => {
    if (isLoaded && projects.length > 0) {
        projects.forEach(p => IDB.saveProject(p));
    }
  }, [projects, isLoaded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- DISK OPS ---

  const saveProjectToDisk = async (project: Project) => {
    const handle = projectHandlesRef.current.get(project.id);
    if (!handle) {
        return; 
    }

    try {
        const leanProject = { ...project, assets: {} }; 
        const fileHandle = await handle.getFileHandle('project.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(leanProject, null, 2));
        await writable.close();

        if (project.assets && Object.keys(project.assets).length > 0) {
            const assetsDir = await handle.getDirectoryHandle('assets', { create: true });
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

  const processSaveQueue = async () => {
    if (isSavingRef.current || !saveQueueRef.current) return;
    
    const projectToSave = saveQueueRef.current;
    saveQueueRef.current = null;
    isSavingRef.current = true;

    try {
        await saveProjectToDisk(projectToSave);
    } catch (e) {
        console.error("Save queue error:", e);
    } finally {
        isSavingRef.current = false;
        if (saveQueueRef.current) {
            processSaveQueue();
        }
    }
  };

  const deleteProjectFromDisk = async (project: Project) => {
      await IDB.delete(project.id);
      projectHandlesRef.current.delete(project.id);
  };

  const loadProjectFromHandle = async (folderHandle: any): Promise<Project | null> => {
      try {
          const jsonHandle = await folderHandle.getFileHandle('project.json');
          const jsonFile = await jsonHandle.getFile();
          const jsonText = await jsonFile.text();
          const projectData = JSON.parse(jsonText);

          const assetsMap: Record<string, string> = {};
          try {
            const assetsDir = await folderHandle.getDirectoryHandle('assets');
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
          } catch (e) { }

          projectData.assets = assetsMap;
          projectData.isLocal = true;
          return projectData;
      } catch (e) {
          return null;
      }
  };

  // --- ACTIONS ---

  const handleImportLocalFolder = async () => {
      // @ts-ignore
      if (typeof window.showDirectoryPicker !== 'function') {
        alert("Browser not supported. Please use Chrome, Edge, or Opera on desktop.");
        return;
      }

      try {
          // @ts-ignore
          const handle = await window.showDirectoryPicker({
            id: 'devarchitect_open',
            mode: 'readwrite'
          });

          let rootProject = await loadProjectFromHandle(handle);
          const newProjects: Project[] = [];

          if (rootProject) {
              newProjects.push(rootProject);
              await IDB.saveHandle(rootProject.id, handle);
              projectHandlesRef.current.set(rootProject.id, handle);
          } else {
              // @ts-ignore
              for await (const entry of handle.values()) {
                  if (entry.kind === 'directory') {
                      const subHandle = await handle.getDirectoryHandle(entry.name);
                      const subProject = await loadProjectFromHandle(subHandle);
                      if (subProject) {
                          newProjects.push(subProject);
                          await IDB.saveHandle(subProject.id, subHandle);
                          projectHandlesRef.current.set(subProject.id, subHandle);
                      }
                  }
              }
          }

          if (newProjects.length > 0) {
              const newIds = new Set(newProjects.map(p => p.id));
              setProjects(prev => [...newProjects, ...prev.filter(p => !newIds.has(p.id))]);
              newProjects.forEach(p => IDB.saveProject(p));
          } else {
              alert("No 'project.json' found in selected folder or its immediate subfolders.");
          }
      } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.error("Error opening folder:", err);
      }
  };

  const verifyPermission = async (project: Project): Promise<boolean> => {
      if (!project.isLocal) return true;
      const handle = projectHandlesRef.current.get(project.id);
      if (!handle) return false;

      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
          return true;
      }
      if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
          return true;
      }
      return false;
  };

  const handleSelectProject = async (id: string) => {
      const project = projects.find(p => p.id === id);
      if (!project) return;

      if (project.isLocal) {
          const hasPerm = await verifyPermission(project);
          if (!hasPerm) {
              alert("Permission to access local folder was denied.");
              return;
          }
          const handle = projectHandlesRef.current.get(id);
          const freshData = await loadProjectFromHandle(handle);
          if (freshData) {
              setProjects(prev => prev.map(p => p.id === id ? freshData : p));
          }
      }
      
      setActiveProjectId(id);
      setActiveFileId(project.files[0]?.id || null);
      setCurrentView(ViewState.PROJECT);
  };

  const handleCreateProject = async (name: string, type: Project['type']) => {
    const defaultDocPlugin = EDITOR_PLUGINS.find(p => p.type === 'doc');
    const newProject: Project = {
      id: crypto.randomUUID(),
      name, type, description: '', lastModified: Date.now(),
      files: [{ id: crypto.randomUUID(), name: 'Readme', type: 'doc', content: defaultDocPlugin ? defaultDocPlugin.createDefaultContent(name) : '' }],
      assets: {}
    };
    
    setProjects(prev => [newProject, ...prev]);
    IDB.saveProject(newProject);
  };

  const handleDeleteProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    
    const msg = project.isLocal 
        ? "Remove this project from the list? (Files on disk will NOT be deleted)" 
        : "Delete project permanently?";

    if (confirm(msg)) {
      await IDB.delete(id);
      projectHandlesRef.current.delete(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) { setActiveProjectId(null); setCurrentView(ViewState.DASHBOARD); }
    }
  };

  const handleExportProject = async (project: Project) => {
    const zip = new JSZip();
    const leanProject = { ...project, assets: {} }; 
    zip.file("project.json", JSON.stringify(leanProject, null, 2));

    const assetsFolder = zip.folder("assets");
    if (project.assets && assetsFolder) {
        Object.entries(project.assets).forEach(([id, base64]) => {
            const data = base64.split(',')[1]; 
            const ext = base64.substring(base64.indexOf('/') + 1, base64.indexOf(';'));
            assetsFolder.file(`${id}.${ext}`, data, {base64: true});
        });
    }

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
      
      if (updatedProject.isLocal) {
          saveQueueRef.current = updatedProject;
          processSaveQueue();
      }
      IDB.saveProject(updatedProject);
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

  const handleDeleteAsset = async (assetId: string) => {
    if (!activeProjectId) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
        const newAssets = { ...project.assets };
        delete newAssets[assetId];
        
        const updatedProject = {
            ...project,
            lastModified: Date.now(),
            assets: newAssets
        };
        updateProjectState(updatedProject);

        if (project.isLocal) {
             const handle = projectHandlesRef.current.get(project.id);
             if (handle) {
                 try {
                     const assetsDir = await handle.getDirectoryHandle('assets');
                     // We try to find any file starting with ID to delete
                     // @ts-ignore
                     for await (const entry of assetsDir.values()) {
                         if (entry.name.startsWith(assetId + '.')) {
                             await assetsDir.removeEntry(entry.name);
                             break;
                         }
                     }
                 } catch (e) {
                     console.error("Failed to delete asset file from disk", e);
                 }
             }
        }
    }
  };

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
          
          <div className="mt-auto">
             <button onClick={() => setIsHelpOpen(true)} className="p-3 rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors" title="Help">
                <HelpCircle className="w-5 h-5" />
             </button>
          </div>
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
             <div className="flex items-center gap-2 mb-1">
                 <h2 className="text-zinc-100 font-semibold truncate">{activeProject.name}</h2>
                 {activeProject.isLocal && <HardDrive className="w-3.5 h-3.5 text-blue-400" title="Local Repository" />}
             </div>
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
        
        <div className="p-4 border-t border-zinc-800">
             <button onClick={() => setIsHelpOpen(true)} className="flex items-center gap-3 px-3 py-2 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-lg w-full transition-colors">
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm">Guide & Help</span>
             </button>
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
              onSelectProject={handleSelectProject}
              onCreateProject={handleCreateProject}
              onExportProject={handleExportProject} 
              onDeleteProject={handleDeleteProject}
              onImportFolder={handleImportLocalFolder}
            />
          ) : (
            activeProject && activeFile ? (
                React.createElement(EDITOR_PLUGINS.find(p => p.type === activeFile.type)!.component, {
                    key: activeFile.id,
                    fileName: activeFile.name,
                    initialContent: activeFile.content,
                    onSave: updateFileContent,
                    assets: activeProject.assets || {},
                    onAddAsset: handleAddAsset,
                    onDeleteAsset: handleDeleteAsset
                })
            ) : <div className="flex flex-col items-center justify-center h-full text-zinc-500"><File className="w-16 h-16 mb-4 opacity-20" /><p>Select a file to edit</p></div>
          )}
        </div>
        
        <CommandPalette 
            isOpen={isPaletteOpen} 
            onClose={() => setIsPaletteOpen(false)}
            projects={projects}
            activeProject={activeProject}
            onSelectFile={(id) => { setActiveFileId(id); }}
            onSelectProject={handleSelectProject}
            onCreateFile={handleCreateFile}
        />
        
        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      </main>
    </div>
  );
};

export default App;