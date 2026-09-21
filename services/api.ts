import { Project, ViewState } from '../types';

export type PersistedAppState = {
  currentView: ViewState;
  activeProjectId: string | null;
  activeFileId: string | null;
  sidebarCollapsed?: boolean;
};

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'devarchitect-token';

let authToken: string | null = null;
try {
  authToken = window.localStorage.getItem(TOKEN_KEY);
} catch {
  authToken = null;
}

export const getAuthToken = () => authToken;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage unavailable (private mode, etc.) — token stays in memory only.
  }
};

// Called on any 401 so the app can drop back to the login screen.
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401 && authToken) {
    unauthorizedHandler?.();
  }
  if (!res.ok) {
    let message = `API request failed: ${init?.method || 'GET'} ${path} -> ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
};

export const api = {
  register: (username: string, password: string) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AuthUser }>('/auth/me'),
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
