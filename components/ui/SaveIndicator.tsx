import React from 'react';
import { cn } from './cn';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

/**
 * Quiet autosave status shared by every editor: a dot plus a word. Editors
 * save on their own; clicking (or Ctrl+S) just saves right away.
 */
export const SaveIndicator: React.FC<{ status: SaveStatus; onSaveNow?: () => void; className?: string }> = ({ status, onSaveNow, className }) => (
  <button
    type="button"
    onClick={onSaveNow}
    title={status === 'saved' ? 'All changes saved automatically' : 'Saving automatically — click or press Ctrl+S to save now'}
    className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-faint transition-colors hover:bg-surface-hover hover:text-muted', className)}
  >
    <span className={cn('h-1.5 w-1.5 rounded-full', status === 'saved' ? 'bg-success/70' : status === 'saving' ? 'bg-info animate-pulse' : 'bg-warning')} />
    {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'}
  </button>
);
