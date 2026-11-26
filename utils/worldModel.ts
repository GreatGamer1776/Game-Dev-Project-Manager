import type React from 'react';
import { User, MapPin, Shield, PawPrint, Gem, Scroll, BookOpen, Sparkles } from 'lucide-react';
import type { ProjectFile } from '../types';
import { parseFrontmatter, FrontmatterValue } from './markdown';

// World entries: ordinary markdown documents marked with a `kind` property.
// Templates give each kind game-narrative properties and section headings;
// the Codex view browses everything that carries a known kind.

export type EntryKind = 'character' | 'location' | 'faction' | 'creature' | 'item' | 'quest' | 'lore' | 'ability';

export interface EntryKindMeta {
  kind: EntryKind;
  label: string;
  plural: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Frontmatter lines after `kind:` (raw YAML, values may be empty or [[links]]). */
  properties: string[];
  /** Properties worth showing on codex cards, in order. */
  highlights: string[];
  sections: string[];
}

export const ENTRY_KINDS: EntryKindMeta[] = [
  {
    kind: 'character', label: 'Character', plural: 'Characters', icon: User,
    properties: ['role: npc', 'faction: "[[ ]]"', 'home: "[[ ]]"', 'status: alive', 'aliases: []'],
    highlights: ['role', 'faction', 'status'],
    sections: ['Summary', 'Appearance', 'Personality and motivation', 'Backstory', 'Relationships', 'In the game', 'Quest hooks', 'Secrets'],
  },
  {
    kind: 'location', label: 'Location', plural: 'Locations', icon: MapPin,
    properties: ['type: town', 'region: "[[ ]]"', 'controlled by: "[[ ]]"', 'danger: low'],
    highlights: ['type', 'region', 'danger'],
    sections: ['Summary', 'Look and atmosphere', 'Points of interest', 'Inhabitants', 'History', 'In the game', 'Secrets'],
  },
  {
    kind: 'faction', label: 'Faction', plural: 'Factions', icon: Shield,
    properties: ['type: guild', 'leader: "[[ ]]"', 'base: "[[ ]]"', 'stance toward player: neutral'],
    highlights: ['type', 'leader', 'stance toward player'],
    sections: ['Summary', 'Goals', 'Structure and ranks', 'Allies and rivals', 'History', 'In the game', 'Secrets'],
  },
  {
    kind: 'creature', label: 'Creature', plural: 'Creatures', icon: PawPrint,
    properties: ['type: beast', 'habitat: "[[ ]]"', 'threat: medium', 'intelligent: false'],
    highlights: ['type', 'habitat', 'threat'],
    sections: ['Summary', 'Appearance', 'Behavior', 'Abilities and weaknesses', 'Ecology and lore', 'In the game'],
  },
  {
    kind: 'item', label: 'Item', plural: 'Items', icon: Gem,
    properties: ['type: weapon', 'rarity: common', 'found in: "[[ ]]"', 'owner: "[[ ]]"'],
    highlights: ['type', 'rarity', 'found in'],
    sections: ['Summary', 'Description', 'Effects and stats', 'History', 'How to get it'],
  },
  {
    kind: 'quest', label: 'Quest', plural: 'Quests', icon: Scroll,
    properties: ['type: side', 'giver: "[[ ]]"', 'location: "[[ ]]"', 'status: draft', 'reward: ', 'prerequisites: '],
    highlights: ['type', 'giver', 'status'],
    sections: ['Summary', 'Hook', 'Objectives', 'Steps', 'Choices and branches', 'Rewards and consequences', 'Dialogue notes'],
  },
  {
    kind: 'lore', label: 'Lore', plural: 'Lore', icon: BookOpen,
    properties: ['type: event', 'era: ', 'related: []'],
    highlights: ['type', 'era'],
    sections: ['Summary', 'What happened', 'Who was involved', 'Aftermath', 'What people believe', 'What is actually true'],
  },
  {
    kind: 'ability', label: 'Ability', plural: 'Abilities', icon: Sparkles,
    properties: ['type: magic', 'source: ', 'cost: ', 'users: []'],
    highlights: ['type', 'source', 'cost'],
    sections: ['Summary', 'How it works', 'Rules and limits', 'Cost and risks', 'Who can use it', 'In the game'],
  },
];

const META_BY_KIND = new Map(ENTRY_KINDS.map(meta => [meta.kind, meta]));

