import { Project, ProjectFile, ProjectFolder, FileType } from '../types';
import { ASSET_LIBRARY_TYPE, MANDATORY_SINGLETON_FILES, SINGLE_INSTANCE_FILE_TYPES } from '../components/fileTypes';
import { uid } from './id';

// Pure project-shape helpers: default content, legacy migrations, and the
// normalization every loaded/updated project passes through.

export const createDefaultContent = (type: FileType): any => {
  switch (type) {
    case 'doc': return '';
    case 'flowchart': return { nodes: [], edges: [] };
    case 'todo': return { items: [] };
    case 'kanban': return { tasks: [] };
    case 'roadmap': return { items: [] };
    case 'grid': return { columns: [], rows: [] };
    case 'whiteboard': return '';
    case ASSET_LIBRARY_TYPE: return {};
    default: return '';
  }
};

export const createProjectFile = (type: FileType, name: string, folderId: string | null = null, content?: any): ProjectFile => ({
  id: uid(),
  name,
  type,
  content: content === undefined ? createDefaultContent(type) : content,
  folderId,
});

const TODO_STATUS_VALUES = new Set(['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);
const BUG_STATUS_VALUES = new Set(['Open', 'In Progress', 'Resolved', 'Closed']);

const migrateTodoContent = (content: any) => {
  const baseContent = content && typeof content === 'object' ? content : {};
  const rawItems = Array.isArray(content?.items) ? content.items : [];
  return {
    ...baseContent,
    items: rawItems.map((item: any) => {
      const { category: _legacyCategory, ...rest } = item || {};
      const normalizedStatus = TODO_STATUS_VALUES.has(rest.status) ? rest.status : (rest.completed ? 'Done' : 'To Do');
      return { ...rest, status: normalizedStatus, completed: normalizedStatus === 'Done' };
    }),
  };
};

const migrateKanbanContent = (content: any) => {
  const baseContent = content && typeof content === 'object' ? content : {};
  const rawTasks = Array.isArray(content?.tasks) ? content.tasks : [];
  return {
    ...baseContent,
    tasks: rawTasks.map((task: any) => {
      const { category: _legacyCategory, ...rest } = task || {};
      return {
        ...rest,
        status: BUG_STATUS_VALUES.has(rest.status) ? rest.status : 'Open',
        description: typeof rest.description === 'string' ? rest.description : '',
        createdAt: typeof rest.createdAt === 'number' ? rest.createdAt : Date.now(),
      };
    }),
  };
};

const migrateProjectFile = (file: ProjectFile): ProjectFile => {
  switch (file.type) {
    case 'changelog':
      return { ...file, type: 'doc' };
    case 'todo':
      return { ...file, content: migrateTodoContent(file.content) };
    case 'kanban':
      return { ...file, content: migrateKanbanContent(file.content) };
    default:
      return file;
  }
};

/**
 * Guarantees exactly one of each project "system" (task list, bug tracker,
 * roadmap, asset library) at the root, migrates legacy content, and fills in
 * missing collections.
 */
export const normalizeProject = (project: Project): Project => {
  const singletonByType = new Map<FileType, ProjectFile>();
  const files: ProjectFile[] = [];

  for (const file of project.files || []) {
    if (SINGLE_INSTANCE_FILE_TYPES.has(file.type)) {
      if (!singletonByType.has(file.type)) singletonByType.set(file.type, migrateProjectFile(file));
      continue;
    }
    files.push(migrateProjectFile(file));
  }

  for (const def of MANDATORY_SINGLETON_FILES) {
    const existing = singletonByType.get(def.type);
    files.push(existing
      ? (existing.name === def.name && existing.folderId === null ? existing : { ...existing, name: def.name, folderId: null })
      : createProjectFile(def.type, def.name));
  }

  return {
    ...project,
    folders: project.folders || [],
    assets: project.assets || {},
    files,
  };
};

/** "Untitled", "Untitled 1", ... unique among `taken` (case-insensitive). */
export const uniqueName = (base: string, taken: Iterable<string>): string => {
  const set = new Set(Array.from(taken, n => n.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 1; ; i++) {
    const candidate = `${base} ${i}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
};

/** Folder ids from the root down to (and including) `folderId`. */
export const folderChain = (folders: ProjectFolder[], folderId: string | null | undefined): ProjectFolder[] => {
  const byId = new Map(folders.map(f => [f.id, f]));
  const chain: ProjectFolder[] = [];
  const seen = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
};

/** `folderId` plus every folder nested beneath it. */
export const descendantFolderIds = (folders: ProjectFolder[], folderId: string): Set<string> => {
  const ids = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
};

export const STARTER_PROJECT: Project = {
  id: '1',
  name: 'Cosmic Invaders',
  type: 'Game',
  description: 'A retro-style space shooter.',
  lastModified: Date.now(),
  files: [
    { id: 'f1', name: 'Game Design Document', type: 'doc', content: '# Cosmic Invaders\n\n## Pitch\n\nA retro-style space shooter.\n\n## Core loop\n\n- Dodge\n- Shoot\n- Upgrade', folderId: null },
  ],
  folders: [],
  assets: {},
};
