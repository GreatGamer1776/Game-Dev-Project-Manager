import React from 'react';
import { FileSearch, Command, X, Clock } from 'lucide-react';
import { FileType, ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { CREATABLE_TYPES } from './FileExplorer';

interface EmptyViewProps {
  recentFiles: ProjectFile[];
  onNewFile: (type: FileType) => void;
  onQuickSwitch: () => void;
  onCommandPalette: () => void;
  onOpenFile: (fileId: string) => void;
  /** Present when other panes exist. */
  onClosePane?: () => void;
}

/** A pane with no file open: create any file type in one click, or reopen a recent one. */
const EmptyView: React.FC<EmptyViewProps> = ({ recentFiles, onNewFile, onQuickSwitch, onCommandPalette, onOpenFile, onClosePane }) => (
  <div className="flex h-full overflow-y-auto bg-bg">
    <div className="m-auto w-full max-w-2xl px-6 py-10 animate-fade-in-up">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-content">Start something new</h2>
      <p className="mt-1.5 text-[0.875rem] text-muted">Pick a file type, open a recent file, or drag a file from the sidebar into this pane.</p>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {CREATABLE_TYPES.map(type => {
          const meta = getFileTypeMeta(type);
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onNewFile(type)}
              className="card-link group flex flex-col items-start gap-2.5 p-3 text-left"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-hover text-muted transition-colors group-hover:bg-accent/15 group-hover:text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-medium text-content">{meta.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-faint">{meta.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onQuickSwitch} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[0.8125rem] text-content transition-colors hover:border-border-strong hover:bg-surface-hover active:translate-y-px">
          <FileSearch className="h-4 w-4 text-faint" /> Go to file <span className="kbd">Ctrl O</span>
        </button>
        <button type="button" onClick={onCommandPalette} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[0.8125rem] text-content transition-colors hover:border-border-strong hover:bg-surface-hover active:translate-y-px">
          <Command className="h-4 w-4 text-faint" /> Run a command <span className="kbd">Ctrl P</span>
        </button>
        {onClosePane && (
          <button type="button" onClick={onClosePane} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] text-muted transition-colors hover:bg-surface-hover hover:text-content active:translate-y-px">
            <X className="h-4 w-4" /> Close this pane
          </button>
        )}
      </div>

      {recentFiles.length > 0 && (
        <div className="mt-8">
          <div className="eyebrow mb-2 flex items-center gap-1.5"><Clock className="h-3 w-3" /> Recent files</div>
          <div className="overflow-hidden rounded-xl border border-border">
            {recentFiles.map(file => {
              const meta = getFileTypeMeta(file.type);
              const Icon = meta.icon;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => onOpenFile(file.id)}
                  className="flex w-full items-center gap-3 border-t border-border px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-surface-hover/60"
                >
                  <Icon className="h-4 w-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-content">{file.name}</span>
                  <span className="shrink-0 text-[11px] text-faint">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  </div>
);

export default EmptyView;
