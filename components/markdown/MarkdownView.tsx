import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Info, Lightbulb, AlertTriangle, XOctagon, CheckCircle2, HelpCircle, Bug, Quote as QuoteIcon, ListChecks,
  Flame, ClipboardList, ChevronRight, Copy, Check, ExternalLink,
} from 'lucide-react';
import remarkObsidian from './remarkObsidian';
import { parseFrontmatter, resolveWikilink, FrontmatterValue } from '../../utils/markdown';
import { getFileTypeMeta } from '../fileTypes';
import type { ProjectFile, TodoItem } from '../../types';
import { cn } from '../ui';

export interface MarkdownViewProps {
  source: string;
  files: ProjectFile[];
  assets?: Record<string, string>;
  /** Follows file://, task://, wikilink:, tag:, and external links. */
  onOpenHref?: (href: string, newTab: boolean) => void;
  /** Clicking a task checkbox; receives the offset of its list item in `source`. */
  onToggleTask?: (offset: number) => void;
  /** Transclusion depth (embeds stop at 2). */
  depth?: number;
  className?: string;
  /** Hide the properties table (used inside compact cards). */
  hideProperties?: boolean;
}

// App-internal link schemes handled by the anchor override below. Everything
// else passes through react-markdown's defaultUrlTransform, which neutralizes
// javascript:/data:/vbscript: hrefs.
const INTERNAL_LINK_PATTERN = /^(file|task|asset|wikilink|tag):/i;
const urlTransform = (url: string) => (INTERNAL_LINK_PATTERN.test(url) ? url : defaultUrlTransform(url));

// rehype-raw lets inline HTML (e.g. <u>, <span style="color">) through;
// rehype-sanitize (GitHub schema + the app's own elements) keeps it safe.
// The GitHub schema only allows http(s)/mailto URLs, which would strip the
// app's own link schemes — allow those explicitly.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'u', 'span', 'input', 'mark', 'md-tag', 'md-embed', 'md-callout'],
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span || []), 'style'],
    input: [...(defaultSchema.attributes?.input || []), 'type', 'checked', 'disabled'],
    code: [...(defaultSchema.attributes?.code || []), ['className', /^language-./, 'math-inline', 'math-display']],
    'md-embed': ['target', 'heading'],
    'md-callout': ['kind', 'fold', 'title'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href || []), 'file', 'task', 'asset', 'wikilink', 'tag'],
    src: [...(defaultSchema.protocols?.src || []), 'asset'],
  },
};

const CALLOUTS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  note: { icon: Info, color: 'var(--color-info)', label: 'Note' },
  info: { icon: Info, color: 'var(--color-info)', label: 'Info' },
  abstract: { icon: ClipboardList, color: 'var(--color-info)', label: 'Abstract' },
  summary: { icon: ClipboardList, color: 'var(--color-info)', label: 'Summary' },
  todo: { icon: ListChecks, color: 'var(--color-info)', label: 'Todo' },
  tip: { icon: Lightbulb, color: 'var(--color-success)', label: 'Tip' },
  hint: { icon: Lightbulb, color: 'var(--color-success)', label: 'Hint' },
  important: { icon: Flame, color: 'var(--color-accent)', label: 'Important' },
  success: { icon: CheckCircle2, color: 'var(--color-success)', label: 'Success' },
  done: { icon: CheckCircle2, color: 'var(--color-success)', label: 'Done' },
  question: { icon: HelpCircle, color: 'var(--color-warning)', label: 'Question' },
  faq: { icon: HelpCircle, color: 'var(--color-warning)', label: 'FAQ' },
  warning: { icon: AlertTriangle, color: 'var(--color-warning)', label: 'Warning' },
  caution: { icon: AlertTriangle, color: 'var(--color-warning)', label: 'Caution' },
  attention: { icon: AlertTriangle, color: 'var(--color-warning)', label: 'Attention' },
  failure: { icon: XOctagon, color: 'var(--color-danger)', label: 'Failure' },
  fail: { icon: XOctagon, color: 'var(--color-danger)', label: 'Failure' },
  danger: { icon: XOctagon, color: 'var(--color-danger)', label: 'Danger' },
  error: { icon: XOctagon, color: 'var(--color-danger)', label: 'Error' },
  bug: { icon: Bug, color: 'var(--color-danger)', label: 'Bug' },
  example: { icon: ListChecks, color: 'var(--color-accent)', label: 'Example' },
  quote: { icon: QuoteIcon, color: 'var(--color-muted)', label: 'Quote' },
  cite: { icon: QuoteIcon, color: 'var(--color-muted)', label: 'Quote' },
};

