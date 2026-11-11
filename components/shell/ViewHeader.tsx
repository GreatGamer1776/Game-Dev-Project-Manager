import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Link2, Hash, Crosshair, Trash2, Pin, X, Bookmark, Columns2, Rows2, ChevronRight } from 'lucide-react';
import { getFileTypeMeta } from '../fileTypes';
import { Edge } from '../../hooks/useWorkspace';
import { ProjectFile } from '../../types';
import { showMenu } from '../../stores/useMenuStore';
import InlineRename from './InlineRename';
import { cn } from '../ui';

interface ViewHeaderProps {
  file: ProjectFile;
  folderPath: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  isProtected: boolean;
  pinned: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onCopyId: () => void;
  onReveal: () => void;
  /** Clicking a breadcrumb folder shows it in the file sidebar. */
  onRevealFolder: (index: number) => void;
  onSplit: (edge: Edge) => void;
  onTogglePin: () => void;
  onClose: () => void;
  bookmarked: boolean;
  /** Omitted for views that can't be bookmarked (graph). */
  onToggleBookmark?: () => void;
  /** True when F2 / a fresh untitled file asks for the title to be edited. */
  startRename: boolean;
  onRenameStarted: () => void;
}

/** Per-pane header: history arrows, breadcrumb + click-to-rename title, bookmark, more menu. */
const ViewHeader: React.FC<ViewHeaderProps> = ({
  file,
  folderPath,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  isProtected,
  pinned,
  onRename,
  onDelete,
  onCopyLink,
  onCopyId,
  onReveal,
  onRevealFolder,
  onSplit,
  onTogglePin,
  onClose,
  bookmarked,
  onToggleBookmark,
  startRename,
  onRenameStarted,
}) => {
  const [renaming, setRenaming] = useState(false);

  // Leaving the file mid-rename abandons the edit. (Declared before the
  // request effect so a request for the newly shown file wins.)
  React.useEffect(() => setRenaming(false), [file.id]);

  React.useEffect(() => {
    if (!startRename) return;
    if (!isProtected) setRenaming(true);
    onRenameStarted();
  }, [startRename, isProtected, onRenameStarted]);

  const moreMenu = (e: React.MouseEvent) =>
    showMenu(e, [
      ...(!isProtected ? [{ label: 'Rename', icon: Pencil, hint: 'F2', onSelect: () => setRenaming(true) }] : []),
      { label: pinned ? 'Unpin tab' : 'Pin tab', icon: Pin, onSelect: onTogglePin },
      ...(onToggleBookmark ? [
        { label: bookmarked ? 'Remove bookmark' : 'Bookmark', icon: Bookmark, onSelect: onToggleBookmark },
        { label: 'Reveal file in navigation', icon: Crosshair, onSelect: onReveal },
        { label: 'Copy link', icon: Link2, onSelect: onCopyLink },
        { label: 'Copy file ID', icon: Hash, onSelect: onCopyId },
      ] : []),
      { kind: 'separator' },
      { label: 'Split right', icon: Columns2, hint: 'Ctrl+Alt+\\', onSelect: () => onSplit('right') },
      { label: 'Split down', icon: Rows2, onSelect: () => onSplit('bottom') },
      { kind: 'separator' },
      { label: 'Close tab', icon: X, onSelect: onClose, disabled: pinned },
      ...(!isProtected ? [{ label: 'Delete file', icon: Trash2, danger: true, onSelect: onDelete }] : []),
    ], 'below');

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/70 bg-bg px-2">
      <div className="flex shrink-0 items-center">
        <button type="button" className="icon-btn" disabled={!canGoBack} onClick={onBack} data-tip="Back" data-tip-kbd="Ctrl Alt ←" aria-label="Navigate back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn" disabled={!canGoForward} onClick={onForward} data-tip="Forward" data-tip-kbd="Ctrl Alt →" aria-label="Navigate forward">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-0.5 pl-1 text-[0.8125rem]">
        {folderPath.map((name, i) => (
          <React.Fragment key={`${name}-${i}`}>
            <button
              type="button"
              onClick={() => onRevealFolder(i)}
              data-tip="Show in sidebar"
              className="hidden max-w-[10rem] truncate rounded px-1 py-0.5 text-faint transition-colors hover:bg-surface-hover hover:text-content sm:inline"
            >
              {name}
            </button>
            <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-faint/70 sm:inline" />
          </React.Fragment>
        ))}
        {React.createElement(getFileTypeMeta(file.type).icon, { className: 'ml-1 h-3.5 w-3.5 shrink-0 text-faint' })}
        {renaming ? (
          <InlineRename
            initialValue={file.name}
            onCommit={name => { setRenaming(false); onRename(name); }}
            onCancel={() => setRenaming(false)}
            className="max-w-[20rem]"
          />
        ) : (
          <button
            type="button"
            onClick={() => !isProtected && setRenaming(true)}
            data-tip={isProtected ? undefined : 'Rename'}
            data-tip-kbd={isProtected ? undefined : 'F2'}
            className={cn(
              'min-w-0 max-w-[24rem] truncate rounded px-1.5 py-0.5 font-medium text-content transition-colors',
              isProtected ? 'cursor-default' : 'hover:bg-surface-hover',
            )}
          >
            {file.name}
          </button>
        )}
      </nav>

      {onToggleBookmark && (
        <button
          type="button"
          className={cn('icon-btn', bookmarked && '!text-accent')}
          onClick={onToggleBookmark}
          data-tip={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          aria-pressed={bookmarked}
        >
          <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
        </button>
      )}
      <button type="button" className="icon-btn" onClick={moreMenu} data-tip="More" aria-label="More options">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ViewHeader;
