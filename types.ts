export interface FlowchartNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { label: string };
  style?: any;
}

export interface FlowchartEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  style?: any;
}

export interface FlowchartData {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

export type Priority = 'Low' | 'Medium' | 'High';

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export type TodoStatus = 'To Do' | 'In Progress' | 'Done';

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  status: TodoStatus;
  priority: Priority;
  dueDate?: string;
  description?: string;
  subTasks?: SubTask[];
  category?: string;
  tags?: string[];
  estimateHours?: number;
}

export interface TodoData {
  items: TodoItem[];
}

export type BugSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type BugStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface Bug {
  id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  createdAt: number;
  dueDate?: string;
  tags?: string[];
  category?: string;
  reproducible?: boolean;
}

export interface KanbanData {
  tasks: Bug[];
}

export type RoadmapItemType = 'phase' | 'milestone';
export type RoadmapStatus = 'planned' | 'in-progress' | 'completed' | 'delayed' | 'dropped';

export interface RoadmapItem {
  id: string;
  title: string;
  startDate: string; 
  endDate: string;   
  type: RoadmapItemType;
  status: RoadmapStatus;
  progress: number; 
  description?: string;
}

export interface RoadmapData {
  items: RoadmapItem[];
}

export interface GridColumn {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean';
}

export interface GridRow {
  id: string;
  [key: string]: any;
}

export interface GridData {
  columns: GridColumn[];
  rows: GridRow[];
}

export type FileContent = string | FlowchartData | TodoData | KanbanData | RoadmapData | GridData | any;

export type FileType = 
  | 'doc' 
  | 'flowchart' 
  | 'todo' 
  | 'kanban' 
  | 'roadmap' 
  | 'grid' 
  | 'whiteboard' 
  | 'asset-gallery' 
  | string;

export interface ProjectFile {
  id: string;
  name: string;
  type: FileType;
  content: FileContent;
  folderId?: string | null; // Added for folder support
}

// Added Folder Interface
export interface ProjectFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Project {
  id: string;
  name: string;
  type: 'Software' | 'Game' | 'Web';
  description: string;
  lastModified: number;
  files: ProjectFile[];
  folders: ProjectFolder[]; // Added folders list
  assets: Record<string, string>; 
  isLocal?: boolean;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  PROJECT = 'PROJECT',
}

export interface EditorProps {
  initialContent: any;
  onSave: (content: any) => void;
  fileName: string;
  assets?: Record<string, string>;
  onAddAsset?: (file: File) => Promise<string>; 
  onDeleteAsset?: (assetId: string) => void;
  projectFiles?: ProjectFile[];
  activeFileId?: string | null;
  onOpenFile?: (fileId: string) => void;
}
