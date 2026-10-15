import type { ProjectFile } from '../types';

// Obsidian-flavoured markdown helpers shared by the editor, reading view,
// search, backlinks, the tags panel, and rename-link updating.

// --- Frontmatter -------------------------------------------------------------

export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[];

export interface Frontmatter {
  data: Record<string, FrontmatterValue>;
  /** The raw YAML between the fences, or null when there is no frontmatter. */
  raw: string | null;
  body: string;
  /** Character offset where `body` starts in the original source. */
  bodyOffset: number;
}

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const parseScalar = (raw: string): FrontmatterValue => {
  const value = raw.trim();
  if (value === '' || value === '~' || value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(',').map(part => parseScalar(part)) : [];
  }
  return value;
};

/**
 * Parses Obsidian "properties": a flat YAML subset (scalars, inline arrays,
 * and `- item` lists). Anything fancier is kept as a plain string.
 */
export const parseFrontmatter = (source: string): Frontmatter => {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return { data: {}, raw: null, body: source, bodyOffset: 0 };
  const data: Record<string, FrontmatterValue> = {};
  let currentList: FrontmatterValue[] | null = null;
  const openLists: string[] = [];
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentList) {
      currentList.push(parseScalar(listItem[1]));
      continue;
    }
    const pair = /^([^:\s][^:]*):(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].trim();
    const rest = pair[2].trim();
    if (rest === '') {
      currentList = [];
      data[key] = currentList;
      openLists.push(key);
    } else {
      currentList = null;
      data[key] = parseScalar(rest);
    }
  }
  // An empty `key:` that never got `- item` lines is just an empty value.
  for (const key of openLists) {
    const value = data[key];
    if (Array.isArray(value) && value.length === 0) data[key] = null;
  }
  return { data, raw: match[1], body: source.slice(match[0].length), bodyOffset: match[0].length };
};

// --- Code-aware scanning -----------------------------------------------------

/** Blanks out fenced code, inline code, and math so scanners skip them (offsets preserved). */
export const maskCode = (source: string): string =>
  source
    .replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2[^\n]*(?=\n|$)|$)/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]+`/g, m => ' '.repeat(m.length))
    .replace(/\$\$[\s\S]*?\$\$/g, m => m.replace(/[^\n]/g, ' '));

// --- Tags --------------------------------------------------------------------

/** A tag must contain at least one non-digit (Obsidian rule). */
export const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

const frontmatterTags = (data: Record<string, FrontmatterValue>): string[] => {
  const raw = data.tags ?? data.tag;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : [];
  return list.map(t => String(t ?? '').replace(/^#/, '').trim()).filter(Boolean);
};

/** Every tag in a document (frontmatter `tags:` plus inline #tags), without the '#'. */
export const extractTags = (source: string): string[] => {
  const { data, body } = parseFrontmatter(source);
  const tags = new Set(frontmatterTags(data));
  for (const match of maskCode(body).matchAll(TAG_RE)) tags.add(match[2]);
  return Array.from(tags);
};

// --- Wikilinks ---------------------------------------------------------------

export interface Wikilink {
  embed: boolean;
  target: string;
  heading?: string;
  alias?: string;
  index: number;
  length: number;
}

export const WIKILINK_RE = /(!?)\[\[([^\]\n|#]*)(?:#([^\]\n|]*))?(?:\|([^\]\n]*))?\]\]/g;

export const extractWikilinks = (source: string): Wikilink[] => {
  const masked = maskCode(source);
  const links: Wikilink[] = [];
  for (const m of masked.matchAll(WIKILINK_RE)) {
    const target = m[2].trim();
    if (!target) continue;
    links.push({
      embed: m[1] === '!',
      target,
      heading: m[3]?.trim() || undefined,
      alias: m[4]?.trim() || undefined,
      index: m.index ?? 0,
      length: m[0].length,
    });
  }
  return links;
};

/** Case-insensitive name match; a "Folder/Name" target matches on its last segment. */
export const resolveWikilink = (target: string, files: ProjectFile[]): ProjectFile | undefined => {
  const name = target.split('/').pop()!.trim().toLowerCase();
  if (!name) return undefined;
  return files.find(f => f.name.toLowerCase() === name);
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrites [[Old]], [[Old|alias]], [[Old#h]] and ![[Old]] to point at `newName`. */
export const renameWikilinks = (source: string, oldName: string, newName: string): string => {
  if (!source.includes('[[')) return source;
  const re = new RegExp(`(!?\\[\\[)((?:[^\\]\\n|#]*/)?)${escapeRegExp(oldName)}(\\s*)(?=[\\]|#])`, 'gi');
  return source.replace(re, (_m, open: string, _folder: string, space: string) => `${open}${newName}${space}`);
};

// --- Headings ----------------------------------------------------------------

export const slugifyHeading = (text: string) =>
  text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

// --- Dates (daily notes, templates) -----------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Fills {{date}}, {{time}}, {{title}} like Obsidian's core Templates plugin. */
export const applyTemplateVariables = (template: string, title: string, now = new Date()) =>
  template
    .replace(/\{\{\s*date\s*\}\}/gi, formatDate(now))
    .replace(/\{\{\s*time\s*\}\}/gi, formatTime(now))
    .replace(/\{\{\s*title\s*\}\}/gi, title);
