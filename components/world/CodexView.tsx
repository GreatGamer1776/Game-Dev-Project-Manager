import React, { useMemo, useState } from 'react';
import { Plus, Search, Link2Off, ChevronDown } from 'lucide-react';
import type { ProjectFile } from '../../types';
import { extractWikilinks } from '../../utils/markdown';
import { getRawContent } from '../../utils/fileText';
import {
  ENTRY_KINDS, EntryKind, WorldEntry, getEntryKindMeta, propertyText, readWorldEntries,
} from '../../utils/worldModel';
import { showMenu } from '../../stores/useMenuStore';
import { cn } from '../ui';

interface CodexViewProps {
  files: ProjectFile[];
  onOpenFile: (fileId: string, newTab: boolean) => void;
  /** Creates (and opens) a world entry; `name` given = exactly that name. */
  onCreateEntry: (kind: EntryKind, name?: string) => void;
}

type Filter = EntryKind | 'all' | 'unwritten';

interface Unwritten {
  name: string;
  mentionedBy: ProjectFile[];
}

const lower = (s: string) => s.trim().toLowerCase();

/** Every [[target]] a file links to (last path segment, original case). */
const linkTargets = (file: ProjectFile): string[] => {
  if (file.type === 'doc' && typeof file.content === 'string') {
    return extractWikilinks(file.content).map(l => l.target.split('/').pop()!.trim());
  }
  const raw = getRawContent(file);
  if (!raw.includes('[[')) return [];
  return Array.from(raw.matchAll(/\[\[([^\]\n|#]+)/g), m => m[1].split('/').pop()!.trim());
};

const kindMenuEntries = (onPick: (kind: EntryKind) => void) =>
  ENTRY_KINDS.map(meta => ({ label: meta.label, icon: meta.icon, onSelect: () => onPick(meta.kind) }));

/** The world encyclopedia: every entry by kind, plus links to things not written yet. */
const CodexView: React.FC<CodexViewProps> = ({ files, onOpenFile, onCreateEntry }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const { entries, mentions, unwritten } = useMemo(() => {
    const entries = readWorldEntries(files).sort((a, b) => a.file.name.localeCompare(b.file.name));
    const names = new Set(files.map(f => lower(f.name)));
    // target name -> files that mention it
    const byTarget = new Map<string, { name: string; files: Map<string, ProjectFile> }>();
    for (const file of files) {
      for (const target of linkTargets(file)) {
        const key = lower(target);
        if (!key) continue;
        let slot = byTarget.get(key);
        if (!slot) byTarget.set(key, slot = { name: target, files: new Map() });
        if (lower(file.name) !== key) slot.files.set(file.id, file);
      }
    }
    const mentions = new Map<string, number>();
    for (const entry of entries) mentions.set(entry.file.id, byTarget.get(lower(entry.file.name))?.files.size ?? 0);
    const unwritten: Unwritten[] = Array.from(byTarget.entries())
      .filter(([key, slot]) => !names.has(key) && slot.files.size > 0)
      .map(([, slot]) => ({ name: slot.name, mentionedBy: Array.from(slot.files.values()) }))
      .sort((a, b) => b.mentionedBy.length - a.mentionedBy.length || a.name.localeCompare(b.name));
    return { entries, mentions, unwritten };
  }, [files]);

  const counts = useMemo(() => {
    const map = new Map<EntryKind, number>();
    for (const e of entries) map.set(e.kind, (map.get(e.kind) ?? 0) + 1);
    return map;
  }, [entries]);

  const q = lower(query);
  const matches = (entry: WorldEntry) => {
    if (!q) return true;
    const meta = getEntryKindMeta(entry.kind);
    const haystack = [
      entry.file.name, entry.summary, ...entry.aliases,
      ...meta.highlights.map(key => propertyText(entry.properties[key])),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  };
  const visible = entries.filter(e => (filter === 'all' || e.kind === filter) && matches(e));
  const visibleUnwritten = unwritten.filter(u => !q || lower(u.name).includes(q));
  const showEntries = filter !== 'unwritten';
  const showUnwritten = filter === 'all' || filter === 'unwritten';

  const groups = ENTRY_KINDS
    .map(meta => ({ meta, items: visible.filter(e => e.kind === meta.kind) }))
    .filter(g => g.items.length > 0);

  const newEntryMenu = (e: React.MouseEvent) =>
    showMenu(e, [{ kind: 'heading', label: 'New entry' }, ...kindMenuEntries(kind => onCreateEntry(kind))], 'below');

  const chip = (id: Filter, label: string, count: number, Icon?: React.ComponentType<{ className?: string }>) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
        filter === id ? 'border-border-strong bg-surface-hover text-content' : 'border-transparent text-muted hover:bg-surface-hover hover:text-content',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      <span className="tabular-nums text-faint">{count}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2 focus-within:border-accent sm:max-w-xs">
          <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the codex"
            aria-label="Search the codex"
            className="min-w-0 flex-1 bg-transparent text-xs text-content outline-none placeholder:text-faint"
          />
        </div>
        <button
          type="button"
          onClick={newEntryMenu}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-content px-2.5 text-xs font-medium text-bg transition-colors hover:bg-content/85"
        >
          <Plus className="h-3.5 w-3.5" />
          New entry
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/70 px-3 py-1.5 [scrollbar-width:none]">
        {chip('all', 'All', entries.length)}
        {ENTRY_KINDS.filter(meta => counts.get(meta.kind)).map(meta => chip(meta.kind, meta.plural, counts.get(meta.kind) ?? 0, meta.icon))}
        {unwritten.length > 0 && chip('unwritten', 'Unwritten', unwritten.length, Link2Off)}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          {entries.length === 0 && unwritten.length === 0 ? (
            <EmptyCodex onCreate={onCreateEntry} />
          ) : (
            <>
              {showEntries && groups.length === 0 && (
                <p className="py-10 text-center text-sm text-faint">
                  {q ? 'No entries match your search.' : 'No entries of this kind yet.'}
                </p>
              )}
              {showEntries && groups.map(({ meta, items }) => (
                <section key={meta.kind} className="mb-8">
                  <div className="mb-2 flex items-center gap-2">
                    <meta.icon className="h-4 w-4 text-faint" />
                    <h2 className="text-sm font-semibold text-content">{meta.plural}</h2>
                    <span className="text-xs tabular-nums text-faint">{items.length}</span>
                    <button
                      type="button"
                      onClick={() => onCreateEntry(meta.kind)}
                      className="icon-btn ml-auto h-6 w-6"
                      aria-label={`New ${meta.label.toLowerCase()}`}
                      data-tip={`New ${meta.label.toLowerCase()}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(entry => (
                      <EntryCard key={entry.file.id} entry={entry} mentions={mentions.get(entry.file.id) ?? 0} onOpen={newTab => onOpenFile(entry.file.id, newTab)} />
                    ))}
                  </div>
                </section>
              ))}

              {showUnwritten && visibleUnwritten.length > 0 && (
                <section className="mb-8">
                  <div className="mb-1 flex items-center gap-2">
                    <Link2Off className="h-4 w-4 text-faint" />
                    <h2 className="text-sm font-semibold text-content">Unwritten</h2>
                    <span className="text-xs tabular-nums text-faint">{visibleUnwritten.length}</span>
                  </div>
                  <p className="mb-2 text-xs text-faint">Linked from your project but not written yet.</p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {visibleUnwritten.map(item => (
                      <div key={item.name} className="flex items-center gap-3 border-t border-border/70 px-3 py-2 first:border-t-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[0.8125rem] text-content">{item.name}</div>
                          <div className="truncate text-[11px] text-faint">
                            Mentioned in{' '}
                            {item.mentionedBy.slice(0, 3).map((f, i) => (
                              <React.Fragment key={f.id}>
                                {i > 0 && ', '}
                                <button type="button" onClick={e => onOpenFile(f.id, e.ctrlKey || e.metaKey)} className="hover:text-content hover:underline">{f.name}</button>
                              </React.Fragment>
                            ))}
                            {item.mentionedBy.length > 3 && ` and ${item.mentionedBy.length - 3} more`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={e => showMenu(e, [{ kind: 'heading', label: `Create “${item.name}” as` }, ...kindMenuEntries(kind => onCreateEntry(kind, item.name))], 'below')}
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-content"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {filter === 'unwritten' && visibleUnwritten.length === 0 && (
                <p className="py-10 text-center text-sm text-faint">No unwritten links match your search.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const EntryCard: React.FC<{ entry: WorldEntry; mentions: number; onOpen: (newTab: boolean) => void }> = ({ entry, mentions, onOpen }) => {
  const meta = getEntryKindMeta(entry.kind);
  const chips = meta.highlights
    .map(key => ({ key, text: propertyText(entry.properties[key]) }))
    .filter(c => c.text);
  return (
    <button
      type="button"
      onClick={e => onOpen(e.ctrlKey || e.metaKey)}
      onAuxClick={e => { if (e.button === 1) onOpen(true); }}
      className="group flex min-h-[7.5rem] flex-col rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-raised"
    >
      <div className="flex items-start gap-2">
        <meta.icon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.875rem] font-medium text-content">{entry.file.name}</div>
          {entry.aliases.length > 0 && <div className="truncate text-[11px] text-faint">aka {entry.aliases.join(', ')}</div>}
        </div>
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map(c => (
            <span key={c.key} title={c.key} className="max-w-full truncate rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted">{c.text}</span>
          ))}
        </div>
      )}
      <p className={cn('mt-2 line-clamp-2 text-xs leading-5', entry.summary ? 'text-muted' : 'italic text-faint')}>
        {entry.summary || 'No summary yet.'}
      </p>
      <div className="mt-auto pt-2 text-[11px] text-faint">
        {mentions === 0 ? 'Not linked anywhere yet' : `Linked from ${mentions} ${mentions === 1 ? 'file' : 'files'}`}
      </div>
    </button>
  );
};

const EmptyCodex: React.FC<{ onCreate: (kind: EntryKind) => void }> = ({ onCreate }) => (
  <div className="mx-auto max-w-xl py-10 text-center">
    <h2 className="font-display text-lg font-medium text-content">Start your codex</h2>
    <p className="mx-auto mt-1 max-w-md text-sm text-muted">
      Entries are documents with a kind. Each one starts from a template with properties and sections for game writing.
      Link them with [[double brackets]] anywhere in the project.
    </p>
    <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ENTRY_KINDS.map(meta => (
        <button
          key={meta.kind}
          type="button"
          onClick={() => onCreate(meta.kind)}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-3 text-xs text-muted transition-colors hover:border-border-strong hover:text-content"
        >
          <meta.icon className="h-4 w-4" />
          {meta.label}
        </button>
      ))}
    </div>
  </div>
);

export default CodexView;
