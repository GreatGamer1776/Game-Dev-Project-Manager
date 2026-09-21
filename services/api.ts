import { Project, ViewState } from '../types';

export type PersistedAppState = {
  currentView: ViewState;
  activeProjectId: string | null;
  activeFileId: string | null;
  sidebarCollapsed?: boolean;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API request failed: ${init?.method || 'GET'} ${path} -> ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
};

export const api = {
  listProjects: () => request<Project[]>('/projects'),
  saveProject: (project: Project) =>
    request<Project>(`/projects/${encodeURIComponent(project.id)}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  loadAppState: () => request<PersistedAppState | null>('/state'),
  saveAppState: (state: PersistedAppState) =>
    request<{ ok: boolean }>('/state', { method: 'PUT', body: JSON.stringify(state) }),
};
