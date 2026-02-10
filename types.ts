
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

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
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

// Generic Content Type for flexibility
export type FileContent = string | FlowchartData | TodoData | KanbanData | any;

// FileType is now just a string, allowing for infinite expansion via the registry
export type FileType = 'doc' | 'flowchart' | 'todo' | 'kanban' | string;

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
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  PROJECT = 'PROJECT',
}

// Standardized Interface for all Editor Components
export interface EditorProps {
  initialContent: any;
  onSave: (content: any) => void;
  fileName: string;
}
