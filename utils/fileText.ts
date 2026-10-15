import type { ProjectFile } from '../types';
import { parseBase, cellText } from './baseModel';

// One source of truth for "what text is in a file", shared by full-text
// search, backlinks, the outline, and the status bar's word count.

// Keys whose values are identifiers/geometry, not user-facing text.
const SKIP_KEYS = new Set(['id', 'source', 'target', 'type', 'style', 'position', 'color', 'createdAt', 'folderId']);

const collectStrings = (value: unknown, out: string[], depth: number) => {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    // Embedded media (data URLs) is never useful as searchable text.
    if (value.length > 0 && !value.startsWith('data:')) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (!SKIP_KEYS.has(key)) collectStrings(child, out, depth + 1);
    }
  }
};

/** Plain searchable text for any file type. */
export const getFileText = (file: ProjectFile): string => {
  // Bases: human-readable cell values (option labels, not ids) plus row notes.
  if (file.type === 'base') {
    const base = parseBase(file.content);
    return base.rows
      .map(row => [...base.columns.map(c => cellText(c, row.cells[c.id])), row.notes || ''].filter(Boolean).join(' · '))
      .join('\n');
  }
  // Canvases: card text, group labels, and link URLs.
  if (file.type === 'canvas') {
    const nodes = Array.isArray(file.content?.nodes) ? file.content.nodes : [];
    return nodes.map((n: { text?: string; label?: string; url?: string }) => n.text || n.label || n.url || '').filter(Boolean).join('\n');
  }
  if (file.type === 'vector') {
    const texts = Array.isArray(file.content?.texts) ? file.content.texts : [];
    return texts.map((t: { text?: string }) => t.text || '').join('\n');
  }
  if (typeof file.content === 'string') {
    // Whiteboards store a serialized JSON string; documents are markdown.
    if (file.type === 'whiteboard') {
      try {
        const parsed = JSON.parse(file.content);
        const out: string[] = [];
        collectStrings(parsed, out, 0);
        return out.join('\n');
      } catch {
        return '';
      }
    }
    return file.content;
  }
  const out: string[] = [];
  collectStrings(file.content, out, 0);
  return out.join('\n');
};

/** Raw serialized content — used to find link references like file://<id>. */
export const getRawContent = (file: ProjectFile): string => {
  if (typeof file.content === 'string') return file.content;
  try {
    return JSON.stringify(file.content) || '';
  } catch {
    return '';
  }
};

/** Lower-cased wikilink targets (last path segment) referenced by raw content. */
const wikilinkTargets = (raw: string): Set<string> => {
  const targets = new Set<string>();
  if (!raw.includes('[[')) return targets;
  for (const m of raw.matchAll(/\[\[([^\]\n|#]+)/g)) {
    const name = m[1].split('/').pop()!.trim().toLowerCase();
    if (name) targets.add(name);
  }
  return targets;
};

/** Files whose content links to `targetId` (file:// and task:// links, or [[wikilinks]] by name). */
export const findBacklinks = (files: ProjectFile[], targetId: string): ProjectFile[] => {
  const target = files.find(f => f.id === targetId);
  const fileRef = `file://${targetId}`;
  const taskRef = `task://${targetId}`;
  const name = target?.name.toLowerCase();
  return files.filter(f => {
    if (f.id === targetId) return false;
    const raw = getRawContent(f);
    return raw.includes(fileRef) || raw.includes(taskRef) || (name !== undefined && wikilinkTargets(raw).has(name));
  });
};

/** Files this file links out to. */
export const findOutgoingLinks = (file: ProjectFile, files: ProjectFile[]): ProjectFile[] => {
  const raw = getRawContent(file);
  if (!raw.includes('://') && !raw.includes('[[')) return [];
  const names = wikilinkTargets(raw);
  return files.filter(f => f.id !== file.id && (
    raw.includes(`file://${f.id}`) || raw.includes(`task://${f.id}`) || names.has(f.name.toLowerCase())
  ));
};

export interface Heading {
  level: number;
  text: string;
  /** Index among all headings in the document (stable target for reveal). */
  index: number;
  /** 0-based source line. */
  line: number;
}

/** Markdown ATX headings, skipping fenced code blocks. */
export const extractHeadings = (markdown: string): Heading[] => {
  const headings: Heading[] = [];
  let inFence = false;
  markdown.split('\n').forEach((rawLine, line) => {
    const trimmed = rawLine.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (match) {
      const text = match[2].replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
      if (text) headings.push({ level: match[1].length, text, index: headings.length, line });
    }
  });
  return headings;
};

export const countWords = (text: string): number => {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return matches ? matches.length : 0;
};

export interface SearchMatch {
  /** Snippet text around the match. */
  before: string;
  match: string;
  after: string;
}

/** Case-insensitive substring matches with short context snippets. */
export const searchText = (text: string, query: string, limit = 3): { count: number; matches: SearchMatch[] } => {
  const q = query.toLowerCase();
  if (!q) return { count: 0, matches: [] };
  const lower = text.toLowerCase();
  const matches: SearchMatch[] = [];
  let count = 0;
  let from = 0;
  while (true) {
    const at = lower.indexOf(q, from);
    if (at === -1) break;
    count += 1;
    if (matches.length < limit) {
      const start = Math.max(0, at - 40);
      const end = Math.min(text.length, at + q.length + 60);
      matches.push({
        before: (start > 0 ? '…' : '') + text.slice(start, at).replace(/\s+/g, ' ').trimStart(),
        match: text.slice(at, at + q.length),
        after: text.slice(at + q.length, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : ''),
      });
    }
    from = at + q.length;
  }
  return { count, matches };
};

/**
 * Fuzzy subsequence match used by the quick switcher. Returns a score (higher
 * is better) and the matched character indexes, or null when `query` is not a
 * subsequence of `target`.
 */
export const fuzzyMatch = (target: string, query: string): { score: number; indexes: number[] } | null => {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indexes: [] };
  const t = target.toLowerCase();
  const contiguous = t.indexOf(q);
  if (contiguous !== -1) {
    // Contiguous hits rank first; earlier and word-start hits rank higher.
    const wordStart = contiguous === 0 || /[\s\-_/.]/.test(t[contiguous - 1]);
    return {
      score: 1000 - contiguous + (wordStart ? 200 : 0) - (t.length - q.length) * 0.5,
      indexes: Array.from({ length: q.length }, (_, i) => contiguous + i),
    };
  }
  const indexes: number[] = [];
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = t.indexOf(ch, ti);
    if (at === -1) return null;
    if (indexes.length > 0 && at === indexes[indexes.length - 1] + 1) score += 8;
    if (at === 0 || /[\s\-_/.]/.test(t[at - 1])) score += 10;
    score -= at - ti;
    indexes.push(at);
    ti = at + 1;
  }
  return { score, indexes };
};
