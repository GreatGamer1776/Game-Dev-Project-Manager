import React, { useEffect, useRef, useState } from 'react';
import { X, Pin, Plus, PanelRight, ChevronDown, Link2, Crosshair, File, Bookmark, BookmarkMinus } from 'lucide-react';
import { GRAPH_VIEW_ID } from '../fileTypes';
import { ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { showMenu } from '../../stores/useMenuStore';
import { cn } from '../ui';

export interface TabItem {
  /** Leaf id (a tab may show no file: "New tab"). */
  id: string;
  file: ProjectFile | null;
  pinned: boolean;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseToRight: (tabId: string) => void;
  onCloseAll: () => void;
  onTogglePin: (tabId: string) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onNewTab: () => void;
  onReveal: (fileId: string) => void;
  onCopyLink: (fileId: string) => void;
  bookmarkIds: string[];
  onToggleBookmark: (fileId: string) => void;
  rightOpen: boolean;
  onToggleRight: () => void;
}

/** Obsidian-style tab header: rounded tabs on the chrome strip, active tab joins the pane. */
const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onTogglePin,
  onReorder,
  onNewTab,
  onReveal,
  onCopyLink,
  bookmarkIds,
  onToggleBookmark,
  rightOpen,
  onToggleRight,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
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
    showMenu(e, tabs.length === 0
      ? [{ label: 'No open tabs', onSelect: () => undefined, disabled: true }]
      : tabs.map(tab => ({
          label: tab.file?.name ?? 'New tab',
          icon: tab.file ? getFileTypeMeta(tab.file.type).icon : File,
          checked: tab.id === activeTabId,
          onSelect: () => onActivate(tab.id),
        })), 'below');
  };

  return (
    <div className="flex h-[var(--header-h)] shrink-0 items-end border-b border-border bg-chrome pl-1.5 pr-1">
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open files"
        className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                e.dataTransfer.setData('application/x-gdpm-tab', tab.id);
              }}
              onDragOver={e => {
                if (!draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropId !== tab.id) setDropId(tab.id);
              }}
              onDrop={e => {
                e.preventDefault();
                if (draggingId) onReorder(draggingId, tab.id);
                setDraggingId(null);
                setDropId(null);
              }}
              onDragEnd={() => { setDraggingId(null); setDropId(null); }}
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
                dropId === tab.id && draggingId !== tab.id && 'ring-1 ring-inset ring-accent/60',
              )}
            >
              {/* Hides the strip's bottom border under the active tab. */}
              {active && <span className="absolute inset-x-0 -bottom-px h-px bg-bg" />}
              <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-accent' : 'text-faint')} />
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
                  title="Close"
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
          title="New tab"
          aria-label="New tab"
          className="icon-btn mb-1 ml-0.5 h-6 w-6"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 self-center pl-1">
        <button type="button" className="icon-btn" title="Open tabs" aria-label="List open tabs" onClick={tabListMenu}>
          <ChevronDown className="h-4 w-4" />
        </button>
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
      </div>
    </div>
  );
};

export default TabBar;
