import React, { useMemo, useState } from 'react';
import { Bookmark, BookmarkMinus, ChevronRight, Hash } from 'lucide-react';
import { ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { extractTags } from '../../utils/markdown';
import { showMenu } from '../../stores/useMenuStore';
import { cn } from '../ui';

const Empty: React.FC<{ icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-faint">
    <Icon className="h-5 w-5" />
    {children}
  </div>
);

/** Obsidian's Bookmarks panel. */
export const BookmarksPanel: React.FC<{
  files: ProjectFile[];
  bookmarkIds: string[];
  activeFileId: string | null;
  onOpen: (id: string, newTab: boolean) => void;
  onRemove: (id: string) => void;
}> = ({ files, bookmarkIds, activeFileId, onOpen, onRemove }) => {
  const items = bookmarkIds.map(id => files.find(f => f.id === id)).filter((f): f is ProjectFile => Boolean(f));
  if (items.length === 0) {
    return <Empty icon={Bookmark}>No bookmarks yet. Right-click a file or tab and choose "Bookmark".</Empty>;
  }
  return (
    <div className="min-h-0 overflow-y-auto px-1.5 py-2">
      {items.map(file => {
        const Icon = getFileTypeMeta(file.type).icon;
        return (
          <div
            key={file.id}
            role="button"
            tabIndex={0}
            onClick={e => onOpen(file.id, e.ctrlKey || e.metaKey)}
            onKeyDown={e => { if (e.key === 'Enter') onOpen(file.id, false); }}
            onContextMenu={e => showMenu(e, [{ label: 'Remove bookmark', icon: BookmarkMinus, onSelect: () => onRemove(file.id) }])}
            className={cn('nav-row group cursor-pointer px-2', activeFileId === file.id && 'is-active')}
            title={file.name}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onRemove(file.id); }}
              className="rounded p-0.5 text-faint opacity-0 hover:text-content group-hover:opacity-100"
              aria-label={`Remove bookmark for ${file.name}`}
            >
              <BookmarkMinus className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

interface TagNode {
  name: string;
  full: string;
  count: number;
  children: Map<string, TagNode>;
}

/** Obsidian's Tags panel: nested tags (a/b) with document counts. */
export const TagsPanel: React.FC<{ files: ProjectFile[]; onSelect: (tag: string) => void }> = ({ files, onSelect }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => {
    const root: TagNode = { name: '', full: '', count: 0, children: new Map() };
    for (const file of files) {
      if (file.type !== 'doc' || typeof file.content !== 'string') continue;
      // Count each document once per tag (and once per ancestor).
      const seen = new Set<string>();
      for (const tag of extractTags(file.content)) {
        let node = root;
        tag.split('/').filter(Boolean).forEach((part, i, parts) => {
          const full = parts.slice(0, i + 1).join('/');
          if (!node.children.has(part)) node.children.set(part, { name: part, full, count: 0, children: new Map() });
          node = node.children.get(part)!;
          if (!seen.has(full)) {
            seen.add(full);
            node.count += 1;
          }
        });
      }
    }
    return root;
  }, [files]);

  if (tree.children.size === 0) {
    return <Empty icon={Hash}>No tags yet. Add #tags to documents (or a tags property).</Empty>;
  }

  const render = (node: TagNode, depth: number): React.ReactNode =>
    Array.from(node.children.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map(child => {
        const open = !collapsed.has(child.full);
        return (
          <div key={child.full}>
            <div className="nav-row group cursor-pointer pr-2" style={{ paddingLeft: 4 + depth * 14 }} onClick={() => onSelect(child.full)}>
              <button
                type="button"
                aria-label={open ? 'Collapse' : 'Expand'}
                onClick={e => {
                  e.stopPropagation();
                  setCollapsed(prev => {
                    const next = new Set(prev);
                    if (next.has(child.full)) next.delete(child.full);
                    else next.add(child.full);
                    return next;
                  });
                }}
                className={cn('shrink-0 rounded p-px text-faint hover:text-content', child.children.size === 0 && 'invisible')}
              >
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
              </button>
              <span className="min-w-0 flex-1 truncate">#{child.name}</span>
              <span className="shrink-0 rounded bg-surface-hover px-1.5 text-[10px] text-faint">{child.count}</span>
            </div>
            {open && child.children.size > 0 && render(child, depth + 1)}
          </div>
        );
      });

  return <div className="min-h-0 overflow-y-auto px-1.5 py-2">{render(tree, 0)}</div>;
};

