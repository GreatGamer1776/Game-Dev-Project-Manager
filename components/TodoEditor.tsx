import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, CheckSquare, Square, Calendar, ChevronDown, ChevronUp, ListChecks, Loader2, Check, AlertCircle, MoreHorizontal, Link as LinkIcon, Tags, X, Search, Filter, ArrowUpDown, Undo2, Redo2 } from 'lucide-react';
import { TodoItem, Priority, SubTask, EditorProps, TodoStatus } from '../types';
import { useUndoRedo } from '../hooks/useUndoRedo';

const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const TASK_LINK_DRAG_MIME = 'application/x-gdpm-task-link';
const TASK_MOVE_DRAG_MIME = 'application/x-gdpm-task-id';
const TODO_COLUMNS: TodoStatus[] = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
const TODO_STATUS_OPTIONS = TODO_COLUMNS.map(status => ({ value: status, label: status }));
const MAX_TAGS = 8;

const normalizeTodoStatus = (status?: string, completed?: boolean): TodoStatus => {
  if (status && TODO_COLUMNS.includes(status as TodoStatus)) {
    return status as TodoStatus;
  }
  return completed ? 'Done' : 'To Do';
};

const migrateTodoItem = (item: any): TodoItem => {
  const { category: _legacyCategory, ...rest } = item || {};
  const status = normalizeTodoStatus(rest.status, rest.completed);
  return {
    ...rest,
    status,
    completed: status === 'Done'
  };
};

type SelectOption = {
  value: string;
  label: string;
};

const normalizeTagKey = (tag: string) => tag.trim().toLowerCase();

const dedupeTags = (tags: string[]) => {
  const seen = new Set<string>();
  const uniqueTags: string[] = [];

  for (const tag of tags) {
    const trimmedTag = tag.trim();
    if (!trimmedTag) continue;

    const normalizedTag = normalizeTagKey(trimmedTag);
    if (seen.has(normalizedTag)) continue;

    seen.add(normalizedTag);
    uniqueTags.push(trimmedTag);

    if (uniqueTags.length >= MAX_TAGS) break;
  }

  return uniqueTags;
};

const parseTagInput = (value: string) => dedupeTags(value.split(','));

const formatTagInput = (tags: string[]) => dedupeTags(tags).join(', ');