const Callout: React.FC<{ kind?: string; fold?: string; title?: string; children?: React.ReactNode }> = ({ kind = 'note', fold, title, children }) => {
  const meta = CALLOUTS[kind] || CALLOUTS.note;
  const [open, setOpen] = useState(fold !== '-');
  const Icon = meta.icon;
  const foldable = fold === '+' || fold === '-';
  const hasBody = React.Children.count(children) > 0;
  return (
    <div className="md-callout my-4 rounded-lg px-4 py-3" style={{ '--callout': meta.color } as React.CSSProperties} data-callout={kind}>
      <div
        className={cn('flex items-center gap-2 font-semibold', foldable && 'cursor-pointer select-none')}
        style={{ color: `rgb(${meta.color})` }}
        onClick={() => foldable && setOpen(o => !o)}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{title || meta.label}</span>
        {foldable && <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />}
      </div>
      {hasBody && open && <div className="md-callout-body mt-1.5">{children}</div>}
    </div>
  );
};

let mermaidLoader: Promise<typeof import('mermaid')['default']> | null = null;
const loadMermaid = () => {
  mermaidLoader ??= import('mermaid').then(mod => {
    const mermaid = mod.default;
    const dark = document.documentElement.classList.contains('dark');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'Inter, sans-serif' });
    return mermaid;
  });
  return mermaidLoader;
};

/** Renders a ```mermaid block lazily (the library loads on first use). */
const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(mermaid => mermaid.render(`mermaid-${id}`, code))
      .then(result => { if (!cancelled) { setSvg(result.svg); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [code, id]);
  if (error) return <pre className="my-4 whitespace-pre-wrap rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">Mermaid: {error}</pre>;
  if (!svg) return <div className="my-4 h-24 animate-pulse rounded-lg bg-surface-raised" />;
  // Mermaid output is produced with securityLevel "strict" (sanitized SVG).
  return <div className="md-mermaid my-4 flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
};

const CodeBlock: React.FC<{ language?: string; code: string; children: React.ReactNode }> = ({ language, code, children }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-4">
      <div className="pointer-events-none absolute right-2 top-1.5 flex items-center gap-1.5 text-[11px] text-faint">
        {language && <span className="opacity-100 group-hover:opacity-0">{language}</span>}
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
        className="absolute right-1.5 top-1.5 rounded p-1 text-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-content group-hover:opacity-100"
        title="Copy code"
        aria-label="Copy code"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-raised p-4 font-mono text-[0.85em] leading-relaxed text-content">{children}</pre>
    </div>
  );
};

const renderValue = (value: FrontmatterValue, onTag: (tag: string) => void, isTags: boolean): React.ReactNode => {
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <span key={i}>{renderValue(v, onTag, isTags)}</span>
        ))}
      </span>
    );
  }
  if (value === null) return <span className="text-faint">—</span>;
  if (typeof value === 'boolean') return <input type="checkbox" checked={value} readOnly className="accent-accent" />;
  const str = String(value);
  if (isTags) {
    return (
      <button type="button" onClick={() => onTag(str.replace(/^#/, ''))} className="md-tag-pill">
        #{str.replace(/^#/, '')}
      </button>
    );
  }
  if (/^https?:\/\//.test(str)) return <a href={str} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{str}</a>;
  return <span>{str}</span>;
};

const Properties: React.FC<{ data: Record<string, FrontmatterValue>; onTag: (tag: string) => void }> = ({ data, onTag }) => {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <div className="mb-6 rounded-lg border border-border bg-surface px-3 py-2 text-[0.85em]">
      <div className="eyebrow mb-1">Properties</div>
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-3 border-t border-border/60 py-1.5 first:border-t-0">
          <span className="w-32 shrink-0 truncate text-muted">{key}</span>
          <span className="min-w-0 flex-1 break-words text-content">{renderValue(value, onTag, key === 'tags' || key === 'tag')}</span>
        </div>
      ))}
    </div>
  );
};

