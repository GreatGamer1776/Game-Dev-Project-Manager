import React, { useEffect, useState } from 'react';
import { SHORTCUTS } from './HelpModal';
import { FileText, Network, CheckSquare, Bug, Map, Table, PenTool, Image as ImageIcon, Box, Keyboard, Lightbulb, FolderOpen, Workflow, HardDrive, ChevronDown, ChevronRight, Database, LayoutDashboard, Spline, Waypoints } from 'lucide-react';

export type GuideSectionId = 'overview' | 'tools' | 'shortcuts' | 'workflows' | 'storage' | 'tips';

const sections: { id: GuideSectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
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
    summary: 'Obsidian-style markdown notes with live preview.',
    description: 'Documents are the backbone of your project planning. Live preview renders markdown as you type and only shows the raw markup on the line you are editing; switch to source mode or reading view any time. Obsidian syntax works throughout: [[wikilinks]], ![[embeds]], #tags, ==highlights==, > [!callouts], properties, math ($…$), Mermaid diagrams, tables, footnotes, and task lists.',
    useCases: [
      'Game Design Documents (GDD) — describe mechanics, world-building, lore, and rules',
      'Technical specifications — architecture notes, engine choices, API documentation',
      'Meeting notes and brainstorms',
      'Story scripts, dialogue drafts, and narrative outlines',
      'README files and onboarding guides for your team',
    ],
    features: [
      'Type [[ to link a file, # for tags, / at the start of a line for blocks and templates',
      'Paste or drop images, video, and audio to add them to the Asset Library',
      'Click a [[link]] to a missing note to create it; renaming a file updates its links',
      'Tick task checkboxes right in live preview or reading view',
      'Find & replace (Ctrl+F), Ctrl+B / I / K / L shortcuts, multiple cursors',
      'Auto-save, plus Export as .md from the ⋯ menu',
    ],
  },
  {
    icon: Database,
    color: 'text-accent',
    bg: 'bg-accent/10',
    title: 'Base',
    type: 'base',
    summary: 'A Notion / Obsidian Bases style database with several views.',
    description: 'Bases hold rows with typed properties — text, number, select, multi-select, date, checkbox, URL, and links to other project files. The same rows can be shown as a table, a board grouped by a select property, a gallery of cards, or a month calendar.',
    useCases: [
      'Character, item, or quest catalogues with tags and statuses',
      'Playtest feedback tracking with a board per status',
      'Content calendars and release schedules',
      'Asset or level checklists that link to their design documents',
    ],
    features: [
      'Table, Board, Gallery, and Calendar views — each with its own filters, sorts, and hidden properties',
      'Drag cards between board columns or calendar days',
      'Column totals (count, sum, average, min, max, checked)',
      'Open any row as a panel with all properties and markdown notes',
      'Change a property type and values are converted',
    ],
  },
  {
    icon: LayoutDashboard,
    color: 'text-accent',
    bg: 'bg-accent/10',
    title: 'Canvas',
    type: 'canvas',
    summary: 'An Obsidian-style infinite board of cards, files, links, and groups.',
    description: 'Canvases (JSON Canvas compatible) arrange markdown cards, live previews of other project files, web links, and coloured groups on an infinite surface, connected by labelled arrows.',
    useCases: [
      'Mood boards and moment-to-moment design sketches',
      'Mapping how documents and systems relate',
      'Story and quest structure with linked notes',
    ],
    features: [
      'Double-click empty space to add a card; cards render markdown, [[links]], and #tags',
      'Drag files from the sidebar onto the canvas to embed them',
      'Groups carry the cards inside them when moved',
      'Six colours for cards and connections, edge labels, arrows on/off',
    ],
  },
  {
    icon: Spline,
    color: 'text-accent',
    bg: 'bg-accent/10',
    title: 'Vector Art',
    type: 'vector',
    summary: 'A point-and-line drawing tool that exports clean SVG and PNG.',
    description: 'Draw by dropping points joined by lines; any closed region can be filled (rings and cut-outs included), and fills follow the shape as you move its points. Circles, warpable text boxes, layers and tracing images complete the toolkit.',
    useCases: ['Icons and UI glyphs', 'Level blockouts and map diagrams', 'Logos and simple sprites'],
    features: [
      'Pen (L), Point (P), Line (E), Circle (C), Text (T), Fill (F), Eyedropper (I), Guide line (X), Select (V), Pan (H)',
      'Snaps to points, lines, alignment, parallel/perpendicular angles, guide lines and an optional grid',
      'Scale, rotate and move handles; group (G), split, disconnect, merge; Alt-drag tears a line off a point',
      'Layers with hide/lock, faded tracing images, live length and angle readouts',
      'Zero-width lines act as invisible construction guides',
      'Export SVG or 1×/2× PNG, or copy the SVG markup',
    ],
  },
  {
    icon: Waypoints,
    color: 'text-accent',
    bg: 'bg-accent/10',
    title: 'Graph view',
    type: 'graph',
    summary: 'See how every file links together (Ctrl+G).',
    description: 'The graph view draws each file as a node and each link — [[wikilinks]], file links, canvas file cards, Base file properties — as an edge. The right sidebar also has a local graph for the open file.',
    useCases: ['Finding orphaned documents', 'Seeing which systems a feature touches'],
    features: ['Drag nodes, scroll to zoom, click to open', 'Optionally show tags and project systems', 'Tune link distance and repel force'],
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
      'Tasks can be linked from Documents with the task-link toolbar button',
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
  { category: 'Global', items: SHORTCUTS.filter(s => !s.desc.includes('inside editors')) },
  { category: 'Editors (when focused)', items: [
    { keys: 'Ctrl + S', desc: 'Save now — forces an immediate write to storage' },
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
          organized in folders. Projects are stored in your account's workspace database, so they follow you to any browser or device, 
          and can be exported as <code className="text-content bg-surface-raised px-1.5 py-0.5 rounded text-xs">.zip</code> archives for backup.
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
          <h4 className="font-semibold text-content mb-1">Private by Design</h4>
          <p className="text-sm text-faint">Your projects live in a database you control. Sign in with just a username and password — no email or personal info required.</p>
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
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">1</span><span><strong className="text-content">Create a project</strong> from the dashboard — give it a name, type, and description.</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">2</span><span><strong className="text-content">Add files</strong> with the new-file button at the top of the file sidebar, or right-click a folder. Choose the editor type that fits your content.</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">3</span><span><strong className="text-content">Organize with folders</strong> — create folders to group related files (e.g., "Design", "Art", "Code").</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">4</span><span><strong className="text-content">Save your work</strong> — everything auto-saves; the status bar shows when changes reach the server. Export the project as a .zip for backup.</span></li>
          <li className="flex gap-3"><span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">5</span><span><strong className="text-content">Pick up anywhere</strong> — sign in from another browser or device and your projects are right where you left them.</span></li>
        </ol>
      </div>
    </div>
  );

  const renderTools = () => (
    <div className="space-y-4">
      <p className="text-muted text-sm mb-2">
        DevArchitect provides 11 specialized file types plus a graph view. Click any tool below to see its full capabilities and suggested use cases.
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
                      <span className="text-accent shrink-0 mt-1">•</span>
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
                      <span className="text-accent shrink-0 mt-1">✓</span>
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
            <p><span className="text-accent">[Name](file://&lt;file-id&gt;)</span> — Creates a clickable link to another file. Click it in preview to jump to that file.</p>
            <p><span className="text-success">[Task](task://&lt;file-id&gt;/&lt;task-id&gt;)</span> — Links directly to a specific task in a Task List. Clicking navigates to the task and highlights it.</p>
            <p><span className="text-accent">![Caption](asset://&lt;asset-id&gt;)</span> — Embeds an image from the Asset Library inline in the document.</p>
          </div>
          <p>The easiest way to link is to drag a file from the sidebar into a document, or right-click it and choose <strong className="text-content">Copy link</strong>. Every file's incoming links appear in the right sidebar under <strong className="text-content">Links</strong>.</p>
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
          <p>Press <kbd className="kbd">Ctrl + O</kbd> anywhere to open the quick switcher, or <kbd className="kbd">Ctrl + P</kbd> for the command palette. They let you:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-accent">•</span>Fuzzy-search and open any file in the current project, or switch projects</li>
            <li className="flex gap-2"><span className="text-accent">•</span>Create a new document by typing a name and pressing Shift + Enter</li>
            <li className="flex gap-2"><span className="text-accent">•</span>Run any command — type "&gt;" in the switcher to jump to commands</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Undo & Redo">
        <div className="space-y-3 text-sm text-muted">
          <p>Every editor supports undo and redo with up to 50 history levels (200 for Whiteboard):</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-accent">✓</span><strong className="text-content">Ctrl+Z</strong> to undo, <strong className="text-content">Ctrl+Y</strong> to redo</li>
            <li className="flex gap-2"><span className="text-accent">✓</span>Toolbar buttons are also available at the top of each editor</li>
            <li className="flex gap-2"><span className="text-accent">✓</span>History is per-file and resets when you switch files</li>
            <li className="flex gap-2"><span className="text-accent">✓</span>Document editor uses smart debouncing — rapid typing is grouped into single undo steps</li>
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
      <CollapsibleSection title="Workspace Database" defaultOpen>
        <div className="space-y-3 text-sm text-muted">
          <p>All projects are stored in the workspace database behind your account. This means:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-accent">•</span>Data persists across browsers, devices, and sessions — sign in anywhere to pick up where you left off</li>
            <li className="flex gap-2"><span className="text-accent">•</span>Each account sees only its own projects</li>
            <li className="flex gap-2"><span className="text-accent">•</span>Clearing browser data only signs you out — your projects stay safe on the server</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Your Account">
        <div className="space-y-3 text-sm text-muted">
          <p>Accounts are just a username and password — no email or personal information is collected or stored.</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-accent">•</span>Sign-up is invite-only — an admin creates accounts from Manage users (account menu at the bottom of the ribbon)</li>
            <li className="flex gap-2"><span className="text-accent">•</span>Sessions last 30 days; sign back in anytime with the same credentials</li>
            <li className="flex gap-2"><span className="text-accent">•</span>Forgot your password? An admin can set a new one from Manage Users</li>
            <li className="flex gap-2"><span className="text-accent">•</span>Sign out from the account menu at the bottom of the ribbon, or Settings → Account</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Export as ZIP">
        <div className="space-y-3 text-sm text-muted">
          <p>Export any project as a <code className="text-content bg-surface-raised px-1.5 py-0.5 rounded text-xs">.zip</code> file for backup or sharing. The archive contains all files and assets in a structured format that can be re-imported later.</p>
          <p>To export: open the project switcher at the bottom of the file sidebar and choose <strong className="text-content">Export as ZIP</strong>, or right-click a project on the projects screen.</p>
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
            <li className="flex gap-2"><span className="text-accent">★</span>Start with a one-paragraph "elevator pitch" for the game concept</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Use headings for each major section: Core Mechanics, Art Style, Audio, UI, Monetization</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Embed flowcharts for game loops and system diagrams using file links</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Reference data grids for any numerical values — keeps the GDD readable while stats stay editable</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Balancing Game Data">
        <div className="space-y-2 text-sm text-muted">
          <p>Use Data Grids as your single source of truth for game stats:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-accent">★</span>Create one grid per data category (Weapons, Enemies, Items, Levels)</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Keep columns consistent — use the same naming conventions across grids</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Include a "Notes" column for explaining balance rationale</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Production Planning">
        <div className="space-y-2 text-sm text-muted">
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-accent">★</span>Use the Roadmap for high-level milestones (monthly/quarterly goals)</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Use Task Lists for weekly sprint tasks — break milestones into actionable items</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Use the Bug Tracker during and after playtests — triage bugs by severity immediately</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Link tasks in documents so stakeholders can click through to the actual work items</li>
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Keeping Projects Portable">
        <div className="space-y-2 text-sm text-muted">
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2"><span className="text-accent">★</span>Export a .zip backup regularly — it is the portable, self-contained copy of a project</li>
            <li className="flex gap-2"><span className="text-accent">★</span>Keep asset images reasonably sized — very large images increase project file size significantly</li>
          </ul>
        </div>
      </CollapsibleSection>
    </div>
  );

  const contentMap: Record<GuideSectionId, () => React.ReactNode> = {
    overview: renderOverview,
    tools: renderTools,
    shortcuts: renderShortcuts,
    workflows: renderWorkflows,
    storage: renderStorage,
    tips: renderTips,
  };

  const sectionIcons: Record<GuideSectionId, React.ReactNode> = {
    overview: <Box className="w-4 h-4" />,
    tools: <FolderOpen className="w-4 h-4" />,
    shortcuts: <Keyboard className="w-4 h-4" />,
    workflows: <Workflow className="w-4 h-4" />,
    storage: <HardDrive className="w-4 h-4" />,
    tips: <Lightbulb className="w-4 h-4" />,
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="shrink-0 px-8 pt-6 pb-4 bg-bg">
        <h1 className="text-2xl font-semibold text-content">DevArchitect Guide</h1>
        <p className="text-[0.8125rem] text-muted mt-1">Everything you need to know about this project management workspace.</p>
      </div>

      {/* Nav tabs */}
      <div className="shrink-0 px-8 border-b border-border bg-bg">
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeSection === s.id
                  ? 'border-accent text-content'
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
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-8">
          {contentMap[activeSection]()}
        </div>
      </div>
    </div>
  );
};

export default GuideView;
