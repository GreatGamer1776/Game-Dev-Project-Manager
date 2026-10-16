import React, { useMemo } from 'react';
import { ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { countWords, findBacklinks, getFileText } from '../../utils/fileText';
import { cn } from '../ui';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

interface StatusBarProps {
  saveState: SaveState;
  file: ProjectFile | undefined;
  files: ProjectFile[];
  projectName?: string;
  onOpenLinks: () => void;
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Save failed — will retry',
};

/** Global footer: save/sync state on the left, file stats on the right. */
const StatusBar: React.FC<StatusBarProps> = ({ saveState, file, files, projectName, onOpenLinks }) => {
  const stats = useMemo(() => {
    if (!file) return null;
    const text = getFileText(file);
    return {
      words: countWords(text),
      characters: text.length,
      backlinks: findBacklinks(files, file.id).length,
    };
  }, [file, files]);

  return (
    <footer className="flex h-[var(--statusbar-h)] shrink-0 items-center gap-4 border-t border-border bg-chrome px-3 text-[11px] text-faint">
      <span className="flex min-w-0 items-center gap-1.5" role="status" aria-live="polite">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            saveState === 'saved' && 'bg-success',
            (saveState === 'pending' || saveState === 'saving') && 'bg-warning animate-pulse-dot',
            saveState === 'error' && 'bg-danger',
          )}
        />
        <span className={cn('truncate', saveState === 'error' && 'text-danger')}>{SAVE_LABEL[saveState]}</span>
      </span>
      {projectName && <span className="hidden truncate sm:inline">{projectName}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-4 tabular-nums">
        {file && stats && (
          <>
            <button type="button" onClick={onOpenLinks} className="hover:text-content" title="Show linked mentions">
              {stats.backlinks} {stats.backlinks === 1 ? 'backlink' : 'backlinks'}
            </button>
            {file.type === 'doc' && (
              <span className="hidden sm:inline">
                {stats.words.toLocaleString()} {stats.words === 1 ? 'word' : 'words'} · {stats.characters.toLocaleString()} characters
              </span>
            )}
            <span>{getFileTypeMeta(file.type).label}</span>
          </>
        )}
      </span>
    </footer>
  );
};

export default StatusBar;
