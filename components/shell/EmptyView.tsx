import React from 'react';
import { ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';

interface EmptyViewProps {
  recentFiles: ProjectFile[];
  onNewDocument: () => void;
  onQuickSwitch: () => void;
  onCommandPalette: () => void;
  onOpenFile: (fileId: string) => void;
}

const Action: React.FC<{ label: string; hint?: string; onClick: () => void }> = ({ label, hint, onClick }) => (
  <button type="button" onClick={onClick} className="group flex items-center gap-2 text-accent hover:text-accent-hover">
    <span className="group-hover:underline">{label}</span>
    {hint && <span className="kbd">{hint}</span>}
  </button>
);

/** Obsidian's "No file is open" pane. */
const EmptyView: React.FC<EmptyViewProps> = ({ recentFiles, onNewDocument, onQuickSwitch, onCommandPalette, onOpenFile }) => (
  <div className="flex h-full items-center justify-center overflow-y-auto bg-bg p-6">
    <div className="w-full max-w-sm animate-fade-in-up">
      <h2 className="mb-5 text-xl font-semibold text-content">No file is open</h2>
      <div className="flex flex-col items-start gap-2.5 text-[0.9375rem]">
        <Action label="Create new document" hint="Alt N" onClick={onNewDocument} />
        <Action label="Go to file" hint="Ctrl O" onClick={onQuickSwitch} />
        <Action label="Open command palette" hint="Ctrl P" onClick={onCommandPalette} />
      </div>
      {recentFiles.length > 0 && (
        <div className="mt-8">
          <div className="eyebrow mb-2">Recent files</div>
          <div className="flex flex-col">
            {recentFiles.map(file => {
              const Icon = getFileTypeMeta(file.type).icon;
              return (
                <button key={file.id} type="button" onClick={() => onOpenFile(file.id)} className="nav-row -mx-2 px-2">
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
