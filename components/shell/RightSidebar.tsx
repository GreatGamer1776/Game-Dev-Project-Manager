import React, { Suspense, useMemo } from 'react';
import { ListTree, Link2, Info, ArrowUpRight, ArrowDownLeft, Copy, Waypoints, Hash } from 'lucide-react';
import { Project, ProjectFile } from '../../types';
import { getFileTypeMeta } from '../fileTypes';
import { extractHeadings, findBacklinks, findOutgoingLinks, getFileText, countWords } from '../../utils/fileText';
import { extractTags } from '../../utils/markdown';
import { cn } from '../ui';
import { REVEAL_HEADING_EVENT, RevealHeadingDetail } from '../../utils/events';

export type RightTab = 'outline' | 'links' | 'graph' | 'info';

const GraphView = React.lazy(() => import('../GraphView'));

interface RightSidebarProps {
  project: Project;
  file: ProjectFile | undefined;
  tab: RightTab;
  onTabChange: (tab: RightTab) => void;
  onOpenFile: (fileId: string) => void;
  onOpenTag: (tag: string) => void;
  /** Tab showing `file` — outline clicks scroll that tab, not a duplicate in another pane. */
  leafId?: string;
  onCopyId: (fileId: string) => void;
  folderPath: string[];
}

const TABS: { id: RightTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'graph', label: 'Local graph', icon: Waypoints },
  { id: 'info', label: 'File info', icon: Info },
];

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-3 py-6 text-center text-xs text-faint">{children}</p>
);

const FileLinkRow: React.FC<{ file: ProjectFile; onOpen: () => void }> = ({ file, onOpen }) => {
  const Icon = getFileTypeMeta(file.type).icon;
  return (
    <button type="button" onClick={onOpen} className="nav-row px-2" title={file.name}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
      <span className="truncate">{file.name}</span>
    </button>
  );
};

/** Obsidian's right sidebar: outline, backlinks/outgoing links, and file info. */
const RightSidebar: React.FC<RightSidebarProps> = ({ project, file, tab, onTabChange, onOpenFile, onOpenTag, leafId, onCopyId, folderPath }) => {
  const headings = useMemo(
    () => (file && file.type === 'doc' && typeof file.content === 'string' ? extractHeadings(file.content) : []),
    [file],
  );
  const backlinks = useMemo(() => (file ? findBacklinks(project.files, file.id) : []), [project.files, file]);
  const outgoing = useMemo(() => (file ? findOutgoingLinks(file, project.files) : []), [project.files, file]);
  const stats = useMemo(() => {
    if (!file || tab !== 'info') return null;
    const text = getFileText(file);
    return {
      words: countWords(text),
      characters: text.length,
      tags: file.type === 'doc' && typeof file.content === 'string' ? extractTags(file.content) : [],
    };
  }, [file, tab]);

  const minLevel = headings.reduce((min, h) => Math.min(min, h.level), 6);
  const activeTab = TABS.find(t => t.id === tab) || TABS[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[var(--header-h)] shrink-0 items-center gap-0.5 border-b border-border px-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={tab === id}
            onClick={() => onTabChange(id)}
            className="icon-btn"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="shrink-0 px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {activeTab.label}
      </div>

      {tab === 'graph' ? (
        <div className="min-h-0 flex-1 border-t border-border/60">
          <Suspense fallback={null}>
            <GraphView files={project.files} activeFileId={file?.id ?? null} onOpenFile={onOpenFile} onOpenTag={onOpenTag} local compact />
          </Suspense>
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-6">
        {!file ? (
          <Empty>No file is open.</Empty>
        ) : tab === 'outline' ? (
          file.type !== 'doc' ? (
            <Empty>Outlines are available for documents.</Empty>
          ) : headings.length === 0 ? (
            <Empty>No headings in this document.</Empty>
          ) : (
            headings.map(h => (
              <button
                key={h.index}
                type="button"
                title={h.text}
                onClick={() => window.dispatchEvent(new CustomEvent<RevealHeadingDetail>(REVEAL_HEADING_EVENT, {
                  detail: { fileId: file.id, index: h.index, line: h.line, text: h.text, leafId },
                }))}
                className={cn('nav-row pr-2', h.level === minLevel && 'font-medium text-content')}
                style={{ paddingLeft: 8 + (h.level - minLevel) * 14 }}
              >
                <span className="truncate">{h.text}</span>
              </button>
            ))
          )
        ) : tab === 'links' ? (
          <>
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-xs font-medium text-muted">
              <ArrowDownLeft className="h-3.5 w-3.5" /> Linked mentions
              <span className="ml-auto text-faint">{backlinks.length}</span>
            </div>
            {backlinks.length === 0
              ? <p className="px-2 pb-3 text-xs text-faint">No files link here yet.</p>
              : backlinks.map(f => <FileLinkRow key={f.id} file={f} onOpen={() => onOpenFile(f.id)} />)}
            <div className="mt-3 flex items-center gap-1.5 px-2 pb-1 pt-1 text-xs font-medium text-muted">
              <ArrowUpRight className="h-3.5 w-3.5" /> Outgoing links
              <span className="ml-auto text-faint">{outgoing.length}</span>
            </div>
            {outgoing.length === 0
              ? <p className="px-2 text-xs text-faint">This file doesn't link to other files.</p>
              : outgoing.map(f => <FileLinkRow key={f.id} file={f} onOpen={() => onOpenFile(f.id)} />)}
          </>
        ) : (
          <dl className="space-y-0.5 px-2 text-xs">
            {[
              ['Type', getFileTypeMeta(file.type).label],
              ['Location', [project.name, ...folderPath].join(' / ')],
              ['Words', stats?.words.toLocaleString() ?? '—'],
              ['Characters', stats?.characters.toLocaleString() ?? '—'],
              ['Linked mentions', String(backlinks.length)],
              ['Outgoing links', String(outgoing.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 border-b border-border/60 py-1.5">
                <dt className="w-28 shrink-0 text-faint">{label}</dt>
                <dd className="min-w-0 flex-1 break-words text-content">{value}</dd>
              </div>
            ))}
            <div className="flex items-center gap-3 py-1.5">
              <dt className="w-28 shrink-0 text-faint">File ID</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-1">
                <code className="truncate font-mono text-[11px] text-muted">{file.id}</code>
                <button type="button" className="icon-btn h-6 w-6" title="Copy file ID" aria-label="Copy file ID" onClick={() => onCopyId(file.id)}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </dd>
            </div>
            {stats && stats.tags.length > 0 && (
              <div className="flex gap-3 border-t border-border/60 py-1.5">
                <dt className="w-28 shrink-0 text-faint">Tags</dt>
                <dd className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {stats.tags.map(tag => (
                    <button key={tag} type="button" onClick={() => onOpenTag(tag)} className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 text-[11px] text-accent hover:bg-accent/25">
                      <Hash className="h-3 w-3" />{tag}
                    </button>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      )}
    </div>
  );
};

export default RightSidebar;
