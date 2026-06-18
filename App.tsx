import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Network, ArrowLeft, Folder, File, CheckSquare, Bug as BugIcon, Trash2, HardDrive, Download, Map as MapIcon, Table, PenTool, Image as ImageIcon, HelpCircle, ChevronRight, ChevronDown, FolderPlus, FilePlus, Copy as CopyIcon, Pencil, PanelLeftClose, PanelLeftOpen, BookOpen, Settings as SettingsIcon, X, Pin } from 'lucide-react';
import JSZip from 'jszip';
import Dashboard from './components/Dashboard';
import CommandPalette from './components/CommandPalette';
import HelpModal from './components/HelpModal';
import GuideView, { GuideSectionId } from './components/GuideView';
import { Project, ViewState, ProjectFile, FileType, EditorProps, ProjectFolder, TaskNavigationTarget } from './types';
import { useProjectStore } from './stores/useProjectStore';
import { getAssetExtensionFromMime, getAssetMimeType } from './services/assetUtils';
import { Button, Modal, Input, Select, Field, Eyebrow } from './components/ui';
import { SettingsModal } from './components/SettingsModal';
import { useSettingsStore } from './stores/useSettingsStore';

const DocEditor = React.lazy(() => import('./components/DocEditor'));
const FlowchartEditor = React.lazy(() => import('./components/FlowchartEditor'));
const TodoEditor = React.lazy(() => import('./components/TodoEditor'));
const KanbanBoard = React.lazy(() => import('./components/KanbanBoard'));
const RoadmapEditor = React.lazy(() => import('./components/RoadmapEditor'));
const DataGridEditor = React.lazy(() => import('./components/DataGridEditor'));
const WhiteboardEditor = React.lazy(() => import('./components/WhiteboardEditor'));
const AssetBrowser = React.lazy(() => import('./components/AssetBrowser'));

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
type PersistedAppState = {
  currentView: ViewState;
  activeProjectId: string | null;
  activeFileId: string | null;
  sidebarCollapsed?: boolean;
};

const IDB = {
    DB_VERSION: 3,
    DB_NAME: 'devarchitect_db',
    STORE_PROJECTS: 'projects',
    STORE_HANDLES: 'handles',
    STORE_APP_STATE: 'app_state',
    APP_STATE_KEY: 'session',
    init: function() {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = (e: any) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_PROJECTS)) {
                    db.createObjectStore(this.STORE_PROJECTS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.STORE_HANDLES)) {
                    db.createObjectStore(this.STORE_HANDLES); 
                }
                if (!db.objectStoreNames.contains(this.STORE_APP_STATE)) {
                    db.createObjectStore(this.STORE_APP_STATE);
                }
            };
            req.onsuccess = () => resolve();
        });
    },
    saveProject: function(project: Project) {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
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
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
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
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
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
             const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
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
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE_PROJECTS, this.STORE_HANDLES], 'readwrite');
                tx.objectStore(this.STORE_PROJECTS).delete(id);
                tx.objectStore(this.STORE_HANDLES).delete(id);
                tx.oncomplete = () => resolve();
            };
        });
    },
    saveAppState: function(appState: PersistedAppState) {
        return new Promise<void>((resolve) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE_APP_STATE], 'readwrite');
                tx.objectStore(this.STORE_APP_STATE).put(appState, this.APP_STATE_KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            };
            req.onerror = () => resolve();
        });
    },
    loadAppState: function() {
        return new Promise<PersistedAppState | null>((resolve) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onsuccess = (e: any) => {
                const tx = e.target.result.transaction([this.STORE_APP_STATE], 'readonly');
                const reqGet = tx.objectStore(this.STORE_APP_STATE).get(this.APP_STATE_KEY);
                reqGet.onsuccess = () => resolve(reqGet.result || null);
                reqGet.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
        });
    }
};

type EditorComponent = React.LazyExoticComponent<React.FC<EditorProps>>;

type EditorPlugin = {
  type: FileType;
  label: string;
  pluralLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  component: EditorComponent;
  createDefaultContent: (name: string) => any;
};

const EDITOR_PLUGINS: EditorPlugin[] = [
  { type: 'doc', label: 'Document', pluralLabel: 'Documents', icon: FileText, component: DocEditor, createDefaultContent: (name: string) => `# ${name}\n\nCreated on ${new Date().toLocaleDateString()}` },
  { type: 'flowchart', label: 'Flowchart', pluralLabel: 'Flowcharts', icon: Network, component: FlowchartEditor, createDefaultContent: () => ({ nodes: [], edges: [] }) },
  { type: 'todo', label: 'Task List', pluralLabel: 'Task Lists', icon: CheckSquare, component: TodoEditor, createDefaultContent: () => ({ items: [] }) },
  { type: 'kanban', label: 'Bug Tracker', pluralLabel: 'Bug Trackers', icon: BugIcon, component: KanbanBoard, createDefaultContent: () => ({ tasks: [] }) },
  { type: 'roadmap', label: 'Roadmap', pluralLabel: 'Roadmaps', icon: MapIcon, component: RoadmapEditor, createDefaultContent: () => ({ items: [] }) },
  { type: 'grid', label: 'Data Grid', pluralLabel: 'Data Grids', icon: Table, component: DataGridEditor, createDefaultContent: () => ({ columns: [], rows: [] }) },
  { type: 'whiteboard', label: 'Whiteboard', pluralLabel: 'Whiteboards', icon: PenTool, component: WhiteboardEditor, createDefaultContent: () => '' },
  { type: 'asset-gallery', label: 'Asset Library', pluralLabel: 'Asset Libraries', icon: ImageIcon, component: AssetBrowser, createDefaultContent: () => ({}) }
];

const ASSET_LIBRARY_TYPE: FileType = 'asset-gallery';
const ASSET_LIBRARY_NAME = 'Asset Library';
const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const SINGLE_INSTANCE_FILE_TYPES = new Set<FileType>([
  ASSET_LIBRARY_TYPE,
  'todo',
  'kanban',
  'roadmap'
]);
const MANDATORY_SINGLETON_FILES: Array<{ type: FileType; name: string }> = [
  { type: ASSET_LIBRARY_TYPE, name: ASSET_LIBRARY_NAME },
  { type: 'todo', name: 'Task List' },
  { type: 'kanban', name: 'Bug Tracker' },
  { type: 'roadmap', name: 'Roadmap' }
];

const createAssetLibraryFile = (): ProjectFile => ({
  id: crypto.randomUUID(),
  name: ASSET_LIBRARY_NAME,
  type: ASSET_LIBRARY_TYPE,
  content: {},
  folderId: null
});

