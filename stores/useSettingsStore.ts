import { create } from 'zustand';

// Open/close state for the program-wide Settings dialog. Kept in its own store
// so any component (sidebar, command palette, editors, ...) can open Settings
// without prop-drilling.
interface SettingsStoreState {
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  isSettingsOpen: false,
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
}));
