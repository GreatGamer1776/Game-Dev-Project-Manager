import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Trash2, Copy, Search, Check, Download, FolderOpen, FolderPlus, Folder, ChevronRight, ChevronDown, Music, File as FileIcon, Pencil, ImagePlus, X, Loader2 } from 'lucide-react';
import { EditorProps } from '../types';
import { ASSET_LINK_DRAG_MIME, AssetKind, getAssetExtensionFromMime, getAssetKindFromMime, getAssetMimeType } from '../services/assetUtils';
import { confirmDialog, promptDialog, toast } from '../stores/useUiStore';
import { uid } from '../utils/id';

interface AssetFolderItem {
  id: string;
  name: string;
  parentId: string | null;
}

interface AssetLibraryContent {
  folders: AssetFolderItem[];
  assetFolderMap: Record<string, string | null>;
  assetNameMap: Record<string, string>;
}

const normalizeLibraryContent = (content: any, assets: Record<string, string>): AssetLibraryContent => {
  const rawFolders: AssetFolderItem[] = Array.isArray(content?.folders)
    ? content.folders
        .filter((f: any) => typeof f?.id === 'string' && typeof f?.name === 'string')
        .map((f: any) => ({ id: f.id, name: f.name, parentId: typeof f.parentId === 'string' ? f.parentId : null }))
    : [];

  const folderIds = new Set(rawFolders.map(f => f.id));
  const folders = rawFolders.map(f => ({
    ...f,
    parentId: f.parentId && folderIds.has(f.parentId) ? f.parentId : null
  }));
  const rawMap = content?.assetFolderMap && typeof content.assetFolderMap === 'object' ? content.assetFolderMap : {};
  const rawNameMap = content?.assetNameMap && typeof content.assetNameMap === 'object' ? content.assetNameMap : {};
  const assetFolderMap: Record<string, string | null> = {};
  const assetNameMap: Record<string, string> = {};

  Object.keys(assets).forEach(assetId => {
    const folderId = rawMap[assetId];
    assetFolderMap[assetId] = typeof folderId === 'string' && folderIds.has(folderId) ? folderId : null;
    const assetName = rawNameMap[assetId];
    assetNameMap[assetId] = typeof assetName === 'string' && assetName.trim() ? assetName.trim() : assetId;
  });

  return { folders, assetFolderMap, assetNameMap };
};

