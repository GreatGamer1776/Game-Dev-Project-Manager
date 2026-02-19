import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, CheckSquare, Square, Calendar, ChevronDown, ChevronUp, ListChecks, Loader2, Check, AlertCircle, MoreHorizontal, Link as LinkIcon, Tags, X } from 'lucide-react';
import { TodoItem, Priority, SubTask, EditorProps, TodoStatus } from '../types';

const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const TASK_CATEGORIES = ['General', 'Design', 'Programming', 'Art', 'Audio', 'QA', 'Production'] as const;

type SelectOption = {
  value: string;
  label: string;
};

const StyledSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
}> = ({ value, onChange, options, className = '', selectClassName = '', disabled = false }) => {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full appearance-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 pr-7 text-xs text-zinc-200 transition focus:border-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${selectClassName}`}
      >
        {options.map(option => (
          <option key={option.value} value={option.value} className="bg-zinc-900 text-zinc-200">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
    </div>
  );
};

const TodoEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, projectFiles = [], onOpenFile, activeFileId }) => {
  // Initialize items with migration logic for existing data (missing status)
  const [items, setItems] = useState<TodoItem[]>(() => {
    const rawItems = initialContent?.items || [];
    return rawItems.map((item: any) => ({
      ...item,
      status: item.status || (item.completed ? 'Done' : 'To Do')
    }));
  });
  
  // Save Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(JSON.stringify(items));

  // Drag & Drop State
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<TodoStatus | null>(null);

  // Form & UI State
  const [newItemText, setNewItemText] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<Priority>('Medium');
  const [newItemDate, setNewItemDate] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<string>('General');
  const [newItemStatus, setNewItemStatus] = useState<TodoStatus>('To Do');
  const [newItemEstimate, setNewItemEstimate] = useState('');
  const [newItemTags, setNewItemTags] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemSubTasks, setNewItemSubTasks] = useState<SubTask[]>([]);
  const [newItemSubTaskText, setNewItemSubTaskText] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<'All' | Priority>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | TodoStatus>('All');
  const [filterCategory, setFilterCategory] = useState<'All' | string>('All');
  const [sortBy, setSortBy] = useState<'Newest' | 'Oldest' | 'Priority' | 'Due Date' | 'Alphabetical' | 'Effort'>('Newest');
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubTaskText, setNewSubTaskText] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [linkPickerTaskId, setLinkPickerTaskId] = useState<string | null>(null);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const linkPickerRef = useRef<HTMLDivElement | null>(null);
  const fileLookup = React.useMemo(() => new Map(projectFiles.map(f => [f.id, f.name])), [projectFiles]);
  const linkableFiles = React.useMemo(
    () => projectFiles.filter(f => f.id !== activeFileId).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [projectFiles, activeFileId]
  );
  const filteredLinkableFiles = React.useMemo(() => {
    const query = linkPickerQuery.trim().toLowerCase();
    if (!query) return linkableFiles;
    return linkableFiles.filter(f =>
      f.name.toLowerCase().includes(query) || f.id.toLowerCase().includes(query)
    );
  }, [linkableFiles, linkPickerQuery]);
  const categoryOptions = React.useMemo(
    () => Array.from(new Set([...TASK_CATEGORIES, ...items.map(item => item.category || 'General')])).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [items]
  );

  const COLUMNS: TodoStatus[] = ['To Do', 'In Progress', 'Done'];

  // Sync with prop changes
  useEffect(() => {
    const rawItems = initialContent?.items || [];
    const migratedItems = rawItems.map((item: any) => ({
      ...item,
      status: item.status || (item.completed ? 'Done' : 'To Do')
    }));
    setItems(migratedItems);
    lastSavedData.current = JSON.stringify(migratedItems);
  }, [initialContent]);

  useEffect(() => {
    if (!linkPickerTaskId) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-link-picker-toggle="true"]')) return;
      if (!linkPickerRef.current) return;
      if (linkPickerRef.current.contains(event.target as Node)) return;
      setLinkPickerTaskId(null);
      setLinkPickerQuery('');
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [linkPickerTaskId]);

  useEffect(() => {
    if (!linkPickerTaskId) return;
    if (expandedId === linkPickerTaskId) return;
    setLinkPickerTaskId(null);
    setLinkPickerQuery('');
  }, [expandedId, linkPickerTaskId]);

  // Autosave
  useEffect(() => {
    const currentData = JSON.stringify(items);
    if (currentData === lastSavedData.current) return;

    setSaveStatus('unsaved');
    const timer = setTimeout(() => handleManualSave(), 2000);
    return () => clearTimeout(timer);
  }, [items]);

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items]);

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave({ items });
    lastSavedData.current = JSON.stringify(items);
    setTimeout(() => setSaveStatus('saved'), 500);
  };

  // --- Actions ---

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemText.trim()) return;

    const parsedEstimate = newItemEstimate.trim() ? Number(newItemEstimate.trim()) : undefined;
    const parsedTags = parseTagInput(newItemTags);
    const newItem: TodoItem = {
      id: crypto.randomUUID(),
      text: newItemText.trim(),
      completed: newItemStatus === 'Done',
      status: newItemStatus,
      priority: newItemPriority,
      dueDate: newItemDate || undefined,
      category: newItemCategory,
      estimateHours: typeof parsedEstimate === 'number' && !Number.isNaN(parsedEstimate) ? parsedEstimate : undefined,
      tags: parsedTags.length ? parsedTags : undefined,
      description: newItemDescription,
      subTasks: newItemSubTasks
    };

    setItems([newItem, ...items]); 
    setNewItemText('');
    setNewItemStatus('To Do');
    setNewItemPriority('Medium');
    setNewItemDate('');
    setNewItemCategory('General');
    setNewItemEstimate('');
    setNewItemTags('');
    setNewItemDescription('');
    setNewItemSubTasks([]);
    setNewItemSubTaskText('');
    setIsCreateModalOpen(false);
  };

  const handleTopAddTaskClick = () => {
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setNewItemText('');
    setNewItemStatus('To Do');
    setNewItemPriority('Medium');
    setNewItemDate('');
    setNewItemCategory('General');
    setNewItemEstimate('');
    setNewItemTags('');
    setNewItemDescription('');
    setNewItemSubTasks([]);
    setNewItemSubTaskText('');
  };

  const addCreateSubTask = () => {
    if (!newItemSubTaskText.trim()) return;
    setNewItemSubTasks(prev => [...prev, { id: crypto.randomUUID(), text: newItemSubTaskText.trim(), completed: false }]);
    setNewItemSubTaskText('');
  };

  const toggleCreateSubTask = (subTaskId: string) => {
    setNewItemSubTasks(prev => prev.map(sub => sub.id === subTaskId ? { ...sub, completed: !sub.completed } : sub));
  };

  const deleteCreateSubTask = (subTaskId: string) => {
    setNewItemSubTasks(prev => prev.filter(sub => sub.id !== subTaskId));
  };

  const deleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this task?")) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const duplicateItem = (id: string) => {
    const source = items.find(item => item.id === id);
    if (!source) return;
    const clone: TodoItem = {
      ...source,
      id: crypto.randomUUID(),
      text: `${source.text} (Copy)`,
      subTasks: (source.subTasks || []).map(sub => ({ ...sub, id: crypto.randomUUID() }))
    };
    setItems([clone, ...items]);
  };

  const updateItemStatus = (id: string, newStatus: TodoStatus) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, status: newStatus, completed: newStatus === 'Done' } : item
    ));
  };

  const updateItemDescription = (id: string, desc: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, description: desc } : item
    ));
  };

  const updateItemField = (id: string, patch: Partial<TodoItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const parseTagInput = (value: string) =>
    Array.from(new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))).slice(0, 8);

  const beginTaskTitleEdit = (item: TodoItem) => {
    setEditingTaskId(item.id);
    setEditingTaskText(item.text);
  };

  const commitTaskTitleEdit = () => {
    if (!editingTaskId) return;
    const trimmed = editingTaskText.trim();
    if (trimmed) {
      updateItemField(editingTaskId, { text: trimmed });
    }
    setEditingTaskId(null);
    setEditingTaskText('');
  };

  const cancelTaskTitleEdit = () => {
    setEditingTaskId(null);
    setEditingTaskText('');
  };

  const appendFileLinkToDescription = (itemId: string, fileId: string) => {
    const selected = projectFiles.find(f => f.id === fileId);
    if (!selected) return;
    const snippet = `[${selected.name}](file://${selected.id})`;
    setItems(currentItems =>
      currentItems.map(item =>
        item.id === itemId
          ? { ...item, description: `${item.description || ''}${item.description ? '\n' : ''}${snippet}` }
          : item
      )
    );
    setLinkPickerTaskId(null);
    setLinkPickerQuery('');
  };

  const toggleLinkPicker = (itemId: string) => {
    if (linkableFiles.length === 0) return;
    setLinkPickerTaskId(current => current === itemId ? null : itemId);
    setLinkPickerQuery('');
  };

  const getDraggedProjectFile = (e: React.DragEvent): { id: string; name: string } | null => {
    const raw = e.dataTransfer.getData(FILE_LINK_DRAG_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: string; name?: string };
        if (parsed?.id) return { id: parsed.id, name: parsed.name || projectFiles.find(f => f.id === parsed.id)?.name || 'Linked File' };
      } catch {
        const fallback = projectFiles.find(f => f.id === raw);
        if (fallback) return { id: fallback.id, name: fallback.name };
      }
    }
    const uri = e.dataTransfer.getData('text/uri-list');
    if (uri?.startsWith('file://')) {
      const uriId = uri.replace('file://', '').trim();
      const file = projectFiles.find(f => f.id === uriId);
      if (file) return { id: file.id, name: file.name };
    }
    const text = e.dataTransfer.getData('text/plain');
    const mdMatch = text.match(/\[([^\]]+)\]\(file:\/\/([^)]+)\)/);
    if (mdMatch?.[2]) {
      const mdFile = projectFiles.find(f => f.id === mdMatch[2]);
      if (mdFile) return { id: mdFile.id, name: mdFile.name };
    }
    const file = projectFiles.find(f => f.id === text.trim());
    if (!file) return null;
    return { id: file.id, name: file.name };
  };

  const handleDescriptionDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (!getDraggedProjectFile(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDescriptionDrop = (e: React.DragEvent<HTMLTextAreaElement>, itemId: string) => {
    const file = getDraggedProjectFile(e);
    if (!file) return;
    e.preventDefault();
    const snippet = `[${file.name}](file://${file.id})`;
    setItems(items.map(item => item.id === itemId ? { ...item, description: `${item.description || ''}${item.description ? '\n' : ''}${snippet}` } : item));
  };

  const renderTextWithFileLinks = (text: string) => {
    const nodes: React.ReactNode[] = [];
    const regex = /\[([^\]]+)\]\(file:\/\/([^)]+)\)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        nodes.push(<span key={`txt-${lastIdx}`}>{text.slice(lastIdx, match.index)}</span>);
      }
      const fileId = match[2];
      const exists = fileLookup.has(fileId);
      nodes.push(
        <button
          key={`lnk-${fileId}-${match.index}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenFile?.(fileId);
          }}
          className={`underline underline-offset-2 ${exists ? 'text-cyan-400 hover:text-cyan-300' : 'text-zinc-500 line-through'}`}
          title={exists ? `Open ${fileLookup.get(fileId)}` : 'Linked file not found'}
        >
          {match[1]}
        </button>
      );
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) {
      nodes.push(<span key={`txt-end-${lastIdx}`}>{text.slice(lastIdx)}</span>);
    }
    return nodes.length ? nodes : text;
  };

  // --- Sub Tasks ---
  const addSubTask = (itemId: string) => {
    if (!newSubTaskText.trim()) return;
    const newSub: SubTask = { id: crypto.randomUUID(), text: newSubTaskText.trim(), completed: false };
    setItems(items.map(item => item.id === itemId ? { ...item, subTasks: [...(item.subTasks || []), newSub] } : item));
    setNewSubTaskText('');
  };

  const toggleSubTask = (itemId: string, subTaskId: string) => {
    setItems(items.map(item => {
      if (item.id === itemId && item.subTasks) {
        return {
          ...item,
          subTasks: item.subTasks.map(sub => sub.id === subTaskId ? { ...sub, completed: !sub.completed } : sub)
        };
      }
      return item;
    }));
  };

  const deleteSubTask = (itemId: string, subTaskId: string) => {
    setItems(items.map(item => item.id === itemId && item.subTasks ? { ...item, subTasks: item.subTasks.filter(sub => sub.id !== subTaskId) } : item));
  };

  const clearCompletedTasks = () => {
    setItems(items.filter(item => item.status !== 'Done' && !item.completed));
    if (expandedId && items.some(item => item.id === expandedId && (item.status === 'Done' || item.completed))) {
      setExpandedId(null);
    }
  };

  const resetTaskFilters = () => {
    setSearchQuery('');
    setFilterPriority('All');
    setFilterStatus('All');
    setFilterCategory('All');
    setSortBy('Newest');
  };

  // --- Drag & Drop ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    if (activeDropZone !== status) setActiveDropZone(status);
  };

  const handleDrop = (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    setActiveDropZone(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id && id === draggedItemId) {
      updateItemStatus(id, status);
    }
    setDraggedItemId(null);
  };

  // --- Helpers ---
  const getPriorityColor = (p: Priority) => {
    switch(p) {
      case 'High': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'Medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'Low': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    }
  };

  const getStatusColor = (s: TodoStatus) => {
      switch(s) {
          case 'To Do': return 'border-t-zinc-600';
          case 'In Progress': return 'border-t-blue-500';
          case 'Done': return 'border-t-emerald-500';
      }
  };

  const priorityWeight: Record<Priority, number> = { High: 3, Medium: 2, Low: 1 };
  const itemOrder = new Map(items.map((item, index) => [item.id, index]));

  const filteredItems = [...items]
    .filter(item => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          item.text,
          item.description || '',
          item.category || '',
          ...(item.tags || [])
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (filterPriority !== 'All' && item.priority !== filterPriority) return false;
      if (filterStatus !== 'All' && item.status !== filterStatus) return false;
      if (filterCategory !== 'All' && (item.category || 'General') !== filterCategory) return false;
      return true;
    })
    .sort((a, b) => {
      const aIndex = itemOrder.get(a.id) ?? 0;
      const bIndex = itemOrder.get(b.id) ?? 0;
      switch (sortBy) {
        case 'Oldest':
          return bIndex - aIndex;
        case 'Priority':
          return priorityWeight[b.priority] - priorityWeight[a.priority];
        case 'Due Date': {
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return aDue - bDue;
        }
        case 'Effort': {
          const aEffort = typeof a.estimateHours === 'number' ? a.estimateHours : Number.POSITIVE_INFINITY;
          const bEffort = typeof b.estimateHours === 'number' ? b.estimateHours : Number.POSITIVE_INFINITY;
          return aEffort - bEffort;
        }
        case 'Alphabetical':
          return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
        case 'Newest':
        default:
          return aIndex - bIndex;
      }
    });

  const visibleColumns: TodoStatus[] = filterStatus === 'All' ? COLUMNS : [filterStatus];

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Header */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <h3 className="text-zinc-200 font-medium">{fileName}</h3>
        <div className="flex items-center gap-3">
            <div className="flex items-center mr-2">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /> Saved</span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unsaved</span>}
            </div>
            <button
              onClick={handleTopAddTaskClick}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
            >
              <Plus className="w-4 h-4" /> Add Task
            </button>
            <button onClick={handleManualSave} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}>
              <Save className="w-4 h-4" /> Save
            </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6 bg-zinc-900">
        <div className={`flex gap-6 h-full ${visibleColumns.length === 1 ? 'min-w-[320px]' : 'min-w-[900px]'}`}>
          {visibleColumns.map(column => {
             const colItems = filteredItems.filter(i => i.status === column);
             const isDropActive = activeDropZone === column;

             return (
               <div 
                  key={column} 
                  onDragOver={(e) => handleDragOver(e, column)}
                  onDrop={(e) => handleDrop(e, column)}
                  className={`flex-1 flex flex-col min-w-[280px] bg-zinc-950/50 rounded-xl border transition-colors ${isDropActive ? 'border-blue-500/50 bg-zinc-900' : 'border-zinc-800'}`}
               >
                 {/* Column Header */}
                 <div className={`p-4 border-b border-zinc-800 flex justify-between items-center rounded-t-xl border-t-4 ${getStatusColor(column)} bg-zinc-900`}>
                    <h4 className="font-semibold text-zinc-300 text-sm tracking-wide">{column}</h4>
                    <span className="bg-zinc-800 text-zinc-500 text-xs px-2 py-0.5 rounded-full font-medium">{colItems.length}</span>
                 </div>

                 {/* Drop Area */}
                 <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {colItems.map(item => {
                        const subTasks = item.subTasks || [];
                        const completedSub = subTasks.filter(s => s.completed).length;
                        const progress = subTasks.length > 0 ? (completedSub / subTasks.length) * 100 : 0;
                        const isExpanded = expandedId === item.id;

                        return (
                           <div
                             key={item.id}
                             draggable
                             onDragStart={(e) => handleDragStart(e, item.id)}
                             className={`group bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-sm hover:border-zinc-700 hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${draggedItemId === item.id ? 'opacity-50 grayscale' : 'opacity-100'}`}
                           >
                              {/* Card Header */}
                              <div className="flex items-start gap-3 mb-2">
                                  <button 
                                    onClick={() => updateItemStatus(item.id, item.status === 'Done' ? 'To Do' : 'Done')}
                                    className={`mt-0.5 shrink-0 transition-colors ${item.status === 'Done' ? 'text-emerald-500' : 'text-zinc-600 hover:text-emerald-500'}`}
                                  >
                                     {item.status === 'Done' ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                      {editingTaskId === item.id ? (
                                        <input
                                          autoFocus
                                          value={editingTaskText}
                                          onChange={(e) => setEditingTaskText(e.target.value)}
                                          onBlur={commitTaskTitleEdit}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') commitTaskTitleEdit();
                                            if (e.key === 'Escape') cancelTaskTitleEdit();
                                          }}
                                          className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                                        />
                                      ) : (
                                        <p
                                          onDoubleClick={() => beginTaskTitleEdit(item)}
                                          title="Double-click to rename task"
                                          className={`text-sm font-medium leading-snug break-words cursor-text ${item.status === 'Done' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}
                                        >
                                          {item.text}
                                        </p>
                                      )}
                                  </div>
                                  <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="text-zinc-600 hover:text-white transition-colors">
                                     {isExpanded ? <ChevronUp className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
                                  </button>
                              </div>

                              {/* Card Tags */}
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${getPriorityColor(item.priority)}`}>{item.priority}</span>
                                  <span className="text-[10px] text-zinc-400 bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded">
                                    {item.category || 'General'}
                                  </span>
                                  {item.dueDate && (
                                     <span className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded">
                                        <Calendar className="w-3 h-3" /> {new Date(item.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                     </span>
                                  )}
                                  {typeof item.estimateHours === 'number' && (
                                     <span className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded">
                                        {item.estimateHours}h
                                     </span>
                                  )}
                                  {item.tags && item.tags.length > 0 && (
                                     <div className="flex items-center gap-1">
                                        {item.tags.slice(0, 2).map(tag => (
                                          <span key={`${item.id}-${tag}`} className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                                            #{tag}
                                          </span>
                                        ))}
                                        {item.tags.length > 2 && <span className="text-[10px] text-zinc-500">+{item.tags.length - 2}</span>}
                                     </div>
                                  )}
                                  {subTasks.length > 0 && (
                                     <div className="flex items-center gap-1.5 ml-auto">
                                        <ListChecks className="w-3 h-3 text-zinc-500" />
                                        <span className="text-[10px] text-zinc-500 font-medium">{completedSub}/{subTasks.length}</span>
                                        <div className="w-8 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500/80" style={{ width: `${progress}%` }}></div>
                                        </div>
                                     </div>
                                  )}
                              </div>

                              {/* Expanded Details */}
                              {isExpanded && (
                                  <div className="mt-3 pt-3 border-t border-zinc-800/50 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                          <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                              <label className="text-[10px] uppercase tracking-wide text-zinc-500">Status</label>
                                              <StyledSelect
                                                value={item.status}
                                                onChange={(value) => updateItemStatus(item.id, value as TodoStatus)}
                                                options={[
                                                  { value: 'To Do', label: 'To Do' },
                                                  { value: 'In Progress', label: 'In Progress' },
                                                  { value: 'Done', label: 'Done' }
                                                ]}
                                                className="mt-1"
                                                selectClassName="w-full border-zinc-800 bg-zinc-900"
                                              />
                                          </div>
                                          <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                              <label className="text-[10px] uppercase tracking-wide text-zinc-500">Priority</label>
                                              <StyledSelect
                                                value={item.priority}
                                                onChange={(value) => updateItemField(item.id, { priority: value as Priority })}
                                                options={[
                                                  { value: 'High', label: 'High' },
                                                  { value: 'Medium', label: 'Medium' },
                                                  { value: 'Low', label: 'Low' }
                                                ]}
                                                className="mt-1"
                                                selectClassName="w-full border-zinc-800 bg-zinc-900"
                                              />
                                          </div>
                                          <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                              <label className="text-[10px] uppercase tracking-wide text-zinc-500">Due Date</label>
                                              <input
                                                type="date"
                                                value={item.dueDate || ''}
                                                onChange={(e) => updateItemField(item.id, { dueDate: e.target.value || undefined })}
                                                className="mt-1 w-full bg-transparent text-xs text-zinc-200 focus:outline-none [color-scheme:dark]"
                                              />
                                          </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                              <label className="text-[10px] uppercase tracking-wide text-zinc-500">Category</label>
                                              <StyledSelect
                                                value={item.category || 'General'}
                                                onChange={(value) => updateItemField(item.id, { category: value })}
                                                options={categoryOptions.map(category => ({ value: category, label: category }))}
                                                className="mt-1"
                                                selectClassName="w-full border-zinc-800 bg-zinc-900"
                                              />
                                          </div>
                                          <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                              <label className="text-[10px] uppercase tracking-wide text-zinc-500">Effort (Hours)</label>
                                              <input
                                                type="number"
                                                min="0.5"
                                                step="0.5"
                                                value={item.estimateHours ?? ''}
                                                onChange={(e) => {
                                                  const value = e.target.value.trim();
                                                  updateItemField(item.id, { estimateHours: value ? Number(value) : undefined });
                                                }}
                                                placeholder="e.g. 2"
                                                className="mt-1 w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
                                              />
                                          </div>
                                      </div>
                                      <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                          <label className="text-[10px] uppercase tracking-wide text-zinc-500">Tags</label>
                                          <input
                                            type="text"
                                            value={(item.tags || []).join(', ')}
                                            onChange={(e) => updateItemField(item.id, { tags: parseTagInput(e.target.value) })}
                                            placeholder="bugfix, polish, ui"
                                            className="mt-1 w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
                                          />
                                          <p className="mt-1 text-[10px] text-zinc-500">Comma-separated, up to 8 tags.</p>
                                      </div>
                                      {/* Description */}
                                      <div className="space-y-2">
                                          <div className="relative flex items-center justify-between gap-2">
                                              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Notes</span>
                                              <button
                                                onClick={() => toggleLinkPicker(item.id)}
                                                data-link-picker-toggle="true"
                                                disabled={linkableFiles.length === 0}
                                                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 disabled:text-zinc-600 disabled:cursor-not-allowed"
                                                title={linkableFiles.length === 0 ? 'No files available to link' : 'Insert file link'}
                                              >
                                                <LinkIcon className="w-3 h-3" /> Link File
                                              </button>
                                              {linkPickerTaskId === item.id && (
                                                <div
                                                  ref={linkPickerRef}
                                                  className="absolute right-0 top-5 z-20 w-[280px] rounded-md border border-zinc-700 bg-zinc-900 p-2 shadow-lg"
                                                >
                                                  <input
                                                    type="text"
                                                    value={linkPickerQuery}
                                                    onChange={(e) => setLinkPickerQuery(e.target.value)}
                                                    placeholder="Search files..."
                                                    className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                                                    autoFocus
                                                  />
                                                  <div className="max-h-44 overflow-y-auto space-y-1 custom-scrollbar">
                                                    {filteredLinkableFiles.length === 0 ? (
                                                      <p className="px-2 py-2 text-[11px] text-zinc-500">No matching files.</p>
                                                    ) : (
                                                      filteredLinkableFiles.map(file => (
                                                        <button
                                                          key={file.id}
                                                          onClick={() => appendFileLinkToDescription(item.id, file.id)}
                                                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                                          title={file.id}
                                                        >
                                                          <span className="truncate pr-2">{file.name}</span>
                                                          <span className="text-[10px] text-zinc-500">{file.id.slice(0, 8)}</span>
                                                        </button>
                                                      ))
                                                    )}
                                                  </div>
                                                </div>
                                              )}
                                          </div>
                                          <textarea
                                            value={item.description || ''}
                                            onChange={(e) => updateItemDescription(item.id, e.target.value)}
                                            onDragOver={handleDescriptionDragOver}
                                            onDrop={(e) => handleDescriptionDrop(e, item.id)}
                                            placeholder="Add notes..."
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700 min-h-[60px] resize-y"
                                          />
                                          {item.description && item.description.includes('file://') && (
                                              <div className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded p-2 break-words">
                                                {renderTextWithFileLinks(item.description)}
                                              </div>
                                          )}
                                      </div>
                                      
                                      {/* Subtasks */}
                                      <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                          <div className="flex gap-2 mb-2">
                                              <input
                                                type="text"
                                                value={newSubTaskText}
                                                onChange={(e) => setNewSubTaskText(e.target.value)}
                                                onKeyDown={(e) => { if(e.key==='Enter') addSubTask(item.id); }}
                                                placeholder="Sub-task..."
                                                className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                                              />
                                              <button onClick={() => addSubTask(item.id)} disabled={!newSubTaskText.trim()} className="text-zinc-400 hover:text-white disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                          </div>
                                          <div className="space-y-1">
                                              {subTasks.map(sub => (
                                                  <div key={sub.id} className="flex items-center gap-2 group/sub">
                                                      <button onClick={() => toggleSubTask(item.id, sub.id)} className={`text-zinc-600 hover:text-blue-500 ${sub.completed ? 'text-blue-500' : ''}`}>
                                                          {sub.completed ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                                                      </button>
                                                      <span className={`text-xs flex-1 truncate ${sub.completed ? 'line-through text-zinc-600' : 'text-zinc-400'}`}>{sub.text}</span>
                                                      <button onClick={() => deleteSubTask(item.id, sub.id)} className="text-zinc-700 hover:text-red-400 opacity-0 group-hover/sub:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>

                                      {/* Actions */}
                                      <div className="flex justify-end gap-2 pt-2">
                                          <button onClick={() => duplicateItem(item.id)} className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
                                              <Plus className="w-3 h-3" /> Duplicate
                                          </button>
                                          <button onClick={(e) => deleteItem(e, item.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors">
                                              <Trash2 className="w-3 h-3" /> Delete Task
                                          </button>
                                      </div>
                                  </div>
                              )}
                           </div>
                        );
                    })}
                    {colItems.length === 0 && (
                        <div className="text-center py-10 opacity-30 text-zinc-500 select-none">
                            <p className="text-xs italic">No tasks here</p>
                            <p className="text-[11px] mt-1">Use Add Task or drag one into this column.</p>
                        </div>
                    )}
                 </div>
               </div>
             );
          })}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Create Task</h2>
              <button onClick={handleCloseCreateModal} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Task Title</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                  placeholder="What needs to be done?"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Status</label>
                  <StyledSelect
                    value={newItemStatus}
                    onChange={(value) => setNewItemStatus(value as TodoStatus)}
                    options={[
                      { value: 'To Do', label: 'To Do' },
                      { value: 'In Progress', label: 'In Progress' },
                      { value: 'Done', label: 'Done' }
                    ]}
                    selectClassName="w-full bg-zinc-950 border-zinc-800 p-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Priority</label>
                  <StyledSelect
                    value={newItemPriority}
                    onChange={(value) => setNewItemPriority(value as Priority)}
                    options={[
                      { value: 'Low', label: 'Low' },
                      { value: 'Medium', label: 'Medium' },
                      { value: 'High', label: 'High' }
                    ]}
                    selectClassName="w-full bg-zinc-950 border-zinc-800 p-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Category</label>
                  <StyledSelect
                    value={newItemCategory}
                    onChange={setNewItemCategory}
                    options={categoryOptions.map(category => ({ value: category, label: category }))}
                    selectClassName="w-full bg-zinc-950 border-zinc-800 p-2.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newItemDate}
                    onChange={(e) => setNewItemDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Effort (Hours)</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={newItemEstimate}
                    onChange={(e) => setNewItemEstimate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                    placeholder="e.g. 2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Tags</label>
                <input
                  type="text"
                  value={newItemTags}
                  onChange={(e) => setNewItemTags(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                  placeholder="ui, polish, animation"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                <textarea
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all min-h-[100px]"
                  placeholder="Add notes or implementation details..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Subtasks</label>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newItemSubTaskText}
                      onChange={(e) => setNewItemSubTaskText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCreateSubTask(); } }}
                      placeholder="Add subtask..."
                      className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addCreateSubTask}
                      disabled={!newItemSubTaskText.trim()}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar">
                    {newItemSubTasks.length === 0 ? (
                      <p className="text-xs text-zinc-500">No subtasks yet.</p>
                    ) : (
                      newItemSubTasks.map(sub => (
                        <div key={sub.id} className="flex items-center gap-2 text-xs text-zinc-300">
                          <button type="button" onClick={() => toggleCreateSubTask(sub.id)} className={`text-zinc-500 hover:text-blue-400 ${sub.completed ? 'text-blue-400' : ''}`}>
                            {sub.completed ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                          </button>
                          <span className={`flex-1 ${sub.completed ? 'line-through text-zinc-500' : 'text-zinc-300'}`}>{sub.text}</span>
                          <button type="button" onClick={() => deleteCreateSubTask(sub.id)} className="text-zinc-600 hover:text-red-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoEditor;
