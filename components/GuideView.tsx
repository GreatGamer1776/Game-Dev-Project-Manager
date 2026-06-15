import React, { useEffect, useState } from 'react';
import { FileText, Network, CheckSquare, Bug, Map, Table, PenTool, Image as ImageIcon, Box, Keyboard, Lightbulb, FolderOpen, Workflow, HardDrive, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { APP_CHANGELOG } from '../services/appChangelog';

export type GuideSectionId = 'overview' | 'updates' | 'tools' | 'shortcuts' | 'workflows' | 'storage' | 'tips';

const sections: { id: GuideSectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'updates', label: "What's New" },
  { id: 'tools', label: 'File Types & Tools' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'storage', label: 'Storage & Export' },
  { id: 'tips', label: 'Tips & Best Practices' },
];

const tools = [
  {
    icon: FileText,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    title: 'Document',
    type: 'doc',
    summary: 'Markdown-based rich text editor for long-form writing.',
    description: 'Documents are the backbone of your project planning. They use a custom Markdown renderer with support for headings, bold, italic, strikethrough, inline code, code blocks, blockquotes, ordered/unordered lists, horizontal rules, and embedded images from the Asset Library.',
    useCases: [
      'Game Design Documents (GDD) — describe mechanics, world-building, lore, and rules',
      'Technical specifications — architecture notes, engine choices, API documentation',
      'Meeting notes and brainstorms',
      'Story scripts, dialogue drafts, and narrative outlines',
      'README files and onboarding guides for your team',
    ],
    features: [
      'Live Markdown preview with custom parser',
      'Embed images from Asset Library using [[asset:id]] syntax',
      'Link to other project files using [[file:id]] syntax',
      'Link to specific tasks using [[task:id]] syntax',
      'Auto-save with manual save (Ctrl+S)',
      'Undo / Redo with debounced history (Ctrl+Z / Ctrl+Y)',
    ],
  },
  {
    icon: Network,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    title: 'Flowchart',
    type: 'flowchart',
    summary: 'Node-based visual diagram editor built on ReactFlow.',
    description: 'Flowcharts let you create interactive node graphs for any kind of system visualization. Nodes are fully draggable, connectable, and labeled. You can build anything from simple linear flows to complex branching trees.',
    useCases: [
      'Game loops — visualize update/render cycles',
      'Dialogue trees — branch NPC conversations',
      'Quest branching — show player choice consequences',
      'AI behavior trees and finite state machines (FSM)',
      'Menu navigation flows and UI wireframes',
      'Level progression maps',
    ],
    features: [
      'Add, edit, and delete nodes with custom labels',
      'Connect nodes with directional edges',
      'Drag to reposition — auto-saves layout',
      'Minimap for navigating large graphs',
      'Undo / Redo for node and edge changes (Ctrl+Z / Ctrl+Y)',
    ],
  },
  {
    icon: CheckSquare,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    title: 'Task List',
    type: 'todo',
    summary: 'Prioritized task manager with statuses and sub-tasks.',
    description: 'Task Lists give you a structured way to track work items. Each task has a 5-status workflow (Not Started → In Progress → Review → Done, plus Blocked). Tasks support priority levels, descriptions, and hierarchical sub-tasks.',
    useCases: [
      'Sprint planning — break features into actionable tasks',
      'Daily to-do lists with drag-and-drop reordering',
      'Bug fix checklists for QA sessions',
      'Onboarding checklists for new team members',
      'Feature implementation tracking by milestone',
    ],
    features: [
      '5-status workflow: Not Started, In Progress, Review, Done, Blocked',
      'Priority levels for sorting and filtering',
      'Sub-tasks for breaking large items into smaller steps',
      'Drag-and-drop reordering',
      'Undo / Redo for all changes (Ctrl+Z / Ctrl+Y)',
      'Tasks can be linked from Documents using [[task:id]]',
    ],
  },
  {
    icon: Bug,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    title: 'Bug Tracker',
    type: 'kanban',
    summary: 'Kanban board for tracking bugs and issues by status column.',
    description: 'The Bug Tracker is a Kanban-style board with columns for To Do, In Progress, and Done. Each bug card has a title, description, and severity level. Drag cards between columns to update their status.',
    useCases: [
      'Track bugs discovered during playtesting',
      'Manage feature requests from testers or players',
      'QA triage — sort issues by severity (Critical, High, Medium, Low)',
      'Release blockers — see at a glance what needs fixing before ship',
    ],
    features: [
      'Kanban columns: To Do, In Progress, Done',
      'Severity levels for each bug',
      'Drag-and-drop between columns',
      'Add descriptions and notes to each card',
      'Undo / Redo (Ctrl+Z / Ctrl+Y)',
    ],
  },
  {
    icon: Map,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    title: 'Roadmap',
    type: 'roadmap',
    summary: 'Timeline planner for milestones and long-term project phases.',
    description: 'Roadmaps let you plan your project across weeks or months. Create phases (e.g., "Pre-production", "Alpha", "Beta", "Launch") with start and end dates, then populate them with milestones and deliverables.',
    useCases: [
      'Plan development sprints and milestones across a game\'s lifecycle',
      'Coordinate multi-discipline timelines (art, code, audio, design)',
      'Investor or publisher milestone tracking',
      'Release schedule planning with deadlines',
    ],
    features: [
      'Create phases with date ranges',
      'Add milestones within each phase',
      'Visual timeline layout',
      'Undo / Redo (Ctrl+Z / Ctrl+Y)',
    ],
  },
  {
    icon: Table,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    title: 'Data Grid',
    type: 'grid',
    summary: 'Spreadsheet-style editor for structured data and game stats.',
    description: 'Data Grids provide a spreadsheet interface for managing tabular data. Define custom columns (text, number, etc.) and fill rows with data. Essential for any game that relies on balanced numerical values.',
    useCases: [
      'Weapon stats — damage, fire rate, reload time, ammo capacity',
      'Enemy attributes — HP, speed, attack power, loot tables',
      'Item databases — name, type, rarity, description, price',
      'Localization tables — key, English, Spanish, French, etc.',
      'Level data — level number, difficulty, enemy count, rewards',
      'Achievement definitions — name, description, unlock condition',
    ],
    features: [
      'Dynamic columns — add, rename, reorder, and delete',
      'Row editing with inline cell editing',
      'Supports text and numeric data',
      'Undo / Redo for column and row changes (Ctrl+Z / Ctrl+Y)',
    ],
  },
  {
    icon: PenTool,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    title: 'Whiteboard',
    type: 'whiteboard',
    summary: 'Infinite canvas for freehand drawing and sketching.',
    description: 'The Whiteboard provides an infinite canvas where you can draw freehand with adjustable brush sizes and colors. It\'s the fastest way to get an idea out of your head and onto the screen without the overhead of a structured editor.',
    useCases: [
      'Quick level layout sketches',
      'UI/UX mockups and wireframes',
      'Brainstorming during team meetings',
      'Annotating screenshots (paste into Asset Library, then reference)',
      'Concept art thumbnails and composition studies',
    ],
    features: [
      'Freehand drawing with adjustable brush size and color',
      'Eraser tool',
      'Infinite canvas with pan and zoom',
      'Built-in undo / redo (200 levels)',
      'Export canvas as image',
    ],
  },
  {
    icon: ImageIcon,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    title: 'Asset Library',
    type: 'asset-gallery',
    summary: 'Central image repository used by Documents and Whiteboards.',
    description: 'The Asset Library is a project-level image store. Upload reference art, screenshots, concept art, or UI mockups here. Once uploaded, images can be referenced from Documents using the embed syntax, keeping your written content visually rich.',
    useCases: [
      'Store reference art and mood boards',
      'Collect screenshots from playtests',
      'Manage UI mockup images',
      'Keep concept art organized alongside the GDD',
    ],
    features: [
      'Upload images (PNG, JPG, GIF, WebP)',
      'Preview gallery with thumbnail grid',
      'Copy asset ID for embedding in Documents',
      'Delete unused assets to save project size',
    ],
  },
];

