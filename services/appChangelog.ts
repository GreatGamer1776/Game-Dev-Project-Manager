export interface AppChangelogEntry {
  id: string;
  title: string;
  date: string;
  summary: string;
  changes: string[];
}

export const APP_CHANGELOG: AppChangelogEntry[] = [
  {
    id: '2026-04-03-local-folder-update',
    title: 'Local Folder Workflow Update',
    date: 'April 3, 2026',
    summary: 'Local persistence is safer and easier to use for browser-stored projects.',
    changes: [
      'Added Link to Local Folder so browser-created projects can be attached to disk without needing a pre-existing project.json file.',
      'Protected against overwriting a different project when a selected folder already contains project data.',
      'Improved local project reloads so linked projects hydrate from disk on startup instead of relying on stale IndexedDB snapshots.',
      'Cleaned up deleted asset files from linked folders so removed assets do not reappear after reload.',
      'Added a dedicated What\'s New section in the guide so users can review app updates inside the project manager.'
    ]
  },
  {
    id: '2026-02-09-initial-release',
    title: 'Initial Workspace Release',
    date: 'February 9, 2026',
    summary: 'The first local-first version of DevArchitect landed.',
    changes: [
      'Added support for documents, flowcharts, task lists, bug tracking, roadmaps, data grids, whiteboards, and asset libraries.',
      'Introduced IndexedDB persistence for offline project storage.',
      'Shipped ZIP export for portable backups and sharing.'
    ]
  }
];
