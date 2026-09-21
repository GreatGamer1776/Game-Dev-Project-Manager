// Mirrors the frontend's persisted models (see ../types.ts). The project
// aggregate is always read and written as a unit, so files/folders/assets are
// stored as JSONB payloads rather than normalized tables.
export interface ProjectFile {
  id: string;
  name: string;
  type: string;
  content: unknown;
  folderId?: string | null;
}

export interface ProjectFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Project {
  id: string;
  name: string;
  type: 'Software' | 'Game' | 'Web';
  description: string;
  lastModified: number;
  files: ProjectFile[];
  folders: ProjectFolder[];
  assets: Record<string, string>;
  isLocal?: boolean;
}

export interface AppState {
  currentView: string;
  activeProjectId: string | null;
  activeFileId: string | null;
  sidebarCollapsed?: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  type: string;
  description: string;
  last_modified: string | number;
  is_local: boolean;
  files: ProjectFile[];
  folders: ProjectFolder[];
  assets: Record<string, string>;
}

export const rowToProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  type: row.type as Project['type'],
  description: row.description ?? '',
  // pg returns BIGINT as a string; normalize back to a number.
  lastModified: Number(row.last_modified) || 0,
  files: row.files ?? [],
  folders: row.folders ?? [],
  assets: row.assets ?? {},
  isLocal: row.is_local ?? false,
});
