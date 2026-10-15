import React from 'react';
import { FileSearch, Terminal, X } from 'lucide-react';
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

/** Obsidian's "No file is open" pane, with one-click creation for every file type. */
const EmptyView: React.FC<EmptyViewProps> = ({ recentFiles, onNewFile, onQuickSwitch, onCommandPalette, onOpenFile, onClosePane }) => (
  <div className="flex h-full items-center justify-center overflow-y-auto bg-bg p-6">
    <div className="w-full max-w-xl animate-fade-in-up">
      <h2 className="text-xl font-semibold text-content">No file is open</h2>
      <p className="mt-1 text-[0.8125rem] text-muted">Create something new, open a recent file, or drag a file from the sidebar into this pane.</p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CREATABLE_TYPES.map(type => {
          const meta = getFileTypeMeta(type);
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onNewFile(type)}
              title={meta.blurb}
              className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-surface px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-surface-raised"
            >
              <Icon className="h-5 w-5 text-faint group-hover:text-accent" />
              <span className="text-[0.8125rem] font-medium text-content">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onQuickSwitch} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] text-accent hover:bg-accent/10">
          <FileSearch className="h-4 w-4" /> Go to file <span className="kbd">Ctrl O</span>
        </button>
        <button type="button" onClick={onCommandPalette} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] text-accent hover:bg-accent/10">
          <Terminal className="h-4 w-4" /> Command palette <span className="kbd">Ctrl P</span>
        </button>
        {onClosePane && (
          <button type="button" onClick={onClosePane} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] text-muted hover:bg-surface-hover hover:text-content">
            <X className="h-4 w-4" /> Close this pane
          </button>
        )}
      </div>

      {recentFiles.length > 0 && (
        <div className="mt-7">
          <div className="eyebrow mb-2">Recent files</div>
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {recentFiles.map(file => {
              const Icon = getFileTypeMeta(file.type).icon;
              return (
                <button key={file.id} type="button" onClick={() => onOpenFile(file.id)} className="nav-row px-2" title={file.name}>
                  <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
                  <span className="truncate">{file.name}</span>
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
