import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight, Folder, FolderOpen, FilePlus2, FolderPlus, ArrowUpDown, ChevronsDownUp, ChevronsUpDown,
  Pencil, Trash2, Link2, Hash, ExternalLink, CornerLeftUp, Layers,
} from 'lucide-react';
import { Project, ProjectFile, ProjectFolder, FileType } from '../../types';
import { FILE_TYPES, getFileTypeMeta, SINGLE_INSTANCE_FILE_TYPES, MANDATORY_SINGLETON_FILES } from '../fileTypes';
import { showMenu, MenuEntry } from '../../stores/useMenuStore';
import InlineRename from './InlineRename';
import { cn } from '../ui';

export const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const FOLDER_DRAG_MIME = 'application/x-gdpm-folder-id';
const SORT_KEY = 'devarchitect-explorer-sort';
const SYSTEMS_KEY = 'devarchitect-explorer-systems';

export type RenameTarget = { kind: 'file' | 'folder'; id: string };
type SortOrder = 'type' | 'name-asc' | 'name-desc';

/** File types the "new file" menus offer (singletons are always present). */
export const CREATABLE_TYPES: FileType[] = FILE_TYPES
  .map(meta => meta.type)
  .filter(type => !SINGLE_INSTANCE_FILE_TYPES.has(type));

const readSort = (): SortOrder => {
  try {
    const v = window.localStorage.getItem(SORT_KEY);
    return v === 'name-asc' || v === 'name-desc' ? v : 'type';
  } catch {
    return 'type';
  }
};

const readSystemsOpen = (): boolean => {
  try {
    return window.localStorage.getItem(SYSTEMS_KEY) !== 'false';
  } catch {
    return true;
  }
};

interface FileExplorerProps {
  project: Project;
  activeFileId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  renaming: RenameTarget | null;
  onStartRename: (target: RenameTarget) => void;
  onCommitRename: (target: RenameTarget, name: string) => void;
  onCancelRename: () => void;
  onOpenFile: (fileId: string) => void;
  onCreateFile: (type: FileType, folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onDeleteFile: (fileId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveFile: (fileId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
  onCopyLink: (fileId: string) => void;
  onCopyId: (fileId: string) => void;
  /** Scroll to + focus this file's row (ancestors are expanded by the caller). */
  revealRequest: { fileId: string; nonce: number } | null;
  onRevealHandled: () => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  project,
  activeFileId,
  expandedFolders,
  onToggleFolder,
  onCollapseAll,
  onExpandAll,
  renaming,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onMoveFolder,
  onCopyLink,
  onCopyId,
  revealRequest,
  onRevealHandled,
}) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>(readSort);
  const [systemsOpen, setSystemsOpen] = useState(readSystemsOpen);
  const [dropTarget, setDropTarget] = useState<string | 'root' | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!revealRequest) return;
    const file = project.files.find(f => f.id === revealRequest.fileId);
    if (file && SINGLE_INSTANCE_FILE_TYPES.has(file.type)) setSystemsOpen(true);
    // Wait a frame so freshly expanded folders have rendered their rows.
    const handle = requestAnimationFrame(() => {
      const row = treeRef.current?.querySelector<HTMLElement>(`[data-file-id="${CSS.escape(revealRequest.fileId)}"]`);
      row?.scrollIntoView({ block: 'center' });
      row?.focus({ preventScroll: true });
      onRevealHandled();
    });
    return () => cancelAnimationFrame(handle);
    // Only a new request should trigger a reveal, not later file edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealRequest]);

  const changeSort = (order: SortOrder) => {
    setSortOrder(order);
    try { window.localStorage.setItem(SORT_KEY, order); } catch { /* in-memory only */ }
  };

  const toggleSystems = () => {
    setSystemsOpen(prev => {
      try { window.localStorage.setItem(SYSTEMS_KEY, String(!prev)); } catch { /* in-memory only */ }
      return !prev;
    });
  };

  const typeRank = useMemo(() => new Map(FILE_TYPES.map((meta, i) => [meta.type, i])), []);

  const compareNames = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

