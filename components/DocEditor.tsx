import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Italic, Strikethrough, Highlighter, Code, Heading, List, ListOrdered, ListTodo, Quote, Table, Minus,
  Link as LinkIcon, CheckSquare, ImagePlus, Palette, Undo2, Redo2, PenLine, Columns, BookOpen, MoreHorizontal,
  Trash2, Download, Copy, Sigma, Workflow, MessageSquareQuote, SquareCode, FileCode2, FolderOpen, Music, Type,
} from 'lucide-react';
import { confirmDialog, toast, useUiStore } from '../stores/useUiStore';
import { showMenu } from '../stores/useMenuStore';
import { EditorProps, TodoItem } from '../types';
import { ASSET_LINK_DRAG_MIME, getAssetDisplayName, getAssetKindFromMime, getAssetMimeType, sanitizeAssetLabel } from '../services/assetUtils';
import { REVEAL_HEADING_EVENT, RevealHeadingDetail, INSERT_TEXT_EVENT, InsertTextDetail } from '../utils/events';
import { extractTags, resolveWikilink } from '../utils/markdown';
import { getFileTypeMeta } from './fileTypes';
import MarkdownEditor, { MarkdownEditorHandle, MarkdownEditorContext } from './markdown/MarkdownEditor';
import MarkdownView from './markdown/MarkdownView';
import SearchPicker, { PickerItem } from './ui/SearchPicker';
import { cn } from './ui';

const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const TASK_LINK_DRAG_MIME = 'application/x-gdpm-task-link';
const AUTOSAVE_MS = 600;

type ViewMode = 'edit' | 'split' | 'preview';
type PickerKind = 'file' | 'task' | 'asset';

const TEXT_COLORS: { name: string; value: string }[] = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Grey', value: '#71717a' },
];

const swatch = (color: string): React.ComponentType<{ className?: string }> => {
  const Swatch = ({ className }: { className?: string }) => (
    <span className={cn('inline-block rounded-full', className)} style={{ backgroundColor: color }} />
  );
  return Swatch;
};

const ToolbarButton: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
}> = ({ icon: Icon, title, onClick, active, disabled }) => (
  <button
    type="button"
    onMouseDown={e => e.preventDefault() /* keep the editor selection */}
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={cn(
      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-35',
      active ? 'bg-accent/15 text-accent' : 'text-faint hover:bg-surface-hover hover:text-content',
    )}
  >
    <Icon className="h-4 w-4" />
  </button>
);

const Divider = () => <span className="mx-1 h-4 w-px shrink-0 bg-border" />;

/**
 * Markdown document editor: CodeMirror live preview / source editing, an
 * Obsidian-style reading view, and inserts for links, tasks, and media.
 */