const createDefaultProjectFile = (type: FileType, name: string): ProjectFile => {
  const plugin = EDITOR_PLUGINS.find(p => p.type === type);
  return {
    id: crypto.randomUUID(),
    name,
    type,
    content: plugin ? plugin.createDefaultContent(name) : '',
    folderId: null
  };
};

const TODO_STATUS_VALUES = new Set(['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);
const BUG_STATUS_VALUES = new Set(['Open', 'In Progress', 'Resolved', 'Closed']);

const migrateTodoContent = (content: any) => {
  const baseContent = content && typeof content === 'object' ? content : {};
  const rawItems = Array.isArray(content?.items) ? content.items : [];
  return {
    ...baseContent,
    items: rawItems.map((item: any) => {
      const { category: _legacyCategory, ...rest } = item || {};
      const normalizedStatus = TODO_STATUS_VALUES.has(rest.status) ? rest.status : (rest.completed ? 'Done' : 'To Do');
      return {
        ...rest,
        status: normalizedStatus,
        completed: normalizedStatus === 'Done'
      };
    })
  };
};

const migrateKanbanContent = (content: any) => {
  const baseContent = content && typeof content === 'object' ? content : {};
  const rawTasks = Array.isArray(content?.tasks) ? content.tasks : [];
  return {
    ...baseContent,
    tasks: rawTasks.map((task: any) => {
      const { category: _legacyCategory, ...rest } = task || {};
      return {
        ...rest,
        status: BUG_STATUS_VALUES.has(rest.status) ? rest.status : 'Open',
        description: typeof rest.description === 'string' ? rest.description : '',
        createdAt: typeof rest.createdAt === 'number' ? rest.createdAt : Date.now()
      };
    })
  };
};

const migrateProjectFile = (file: ProjectFile): ProjectFile => {
  switch (file.type) {
    case 'changelog':
      return { ...file, type: 'doc' };
    case 'todo':
      return { ...file, content: migrateTodoContent(file.content) };
    case 'kanban':
      return { ...file, content: migrateKanbanContent(file.content) };
    default:
      return file;
  }
};

const normalizeProjectFiles = (project: Project): Project => {
  const baseFiles = project.files || [];
  const assetFiles = baseFiles.filter(f => f.type === ASSET_LIBRARY_TYPE);
  const singletonByType = new Map<FileType, ProjectFile>();
  const files: ProjectFile[] = [];

  for (const file of baseFiles.filter(f => f.type !== ASSET_LIBRARY_TYPE)) {
    const migratedFile = migrateProjectFile(file);
    if (SINGLE_INSTANCE_FILE_TYPES.has(file.type)) {
      if (!singletonByType.has(file.type)) {
        singletonByType.set(file.type, { ...migratedFile, folderId: null });
      }
      continue;
    }
    files.push(migratedFile);
  }

  let assetFile = assetFiles[0] || createAssetLibraryFile();

  if (assetFile.name !== ASSET_LIBRARY_NAME || assetFile.folderId !== null) {
    assetFile = { ...assetFile, name: ASSET_LIBRARY_NAME, folderId: null };
  }

  for (const def of MANDATORY_SINGLETON_FILES) {
    if (def.type === ASSET_LIBRARY_TYPE) continue;
    const existing = singletonByType.get(def.type);
    if (existing) {
      files.push({ ...existing, name: def.name, folderId: null });
    } else {
      files.push(createDefaultProjectFile(def.type, def.name));
    }
  }

  return {
    ...project,
    folders: project.folders || [],
    assets: project.assets || {},
    files: [...files, assetFile]
  };
};

const ensureDirectoryPermission = async (handle: any, mode: 'read' | 'readwrite' = 'readwrite') => {
  if (!handle?.queryPermission || !handle?.requestPermission) {
    return true;
  }

  const options = { mode };
  if (await handle.queryPermission(options) === 'granted') {
    return true;
  }

  return (await handle.requestPermission(options)) === 'granted';
};

const writeProjectToHandle = async (handle: any, project: Project) => {
  const hasPermission = await ensureDirectoryPermission(handle, 'readwrite');
  if (!hasPermission) {
    throw new Error('Write permission denied for local project folder.');
  }

  const leanProject = { ...project, assets: {} };
  const fileHandle = await handle.getFileHandle('project.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(leanProject, null, 2));
  await writable.close();

  const trackedAssetFiles = new Set<string>();

  if (project.assets && Object.keys(project.assets).length > 0) {
    const assetsDir = await handle.getDirectoryHandle('assets', { create: true });
    for (const [id, base64] of Object.entries(project.assets)) {
      const ext = getAssetExtensionFromMime(getAssetMimeType(base64));
      const filename = `${id}.${ext}`;
      trackedAssetFiles.add(filename);

      const assetFile = await assetsDir.getFileHandle(filename, { create: true });
      const assetWriter = await assetFile.createWritable();
      await assetWriter.write(base64ToBlob(base64));
      await assetWriter.close();
    }
  }

  try {
    const assetsDir = await handle.getDirectoryHandle('assets');
    // Remove orphaned files so deleted assets do not reappear after a reload.
    // @ts-ignore
    for await (const assetEntry of assetsDir.values()) {
      if (assetEntry.kind === 'file' && !trackedAssetFiles.has(assetEntry.name)) {
        await assetsDir.removeEntry(assetEntry.name);
      }
    }
  } catch {
    // Ignore missing assets directory.
  }
};

const loadProjectFromHandle = async (folderHandle: any): Promise<Project | null> => {
  try {
    const hasPermission = await ensureDirectoryPermission(folderHandle, 'read');
    if (!hasPermission) {
      return null;
    }

    const jsonHandle = await folderHandle.getFileHandle('project.json');
    const jsonFile = await jsonHandle.getFile();
    const jsonText = await jsonFile.text();
    const projectData = JSON.parse(jsonText);

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
    } catch {
      // Ignore missing assets directory.
    }

    projectData.assets = assetsMap;
    projectData.isLocal = true;
    return normalizeProjectFiles(projectData);
  } catch {
    return null;
  }
};

const folderHasProjectFile = async (folderHandle: any) => {
  try {
    await folderHandle.getFileHandle('project.json');
    return true;
  } catch {
    return false;
  }
};

const formatProjectTimestamp = (timestamp?: number) => {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return 'Unknown';
  }
  return new Date(timestamp).toLocaleString();
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

const EditorLoadingFallback = ({ fileName }: { fileName: string }) => (
  <div className="h-full flex items-center justify-center bg-bg p-6">
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted shadow-raised">
      <File className="h-4 w-4 text-faint" />
      <span className="truncate">Loading {fileName}...</span>
    </div>
  </div>
);

const App: React.FC = () => {
  const projects = useProjectStore(state => state.projects);
  const isLoaded = useProjectStore(state => state.isLoaded);
  const currentView = useProjectStore(state => state.currentView);
  const activeProjectId = useProjectStore(state => state.activeProjectId);
  const activeFileId = useProjectStore(state => state.activeFileId);
  const setProjects = useProjectStore(state => state.setProjects);
  const setIsLoaded = useProjectStore(state => state.setIsLoaded);
  const setCurrentView = useProjectStore(state => state.setCurrentView);
  const setActiveProjectId = useProjectStore(state => state.setActiveProjectId);
  const setActiveFileId = useProjectStore(state => state.setActiveFileId);
  
  const openSettings = useSettingsStore(state => state.openSettings);

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideSection, setGuideSection] = useState<GuideSectionId>('overview');
  
  // Folder & File Creation UI
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [createFileModal, setCreateFileModal] = useState<{ open: boolean, folderId: string | null }>({ open: false, folderId: null });
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<FileType>('doc');
  const [renameFileModal, setRenameFileModal] = useState<{ open: boolean; fileId: string | null; name: string }>({ open: false, fileId: null, name: '' });
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [activeDropFolderId, setActiveDropFolderId] = useState<string | 'root' | null>(null);
  const [taskNavigationTarget, setTaskNavigationTarget] = useState<TaskNavigationTarget | null>(null);
  // IDE-style open-file tabs (ordered). Kept in sync with activeFileId below.
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [pinnedFileIds, setPinnedFileIds] = useState<string[]>([]);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

  const isSavingRef = React.useRef(false);
  const saveQueueRef = React.useRef<Project | null>(null);
  const projectHandlesRef = React.useRef<Map<string, any>>(new Map());
  const projectsRef = React.useRef<Project[]>([]);
  const taskNavigationRequestRef = React.useRef(0);
  projectsRef.current = projects;

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    const load = async () => {
        try {
            await IDB.init();
            const loaded = await IDB.loadAllProjects();
            const savedAppState = await IDB.loadAppState();
            const loadedProjects = await Promise.all(loaded.map(async (project) => {
                if (!project.isLocal) {
                    return project;
                }

                const handle = await IDB.loadHandle(project.id);
                if (!handle) {
                    return project;
                }

                projectHandlesRef.current.set(project.id, handle);
                const diskProject = await loadProjectFromHandle(handle);
                return diskProject || project;
            }));
            const normalizedLoaded = loadedProjects.map(normalizeProjectFiles);
            const hydratedProjects = normalizedLoaded.length > 0 ? normalizedLoaded : MOCK_PROJECTS.map(normalizeProjectFiles);
            setProjects(hydratedProjects);

            const hydratedProjectId = savedAppState?.activeProjectId && hydratedProjects.some(p => p.id === savedAppState.activeProjectId)
              ? savedAppState.activeProjectId
              : null;
            const hydratedProject = hydratedProjectId
              ? hydratedProjects.find(p => p.id === hydratedProjectId)
              : null;
            const fallbackFileId = hydratedProject
              ? (hydratedProject.files.find(f => f.type !== ASSET_LIBRARY_TYPE) || hydratedProject.files.find(f => f.type === ASSET_LIBRARY_TYPE))?.id || null
              : null;
            const hydratedFileId = savedAppState?.activeFileId && hydratedProject?.files.some(f => f.id === savedAppState.activeFileId)
              ? savedAppState.activeFileId
              : fallbackFileId;

            if (hydratedProjectId && savedAppState?.currentView === ViewState.PROJECT) {
              setCurrentView(ViewState.PROJECT);
              setActiveProjectId(hydratedProjectId);
              setActiveFileId(hydratedFileId);
            } else {
              setCurrentView(ViewState.DASHBOARD);
              setActiveProjectId(null);
              setActiveFileId(null);
            }
            if (savedAppState?.sidebarCollapsed) {
              setIsSidebarCollapsed(true);
            }
        } catch (e) {
            console.error("Init error", e);
            setProjects(MOCK_PROJECTS.map(normalizeProjectFiles));
            setCurrentView(ViewState.DASHBOARD);
            setActiveProjectId(null);
            setActiveFileId(null);
        } finally {
            setIsLoaded(true);
        }
    };
    load();
  }, [setActiveFileId, setActiveProjectId, setCurrentView, setIsLoaded, setProjects]);

  useEffect(() => {
    if (isLoaded && projects.length > 0) {
        projects.forEach(p => IDB.saveProject(p));
    }
  }, [projects, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    IDB.saveAppState({
      currentView,
      activeProjectId,
      activeFileId,
      sidebarCollapsed: isSidebarCollapsed
    });
  }, [isLoaded, currentView, activeProjectId, activeFileId, isSidebarCollapsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        setIsSidebarCollapsed(prev => !prev);
      }
      if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        if (currentView === ViewState.PROJECT && activeProjectId) {
          openCreateFileModal(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, activeProjectId]);

  useEffect(() => {
    setTaskNavigationTarget(null);
  }, [activeProjectId]);

  // When the project changes, drop tabs for files not in the new project.
  useEffect(() => {
    const project = projects.find(p => p.id === activeProjectId);
    if (!project) { setOpenFileIds([]); setPinnedFileIds([]); return; }
    const exists = (id: string) => project.files.some(f => f.id === id);
    setOpenFileIds(prev => prev.filter(exists));
    setPinnedFileIds(prev => prev.filter(exists));
  }, [activeProjectId]);

  // Pinned tabs are kept at the front of the order.
  const normalizeTabOrder = (ids: string[], pinned: string[]): string[] => {
    const pinnedSet = new Set(pinned);
    return [...ids.filter(id => pinnedSet.has(id)), ...ids.filter(id => !pinnedSet.has(id))];
  };

  const togglePinTab = (fileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextPinned = pinnedFileIds.includes(fileId)
      ? pinnedFileIds.filter(id => id !== fileId)
      : [...pinnedFileIds, fileId];
    setPinnedFileIds(nextPinned);
    setOpenFileIds(prev => normalizeTabOrder(prev, nextPinned));
  };

  const reorderTabs = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setOpenFileIds(prev => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return normalizeTabOrder(next, pinnedFileIds);
    });
  };

  // Any file that becomes active is opened as a tab (covers every open path:
  // sidebar, command palette, links, quick-open, file creation).
  useEffect(() => {
    if (!activeFileId) return;
    setOpenFileIds(prev => (prev.includes(activeFileId) ? prev : [...prev, activeFileId]));
  }, [activeFileId]);

  const closeTab = (fileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPinnedFileIds(prev => prev.filter(id => id !== fileId));
    setOpenFileIds(prev => {
      const idx = prev.indexOf(fileId);
      const next = prev.filter(id => id !== fileId);
      if (activeFileId === fileId) {
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setActiveFileId(fallback);
      }
      return next;
    });
  };

  const openGuideSection = (section: GuideSectionId = 'overview') => {
    setGuideSection(section);
    setShowGuide(true);
  };

  // --- DISK OPS ---

  const saveProjectToDisk = async (project: Project) => {
    const handle = projectHandlesRef.current.get(project.id);
    if (!handle) {
        return; 
    }

    try {
        await writeProjectToHandle(handle, project);
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

  const handleLinkProjectToLocalFolder = async (projectId: string) => {
      // @ts-ignore
      if (typeof window.showDirectoryPicker !== 'function') {
        alert("Browser not supported. Please use Chrome, Edge, or Opera on desktop.");
        return;
      }

      const project = projectsRef.current.find(p => p.id === projectId);
      if (!project) {
        return;
      }

      try {
          // @ts-ignore
          const handle = await window.showDirectoryPicker({
            id: `devarchitect_link_${project.id}`,
            mode: 'readwrite'
          });

          const hasProjectJson = await folderHasProjectFile(handle);
          const diskProject = hasProjectJson ? await loadProjectFromHandle(handle) : null;

          if (hasProjectJson && !diskProject) {
            alert("This folder already contains a project.json file that could not be read safely. To avoid overwriting data, choose a different folder or import that project first.");
            return;
          }

          if (diskProject && diskProject.id !== project.id) {
            alert(`This folder already contains another project named "${diskProject.name}". To avoid overwriting it, choose an empty folder or use Import Local Folder instead.`);
            return;
          }

          if (diskProject && diskProject.id === project.id) {
            const confirmed = confirm(
              `This folder already contains "${diskProject.name}".\n\nCurrent in-app version: ${formatProjectTimestamp(project.lastModified)}\nFolder version: ${formatProjectTimestamp(diskProject.lastModified)}\n\nContinue and overwrite the folder with the current in-app version?`
            );
            if (!confirmed) {
              return;
            }
          }

          await writeProjectToHandle(handle, project);
          await IDB.saveHandle(project.id, handle);
          projectHandlesRef.current.set(project.id, handle);

          const linkedProject = normalizeProjectFiles({ ...project, isLocal: true });
          setProjects(prev => {
              const next = prev.map(p => p.id === project.id ? linkedProject : p);
              projectsRef.current = next;
              return next;
          });
          IDB.saveProject(linkedProject);
      } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.error("Error linking folder:", err);
          alert("Failed to link this project to a local folder.");
      }
  };

  const handleSelectProject = async (id: string) => {
      const project = projects.find(p => p.id === id);
      if (!project) return;
      const firstFile = project.files.find(f => f.type !== ASSET_LIBRARY_TYPE) || project.files.find(f => f.type === ASSET_LIBRARY_TYPE);
      
      setActiveProjectId(id);
      setActiveFileId(firstFile?.id || null);
      setCurrentView(ViewState.PROJECT);
      setShowGuide(false);
      setGuideSection('overview');
  };

  const handleCreateProject = async (name: string, type: Project['type'], description: string = '') => {
    const trimmedName = name.trim();
    const defaultDocPlugin = EDITOR_PLUGINS.find(p => p.type === 'doc');
    const newProject: Project = normalizeProjectFiles({
      id: crypto.randomUUID(),
      name: trimmedName,
      type,
      description: description.trim(),
      lastModified: Date.now(),
      files: [{ id: crypto.randomUUID(), name: 'Readme', type: 'doc', content: defaultDocPlugin ? defaultDocPlugin.createDefaultContent(trimmedName) : '', folderId: null }],
      folders: [],
      assets: {}
    });
    
    setProjects(prev => [newProject, ...prev]);
    IDB.saveProject(newProject);
  };

  const handleUpdateProject = (id: string, updates: { name: string; description: string }) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    const trimmedName = updates.name.trim();
    if (!trimmedName) {
      alert("Project name is required.");
      return;
    }

    updateProjectState({
      ...project,
      name: trimmedName,
      description: updates.description.trim(),
      lastModified: Date.now()
    });
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
      setProjects(prev => {
          const next = prev.map(p => p.id === normalizedProject.id ? normalizedProject : p);
          projectsRef.current = next;
          return next;
      });
      
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

  const isProtectedMainFile = (file: ProjectFile, project: Project) =>
    SINGLE_INSTANCE_FILE_TYPES.has(file.type) && project.files.filter(f => f.type === file.type).length <= 1;

  const closeRenameFileModal = () => {
    setRenameFileModal({ open: false, fileId: null, name: '' });
  };

  const handleOpenRenameFileModal = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (!activeProject) return;
    const file = activeProject.files.find(f => f.id === fileId);
    if (!file) return;

    if (isProtectedMainFile(file, activeProject)) {
      const plugin = EDITOR_PLUGINS.find(p => p.type === file.type);
      alert(`${plugin?.label || file.type} is a required main file and cannot be renamed.`);
      return;
    }

    setRenameFileModal({ open: true, fileId: file.id, name: file.name });
  };

  const handleConfirmRenameFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !renameFileModal.fileId) return;

    const nextName = renameFileModal.name.trim();
    if (!nextName) return;

    const file = activeProject.files.find(f => f.id === renameFileModal.fileId);
    if (!file) {
      closeRenameFileModal();
      return;
    }
    if (isProtectedMainFile(file, activeProject)) {
      const plugin = EDITOR_PLUGINS.find(p => p.type === file.type);
      alert(`${plugin?.label || file.type} is a required main file and cannot be renamed.`);
      closeRenameFileModal();
      return;
    }

    updateProjectState({
      ...activeProject,
      lastModified: Date.now(),
      files: activeProject.files.map(f => f.id === file.id ? { ...f, name: nextName } : f)
    });
    closeRenameFileModal();
  };

  const canCreateFileType = (type: FileType, project?: Project) => {
      if (type === ASSET_LIBRARY_TYPE) return false;
      if (!project) return true;
      if (!SINGLE_INSTANCE_FILE_TYPES.has(type)) return true;
      return !project.files.some(f => f.type === type);
  };

  const openCreateFileModal = (folderId: string | null, preferredType?: FileType) => {
      const project = projects.find(p => p.id === activeProjectId);
      const creatablePlugins = EDITOR_PLUGINS.filter(p => canCreateFileType(p.type as FileType, project));
      const fallbackType = (creatablePlugins[0]?.type || 'doc') as FileType;
      const selectedType = preferredType && canCreateFileType(preferredType, project) ? preferredType : fallbackType;

      if (preferredType && !canCreateFileType(preferredType, project)) {
          const plugin = EDITOR_PLUGINS.find(p => p.type === preferredType);
          alert(`Only one ${plugin?.label || preferredType} is allowed per project.`);
      }

      setCreateFileModal({ open: true, folderId });
      setNewFileName('');
      setNewFileType(selectedType);
  };

  const handleConfirmCreateFile = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeProjectId || !newFileName) return;
      const project = projects.find(p => p.id === activeProjectId);
      if (!project) return;
      if (!canCreateFileType(newFileType, project)) {
          const plugin = EDITOR_PLUGINS.find(p => p.type === newFileType);
          alert(`Only one ${plugin?.label || newFileType} is allowed per project.`);
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

      updateProjectState({ ...project, lastModified: Date.now(), files: [...project.files, newFile] });
      setActiveFileId(newFile.id);
      if (createFileModal.folderId) {
         setExpandedFolders(prev => new Set(prev).add(createFileModal.folderId!));
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
    if (isProtectedMainFile(file, project)) {
        const plugin = EDITOR_PLUGINS.find(p => p.type === file.type);
        alert(`${plugin?.label || file.type} is required in every project and cannot be deleted.`);
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

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result;
        if (typeof base64 === 'string') {
          resolve(base64);
          return;
        }
        reject(new Error('Failed to read image data.'));
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read image file.'));
      reader.onabort = () => reject(new Error('Image read was aborted.'));
      reader.readAsDataURL(file);
    });

  const handleAddAsset = async (file: File): Promise<string> => {
    if (!activeProjectId) throw new Error("No active project");
    const base64 = await readFileAsDataUrl(file);
    const assetId = crypto.randomUUID();
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (!project) throw new Error("Active project not found");

    const updatedProject = {
      ...project,
      lastModified: Date.now(),
      assets: { ...(project.assets || {}), [assetId]: base64 }
    };

    projectsRef.current = projectsRef.current.map(p => p.id === updatedProject.id ? updatedProject : p);
    updateProjectState(updatedProject);
    return `asset://${assetId}`;
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!activeProjectId) return;
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (project) {
        const newAssets = { ...project.assets };
        delete newAssets[assetId];
        const updatedProject = { ...project, lastModified: Date.now(), assets: newAssets };
        projectsRef.current = projectsRef.current.map(p => p.id === updatedProject.id ? updatedProject : p);
        updateProjectState(updatedProject);
    }
  };

  const updateFileContent = (fileId: string, content: any) => {
    if (!activeProjectId || !fileId) return;
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (project) {
        const updatedProject = {
            ...project,
            lastModified: Date.now(),
            files: project.files.map(f => f.id === fileId ? { ...f, content } : f)
        };
        projectsRef.current = projectsRef.current.map(p => p.id === updatedProject.id ? updatedProject : p);
        updateProjectState(updatedProject);
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeFile = activeProject?.files.find(f => f.id === activeFileId);
  const activeEditorPlugin = activeFile ? EDITOR_PLUGINS.find(p => p.type === activeFile.type) : null;
  // Open tabs, in order, resolved to currently-existing project files.
  const openTabs = activeProject
    ? openFileIds
        .map(id => activeProject.files.find(f => f.id === id))
        .filter((f): f is ProjectFile => Boolean(f))
    : [];
  const quickOpenFiles = activeProject
    ? activeProject.files
        .filter(f => f.type !== ASSET_LIBRARY_TYPE)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        .slice(0, 6)
    : [];
  const systemFileOrder = new Map(MANDATORY_SINGLETON_FILES.map((file, index) => [file.type, index]));
  const systemFiles = activeProject
    ? activeProject.files
        .filter(f => SINGLE_INSTANCE_FILE_TYPES.has(f.type))
        .sort((a, b) => (systemFileOrder.get(a.type) ?? Number.MAX_SAFE_INTEGER) - (systemFileOrder.get(b.type) ?? Number.MAX_SAFE_INTEGER))
    : [];
  const nonSystemFileCount = activeProject ? activeProject.files.filter(f => !SINGLE_INSTANCE_FILE_TYPES.has(f.type)).length : 0;

  const handleOpenFileFromLink = (fileId: string) => {
    if (!activeProject) return;
    if (!activeProject.files.some(f => f.id === fileId)) {
      alert("Linked file was not found in this project.");
      return;
    }
    setTaskNavigationTarget(null);
    setActiveFileId(fileId);
  };

  const handleOpenTaskFromLink = (fileId: string, taskId: string) => {
    if (!activeProject) return;

    const file = activeProject.files.find(projectFile => projectFile.id === fileId);
    if (!file || file.type !== 'todo') {
      alert("Linked task was not found in this project.");
      return;
    }

    const todoContent = file.content as { items?: Array<{ id?: string }> };
    const hasTask = Array.isArray(todoContent?.items) && todoContent.items.some(item => item?.id === taskId);
    if (!hasTask) {
      alert("Linked task was not found in this project.");
      return;
    }

    taskNavigationRequestRef.current += 1;
    setTaskNavigationTarget({
      fileId,
      taskId,
      requestKey: taskNavigationRequestRef.current
    });
    setActiveFileId(fileId);
  };

  const extractDraggedFileId = (e: React.DragEvent): string | null => {
    const raw = e.dataTransfer.getData(FILE_LINK_DRAG_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: string };
        if (parsed?.id) return parsed.id;
      } catch {
        if (activeProject?.files.some(f => f.id === raw)) return raw;
      }
    }

    const uri = e.dataTransfer.getData('text/uri-list');
    if (uri?.startsWith('file://')) {
      const id = uri.replace('file://', '').trim();
      if (activeProject?.files.some(f => f.id === id)) return id;
    }

    const text = e.dataTransfer.getData('text/plain');
    const markdownMatch = text.match(/\(file:\/\/([^)]+)\)/);
    if (markdownMatch?.[1] && activeProject?.files.some(f => f.id === markdownMatch[1])) {
      return markdownMatch[1];
    }
    if (text && activeProject?.files.some(f => f.id === text.trim())) {
      return text.trim();
    }
    return draggedFileId;
  };

  const handleCopyFileId = async (fileId: string) => {
    try {
      await navigator.clipboard.writeText(fileId);
    } catch {
      alert("Failed to copy file ID.");
    }
  };

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
      if (!file || SINGLE_INSTANCE_FILE_TYPES.has(file.type) || (file.folderId || null) === folderId) return;
      updateProjectState({
          ...activeProject,
          lastModified: Date.now(),
          files: activeProject.files.map(f => f.id === fileId ? { ...f, folderId } : f)
      });
  };

  const handleFileDragStart = (e: React.DragEvent, fileId: string, fileName: string) => {
      setDraggedFileId(fileId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(FILE_LINK_DRAG_MIME, JSON.stringify({ id: fileId, name: fileName }));
      e.dataTransfer.setData('application/x-gdpm-file-name', fileName);
      e.dataTransfer.setData('text/uri-list', `file://${fileId}`);
      e.dataTransfer.setData('text/plain', `[${fileName}](file://${fileId})`);
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
      const fileId = extractDraggedFileId(e);
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
      const fileId = extractDraggedFileId(e);
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
          .filter(f => !SINGLE_INSTANCE_FILE_TYPES.has(f.type) && (f.folderId || null) === parentId)
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
                            className={`group flex items-center justify-between rounded-lg pr-1 py-1 mb-0.5 transition-colors ${isDropActive ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-surface-hover'}`}
                          >
                              <button
                                onClick={() => toggleFolder(folder.id)}
                                className="flex-1 flex items-center gap-2 px-2 text-sm text-muted hover:text-content truncate"
                              >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  <Folder className="w-4 h-4 text-accent/80" />
                                  <span className="truncate">{folder.name}</span>
                              </button>
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                                  <button onClick={() => openCreateFileModal(folder.id)} className="p-1 hover:bg-surface-raised text-faint hover:text-content rounded" title="New File"><FilePlus className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleCreateFolder(folder.id)} className="p-1 hover:bg-surface-raised text-faint hover:text-content rounded" title="New Subfolder"><FolderPlus className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleDeleteFolder(folder.id)} className="p-1 hover:bg-surface-raised text-faint hover:text-danger rounded" title="Delete Folder"><Trash2 className="w-3.5 h-3.5" /></button>
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
                        onDragStart={(e) => handleFileDragStart(e, file.id, file.name)}
                        onDragEnd={handleFileDragEnd}
                        className={`group relative rounded-lg mb-0.5 transition-colors cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-45 grayscale' : 'opacity-100 hover:bg-surface-hover'}`}
                      >
                          <button
                            onClick={() => setActiveFileId(file.id)}
                            draggable
                            onDragStart={(e) => handleFileDragStart(e, file.id, file.name)}
                            onDragEnd={handleFileDragEnd}
                            className={`w-full flex items-center gap-2 pl-1.5 pr-2 py-[var(--row-py)] text-sm text-left transition-[padding] duration-150 group-hover:pr-28 ${activeFileId === file.id ? 'bg-accent/10 text-content' : 'text-muted hover:text-content'}`}
                            title={file.name}
                          >
                             <Icon className={`w-4 h-4 shrink-0 ${activeFileId === file.id ? 'text-accent' : 'text-faint'}`} />
                             <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          </button>
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-md border border-border bg-surface/95 px-1 py-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopyFileId(file.id); }}
                              className="p-1 text-faint hover:text-accent hover:bg-surface-hover rounded"
                              title="Copy File ID"
                            >
                              <CopyIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleOpenRenameFileModal(e, file.id)}
                              className="p-1 text-faint hover:text-warning hover:bg-surface-hover rounded"
                              title="Rename File"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFile(e, file.id)}
                              className="p-1 text-faint hover:text-danger hover:bg-surface-hover rounded"
                              title="Delete File"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                      </div>
                  );
              })}
          </div>
      );
  };

  const renderFileTabs = () => {
    if (openTabs.length === 0) return null;
    return (
      <div className="flex items-stretch border-b border-border bg-surface overflow-x-auto custom-scrollbar shrink-0">
        {openTabs.map(file => {
          const plugin = EDITOR_PLUGINS.find(p => p.type === file.type);
          const Icon = plugin?.icon || File;
          const active = file.id === activeFileId;
          const pinned = pinnedFileIds.includes(file.id);
          const isDragging = draggingTabId === file.id;
          return (
            <button
              key={file.id}
              draggable
              onDragStart={(e) => { setDraggingTabId(file.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => { e.preventDefault(); if (draggingTabId) reorderTabs(draggingTabId, file.id); setDraggingTabId(null); }}
              onDragEnd={() => setDraggingTabId(null)}
              onClick={() => setActiveFileId(file.id)}
              onAuxClick={(e) => { if (e.button === 1 && !pinned) closeTab(file.id, e); }}
              className={`group/tab relative flex items-center gap-2 pl-3 pr-2 py-[var(--tab-py)] text-sm border-r border-border max-w-[200px] shrink-0 cursor-pointer transition-colors ${active ? 'bg-bg text-content' : 'text-muted hover:text-content hover:bg-surface-hover'} ${isDragging ? 'opacity-50' : ''}`}
              title={file.name}
            >
              {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-accent' : 'text-faint'}`} />
              <span className="truncate">{file.name}</span>
              <span
                role="button"
                aria-label={pinned ? `Unpin ${file.name}` : `Pin ${file.name}`}
                onClick={(e) => togglePinTab(file.id, e)}
                className={`ml-1 shrink-0 rounded p-0.5 hover:bg-surface-hover transition-opacity ${pinned ? 'text-accent opacity-100' : 'text-faint hover:text-content opacity-0 group-hover/tab:opacity-100'}`}
              >
                <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-current' : ''}`} />
              </span>
              {!pinned && (
                <span
                  role="button"
                  aria-label={`Close ${file.name}`}
                  onClick={(e) => closeTab(file.id, e)}
                  className={`shrink-0 rounded p-0.5 text-faint hover:text-content hover:bg-surface-hover transition-opacity ${active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover/tab:opacity-100'}`}
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const renderSidebar = () => {
    if (currentView === ViewState.DASHBOARD || !activeProject) {
      return (
        <aside className="w-16 md:w-20 bg-surface border-r border-border flex flex-col items-center py-6 gap-6 z-20">
          <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center shadow-soft mb-4" title="DevArchitect"><span className="font-display text-sm font-extrabold tracking-tight text-accent-content">DA</span></div>
          <button onClick={() => { setShowGuide(false); setGuideSection('overview'); }} className={`p-3 rounded-xl transition-colors ${!showGuide ? 'bg-accent/15 text-accent shadow-soft' : 'text-faint hover:bg-surface-hover hover:text-content'}`} title="Dashboard"><LayoutDashboard className="w-5 h-5" /></button>
          <button onClick={() => openGuideSection('overview')} className={`p-3 rounded-xl transition-colors ${showGuide ? 'bg-accent/15 text-accent shadow-soft' : 'text-faint hover:bg-surface-hover hover:text-content'}`} title="Guide & Documentation"><BookOpen className="w-5 h-5" /></button>
          <button onClick={openSettings} className="mt-auto p-3 rounded-xl text-faint hover:bg-surface-hover hover:text-content transition-colors" title="Settings"><SettingsIcon className="w-5 h-5" /></button>
        </aside>
      );
    }
    if (isSidebarCollapsed) {
      return (
        <aside className="w-14 bg-surface border-r border-border flex flex-col items-center z-20 transition-all duration-200">
          <div className="h-16 flex items-center justify-center border-b border-border shrink-0 w-full">
            <button onClick={() => setIsSidebarCollapsed(false)} className="p-2 hover:bg-surface-hover rounded-lg text-muted hover:text-content transition-colors" title="Expand Sidebar (Ctrl+\\)">
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
          <div className="py-3 flex flex-col items-center gap-1 w-full border-b border-border">
            <button onClick={() => { setActiveProjectId(null); setCurrentView(ViewState.DASHBOARD); }} className="p-2 hover:bg-surface-hover rounded-lg text-muted hover:text-content transition-colors" title="Back to Dashboard">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
          {systemFiles.length > 0 && (
            <div className="py-2 flex flex-col items-center gap-1 w-full">
              {systemFiles.map(file => {
                const plugin = EDITOR_PLUGINS.find(p => p.type === file.type);
                const Icon = plugin?.icon || File;
                return (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`p-2 rounded-lg transition-colors ${activeFileId === file.id ? 'bg-accent/15 text-accent' : 'text-faint hover:text-content hover:bg-surface-hover'}`}
                    title={file.name}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-auto pb-4 flex flex-col items-center gap-1">
            <button onClick={openSettings} className="p-2 rounded-lg text-faint hover:bg-surface-hover hover:text-content transition-colors" title="Settings">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setIsHelpOpen(true)} className="p-2 rounded-lg text-faint hover:bg-surface-hover hover:text-content transition-colors" title="Help">
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </aside>
      );
    }
    return (
      <aside className="w-80 bg-surface border-r border-border flex flex-col z-20 transition-all duration-200">
        <div className="h-16 flex items-center px-4 border-b border-border shrink-0 gap-2">
          <button onClick={() => { setActiveProjectId(null); setCurrentView(ViewState.DASHBOARD); }} className="p-2 hover:bg-surface-hover rounded-lg text-muted hover:text-content" title="Back to dashboard"><ArrowLeft className="w-4 h-4" /></button>
          <div className="min-w-0 flex-1">
            <Eyebrow className="block leading-none">Project</Eyebrow>
            <span className="font-display font-semibold text-content truncate block leading-tight mt-0.5">{activeProject.name}</span>
          </div>
          <button onClick={() => setIsSidebarCollapsed(true)} className="p-2 hover:bg-surface-hover rounded-lg text-muted hover:text-content transition-colors" title="Collapse Sidebar (Ctrl+\\)">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Actions Bar */}
        <div className="px-3 py-3 border-b border-border flex gap-2">
            <Button size="sm" icon={FilePlus} className="flex-1" onClick={() => openCreateFileModal(null)}>
                New File
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleCreateFolder(null)} title="New Folder">
                <FolderPlus className="w-3.5 h-3.5" />
            </Button>
        </div>

        {/* Project Systems */}
        {systemFiles.length > 0 && (
          <div className="px-3 pt-3">
            <Eyebrow className="block px-2 pb-1.5">Project systems</Eyebrow>
            <div className="space-y-1">
              {systemFiles.map(file => {
                const plugin = EDITOR_PLUGINS.find(p => p.type === file.type);
                const Icon = plugin?.icon || File;
                return (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    draggable
                    onDragStart={(e) => handleFileDragStart(e, file.id, file.name)}
                    onDragEnd={handleFileDragEnd}
                    className={`group relative w-full flex items-start gap-2 px-2 py-2 rounded-lg text-sm transition-colors border cursor-grab active:cursor-grabbing ${activeFileId === file.id ? 'bg-accent/10 text-content border-accent/50' : 'text-content hover:text-content hover:bg-surface-hover border-border'}`}
                    title={`Drag to create link to ${file.name}`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${activeFileId === file.id ? 'text-accent' : 'text-faint'}`} />
                    <span className="min-w-0 flex-1 break-words leading-snug text-left">{file.name}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); handleCopyFileId(file.id); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-accent hover:bg-surface-hover rounded border border-border bg-surface/95 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                      title="Copy File ID"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="my-3 border-t border-border" />
            <Eyebrow className="block px-2 pb-1.5">Project files</Eyebrow>
          </div>
        )}

        {/* Tree */}
        <div
          className={`p-3 flex-1 overflow-y-auto custom-scrollbar transition-colors ${activeDropFolderId === 'root' ? 'bg-accent/5 ring-1 ring-inset ring-accent/30 rounded-lg' : ''}`}
          onDragOver={handleRootDragOver}
          onDrop={handleRootDrop}
        >
          {renderFileTree(null)}

          {nonSystemFileCount === 0 && activeProject.folders.length === 0 && (
              <div className="text-center py-8 text-faint text-xs italic">
                  Project is empty. Create a file or folder to get started.
              </div>
          )}
        </div>

        <div className="p-4 border-t border-border space-y-1">
             <button onClick={openSettings} className="flex items-center gap-3 px-3 py-2 text-faint hover:text-content hover:bg-surface-hover rounded-lg w-full transition-colors">
                <SettingsIcon className="w-4 h-4" />
                <span className="text-sm">Settings</span>
             </button>
             <button onClick={() => setIsHelpOpen(true)} className="flex items-center gap-3 px-3 py-2 text-faint hover:text-content hover:bg-surface-hover rounded-lg w-full transition-colors">
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm">Guide & Help</span>
             </button>
        </div>
      </aside>
    );
  };

  return (
    <div className="flex h-screen bg-bg text-content font-sans overflow-hidden">
      {renderSidebar()}
      <main className="flex-1 flex flex-col min-w-0 bg-bg">
        <div className="flex-1 overflow-hidden relative">
          {currentView === ViewState.DASHBOARD ? (
            showGuide ? (
              <GuideView initialSection={guideSection} />
            ) : (
            <Dashboard
              projects={projects}
              onSelectProject={handleSelectProject}
              onCreateProject={handleCreateProject}
              onUpdateProject={handleUpdateProject}
              onOpenWhatsNew={() => openGuideSection('updates')}
              onLinkProjectToFolder={handleLinkProjectToLocalFolder}
              onExportProject={handleExportProject} 
              onDeleteProject={handleDeleteProject}
              onImportFolder={handleImportLocalFolder}
            />
            )
          ) : (
            <div className="h-full flex flex-col">
              {renderFileTabs()}
              <div className="flex-1 min-h-0 overflow-hidden relative">
            {activeProject && activeFile && activeEditorPlugin ? (
                <React.Suspense fallback={<EditorLoadingFallback fileName={activeFile.name} />}>
                  {React.createElement(activeEditorPlugin.component, {
                    key: activeFile.id,
                    fileName: activeFile.name,
                    initialContent: activeFile.content,
                    onSave: (content: any) => updateFileContent(activeFile.id, content),
                    assets: activeProject.assets || {},
                    onAddAsset: handleAddAsset,
                    onDeleteAsset: handleDeleteAsset,
                    projectFiles: activeProject.files,
                    activeFileId,
                    onOpenFile: handleOpenFileFromLink,
                    onOpenTask: handleOpenTaskFromLink,
                    taskNavigationTarget: taskNavigationTarget?.fileId === activeFile.id ? taskNavigationTarget : null,
                    onTaskNavigationHandled: () => setTaskNavigationTarget(null)
                  })}
                </React.Suspense>
            ) : (
              <div className="h-full flex items-center justify-center p-6">
                <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl p-6 shadow-raised">
                  <Eyebrow className="block mb-2">No file open</Eyebrow>
                  <div className="flex items-center gap-3 mb-5">
                    <File className="w-7 h-7 text-faint" />
                    <div>
                      <h3 className="font-display text-xl font-semibold text-content">Pick up where you left off</h3>
                      <p className="text-sm text-muted">Open an existing file or start a new one.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    <button onClick={() => openCreateFileModal(null, 'doc')} className="px-4 py-3 rounded-lg bg-surface-raised border border-border text-left hover:border-accent/40 hover:bg-surface-hover transition-colors">
                      <p className="text-sm font-medium text-content">New Document</p>
                      <p className="text-xs text-faint mt-1">Write specs and notes.</p>
                    </button>
                    <button onClick={() => openCreateFileModal(null, 'whiteboard')} className="px-4 py-3 rounded-lg bg-surface-raised border border-border text-left hover:border-accent/40 hover:bg-surface-hover transition-colors">
                      <p className="text-sm font-medium text-content">New Whiteboard</p>
                      <p className="text-xs text-faint mt-1">Sketch ideas visually.</p>
                    </button>
                    <button onClick={() => openCreateFileModal(null, 'flowchart')} className="px-4 py-3 rounded-lg bg-surface-raised border border-border text-left hover:border-accent/40 hover:bg-surface-hover transition-colors">
                      <p className="text-sm font-medium text-content">New Flowchart</p>
                      <p className="text-xs text-faint mt-1">Map systems and logic.</p>
                    </button>
                  </div>

                  <div className="border-t border-border pt-4">
                    <Eyebrow className="block mb-2">Open existing</Eyebrow>
                    {quickOpenFiles.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {quickOpenFiles.map(file => (
                          <button key={file.id} onClick={() => setActiveFileId(file.id)} className="px-3 py-2 rounded-md bg-surface-raised border border-border text-muted hover:text-content hover:bg-surface-hover text-left truncate transition-colors">
                            {file.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-faint">No files yet. Use one of the create actions above.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
              </div>
            </div>
          )}
        </div>

        <CommandPalette 
            isOpen={isPaletteOpen} 
            onClose={() => setIsPaletteOpen(false)}
            projects={projects}
            activeProject={activeProject}
            onSelectFile={(id) => { setActiveFileId(id); }}
            onSelectProject={handleSelectProject}
            onCreateFile={(type) => openCreateFileModal(null, type)} // Hook palette to new modal
        />
        
        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

        <SettingsModal />

        {/* Rename File Modal */}
        <Modal
          open={renameFileModal.open}
          onClose={closeRenameFileModal}
          title="Rename file"
          size="sm"
          footer={
            <>
              <Button variant="ghost" type="button" onClick={closeRenameFileModal}>Cancel</Button>
              <Button variant="primary" type="submit" form="rename-file-form">Save</Button>
            </>
          }
        >
          <form id="rename-file-form" onSubmit={handleConfirmRenameFile} className="space-y-4">
            <Field label="File Name" htmlFor="rename-file-name">
              <Input
                id="rename-file-name"
                autoFocus
                required
                value={renameFileModal.name}
                onChange={e => setRenameFileModal(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Combat Notes"
              />
            </Field>
          </form>
        </Modal>

        {/* Create File Modal */}
        <Modal
          open={createFileModal.open}
          onClose={() => setCreateFileModal({ open: false, folderId: null })}
          title="New file"
          size="sm"
          footer={
            <>
              <Button variant="ghost" type="button" onClick={() => setCreateFileModal({ open: false, folderId: null })}>Cancel</Button>
              <Button variant="primary" type="submit" form="create-file-form">Create File</Button>
            </>
          }
        >
          <form id="create-file-form" onSubmit={handleConfirmCreateFile} className="space-y-4">
            <Field label="Name" htmlFor="create-file-name">
              <Input
                id="create-file-name"
                autoFocus
                required
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                placeholder="e.g. Character Specs"
              />
            </Field>
            <Field label="Type" htmlFor="create-file-type">
              <Select
                id="create-file-type"
                value={newFileType}
                onChange={e => setNewFileType(e.target.value as FileType)}
              >
                {EDITOR_PLUGINS.filter(p => canCreateFileType(p.type as FileType, activeProject)).map(p => (
                  <option key={p.type} value={p.type}>{p.label}</option>
                ))}
              </Select>
            </Field>
          </form>
        </Modal>
      </main>
    </div>
  );
};

export default App;
