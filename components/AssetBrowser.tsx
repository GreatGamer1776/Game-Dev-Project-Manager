import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Trash2, Image as ImageIcon, Copy, Search, Grid, Check, Download, FolderOpen, FolderPlus, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { EditorProps } from '../types';

interface AssetFolderItem {
  id: string;
  name: string;
  parentId: string | null;
}

interface AssetLibraryContent {
  folders: AssetFolderItem[];
  assetFolderMap: Record<string, string | null>;
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
  const assetFolderMap: Record<string, string | null> = {};

  Object.keys(assets).forEach(assetId => {
    const folderId = rawMap[assetId];
    assetFolderMap[assetId] = typeof folderId === 'string' && folderIds.has(folderId) ? folderId : null;
  });

  return { folders, assetFolderMap };
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

  const assetList = useMemo(() => Object.entries(assets).map(([id, data]) => ({ id, data })), [assets]);

  const filteredAssets = useMemo(() => {
    return assetList
      .filter(item => item.id.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(item => (libraryContent.assetFolderMap[item.id] ?? null) === selectedFolderId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [assetList, searchQuery, libraryContent.assetFolderMap, selectedFolderId]);

  const sortedRootFolders = useMemo(
    () => libraryContent.folders.filter(f => f.parentId === null).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [libraryContent.folders]
  );

  const getChildFolders = (parentId: string) =>
    libraryContent.folders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const createFolder = (parentId: string | null) => {
    const name = prompt('Folder name:');
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    const newId = crypto.randomUUID();
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

  const handleAssetDragStart = (e: React.DragEvent, assetId: string) => {
    setDraggedAssetId(assetId);
    e.dataTransfer.effectAllowed = 'move';
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
    const assetId = e.dataTransfer.getData('text/plain') || draggedAssetId;
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
    const assetId = e.dataTransfer.getData('text/plain') || draggedAssetId;
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
          className={`group flex items-center justify-between rounded-md px-1 py-1 mb-0.5 transition-colors ${isDropActive ? 'bg-blue-500/10 ring-1 ring-blue-500/40' : 'hover:bg-zinc-900'}`}
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
            className={`flex-1 flex items-center gap-2 px-1.5 py-1 text-sm text-left rounded ${isSelected ? 'text-white bg-zinc-800' : 'text-zinc-300'}`}
          >
            {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />) : <span className="w-3.5 h-3.5" />}
            <Folder className="w-4 h-4 text-blue-400/90" />
            <span className="truncate">{folder.name}</span>
          </button>
          <button
            onClick={() => createFolder(folder.id)}
            className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100"
            title="New Subfolder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
        {isExpanded && children.map(child => renderFolderTree(child, depth + 1))}
      </div>
    );
  };

  const uploadSelectedAssets = async (selected: FileList | File[] | null, source: 'files' | 'folder') => {
    if (!selected || !onAddAsset) return;
    const imageFiles = Array.from(selected).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert(`No image files found in selected ${source}.`);
      return;
    }

    setIsUploading(true);
    try {
      const newAssetIds: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        setUploadStatus(`Uploading ${i + 1}/${imageFiles.length}...`);
        const uri = await onAddAsset(imageFiles[i]);
        const assetId = typeof uri === 'string' && uri.startsWith('asset://') ? uri.slice('asset://'.length) : '';
        if (assetId) {
          newAssetIds.push(assetId);
        }
      }
      if (newAssetIds.length > 0) {
        commitLibraryContent(prev => {
          const nextMap = { ...prev.assetFolderMap };
          newAssetIds.forEach(id => {
            nextMap[id] = selectedFolderId;
          });
          return { ...prev, assetFolderMap: nextMap };
        });
      }
      setUploadStatus(`Uploaded ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'}.`);
      setTimeout(() => setUploadStatus(''), 2500);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = async (e) => {
      await uploadSelectedAssets((e.target as HTMLInputElement).files, 'files');
    };
    input.click();
  };

  const handleUploadFolder = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    const folderInput = input as HTMLInputElement & { webkitdirectory?: boolean; directory?: boolean };
    folderInput.webkitdirectory = true;
    folderInput.directory = true;
    input.onchange = async (e) => {
      await uploadSelectedAssets((e.target as HTMLInputElement).files, 'folder');
    };
    input.click();
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(`asset://${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
      if (!onDeleteAsset) {
          alert("Delete functionality not available.");
          return;
      }
      if (confirm("Delete this asset permanently? It will disappear from all documents/whiteboards using it.")) {
          onDeleteAsset(id);
          commitLibraryContent(prev => {
            const nextMap = { ...prev.assetFolderMap };
            delete nextMap[id];
            return { ...prev, assetFolderMap: nextMap };
          });
      }
  };

  const downloadAsset = (data: string, id: string) => {
      const a = document.createElement('a');
      a.href = data;
      a.download = `asset-${id.substring(0,8)}.png`;
      a.click();
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-20">
        <h3 className="text-zinc-200 font-medium flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-purple-500" /> {fileName}
        </h3>
        <div className="flex items-center gap-3">
            <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text" 
                    placeholder="Search ID..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-full py-1.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700 w-48"
                />
            </div>
            <button 
                onClick={handleUploadFiles}
                disabled={isUploading}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg shadow-purple-900/20"
            >
                <Upload className="w-4 h-4" /> Upload Files
            </button>
            <button
                onClick={handleUploadFolder}
                disabled={isUploading}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed text-zinc-200 px-4 py-2 rounded-md text-sm font-medium transition-colors border border-zinc-700"
            >
                <FolderOpen className="w-4 h-4" /> Upload Folder
            </button>
        </div>
      </div>

      {uploadStatus && (
        <div className="px-6 py-2 text-xs text-zinc-400 border-b border-zinc-800 bg-zinc-900/70">
          {uploadStatus}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <aside className="w-64 border-r border-zinc-800 p-3 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">Folders</span>
            <button
              onClick={() => createFolder(selectedFolderId)}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
              title={selectedFolderId ? 'New Subfolder' : 'New Folder'}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setSelectedFolderId(null)}
            onDragOver={handleRootDragOver}
            onDrop={handleRootDrop}
            className={`w-full mb-2 flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors ${selectedFolderId === null ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'} ${activeDropFolderId === 'root' ? 'ring-1 ring-blue-500/40 bg-blue-500/10' : ''}`}
            title="Drop here to move asset to root"
          >
            <FolderOpen className="w-4 h-4 text-zinc-500" />
            <span>Root (No Folder)</span>
          </button>

          <div>
            {sortedRootFolders.map(folder => renderFolderTree(folder))}
            {sortedRootFolders.length === 0 && (
              <div className="text-xs text-zinc-600 px-2 py-3">No folders yet.</div>
            )}
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {assetList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 opacity-50">
                  <Grid className="w-16 h-16 mb-4" />
                  <p>No assets in this project yet.</p>
                  <p className="text-sm mt-2">Upload images or paste them into Documents.</p>
              </div>
          ) : filteredAssets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 opacity-60">
                  <Grid className="w-12 h-12 mb-3" />
                  <p>No assets in this folder.</p>
                  <p className="text-xs mt-2">Drag assets onto folders to reorganize.</p>
              </div>
          ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {filteredAssets.map(({ id, data }) => (
                      <div
                        key={id}
                        draggable
                        onDragStart={(e) => handleAssetDragStart(e, id)}
                        onDragEnd={handleAssetDragEnd}
                        className={`group bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all shadow-sm hover:shadow-xl cursor-grab active:cursor-grabbing ${draggedAssetId === id ? 'opacity-45 grayscale' : ''}`}
                      >
                          {/* Image Preview */}
                          <div className="aspect-square bg-[#101012] relative flex items-center justify-center overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGgyMHYyMEgwem0xMCAxMGgxMHYxMEgxMHoiIGZpbGw9IiMxODE4MWIiIGZpbGwtb3BhY2l0eT0iMC40Ii8+PC9zdmc+')]">
                              <img src={data} alt={id} className="max-w-full max-h-full object-contain" />
                              
                              {/* Overlay Actions */}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                  <button 
                                      onClick={() => handleCopy(id)}
                                      className="p-2 bg-white text-black rounded-full hover:scale-110 transition-transform" 
                                      title="Copy ID"
                                  >
                                      {copiedId === id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                  <button 
                                      onClick={() => downloadAsset(data, id)}
                                      className="p-2 bg-zinc-800 text-white rounded-full hover:scale-110 transition-transform"
                                      title="Download"
                                  >
                                      <Download className="w-4 h-4" />
                                  </button>
                                  <button 
                                      onClick={() => handleDelete(id)}
                                      className="p-2 bg-red-600 text-white rounded-full hover:scale-110 transition-transform"
                                      title="Delete Asset"
                                  >
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </div>
                          </div>

                          {/* Footer info */}
                          <div className="p-3 border-t border-zinc-800 bg-zinc-900/50">
                              <div className="text-[10px] font-mono text-zinc-500 truncate" title={id}>
                                  {id}
                              </div>
                              <div className="text-[10px] text-zinc-600 mt-1">
                                  {(data.length / 1024).toFixed(1)} KB • {data.split(';')[0].split(':')[1]}
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetBrowser;