const shortcuts = [
  { category: 'Global', items: [
    { keys: 'Ctrl + K', desc: 'Open Command Palette — quick-search files, actions, and navigation' },
    { keys: 'Ctrl + \\', desc: 'Toggle sidebar collapse (project view)' },
    { keys: 'Ctrl + N', desc: 'Create a new file in the current project' },
  ]},
  { category: 'Editors (when focused)', items: [
    { keys: 'Ctrl + S', desc: 'Manual save — forces an immediate write to storage' },
    { keys: 'Ctrl + Z', desc: 'Undo — revert the last change' },
    { keys: 'Ctrl + Y', desc: 'Redo — re-apply an undone change' },
  ]},
];

const CollapsibleSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-5 py-3.5 bg-surface/60 hover:bg-surface-hover text-left transition-colors">
        {open ? <ChevronDown className="w-4 h-4 text-faint" /> : <ChevronRight className="w-4 h-4 text-faint" />}
        <span className="font-semibold text-content text-sm">{title}</span>
      </button>
      {open && <div className="px-5 py-4 border-t border-border/50">{children}</div>}
    </div>
  );
};

interface GuideViewProps {
  initialSection?: GuideSectionId;
}

const GuideView: React.FC<GuideViewProps> = ({ initialSection = 'overview' }) => {
  const [activeSection, setActiveSection] = useState<GuideSectionId>(initialSection);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="bg-surface-raised/40 border border-border rounded-xl p-6">
        <h3 className="text-xl font-semibold text-content mb-3">What is DevArchitect?</h3>
        <p className="text-muted leading-relaxed mb-4">
          DevArchitect is an <strong className="text-content">offline-capable project management workspace</strong> built specifically for game developers. 
          Instead of scattering your Game Design Documents in Word, tasks in Trello, bugs in Jira, and stat tables in Excel, 
          DevArchitect keeps everything in a single, portable project file.
        </p>
        <p className="text-muted leading-relaxed">
          Each project is a self-contained workspace with typed files (Documents, Flowcharts, Task Lists, Bug Trackers, Roadmaps, Data Grids, Whiteboards, and Asset Libraries) 
          organized in folders. Projects are stored in your browser's IndexedDB, and can be exported as <code className="text-content bg-surface-raised px-1.5 py-0.5 rounded text-xs">.zip</code> archives 
          or linked to a local folder on your disk for automatic persistence.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <FolderOpen className="w-8 h-8 text-blue-400 mb-3" />
          <h4 className="font-semibold text-content mb-1">Project-Based</h4>
          <p className="text-sm text-faint">Each project is a self-contained workspace with its own files, folders, and assets. Work on multiple projects and switch between them from the dashboard.</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <HardDrive className="w-8 h-8 text-emerald-400 mb-3" />
          <h4 className="font-semibold text-content mb-1">Offline-First</h4>
          <p className="text-sm text-faint">Everything is stored locally in your browser. No accounts, no cloud sync, no internet required. Your data stays on your machine.</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <Workflow className="w-8 h-8 text-purple-400 mb-3" />
          <h4 className="font-semibold text-content mb-1">Integrated Tools</h4>
          <p className="text-sm text-faint">Eight specialized editors work together. Link tasks from documents, embed asset images, and cross-reference files without leaving the app.</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h4 className="font-semibold text-content mb-3">Quick Start</h4>
        <ol className="space-y-2 text-sm text-muted">
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-blue-400 flex items-center justify-center text-xs font-bold">1</span><span><strong className="text-content">Create a project</strong> from the dashboard — give it a name, type, and description.</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-blue-400 flex items-center justify-center text-xs font-bold">2</span><span><strong className="text-content">Add files</strong> using the "New File" button in the sidebar. Choose the editor type that fits your content.</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-blue-400 flex items-center justify-center text-xs font-bold">3</span><span><strong className="text-content">Organize with folders</strong> — create folders to group related files (e.g., "Design", "Art", "Code").</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-blue-400 flex items-center justify-center text-xs font-bold">4</span><span><strong className="text-content">Save your work</strong> — files auto-save, but use Ctrl+S for manual saves. Export the project as a .zip for backup.</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-blue-400 flex items-center justify-center text-xs font-bold">5</span><span><strong className="text-content">Link a local folder</strong> — use "Import Local Folder" to persist your project directly to disk for version control.</span></li>
        </ol>
      </div>
    </div>
  );

  const renderUpdates = () => (
    <div className="space-y-6">
      <div className="bg-surface-raised/40 border border-border rounded-xl p-6">
        <h3 className="text-xl font-semibold text-content mb-2">App Changelog</h3>
        <p className="text-muted leading-relaxed">
          This section tracks updates to DevArchitect itself so users can quickly see what changed between releases.
        </p>
      </div>

      {APP_CHANGELOG.map((entry, index) => (
        <div key={entry.id} className="relative border border-border rounded-xl bg-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-bg/70">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="text-lg font-semibold text-content">{entry.title}</h4>
                <p className="text-sm text-muted mt-1">{entry.summary}</p>
              </div>
              <span className="shrink-0 text-xs uppercase tracking-wide text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1">
                {entry.date}
              </span>
            </div>
          </div>
          <div className="px-5 py-4">
            <ul className="space-y-2">
              {entry.changes.map((change, changeIndex) => (
                <li key={`${entry.id}-${changeIndex}`} className="text-sm text-muted flex gap-2">
                  <span className="text-emerald-400 shrink-0 mt-1">•</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
          {index === 0 && (
            <div className="absolute top-4 right-4 md:right-28">
              <span className="text-[10px] uppercase tracking-[0.2em] text-faint">Latest</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderTools = () => (
    <div className="space-y-4">
      <p className="text-muted text-sm mb-2">
        DevArchitect provides 8 specialized file types. Click any tool below to see its full capabilities and suggested use cases.
      </p>
      {tools.map((tool) => (
        <CollapsibleSection key={tool.type} title={tool.title}>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className={`shrink-0 p-3 rounded-xl ${tool.bg}`}>
                <tool.icon className={`w-7 h-7 ${tool.color}`} />
              </div>
              <div>
                <p className="text-sm text-content font-medium">{tool.summary}</p>
                <p className="text-sm text-faint mt-1 leading-relaxed">{tool.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-faint mb-2">Use Cases</h5>
                <ul className="space-y-1.5">
                  {tool.useCases.map((uc, i) => (
                    <li key={i} className="text-sm text-muted flex gap-2">
                      <span className="text-blue-500 shrink-0 mt-1">•</span>
                      <span>{uc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-faint mb-2">Features</h5>
                <ul className="space-y-1.5">
                  {tool.features.map((f, i) => (
                    <li key={i} className="text-sm text-muted flex gap-2">
                      <span className="text-emerald-500 shrink-0 mt-1">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );

  const renderShortcuts = () => (
    <div className="space-y-6">
      <p className="text-muted text-sm mb-2">
        Use keyboard shortcuts to work faster. All shortcuts use Ctrl on Windows/Linux and ⌘ (Cmd) on macOS.
      </p>
      {shortcuts.map((group) => (
        <div key={group.category}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-faint mb-3">{group.category}</h4>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {group.items.map((item, i) => (
              <div key={i} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-border/50' : ''}`}>
                <kbd className="shrink-0 min-w-[120px] px-3 py-1.5 bg-surface-raised border border-border-strong rounded-lg text-xs font-mono text-content text-center">{item.keys}</kbd>
                <span className="text-sm text-muted">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderWorkflows = () => (
    <div className="space-y-4">
      <CollapsibleSection title="Cross-File Linking" defaultOpen>
        <div className="space-y-3 text-sm text-muted">
          <p>DevArchitect files can reference each other using a special link syntax in Documents:</p>
          <div className="bg-bg border border-border rounded-lg p-4 font-mono text-xs space-y-2">
            <p><span className="text-blue-400">[[file:&lt;file-id&gt;]]</span> — Creates a clickable link to another file. Click it in preview to jump to that file.</p>
            <p><span className="text-emerald-400">[[task:&lt;task-id&gt;]]</span> — Links directly to a specific task in a Task List. Clicking navigates to the task and highlights it.</p>
            <p><span className="text-purple-400">[[asset:&lt;asset-id&gt;]]</span> — Embeds an image from the Asset Library inline in the document.</p>
          </div>
          <p>To get a file's ID, hover over it in the sidebar and click the copy icon. For task IDs, look at the task details in the Task List editor.</p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Suggested Project Structure">
        <div className="space-y-3 text-sm text-muted">
          <p>A well-organized project might look like:</p>
          <div className="bg-bg border border-border rounded-lg p-4 font-mono text-xs leading-loose text-content">
            <p>📁 Design</p>
            <p className="ml-4">📄 Game Design Document <span className="text-faint">(doc)</span></p>
            <p className="ml-4">📄 Core Game Loop <span className="text-faint">(flowchart)</span></p>
            <p className="ml-4">📄 Dialogue Trees <span className="text-faint">(flowchart)</span></p>
            <p>📁 Production</p>
            <p className="ml-4">📄 Sprint Tasks <span className="text-faint">(todo)</span></p>
            <p className="ml-4">📄 Bug List <span className="text-faint">(kanban)</span></p>
            <p className="ml-4">📄 Release Roadmap <span className="text-faint">(roadmap)</span></p>
            <p>📁 Data</p>
            <p className="ml-4">📄 Weapon Stats <span className="text-faint">(grid)</span></p>
            <p className="ml-4">📄 Enemy Database <span className="text-faint">(grid)</span></p>
            <p>📁 Art</p>
            <p className="ml-4">📄 Reference Images <span className="text-faint">(asset-gallery)</span></p>
            <p className="ml-4">📄 Level Sketches <span className="text-faint">(whiteboard)</span></p>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Command Palette">
        <div className="space-y-3 text-sm text-muted">
          <p>Press <kbd className="px-2 py-0.5 bg-surface-raised border border-border-strong rounded text-xs font-mono text-content">Ctrl + K</kbd> anywhere to open the Command Palette. It lets you:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-blue-500">•</span>Search and open any file in the current project by name</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span>Quickly switch between files without navigating the sidebar tree</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span>Access files deep inside nested folders instantly</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Undo & Redo">
        <div className="space-y-3 text-sm text-muted">
          <p>Every editor supports undo and redo with up to 50 history levels (200 for Whiteboard):</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-emerald-500">✓</span><strong className="text-content">Ctrl+Z</strong> to undo, <strong className="text-content">Ctrl+Y</strong> to redo</li>
            <li className="flex gap-2"><span className="text-emerald-500">✓</span>Toolbar buttons are also available at the top of each editor</li>
            <li className="flex gap-2"><span className="text-emerald-500">✓</span>History is per-file and resets when you switch files</li>
            <li className="flex gap-2"><span className="text-emerald-500">✓</span>Document editor uses smart debouncing — rapid typing is grouped into single undo steps</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Auto-Save & Manual Save">
        <div className="space-y-3 text-sm text-muted">
          <p>All editors auto-save your changes after a short delay (typically 1-2 seconds of inactivity). You'll see a save indicator when changes are persisted.</p>
          <p>Use <kbd className="px-2 py-0.5 bg-surface-raised border border-border-strong rounded text-xs font-mono text-content">Ctrl + S</kbd> to force an immediate save if you want to be sure your latest changes are written before exporting or switching files.</p>
        </div>
      </CollapsibleSection>
    </div>
  );

  const renderStorage = () => (
    <div className="space-y-4">
      <CollapsibleSection title="Browser Storage (IndexedDB)" defaultOpen>
        <div className="space-y-3 text-sm text-muted">
          <p>By default, all projects are stored in your browser's <strong className="text-content">IndexedDB</strong>. This means:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-blue-500">•</span>Data persists across browser sessions — closing and reopening the tab won't lose your work</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span>Storage is local only — no data is sent to any server</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span>Clearing browser data (cookies/storage) will delete your projects, so export regularly</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Export as ZIP">
        <div className="space-y-3 text-sm text-muted">
          <p>Export any project as a <code className="text-content bg-surface-raised px-1.5 py-0.5 rounded text-xs">.zip</code> file for backup or sharing. The archive contains all files and assets in a structured format that can be re-imported later.</p>
          <p>To export: go to the Dashboard, find the project card, and click the download icon.</p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Local Folder Linking">
        <div className="space-y-3 text-sm text-muted">
          <p>For version control workflows, you can link a project to a <strong className="text-content">local folder</strong> on your disk using the browser's File System Access API.</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-blue-500">•</span>Click "Import Local Folder" on the Dashboard to link a directory</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span>The project reads/writes files directly to that folder</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span>Combine with Git for full version history of your project files</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span>The disk icon on a project card indicates it's folder-linked</li>
          </ul>
          <p className="text-faint text-xs mt-2">Note: Local folder linking requires a Chromium-based browser (Chrome, Edge, Brave) due to File System Access API support.</p>
        </div>
      </CollapsibleSection>
    </div>
  );

  const renderTips = () => (
    <div className="space-y-4">
      <CollapsibleSection title="Game Design Documents" defaultOpen>
        <div className="space-y-2 text-sm text-muted">
          <p>Structure your GDD as a Document file with clear sections:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-amber-500">★</span>Start with a one-paragraph "elevator pitch" for the game concept</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Use headings for each major section: Core Mechanics, Art Style, Audio, UI, Monetization</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Embed flowcharts for game loops and system diagrams using file links</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Reference data grids for any numerical values — keeps the GDD readable while stats stay editable</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Balancing Game Data">
        <div className="space-y-2 text-sm text-muted">
          <p>Use Data Grids as your single source of truth for game stats:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-amber-500">★</span>Create one grid per data category (Weapons, Enemies, Items, Levels)</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Keep columns consistent — use the same naming conventions across grids</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Include a "Notes" column for explaining balance rationale</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Production Planning">
        <div className="space-y-2 text-sm text-muted">
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-amber-500">★</span>Use the Roadmap for high-level milestones (monthly/quarterly goals)</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Use Task Lists for weekly sprint tasks — break milestones into actionable items</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Use the Bug Tracker during and after playtests — triage bugs by severity immediately</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Link tasks in documents so stakeholders can click through to the actual work items</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Keeping Projects Portable">
        <div className="space-y-2 text-sm text-muted">
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-amber-500">★</span>Export a .zip backup before clearing browser data or switching machines</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Use local folder linking + Git for the most robust backup strategy</li>
            <li className="flex gap-2"><span className="text-amber-500">★</span>Keep asset images reasonably sized — very large images increase project file size significantly</li>
          </ul>
        </div>
      </CollapsibleSection>
    </div>
  );

  const contentMap: Record<GuideSectionId, () => React.ReactNode> = {
    overview: renderOverview,
    updates: renderUpdates,
    tools: renderTools,
    shortcuts: renderShortcuts,
    workflows: renderWorkflows,
    storage: renderStorage,
    tips: renderTips,
  };

  const sectionIcons: Record<GuideSectionId, React.ReactNode> = {
    overview: <Box className="w-4 h-4" />,
    updates: <BookOpen className="w-4 h-4" />,
    tools: <FolderOpen className="w-4 h-4" />,
    shortcuts: <Keyboard className="w-4 h-4" />,
    workflows: <Workflow className="w-4 h-4" />,
    storage: <HardDrive className="w-4 h-4" />,
    tips: <Lightbulb className="w-4 h-4" />,
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="shrink-0 px-8 py-6 border-b border-border bg-bg">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-accent/20 rounded-lg">
            <Box className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-content">DevArchitect Guide</h1>
            <p className="text-sm text-faint">Everything you need to know about this project management workspace.</p>
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <div className="shrink-0 px-8 border-b border-border bg-bg/80">
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeSection === s.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-faint hover:text-content hover:border-border-strong'
              }`}
            >
              {sectionIcons[s.id]}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-8 py-8">
          {contentMap[activeSection]()}
        </div>
      </div>
    </div>
  );
};

export default GuideView;
