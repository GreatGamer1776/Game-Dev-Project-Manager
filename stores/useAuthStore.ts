import { create } from 'zustand';
import { api, AuthUser, getAuthToken, setAuthToken } from '../services/api';

interface AuthStoreState {
  /** null while the stored token is being verified on boot. */
  user: AuthUser | null;
  /** True once the initial token check has completed. */
  ready: boolean;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Drop the session locally without a server call (e.g. on a 401). */
  clearSession: () => void;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  user: null,
  ready: false,

  bootstrap: async () => {
    if (!getAuthToken()) {
      set({ user: null, ready: true });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, ready: true });
    } catch {
      // Token rejected or server unreachable — fall back to the login screen.
      setAuthToken(null);
      set({ user: null, ready: true });
    }
  },

  login: async (username, password) => {
    const { token, user } = await api.login(username, password);
    setAuthToken(token);
    set({ user });
  },

  register: async (username, password) => {
    const { token, user } = await api.register(username, password);
    setAuthToken(token);
    set({ user });
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      // Best effort — clear locally even if the server call fails.
    }
    setAuthToken(null);
    set({ user: null });
  },

  clearSession: () => {
    setAuthToken(null);
    set({ user: null });
  },
}));
