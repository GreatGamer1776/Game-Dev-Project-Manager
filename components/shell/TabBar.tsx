import React, { useEffect, useRef, useState } from 'react';
import {
  X, Pin, Plus, PanelRight, ChevronDown, Link2, Crosshair, File, Bookmark, BookmarkMinus, Columns2, Rows2,
  PanelRightOpen, PanelBottomOpen,
} from 'lucide-react';
import { GRAPH_VIEW_ID, getFileTypeMeta } from '../fileTypes';
import { ProjectFile } from '../../types';
import { showMenu } from '../../stores/useMenuStore';
import { Edge } from '../../hooks/useWorkspace';
import { TAB_DRAG_MIME, TabDragPayload, readTabDrag, readFileDrag } from './WorkspaceLayout';
import { cn } from '../ui';

const FILE_DRAG_MIME = 'application/x-gdpm-file-id';

export interface TabItem {
  /** Leaf id (a tab may show no file: "New tab"). */
  id: string;
  file: ProjectFile | null;
  pinned: boolean;
}

interface TabBarProps {
  paneId: string;
  isActivePane: boolean;
  multiPane: boolean;
  tabs: TabItem[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseToRight: (tabId: string) => void;
  onCloseAll: () => void;
  onTogglePin: (tabId: string) => void;
  /** A tab dropped onto this strip (from this or another pane). */
  onMoveTab: (from: TabDragPayload, beforeTabId: string | null) => void;
  /** Moves a tab of this pane into a new split. */
  onMoveTabToSplit: (tabId: string, edge: Edge) => void;
  /** A sidebar file dropped onto this strip opens as a new tab here. */
  onDropFile: (fileId: string) => void;
  onNewTab: () => void;
  onSplit: (edge: Edge) => void;
  onClosePane: () => void;
  onReveal: (fileId: string) => void;
  onCopyLink: (fileId: string) => void;
  bookmarkIds: string[];
  onToggleBookmark: (fileId: string) => void;
  /** Only one pane (the top-right one) carries the right-sidebar toggle. */
  showSidebarToggle: boolean;
  rightOpen: boolean;
  onToggleRight: () => void;
}

/** Obsidian-style tab header: rounded tabs on the chrome strip, active tab joins the pane. */
const TabBar: React.FC<TabBarProps> = ({
  paneId,
  isActivePane,
  multiPane,
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onTogglePin,
  onMoveTab,
  onMoveTabToSplit,
  onDropFile,
  onNewTab,
  onSplit,
  onClosePane,
  onReveal,
  onCopyLink,
  bookmarkIds,
  onToggleBookmark,
  showSidebarToggle,
  rightOpen,
  onToggleRight,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | 'end' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the active tab scrolled into view.
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length]);

  const tabMenu = (e: React.MouseEvent, tab: TabItem) => {
    const index = tabs.findIndex(t => t.id === tab.id);
    const file = tab.file;
    showMenu(e, [
      { label: 'Close', icon: X, onSelect: () => onClose(tab.id), disabled: tab.pinned },
      { label: 'Close others', onSelect: () => onCloseOthers(tab.id), disabled: tabs.length < 2 },
      { label: 'Close tabs to the right', onSelect: () => onCloseToRight(tab.id), disabled: index === tabs.length - 1 },
      { label: 'Close all', onSelect: onCloseAll },
      { kind: 'separator' },
      { label: 'Move to right split', icon: PanelRightOpen, onSelect: () => onMoveTabToSplit(tab.id, 'right') },
      { label: 'Move to split below', icon: PanelBottomOpen, onSelect: () => onMoveTabToSplit(tab.id, 'bottom') },
      { kind: 'separator' },
      { label: tab.pinned ? 'Unpin' : 'Pin', icon: Pin, onSelect: () => onTogglePin(tab.id) },
      ...(file && file.id !== GRAPH_VIEW_ID ? [
        bookmarkIds.includes(file.id)
          ? { label: 'Remove bookmark', icon: BookmarkMinus, onSelect: () => onToggleBookmark(file.id) }
          : { label: 'Bookmark', icon: Bookmark, onSelect: () => onToggleBookmark(file.id) },
        { label: 'Reveal file in navigation', icon: Crosshair, onSelect: () => onReveal(file.id) },
        { label: 'Copy link', icon: Link2, onSelect: () => onCopyLink(file.id) },
      ] : []),
    ]);
  };

  const tabListMenu = (e: React.MouseEvent) => {
    showMenu(e, [
      ...(tabs.length === 0
        ? [{ label: 'No open tabs', onSelect: () => undefined, disabled: true }]
        : tabs.map(tab => ({
            label: tab.file?.name ?? 'New tab',
            icon: tab.file ? getFileTypeMeta(tab.file.type).icon : File,
            checked: tab.id === activeTabId,
            onSelect: () => onActivate(tab.id),
          }))),
      { kind: 'separator' as const },
      { label: 'Split right', icon: Columns2, onSelect: () => onSplit('right') },
      { label: 'Split down', icon: Rows2, onSelect: () => onSplit('bottom') },
      ...(multiPane ? [{ label: 'Close this pane', icon: X, onSelect: onClosePane }] : []),
    ], 'below');
  };

