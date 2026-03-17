import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, Trash2, Bold, Italic, List, ListOrdered, 
  Heading1, Heading2, Quote, Code, Image as ImageIcon, 
  Eye, Columns, PenTool, Link as LinkIcon, Check, Loader2, AlertCircle,
  Underline, Strikethrough, Palette, Video, Music, X, CheckSquare, FolderOpen,
  Undo2, Redo2
} from 'lucide-react';
import { EditorProps, TodoItem, TodoStatus } from '../types';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { ASSET_LINK_DRAG_MIME, AssetKind, getAssetDisplayName, getAssetKindFromMime, getAssetMimeType, sanitizeAssetLabel } from '../services/assetUtils';

// --- CUSTOM PARSER LOGIC ---
const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const TASK_LINK_DRAG_MIME = 'application/x-gdpm-task-link';

type TaskLinkRecord = {
    fileId: string;
    taskId: string;
    fileName: string;
    taskName: string;
    tags: string[];
    status: TodoStatus;
};

type AssetLinkRecord = {
    id: string;
    name: string;
    displayName: string;
    mime: string;
    kind: AssetKind;
    data: string;
};

const getTaskLookupKey = (fileId: string, taskId: string) => `${fileId}::${taskId}`;

const parseTaskHref = (href: string): { fileId: string; taskId: string } | null => {
    const match = href.match(/^task:\/\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { fileId: match[1], taskId: match[2] };
};

const parseDoc = (text: string, assets: Record<string, string>, fileLookup: Map<string, string>, taskLookup: Map<string, TaskLinkRecord>) => {
    
    const resolveSrc = (src: string) => {
        if (!src) return '';
        if (src.startsWith('asset://')) {
            const id = src.replace('asset://', '');
            return assets[id] || src;
        }
        return src;
    };

    const lines = text.split('\n');
    let html = '';
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1. Code Blocks
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            html += inCodeBlock 
                ? '<div class="bg-zinc-950 p-4 rounded-lg my-4 border border-zinc-800 font-mono text-sm text-zinc-300 overflow-x-auto"><pre>' 
                : '</pre></div>';
            continue;
        }
        if (inCodeBlock) {
            const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `${escaped}\n`;
            continue;
        }

        // 2. Headers
        if (line.startsWith('# ')) {
            html += `<h1 class="text-3xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800 mt-6">${parseInline(line.slice(2), assets, fileLookup, taskLookup)}</h1>`;
            continue;
        }
        if (line.startsWith('## ')) {
            html += `<h2 class="text-2xl font-semibold text-zinc-100 mb-3 mt-8">${parseInline(line.slice(3), assets, fileLookup, taskLookup)}</h2>`;
            continue;
        }
        if (line.startsWith('### ')) {
            html += `<h3 class="text-xl font-medium text-zinc-200 mb-2 mt-6">${parseInline(line.slice(4), assets, fileLookup, taskLookup)}</h3>`;
            continue;
        }

        // 3. Blockquotes
        if (line.startsWith('> ')) {
            html += `<blockquote class="border-l-4 border-blue-500 pl-4 py-2 my-4 text-zinc-400 italic bg-zinc-800/30 rounded-r">${parseInline(line.slice(2), assets, fileLookup, taskLookup)}</blockquote>`;
            continue;
        }

        // 4. Lists
        if (line.match(/^\s*-\s/)) {
            html += `<div class="flex gap-2 ml-4 mb-1 text-zinc-300"><span class="text-zinc-500">•</span><span>${parseInline(line.replace(/^\s*-\s/, ''), assets, fileLookup, taskLookup)}</span></div>`;
            continue;
        }
        if (line.match(/^\s*\d+\.\s/)) {
            const num = line.match(/^\s*(\d+)\./)?.[1] || '1';
            html += `<div class="flex gap-2 ml-4 mb-1 text-zinc-300"><span class="text-zinc-500 font-mono">${num}.</span><span>${parseInline(line.replace(/^\s*\d+\.\s/, ''), assets, fileLookup, taskLookup)}</span></div>`;
            continue;
        }

        // 5. Media
        const mediaMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (mediaMatch) {
            const [_, alt, src] = mediaMatch;
            const resolved = resolveSrc(src);
            
            const isVideo = resolved.startsWith('data:video') || src.match(/\.(mp4|webm|mov)$/i);
            const isAudio = resolved.startsWith('data:audio') || src.match(/\.(mp3|wav|ogg)$/i);

            if (isVideo) {
                html += `<div class="my-6"><video controls src="${resolved}" class="max-w-full rounded-lg shadow-lg border border-zinc-800 bg-black max-h-[500px]"></video><div class="text-xs text-zinc-500 mt-2 text-center italic">${alt}</div></div>`;
            } else if (isAudio) {
                html += `<div class="my-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-800 flex flex-col gap-2"><div class="text-xs text-zinc-400 flex items-center gap-2 font-mono uppercase"><span class="w-2 h-2 rounded-full bg-purple-500"></span> ${alt || 'Audio Track'}</div><audio controls src="${resolved}" class="w-full h-8"></audio></div>`;
            } else {
                html += `<div class="my-6"><img src="${resolved}" alt="${alt}" class="max-w-full rounded-lg shadow-lg border border-zinc-800" /><div class="text-xs text-zinc-500 mt-2 text-center italic">${alt}</div></div>`;
            }
            continue;
        }

        // 6. Horizontal Rule
        if (line.trim() === '---' || line.trim() === '***') {
            html += `<hr class="border-zinc-800 my-8" />`;
            continue;
        }

        // 7. Empty lines
        if (line.trim() === '') {
            html += `<div class="h-4"></div>`;
            continue;
        }

        // 8. Paragraphs
        html += `<p class="mb-2 leading-relaxed text-zinc-300">${parseInline(line, assets, fileLookup, taskLookup)}</p>`;
    }
    return html;
};

