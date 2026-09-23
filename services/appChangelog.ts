export interface AppChangelogEntry {
  id: string;
  title: string;
  date: string;
  summary: string;
  changes: string[];
}

export const APP_CHANGELOG: AppChangelogEntry[] = [
  {
    id: '2026-09-22-admin-managed-accounts',
    title: 'Admin-Managed Accounts',
    date: 'September 22, 2026',
    summary: 'Accounts are now invite-only, managed by an admin.',
    changes: [
      'The first account created becomes the admin; open registration is then disabled.',
      'Admins can create, promote, reset passwords for, and delete accounts from Manage Users in the sidebar.',
      'HTTPS is now served by default — the app redirects to a secure connection automatically.',
      'Fixed a crash when the app was served over plain HTTP (missing secure-context browser APIs).'
    ]
  },
  {
    id: '2026-09-21-accounts-and-server',
    title: 'Accounts & Server Storage',
    date: 'September 21, 2026',
    summary: 'DevArchitect now runs as a full-stack app with accounts and a real database.',
    changes: [
      'Added username/password sign-in — no email or personal info required.',
      'Projects now persist in a PostgreSQL database through the backend API, so they follow your account across browsers and devices.',
      'Each account only sees its own projects.',
      'Removed local folder linking; browser storage is no longer used for project data.',
      'Added a one-command Docker Compose deployment (web + API + database).'
    ]
  },
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
