import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Link2, Hash, Crosshair, Trash2, Pin, X, Bookmark, Columns2, Rows2 } from 'lucide-react';
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

/** Per-pane header: history arrows, breadcrumb + click-to-rename title, more menu. */
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
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/70 bg-bg px-2">
      <div className="flex shrink-0 items-center">
        <button type="button" className="icon-btn" disabled={!canGoBack} onClick={onBack} title="Navigate back (Ctrl+Alt+←)" aria-label="Navigate back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn" disabled={!canGoForward} onClick={onForward} title="Navigate forward (Ctrl+Alt+→)" aria-label="Navigate forward">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 text-[0.8125rem]">
        {folderPath.map((name, i) => (
          <React.Fragment key={`${name}-${i}`}>
            <button
              type="button"
              onClick={() => onRevealFolder(i)}
              title={`Show "${name}" in the file sidebar`}
              className="hidden max-w-[10rem] truncate rounded px-1 py-0.5 text-faint hover:bg-surface-hover hover:text-content sm:inline"
            >
              {name}
            </button>
            <span className="hidden text-faint sm:inline">/</span>
          </React.Fragment>
        ))}
        {renaming ? (
          <InlineRename
            initialValue={file.name}
            onCommit={name => { setRenaming(false); onRename(name); }}
            onCancel={() => setRenaming(false)}
            className="max-w-[20rem] text-center"
          />
        ) : (
          <button
            type="button"
            onClick={() => !isProtected && setRenaming(true)}
            title={isProtected ? `${file.name} (project system — can't be renamed)` : 'Click to rename'}
            className={cn(
              'max-w-[20rem] truncate rounded px-1.5 py-0.5 font-medium text-content',
              isProtected ? 'cursor-default' : 'hover:bg-surface-hover',
            )}
          >
            {file.name}
          </button>
        )}
      </div>

      {onToggleBookmark && (
        <button
          type="button"
          className={cn('icon-btn', bookmarked && '!text-accent')}
          onClick={onToggleBookmark}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          aria-pressed={bookmarked}
        >
          <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
        </button>
      )}
      <button type="button" className="icon-btn" onClick={moreMenu} title="More options" aria-label="More options">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ViewHeader;