const parseInline = (text: string, assets: Record<string, string>, fileLookup: Map<string, string>, taskLookup: Map<string, TaskLinkRecord>) => {
    let out = text;

    // Bold (**text**)
    out = out.replace(/\*\*(.*?)\*\*/g, '<strong class="text-zinc-100 font-bold">$1</strong>');
    
    // Italic (*text*)
    out = out.replace(/\*(.*?)\*/g, '<em class="text-zinc-200 italic">$1</em>');
    
    // Strikethrough (~~text~~)
    out = out.replace(/~~(.*?)~~/g, '<s class="opacity-60 text-zinc-500 decoration-zinc-500">$1</s>');
    
    // Underline (<u>text</u>)
    out = out.replace(/<u>(.*?)<\/u>/g, '<u class="decoration-blue-500 decoration-2 underline-offset-4">$1</u>');

    // Color Spans
    out = out.replace(/<span style="color: (.*?)">(.*?)<\/span>/g, '<span style="color: $1">$2</span>');

    // Inline Code
    out = out.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 text-red-400 px-1.5 py-0.5 rounded text-sm font-mono border border-zinc-700/50">$1</code>');

    // Links
    out = out.replace(/\[(.*?)\]\((.*?)\)/g, (_, label: string, href: string) => {
        if (href.startsWith('file://')) {
            const fileId = href.replace('file://', '');
            const linkedName = fileLookup.get(fileId);
            const display = label || linkedName || 'Open file';
            const existsClass = linkedName ? 'text-cyan-400 hover:text-cyan-300' : 'text-zinc-500 line-through';
            return `<a href="${href}" data-file-id="${fileId}" class="${existsClass} hover:underline cursor-pointer transition-colors">${display}</a>`;
        }
        if (href.startsWith('task://')) {
            const taskTarget = parseTaskHref(href);
            const linkedTask = taskTarget ? taskLookup.get(getTaskLookupKey(taskTarget.fileId, taskTarget.taskId)) : undefined;
            const display = label || linkedTask?.taskName || 'Open task';
            const existsClass = linkedTask ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-500 line-through';
            return taskTarget
                ? `<a href="${href}" data-task-file-id="${taskTarget.fileId}" data-task-id="${taskTarget.taskId}" class="${existsClass} hover:underline cursor-pointer transition-colors">${display}</a>`
                : `<span class="text-zinc-500 line-through">${display}</span>`;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer transition-colors">${label}</a>`;
    });

    return out;
};


// --- COMPONENT ---

const DocEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, assets = {}, onAddAsset, projectFiles = [], activeFileId, onOpenFile, onOpenTask }) => {
  const [content, setContent] = useState(initialContent);
  const undoRedo = useUndoRedo<string>(initialContent);
  // OPTIMIZATION: Default to 'edit' mode to prevent initial render lag
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [isUploading, setIsUploading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  
  // Color Picker State
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState('#ef4444');
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const [showTaskLinkPicker, setShowTaskLinkPicker] = useState(false);
  const [taskLinkQuery, setTaskLinkQuery] = useState('');
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetQuery, setAssetQuery] = useState('');

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedContent = useRef(initialContent);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const fileLinkPickerRef = useRef<HTMLDivElement>(null);
  const taskLinkPickerRef = useRef<HTMLDivElement>(null);
  const assetPickerRef = useRef<HTMLDivElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const fileLookup = React.useMemo(() => new Map(projectFiles.map(f => [f.id, f.name])), [projectFiles]);
  const assetLibraryFile = React.useMemo(() => projectFiles.find(file => file.type === 'asset-gallery'), [projectFiles]);
  const assetNameMap = React.useMemo(() => {
    const content = assetLibraryFile?.content;
    if (!content || typeof content !== 'object') return {} as Record<string, string>;
    const rawMap = (content as { assetNameMap?: Record<string, string> }).assetNameMap;
    return rawMap && typeof rawMap === 'object' ? rawMap : {};
  }, [assetLibraryFile]);
  const linkableFiles = React.useMemo(
    () => projectFiles.filter(f => f.id !== activeFileId).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [projectFiles, activeFileId]
  );
  const filteredLinkableFiles = React.useMemo(() => {
    const query = linkPickerQuery.trim().toLowerCase();
    if (!query) return linkableFiles;
    return linkableFiles.filter(file =>
      file.name.toLowerCase().includes(query) || file.id.toLowerCase().includes(query)
    );
  }, [linkableFiles, linkPickerQuery]);
  const linkableTasks = React.useMemo<TaskLinkRecord[]>(() => {
    return projectFiles
      .filter(file => file.type === 'todo')
      .flatMap(file => {
        const todoContent = file.content as { items?: TodoItem[] };
        const items = Array.isArray(todoContent?.items) ? todoContent.items : [];
        return items
          .filter(item => typeof item?.id === 'string' && typeof item?.text === 'string')
          .map(item => ({
            fileId: file.id,
            taskId: item.id,
            fileName: file.name,
            taskName: item.text,
            tags: item.tags || [],
            status: item.status
          }));
      })
      .sort((a, b) =>
        a.taskName.localeCompare(b.taskName, undefined, { sensitivity: 'base' }) ||
        a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' })
      );
  }, [projectFiles]);
  const filteredLinkableTasks = React.useMemo(() => {
    const query = taskLinkQuery.trim().toLowerCase();
    if (!query) return linkableTasks;
    return linkableTasks.filter(task =>
      [
        task.taskName,
        task.fileName,
        task.taskId,
        task.status,
        ...task.tags
      ].join(' ').toLowerCase().includes(query)
    );
  }, [linkableTasks, taskLinkQuery]);
  const taskLookup = React.useMemo(
    () => new Map(linkableTasks.map(task => [getTaskLookupKey(task.fileId, task.taskId), task])),
    [linkableTasks]
  );
  const linkableAssets = React.useMemo<AssetLinkRecord[]>(() => {
    return Object.entries(assets)
      .map(([id, data]) => {
        const mime = getAssetMimeType(data);
        const kind = getAssetKindFromMime(mime);
        const rawName = assetNameMap[id] || id;
        return {
          id,
          name: rawName,
          displayName: getAssetDisplayName(rawName, id, kind),
          mime,
          kind,
          data
        };
      })
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id)
      );
  }, [assetNameMap, assets]);
  const filteredLinkableAssets = React.useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    if (!query) return linkableAssets;
    return linkableAssets.filter(asset =>
      [asset.displayName, asset.name, asset.id, asset.kind, asset.mime].join(' ').toLowerCase().includes(query)
    );
  }, [assetQuery, linkableAssets]);

  // Sync initial content
  useEffect(() => {
    if (initialContent !== content && initialContent !== lastSavedContent.current) {
        setContent(initialContent);
        undoRedo.reset(initialContent);
        lastSavedContent.current = initialContent;
    }
  }, [initialContent]);

  // OPTIMIZATION: Debounce the preview parsing and only run if viewMode requires it
  useEffect(() => {
      // If we are in Edit mode, do NOT parse HTML (saves resources)
      if (viewMode === 'edit') return;

      const timer = setTimeout(() => {
        setPreviewHtml(parseDoc(content, assets, fileLookup, taskLookup));
      }, 500); // 500ms debounce to prevent lag while typing fast in split view

      return () => clearTimeout(timer);
  }, [content, assets, fileLookup, taskLookup, viewMode]);

  useEffect(() => {
    if (linkableFiles.length > 0) return;
    setShowLinkPicker(false);
    setLinkPickerQuery('');
  }, [linkableFiles]);

  useEffect(() => {
    if (linkableTasks.length > 0) return;
    setShowTaskLinkPicker(false);
    setTaskLinkQuery('');
  }, [linkableTasks]);

  useEffect(() => {
    if (linkableAssets.length > 0) return;
    setShowAssetPicker(false);
    setAssetQuery('');
  }, [linkableAssets]);

  // Autosave
  useEffect(() => {
    if (content === lastSavedContent.current) return;
    setSaveStatus('unsaved');
    const timer = setTimeout(handleManualSave, 1500);
    return () => clearTimeout(timer);
  }, [content]);

  // Handle outside click for popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        setShowColorPicker(false);
      }
      if (fileLinkPickerRef.current && !fileLinkPickerRef.current.contains(target)) {
        setShowLinkPicker(false);
        setLinkPickerQuery('');
      }
      if (taskLinkPickerRef.current && !taskLinkPickerRef.current.contains(target)) {
        setShowTaskLinkPicker(false);
        setTaskLinkQuery('');
      }
      if (assetPickerRef.current && !assetPickerRef.current.contains(target)) {
        setShowAssetPicker(false);
        setAssetQuery('');
      }
    };
    if (!showColorPicker && !showLinkPicker && !showTaskLinkPicker && !showAssetPicker) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAssetPicker, showColorPicker, showLinkPicker, showTaskLinkPicker]);

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = undoRedo.undo();
        if (prev !== undefined) setContent(prev);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const next = undoRedo.redo();
        if (next !== undefined) setContent(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, undoRedo]);

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave(content);
    lastSavedContent.current = content;
    setTimeout(() => setSaveStatus('saved'), 500); 
  };

  // Push to undo stack on content changes (debounced to batch rapid typing)
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUndoPushRef = useRef(initialContent);
  useEffect(() => {
    if (content === lastUndoPushRef.current) return;
    if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current);
    undoDebounceRef.current = setTimeout(() => {
      undoRedo.pushState(content);
      lastUndoPushRef.current = content;
    }, 400);
    return () => { if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current); };
  }, [content, undoRedo]);

  const handleClear = () => {
    if (confirm('Are you sure you want to clear the entire document?')) setContent('');
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent(prev => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${before}${after}`);
      if (viewMode === 'preview') {
        setViewMode('edit');
      }
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const newText = textarea.value.substring(0, start) + before + selectedText + after + textarea.value.substring(end);
    setContent(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAddAsset) return;

    setIsUploading(true);
    try {
        const assetUrl = await onAddAsset(file); 
        const safeName = file.name.replace(/[\[\]\(\)]/g, '');
        insertText(`\n![${safeName}](${assetUrl})\n`);
    } catch (error) {
        console.error("Upload failed", error);
        alert("Failed to add media.");
    } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const applyColor = (color: string) => {
      insertText(`<span style="color: ${color}">`, `</span>`);
      setShowColorPicker(false);
  };

  const insertFileLink = (fileId: string) => {
      const selected = projectFiles.find(f => f.id === fileId);
      if (!selected) return;
      insertText(`[${selected.name}](file://${selected.id})`);
      setShowLinkPicker(false);
      setLinkPickerQuery('');
  };

  const insertTaskLink = (fileId: string, taskId: string) => {
      const selected = linkableTasks.find(task => task.fileId === fileId && task.taskId === taskId);
      if (!selected) return;
      insertText(`[${selected.taskName}](task://${selected.fileId}/${selected.taskId})`);
      setShowTaskLinkPicker(false);
      setTaskLinkQuery('');
  };

  const insertAssetReference = (assetId: string) => {
      const selected = linkableAssets.find(asset => asset.id === assetId);
      if (!selected) return;
      insertText(`\n![${sanitizeAssetLabel(selected.displayName, 'Project Asset')}](asset://${selected.id})\n`);
      setShowAssetPicker(false);
      setAssetQuery('');
  };

  const toggleLinkPicker = () => {
      if (linkableFiles.length === 0) return;
      setShowColorPicker(false);
      setShowTaskLinkPicker(false);
      setShowAssetPicker(false);
      setShowLinkPicker(prev => !prev);
      setLinkPickerQuery('');
  };

  const toggleTaskLinkPicker = () => {
      if (linkableTasks.length === 0) return;
      setShowColorPicker(false);
      setShowLinkPicker(false);
      setShowAssetPicker(false);
      setShowTaskLinkPicker(prev => !prev);
      setTaskLinkQuery('');
  };

  const toggleAssetPicker = () => {
      if (linkableAssets.length === 0) return;
      setShowColorPicker(false);
      setShowLinkPicker(false);
      setShowTaskLinkPicker(false);
      setShowAssetPicker(prev => !prev);
      setAssetQuery('');
  };

  const getDraggedTask = (e: React.DragEvent): { fileId: string; taskId: string; label: string } | null => {
      const raw = e.dataTransfer.getData(TASK_LINK_DRAG_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { fileId?: string; taskId?: string; label?: string };
          if (parsed?.fileId && parsed?.taskId) {
            return { fileId: parsed.fileId, taskId: parsed.taskId, label: parsed.label || 'Linked Task' };
          }
        } catch {
          // Ignore malformed task payloads and fall back to other formats.
        }
      }

      const uri = e.dataTransfer.getData('text/uri-list');
      if (uri?.startsWith('task://')) {
        const target = parseTaskHref(uri.trim());
        if (target) {
          const linkedTask = taskLookup.get(getTaskLookupKey(target.fileId, target.taskId));
          return { fileId: target.fileId, taskId: target.taskId, label: linkedTask?.taskName || 'Linked Task' };
        }
      }

      const text = e.dataTransfer.getData('text/plain');
      const markdownMatch = text.match(/\[([^\]]+)\]\(task:\/\/([^/]+)\/([^)]+)\)/);
      if (markdownMatch) {
        return { fileId: markdownMatch[2], taskId: markdownMatch[3], label: markdownMatch[1] };
      }

      return null;
  };

  const getDraggedAsset = (e: React.DragEvent): AssetLinkRecord | null => {
      const raw = e.dataTransfer.getData(ASSET_LINK_DRAG_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { id?: string; name?: string; mime?: string; kind?: AssetKind };
          if (parsed?.id && assets[parsed.id]) {
            const mime = parsed.mime || getAssetMimeType(assets[parsed.id]);
            const kind = parsed.kind || getAssetKindFromMime(mime);
            const rawName = parsed.name || assetNameMap[parsed.id] || parsed.id;
            return {
              id: parsed.id,
              name: rawName,
              displayName: getAssetDisplayName(rawName, parsed.id, kind),
              mime,
              kind,
              data: assets[parsed.id]
            };
          }
        } catch {
          // Ignore malformed asset payloads and try the URI format.
        }
      }

      const uri = e.dataTransfer.getData('text/uri-list');
      if (uri?.startsWith('asset://')) {
        const assetId = uri.replace('asset://', '').trim();
        const assetData = assets[assetId];
        if (assetData) {
          const mime = getAssetMimeType(assetData);
          const kind = getAssetKindFromMime(mime);
          const rawName = assetNameMap[assetId] || assetId;
          return {
            id: assetId,
            name: rawName,
            displayName: getAssetDisplayName(rawName, assetId, kind),
            mime,
            kind,
            data: assetData
          };
        }
      }

      return null;
  };

  const getDraggedFile = (e: React.DragEvent): { id: string; name: string } | null => {
      const raw = e.dataTransfer.getData(FILE_LINK_DRAG_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { id?: string; name?: string };
          if (parsed?.id) {
            return { id: parsed.id, name: parsed.name || projectFiles.find(f => f.id === parsed.id)?.name || 'Linked File' };
          }
        } catch {
          const fallback = projectFiles.find(f => f.id === raw);
          if (fallback) return { id: fallback.id, name: fallback.name };
        }
      }

      const uri = e.dataTransfer.getData('text/uri-list');
      if (uri?.startsWith('file://')) {
        const uriId = uri.replace('file://', '').trim();
        const file = projectFiles.find(f => f.id === uriId);
        if (file) return { id: file.id, name: file.name };
      }

      const text = e.dataTransfer.getData('text/plain');
      const mdMatch = text.match(/\[([^\]]+)\]\(file:\/\/([^)]+)\)/);
      if (mdMatch) {
        const fileId = mdMatch[2];
        const file = projectFiles.find(f => f.id === fileId);
        if (file) return { id: file.id, name: file.name };
      }

      const file = projectFiles.find(f => f.id === text.trim());
      if (!file) return null;
      return { id: file.id, name: file.name };
  };

  const handleEditorDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
      if (!getDraggedTask(e) && !getDraggedAsset(e) && !getDraggedFile(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
  };

  const handleEditorDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
      const draggedTask = getDraggedTask(e);
      if (draggedTask) {
        e.preventDefault();
        insertText(`[${draggedTask.label}](task://${draggedTask.fileId}/${draggedTask.taskId})`);
        return;
      }

      const draggedAsset = getDraggedAsset(e);
      if (draggedAsset) {
        e.preventDefault();
        insertText(`\n![${sanitizeAssetLabel(draggedAsset.displayName, 'Project Asset')}](asset://${draggedAsset.id})\n`);
        return;
      }

      const draggedFile = getDraggedFile(e);
      if (!draggedFile) return;
      e.preventDefault();
      insertText(`[${draggedFile.name}](file://${draggedFile.id})`);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const taskLink = target.closest('a[data-task-file-id][data-task-id]') as HTMLAnchorElement | null;
      if (taskLink) {
        e.preventDefault();
        const fileId = taskLink.dataset.taskFileId;
        const taskId = taskLink.dataset.taskId;
        if (!fileId || !taskId || !onOpenTask) return;
        onOpenTask(fileId, taskId);
        return;
      }
      const link = target.closest('a[data-file-id]') as HTMLAnchorElement | null;
      if (!link) return;
      e.preventDefault();
      const fileId = link.dataset.fileId;
      if (!fileId || !onOpenFile) return;
      onOpenFile(fileId);
  };

  const ToolbarButton = ({ icon: Icon, onClick, title, active = false, disabled = false, color }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-all flex items-center justify-center shrink-0 ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={title}
    >
      <Icon className={`w-4 h-4 ${color}`} />
    </button>
  );

  const PRESET_COLORS = [
      '#ef4444', // Red
      '#f97316', // Orange
      '#eab308', // Yellow
      '#22c55e', // Green
      '#3b82f6', // Blue
      '#a855f7', // Purple
      '#ec4899', // Pink
      '#71717a', // Zinc
      '#ffffff', // White
  ];

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Top Bar - Fixed Layout & Overflow */}
      <div className="min-h-[3.5rem] border-b border-zinc-800 flex flex-wrap items-center justify-between px-4 py-2 bg-zinc-950/90 backdrop-blur-sm sticky top-0 z-30 shrink-0 gap-y-2">
        <div className="flex items-center gap-4 flex-1 min-w-0">
           <h3 className="text-zinc-200 font-medium mr-2 truncate shrink-0 max-w-[150px]">{fileName}</h3>
           <div className="h-6 w-px bg-zinc-800 hidden sm:block shrink-0"></div>
           
           <div className="flex items-center gap-1 flex-wrap">
              {/* Text Style */}
              <ToolbarButton icon={Bold} onClick={() => insertText('**', '**')} title="Bold" />
              <ToolbarButton icon={Italic} onClick={() => insertText('*', '*')} title="Italic" />
              <ToolbarButton icon={Underline} onClick={() => insertText('<u>', '</u>')} title="Underline" />
              <ToolbarButton icon={Strikethrough} onClick={() => insertText('~~', '~~')} title="Strikethrough" />
              
              {/* Color Picker Toggle */}
               <div className="relative" ref={colorPickerRef}>
                   <ToolbarButton 
                     icon={Palette} 
                     onClick={() => setShowColorPicker(!showColorPicker)} 
                    title="Text Color" 
                    color="text-pink-400" 
                    active={showColorPicker}
                  />
                  
                  {/* Popover Menu */}
                  {showColorPicker && (
                      <div ref={popoverRef} className="absolute top-full left-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-3 z-50 w-48 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="grid grid-cols-5 gap-1.5">
                              {PRESET_COLORS.map(c => (
                                  <button
                                    key={c}
                                    onClick={() => applyColor(c)}
                                    className="w-6 h-6 rounded-full border border-zinc-700 hover:scale-110 transition-transform shadow-sm"
                                    style={{ backgroundColor: c }}
                                    title={c}
                                  />
                              ))}
                          </div>
                          <div className="h-px bg-zinc-800 w-full"></div>
                          <div className="flex items-center gap-2">
                              <input 
                                type="color" 
                                value={customColor}
                                onChange={(e) => setCustomColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                              />
                              <button 
                                onClick={() => applyColor(customColor)}
                                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-white py-1.5 rounded transition-colors"
                              >
                                Apply
                              </button>
                          </div>
                      </div>
                  )}
              </div>

              <div className="w-px h-4 bg-zinc-800 mx-1"></div>

              {/* Structure */}
              <ToolbarButton icon={Heading1} onClick={() => insertText('# ')} title="Heading 1" />
               <ToolbarButton icon={Heading2} onClick={() => insertText('## ')} title="Heading 2" />
               <ToolbarButton icon={List} onClick={() => insertText('- ')} title="Bullet List" />
               <ToolbarButton icon={Quote} onClick={() => insertText('> ')} title="Quote" />
               <ToolbarButton icon={Code} onClick={() => insertText('```\n', '\n```')} title="Code Block" />
               <div className="relative" ref={taskLinkPickerRef}>
                 <ToolbarButton
                   icon={CheckSquare}
                   onClick={toggleTaskLinkPicker}
                   title={linkableTasks.length === 0 ? 'No tasks available to link' : 'Insert Task Link'}
                   color="text-emerald-400"
                   disabled={linkableTasks.length === 0}
                   active={showTaskLinkPicker}
                 />
                 {showTaskLinkPicker && (
                   <div
                     className="absolute left-0 top-full mt-2 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
                   >
                     <input
                       type="text"
                       value={taskLinkQuery}
                       onChange={(e) => setTaskLinkQuery(e.target.value)}
                       placeholder="Search tasks..."
                       className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
                       autoFocus
                     />
                     <div className="max-h-56 space-y-1 overflow-y-auto custom-scrollbar">
                       {filteredLinkableTasks.length === 0 ? (
                         <p className="px-2 py-2 text-xs text-zinc-500">No matching tasks.</p>
                       ) : (
                         filteredLinkableTasks.map(task => (
                           <button
                             key={`${task.fileId}-${task.taskId}`}
                             type="button"
                             onClick={() => insertTaskLink(task.fileId, task.taskId)}
                             className="w-full rounded px-2 py-2 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                             title={`${task.fileName} • ${task.taskId}`}
                           >
                             <div className="truncate font-medium text-zinc-200">{task.taskName}</div>
                             <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                               <span className="truncate">{task.fileName}</span>
                               <span>{task.status}</span>
                             </div>
                             {task.tags.length > 0 && (
                               <div className="mt-1 truncate text-[10px] text-zinc-400">
                                 {task.tags.map(tag => `#${tag}`).join(' ')}
                               </div>
                             )}
                           </button>
                         ))
                       )}
                     </div>
                   </div>
                 )}
               </div>
                <div className="relative" ref={fileLinkPickerRef}>
                  <ToolbarButton
                    icon={LinkIcon}
                   onClick={toggleLinkPicker}
                  title={linkableFiles.length === 0 ? 'No files available to link' : 'Insert File Link'}
                  color="text-cyan-400"
                  disabled={linkableFiles.length === 0}
                  active={showLinkPicker}
                 />
                 {showLinkPicker && (
                   <div
                     className="absolute left-0 top-full mt-2 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
                  >
                    <input
                      type="text"
                      value={linkPickerQuery}
                      onChange={(e) => setLinkPickerQuery(e.target.value)}
                      placeholder="Search files..."
                      className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
                      autoFocus
                    />
                    <div className="max-h-48 space-y-1 overflow-y-auto custom-scrollbar">
                      {filteredLinkableFiles.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-zinc-500">No matching files.</p>
                      ) : (
                        filteredLinkableFiles.map(file => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => insertFileLink(file.id)}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                            title={file.id}
                          >
                            <span className="truncate pr-2">{file.name}</span>
                            <span className="text-[10px] text-zinc-500">{file.id.slice(0, 8)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  )}
                </div>
               
               <div className="w-px h-4 bg-zinc-800 mx-1"></div>

               {/* Media Upload */}
               <div className="relative" ref={assetPickerRef}>
                 <ToolbarButton
                   icon={FolderOpen}
                   onClick={toggleAssetPicker}
                   title={linkableAssets.length === 0 ? 'No library assets available' : 'Insert Media from Asset Library'}
                   color="text-violet-400"
                   disabled={linkableAssets.length === 0}
                   active={showAssetPicker}
                 />
                 {showAssetPicker && (
                    <div className="absolute left-0 top-full mt-2 z-50 w-96 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
                      <input
                        type="text"
                        value={assetQuery}
                        onChange={(e) => setAssetQuery(e.target.value)}
                        placeholder="Search assets by name, type, or id..."
                        className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
                        autoFocus
                      />
                      <div className="max-h-56 space-y-1 overflow-y-auto custom-scrollbar">
                        {filteredLinkableAssets.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-zinc-500">No matching assets.</p>
                        ) : (
                          filteredLinkableAssets.map(asset => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => insertAssetReference(asset.id)}
                              className="w-full rounded px-2 py-2 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                              title={`${asset.mime} • ${asset.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
                                  {asset.kind === 'image' ? (
                                    <img src={asset.data} alt={asset.displayName} className="h-full w-full object-cover" />
                                  ) : asset.kind === 'video' ? (
                                    <video src={asset.data} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                                  ) : asset.kind === 'audio' ? (
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-600/20 to-zinc-950 text-purple-300">
                                      <Music className="h-6 w-6" />
                                    </div>
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-500">
                                      <FolderOpen className="h-6 w-6" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-zinc-200">{asset.displayName}</div>
                                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                                    <span className="uppercase">{asset.kind}</span>
                                    <span className="truncate">{asset.mime}</span>
                                  </div>
                                  <div className="mt-1 truncate text-[10px] text-zinc-600">
                                    {asset.name !== asset.displayName ? `ID ${asset.id.slice(0, 8)}` : asset.id}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                     </div>
                   </div>
                 )}
               </div>
               <input 
                 type="file" 
                 ref={fileInputRef} 
                className="hidden" 
                accept="image/*,video/*,audio/*" 
                onChange={handleMediaUpload} 
              />
              
              <ToolbarButton 
                  icon={ImageIcon} 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Insert Image"
                  color="text-emerald-400"
              />
              <ToolbarButton 
                  icon={Video} 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Insert Video"
                  color="text-blue-400"
              />
              <ToolbarButton 
                  icon={Music} 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Insert Audio"
                  color="text-purple-400"
              />
           </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <div className="flex items-center gap-0.5 mr-1">
            <button onClick={() => { const prev = undoRedo.undo(); if (prev !== undefined) { setContent(prev); lastUndoPushRef.current = prev; } }} disabled={!undoRedo.canUndo} className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
            <button onClick={() => { const next = undoRedo.redo(); if (next !== undefined) { setContent(next); lastUndoPushRef.current = next; } }} disabled={!undoRedo.canRedo} className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center mr-2 hidden sm:flex">
            {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /></span>}
            {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /></span>}
            {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /></span>}
          </div>

          <div className="flex bg-zinc-800 p-1 rounded-lg border border-zinc-700 hidden sm:flex">
            <button onClick={() => setViewMode('edit')} className={`p-1.5 rounded transition-all ${viewMode === 'edit' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`} title="Edit Only"><PenTool className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('split')} className={`p-1.5 rounded transition-all ${viewMode === 'split' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`} title="Split View"><Columns className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('preview')} className={`p-1.5 rounded transition-all ${viewMode === 'preview' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`} title="Preview Only"><Eye className="w-4 h-4" /></button>
          </div>
          <button onClick={handleClear} className="p-2 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400 transition-colors" title="Clear Document"><Trash2 className="w-4 h-4" /></button>
          
          <button 
            onClick={handleManualSave} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-200'}`}
          >
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Editor Pane */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={`h-full flex flex-col ${viewMode === 'split' ? 'w-1/2 border-r border-zinc-800' : 'w-full'}`}>
            <textarea
              ref={textareaRef}
              className="w-full h-full bg-zinc-950 p-6 text-zinc-300 font-mono text-sm resize-none focus:outline-none leading-relaxed custom-scrollbar selection:bg-blue-500/30"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onDragOver={handleEditorDragOver}
              onDrop={handleEditorDrop}
              placeholder="# Start writing..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview Pane - Custom Render */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`h-full overflow-auto custom-scrollbar bg-zinc-900 ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
             <div 
                ref={previewPaneRef}
                onClick={handlePreviewClick}
                className="max-w-3xl mx-auto p-8 prose prose-invert prose-headings:border-b-0"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
             />
          </div>
        )}
      </div>
    </div>
  );
};

export default DocEditor;
