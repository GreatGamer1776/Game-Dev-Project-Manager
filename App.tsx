import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Network, ArrowLeft, Plus, Folder, File, CheckSquare, Bug as BugIcon, Trash2, HardDrive, Download, Upload, Map as MapIcon, Table, PenTool, Image as ImageIcon, HelpCircle, ChevronRight, ChevronDown, FolderPlus, FilePlus, X } from 'lucide-react';
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
import { Project, ViewState, ProjectFile, FileType, EditorProps, ProjectFolder } from './types';

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

const ASSET_LIBRARY_TYPE: FileType = 'asset-gallery';
const ASSET_LIBRARY_NAME = 'Asset Library';

const createAssetLibraryFile = (): ProjectFile => ({
  id: crypto.randomUUID(),
  name: ASSET_LIBRARY_NAME,
  type: ASSET_LIBRARY_TYPE,
  content: {},
  folderId: null
});

const normalizeProjectFiles = (project: Project): Project => {
  const baseFiles = project.files || [];
  const assetFiles = baseFiles.filter(f => f.type === ASSET_LIBRARY_TYPE);
  const nonAssetFiles = baseFiles.filter(f => f.type !== ASSET_LIBRARY_TYPE);
  let assetFile = assetFiles[0] || createAssetLibraryFile();

  if (assetFile.name !== ASSET_LIBRARY_NAME || assetFile.folderId !== null) {
    assetFile = { ...assetFile, name: ASSET_LIBRARY_NAME, folderId: null };
  }

  return {
    ...project,
    folders: project.folders || [],
    assets: project.assets || {},
    files: [...nonAssetFiles, assetFile]
  };
};