  const sortFiles = (files: ProjectFile[]) => [...files].sort((a, b) => {
    if (sortOrder === 'name-desc') return compareNames(b.name, a.name);
    if (sortOrder === 'type') {
      const rank = (typeRank.get(a.type) ?? 99) - (typeRank.get(b.type) ?? 99);
      if (rank !== 0) return rank;
    }
    return compareNames(a.name, b.name);
  });

  const sortFolders = (folders: ProjectFolder[]) => [...folders].sort((a, b) =>
    sortOrder === 'name-desc' ? compareNames(b.name, a.name) : compareNames(a.name, b.name));

  const systemOrder = new Map(MANDATORY_SINGLETON_FILES.map((def, i) => [def.type, i]));
  const systemFiles = project.files
    .filter(f => SINGLE_INSTANCE_FILE_TYPES.has(f.type))
    .sort((a, b) => (systemOrder.get(a.type) ?? 99) - (systemOrder.get(b.type) ?? 99));
  const regularCount = project.files.length - systemFiles.length;

  // --- Drag and drop -------------------------------------------------------

  const readDraggedFile = (e: React.DragEvent): string | null => {
    const raw = e.dataTransfer.getData(FILE_LINK_DRAG_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: string };
        if (parsed?.id) return parsed.id;
      } catch {
        if (project.files.some(f => f.id === raw)) return raw;
      }
    }
    return null;
  };

  const startFileDrag = (e: React.DragEvent, file: ProjectFile) => {
    setDraggingId(file.id);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(FILE_LINK_DRAG_MIME, JSON.stringify({ id: file.id, name: file.name }));
    e.dataTransfer.setData('application/x-gdpm-file-name', file.name);
    e.dataTransfer.setData('text/uri-list', `file://${file.id}`);
    e.dataTransfer.setData('text/plain', `[${file.name}](file://${file.id})`);
  };

  const startFolderDrag = (e: React.DragEvent, folder: ProjectFolder) => {
    setDraggingId(folder.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(FOLDER_DRAG_MIME, folder.id);
  };

  const endDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const isMovableDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(FILE_LINK_DRAG_MIME) || e.dataTransfer.types.includes(FOLDER_DRAG_MIME);

  const handleDragOver = (e: React.DragEvent, target: string | 'root') => {
    if (!isMovableDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== target) setDropTarget(target);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    if (!isMovableDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const folderDragId = e.dataTransfer.getData(FOLDER_DRAG_MIME);
    const fileId = folderDragId ? null : readDraggedFile(e);
    endDrag();
    if (folderDragId) {
      if (folderDragId !== folderId) onMoveFolder(folderDragId, folderId);
    } else if (fileId) {
      onMoveFile(fileId, folderId);
    }
  };

  // --- Menus ---------------------------------------------------------------

  const newFileEntries = (folderId: string | null): MenuEntry[] =>
    CREATABLE_TYPES.map(type => {
      const meta = getFileTypeMeta(type);
      return { label: `New ${meta.label.toLowerCase()}`, icon: meta.icon, onSelect: () => onCreateFile(type, folderId) };
    });

  const fileMenu = (e: React.MouseEvent, file: ProjectFile) => {
    const isSystem = SINGLE_INSTANCE_FILE_TYPES.has(file.type);
    showMenu(e, [
      { label: 'Open', icon: ExternalLink, onSelect: () => onOpenFile(file.id) },
      { kind: 'separator' },
      ...(!isSystem ? [{ label: 'Rename', icon: Pencil, hint: 'F2', onSelect: () => onStartRename({ kind: 'file', id: file.id }) }] : []),
      ...(!isSystem && file.folderId ? [{ label: 'Move to project root', icon: CornerLeftUp, onSelect: () => onMoveFile(file.id, null) }] : []),
      { label: 'Copy link', icon: Link2, onSelect: () => onCopyLink(file.id) },
      { label: 'Copy file ID', icon: Hash, onSelect: () => onCopyId(file.id) },
      ...(!isSystem ? [
        { kind: 'separator' as const },
        { label: 'Delete', icon: Trash2, danger: true, onSelect: () => onDeleteFile(file.id) },
      ] : []),
    ]);
  };

  const folderMenu = (e: React.MouseEvent, folder: ProjectFolder) => {
    showMenu(e, [
      ...newFileEntries(folder.id),
      { label: 'New folder', icon: FolderPlus, onSelect: () => onCreateFolder(folder.id) },
      { kind: 'separator' },
      { label: 'Rename', icon: Pencil, onSelect: () => onStartRename({ kind: 'folder', id: folder.id }) },
      ...(folder.parentId ? [{ label: 'Move to project root', icon: CornerLeftUp, onSelect: () => onMoveFolder(folder.id, null) }] : []),
      { kind: 'separator' },
      { label: 'Delete', icon: Trash2, danger: true, onSelect: () => onDeleteFolder(folder.id) },
    ]);
  };

  const rootMenu = (e: React.MouseEvent) => {
    showMenu(e, [
      ...newFileEntries(null),
      { label: 'New folder', icon: FolderPlus, onSelect: () => onCreateFolder(null) },
    ]);
  };

  const sortMenu = (e: React.MouseEvent) => {
    showMenu(e, [
      { kind: 'heading', label: 'Sort by' },
      { label: 'File type, then name', checked: sortOrder === 'type', onSelect: () => changeSort('type') },
      { label: 'File name (A to Z)', checked: sortOrder === 'name-asc', onSelect: () => changeSort('name-asc') },
      { label: 'File name (Z to A)', checked: sortOrder === 'name-desc', onSelect: () => changeSort('name-desc') },
    ], 'below');
  };

  // --- Rows ----------------------------------------------------------------

  const renderFileRow = (file: ProjectFile, draggableRow: boolean) => {
    const Icon = getFileTypeMeta(file.type).icon;
    const active = activeFileId === file.id;
    const isRenaming = renaming?.kind === 'file' && renaming.id === file.id;
    return (
      <div
        key={file.id}
        data-file-id={file.id}
        role="treeitem"
        aria-selected={active}
        tabIndex={0}
        draggable={!isRenaming}
        onDragStart={e => startFileDrag(e, file)}
        onDragEnd={endDrag}
        onDragOver={e => handleDragOver(e, file.folderId || 'root')}
        onDrop={e => handleDrop(e, file.folderId || null)}
        onClick={() => onOpenFile(file.id)}
        onKeyDown={e => {
          if (e.key === 'Enter') onOpenFile(file.id);
          if (e.key === 'F2' && draggableRow) {
            e.preventDefault();
            onStartRename({ kind: 'file', id: file.id });
          }
        }}
        onContextMenu={e => fileMenu(e, file)}
        title={file.name}
        className={cn(
          'nav-row cursor-pointer pl-[22px] pr-2',
          active && 'is-active',
          draggingId === file.id && 'opacity-40',
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-accent' : 'text-faint')} />
        {isRenaming ? (
          <InlineRename
            initialValue={file.name}
            onCommit={name => onCommitRename({ kind: 'file', id: file.id }, name)}
            onCancel={onCancelRename}
          />
        ) : (
          <span className="truncate">{file.name}</span>
        )}
      </div>
    );
  };

  const renderTree = (parentId: string | null): React.ReactNode => {
    const folders = sortFolders(project.folders.filter(f => f.parentId === parentId));
    const files = sortFiles(project.files.filter(f => !SINGLE_INSTANCE_FILE_TYPES.has(f.type) && (f.folderId || null) === parentId));
    return (
      <>
        {folders.map(folder => {
          const expanded = expandedFolders.has(folder.id);
          const isRenaming = renaming?.kind === 'folder' && renaming.id === folder.id;
          const FolderIcon = expanded ? FolderOpen : Folder;
          return (
            <div key={folder.id} role="group">
              <div
                role="treeitem"
                aria-expanded={expanded}
                tabIndex={0}
                draggable={!isRenaming}
                onDragStart={e => startFolderDrag(e, folder)}
                onDragEnd={endDrag}
                onDragOver={e => handleDragOver(e, folder.id)}
                onDragLeave={e => {
                  if (dropTarget === folder.id && !e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                }}
                onDrop={e => handleDrop(e, folder.id)}
                onClick={() => onToggleFolder(folder.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onToggleFolder(folder.id);
                  if (e.key === 'F2') {
                    e.preventDefault();
                    onStartRename({ kind: 'folder', id: folder.id });
                  }
                }}
                onContextMenu={e => folderMenu(e, folder)}
                title={folder.name}
                className={cn(
                  'nav-row cursor-pointer pl-1 pr-2 font-medium',
                  dropTarget === folder.id && 'bg-accent/15 text-content ring-1 ring-inset ring-accent/50',
                  draggingId === folder.id && 'opacity-40',
                )}
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-faint transition-transform', expanded && 'rotate-90')} />
                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
                {isRenaming ? (
                  <InlineRename
                    initialValue={folder.name}
                    onCommit={name => onCommitRename({ kind: 'folder', id: folder.id }, name)}
                    onCancel={onCancelRename}
                  />
                ) : (
                  <span className="truncate">{folder.name}</span>
                )}
              </div>
              {expanded && (
                <div className="ml-[13px] border-l border-border pl-0.5">
                  {renderTree(folder.id)}
                </div>
              )}
            </div>
          );
        })}
        {files.map(file => renderFileRow(file, true))}
      </>
    );
  };

  const allExpanded = project.folders.length > 0 && project.folders.every(f => expandedFolders.has(f.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Nav buttons — Obsidian's "new note / new folder / sort / collapse" row */}
      <div className="flex shrink-0 items-center justify-center gap-0.5 px-2 py-1.5">
        <button className="icon-btn" title="New file" aria-label="New file" onClick={e => showMenu(e, newFileEntries(null), 'below')}>
          <FilePlus2 className="h-4 w-4" />
        </button>
        <button className="icon-btn" title="New folder" aria-label="New folder" onClick={() => onCreateFolder(null)}>
          <FolderPlus className="h-4 w-4" />
        </button>
        <button className="icon-btn" title="Change sort order" aria-label="Change sort order" onClick={sortMenu}>
          <ArrowUpDown className="h-4 w-4" />
        </button>
        <button
          className="icon-btn"
          title={allExpanded ? 'Collapse all' : 'Expand all'}
          aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          onClick={allExpanded ? onCollapseAll : onExpandAll}
          disabled={project.folders.length === 0}
        >
          {allExpanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
        </button>
      </div>

      <div
        ref={treeRef}
        role="tree"
        aria-label="Files"
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-1.5 pb-6',
          dropTarget === 'root' && 'bg-accent/5',
        )}
        onDragOver={e => handleDragOver(e, 'root')}
        onDragLeave={e => {
          if (dropTarget === 'root' && !e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
        }}
        onDrop={e => handleDrop(e, null)}
        onContextMenu={e => {
          if (e.target === e.currentTarget) rootMenu(e);
        }}
      >
        {systemFiles.length > 0 && (
          <div className="mb-1">
            <button
              type="button"
              onClick={toggleSystems}
              aria-expanded={systemsOpen}
              className="nav-row pl-1 pr-2 font-medium"
            >
              <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-faint transition-transform', systemsOpen && 'rotate-90')} />
              <Layers className="h-3.5 w-3.5 shrink-0 text-faint" />
              <span className="truncate">Project systems</span>
            </button>
            {systemsOpen && (
              <div className="ml-[13px] border-l border-border pl-0.5">
                {systemFiles.map(file => renderFileRow(file, false))}
              </div>
            )}
          </div>
        )}

        {renderTree(null)}

        {regularCount === 0 && project.folders.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-faint">
            No files yet.
            <button type="button" onClick={() => onCreateFile('doc', null)} className="mt-1 block w-full text-accent hover:underline">
              Create a document
            </button>
          </div>
        )}
        {/* Spacer keeps a right-click / drop target below the last row. */}
        <div
          className="h-16"
          onContextMenu={rootMenu}
          onDragOver={e => handleDragOver(e, 'root')}
          onDrop={e => handleDrop(e, null)}
        />
      </div>
    </div>
  );
};

export default FileExplorer;