const DocEditor: React.FC<EditorProps> = ({
  initialContent,
  onSave,
  fileName,
  assets = {},
  onAddAsset,
  projectFiles = [],
  projectFolders = [],
  activeFileId,
  instanceId,
  onOpenFile,
  onOpenTask,
  onOpenHref,
}) => {
  const prefs = useUiStore(s => s.prefs);
  const setPref = useUiStore(s => s.setPref);
  const [content, setContent] = useState<string>(typeof initialContent === 'string' ? initialContent : '');
  // An empty document has nothing to read yet, so it always opens for editing.
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    prefs.docViewMode === 'preview' && !String(initialContent ?? '').trim() ? 'edit' : prefs.docViewMode);
  const [previewSource, setPreviewSource] = useState(content);
  const [picker, setPicker] = useState<{ kind: PickerKind; anchor: HTMLElement } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved'>('saved');

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef(content);
  const latestRef = useRef(content);
  latestRef.current = content;

  // The toolbar toggle and Settings share one pref, so the last-chosen mode
  // becomes the default for the next document.
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    setPref('docViewMode', mode);
  };

  // --- Persistence -----------------------------------------------------------

  const saveNow = useCallback(() => {
    if (latestRef.current === lastSavedRef.current) return;
    onSave(latestRef.current);
    lastSavedRef.current = latestRef.current;
    setSaveStatus('saved');
  }, [onSave]);

  useEffect(() => {
    if (content === lastSavedRef.current) return;
    setSaveStatus('unsaved');
    const timer = window.setTimeout(saveNow, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [content, saveNow]);

  // Flush on unmount (switching files) so nothing typed is lost.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  useEffect(() => () => saveNowRef.current(), []);

  // Content changed outside this editor (rename link updates, another tab).
  useEffect(() => {
    if (typeof initialContent !== 'string') return;
    if (initialContent !== latestRef.current && initialContent !== lastSavedRef.current) {
      lastSavedRef.current = initialContent;
      setContent(initialContent);
      setSaveStatus('saved');
    }
  }, [initialContent]);

  // Reading view re-renders off the typing path.
  useEffect(() => {
    if (viewMode === 'edit') return;
    const timer = window.setTimeout(() => setPreviewSource(content), viewMode === 'preview' ? 0 : 200);
    return () => window.clearTimeout(timer);
  }, [content, viewMode]);

  // --- Project data for completion, pickers, and links -----------------------

  const assetLibrary = useMemo(() => projectFiles.find(f => f.type === 'asset-gallery'), [projectFiles]);
  const assetNameMap = useMemo(() => {
    const map = (assetLibrary?.content as { assetNameMap?: Record<string, string> } | undefined)?.assetNameMap;
    return map && typeof map === 'object' ? map : {};
  }, [assetLibrary]);

  const assetRecords = useMemo(() => Object.entries(assets).map(([id, data]) => {
    const mime = getAssetMimeType(data);
    const kind = getAssetKindFromMime(mime);
    return { id, data, mime, kind, displayName: getAssetDisplayName(assetNameMap[id] || id, id, kind) };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName)), [assets, assetNameMap]);

  const taskRecords = useMemo(() => projectFiles
    .filter(f => f.type === 'todo')
    .flatMap(f => ((f.content as { items?: TodoItem[] })?.items || [])
      .filter(item => item?.id && typeof item.text === 'string')
      .map(item => ({ fileId: f.id, taskId: item.id, name: item.text, fileName: f.name, status: item.status }))), [projectFiles]);

  const templatesFolderId = useMemo(
    () => projectFolders.find(f => f.name.toLowerCase() === prefs.templatesFolder.toLowerCase())?.id,
    [projectFolders, prefs.templatesFolder],
  );

  /** Wikilink when the name is unique in the project, otherwise an id link. */
  const linkTo = useCallback((fileId: string) => {
    const file = projectFiles.find(f => f.id === fileId);
    if (!file) return '';
    const unique = projectFiles.filter(f => f.name.toLowerCase() === file.name.toLowerCase()).length === 1;
    return unique && !/[[\]|#]/.test(file.name) ? `[[${file.name}]]` : `[${file.name}](file://${file.id})`;
  }, [projectFiles]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const f of projectFiles) if (f.type === 'doc' && typeof f.content === 'string') extractTags(f.content).forEach(t => tags.add(t));
    return Array.from(tags).sort();
  }, [projectFiles]);

  const openHref = useCallback((href: string, newTab = false) => {
    if (onOpenHref) {
      onOpenHref(href, newTab);
      return;
    }
    if (href.startsWith('file://')) onOpenFile?.(href.slice('file://'.length));
    else if (href.startsWith('task://')) {
      const [fileId, taskId] = href.slice('task://'.length).split('/');
      if (fileId && taskId) onOpenTask?.(fileId, taskId);
    } else if (/^https?:\/\//.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  }, [onOpenFile, onOpenHref, onOpenTask]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!onAddAsset) return null;
    const parts: string[] = [];
    for (const file of files) {
      try {
        const url = await onAddAsset(file);
        parts.push(`![${sanitizeAssetLabel(file.name.replace(/\.[^.]+$/, ''), 'Media')}](${url})`);
      } catch (err) {
        console.error('Upload failed', err);
        toast.error(`Couldn't add ${file.name}.`);
      }
    }
    return parts.length ? parts.join('\n') : null;
  }, [onAddAsset]);

  const linkForDrop = useCallback((data: DataTransfer): string | null => {
    const task = data.getData(TASK_LINK_DRAG_MIME);
    if (task) {
      try {
        const parsed = JSON.parse(task) as { fileId?: string; taskId?: string; label?: string };
        if (parsed.fileId && parsed.taskId) return `[${parsed.label || 'Task'}](task://${parsed.fileId}/${parsed.taskId})`;
      } catch { /* fall through */ }
    }
    const asset = data.getData(ASSET_LINK_DRAG_MIME);
    if (asset) {
      try {
        const parsed = JSON.parse(asset) as { id?: string; name?: string };
        if (parsed.id && assets[parsed.id]) return `![${sanitizeAssetLabel(parsed.name || 'Asset', 'Asset')}](asset://${parsed.id})`;
      } catch { /* fall through */ }
    }
    const file = data.getData(FILE_LINK_DRAG_MIME);
    if (file) {
      try {
        const parsed = JSON.parse(file) as { id?: string };
        if (parsed.id) return linkTo(parsed.id) || null;
      } catch {
        if (projectFiles.some(f => f.id === file)) return linkTo(file);
      }
    }
    const uri = data.getData('text/uri-list');
    if (uri.startsWith('asset://') && assets[uri.slice(8).trim()]) return `![Asset](${uri.trim()})`;
    if (uri.startsWith('task://')) return `[Task](${uri.trim()})`;
    return null;
  }, [assets, linkTo, projectFiles]);

  // The CodeMirror context reads through a ref, so it can stay stable.
  const ctxData = useRef({ projectFiles, assets, allTags, templatesFolderId, linkForDrop, uploadFiles, openHref });
  ctxData.current = { projectFiles, assets, allTags, templatesFolderId, linkForDrop, uploadFiles, openHref };
  const editorContext = useMemo<MarkdownEditorContext>(() => ({
    resolveAsset: id => ctxData.current.assets[id],
    wikilinkExists: target => Boolean(resolveWikilink(target, ctxData.current.projectFiles)),
    openHref: (href, newTab) => ctxData.current.openHref(href, newTab),
    files: () => ctxData.current.projectFiles
      .filter(f => f.id !== activeFileId)
      .map(f => ({ name: f.name, detail: getFileTypeMeta(f.type).label })),
    tags: () => ctxData.current.allTags,
    templates: () => ctxData.current.projectFiles
      .filter(f => f.type === 'doc' && f.folderId && f.folderId === ctxData.current.templatesFolderId && typeof f.content === 'string')
      .map(f => ({ name: f.name, content: f.content as string })),
    uploadFiles: files => ctxData.current.uploadFiles(files),
    linkForDrop: data => ctxData.current.linkForDrop(data),
  }), [activeFileId]);
  const contextKey = useMemo(
    () => `${projectFiles.map(f => f.name).join('\u0000')}|${Object.keys(assets).length}`,
    [projectFiles, assets],
  );

  // --- Outside requests (outline, templates) ---------------------------------

  useEffect(() => {
    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<RevealHeadingDetail>).detail;
      if (!detail || detail.fileId !== activeFileId || (detail.leafId && instanceId && detail.leafId !== instanceId)) return;
      if (viewMode !== 'preview') editorRef.current?.revealLine(detail.line);
      const pane = previewRef.current;
      if (pane && viewMode !== 'edit') {
        const headings = Array.from(pane.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
        const target = headings[detail.index]?.textContent?.trim() === detail.text
          ? headings[detail.index]
          : headings.find(h => h.textContent?.trim() === detail.text) || headings[detail.index];
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    };
    const onInsert = (event: Event) => {
      const detail = (event as CustomEvent<InsertTextDetail>).detail;
      if (!detail || detail.fileId !== activeFileId || (detail.leafId && instanceId && detail.leafId !== instanceId)) return;
      if (viewMode === 'preview') setViewMode('edit');
      // Let the editor mount if we just switched out of reading view.
      window.setTimeout(() => editorRef.current?.insert(detail.text, { block: true }), 0);
    };
    window.addEventListener(REVEAL_HEADING_EVENT, onReveal);
    window.addEventListener(INSERT_TEXT_EVENT, onInsert);
    return () => {
      window.removeEventListener(REVEAL_HEADING_EVENT, onReveal);
      window.removeEventListener(INSERT_TEXT_EVENT, onInsert);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileId, instanceId, viewMode]);

  // --- Toolbar actions -------------------------------------------------------

  const ensureEditing = () => {
    if (viewMode === 'preview') setViewMode('edit');
  };
  const wrap = (before: string, after = before, placeholder = '') => { ensureEditing(); editorRef.current?.wrap(before, after, placeholder); };
  const prefix = (p: string) => { ensureEditing(); editorRef.current?.toggleLinePrefix(p); };
  const insertBlock = (text: string) => { ensureEditing(); editorRef.current?.insert(text, { block: true }); };

  const toggleTaskAt = (offset: number) => {
    // Offsets come from the rendered source; ignore clicks on a stale render.
    if (previewSource !== content) return;
    const lineEnd = content.indexOf('\n', offset);
    const segment = content.slice(offset, lineEnd === -1 ? undefined : lineEnd);
    const m = /\[( |x|X)\]/.exec(segment);
    if (!m) return;
    const at = offset + (m.index ?? 0) + 1;
    setContent(content.slice(0, at) + (m[1] === ' ' ? 'x' : ' ') + content.slice(at + 1));
  };

  const handleClear = () => {
    void confirmDialog({
      title: 'Clear the entire document?',
      message: 'This removes all content. You can still undo while the document stays open.',
      confirmText: 'Clear document',
      danger: true,
    }).then(ok => { if (ok) setContent(''); });
  };

  const exportMarkdown = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/[^\w.-]+/g, '_') || 'document'}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pickerItems: PickerItem[] = useMemo(() => {
    if (!picker) return [];
    if (picker.kind === 'file') {
      return projectFiles.filter(f => f.id !== activeFileId).map(f => ({
        id: f.id, label: f.name, sub: getFileTypeMeta(f.type).label, icon: getFileTypeMeta(f.type).icon,
      }));
    }
    if (picker.kind === 'task') {
      return taskRecords.map(t => ({ id: `${t.fileId}/${t.taskId}`, label: t.name, sub: `${t.fileName} · ${t.status}`, icon: CheckSquare }));
    }
    return assetRecords.map(a => ({
      id: a.id,
      label: a.displayName,
      sub: a.mime,
      thumb: a.kind === 'image' || a.kind === 'video' ? a.data : undefined,
      icon: a.kind === 'audio' ? Music : FolderOpen,
    }));
  }, [picker, projectFiles, activeFileId, taskRecords, assetRecords]);

  const onPick = (item: PickerItem) => {
    if (!picker) return;
    ensureEditing();
    if (picker.kind === 'file') editorRef.current?.insert(linkTo(item.id));
    else if (picker.kind === 'task') editorRef.current?.insert(`[${item.label}](task://${item.id})`);
    else editorRef.current?.insert(`![${sanitizeAssetLabel(item.label, 'Asset')}](asset://${item.id})`, { block: true });
  };

  const openPicker = (kind: PickerKind) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const anchor = e.currentTarget;
    setPicker(prev => (prev?.kind === kind ? null : { kind, anchor }));
  };

  const headingMenu = (e: React.MouseEvent) => showMenu(e, [
    { label: 'Heading 1', icon: Heading, hint: '#', onSelect: () => prefix('# ') },
    { label: 'Heading 2', icon: Heading, hint: '##', onSelect: () => prefix('## ') },
    { label: 'Heading 3', icon: Heading, hint: '###', onSelect: () => prefix('### ') },
    { label: 'Heading 4', icon: Heading, hint: '####', onSelect: () => prefix('#### ') },
    { label: 'Body text', icon: Type, onSelect: () => prefix('') },
  ], 'below');

  const insertMenu = (e: React.MouseEvent) => showMenu(e, [
    { label: 'Callout', icon: MessageSquareQuote, onSelect: () => insertBlock('> [!note] Title\n> Contents') },
    { label: 'Table', icon: Table, onSelect: () => insertBlock('| Column | Column |\n| --- | --- |\n|  |  |') },
    { label: 'Code block', icon: SquareCode, onSelect: () => insertBlock('```\n\n```') },
    { label: 'Math block', icon: Sigma, onSelect: () => insertBlock('$$\n\n$$') },
    { label: 'Mermaid diagram', icon: Workflow, onSelect: () => insertBlock('```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```') },
    { label: 'Divider', icon: Minus, onSelect: () => insertBlock('---') },
    { label: 'Properties', icon: FileCode2, onSelect: () => { ensureEditing(); if (!content.startsWith('---')) setContent(`---\ntags: \n---\n${content}`); } },
  ], 'below');

  const colorMenu = (e: React.MouseEvent) => showMenu(e, TEXT_COLORS.map(c => ({
    label: c.name,
    icon: swatch(c.value),
    onSelect: () => wrap(`<span style="color: ${c.value}">`, '</span>', 'colored text'),
  })), 'below');

  const moreMenu = (e: React.MouseEvent) => showMenu(e, [
    { label: prefs.livePreview ? 'Switch to source mode' : 'Switch to live preview', icon: PenLine, onSelect: () => setPref('livePreview', !prefs.livePreview) },
    { label: 'Copy as markdown', icon: Copy, onSelect: () => { void navigator.clipboard?.writeText(content).then(() => toast.success('Copied to clipboard.')); } },
    { label: 'Export as .md file', icon: Download, onSelect: exportMarkdown },
    { kind: 'separator' },
    { label: 'Clear document', icon: Trash2, danger: true, onSelect: handleClear },
  ], 'below');

  const editing = viewMode !== 'preview';

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/70 bg-bg px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {editing && (
          <>
            <ToolbarButton icon={Heading} title="Heading" onClick={headingMenu} />
            <ToolbarButton icon={Bold} title="Bold (Ctrl+B)" onClick={() => wrap('**', '**', 'bold text')} />
            <ToolbarButton icon={Italic} title="Italic (Ctrl+I)" onClick={() => wrap('*', '*', 'italic text')} />
            <ToolbarButton icon={Strikethrough} title="Strikethrough (Ctrl+Shift+X)" onClick={() => wrap('~~', '~~', 'text')} />
            <ToolbarButton icon={Highlighter} title="Highlight (Ctrl+Shift+H)" onClick={() => wrap('==', '==', 'highlight')} />
            <ToolbarButton icon={Code} title="Inline code (Ctrl+E)" onClick={() => wrap('`', '`', 'code')} />
            <ToolbarButton icon={Palette} title="Text color" onClick={colorMenu} />
            <Divider />
            <ToolbarButton icon={List} title="Bullet list" onClick={() => prefix('- ')} />
            <ToolbarButton icon={ListOrdered} title="Numbered list" onClick={() => prefix('1. ')} />
            <ToolbarButton icon={ListTodo} title="Task (Ctrl+L)" onClick={() => prefix('- [ ] ')} />
            <ToolbarButton icon={Quote} title="Quote" onClick={() => prefix('> ')} />
            <ToolbarButton icon={SquareCode} title="Insert block…" onClick={insertMenu} />
            <Divider />
            <ToolbarButton icon={LinkIcon} title="Link to file ([[)" onClick={openPicker('file')} active={picker?.kind === 'file'} disabled={projectFiles.length < 2} />
            <ToolbarButton icon={CheckSquare} title="Link to task" onClick={openPicker('task')} active={picker?.kind === 'task'} disabled={taskRecords.length === 0} />
            <ToolbarButton icon={FolderOpen} title="Insert from asset library" onClick={openPicker('asset')} active={picker?.kind === 'asset'} disabled={assetRecords.length === 0} />
            <ToolbarButton icon={ImagePlus} title="Upload image, video, or audio (or paste/drop it)" onClick={() => fileInputRef.current?.click()} disabled={!onAddAsset} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              className="hidden"
              onChange={async e => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                const md = await uploadFiles(files);
                if (md) insertBlock(md);
              }}
            />
            <Divider />
            <ToolbarButton icon={Undo2} title="Undo (Ctrl+Z)" onClick={() => editorRef.current?.undo()} />
            <ToolbarButton icon={Redo2} title="Redo (Ctrl+Shift+Z)" onClick={() => editorRef.current?.redo()} />
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <span
            className={cn('mr-1 h-1.5 w-1.5 rounded-full', saveStatus === 'saved' ? 'bg-success/70' : 'bg-warning')}
            title={saveStatus === 'saved' ? 'Saved' : 'Unsaved changes (saving shortly — Ctrl+S to save now)'}
          />
          <div className="flex rounded-md border border-border bg-surface-raised p-0.5" role="radiogroup" aria-label="Document view">
            {([
              { id: 'edit', icon: PenLine, label: prefs.livePreview ? 'Editing (live preview)' : 'Editing (source mode)' },
              { id: 'split', icon: Columns, label: 'Split view' },
              { id: 'preview', icon: BookOpen, label: 'Reading view' },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={viewMode === id}
                title={label}
                aria-label={label}
                onClick={() => setViewMode(id)}
                className={cn(
                  'rounded p-1 transition-colors',
                  id === 'split' && 'hidden md:block',
                  viewMode === id ? 'bg-surface-hover text-content' : 'text-faint hover:text-content',
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <ToolbarButton icon={MoreHorizontal} title="More" onClick={moreMenu} />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {editing && (
          <div className={cn('h-full min-w-0', viewMode === 'split' ? 'w-1/2 border-r border-border' : 'w-full')}>
            <MarkdownEditor
              ref={editorRef}
              value={content}
              onChange={setContent}
              onSave={saveNow}
              livePreview={prefs.livePreview}
              spellcheck={prefs.spellcheck}
              context={editorContext}
              contextKey={contextKey}
            />
          </div>
        )}
        {viewMode !== 'edit' && (
          <div ref={previewRef} className={cn('h-full min-w-0 overflow-y-auto', viewMode === 'split' ? 'w-1/2' : 'w-full')}>
            <div className="mx-auto max-w-[var(--editor-lw)] px-6 py-8 sm:px-8">
              {previewSource.trim() ? (
                <MarkdownView
                  source={previewSource}
                  files={projectFiles}
                  assets={assets}
                  onOpenHref={openHref}
                  onToggleTask={toggleTaskAt}
                />
              ) : (
                <p className="text-faint">This document is empty. Switch to editing to start writing.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <SearchPicker
        anchor={picker?.anchor ?? null}
        items={pickerItems}
        placeholder={picker?.kind === 'file' ? 'Link to file…' : picker?.kind === 'task' ? 'Link to task…' : 'Insert asset…'}
        onPick={onPick}
        onClose={() => setPicker(null)}
      />
    </div>
  );
};

export default DocEditor;