const MOCK_PROJECTS: Project[] = [{
    id: '1', name: 'Cosmic Invaders', type: 'Game', description: 'A retro-style space shooter.', lastModified: Date.now(),
    files: [
      { id: 'f1', name: 'Game Design Document', type: 'doc', content: '# Cosmic Invaders', folderId: null },
      { id: 'f-asset-lib', name: ASSET_LIBRARY_NAME, type: ASSET_LIBRARY_TYPE, content: {}, folderId: null }
    ],
    folders: [], 
    assets: {}
}];

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  // Folder & File Creation UI
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [createFileModal, setCreateFileModal] = useState<{ open: boolean, folderId: string | null }>({ open: false, folderId: null });
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<FileType>('doc');
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [activeDropFolderId, setActiveDropFolderId] = useState<string | 'root' | null>(null);

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
            const normalizedLoaded = loaded.map(normalizeProjectFiles);
            setProjects(normalizedLoaded.length > 0 ? normalizedLoaded : MOCK_PROJECTS.map(normalizeProjectFiles));
        } catch (e) {
            console.error("Init error", e);
            setProjects(MOCK_PROJECTS.map(normalizeProjectFiles));
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

          // Migration check
          if (!projectData.folders) projectData.folders = [];
          if (projectData.files) {
             projectData.files = projectData.files.map((f: any) => ({ ...f, folderId: f.folderId || null }));
          }

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
          return normalizeProjectFiles(projectData);
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
          }

          if (newProjects.length > 0) {
              const newIds = new Set(newProjects.map(p => p.id));
              setProjects(prev => [...newProjects, ...prev.filter(p => !newIds.has(p.id))]);
              newProjects.forEach(p => IDB.saveProject(p));
          } else {
              alert("No 'project.json' found in selected folder.");
          }
      } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.error("Error opening folder:", err);
      }
  };

  const handleSelectProject = async (id: string) => {
      const project = projects.find(p => p.id === id);
      if (!project) return;
      const firstFile = project.files.find(f => f.type !== ASSET_LIBRARY_TYPE) || project.files.find(f => f.type === ASSET_LIBRARY_TYPE);
      
      setActiveProjectId(id);
      setActiveFileId(firstFile?.id || null);
      setCurrentView(ViewState.PROJECT);
  };

  const handleCreateProject = async (name: string, type: Project['type']) => {
    const defaultDocPlugin = EDITOR_PLUGINS.find(p => p.type === 'doc');
    const newProject: Project = normalizeProjectFiles({
      id: crypto.randomUUID(),
      name, type, description: '', lastModified: Date.now(),
      files: [{ id: crypto.randomUUID(), name: 'Readme', type: 'doc', content: defaultDocPlugin ? defaultDocPlugin.createDefaultContent(name) : '', folderId: null }],
      folders: [],
      assets: {}
    });
    
    setProjects(prev => [newProject, ...prev]);
    IDB.saveProject(newProject);
  };

  const handleDeleteProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    
    if (confirm("Delete project?")) {
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
      const normalizedProject = normalizeProjectFiles(updatedProject);
      setProjects(prev => prev.map(p => p.id === normalizedProject.id ? normalizedProject : p));
      
      if (normalizedProject.isLocal) {
          saveQueueRef.current = normalizedProject;
          processSaveQueue();
      }
      IDB.saveProject(normalizedProject);
  };

  // --- FOLDER & FILE LOGIC ---

  const handleCreateFolder = (parentId: string | null) => {
    if (!activeProjectId) return;
    const name = prompt("Folder Name:");
    if (!name) return;
    
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
        const newFolder: ProjectFolder = { id: crypto.randomUUID(), name, parentId };
        updateProjectState({
            ...project,
            folders: [...project.folders, newFolder]
        });
        setExpandedFolders(prev => new Set(prev).add(newFolder.id).add(parentId || ''));
    }
  };

  const handleDeleteFolder = (folderId: string) => {
      if (!activeProjectId) return;
      const project = projects.find(p => p.id === activeProjectId);
      if (project) {
          const folderIdsToDelete = new Set<string>([folderId]);
          let changed = true;
          while (changed) {
              changed = false;
              for (const folder of project.folders) {
                  if (folder.parentId && folderIdsToDelete.has(folder.parentId) && !folderIdsToDelete.has(folder.id)) {
                      folderIdsToDelete.add(folder.id);
                      changed = true;
                  }
              }
          }

          const deletedFiles = project.files.filter(f => f.folderId && folderIdsToDelete.has(f.folderId));
          const deletedFileIds = new Set(deletedFiles.map(f => f.id));
          const folderCount = folderIdsToDelete.size;
          const fileCount = deletedFiles.length;
          const folderLabel = folderCount === 1 ? 'folder' : 'folders';
          const fileLabel = fileCount === 1 ? 'file' : 'files';

          const confirmed = confirm(
            `Delete this folder and all of its contents?\n\nThis will permanently delete ${folderCount} ${folderLabel} and ${fileCount} ${fileLabel}.`
          );
          if (!confirmed) return;

          const newFolders = project.folders.filter(f => !folderIdsToDelete.has(f.id));
          const newFiles = project.files.filter(f => !f.folderId || !folderIdsToDelete.has(f.folderId));

          updateProjectState({ ...project, lastModified: Date.now(), files: newFiles, folders: newFolders });

          if (activeFileId && deletedFileIds.has(activeFileId)) {
              const nextFile = newFiles.find(f => f.type !== ASSET_LIBRARY_TYPE) || newFiles.find(f => f.type === ASSET_LIBRARY_TYPE);
              setActiveFileId(nextFile?.id || null);
          }
          setExpandedFolders(prev => {
              const next = new Set(prev);
              for (const id of folderIdsToDelete) {
                  next.delete(id);
              }
              return next;
          });
      }
  };

  const openCreateFileModal = (folderId: string | null) => {
      setCreateFileModal({ open: true, folderId });
      setNewFileName('');
      setNewFileType('doc');
  };

  const handleConfirmCreateFile = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeProjectId || !newFileName) return;
      if (newFileType === ASSET_LIBRARY_TYPE) {
          alert("Asset Library is built into every project and can only exist once.");
          return;
      }

      const plugin = EDITOR_PLUGINS.find(p => p.type === newFileType);
      if (!plugin) return;

      const newFile: ProjectFile = {
          id: crypto.randomUUID(),
          name: newFileName,
          type: newFileType,
          content: plugin.createDefaultContent(newFileName),
          folderId: createFileModal.folderId
      };

      const project = projects.find(p => p.id === activeProjectId);
      if (project) {
          updateProjectState({ ...project, lastModified: Date.now(), files: [...project.files, newFile] });
          setActiveFileId(newFile.id);
          if (createFileModal.folderId) {
             setExpandedFolders(prev => new Set(prev).add(createFileModal.folderId!));
          }
      }
      setCreateFileModal({ open: false, folderId: null });
  };

  const handleDeleteFile = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (!activeProjectId) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project) return;
    const file = project.files.find(f => f.id === fileId);
    if (!file) return;
    if (file.type === ASSET_LIBRARY_TYPE) {
        alert("Asset Library cannot be deleted.");
        return;
    }
    if (confirm("Delete file?")) {
        const remainingFiles = project.files.filter(f => f.id !== fileId);
        updateProjectState({ ...project, files: remainingFiles });
        if (activeFileId === fileId) {
            const nextFile = remainingFiles.find(f => f.type !== ASSET_LIBRARY_TYPE) || remainingFiles.find(f => f.type === ASSET_LIBRARY_TYPE);
            setActiveFileId(nextFile?.id || null);
        }
    }
  };

  // --- ASSETS ---

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
        updateProjectState({ ...project, lastModified: Date.now(), assets: newAssets });
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
  const assetLibraryFile = activeProject?.files.find(f => f.type === ASSET_LIBRARY_TYPE);
  const nonAssetFileCount = activeProject ? activeProject.files.filter(f => f.type !== ASSET_LIBRARY_TYPE).length : 0;

  // --- SIDEBAR RENDERING ---

  const toggleFolder = (folderId: string) => {
      const newSet = new Set(expandedFolders);
      if (newSet.has(folderId)) newSet.delete(folderId);
      else newSet.add(folderId);
      setExpandedFolders(newSet);
  };

  const moveFileToFolder = (fileId: string, folderId: string | null) => {
      if (!activeProject) return;
      const file = activeProject.files.find(f => f.id === fileId);
      if (!file || file.type === ASSET_LIBRARY_TYPE || (file.folderId || null) === folderId) return;
      updateProjectState({
          ...activeProject,
          lastModified: Date.now(),
          files: activeProject.files.map(f => f.id === fileId ? { ...f, folderId } : f)
      });
  };

  const handleFileDragStart = (e: React.DragEvent, fileId: string) => {
      setDraggedFileId(fileId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', fileId);
  };

  const handleFileDragEnd = () => {
      setDraggedFileId(null);
      setActiveDropFolderId(null);
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (activeDropFolderId !== folderId) {
          setActiveDropFolderId(folderId);
      }
  };

  const handleFolderDrop = (e: React.DragEvent, folderId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const fileId = e.dataTransfer.getData('text/plain') || draggedFileId;
      setActiveDropFolderId(null);
      setDraggedFileId(null);
      if (!fileId) return;
      moveFileToFolder(fileId, folderId);
      setExpandedFolders(prev => new Set(prev).add(folderId));
  };

  const handleRootDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (activeDropFolderId !== 'root') {
          setActiveDropFolderId('root');
      }
  };

  const handleRootDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const fileId = e.dataTransfer.getData('text/plain') || draggedFileId;
      setActiveDropFolderId(null);
      setDraggedFileId(null);
      if (!fileId) return;
      moveFileToFolder(fileId, null);
  };

  const renderFileTree = (parentId: string | null, depth: number = 0) => {
      if (!activeProject) return null;

      const folders = activeProject.folders.filter(f => f.parentId === parentId);
      const pluginOrder = new Map(EDITOR_PLUGINS.map((plugin, index) => [plugin.type, index]));
      const files = activeProject.files
          .filter(f => f.type !== ASSET_LIBRARY_TYPE && (f.folderId || null) === parentId)
          .sort((a, b) => {
              const typeRankA = pluginOrder.get(a.type) ?? Number.MAX_SAFE_INTEGER;
              const typeRankB = pluginOrder.get(b.type) ?? Number.MAX_SAFE_INTEGER;
              if (typeRankA !== typeRankB) return typeRankA - typeRankB;
              return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });

      return (
          <div>
              {folders.map(folder => {
                  const isExpanded = expandedFolders.has(folder.id);
                  const isDropActive = activeDropFolderId === folder.id;
                  return (
                      <div key={folder.id}>
                          <div
                            style={{ marginLeft: depth * 12 }}
                            onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                            onDrop={(e) => handleFolderDrop(e, folder.id)}
                            className={`group flex items-center justify-between rounded-lg pr-1 py-1 mb-0.5 transition-colors ${isDropActive ? 'bg-blue-500/10 ring-1 ring-blue-500/40' : 'hover:bg-zinc-900'}`}
                          >
                              <button 
                                onClick={() => toggleFolder(folder.id)} 
                                className="flex-1 flex items-center gap-2 px-2 text-sm text-zinc-400 hover:text-zinc-200 truncate"
                              >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  <Folder className="w-4 h-4 text-blue-500/80" />
                                  <span className="truncate">{folder.name}</span>
                              </button>
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                                  <button onClick={() => openCreateFileModal(folder.id)} className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded" title="New File"><FilePlus className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleCreateFolder(folder.id)} className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded" title="New Subfolder"><FolderPlus className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleDeleteFolder(folder.id)} className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-red-400 rounded" title="Delete Folder"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                          </div>
                          {isExpanded && renderFileTree(folder.id, depth + 1)}
                      </div>
                  )
              })}
              {files.map(file => {
                  const plugin = EDITOR_PLUGINS.find(p => p.type === file.type);
                  const Icon = plugin?.icon || File;
                  const isDragging = draggedFileId === file.id;
                  return (
                      <div
                        key={file.id}
                        style={{ marginLeft: depth * 12 }}
                        draggable
                        onDragStart={(e) => handleFileDragStart(e, file.id)}
                        onDragEnd={handleFileDragEnd}
                        className={`group flex items-center gap-1 rounded-lg pr-1 mb-0.5 transition-colors cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-45 grayscale' : 'opacity-100 hover:bg-zinc-900'}`}
                      >
                          <button 
                            onClick={() => setActiveFileId(file.id)} 
                            className={`flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-left truncate ${activeFileId === file.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                          >
                             <span className="w-4 shrink-0" />
                             <Icon className={`w-4 h-4 shrink-0 ${activeFileId === file.id ? 'text-blue-400' : 'text-zinc-500'}`} />
                             <span className="truncate">{file.name}</span>
                          </button>
                          <button onClick={(e) => handleDeleteFile(e, file.id)} className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                  );
              })}
          </div>
      );
  };

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
        <div className="h-16 flex items-center px-4 border-b border-zinc-800 shrink-0 gap-2">
          <button onClick={() => { setActiveProjectId(null); setCurrentView(ViewState.DASHBOARD); }} className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>
          <span className="font-semibold text-zinc-200 truncate flex-1">{activeProject.name}</span>
        </div>
        
        {/* Actions Bar */}
        <div className="px-3 py-3 border-b border-zinc-900 flex gap-2">
            <button 
                onClick={() => openCreateFileModal(null)} 
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-md text-xs font-medium transition-colors"
            >
                <FilePlus className="w-3.5 h-3.5" /> New File
            </button>
            <button 
                onClick={() => handleCreateFolder(null)} 
                className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1.5 rounded-md text-xs font-medium transition-colors"
                title="New Folder"
            >
                <FolderPlus className="w-3.5 h-3.5" />
            </button>
        </div>

        {/* Asset Library (Always Available) */}
        {assetLibraryFile && (
          <div className="px-3 pt-3">
            <button
              onClick={() => setActiveFileId(assetLibraryFile.id)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${activeFileId === assetLibraryFile.id ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'}`}
            >
              <ImageIcon className={`w-4 h-4 ${activeFileId === assetLibraryFile.id ? 'text-blue-400' : 'text-zinc-500'}`} />
              <span className="truncate">{assetLibraryFile.name}</span>
            </button>
          </div>
        )}

        {/* Tree */}
        <div
          className={`p-3 flex-1 overflow-y-auto custom-scrollbar transition-colors ${activeDropFolderId === 'root' ? 'bg-blue-500/5 ring-1 ring-inset ring-blue-500/30 rounded-lg' : ''}`}
          onDragOver={handleRootDragOver}
          onDrop={handleRootDrop}
        >
          {renderFileTree(null)}
          
          {nonAssetFileCount === 0 && activeProject.folders.length === 0 && (
              <div className="text-center py-8 text-zinc-600 text-xs italic">
                  Project is empty. Create a file or folder to get started.
              </div>
          )}
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
            onCreateFile={(type) => openCreateFileModal(null)} // Hook palette to new modal
        />
        
        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

        {/* Create File Modal */}
        {createFileModal.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-white">Create New File</h3>
                        <button onClick={() => setCreateFileModal({open:false, folderId:null})}><X className="w-5 h-5 text-zinc-500" /></button>
                    </div>
                    <form onSubmit={handleConfirmCreateFile} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Name</label>
                            <input 
                                autoFocus
                                type="text" 
                                required 
                                value={newFileName} 
                                onChange={e => setNewFileName(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:ring-2 focus:ring-blue-600 outline-none"
                                placeholder="e.g. Character Specs"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Type</label>
                            <select 
                                value={newFileType} 
                                onChange={e => setNewFileType(e.target.value as FileType)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:ring-2 focus:ring-blue-600 outline-none"
                            >
                                {EDITOR_PLUGINS.filter(p => p.type !== ASSET_LIBRARY_TYPE).map(p => (
                                    <option key={p.type} value={p.type}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors">Create File</button>
                    </form>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
