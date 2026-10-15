import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Files, Search, ChevronsUpDown, X, BookOpen, FilePlus2, FolderPlus, PanelLeft, PanelRight, ArrowLeft, ArrowRight,
  Pencil, Trash2, Link2, Crosshair, Pin, Settings as SettingsIcon, HelpCircle, LayoutGrid, Download, LogOut, Users,
  SunMoon, ListTree, FileSearch, Waypoints, CalendarDays, Bookmark, Hash, FileInput,
} from 'lucide-react';
import JSZip from 'jszip';
import Dashboard from './components/Dashboard';
import CommandPalette, { PaletteCommand, PaletteMode } from './components/CommandPalette';
import HelpModal from './components/HelpModal';
import GuideView, { GuideSectionId } from './components/GuideView';
import { Project, ViewState, ProjectFile, FileType, EditorProps, ProjectFolder, TaskNavigationTarget } from './types';
import { useProjectStore } from './stores/useProjectStore';
import { api, setUnauthorizedHandler, getAuthToken, PersistedAppState } from './services/api';
import { useAuthStore } from './stores/useAuthStore';
import { confirmDialog, promptDialog, toast, useUiStore } from './stores/useUiStore';
import { showMenu, MenuEntry } from './stores/useMenuStore';
import { useThemeStore } from './stores/useThemeStore';
import AuthView from './components/AuthView';
import AdminUsersModal from './components/AdminUsersModal';
import { UiFeedback, cn } from './components/ui';
import { SettingsModal } from './components/SettingsModal';
import { useSettingsStore } from './stores/useSettingsStore';
import { getFileTypeMeta, SINGLE_INSTANCE_FILE_TYPES, MANDATORY_SINGLETON_FILES, GRAPH_VIEW_ID } from './components/fileTypes';
import { resolveWikilink, renameWikilinks, extractTags, applyTemplateVariables, formatDate } from './utils/markdown';
import { INSERT_TEXT_EVENT, InsertTextDetail } from './utils/events';
import {
  normalizeProject, createProjectFile, uniqueName, folderChain, descendantFolderIds, STARTER_PROJECT,
} from './utils/projectModel';
import { uid } from './utils/id';
import { useWorkspaceTabs, PersistedLeaf } from './hooks/useWorkspaceTabs';
import Ribbon from './components/shell/Ribbon';
import FileExplorer, { RenameTarget, CREATABLE_TYPES } from './components/shell/FileExplorer';
import SearchPanel from './components/shell/SearchPanel';
import RightSidebar, { RightTab } from './components/shell/RightSidebar';
import TabBar, { TabItem } from './components/shell/TabBar';
import ViewHeader from './components/shell/ViewHeader';
import StatusBar, { SaveState } from './components/shell/StatusBar';
import EmptyView from './components/shell/EmptyView';
import ResizeHandle from './components/shell/ResizeHandle';
import EditorErrorBoundary from './components/shell/EditorErrorBoundary';
import { BookmarksPanel, TagsPanel } from './components/shell/SidePanels';

const DocEditor = React.lazy(() => import('./components/DocEditor'));
const FlowchartEditor = React.lazy(() => import('./components/FlowchartEditor'));
const TodoEditor = React.lazy(() => import('./components/TodoEditor'));
const KanbanBoard = React.lazy(() => import('./components/KanbanBoard'));
const RoadmapEditor = React.lazy(() => import('./components/RoadmapEditor'));
const DataGridEditor = React.lazy(() => import('./components/DataGridEditor'));
const WhiteboardEditor = React.lazy(() => import('./components/WhiteboardEditor'));
const AssetBrowser = React.lazy(() => import('./components/AssetBrowser'));
const BaseEditor = React.lazy(() => import('./components/BaseEditor'));
const CanvasEditor = React.lazy(() => import('./components/CanvasEditor'));
const VectorEditor = React.lazy(() => import('./components/VectorEditor'));
const GraphView = React.lazy(() => import('./components/GraphView'));

// Persistence is handled by the backend API (see services/api.ts) behind
// username/password auth. Nothing project-related is stored in the browser.

const EDITORS: Record<string, React.LazyExoticComponent<React.FC<EditorProps>>> = {
  doc: DocEditor,
  flowchart: FlowchartEditor,
  todo: TodoEditor,
  kanban: KanbanBoard,
  roadmap: RoadmapEditor,
  grid: DataGridEditor,
  whiteboard: WhiteboardEditor,
  'asset-gallery': AssetBrowser,
  base: BaseEditor,
  canvas: CanvasEditor,
  vector: VectorEditor,
};

type LeftTab = 'files' | 'search' | 'bookmarks' | 'tags';

/** The graph view opens in a tab like a file, but isn't stored in the project. */
const GRAPH_FILE: ProjectFile = { id: GRAPH_VIEW_ID, name: 'Graph view', type: 'graph', content: null, folderId: null };

const DOCK = {
  left: { key: 'devarchitect-left-width', fallback: 264 },
  right: { key: 'devarchitect-right-width', fallback: 280 },
  min: 200,
  max: 480,
};
const RIGHT_TAB_KEY = 'devarchitect-right-tab';
const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 5000;

const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch { /* storage unavailable — in-memory only */ }
};
const readWidth = (key: string, fallback: number) => {
  const n = Number(readStored(key));
  return Number.isFinite(n) && n >= DOCK.min && n <= DOCK.max ? n : fallback;
};

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const EditorLoadingFallback = () => (
  <div className="flex h-full items-center justify-center bg-bg">
    <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-hover">
      <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/60" />
    </div>
  </div>
);

/** The first file worth showing when a project opens. */
const defaultFileOf = (project: Project): string | null =>
  (project.files.find(f => f.type === 'doc') || project.files.find(f => !SINGLE_INSTANCE_FILE_TYPES.has(f.type)) || project.files[0])?.id ?? null;