const parseTaskHref = (url: string) => {
  const rest = url.slice('task://'.length);
  const slash = rest.indexOf('/');
  return slash > 0 ? { fileId: rest.slice(0, slash), taskId: rest.slice(slash + 1) } : null;
};

/** Obsidian-style reading view for markdown. */
const MarkdownView: React.FC<MarkdownViewProps> = ({
  source,
  files,
  assets = {},
  onOpenHref,
  onToggleTask,
  depth = 0,
  className,
  hideProperties = false,
}) => {
  const { data, body, bodyOffset } = useMemo(() => parseFrontmatter(source), [source]);
  const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
  const tasks = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      if (f.type !== 'todo') continue;
      const items = (f.content as { items?: TodoItem[] })?.items;
      if (Array.isArray(items)) items.forEach(item => set.add(`${f.id}/${item.id}`));
    }
    return set;
  }, [files]);

  const open = (href: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    live.current.onOpenHref?.(href, Boolean(e && (e.ctrlKey || e.metaKey)));
  };

  // Renderers stay referentially stable (React would otherwise remount every
  // custom block — e.g. re-run Mermaid — on each render); they read the
  // latest data through this ref instead.
  const live = useRef({ files, fileIds, tasks, assets, bodyOffset, depth, onOpenHref, onToggleTask });
  live.current = { files, fileIds, tasks, assets, bodyOffset, depth, onOpenHref, onToggleTask };

  const components = useMemo<Components>(() => ({
    h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
    h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
    h4: ({ children }) => <h4 className="md-h4">{children}</h4>,
    h5: ({ children }) => <h5 className="md-h5">{children}</h5>,
    h6: ({ children }) => <h6 className="md-h6">{children}</h6>,
    a: ({ href, children }) => {
      const url = typeof href === 'string' ? href : '';
      if (url.startsWith('file://')) {
        const exists = live.current.fileIds.has(url.slice('file://'.length));
        return <a href={url} onClick={e => open(url, e)} className={cn('md-internal-link', !exists && 'is-unresolved')}>{children}</a>;
      }
      if (url.startsWith('wikilink:')) {
        const target = decodeURIComponent(url.slice('wikilink:'.length).split('#')[0]);
        const exists = Boolean(resolveWikilink(target, live.current.files));
        return (
          <a href={url} onClick={e => open(url, e)} className={cn('md-internal-link', !exists && 'is-unresolved')} title={exists ? target : `${target} (not created yet — click to create)`}>
            {children}
          </a>
        );
      }
      if (url.startsWith('task://')) {
        const target = parseTaskHref(url);
        const exists = target ? live.current.tasks.has(`${target.fileId}/${target.taskId}`) : false;
        return <a href={url} onClick={e => open(url, e)} className={cn('md-task-link', !exists && 'is-unresolved')}>{children}</a>;
      }
      if (url.startsWith('tag:')) return <a href={url} onClick={e => open(url, e)} className="md-tag-pill">{children}</a>;
      if (url.startsWith('asset://')) return <span className="text-accent">{children}</span>;
      // Empty href = the url transform rejected an unsafe scheme — render as text.
      if (!url) return <span className="text-faint">{children}</span>;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="md-external-link">
          {children}
          <ExternalLink className="ml-0.5 inline h-3 w-3 align-baseline opacity-60" />
        </a>
      );
    },
    img: ({ src, alt }) => {
      const raw = typeof src === 'string' ? src : '';
      const resolved = raw.startsWith('asset://') ? live.current.assets[raw.slice('asset://'.length)] || '' : raw;
      if (!resolved) return <span className="italic text-faint">[{alt || 'Missing asset'}]</span>;
      const caption = alt ? <span className="mt-1.5 block text-center text-xs italic text-faint">{alt}</span> : null;
      if (resolved.startsWith('data:video') || /\.(mp4|webm|mov)$/i.test(raw)) {
        return <span className="my-4 block"><video controls src={resolved} className="max-h-[500px] max-w-full rounded-lg border border-border bg-black" />{caption}</span>;
      }
      if (resolved.startsWith('data:audio') || /\.(mp3|wav|ogg)$/i.test(raw)) {
        return <span className="my-4 block"><audio controls src={resolved} className="w-full" />{caption}</span>;
      }
      return <span className="my-4 block"><img src={resolved} alt={alt || ''} className="mx-auto max-w-full rounded-lg" />{caption}</span>;
    },
    li: ({ node, children, className: cls }) => {
      const isTask = String(cls || '').includes('task-list-item');
      const offset = node?.position?.start.offset;
      return (
        <li className={cn(isTask && 'md-task-item')} data-task-offset={isTask && offset !== undefined ? live.current.bodyOffset + offset : undefined}>
          {children}
        </li>
      );
    },
    input: ({ checked }) => (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        readOnly
        disabled={!live.current.onToggleTask}
        className="md-checkbox"
        aria-label={checked ? 'Completed task' : 'Open task'}
      />
    ),
    blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>,
    pre: ({ node, children }) => {
      const codeEl = node?.children?.[0] as { tagName?: string; properties?: { className?: string[] }; children?: Array<{ value?: string }> } | undefined;
      const classes = codeEl?.properties?.className || [];
      const language = classes.find(c => String(c).startsWith('language-'))?.toString().slice('language-'.length);
      const code = (codeEl?.children || []).map(c => c.value || '').join('');
      if (language === 'mermaid') return <MermaidBlock code={code} />;
      return <CodeBlock language={language} code={code}>{children}</CodeBlock>;
    },
    code: ({ className: cls, children }) =>
      cls ? <code className={String(cls)}>{children}</code> : <code className="md-inline-code">{children}</code>,
    table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="md-table">{children}</table></div>,
    mark: ({ children }) => <mark className="md-highlight">{children}</mark>,
    span: ({ children, style, className: cls }) => {
      // KaTeX output (added after sanitizing) carries classes + layout styles;
      // user-written spans can't have classes, so they only get a hex colour.
      if (cls) return <span className={String(cls)} style={style}>{children}</span>;
      const color = (style as React.CSSProperties | undefined)?.color;
      return typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color.trim())
        ? <span style={{ color: color.trim() }}>{children}</span>
        : <span>{children}</span>;
    },
    ['md-tag' as string]: ({ children }: { children?: React.ReactNode }) => {
      const tag = String(React.Children.toArray(children).join('')).replace(/^#/, '');
      return <a href={`tag:${tag}`} onClick={e => open(`tag:${tag}`, e)} className="md-tag-pill">#{tag}</a>;
    },
    ['md-callout' as string]: (props: { kind?: string; fold?: string; title?: string; children?: React.ReactNode }) => (
      <Callout kind={props.kind} fold={props.fold} title={props.title}>{props.children}</Callout>
    ),
    ['md-embed' as string]: (props: { target?: string; heading?: string }) => {
      const target = props.target || '';
      const file = resolveWikilink(target, live.current.files);
      const href = `wikilink:${target}`;
      if (!file) {
        return (
          <div className="my-3 rounded-lg border border-dashed border-border px-3 py-2 text-[0.85em] text-faint">
            <a href={href} onClick={e => open(href, e)} className="md-internal-link is-unresolved">{target}</a> — not created yet
          </div>
        );
      }
      const meta = getFileTypeMeta(file.type);
      const Icon = meta.icon;
      return (
        <div className="md-embed my-4 rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[0.8em]">
            <Icon className="h-3.5 w-3.5 text-faint" />
            <span className="font-medium text-content">{file.name}</span>
            <a href={href} onClick={e => open(href, e)} className="ml-auto text-accent hover:underline">Open</a>
          </div>
          <div className="px-4 py-3">
            {file.type === 'doc' && typeof file.content === 'string' && live.current.depth < 2 ? (
              <MarkdownView source={file.content} files={live.current.files} assets={live.current.assets} onOpenHref={live.current.onOpenHref} depth={live.current.depth + 1} hideProperties />
            ) : (
              <p className="text-[0.85em] text-faint">{meta.label} — open it to view.</p>
            )}
          </div>
        </div>
      );
    },
  }), []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type === 'checkbox' && onToggleTask) {
      const li = target.closest<HTMLElement>('li[data-task-offset]');
      if (li?.dataset.taskOffset) {
        e.preventDefault();
        onToggleTask(Number(li.dataset.taskOffset));
      }
    }
  };

  return (
    <div className={cn('doc-md', className)} onClick={handleClick}>
      {!hideProperties && <Properties data={data} onTag={tag => onOpenHref?.(`tag:${tag}`, false)} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkObsidian]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex]}
        urlTransform={urlTransform}
        components={components}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownView;
