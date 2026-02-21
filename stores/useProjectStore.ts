import { create } from 'zustand';
import { Project, ViewState } from '../types';

type Updater<T> = T | ((prev: T) => T);

interface ProjectStoreState {
  projects: Project[];
  isLoaded: boolean;
  currentView: ViewState;
  activeProjectId: string | null;
  activeFileId: string | null;
  setProjects: (next: Updater<Project[]>) => void;
  setIsLoaded: (next: boolean) => void;
  setCurrentView: (next: ViewState) => void;
  setActiveProjectId: (next: string | null) => void;
  setActiveFileId: (next: string | null) => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  projects: [],
  isLoaded: false,
  currentView: ViewState.DASHBOARD,
  activeProjectId: null,
  activeFileId: null,
  setProjects: (next) =>
    set((state) => ({
      projects: typeof next === 'function' ? (next as (prev: Project[]) => Project[])(state.projects) : next
    })),
  setIsLoaded: (next) => set({ isLoaded: next }),
  setCurrentView: (next) => set({ currentView: next }),
  setActiveProjectId: (next) => set({ activeProjectId: next }),
  setActiveFileId: (next) => set({ activeFileId: next })
}));
