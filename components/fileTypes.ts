import type React from 'react';
import { FileText, Network, CheckSquare, Bug, Map as MapIcon, Table, PenTool, Image as ImageIcon, File, Database, LayoutDashboard, Spline, Waypoints } from 'lucide-react';
import type { FileType } from '../types';

// Display metadata for every file type, shared by the shell (explorer, tabs,
// switcher, ribbon) so icons and labels never drift between surfaces.

export interface FileTypeMeta {
  type: FileType;
  label: string;
  pluralLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  /** One-line description used by the "new file" menus. */
  blurb: string;
}

export const FILE_TYPES: FileTypeMeta[] = [
  { type: 'doc', label: 'Document', pluralLabel: 'Documents', icon: FileText, blurb: 'Markdown notes and specs' },
  { type: 'base', label: 'Base', pluralLabel: 'Bases', icon: Database, blurb: 'Database with table, board, gallery, and calendar views' },
  { type: 'canvas', label: 'Canvas', pluralLabel: 'Canvases', icon: LayoutDashboard, blurb: 'Infinite board of cards, files, and links' },
  { type: 'vector', label: 'Vector Art', pluralLabel: 'Vector Art', icon: Spline, blurb: 'Vertex/edge drawing that exports to SVG' },
  { type: 'flowchart', label: 'Flowchart', pluralLabel: 'Flowcharts', icon: Network, blurb: 'Nodes and edges' },
  { type: 'todo', label: 'Task List', pluralLabel: 'Task Lists', icon: CheckSquare, blurb: 'Production tasks' },
  { type: 'kanban', label: 'Bug Tracker', pluralLabel: 'Bug Trackers', icon: Bug, blurb: 'Kanban bug board' },
  { type: 'roadmap', label: 'Roadmap', pluralLabel: 'Roadmaps', icon: MapIcon, blurb: 'Phases and milestones' },
  { type: 'grid', label: 'Data Grid', pluralLabel: 'Data Grids', icon: Table, blurb: 'Tables and stats' },
  { type: 'whiteboard', label: 'Whiteboard', pluralLabel: 'Whiteboards', icon: PenTool, blurb: 'Freeform canvas' },
  { type: 'asset-gallery', label: 'Asset Library', pluralLabel: 'Asset Libraries', icon: ImageIcon, blurb: 'Project media' },
];

const META_BY_TYPE = new Map(FILE_TYPES.map(meta => [meta.type, meta]));

export const getFileTypeMeta = (type: FileType): FileTypeMeta =>
  META_BY_TYPE.get(type) || { type, label: 'File', pluralLabel: 'Files', icon: File, blurb: '' };

export const ASSET_LIBRARY_TYPE: FileType = 'asset-gallery';

/** Pseudo-file for the project graph view (not stored in the project). */
export const GRAPH_VIEW_ID = '__graph__';
export const GRAPH_VIEW_META: FileTypeMeta = { type: 'graph', label: 'Graph view', pluralLabel: 'Graph views', icon: Waypoints, blurb: 'How files link together' };
META_BY_TYPE.set('graph', GRAPH_VIEW_META);

/** Project "systems": one per project, always at the root, never renamed/deleted. */
export const SINGLE_INSTANCE_FILE_TYPES = new Set<FileType>([ASSET_LIBRARY_TYPE, 'todo', 'kanban', 'roadmap']);

export const MANDATORY_SINGLETON_FILES: Array<{ type: FileType; name: string }> = [
  { type: 'todo', name: 'Task List' },
  { type: 'kanban', name: 'Bug Tracker' },
  { type: 'roadmap', name: 'Roadmap' },
  { type: ASSET_LIBRARY_TYPE, name: 'Asset Library' },
];
