import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { getFileText, searchText, SearchMatch } from '../../utils/fileText';
import { cn } from '../ui';

interface SearchPanelProps {
  files: ProjectFile[];
  onOpenFile: (fileId: string) => void;
  /** Bumped by the "search in all files" command to refocus the field. */
  focusSignal: number;
  /** Fill the box with a query (e.g. a clicked #tag). */
  queryRequest?: { query: string; nonce: number } | null;
}

interface FileResult {
  file: ProjectFile;
  count: number;
  nameMatch: boolean;
  matches: SearchMatch[];
}

/** Obsidian-style full-text search across every file in the project. */
const SearchPanel: React.FC<SearchPanelProps> = ({ files, onOpenFile, focusSignal, queryRequest }) => {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  useEffect(() => {
    if (queryRequest) setQuery(queryRequest.query);
  }, [queryRequest]);

  // Text extraction is the expensive part; redo it only when files change.
  const corpus = useMemo(() => files.map(file => ({ file, text: getFileText(file) })), [files]);

  const results = useMemo<FileResult[]>(() => {
    if (!deferredQuery) return [];
    const q = deferredQuery.toLowerCase();
    return corpus
      .map(({ file, text }) => {
        const { count, matches } = searchText(text, deferredQuery);
        const nameMatch = file.name.toLowerCase().includes(q);
        return { file, count, nameMatch, matches };
      })
      .filter(r => r.count > 0 || r.nameMatch)
      .sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || b.count - a.count);
  }, [corpus, deferredQuery]);

  const total = results.reduce((sum, r) => sum + r.count, 0);

  const toggle = (id: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-2.5 pb-2 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="Search files..."
            aria-label="Search all files"
            className="w-full rounded-md border border-border bg-bg py-1.5 pl-7 pr-7 text-[0.8125rem] text-content placeholder:text-faint outline-none focus:border-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-content"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {deferredQuery && (
          <p className="mt-1.5 px-0.5 text-[11px] text-faint">
            {results.length === 0 ? 'No matches found.' : `${total} ${total === 1 ? 'result' : 'results'} in ${results.length} ${results.length === 1 ? 'file' : 'files'}`}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-6">
        {results.map(({ file, count, matches }) => {
          const Icon = getFileTypeMeta(file.type).icon;
          const open = !collapsed.has(file.id);
          return (
            <div key={file.id} className="mb-0.5">
              <div className="nav-row group cursor-pointer pl-1 pr-2" onClick={() => onOpenFile(file.id)}>
                <button
                  type="button"
                  aria-label={open ? 'Collapse matches' : 'Expand matches'}
                  onClick={e => { e.stopPropagation(); toggle(file.id); }}
                  className={cn('shrink-0 rounded p-px text-faint hover:text-content', matches.length === 0 && 'invisible')}
                >
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
                </button>
                <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate font-medium text-content">{file.name}</span>
                {count > 0 && <span className="shrink-0 rounded bg-surface-hover px-1.5 text-[10px] text-faint">{count}</span>}
              </div>
              {open && matches.length > 0 && (
                <div className="ml-[13px] border-l border-border pl-1">
                  {matches.map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onOpenFile(file.id)}
                      className="block w-full rounded-md px-2 py-1 text-left text-xs leading-relaxed text-muted hover:bg-surface-hover"
                    >
                      <span className="line-clamp-2 break-words">
                        {m.before}
                        <mark className="rounded-sm bg-warning/30 px-px text-content">{m.match}</mark>
                        {m.after}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!deferredQuery && (
          <p className="px-3 py-6 text-center text-xs text-faint">
            Search names and contents of every document, task, bug, roadmap item, and grid in this project.
          </p>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
