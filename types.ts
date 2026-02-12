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
}

export interface KanbanData {
  tasks: Bug[];
}

// --- NEW: Roadmap Types ---

export type RoadmapItemType = 'phase' | 'milestone';
export type RoadmapStatus = 'planned' | 'in-progress' | 'completed' | 'delayed' | 'dropped';

export interface RoadmapItem {
  id: string;
  title: string;
  startDate: string; // ISO Date string YYYY-MM-DD
  endDate: string;   // For milestones, this equals startDate
  type: RoadmapItemType;
  status: RoadmapStatus;
  progress: number; // 0 to 100
  description?: string;
}

export interface RoadmapData {
  items: RoadmapItem[];
}

// --------------------------

export type FileContent = string | FlowchartData | TodoData | KanbanData | RoadmapData | any;
export type FileType = 'doc' | 'flowchart' | 'todo' | 'kanban' | 'roadmap' | string;

export interface ProjectFile {
  id: string;
  name: string;
  type: FileType;
  content: FileContent;
}

export interface Project {
  id: string;
  name: string;
  type: 'Software' | 'Game' | 'Web';
  description: string;
  lastModified: number;
  files: ProjectFile[];
  assets: Record<string, string>; 
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
}