  const accepts = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(TAB_DRAG_MIME) || e.dataTransfer.types.includes(FILE_DRAG_MIME);

  const handleDrop = (e: React.DragEvent, before: string | null) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    setDraggingId(null);
    const tab = readTabDrag(e.dataTransfer);
    if (tab) {
      if (tab.leafId !== before) onMoveTab(tab, before);
      return;
    }
    const fileId = readFileDrag(e.dataTransfer);
    if (fileId) onDropFile(fileId);
  };

  return (
    <div className={cn('flex h-[var(--header-h)] shrink-0 items-end border-b border-border bg-chrome pl-1.5 pr-1', multiPane && !isActivePane && 'opacity-75')}>
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open files"
        className={cn(
          'flex h-full min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          dropTarget === 'end' && 'bg-accent/10',
        )}
        onDoubleClick={e => { if (e.target === e.currentTarget) onNewTab(); }}
        onDragOver={e => {
          if (!accepts(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (e.target === e.currentTarget && dropTarget !== 'end') setDropTarget('end');
        }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
        onDrop={e => handleDrop(e, null)}
      >
        {tabs.map(tab => {
          const { file, pinned } = tab;
          const name = file?.name ?? 'New tab';
          const Icon = file ? getFileTypeMeta(file.type).icon : File;
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              data-active={active}
              draggable
              onDragStart={e => {
                setDraggingId(tab.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify({ paneId, leafId: tab.id } satisfies TabDragPayload));
              }}
              onDragOver={e => {
                if (!accepts(e)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (dropTarget !== tab.id) setDropTarget(tab.id);
              }}
              onDrop={e => handleDrop(e, tab.id)}
              onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
              onClick={() => onActivate(tab.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(tab.id); } }}
              onAuxClick={e => { if (e.button === 1 && !pinned) { e.preventDefault(); onClose(tab.id); } }}
              onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}
              onContextMenu={e => tabMenu(e, tab)}
              title={name}
              className={cn(
                'group/tab relative -mb-px flex h-[calc(var(--header-h)-6px)] min-w-[2.5rem] max-w-[200px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-md border border-b-0 pl-2.5 pr-1 text-[0.8125rem] transition-colors',
                active
                  ? 'border-border bg-bg text-content'
                  : 'border-transparent text-muted hover:bg-surface-hover/60 hover:text-content',
                draggingId === tab.id && 'opacity-50',
              )}
            >
              {/* Drop indicator: the dragged tab lands before this one. */}
              {dropTarget === tab.id && draggingId !== tab.id && <span className="absolute -left-[2px] bottom-1 top-1 w-0.5 rounded bg-accent" />}
              {/* Hides the strip's bottom border under the active tab. */}
              {active && <span className="absolute inset-x-0 -bottom-px h-px bg-bg" />}
              {active && isActivePane && multiPane && <span className="absolute inset-x-2 top-0 h-0.5 rounded-b bg-accent" />}
              <Icon className={cn('h-3.5 w-3.5 shrink-0', active && isActivePane ? 'text-accent' : 'text-faint')} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {pinned ? (
                <button
                  type="button"
                  aria-label={`Unpin ${name}`}
                  title="Unpin"
                  onClick={e => { e.stopPropagation(); onTogglePin(tab.id); }}
                  className="shrink-0 rounded p-0.5 text-faint hover:bg-surface-hover hover:text-content"
                >
                  <Pin className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`Close ${name}`}
                  title="Close (middle-click)"
                  onClick={e => { e.stopPropagation(); onClose(tab.id); }}
                  className={cn(
                    'shrink-0 rounded p-0.5 text-faint hover:bg-surface-hover hover:text-content',
                    active ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100 focus:opacity-100',
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onNewTab}
          title="New tab (or double-click the tab bar)"
          aria-label="New tab"
          className="icon-btn mb-1 ml-0.5 h-6 w-6"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 self-center pl-1">
        <button type="button" className="icon-btn" title="Open tabs and split options" aria-label="Tab list and split options" onClick={tabListMenu}>
          <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn hidden md:inline-flex" title="Split right" aria-label="Split right" onClick={() => onSplit('right')}>
          <Columns2 className="h-4 w-4" />
        </button>
        {multiPane && (
          <button type="button" className="icon-btn hidden md:inline-flex" title="Close this pane" aria-label="Close this pane" onClick={onClosePane}>
            <X className="h-4 w-4" />
          </button>
        )}
        {showSidebarToggle && (
          <button
            type="button"
            className="icon-btn"
            title={rightOpen ? 'Collapse right sidebar (Ctrl+Shift+\\)' : 'Expand right sidebar (Ctrl+Shift+\\)'}
            aria-label="Toggle right sidebar"
            aria-pressed={rightOpen}
            onClick={onToggleRight}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default TabBar;