const AssetBrowser: React.FC<EditorProps> = ({ initialContent, assets = {}, onAddAsset, onDeleteAsset, onSave, fileName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [libraryContent, setLibraryContent] = useState<AssetLibraryContent>(() => normalizeLibraryContent(initialContent, assets));
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [activeDropFolderId, setActiveDropFolderId] = useState<string | 'root' | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  useEffect(() => {
    const normalized = normalizeLibraryContent(initialContent, assets);
    setLibraryContent(normalized);
    setSelectedFolderId(prev => {
      if (!prev) return null;
      return normalized.folders.some(f => f.id === prev) ? prev : null;
    });
  }, [initialContent, assets]);

  const commitLibraryContent = (updater: (prev: AssetLibraryContent) => AssetLibraryContent) => {
    setLibraryContent(prev => {
      const next = updater(prev);
      onSave(next);
      return next;
    });
  };

  const assetList = useMemo(
    () => Object.entries(assets).map(([id, data]) => {
      const mime = getAssetMimeType(data);
      return {
        id,
        data,
        name: libraryContent.assetNameMap[id] || id,
        mime,
        kind: getAssetKindFromMime(mime)
      };
    }),
    [assets, libraryContent.assetNameMap]
  );

  const filteredAssets = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return assetList
      .filter(item => item.id.toLowerCase().includes(query) || item.name.toLowerCase().includes(query))
      .filter(item => (libraryContent.assetFolderMap[item.id] ?? null) === selectedFolderId)
      .sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        if (nameCompare !== 0) return nameCompare;
        return a.id.localeCompare(b.id);
      });
  }, [assetList, searchQuery, libraryContent.assetFolderMap, selectedFolderId]);

  const sortedRootFolders = useMemo(
    () => libraryContent.folders.filter(f => f.parentId === null).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [libraryContent.folders]
  );

  const getChildFolders = (parentId: string) =>
    libraryContent.folders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const createFolder = async (parentId: string | null) => {
    const name = await promptDialog({
      title: parentId ? 'New subfolder' : 'New folder',
      label: 'Folder name',
      confirmText: 'Create',
    });
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    const newId = uid();
    commitLibraryContent(prev => ({
      ...prev,
      folders: [...prev.folders, { id: newId, name: trimmedName, parentId }]
    }));
    setExpandedFolders(prev => new Set(prev).add(newId).add(parentId || ''));
    setSelectedFolderId(newId);
  };

  const moveAssetToFolder = (assetId: string, folderId: string | null) => {
    commitLibraryContent(prev => ({
      ...prev,
      assetFolderMap: { ...prev.assetFolderMap, [assetId]: folderId }
    }));
  };

  const getDraggedAssetId = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(ASSET_LINK_DRAG_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: string };
        if (parsed?.id && assets[parsed.id]) return parsed.id;
      } catch {
        // Fall through to text/plain.
      }
    }
    const uri = e.dataTransfer.getData('text/uri-list');
    if (uri?.startsWith('asset://')) {
      const assetId = uri.replace('asset://', '').trim();
      if (assets[assetId]) return assetId;
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text && assets[text.trim()]) return text.trim();
    return draggedAssetId;
  };

  const handleAssetDragStart = (e: React.DragEvent, assetId: string, name: string, kind: AssetKind, mime: string) => {
    setDraggedAssetId(assetId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(ASSET_LINK_DRAG_MIME, JSON.stringify({ id: assetId, name, kind, mime }));
    e.dataTransfer.setData('text/uri-list', `asset://${assetId}`);
    e.dataTransfer.setData('text/plain', assetId);
  };

  const handleAssetDragEnd = () => {
    setDraggedAssetId(null);
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
    const assetId = getDraggedAssetId(e);
    setActiveDropFolderId(null);
    setDraggedAssetId(null);
    if (!assetId) return;
    moveAssetToFolder(assetId, folderId);
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
    const assetId = getDraggedAssetId(e);
    setActiveDropFolderId(null);
    setDraggedAssetId(null);
    if (!assetId) return;
    moveAssetToFolder(assetId, null);
  };

  const renderFolderTree = (folder: AssetFolderItem, depth: number = 0): React.ReactNode => {
    const children = getChildFolders(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const isDropActive = activeDropFolderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          style={{ marginLeft: depth * 10 }}
          className={`group flex items-center justify-between rounded-md px-1 py-1 mb-0.5 transition-colors ${isDropActive ? 'bg-blue-500/10 ring-1 ring-blue-500/40' : 'hover:bg-surface-hover'}`}
          onDragOver={(e) => handleFolderDragOver(e, folder.id)}
          onDrop={(e) => handleFolderDrop(e, folder.id)}
        >
          <button
            onClick={() => {
              if (hasChildren) {
                setExpandedFolders(prev => {
                  const next = new Set(prev);
                  if (next.has(folder.id)) next.delete(folder.id);
                  else next.add(folder.id);
                  return next;
                });
              }
              setSelectedFolderId(folder.id);
            }}
            className={`flex-1 flex items-center gap-2 px-1.5 py-1 text-sm text-left rounded ${isSelected ? 'text-content bg-surface-raised' : 'text-content'}`}
          >
            {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-faint" /> : <ChevronRight className="w-3.5 h-3.5 text-faint" />) : <span className="w-3.5 h-3.5" />}
            <Folder className="w-4 h-4 text-blue-400/90" />
            <span className="truncate">{folder.name}</span>
          </button>
          <button
            onClick={() => createFolder(folder.id)}
            className="p-1 text-faint hover:text-content hover:bg-surface-hover rounded opacity-0 group-hover:opacity-100"
            title="New subfolder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
        {isExpanded && children.map(child => renderFolderTree(child, depth + 1))}
      </div>
    );
  };

  const isLikelyMediaFile = (file: File) => {
    if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name);
  };

  const uploadSelectedAssets = async (selected: FileList | File[] | null, source: 'files' | 'folder') => {
    if (!selected || !onAddAsset) return;
    const mediaFiles = Array.from(selected).filter(isLikelyMediaFile);
    if (mediaFiles.length === 0) {
      toast.info(`No media files found in selected ${source}.`);
      return;
    }

    setIsUploading(true);
    try {
      const newAssets: Array<{ id: string; name: string }> = [];
      const failedFiles: string[] = [];
      for (let i = 0; i < mediaFiles.length; i++) {
        setUploadStatus(`Uploading ${i + 1}/${mediaFiles.length}...`);
        try {
          const uri = await onAddAsset(mediaFiles[i]);
          const assetId = typeof uri === 'string' && uri.startsWith('asset://') ? uri.slice('asset://'.length) : '';
          if (assetId) {
            newAssets.push({ id: assetId, name: mediaFiles[i].name || assetId });
          } else {
            failedFiles.push(mediaFiles[i].name || `file-${i + 1}`);
          }
        } catch (error) {
          console.error('Asset upload failed for file', mediaFiles[i]?.name, error);
          failedFiles.push(mediaFiles[i].name || `file-${i + 1}`);
        }
      }
      if (newAssets.length > 0) {
        commitLibraryContent(prev => {
          const nextMap = { ...prev.assetFolderMap };
          const nextNameMap = { ...prev.assetNameMap };
          newAssets.forEach(({ id, name }) => {
            nextMap[id] = selectedFolderId;
            nextNameMap[id] = name;
          });
          return { ...prev, assetFolderMap: nextMap, assetNameMap: nextNameMap };
        });
      }

      const successCount = newAssets.length;
      if (successCount === mediaFiles.length) {
        setUploadStatus(`Uploaded ${successCount} asset${successCount === 1 ? '' : 's'}.`);
      } else if (successCount === 0) {
        setUploadStatus(`Upload failed for ${failedFiles.length} file${failedFiles.length === 1 ? '' : 's'}.`);
      } else {
        setUploadStatus(`Uploaded ${successCount}/${mediaFiles.length}. Failed ${failedFiles.length}.`);
      }
      setTimeout(() => setUploadStatus(''), 3500);
    } finally {
      setIsUploading(false);
    }
  };

  const launchUploadPicker = (source: 'files' | 'folder') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*';
    if (source === 'folder') {
      const folderInput = input as HTMLInputElement & { webkitdirectory?: boolean; directory?: boolean };
      folderInput.webkitdirectory = true;
      folderInput.directory = true;
    }

    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    input.onchange = async (e) => {
      try {
        await uploadSelectedAssets((e.target as HTMLInputElement).files, source);
      } finally {
        input.remove();
      }
    };
    (input as HTMLInputElement & { oncancel?: () => void }).oncancel = () => {
      input.remove();
    };

    input.click();
  };

  const handleUploadFiles = () => {
    launchUploadPicker('files');
  };

  const handleUploadFolder = () => {
    launchUploadPicker('folder');
  };

  const handleCopy = (id: string) => {
    navigator.clipboard?.writeText(`asset://${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
      if (!onDeleteAsset) {
          toast.error("Delete functionality not available.");
          return;
      }
      const confirmed = await confirmDialog({
        title: 'Delete this asset?',
        message: 'It will disappear from all documents and whiteboards using it.',
        confirmText: 'Delete asset',
        danger: true,
      });
      if (confirmed) {
          onDeleteAsset(id);
          commitLibraryContent(prev => {
            const nextMap = { ...prev.assetFolderMap };
            const nextNameMap = { ...prev.assetNameMap };
            delete nextMap[id];
            delete nextNameMap[id];
            return { ...prev, assetFolderMap: nextMap, assetNameMap: nextNameMap };
          });
      }
  };

  const handleRename = async (id: string) => {
      const currentName = libraryContent.assetNameMap[id] || id;
      const nextName = await promptDialog({
        title: 'Rename asset',
        label: 'Asset name',
        defaultValue: currentName,
        confirmText: 'Rename',
      });
      if (nextName === null) return;
      const trimmedName = nextName.trim();
      if (!trimmedName) {
        toast.error('Asset name cannot be empty.');
        return;
      }
      if (trimmedName === currentName) return;
      commitLibraryContent(prev => ({
        ...prev,
        assetNameMap: {
          ...prev.assetNameMap,
          [id]: trimmedName
        }
      }));
  };

  const selectedAsset = selectedAssetId ? assetList.find(item => item.id === selectedAssetId) || null : null;

  useEffect(() => {
    if (selectedAssetId && !assets[selectedAssetId]) setSelectedAssetId(null);
  }, [assets, selectedAssetId]);

  useEffect(() => {
    if (!selectedAssetId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || target.closest('[role="dialog"]'))) return;
      if (e.key === 'Escape') { setSelectedAssetId(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); void handleDelete(selectedAssetId); return; }
      if (e.key === 'F2') { e.preventDefault(); e.stopPropagation(); void handleRename(selectedAssetId); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); handleCopy(selectedAssetId); }
    };
    // Capture so F2 renames the asset rather than the open file.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  /** Files dragged in from the desktop (not assets being moved between folders). */
  const isOsFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(ASSET_LINK_DRAG_MIME);

  const handleGridDragOver = (e: React.DragEvent) => {
    if (!isOsFileDrag(e) || !onAddAsset) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isFileDragOver) setIsFileDragOver(true);
  };

  const handleGridDrop = (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    setIsFileDragOver(false);
    void uploadSelectedAssets(e.dataTransfer.files, 'files');
  };

  const downloadAsset = (data: string, id: string, name: string) => {
      const a = document.createElement('a');
      a.href = data;
      const safeName = (name || '').trim().replace(/[\\/:*?"<>|]/g, '_');
      const fallbackExt = getAssetExtensionFromMime(getAssetMimeType(data));
      a.download = safeName || `asset-${id.substring(0,8)}.${fallbackExt}`;
      a.click();
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-bg px-3 [scrollbar-width:thin]">
        <button
          onClick={handleUploadFiles}
          disabled={isUploading || !onAddAsset}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-content hover:bg-accent-hover disabled:opacity-60"
          title="Upload images, video, or audio (or drop files onto the grid)"
        >
          <Upload className="w-3.5 h-3.5" /> Upload
        </button>
        <button
          onClick={handleUploadFolder}
          disabled={isUploading || !onAddAsset}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-content disabled:opacity-60"
          title="Upload every media file in a folder"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Folder
        </button>
        <div className="relative ml-2 w-48 shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            type="text"
            placeholder="Filter by name…"
            aria-label="Filter assets by name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 w-full rounded-md border border-border bg-surface-raised pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-3 text-[11px] tabular-nums text-faint">
          {isUploading && <Loader2 className="h-3 w-3 animate-spin" />}
          {uploadStatus || (searchQuery ? `${filteredAssets.length} match${filteredAssets.length === 1 ? '' : 'es'}` : `${assetList.length} asset${assetList.length === 1 ? '' : 's'}`)}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-64 border-r border-border p-3 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wide text-faint">Folders</span>
            <button
              onClick={() => createFolder(selectedFolderId)}
              className="p-1.5 text-muted hover:text-content hover:bg-surface-hover rounded"
              title={selectedFolderId ? 'New subfolder inside the selected folder' : 'New folder'}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setSelectedFolderId(null)}
            onDragOver={handleRootDragOver}
            onDrop={handleRootDrop}
            className={`w-full mb-2 flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors ${selectedFolderId === null ? 'bg-surface-raised text-content' : 'text-content hover:bg-surface-hover'} ${activeDropFolderId === 'root' ? 'ring-1 ring-blue-500/40 bg-blue-500/10' : ''}`}
            title="Assets that aren't in a folder — drop one here to take it out of its folder"
          >
            <FolderOpen className="w-4 h-4 text-faint" />
            <span>Unfiled</span>
          </button>

          <div>
            {sortedRootFolders.map(folder => renderFolderTree(folder))}
            {sortedRootFolders.length === 0 && (
              <div className="px-2 py-3 text-[11px] leading-relaxed text-faint">No folders yet. Use <FolderPlus className="inline h-3 w-3" /> above to make one, then drag assets onto it.</div>
            )}
          </div>
        </aside>

        <div
          className={`relative flex flex-1 flex-col overflow-y-auto p-4 custom-scrollbar ${isFileDragOver ? 'bg-accent/5 ring-2 ring-inset ring-accent/50' : ''}`}
          onDragOver={handleGridDragOver}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsFileDragOver(false); }}
          onDrop={handleGridDrop}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedAssetId(null); }}
        >
          {assetList.length === 0 ? (
            <div className="flex justify-center px-4 pt-10">
              <div className="max-w-md rounded-lg border border-border bg-surface px-4 py-3 text-[12px] leading-relaxed text-muted">
                <div className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-content"><ImagePlus className="h-4 w-4 text-faint" /> Your asset library is empty</div>
                Upload sprites, concept art, video, or audio — or drop files anywhere here. Then drag an asset into a document or whiteboard to use it; every file in the project shares this library.
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={handleUploadFiles} disabled={!onAddAsset} className="rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-accent-content hover:bg-accent-hover disabled:opacity-60">Upload files</button>
                  <button type="button" onClick={handleUploadFolder} disabled={!onAddAsset} className="rounded-md px-2 py-1 text-[12px] text-muted ring-1 ring-border hover:bg-surface-hover disabled:opacity-60">Upload a folder</button>
                </div>
              </div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex justify-center px-4 pt-10">
              <div className="max-w-sm rounded-lg border border-border bg-surface px-4 py-3 text-center text-[12px] leading-relaxed text-muted">
                {searchQuery ? (
                  <>
                    No assets here match <b className="text-content">{searchQuery}</b>.
                    <button type="button" onClick={() => setSearchQuery('')} className="ml-1 text-accent hover:underline">Clear filter</button>
                  </>
                ) : (
                  <>
                    <div className="mb-1 text-[13px] font-medium text-content">This folder is empty</div>
                    Drag assets from another folder onto it in the sidebar, or upload straight into it.
                    <div className="mt-2">
                      <button type="button" onClick={handleUploadFiles} disabled={!onAddAsset} className="rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-accent-content hover:bg-accent-hover disabled:opacity-60">Upload here</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {filteredAssets.map(({ id, data, name, kind, mime }) => {
                const isSelected = selectedAssetId === id;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => handleAssetDragStart(e, id, name, kind, mime)}
                    onDragEnd={handleAssetDragEnd}
                    onClick={() => setSelectedAssetId(id)}
                    onDoubleClick={() => handleRename(id)}
                    title={`${name} — drag into a document or onto a folder · double-click to rename`}
                    className={`group overflow-hidden rounded-lg border bg-bg transition-colors cursor-grab active:cursor-grabbing ${isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-border-strong'} ${draggedAssetId === id ? 'opacity-45 grayscale' : ''}`}
                  >
                    <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface-raised">
                      {kind === 'image' ? (
                        <img src={data} alt={name} className="max-h-full max-w-full object-contain" draggable={false} />
                      ) : kind === 'video' ? (
                        <video src={data} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                      ) : kind === 'audio' ? (
                        <Music className="h-10 w-10 text-faint" />
                      ) : (
                        <FileIcon className="h-10 w-10 text-faint" />
                      )}
                      <div className="absolute left-1.5 top-1.5 rounded bg-bg/85 px-1.5 py-px text-[10px] uppercase tracking-wide text-muted">
                        {kind}
                      </div>
                    </div>
                    <div className="border-t border-border px-2 py-1.5">
                      <div className="truncate text-[12px] text-content">{name}</div>
                      <div className="truncate text-[10px] text-faint">{(data.length / 1024).toFixed(1)} KB · {mime}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedAsset && (
            <div className="sticky bottom-0 mt-auto flex justify-center pt-2">
              <div className="flex max-w-full items-center gap-0.5 rounded-lg border border-border bg-surface-raised px-1.5 py-1 shadow-raised">
                <span className="max-w-[12rem] truncate px-1.5 text-[12px] text-muted">{selectedAsset.name}</span>
                <button onClick={() => handleCopy(selectedAsset.id)} className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-content hover:bg-surface-hover" title="Copy an asset:// link to paste into a document (Ctrl+C)">
                  {copiedId === selectedAsset.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />} Copy link
                </button>
                <button onClick={() => downloadAsset(selectedAsset.data, selectedAsset.id, selectedAsset.name)} className="icon-btn" title="Download" aria-label="Download"><Download className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleRename(selectedAsset.id)} className="icon-btn" title="Rename (F2)" aria-label="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(selectedAsset.id)} className="icon-btn hover:!text-danger" title="Delete (Del)" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                <span className="mx-0.5 h-4 w-px bg-border" />
                <button onClick={() => setSelectedAssetId(null)} className="icon-btn" title="Deselect (Esc)" aria-label="Deselect"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetBrowser;
