import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FilePlus2, LayoutGrid, Terminal, FileInput } from 'lucide-react';
import { Project, ProjectFile } from '../types';
import { getFileTypeMeta, SINGLE_INSTANCE_FILE_TYPES } from './fileTypes';
import { fuzzyMatch } from '../utils/fileText';
import { cn } from './ui';

export type PaletteMode = 'files' | 'commands' | 'templates';

export interface PaletteCommand {
  id: string;
  label: string;
  /** Group shown before the label, Obsidian style ("Files: New document"). */
  group?: string;
  hotkey?: string;
  icon?: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface CommandPaletteProps {
  mode: PaletteMode | null;
  onClose: () => void;
  onModeChange: (mode: PaletteMode) => void;
  projects: Project[];
  activeProject: Project | undefined;
  recentFileIds: string[];
  folderPathOf: (file: ProjectFile) => string[];
  commands: PaletteCommand[];
  onOpenFile: (fileId: string) => void;
  onSelectProject: (projectId: string) => void;
  onCreateDocument: (name: string) => void;
  templates: { id: string; name: string }[];
  onPickTemplate: (id: string) => void;
}

interface Row {
  key: string;
  label: string;
  indexes: number[];
  sub?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

const MAX_ROWS = 60;

/** Renders `text` with fuzzy-matched characters emphasised. */
const Highlighted: React.FC<{ text: string; indexes: number[] }> = ({ text, indexes }) => {
  if (indexes.length === 0) return <>{text}</>;
  const set = new Set(indexes);
  return (
    <>
      {Array.from(text).map((ch, i) =>
        set.has(i) ? <span key={i} className="font-semibold text-accent">{ch}</span> : <React.Fragment key={i}>{ch}</React.Fragment>,
      )}
    </>
  );
};

/**
 * Obsidian's quick switcher (files) and command palette (commands) in one
 * prompt. Typing ">" in the file switcher jumps to commands.
 */
const CommandPalette: React.FC<CommandPaletteProps> = ({
  mode,
  onClose,
  onModeChange,
  projects,
  activeProject,
  recentFileIds,
  folderPathOf,
  commands,
  onOpenFile,
  onSelectProject,
  onCreateDocument,
  templates,
  onPickTemplate,
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset during render (not in an effect) so a keystroke typed right after
  // the open shortcut can't land on the previous session's query.
  // Typing ">" switches to commands but keeps whatever followed it.
  const [lastMode, setLastMode] = useState<PaletteMode | null>(mode);
  const [carryQuery, setCarryQuery] = useState<string | null>(null);
  if (mode !== lastMode) {
    setLastMode(mode);
    setQuery(mode && carryQuery !== null ? carryQuery : '');
    setCarryQuery(null);
    setSelected(0);
  }

  useEffect(() => {
    if (mode) inputRef.current?.focus();
  }, [mode]);

  const rows = useMemo<Row[]>(() => {
    if (!mode) return [];
    const q = query.trim();

    if (mode === 'templates') {
      return templates
        .map(tpl => ({ tpl, match: fuzzyMatch(tpl.name, q) }))
        .filter((r): r is { tpl: { id: string; name: string }; match: NonNullable<ReturnType<typeof fuzzyMatch>> } => r.match !== null)
        .sort((a, b) => (q ? b.match.score - a.match.score : a.tpl.name.localeCompare(b.tpl.name)))
        .map(({ tpl, match }) => ({ key: tpl.id, label: tpl.name, indexes: match.indexes, icon: FileInput, run: () => onPickTemplate(tpl.id) }));
    }

    if (mode === 'commands') {
      return commands
        .map(cmd => {
          const full = cmd.group ? `${cmd.group}: ${cmd.label}` : cmd.label;
          const match = fuzzyMatch(full, q);
          return match ? { cmd, full, match } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => (q ? b.match.score - a.match.score : 0))
        .slice(0, MAX_ROWS)
        .map(({ cmd, full, match }) => ({
          key: cmd.id,
          label: full,
          indexes: match.indexes,
          hint: cmd.hotkey,
          icon: cmd.icon || Terminal,
          run: cmd.run,
        }));
    }

    const out: Row[] = [];
    if (activeProject) {
      const recentRank = new Map(recentFileIds.map((id, i) => [id, i]));
      const fileRows = activeProject.files
        .map(file => {
          const match = fuzzyMatch(file.name, q);
          return match ? { file, match } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => {
          if (q) return b.match.score - a.match.score;
          // Empty query: most recently opened first, then systems, then A–Z.
          const ra = recentRank.get(a.file.id) ?? Infinity;
          const rb = recentRank.get(b.file.id) ?? Infinity;
          if (ra !== rb) return ra - rb;
          const sa = SINGLE_INSTANCE_FILE_TYPES.has(a.file.type) ? 1 : 0;
          const sb = SINGLE_INSTANCE_FILE_TYPES.has(b.file.type) ? 1 : 0;
          if (sa !== sb) return sa - sb;
          return a.file.name.localeCompare(b.file.name);
        })
        .slice(0, MAX_ROWS);
      for (const { file, match } of fileRows) {
        const path = folderPathOf(file);
        out.push({
          key: file.id,
          label: file.name,
          indexes: match.indexes,
          sub: path.length ? path.join(' / ') : undefined,
          hint: getFileTypeMeta(file.type).label,
          icon: getFileTypeMeta(file.type).icon,
          run: () => onOpenFile(file.id),
        });
      }
      const exact = activeProject.files.some(f => f.name.toLowerCase() === q.toLowerCase());
      if (q && !exact) {
        out.push({
          key: '__create__',
          label: `Create new document "${q}"`,
          indexes: [],
          hint: 'Shift ↵',
          icon: FilePlus2,
          run: () => onCreateDocument(q),
        });
      }
    }

    // Other projects are always reachable from the switcher.
    projects
      .filter(p => p.id !== activeProject?.id)
      .map(p => ({ p, match: fuzzyMatch(p.name, q) }))
      .filter((r): r is { p: Project; match: NonNullable<ReturnType<typeof fuzzyMatch>> } => r.match !== null)
      .sort((a, b) => (q ? b.match.score - a.match.score : b.p.lastModified - a.p.lastModified))
      .slice(0, activeProject && !q ? 5 : MAX_ROWS)
      .forEach(({ p, match }) => {
        out.push({
          key: `project-${p.id}`,
          label: p.name,
          indexes: match.indexes,
          sub: 'Switch project',
          hint: p.type,
          icon: LayoutGrid,
          run: () => onSelectProject(p.id),
        });
      });
    return out;
  }, [mode, query, commands, activeProject, projects, recentFileIds, folderPathOf, onOpenFile, onSelectProject, onCreateDocument, templates, onPickTemplate]);

  // Keep the selection valid and visible.
  useEffect(() => {
    if (selected >= rows.length) setSelected(Math.max(0, rows.length - 1));
  }, [rows.length, selected]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!mode) return null;

  const runRow = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    row.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rows.length) setSelected(prev => (prev + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) setSelected(prev => (prev - 1 + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && mode === 'files' && activeProject && query.trim()) {
        onClose();
        onCreateDocument(query.trim());
        return;
      }
      runRow(rows[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Backspace' && mode === 'commands' && query === '') {
      onModeChange('files');
    }
  };

  const placeholder = mode === 'templates'
    ? 'Insert a template...'
    : mode === 'commands'
    ? 'Select a command...'
    : activeProject ? 'Find or create a file...' : 'Find a project...';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-center bg-overlay/40 px-4 pt-[12vh] animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'commands' ? 'Command palette' : mode === 'templates' ? 'Insert template' : 'Quick switcher'}
        className="flex h-fit max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border-strong bg-bg shadow-pop animate-scale-in"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-3">
          {mode === 'commands' && <span className="mr-1 font-mono text-sm text-accent">&gt;</span>}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => {
              const value = e.target.value;
              if (mode === 'files' && value.startsWith('>')) {
                setCarryQuery(value.slice(1));
                onModeChange('commands');
              } else {
                setQuery(value);
              }
              setSelected(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={rows[selected] ? `palette-row-${selected}` : undefined}
            className="h-12 flex-1 bg-transparent text-[0.9375rem] text-content placeholder:text-faint outline-none"
          />
        </div>

        <div ref={listRef} id="palette-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-[0.8125rem] text-faint">
              {mode === 'templates' && templates.length === 0
                ? 'No templates yet. Put documents in a "Templates" folder (configurable in Settings → General).'
                : 'No matches.'}
            </div>
          ) : (
            rows.map((row, i) => {
              const Icon = row.icon;
              const active = i === selected;
              return (
                <div
                  key={row.key}
                  id={`palette-row-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={active}
                  onMouseMove={() => !active && setSelected(i)}
                  onClick={() => runRow(row)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5',
                    active ? 'bg-surface-hover' : '',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-content' : 'text-faint')} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.875rem] text-content">
                      <Highlighted text={row.label} indexes={row.indexes} />
                    </div>
                    {row.sub && <div className="truncate text-[11px] text-faint">{row.sub}</div>}
                  </div>
                  {row.hint && <span className={cn('shrink-0 text-[11px]', mode === 'commands' ? 'kbd' : 'text-faint')}>{row.hint}</span>}
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-chrome px-3 py-1.5 text-[11px] text-faint">
          <span><span className="kbd">↑↓</span> to navigate</span>
          <span><span className="kbd">↵</span> to {mode === 'files' ? 'open' : mode === 'templates' ? 'insert' : 'use'}</span>
          {mode === 'files' && activeProject && <span><span className="kbd">shift ↵</span> to create</span>}
          {mode === 'files' && <span><span className="kbd">&gt;</span> for commands</span>}
          <span><span className="kbd">esc</span> to dismiss</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