const App: React.FC = () => {
  const projects = useProjectStore(state => state.projects);
  const isLoaded = useProjectStore(state => state.isLoaded);
  const currentView = useProjectStore(state => state.currentView);
  const activeProjectId = useProjectStore(state => state.activeProjectId);
  const setProjects = useProjectStore(state => state.setProjects);
  const setIsLoaded = useProjectStore(state => state.setIsLoaded);
  const setCurrentView = useProjectStore(state => state.setCurrentView);
  const setActiveProjectId = useProjectStore(state => state.setActiveProjectId);

  const openSettings = useSettingsStore(state => state.openSettings);
  const toggleTheme = useThemeStore(state => state.toggle);

  const authUser = useAuthStore(state => state.user);
  const authReady = useAuthStore(state => state.ready);
  const clearSession = useAuthStore(state => state.clearSession);
  const logout = useAuthStore(state => state.logout);

  const tabs = useWorkspaceTabs();
  const activeFileId = tabs.activeFileId;

  const isMobile = useMediaQuery('(max-width: 767px)');

  const [paletteMode, setPaletteMode] = useState<PaletteMode | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showAdminUsers, setShowAdminUsers] = useState(false);
  const [guide, setGuide] = useState<{ open: boolean; section: GuideSectionId }>({ open: false, section: 'overview' });

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('files');
  const [rightTab, setRightTabState] = useState<RightTab>(() => {
    const stored = readStored(RIGHT_TAB_KEY);
    return stored === 'links' || stored === 'info' ? stored : 'outline';
  });
  const [leftWidth, setLeftWidth] = useState(() => readWidth(DOCK.left.key, DOCK.left.fallback));
  const [rightWidth, setRightWidth] = useState(() => readWidth(DOCK.right.key, DOCK.right.fallback));

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [pendingTitleRename, setPendingTitleRename] = useState<string | null>(null);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [revealRequest, setRevealRequest] = useState<{ fileId: string; nonce: number } | null>(null);
  const [taskNavigationTarget, setTaskNavigationTarget] = useState<TaskNavigationTarget | null>(null);
  const [recentFileIds, setRecentFileIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [searchRequest, setSearchRequest] = useState<{ query: string; nonce: number } | null>(null);
  /** Bookmarked file ids per project (persisted in per-user app state). */
  const [bookmarks, setBookmarks] = useState<Record<string, string[]>>({});
  const prefs = useUiStore(state => state.prefs);

  const projectsRef = useRef<Project[]>([]);
  const persistedProjectsRef = useRef<Project[]>([]);
  const taskNavigationRequestRef = useRef(0);
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());
  projectsRef.current = projects;

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeFile = activeFileId === GRAPH_VIEW_ID && activeProject ? GRAPH_FILE : activeProject?.files.find(f => f.id === activeFileId);
  const activeLeaf = tabs.leaves.find(l => l.id === tabs.activeLeafId);
  const inProject = currentView === ViewState.PROJECT && Boolean(activeProject);

  // --- Session ---------------------------------------------------------------

  // Verify the stored session token once on boot.
  useEffect(() => {
    useAuthStore.getState().bootstrap();
  }, []);

  // Any 401 with a live token means the session expired — drop to login.
  useEffect(() => {
    setUnauthorizedHandler(() => clearSession());
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // --- Persistence -----------------------------------------------------------

  // Persist only projects that actually changed since the last save. Mutations
  // always produce new project objects, so reference equality is sufficient.
  // Saves are debounced and coalesced per project since editors save per keystroke.
  const pendingSavesRef = useRef<Map<string, Project>>(new Map());
  const saveTimerRef = useRef<number | null>(null);

  const flushPendingSaves = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const batch = Array.from(pendingSavesRef.current.values());
    pendingSavesRef.current.clear();
    const token = getAuthToken();
    if (batch.length === 0 || !token) return;
    setSaveState('saving');
    const results = await Promise.allSettled(batch.map(p => api.saveProject(p)));
    // Signed out (or switched accounts) mid-flight: drop everything.
    if (getAuthToken() !== token) return;
    let failed = false;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') return;
      const project = batch[i];
      console.error('Failed to save project:', project.id, result.reason);
      // Re-queue unless a newer edit superseded it or the project was deleted.
      if (!deletedProjectIdsRef.current.has(project.id) && !pendingSavesRef.current.has(project.id)) {
        pendingSavesRef.current.set(project.id, project);
        failed = true;
      }
    });
    if (failed) {
      setSaveState('error');
      saveTimerRef.current = window.setTimeout(() => { void flushPendingSaves(); }, SAVE_RETRY_MS);
    } else {
      setSaveState(pendingSavesRef.current.size > 0 ? 'pending' : 'saved');
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!authUser) {
      // Signed out — drop in-memory data so nothing leaks between sessions.
      persistedProjectsRef.current = [];
      pendingSavesRef.current.clear();
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setProjects([]);
      setIsLoaded(false);
      setCurrentView(ViewState.DASHBOARD);
      setActiveProjectId(null);
      tabs.resetTabs([], -1);
      setSaveState('saved');
      return;
    }
    // A sign-out (or a different account) while loading must not apply stale data.
    let cancelled = false;
    const load = async () => {
      try {
        const [loaded, savedAppState] = await Promise.all([api.listProjects(), api.loadAppState()]);
        if (cancelled) return;
        const normalizedLoaded = loaded.map(normalizeProject);
        // When the database is empty, seed the starter project. The diff-save
        // effect below persists it on first run.
        const hydratedProjects = normalizedLoaded.length > 0 ? normalizedLoaded : [normalizeProject({ ...STARTER_PROJECT, lastModified: Date.now() })];
        persistedProjectsRef.current = normalizedLoaded;
        setProjects(hydratedProjects);

        const project = savedAppState?.activeProjectId
          ? hydratedProjects.find(p => p.id === savedAppState.activeProjectId)
          : undefined;

        if (project && savedAppState?.currentView === ViewState.PROJECT) {
          const exists = (id: string | null) => !id || id === GRAPH_VIEW_ID || project.files.some(f => f.id === id);
          let saved: PersistedLeaf[] = (savedAppState.tabs || []).filter(t => exists(t.fileId));
          let activeIndex = savedAppState.activeTabIndex ?? 0;
          if (saved.length === 0) {
            const fileId = savedAppState.activeFileId && exists(savedAppState.activeFileId) ? savedAppState.activeFileId : defaultFileOf(project);
            saved = fileId ? [{ fileId, pinned: false }] : [];
            activeIndex = 0;
          }
          setCurrentView(ViewState.PROJECT);
          setActiveProjectId(project.id);
          tabs.resetTabs(saved, activeIndex);
        } else {
          setCurrentView(ViewState.DASHBOARD);
          setActiveProjectId(null);
          tabs.resetTabs([], -1);
        }
        setBookmarks(savedAppState?.bookmarks && typeof savedAppState.bookmarks === 'object' ? savedAppState.bookmarks : {});
        // Docked by default — only a persisted `false` keeps it hidden.
        setLeftOpen(!window.matchMedia('(max-width: 767px)').matches && savedAppState?.filePanelOpen !== false);
        setRightOpen(!window.matchMedia('(max-width: 767px)').matches && savedAppState?.rightPanelOpen === true);
      } catch (e) {
        if (cancelled) return;
        console.error('Init error', e);
        setLoadError('Could not reach the backend API. Start the server (docker compose up) and reload.');
        setProjects([]);
        setCurrentView(ViewState.DASHBOARD);
        setActiveProjectId(null);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
    // tabs.resetTabs is stable; re-running on its identity would reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser, setActiveProjectId, setCurrentView, setIsLoaded, setProjects]);

  useEffect(() => {
    if (!isLoaded) return;
    const persistedById = new Map(persistedProjectsRef.current.map(p => [p.id, p]));
    projects.forEach(p => {
      if (persistedById.get(p.id) !== p) pendingSavesRef.current.set(p.id, p);
    });
    persistedProjectsRef.current = projects;
    if (pendingSavesRef.current.size === 0) return;
    setSaveState(prev => (prev === 'error' ? prev : 'pending'));
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushPendingSaves();
    }, SAVE_DEBOUNCE_MS);
  }, [projects, isLoaded, flushPendingSaves]);

  // Flush queued writes when the tab is hidden or the app unmounts, and warn
  // before closing the page with unsaved edits.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushPendingSaves();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSavesRef.current.size === 0) return;
      void flushPendingSaves();
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flushPendingSaves();
    };
  }, [flushPendingSaves]);

  // Session layout (view, project, tabs, docks) — debounced, it changes often.
  const persistedTabs = tabs.toPersisted();
  const appStateKey = JSON.stringify([currentView, activeProjectId, activeFileId, leftOpen, rightOpen, persistedTabs, bookmarks]);
  useEffect(() => {
    if (!isLoaded || !authUser) return;
    const state: PersistedAppState = {
      currentView,
      activeProjectId,
      activeFileId,
      filePanelOpen: leftOpen,
      rightPanelOpen: rightOpen,
      tabs: persistedTabs.tabs,
      activeTabIndex: persistedTabs.activeIndex,
      bookmarks,
    };
    const handle = window.setTimeout(() => {
      api.saveAppState(state).catch(err => console.error('Failed to save app state:', err));
    }, 500);
    return () => window.clearTimeout(handle);
    // appStateKey captures every field above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, authUser, appStateKey]);

  // --- Workspace bookkeeping -------------------------------------------------

  useEffect(() => {
    setTaskNavigationTarget(null);
    setRecentFileIds([]);
    setRenaming(null);
  }, [activeProjectId]);

  // Tabs/history never point at files that no longer exist.
  const activeFiles = activeProject?.files;
  useEffect(() => {
    if (!activeFiles) return;
    const ids = new Set(activeFiles.map(f => f.id));
    tabs.pruneMissing(id => id === GRAPH_VIEW_ID || ids.has(id));
    setRecentFileIds(prev => (prev.every(id => ids.has(id)) ? prev : prev.filter(id => ids.has(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFiles]);

  useEffect(() => {
    if (!activeFileId) return;
    setRecentFileIds(prev => [activeFileId, ...prev.filter(id => id !== activeFileId)].slice(0, 20));
  }, [activeFileId]);

  const setRightTab = (tab: RightTab) => {
    setRightTabState(tab);
    writeStored(RIGHT_TAB_KEY, tab);
  };

  const resizeLeft = (width: number) => { setLeftWidth(width); writeStored(DOCK.left.key, String(width)); };
  const resizeRight = (width: number) => { setRightWidth(width); writeStored(DOCK.right.key, String(width)); };

  // --- Project state ---------------------------------------------------------

  const updateProjectState = useCallback((updatedProject: Project) => {
    const normalized = normalizeProject(updatedProject);
    setProjects(prev => {
      const next = prev.map(p => (p.id === normalized.id ? normalized : p));
      projectsRef.current = next;
      return next;
    });
  }, [setProjects]);

  const getActiveProject = () => projectsRef.current.find(p => p.id === activeProjectId);

  const enterProject = (project: Project) => {
    setActiveProjectId(project.id);
    setCurrentView(ViewState.PROJECT);
    setGuide(g => ({ ...g, open: false }));
    const fileId = defaultFileOf(project);
    tabs.resetTabs(fileId ? [{ fileId, pinned: false }] : [], 0);
    if (!isMobile) setLeftOpen(true);
  };

  const handleSelectProject = (id: string) => {
    const project = projectsRef.current.find(p => p.id === id);
    if (project) enterProject(project);
  };

  const goToDashboard = () => {
    setGuide(g => ({ ...g, open: false }));
    setActiveProjectId(null);
    setCurrentView(ViewState.DASHBOARD);
    tabs.resetTabs([], -1);
  };

  const handleCreateProject = (name: string, type: Project['type'], description = '') => {
    const trimmedName = name.trim();
    const readme = `# ${trimmedName}\n\n${description.trim() || 'Project overview, goals, and links.'}\n`;
    const newProject = normalizeProject({
      id: uid(),
      name: trimmedName,
      type,
      description: description.trim(),
      lastModified: Date.now(),
      files: [createProjectFile('doc', 'Readme', null, readme)],
      folders: [],
      assets: {},
    });
    setProjects(prev => {
      const next = [newProject, ...prev];
      projectsRef.current = next;
      return next;
    });
    enterProject(newProject);
  };

  const handleUpdateProject = (id: string, updates: { name: string; description: string }) => {
    const project = projectsRef.current.find(p => p.id === id);
    if (!project) return;
    const trimmedName = updates.name.trim();
    if (!trimmedName) {
      toast.error('Project name is required.');
      return;
    }
    updateProjectState({ ...project, name: trimmedName, description: updates.description.trim(), lastModified: Date.now() });
  };

  const handleRenameProject = async () => {
    const project = getActiveProject();
    if (!project) return;
    const name = await promptDialog({ title: 'Rename project', label: 'Project name', defaultValue: project.name, confirmText: 'Rename' });
    if (name) handleUpdateProject(project.id, { name, description: project.description });
  };

  const handleDeleteProject = async (id: string) => {
    const project = projectsRef.current.find(p => p.id === id);
    if (!project) return;
    const confirmed = await confirmDialog({
      title: `Delete "${project.name}"?`,
      message: 'This permanently deletes the project and every file inside it. This cannot be undone.',
      confirmText: 'Delete project',
      danger: true,
    });
    if (!confirmed) return;

    // Drop any queued debounced save first so the upsert can't resurrect it.
    deletedProjectIdsRef.current.add(id);
    pendingSavesRef.current.delete(id);
    try {
      await api.deleteProject(id);
    } catch (err) {
      console.error('Failed to delete project:', err);
      deletedProjectIdsRef.current.delete(id);
      toast.error('Failed to delete the project on the server.');
      return;
    }
    setProjects(prev => prev.filter(p => p.id !== id));
    persistedProjectsRef.current = persistedProjectsRef.current.filter(p => p.id !== id);
    setBookmarks(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeProjectId === id) goToDashboard();
    toast.success(`Deleted "${project.name}".`);
  };

  const handleExportProject = async (project: Project) => {
    try {
      const zip = new JSZip();
      zip.file('project.json', JSON.stringify({ ...project, assets: {} }, null, 2));
      const assetsFolder = zip.folder('assets');
      if (project.assets && assetsFolder) {
        Object.entries(project.assets).forEach(([id, dataUrl]) => {
          const comma = dataUrl.indexOf(',');
          if (!dataUrl.startsWith('data:') || comma < 0) return;
          const meta = dataUrl.slice(5, comma); // e.g. "image/png;base64"
          const isBase64 = meta.endsWith(';base64');
          const ext = (meta.split(';')[0].split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
          const payload = dataUrl.slice(comma + 1);
          assetsFolder.file(`${id}.${ext}`, isBase64 ? payload : decodeURIComponent(payload), { base64: isBase64 });
        });
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^\w.-]+/g, '_') || 'project'}.zip`;
      a.click();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Could not export the project.');
    }
  };

  const handleLogout = async () => {
    // Flush queued saves while the session token is still valid.
    await flushPendingSaves();
    await logout();
  };

  // --- Files & folders -------------------------------------------------------

  const isProtectedFile = (file: ProjectFile) => SINGLE_INSTANCE_FILE_TYPES.has(file.type) || file.id === GRAPH_VIEW_ID;

  const expandChain = (folderId: string | null | undefined) => {
    const project = getActiveProject();
    if (!project || !folderId) return;
    const chain = folderChain(project.folders, folderId);
    if (chain.length === 0) return;
    setExpandedFolders(prev => {
      const next = new Set(prev);
      chain.forEach(f => next.add(f.id));
      return next;
    });
  };

  const openFile = (fileId: string, mode: 'current' | 'new-tab' = 'current') => {
    setTaskNavigationTarget(null);
    setGuide(g => (g.open ? { ...g, open: false } : g));
    tabs.openFile(fileId, mode);
    if (isMobile) setLeftOpen(false);
  };

  const handleOpenFileFromLink = (fileId: string) => {
    if (!getActiveProject()?.files.some(f => f.id === fileId)) {
      toast.error('Linked file was not found in this project.');
      return;
    }
    openFile(fileId);
  };

  const handleOpenTaskFromLink = (fileId: string, taskId: string) => {
    const file = getActiveProject()?.files.find(f => f.id === fileId);
    const items = (file?.content as { items?: Array<{ id?: string }> } | undefined)?.items;
    if (!file || file.type !== 'todo' || !Array.isArray(items) || !items.some(item => item?.id === taskId)) {
      toast.error('Linked task was not found in this project.');
      return;
    }
    openFile(fileId);
    taskNavigationRequestRef.current += 1;
    setTaskNavigationTarget({ fileId, taskId, requestKey: taskNavigationRequestRef.current });
  };

  const createFile = (type: FileType, folderId: string | null = null, name?: string, content?: string) => {
    const project = getActiveProject();
    if (!project) return;
    if (SINGLE_INSTANCE_FILE_TYPES.has(type)) {
      const existing = project.files.find(f => f.type === type);
      if (existing) openFile(existing.id);
      return;
    }
    const meta = getFileTypeMeta(type);
    const siblings = project.files.filter(f => (f.folderId || null) === folderId).map(f => f.name);
    const finalName = name?.trim() || uniqueName(type === 'doc' ? 'Untitled' : `Untitled ${meta.label.toLowerCase()}`, siblings);
    const file = createProjectFile(type, finalName, folderId, content);
    updateProjectState({ ...project, lastModified: Date.now(), files: [...project.files, file] });
    expandChain(folderId);
    openFile(file.id);
    // Obsidian-style: a fresh untitled file starts with its title in edit mode.
    if (!name) setPendingTitleRename(file.id);
  };

  /** Search panel with a query (tags open here). */
  const searchFor = (query: string) => {
    setLeftOpen(true);
    setLeftTab('search');
    setSearchRequest(prev => ({ query, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  /** Every link in the app funnels through here (editors, reading view, canvas, graph). */
  const openHref = (href: string, newTab = false) => {
    const mode = newTab ? 'new-tab' : 'current';
    const decode = (value: string) => {
      try { return decodeURIComponent(value); } catch { return value; }
    };
    if (href.startsWith('file://')) {
      const id = href.slice('file://'.length);
      if (getActiveProject()?.files.some(f => f.id === id)) openFile(id, mode);
      else toast.error('Linked file was not found in this project.');
    } else if (href.startsWith('task://')) {
      const [fileId, taskId] = href.slice('task://'.length).split('/');
      if (fileId && taskId) handleOpenTaskFromLink(fileId, taskId);
    } else if (href.startsWith('wikilink:')) {
      const target = decode(href.slice('wikilink:'.length).split('#')[0]).trim();
      const project = getActiveProject();
      if (!project || !target) return;
      const file = resolveWikilink(target, project.files);
      if (file) openFile(file.id, mode);
      else {
        // Following a link to a note that doesn't exist yet creates it.
        const name = target.split('/').pop()!.trim();
        createFile('doc', null, name, `# ${name}\n\n`);
        toast.success(`Created "${name}".`);
      }
    } else if (href.startsWith('tag:')) {
      const tag = decode(href.slice('tag:'.length)).replace(/^#/, '');
      searchFor(`#${tag}`);
    } else if (/^(https?:|mailto:)/i.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  const ensureRootFolder = (project: Project, name: string): { project: Project; folderId: string } => {
    const existing = project.folders.find(f => f.parentId === null && f.name.toLowerCase() === name.toLowerCase());
    if (existing) return { project, folderId: existing.id };
    const folder: ProjectFolder = { id: uid(), name, parentId: null };
    return { project: { ...project, folders: [...project.folders, folder] }, folderId: folder.id };
  };

  const templateDocs = (project: Project | undefined) => {
    if (!project) return [];
    const folder = project.folders.find(f => f.name.toLowerCase() === prefs.templatesFolder.toLowerCase());
    return folder ? project.files.filter(f => f.type === 'doc' && f.folderId === folder.id && typeof f.content === 'string') : [];
  };

  /** Obsidian's core Daily notes: one document per day in a dedicated folder. */
  const openDailyNote = () => {
    const project = getActiveProject();
    if (!project) return;
    const today = formatDate(new Date());
    const { project: withFolder, folderId } = ensureRootFolder(project, prefs.dailyNotesFolder);
    const existing = withFolder.files.find(f => f.type === 'doc' && f.folderId === folderId && f.name === today);
    if (existing) {
      openFile(existing.id);
      return;
    }
    const template = templateDocs(withFolder).find(f => /daily/i.test(f.name));
    const content = template ? applyTemplateVariables(template.content as string, today) : `# ${today}\n\n`;
    const file = createProjectFile('doc', today, folderId, content);
    updateProjectState({ ...withFolder, lastModified: Date.now(), files: [...withFolder.files, file] });
    expandChain(folderId);
    openFile(file.id);
  };

  const insertTemplate = (templateId: string) => {
    const project = getActiveProject();
    const template = project?.files.find(f => f.id === templateId);
    if (!template || typeof template.content !== 'string' || !activeFile || activeFile.type !== 'doc') return;
    const detail: InsertTextDetail = { fileId: activeFile.id, text: applyTemplateVariables(template.content, activeFile.name) };
    window.dispatchEvent(new CustomEvent(INSERT_TEXT_EVENT, { detail }));
  };

  const projectBookmarks = activeProjectId ? bookmarks[activeProjectId] || [] : [];
  const toggleBookmark = (fileId: string) => {
    if (!activeProjectId) return;
    setBookmarks(prev => {
      const list = prev[activeProjectId] || [];
      const next = list.includes(fileId) ? list.filter(id => id !== fileId) : [...list, fileId];
      return { ...prev, [activeProjectId]: next };
    });
  };

  const createFolder = (parentId: string | null) => {
    const project = getActiveProject();
    if (!project) return;
    const siblings = project.folders.filter(f => f.parentId === parentId).map(f => f.name);
    const folder: ProjectFolder = { id: uid(), name: uniqueName('Untitled folder', siblings), parentId };
    updateProjectState({ ...project, lastModified: Date.now(), folders: [...project.folders, folder] });
    expandChain(parentId);
    setLeftOpen(true);
    setLeftTab('files');
    setRenaming({ kind: 'folder', id: folder.id });
  };

  const renameFile = (fileId: string, name: string) => {
    const project = getActiveProject();
    const file = project?.files.find(f => f.id === fileId);
    const trimmed = name.trim();
    if (!project || !file || !trimmed || file.name === trimmed) return;
    if (isProtectedFile(file)) {
      toast.info(`${file.name} is a project system and can't be renamed.`);
      return;
    }
    // Obsidian-style: [[Old name]] links everywhere follow the rename.
    let updatedLinks = 0;
    const rewrite = (text: string) => {
      const next = renameWikilinks(text, file.name, trimmed);
      if (next !== text) updatedLinks += 1;
      return next;
    };
    const files = project.files.map(f => {
      if (f.id === fileId) return { ...f, name: trimmed };
      if (f.type === 'doc' && typeof f.content === 'string' && f.content.includes('[[')) {
        const content = rewrite(f.content);
        return content === f.content ? f : { ...f, content };
      }
      if (f.type === 'canvas' && Array.isArray(f.content?.nodes)) {
        const before = updatedLinks;
        const nodes = f.content.nodes.map((n: { text?: string }) => (typeof n.text === 'string' ? { ...n, text: rewrite(n.text) } : n));
        return updatedLinks === before ? f : { ...f, content: { ...f.content, nodes } };
      }
      if (f.type === 'base' && Array.isArray(f.content?.rows)) {
        const before = updatedLinks;
        const rows = f.content.rows.map((r: { notes?: string }) => (typeof r.notes === 'string' ? { ...r, notes: rewrite(r.notes) } : r));
        return updatedLinks === before ? f : { ...f, content: { ...f.content, rows } };
      }
      return f;
    });
    updateProjectState({ ...project, lastModified: Date.now(), files });
    if (updatedLinks > 0) toast.info(`Updated links in ${updatedLinks} ${updatedLinks === 1 ? 'place' : 'places'}.`);
  };

  const renameFolder = (folderId: string, name: string) => {
    const project = getActiveProject();
    const trimmed = name.trim();
    if (!project || !trimmed) return;
    updateProjectState({ ...project, lastModified: Date.now(), folders: project.folders.map(f => (f.id === folderId ? { ...f, name: trimmed } : f)) });
  };

  const commitRename = (target: RenameTarget, name: string) => {
    setRenaming(null);
    if (target.kind === 'file') renameFile(target.id, name);
    else renameFolder(target.id, name);
  };

  const deleteFile = async (fileId: string) => {
    const project = getActiveProject();
    const file = project?.files.find(f => f.id === fileId);
    if (!project || !file) return;
    if (isProtectedFile(file)) {
      toast.info(`${file.name} is required in every project and can't be deleted.`);
      return;
    }
    const confirmed = await confirmDialog({
      title: `Delete "${file.name}"?`,
      message: 'This file will be permanently deleted.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const latest = getActiveProject();
    if (!latest) return;
    updateProjectState({ ...latest, lastModified: Date.now(), files: latest.files.filter(f => f.id !== fileId) });
  };

  const deleteFolder = async (folderId: string) => {
    const project = getActiveProject();
    if (!project) return;
    const folderIds = descendantFolderIds(project.folders, folderId);
    const fileCount = project.files.filter(f => f.folderId && folderIds.has(f.folderId)).length;
    const confirmed = await confirmDialog({
      title: 'Delete folder and contents?',
      message: `This will permanently delete ${folderIds.size} ${folderIds.size === 1 ? 'folder' : 'folders'} and ${fileCount} ${fileCount === 1 ? 'file' : 'files'}.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const latest = getActiveProject();
    if (!latest) return;
    updateProjectState({
      ...latest,
      lastModified: Date.now(),
      folders: latest.folders.filter(f => !folderIds.has(f.id)),
      files: latest.files.filter(f => !f.folderId || !folderIds.has(f.folderId)),
    });
    setExpandedFolders(prev => {
      const next = new Set(prev);
      folderIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const moveFile = (fileId: string, folderId: string | null) => {
    const project = getActiveProject();
    const file = project?.files.find(f => f.id === fileId);
    if (!project || !file || isProtectedFile(file) || (file.folderId || null) === folderId) return;
    updateProjectState({ ...project, lastModified: Date.now(), files: project.files.map(f => (f.id === fileId ? { ...f, folderId } : f)) });
    expandChain(folderId);
  };

  const moveFolder = (folderId: string, parentId: string | null) => {
    const project = getActiveProject();
    const folder = project?.folders.find(f => f.id === folderId);
    if (!project || !folder || folder.parentId === parentId) return;
    if (parentId && descendantFolderIds(project.folders, folderId).has(parentId)) {
      toast.info("A folder can't be moved inside itself.");
      return;
    }
    updateProjectState({ ...project, lastModified: Date.now(), folders: project.folders.map(f => (f.id === folderId ? { ...f, parentId } : f)) });
    expandChain(parentId);
  };

  const copyToClipboard = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error('Clipboard access was blocked by the browser.');
    }
  };

  const copyFileLink = (fileId: string) => {
    const file = getActiveProject()?.files.find(f => f.id === fileId);
    if (file) void copyToClipboard(`[${file.name}](file://${file.id})`, 'Link copied.');
  };
  const copyFileId = (fileId: string) => void copyToClipboard(fileId, 'File ID copied.');

  const revealFile = (fileId: string) => {
    const file = getActiveProject()?.files.find(f => f.id === fileId);
    if (!file) return;
    setLeftOpen(true);
    setLeftTab('files');
    expandChain(file.folderId);
    setRevealRequest(prev => ({ fileId, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const renameActiveFile = () => {
    if (activeFile && !isProtectedFile(activeFile)) setPendingTitleRename(activeFile.id);
  };

  // --- Assets & content ------------------------------------------------------

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result;
        if (typeof result === 'string') resolve(result);
        else reject(new Error('Failed to read file data.'));
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
      reader.onabort = () => reject(new Error('File read was aborted.'));
      reader.readAsDataURL(file);
    });

  const handleAddAsset = async (file: File): Promise<string> => {
    if (!activeProjectId) throw new Error('No active project');
    const dataUrl = await readFileAsDataUrl(file);
    const assetId = uid();
    const project = getActiveProject();
    if (!project) throw new Error('Active project not found');
    const updated = { ...project, lastModified: Date.now(), assets: { ...(project.assets || {}), [assetId]: dataUrl } };
    projectsRef.current = projectsRef.current.map(p => (p.id === updated.id ? updated : p));
    updateProjectState(updated);
    return `asset://${assetId}`;
  };

  const handleDeleteAsset = async (assetId: string) => {
    const project = getActiveProject();
    if (!project) return;
    const assets = { ...project.assets };
    delete assets[assetId];
    const updated = { ...project, lastModified: Date.now(), assets };
    projectsRef.current = projectsRef.current.map(p => (p.id === updated.id ? updated : p));
    updateProjectState(updated);
  };

  const updateFileContent = (fileId: string, content: any) => {
    const project = getActiveProject();
    if (!project || !fileId) return;
    const updated = { ...project, lastModified: Date.now(), files: project.files.map(f => (f.id === fileId ? { ...f, content } : f)) };
    projectsRef.current = projectsRef.current.map(p => (p.id === updated.id ? updated : p));
    updateProjectState(updated);
  };

  // --- Derived view data -----------------------------------------------------

  const folderPathOf = useCallback((file: ProjectFile) => {
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    return project ? folderChain(project.folders, file.folderId).map(f => f.name) : [];
  }, [activeProjectId]);

  const systemFiles = useMemo(() => {
    if (!activeProject) return [];
    const order = new Map(MANDATORY_SINGLETON_FILES.map((def, i) => [def.type, i]));
    return activeProject.files
      .filter(f => SINGLE_INSTANCE_FILE_TYPES.has(f.type))
      .sort((a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99));
  }, [activeProject]);

  const tabItems: TabItem[] = tabs.leaves.map(leaf => {
    const fileId = leaf.index >= 0 ? leaf.history[leaf.index] : null;
    const file = fileId === GRAPH_VIEW_ID ? GRAPH_FILE : activeProject?.files.find(f => f.id === fileId) ?? null;
    return { id: leaf.id, file, pinned: leaf.pinned };
  });

  const recentFiles = recentFileIds
    .map(id => activeProject?.files.find(f => f.id === id))
    .filter((f): f is ProjectFile => Boolean(f))
    .slice(0, 6);

  // --- Commands & shortcuts --------------------------------------------------

  const toggleLeft = () => setLeftOpen(open => !open);
  const toggleRight = () => setRightOpen(open => !open);
  const openSearch = () => {
    setLeftOpen(true);
    setLeftTab('search');
    setSearchFocusSignal(n => n + 1);
  };
  const openGuide = (section: GuideSectionId = 'overview') => setGuide({ open: true, section });

  const commands: PaletteCommand[] = [
    { id: 'switcher', group: 'Quick switcher', label: 'Open', hotkey: 'Ctrl O', icon: FileSearch, run: () => setPaletteMode('files') },
    ...(inProject ? [
      { id: 'new-doc', group: 'Files', label: 'New document', hotkey: 'Alt N', icon: FilePlus2, run: () => createFile('doc') },
      ...CREATABLE_TYPES.filter(t => t !== 'doc').map(type => ({
        id: `new-${type}`, group: 'Files', label: `New ${getFileTypeMeta(type).label.toLowerCase()}`, icon: getFileTypeMeta(type).icon, run: () => createFile(type),
      })),
      { id: 'new-folder', group: 'Files', label: 'New folder', icon: FolderPlus, run: () => createFolder(null) },
      ...(activeFile ? [
        ...(!isProtectedFile(activeFile) ? [
          { id: 'rename', group: 'Files', label: 'Rename current file', hotkey: 'F2', icon: Pencil, run: renameActiveFile },
          { id: 'delete', group: 'Files', label: 'Delete current file', icon: Trash2, run: () => void deleteFile(activeFile.id) },
        ] : []),
        { id: 'copy-link', group: 'Files', label: 'Copy link to current file', icon: Link2, run: () => copyFileLink(activeFile.id) },
        { id: 'reveal', group: 'Files', label: 'Reveal current file in navigation', icon: Crosshair, run: () => revealFile(activeFile.id) },
      ] : []),
      ...systemFiles.map(file => ({
        id: `open-${file.type}`, group: 'Open', label: file.name, icon: getFileTypeMeta(file.type).icon, run: () => openFile(file.id),
      })),
      { id: 'search', group: 'Search', label: 'Search in all files', hotkey: 'Ctrl Shift F', icon: Search, run: openSearch },
      { id: 'graph', group: 'Graph view', label: 'Open graph view', hotkey: 'Ctrl G', icon: Waypoints, run: () => openFile(GRAPH_VIEW_ID) },
      { id: 'local-graph', group: 'Graph view', label: 'Open local graph', icon: Waypoints, run: () => { setRightOpen(true); setRightTab('graph'); } },
      { id: 'daily', group: 'Daily notes', label: "Open today's daily note", hotkey: 'Alt D', icon: CalendarDays, run: openDailyNote },
      ...(activeFile?.type === 'doc' ? [{ id: 'template', group: 'Templates', label: 'Insert template', icon: FileInput, run: () => setPaletteMode('templates') }] : []),
      ...(activeFile && activeFile.id !== GRAPH_VIEW_ID ? [{
        id: 'bookmark', group: 'Bookmarks', label: projectBookmarks.includes(activeFile.id) ? 'Remove bookmark' : 'Bookmark current file', icon: Bookmark,
        run: () => toggleBookmark(activeFile.id),
      }] : []),
      { id: 'tags', group: 'Tags', label: 'Show tags', icon: Hash, run: () => { setLeftOpen(true); setLeftTab('tags'); } },
      { id: 'bookmarks', group: 'Bookmarks', label: 'Show bookmarks', icon: Bookmark, run: () => { setLeftOpen(true); setLeftTab('bookmarks'); } },
      { id: 'toggle-left', group: 'Workspace', label: 'Toggle left sidebar', hotkey: 'Ctrl \\', icon: PanelLeft, run: toggleLeft },
      { id: 'toggle-right', group: 'Workspace', label: 'Toggle right sidebar', hotkey: 'Ctrl Shift \\', icon: PanelRight, run: toggleRight },
      { id: 'outline', group: 'Workspace', label: 'Show outline', icon: ListTree, run: () => { setRightOpen(true); setRightTab('outline'); } },
      { id: 'backlinks', group: 'Workspace', label: 'Show backlinks', icon: Link2, run: () => { setRightOpen(true); setRightTab('links'); } },
      { id: 'back', group: 'Workspace', label: 'Navigate back', hotkey: 'Ctrl Alt ←', icon: ArrowLeft, run: tabs.goBack },
      { id: 'forward', group: 'Workspace', label: 'Navigate forward', hotkey: 'Ctrl Alt →', icon: ArrowRight, run: tabs.goForward },
      { id: 'new-tab', group: 'Workspace', label: 'New tab', run: tabs.newTab },
      ...(activeLeaf ? [
        { id: 'pin', group: 'Workspace', label: activeLeaf.pinned ? 'Unpin current tab' : 'Pin current tab', icon: Pin, run: () => tabs.togglePin(activeLeaf.id) },
        { id: 'close-tab', group: 'Workspace', label: 'Close current tab', icon: X, run: () => tabs.closeTab(activeLeaf.id) },
        { id: 'close-others', group: 'Workspace', label: 'Close all other tabs', run: () => tabs.closeOthers(activeLeaf.id) },
      ] : []),
      { id: 'export', group: 'Project', label: 'Export project as ZIP', icon: Download, run: () => activeProject && void handleExportProject(activeProject) },
      { id: 'rename-project', group: 'Project', label: 'Rename project', icon: Pencil, run: () => void handleRenameProject() },
    ] : []),
    { id: 'projects', group: 'Project', label: 'Manage projects', icon: LayoutGrid, run: goToDashboard },
    { id: 'theme', group: 'Appearance', label: 'Toggle light/dark mode', icon: SunMoon, run: toggleTheme },
    { id: 'settings', group: 'App', label: 'Open settings', hotkey: 'Ctrl ,', icon: SettingsIcon, run: openSettings },
    { id: 'guide', group: 'App', label: 'Open guide', icon: BookOpen, run: () => openGuide() },
    { id: 'help', group: 'App', label: 'Show keyboard shortcuts', icon: HelpCircle, run: () => setIsHelpOpen(true) },
    ...(authUser?.isAdmin ? [{ id: 'users', group: 'App', label: 'Manage users', icon: Users, run: () => setShowAdminUsers(true) }] : []),
    { id: 'logout', group: 'App', label: 'Sign out', icon: LogOut, run: () => void handleLogout() },
  ];

  // Keyboard handlers read the latest closures through a ref so the listener
  // is bound once.
  const shortcutsRef = useRef({
    togglePalette: (_mode: PaletteMode) => {},
    inProject: false,
    isMobile: false,
    newDocument: () => {},
    renameActive: () => {},
    toggleLeft: () => {},
    toggleRight: () => {},
    openSearch: () => {},
    openGraph: () => {},
    openDaily: () => {},
    openSettings: () => {},
    back: () => {},
    forward: () => {},
    closeOverlays: () => false as boolean,
  });
  shortcutsRef.current = {
    togglePalette: mode => setPaletteMode(current => (current === mode ? null : mode)),
    inProject,
    isMobile,
    newDocument: () => createFile('doc'),
    renameActive: renameActiveFile,
    toggleLeft,
    toggleRight,
    openSearch,
    openSettings,
    openGraph: () => openFile(GRAPH_VIEW_ID),
    openDaily: openDailyNote,
    back: tabs.goBack,
    forward: tabs.goForward,
    closeOverlays: () => {
      if (!isMobile || (!leftOpen && !rightOpen)) return false;
      setLeftOpen(false);
      setRightOpen(false);
      return true;
    },
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = shortcutsRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (mod && !e.shiftKey && !e.altKey && (e.code === 'KeyK' || e.code === 'KeyO')) {
        e.preventDefault();
        h.togglePalette('files');
      } else if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyP') {
        e.preventDefault();
        h.togglePalette('commands');
      } else if (mod && e.code === 'Comma') {
        e.preventDefault();
        h.openSettings();
      } else if (mod && e.code === 'Backslash' && h.inProject) {
        e.preventDefault();
        if (e.shiftKey) h.toggleRight();
        else h.toggleLeft();
      } else if (mod && e.shiftKey && e.code === 'KeyF' && h.inProject) {
        e.preventDefault();
        h.openSearch();
      } else if (mod && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && h.inProject) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') h.back();
        else h.forward();
      } else if (h.inProject && e.code === 'KeyN' && ((mod && !e.shiftKey && !e.altKey) || (e.altKey && !mod && !e.shiftKey && !typing))) {
        // Ctrl+N is reserved by most browsers; Alt+N always works.
        e.preventDefault();
        h.newDocument();
      } else if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyG' && h.inProject) {
        e.preventDefault();
        h.openGraph();
      } else if (e.altKey && !mod && !e.shiftKey && e.code === 'KeyD' && !typing && h.inProject) {
        e.preventDefault();
        h.openDaily();
      } else if (e.key === 'F2' && !typing && h.inProject) {
        e.preventDefault();
        h.renameActive();
      } else if (e.key === 'Escape' && h.closeOverlays()) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Render ----------------------------------------------------------------

  if (!authReady) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/30 animate-pulse" title="DevArchitect">
          <span className="text-sm font-extrabold tracking-tight text-accent">DA</span>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <>
        <AuthView />
        <UiFeedback />
      </>
    );
  }

  const projectMenu = (e: React.MouseEvent) => {
    const others = [...projects].filter(p => p.id !== activeProjectId).sort((a, b) => b.lastModified - a.lastModified).slice(0, 8);
    const entries: MenuEntry[] = [
      ...(others.length ? [
        { kind: 'heading' as const, label: 'Switch project' },
        ...others.map(p => ({ label: p.name, icon: LayoutGrid, onSelect: () => handleSelectProject(p.id) })),
        { kind: 'separator' as const },
      ] : []),
      { label: 'Manage projects…', icon: LayoutGrid, onSelect: goToDashboard },
      { label: 'Rename project…', icon: Pencil, onSelect: () => void handleRenameProject() },
      ...(activeProject ? [{ label: 'Export as ZIP', icon: Download, onSelect: () => void handleExportProject(activeProject) }] : []),
    ];
    showMenu(e, entries, 'below');
  };

  const editorComponent = activeFile ? EDITORS[activeFile.type] : undefined;
  const dockOverlay = isMobile ? 'fixed bottom-[var(--statusbar-h)] top-0 z-40 shadow-pop' : 'relative';

  const renderLeftDock = () => activeProject && leftOpen && (
    <aside
      aria-label="Left sidebar"
      style={{ width: isMobile ? `min(${leftWidth}px, 85vw)` : leftWidth }}
      className={cn('flex shrink-0 flex-col border-r border-border bg-chrome animate-slide-in', dockOverlay, isMobile && 'left-[var(--ribbon-w)]')}
    >
      <div className="flex h-[var(--header-h)] shrink-0 items-center gap-0.5 border-b border-border px-2">
        {([
          { id: 'files', label: 'Files', icon: Files },
          { id: 'search', label: 'Search (Ctrl+Shift+F)', icon: Search },
          { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
          { id: 'tags', label: 'Tags', icon: Hash },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={leftTab === id}
            onClick={() => (id === 'search' ? openSearch() : setLeftTab(id))}
            className="icon-btn"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {leftTab === 'files' ? (
          <FileExplorer
            project={activeProject}
            activeFileId={activeFileId}
            expandedFolders={expandedFolders}
            onToggleFolder={id => setExpandedFolders(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })}
            onCollapseAll={() => setExpandedFolders(new Set())}
            onExpandAll={() => setExpandedFolders(new Set(activeProject.folders.map(f => f.id)))}
            renaming={renaming}
            onStartRename={setRenaming}
            onCommitRename={commitRename}
            onCancelRename={() => setRenaming(null)}
            onOpenFile={(id, newTab) => openFile(id, newTab ? 'new-tab' : 'current')}
            bookmarkIds={projectBookmarks}
            onToggleBookmark={toggleBookmark}
            onCreateFile={(type, folderId) => createFile(type, folderId)}
            onCreateFolder={createFolder}
            onDeleteFile={id => void deleteFile(id)}
            onDeleteFolder={id => void deleteFolder(id)}
            onMoveFile={moveFile}
            onMoveFolder={moveFolder}
            onCopyLink={copyFileLink}
            onCopyId={copyFileId}
            revealRequest={revealRequest}
            onRevealHandled={() => setRevealRequest(null)}
          />
        ) : leftTab === 'search' ? (
          <SearchPanel files={activeProject.files} onOpenFile={id => openFile(id)} focusSignal={searchFocusSignal} queryRequest={searchRequest} />
        ) : leftTab === 'bookmarks' ? (
          <BookmarksPanel
            files={activeProject.files}
            bookmarkIds={projectBookmarks}
            activeFileId={activeFileId}
            onOpen={(id, newTab) => openFile(id, newTab ? 'new-tab' : 'current')}
            onRemove={toggleBookmark}
          />
        ) : (
          <TagsPanel files={activeProject.files} onSelect={tag => searchFor(`#${tag}`)} />
        )}
      </div>
      {/* Project switcher — Obsidian's vault profile */}
      <div className="flex shrink-0 items-center gap-1 border-t border-border px-1.5 py-1.5">
        <button
          type="button"
          onClick={projectMenu}
          title="Switch project"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[0.8125rem] font-medium text-content hover:bg-surface-hover"
        >
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className="truncate">{activeProject.name}</span>
        </button>
      </div>
      {!isMobile && (
        <ResizeHandle side="right" width={leftWidth} min={DOCK.min} max={DOCK.max} onResize={resizeLeft} onReset={() => resizeLeft(DOCK.left.fallback)} />
      )}
    </aside>
  );

  const renderRightDock = () => activeProject && rightOpen && (
    <aside
      aria-label="Right sidebar"
      style={{ width: isMobile ? `min(${rightWidth}px, 85vw)` : rightWidth }}
      className={cn('flex shrink-0 flex-col border-l border-border bg-chrome animate-slide-in-right', dockOverlay, isMobile && 'right-0')}
    >
      {!isMobile && (
        <ResizeHandle side="left" width={rightWidth} min={DOCK.min} max={DOCK.max} onResize={resizeRight} onReset={() => resizeRight(DOCK.right.fallback)} />
      )}
      <RightSidebar
        project={activeProject}
        file={activeFile}
        tab={rightTab}
        onTabChange={setRightTab}
        onOpenFile={id => openFile(id)}
        onOpenTag={tag => searchFor(`#${tag}`)}
        onCopyId={copyFileId}
        folderPath={activeFile ? folderPathOf(activeFile) : []}
      />
    </aside>
  );

  const renderWorkspace = () => activeProject && (
    <div className="relative flex min-w-0 flex-1">
      {renderLeftDock()}
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar
          tabs={tabItems}
          activeTabId={tabs.activeLeafId}
          onActivate={tabs.setActiveLeafId}
          onClose={tabs.closeTab}
          onCloseOthers={tabs.closeOthers}
          onCloseToRight={tabs.closeToRight}
          onCloseAll={tabs.closeAll}
          onTogglePin={tabs.togglePin}
          onReorder={tabs.reorder}
          onNewTab={tabs.newTab}
          onReveal={revealFile}
          onCopyLink={copyFileLink}
          bookmarkIds={projectBookmarks}
          onToggleBookmark={toggleBookmark}
          rightOpen={rightOpen}
          onToggleRight={toggleRight}
        />
        {activeFile && (editorComponent || activeFile.id === GRAPH_VIEW_ID) && activeLeaf ? (
          <>
            <ViewHeader
              file={activeFile}
              folderPath={folderPathOf(activeFile)}
              canGoBack={tabs.canGoBack}
              canGoForward={tabs.canGoForward}
              onBack={tabs.goBack}
              onForward={tabs.goForward}
              isProtected={isProtectedFile(activeFile)}
              pinned={activeLeaf.pinned}
              onRename={name => renameFile(activeFile.id, name)}
              onDelete={() => void deleteFile(activeFile.id)}
              onCopyLink={() => copyFileLink(activeFile.id)}
              onCopyId={() => copyFileId(activeFile.id)}
              onReveal={() => revealFile(activeFile.id)}
              onTogglePin={() => tabs.togglePin(activeLeaf.id)}
              bookmarked={projectBookmarks.includes(activeFile.id)}
              onToggleBookmark={activeFile.id === GRAPH_VIEW_ID ? undefined : () => toggleBookmark(activeFile.id)}
              onClose={() => tabs.closeTab(activeLeaf.id)}
              startRename={pendingTitleRename === activeFile.id}
              onRenameStarted={() => setPendingTitleRename(null)}
            />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <EditorErrorBoundary key={activeFile.id} fileName={activeFile.name}>
                <React.Suspense fallback={<EditorLoadingFallback />}>
                  {activeFile.id === GRAPH_VIEW_ID ? (
                    <GraphView files={activeProject.files} activeFileId={recentFileIds.find(id => id !== GRAPH_VIEW_ID) ?? null} onOpenFile={id => openFile(id)} onOpenTag={tag => searchFor(`#${tag}`)} />
                  ) : editorComponent && React.createElement(editorComponent, {
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
                    onOpenHref: openHref,
                    projectFolders: activeProject.folders,
                    taskNavigationTarget: taskNavigationTarget?.fileId === activeFile.id ? taskNavigationTarget : null,
                    onTaskNavigationHandled: () => setTaskNavigationTarget(null),
                  })}
                </React.Suspense>
              </EditorErrorBoundary>
            </div>
          </>
        ) : (
          <EmptyView
            recentFiles={recentFiles}
            onNewDocument={() => createFile('doc')}
            onQuickSwitch={() => setPaletteMode('files')}
            onCommandPalette={() => setPaletteMode('commands')}
            onOpenFile={id => openFile(id)}
          />
        )}
      </div>
      {renderRightDock()}
      {isMobile && (leftOpen || rightOpen) && (
        <div className="fixed inset-0 z-30 bg-overlay/40" aria-hidden onClick={() => { setLeftOpen(false); setRightOpen(false); }} />
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-content">
      {loadError && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-danger/40 bg-danger/10 px-4 py-2 text-[0.8125rem] text-content">
          <span className="min-w-0 flex-1 truncate">{loadError}</span>
          <button onClick={() => setLoadError(null)} className="icon-btn h-6 w-6" aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Ribbon
          inProject={inProject && !guide.open}
          leftOpen={leftOpen}
          onToggleLeft={toggleLeft}
          onHome={goToDashboard}
          homeActive={!inProject && !guide.open}
          onQuickSwitch={() => setPaletteMode('files')}
          onCommandPalette={() => setPaletteMode('commands')}
          onNewDocument={() => createFile('doc')}
          onOpenGraph={() => openFile(GRAPH_VIEW_ID)}
          onOpenDailyNote={openDailyNote}
          graphActive={activeFileId === GRAPH_VIEW_ID}
          systemFiles={inProject ? systemFiles : []}
          activeFileId={activeFileId}
          onOpenFile={id => openFile(id)}
          onOpenGuide={() => openGuide()}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenSettings={openSettings}
          onOpenAdmin={() => setShowAdminUsers(true)}
          onLogout={() => void handleLogout()}
          user={authUser}
        />
        {guide.open ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-border bg-chrome px-3">
              <BookOpen className="h-4 w-4 text-faint" />
              <span className="text-[0.8125rem] font-medium text-content">Guide</span>
              <button
                type="button"
                className="icon-btn ml-auto"
                title="Close guide"
                aria-label="Close guide"
                onClick={() => setGuide(g => ({ ...g, open: false }))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <GuideView initialSection={guide.section} />
            </div>
          </div>
        ) : inProject ? (
          renderWorkspace()
        ) : (
          <div className="min-w-0 flex-1">
            <Dashboard
              projects={projects}
              isLoaded={isLoaded}
              username={authUser.username}
              onSelectProject={handleSelectProject}
              onCreateProject={handleCreateProject}
              onUpdateProject={handleUpdateProject}
              onExportProject={p => void handleExportProject(p)}
              onDeleteProject={id => void handleDeleteProject(id)}
              onOpenGuide={() => openGuide()}
            />
          </div>
        )}
      </div>
      <StatusBar
        saveState={saveState}
        file={inProject && !guide.open ? activeFile : undefined}
        files={activeProject?.files || []}
        projectName={inProject ? activeProject?.name : undefined}
        onOpenLinks={() => { setRightOpen(true); setRightTab('links'); }}
      />

      <CommandPalette
        mode={paletteMode}
        onClose={() => setPaletteMode(null)}
        onModeChange={setPaletteMode}
        projects={projects}
        activeProject={inProject ? activeProject : undefined}
        recentFileIds={recentFileIds}
        folderPathOf={folderPathOf}
        commands={commands}
        onOpenFile={id => openFile(id)}
        onSelectProject={handleSelectProject}
        onCreateDocument={name => createFile('doc', null, name)}
        templates={templateDocs(activeProject).map(f => ({ id: f.id, name: f.name }))}
        onPickTemplate={insertTemplate}
      />
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <SettingsModal />
      <AdminUsersModal open={showAdminUsers} onClose={() => setShowAdminUsers(false)} />
      <UiFeedback />
    </div>
  );
};

export default App;
