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
  icon?: string;
  /** Legacy project type; new projects leave it unset. */
  type?: 'Software' | 'Game' | 'Web';
  description: string;
  lastModified: number;
  files: ProjectFile[];
  folders: ProjectFolder[];
  assets: Record<string, string>;
}

export interface AppState {
  currentView: string;
  activeProjectId: string | null;
  activeFileId: string | null;
  sidebarCollapsed?: boolean;
  filePanelOpen?: boolean;
  rightPanelOpen?: boolean;
  tabs?: Array<{ fileId: string | null; pinned: boolean }>;
  activeTabIndex?: number;
  bookmarks?: Record<string, string[]>;
  workspace?: unknown;
}

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  is_admin: boolean;
  created_at: string | number;
}

export interface ProjectRow {
  id: string;
  user_id: string | null;
  name: string;
  type: string;
  icon: string | null;
  description: string;
  last_modified: string | number;
  files: ProjectFile[];
  folders: ProjectFolder[];
  assets: Record<string, string>;
}

export const rowToProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  ...(row.type ? { type: row.type as NonNullable<Project['type']> } : {}),
  ...(row.icon ? { icon: row.icon } : {}),
  description: row.description ?? '',
  // pg returns BIGINT as a string; normalize back to a number.
  lastModified: Number(row.last_modified) || 0,
  files: row.files ?? [],
  folders: row.folders ?? [],
  assets: row.assets ?? {},
});