export const getEntryKindMeta = (kind: EntryKind): EntryKindMeta => META_BY_KIND.get(kind)!;

export const isEntryKind = (value: unknown): value is EntryKind =>
  typeof value === 'string' && META_BY_KIND.has(value.trim().toLowerCase() as EntryKind);

/** Root folder that new entries are filed under, one subfolder per kind. */
export const WORLD_FOLDER = 'World';

export const builtInEntryTemplate = (kind: EntryKind): string => {
  const meta = getEntryKindMeta(kind);
  const frontmatter = ['---', `kind: ${kind}`, ...meta.properties, '---'].join('\n');
  const sections = meta.sections.map(title => `## ${title}\n\n`).join('');
  return `${frontmatter}\n\n${sections}`;
};

/**
 * A doc named after the kind ("Character") in the templates folder overrides
 * the built-in. A user template without `kind:` gets it added, so the entry
 * still shows up in the codex.
 */
export const entryTemplate = (kind: EntryKind, templateDocs: ProjectFile[]): string => {
  const meta = getEntryKindMeta(kind);
  const names = new Set([meta.kind, meta.label.toLowerCase()]);
  const custom = templateDocs.find(f => typeof f.content === 'string' && names.has(f.name.trim().toLowerCase()));
  if (!custom) return builtInEntryTemplate(kind);
  const content = custom.content as string;
  const { data, raw } = parseFrontmatter(content);
  if (isEntryKind(data.kind)) return content;
  if (raw !== null) return content.replace(/^---[ \t]*\r?\n/, `---\nkind: ${kind}\n`);
  return `---\nkind: ${kind}\n---\n\n${content}`;
};

export interface WorldEntry {
  file: ProjectFile;
  kind: EntryKind;
  properties: Record<string, FrontmatterValue>;
  aliases: string[];
  /** First paragraph of the body, markdown stripped. */
  summary: string;
}

const stripMarkdown = (text: string) =>
  text
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => (alias || target).trim())
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~=`>#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** First paragraph of prose (skips headings, lists, code, callouts). */
const firstParagraph = (body: string): string => {
  let inFence = false;
  const lines: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!trimmed) {
      if (lines.length) break;
      continue;
    }
    if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||---|\$\$)/.test(trimmed)) {
      if (lines.length) break;
      continue;
    }
    lines.push(trimmed);
  }
  return stripMarkdown(lines.join(' '));
};

const toList = (value: FrontmatterValue | undefined): string[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(toList);
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
};

/** Reads a document as a world entry, or null when it has no known `kind`. */
export const readWorldEntry = (file: ProjectFile): WorldEntry | null => {
  if (file.type !== 'doc' || typeof file.content !== 'string' || !file.content.startsWith('---')) return null;
  const { data, body } = parseFrontmatter(file.content);
  if (!isEntryKind(data.kind)) return null;
  return {
    file,
    kind: String(data.kind).trim().toLowerCase() as EntryKind,
    properties: data,
    aliases: toList(data.aliases ?? data.alias),
    summary: firstParagraph(body),
  };
};

export const readWorldEntries = (files: ProjectFile[]): WorldEntry[] =>
  files.map(readWorldEntry).filter((e): e is WorldEntry => e !== null);

/** A property value as display text: "[[Iron Guild]]" -> "Iron Guild"; empty links -> "". */
export const propertyText = (value: FrontmatterValue | undefined): string =>
  toList(value).map(v => stripMarkdown(v)).filter(Boolean).join(', ');

/** `[[Target]]` names inside a property value. */
export const propertyLinks = (value: FrontmatterValue | undefined): string[] =>
  toList(value).flatMap(v => Array.from(v.matchAll(/\[\[([^\]|#]+)/g), m => m[1].trim())).filter(Boolean);

/** Deep-maps every string in JSON-like content (used to rewrite links on rename). */
export const mapStrings = <T,>(value: T, fn: (text: string) => string): T => {
  if (typeof value === 'string') return fn(value) as unknown as T;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map(v => {
      const mapped = mapStrings(v, fn);
      if (mapped !== v) changed = true;
      return mapped;
    });
    return (changed ? next : value) as unknown as T;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const mapped = mapStrings(v, fn);
      if (mapped !== v) changed = true;
      next[key] = mapped;
    }
    return (changed ? next : value) as T;
  }
  return value;
};