const getDescriptionPreviewText = (description?: string) => {
  if (!description?.trim()) return 'No description provided.';
  return description
    .replace(/\[([^\]]+)\]\(file:\/\/([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

const TagInputSection: React.FC<{
  value: string;
  onChange: (value: string) => void;
  allTags: string[];
  placeholder: string;
  inputClassName: string;
  helperTextClassName: string;
  helperText: string;
}> = ({ value, onChange, allTags, placeholder, inputClassName, helperTextClassName, helperText }) => {
  const suggestionsId = React.useId();
  const selectedTags = React.useMemo(() => parseTagInput(value), [value]);
  const availableTags = React.useMemo(() => {
    const selectedTagKeys = new Set(selectedTags.map(normalizeTagKey));
    return allTags.filter(tag => !selectedTagKeys.has(normalizeTagKey(tag))).slice(0, 12);
  }, [allTags, selectedTags]);

  const addTag = (tag: string) => onChange(formatTagInput([...selectedTags, tag]));
  const removeTag = (tag: string) =>
    onChange(formatTagInput(selectedTags.filter(selectedTag => normalizeTagKey(selectedTag) !== normalizeTagKey(tag))));

  return (
    <div>
      <input
        type="text"
        list={allTags.length > 0 ? suggestionsId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
        placeholder={placeholder}
      />
      {allTags.length > 0 && (
        <datalist id={suggestionsId}>
          {allTags.map(tag => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      )}
      {selectedTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedTags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300">
              #{tag}
              <button type="button" onClick={() => removeTag(tag)} className="text-zinc-500 transition-colors hover:text-white" title={`Remove ${tag}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {availableTags.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Existing Tags</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {availableTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className={helperTextClassName}>{helperText}</p>
    </div>
  );
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

const TodoEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, projectFiles = [], onOpenFile, activeFileId, taskNavigationTarget, onTaskNavigationHandled }) => {
  // Initialize items with migration logic for existing data (missing status)
  const [items, setItems] = useState<TodoItem[]>(() => {
    const rawItems = initialContent?.items || [];
    return rawItems.map(migrateTodoItem);
  });
  const undoRedo = useUndoRedo<TodoItem[]>(initialContent?.items?.map(migrateTodoItem) || []);
  
  // Save Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(JSON.stringify(items));
  const latestItemsRef = useRef<TodoItem[]>(items);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag & Drop State
  const [draggedItemIds, setDraggedItemIds] = useState<string[]>([]);
  const [activeDropZone, setActiveDropZone] = useState<TodoStatus | null>(null);

  // Form & UI State
  const [newItemText, setNewItemText] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<Priority>('Medium');
  const [newItemDate, setNewItemDate] = useState('');
  const [newItemStatus, setNewItemStatus] = useState<TodoStatus>('Backlog');
  const [newItemEstimate, setNewItemEstimate] = useState('');
  const [newItemTags, setNewItemTags] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemSubTasks, setNewItemSubTasks] = useState<SubTask[]>([]);
  const [newItemSubTaskText, setNewItemSubTaskText] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<'All' | Priority>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | TodoStatus>('All');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'Newest' | 'Oldest' | 'Priority' | 'Due Date' | 'Alphabetical' | 'Effort'>('Newest');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [newSubTaskText, setNewSubTaskText] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [linkPickerTaskId, setLinkPickerTaskId] = useState<string | null>(null);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const linkPickerRef = useRef<HTMLDivElement | null>(null);
  const taskCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
  const allTags = React.useMemo(
    () => Array.from(new Set(items.flatMap(item => item.tags || []))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [items]
  );

  const clearAutosaveTimer = React.useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const clearSaveStatusTimer = React.useCallback(() => {
    if (saveStatusTimerRef.current) {
      clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = null;
    }
  }, []);

  const persistItems = React.useCallback((nextItems: TodoItem[]) => {
    onSave({ items: nextItems });
    lastSavedData.current = JSON.stringify(nextItems);
    latestItemsRef.current = nextItems;
  }, [onSave]);

  const scheduleSavedStatus = React.useCallback(() => {
    clearSaveStatusTimer();
    saveStatusTimerRef.current = setTimeout(() => {
      setSaveStatus('saved');
      saveStatusTimerRef.current = null;
    }, 500);
  }, [clearSaveStatusTimer]);

  const flushPendingSave = React.useCallback(() => {
    const nextItems = latestItemsRef.current;
    if (JSON.stringify(nextItems) === lastSavedData.current) return;
    persistItems(nextItems);
  }, [persistItems]);

  const saveItems = React.useCallback((nextItems: TodoItem[]) => {
    clearAutosaveTimer();
    setSaveStatus('saving');
    persistItems(nextItems);
    scheduleSavedStatus();
  }, [clearAutosaveTimer, persistItems, scheduleSavedStatus]);

  // Sync with prop changes
  useEffect(() => {
    const rawItems = initialContent?.items || [];
    const migratedItems = rawItems.map(migrateTodoItem);
    setItems(migratedItems);
    undoRedo.reset(migratedItems);
    lastSavedData.current = JSON.stringify(migratedItems);
    latestItemsRef.current = migratedItems;
    clearAutosaveTimer();
    clearSaveStatusTimer();
    setSaveStatus('saved');
  }, [clearAutosaveTimer, clearSaveStatusTimer, initialContent, undoRedo.reset]);

  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

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

  useEffect(() => {
    if (!taskNavigationTarget || taskNavigationTarget.fileId !== activeFileId) return;

    const targetItem = items.find(item => item.id === taskNavigationTarget.taskId);
    onTaskNavigationHandled?.();
    if (!targetItem) return;

    setExpandedId(targetItem.id);
    setHighlightedTaskId(targetItem.id);

    const frameId = window.requestAnimationFrame(() => {
      taskCardRefs.current[targetItem.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timeoutId = window.setTimeout(() => {
      setHighlightedTaskId(current => current === targetItem.id ? null : current);
    }, 2500);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [activeFileId, items, onTaskNavigationHandled, taskNavigationTarget]);

  useEffect(() => {
    setSelectedItemIds(current => current.filter(id => items.some(item => item.id === id)));
  }, [items]);

  // Autosave
  useEffect(() => {
    const currentData = JSON.stringify(items);
    if (currentData === lastSavedData.current) return;

    setSaveStatus('unsaved');
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      saveItems(latestItemsRef.current);
    }, 2000);
    return clearAutosaveTimer;
  }, [clearAutosaveTimer, items, saveItems]);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      clearSaveStatusTimer();
      flushPendingSave();
    };
  }, [clearAutosaveTimer, clearSaveStatusTimer, flushPendingSave]);

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = undoRedo.undo();
        if (prev !== undefined) setItems(prev);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const next = undoRedo.redo();
        if (next !== undefined) setItems(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoRedo.redo, undoRedo.undo]);

  // Push to undo stack when items change
  const lastUndoPushRef = useRef(JSON.stringify(items));
  useEffect(() => {
    const serialized = JSON.stringify(items);
    if (serialized === lastUndoPushRef.current) return;
    lastUndoPushRef.current = serialized;
    undoRedo.pushState(items);
  }, [items, undoRedo.pushState]);

  const handleManualSave = React.useCallback(() => {
    const nextItems = latestItemsRef.current;
    if (JSON.stringify(nextItems) === lastSavedData.current) {
      clearAutosaveTimer();
      clearSaveStatusTimer();
      setSaveStatus('saved');
      return;
    }

    saveItems(nextItems);
  }, [clearAutosaveTimer, clearSaveStatusTimer, saveItems]);

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
      estimateHours: typeof parsedEstimate === 'number' && !Number.isNaN(parsedEstimate) ? parsedEstimate : undefined,
      tags: parsedTags.length ? parsedTags : undefined,
      description: newItemDescription,
      subTasks: newItemSubTasks
    };

    setItems([newItem, ...items]); 
    setNewItemText('');
    setNewItemStatus('Backlog');
    setNewItemPriority('Medium');
    setNewItemDate('');
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
    setNewItemStatus('Backlog');
    setNewItemPriority('Medium');
    setNewItemDate('');
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
    setFilterTags([]);
    setSortBy('Newest');
  };

  const toggleFilterTag = (tag: string) => {
    setFilterTags(current =>
      current.includes(tag) ? current.filter(selectedTag => selectedTag !== tag) : [...current, tag]
    );
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(current =>
      current.includes(id) ? current.filter(selectedId => selectedId !== id) : [...current, id]
    );
  };

  const clearItemSelection = () => {
    setSelectedItemIds([]);
  };

  const deleteSelectedItems = () => {
    if (selectedItemIds.length === 0) return;
    if (!confirm(`Delete ${selectedItemIds.length} selected task${selectedItemIds.length === 1 ? '' : 's'}?`)) return;

    const selectedSet = new Set(selectedItemIds);
    setItems(currentItems => currentItems.filter(item => !selectedSet.has(item.id)));
    if (expandedId && selectedSet.has(expandedId)) {
      setExpandedId(null);
    }
    clearItemSelection();
  };

  const moveItemsToStatus = (ids: string[], status: TodoStatus) => {
    if (ids.length === 0) return;
    const draggedSet = new Set(ids);
    setItems(currentItems =>
      currentItems.map(item =>
        draggedSet.has(item.id)
          ? { ...item, status, completed: status === 'Done' }
          : item
      )
    );
  };

  const getDraggedItemIds = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(TASK_MOVE_DRAG_MIME);
    if (!raw) return draggedItemIds;
    try {
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed : draggedItemIds;
    } catch {
      return [raw];
    }
  };

  // --- Drag & Drop ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    const nextDraggedIds = selectedItemIds.includes(id) ? selectedItemIds : [id];
    setDraggedItemIds(nextDraggedIds);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TASK_MOVE_DRAG_MIME, JSON.stringify(nextDraggedIds));

    const task = items.find(item => item.id === id);
    if (task && activeFileId) {
      const taskLink = `[${task.text}](task://${activeFileId}/${task.id})`;
      e.dataTransfer.setData(TASK_LINK_DRAG_MIME, JSON.stringify({ fileId: activeFileId, taskId: task.id, label: task.text }));
      e.dataTransfer.setData('text/uri-list', `task://${activeFileId}/${task.id}`);
      e.dataTransfer.setData('text/plain', taskLink);
      return;
    }

    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    if (activeDropZone !== status) setActiveDropZone(status);
  };

  const handleDrop = (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    setActiveDropZone(null);
    const ids = getDraggedItemIds(e);
    moveItemsToStatus(ids, status);
    setDraggedItemIds([]);
  };

  const handleDragEnd = () => {
    setDraggedItemIds([]);
    setActiveDropZone(null);
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
          case 'Backlog': return 'border-t-violet-500';
          case 'To Do': return 'border-t-zinc-600';
          case 'In Progress': return 'border-t-blue-500';
          case 'Review': return 'border-t-amber-500';
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
          ...(item.tags || [])
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (filterPriority !== 'All' && item.priority !== filterPriority) return false;
      if (filterStatus !== 'All' && item.status !== filterStatus) return false;
      if (filterTags.length > 0) {
        const itemTags = (item.tags || []).map(tag => tag.toLowerCase());
        const matchesTag = filterTags.some(tag => itemTags.includes(tag.toLowerCase()));
        if (!matchesTag) return false;
      }
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

  const selectedItemSet = new Set(selectedItemIds);
  const visibleColumns: TodoStatus[] = filterStatus === 'All' ? TODO_COLUMNS : [filterStatus];
  const boardMinWidth = visibleColumns.length === 1 ? 320 : visibleColumns.length * 300 + (visibleColumns.length - 1) * 24;

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Header */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <h3 className="text-zinc-200 font-medium">{fileName}</h3>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 mr-1">
              <button onClick={() => { const prev = undoRedo.undo(); if (prev !== undefined) setItems(prev); }} disabled={!undoRedo.canUndo} className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
              <button onClick={() => { const next = undoRedo.redo(); if (next !== undefined) setItems(next); }} disabled={!undoRedo.canRedo} className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
            </div>
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

      <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, notes, or tags..."
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-1.5 pl-9 pr-3 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div className="hidden h-6 w-px bg-zinc-800 lg:block"></div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <Filter className="h-3.5 w-3.5 text-zinc-500" />
            <span>Priority</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as 'All' | Priority)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
            >
              <option value="All">All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <span>Bucket</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'All' | TodoStatus)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
            >
              <option value="All">All</option>
              {TODO_COLUMNS.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'Newest' | 'Oldest' | 'Priority' | 'Due Date' | 'Alphabetical' | 'Effort')}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
            >
              <option value="Newest">Newest</option>
              <option value="Oldest">Oldest</option>
              <option value="Priority">Priority</option>
              <option value="Due Date">Due Date</option>
              <option value="Alphabetical">Alphabetical</option>
              <option value="Effort">Effort</option>
            </select>
          </div>

          <button
            onClick={resetTaskFilters}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white"
          >
            Reset Filters
          </button>

          <div className="ml-auto text-xs text-zinc-500">
            Showing {filteredItems.length} of {items.length} tasks
          </div>
        </div>

        {selectedItemIds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
            <span className="text-xs font-medium text-blue-200">
              {selectedItemIds.length} selected
            </span>
            <button
              onClick={clearItemSelection}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white"
            >
              Clear Selection
            </button>
            <button
              onClick={deleteSelectedItems}
              className="ml-auto rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/20"
            >
              Delete Selected
            </button>
          </div>
        )}

        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="mr-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <Tags className="h-3.5 w-3.5" />
              <span>Tags</span>
            </div>
            {allTags.map(tag => {
              const isSelected = filterTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleFilterTag(tag)}
                  className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                    isSelected
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6 bg-zinc-900">
        <div className="flex h-full gap-6" style={{ minWidth: `${boardMinWidth}px` }}>
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
                         const isHighlighted = highlightedTaskId === item.id;
                         const isSelected = selectedItemSet.has(item.id);

                         return (
                            <div
                              key={item.id}
                              draggable
                              ref={(node) => {
                                taskCardRefs.current[item.id] = node;
                              }}
                              onDragStart={(e) => handleDragStart(e, item.id)}
                              onDragEnd={handleDragEnd}
                              data-task-id={item.id}
                              className={`group rounded-lg border bg-zinc-900 p-3 shadow-sm transition-all cursor-grab active:cursor-grabbing ${draggedItemIds.includes(item.id) ? 'opacity-50 grayscale' : 'opacity-100'} ${isHighlighted ? 'border-cyan-400/60 ring-2 ring-cyan-400/30 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]' : isSelected ? 'border-blue-500/60 ring-2 ring-blue-500/20 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]' : 'border-zinc-800 hover:border-zinc-700 hover:shadow-md'}`}
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
                                   <div className="flex items-center gap-1">
                                     <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         toggleItemSelection(item.id);
                                       }}
                                       className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                                       title={isSelected ? 'Deselect task' : 'Select task'}
                                     >
                                       <span className={`flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-blue-400 bg-blue-500 text-white' : 'border-zinc-700 bg-zinc-950 text-transparent group-hover:text-zinc-400'}`}>
                                         <Check className="h-3 w-3" />
                                       </span>
                                     </button>
                                     <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="text-zinc-600 hover:text-white transition-colors">
                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
                                     </button>
                                   </div>
                               </div>

                               {/* Card Tags */}
                               <div className="flex flex-wrap items-center gap-2 mt-2">
                                   <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${getPriorityColor(item.priority)}`}>{item.priority}</span>
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
                               <p className="mt-2 text-xs text-zinc-500 line-clamp-2 break-words">
                                 {getDescriptionPreviewText(item.description)}
                               </p>

                               {/* Expanded Details */}
                               {isExpanded && (
                                  <div className="mt-3 pt-3 border-t border-zinc-800/50 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                          <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                              <label className="text-[10px] uppercase tracking-wide text-zinc-500">Status</label>
                                               <StyledSelect
                                                 value={item.status}
                                                 onChange={(value) => updateItemStatus(item.id, value as TodoStatus)}
                                                 options={TODO_STATUS_OPTIONS}
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
                                       <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                                           <label className="text-[10px] uppercase tracking-wide text-zinc-500">Tags</label>
                                           <TagInputSection
                                             value={(item.tags || []).join(', ')}
                                             onChange={(value) => {
                                               const parsedTags = parseTagInput(value);
                                               updateItemField(item.id, { tags: parsedTags.length ? parsedTags : undefined });
                                             }}
                                             allTags={allTags}
                                             placeholder="bugfix, polish, ui"
                                             inputClassName="mt-1 w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
                                             helperTextClassName="mt-1 text-[10px] text-zinc-500"
                                             helperText="Type comma-separated tags, pick an existing tag, or create a new one."
                                           />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Status</label>
                  <StyledSelect
                    value={newItemStatus}
                    onChange={(value) => setNewItemStatus(value as TodoStatus)}
                    options={TODO_STATUS_OPTIONS}
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
                <TagInputSection
                  value={newItemTags}
                  onChange={setNewItemTags}
                  allTags={allTags}
                  placeholder="ui, polish, animation"
                  inputClassName="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                  helperTextClassName="mt-2 text-xs text-zinc-500"
                  helperText="Select existing tags below or type comma-separated tags, up to 8 total."
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
