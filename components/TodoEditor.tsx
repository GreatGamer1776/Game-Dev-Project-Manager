import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, CheckSquare, Square, Calendar, Flag, ChevronDown, ChevronUp, Search, Filter, ListChecks, Loader2, Check, AlertCircle, MoreHorizontal, Link as LinkIcon } from 'lucide-react';
import { TodoItem, Priority, SubTask, EditorProps, TodoStatus } from '../types';

const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';

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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<'All' | Priority>('All');
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubTaskText, setNewSubTaskText] = useState('');
  const [selectedLinkFileId, setSelectedLinkFileId] = useState<string>('');
  const fileLookup = React.useMemo(() => new Map(projectFiles.map(f => [f.id, f.name])), [projectFiles]);
  const linkableFiles = React.useMemo(
    () => projectFiles.filter(f => f.id !== activeFileId).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [projectFiles, activeFileId]
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
    if (linkableFiles.length === 0) {
      setSelectedLinkFileId('');
      return;
    }
    if (!linkableFiles.some(f => f.id === selectedLinkFileId)) {
      setSelectedLinkFileId(linkableFiles[0].id);
    }
  }, [linkableFiles, selectedLinkFileId]);

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

    const newItem: TodoItem = {
      id: crypto.randomUUID(),
      text: newItemText.trim(),
      completed: false,
      status: 'To Do',
      priority: newItemPriority,
      dueDate: newItemDate || undefined,
      description: '',
      subTasks: []
    };

    setItems([newItem, ...items]); 
    setNewItemText('');
    setNewItemPriority('Medium');
    setNewItemDate('');
  };

  const deleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this task?")) {
      setItems(items.filter(item => item.id !== id));
    }
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

  const appendFileLinkToDescription = (itemId: string) => {
    if (linkableFiles.length === 0) {
      alert("No other files available to link.");
      return;
    }
    const selected = linkableFiles.find(f => f.id === selectedLinkFileId) || linkableFiles[0];
    const snippet = `[${selected.name}](file://${selected.id})`;
    setItems(items.map(item => item.id === itemId ? { ...item, description: `${item.description || ''}${item.description ? '\n' : ''}${snippet}` } : item));
  };

  const getDraggedProjectFile = (e: React.DragEvent): { id: string; name: string } | null => {
    const fileId = e.dataTransfer.getData(FILE_LINK_DRAG_MIME) || e.dataTransfer.getData('text/plain');
    if (!fileId) return null;
    const file = projectFiles.find(f => f.id === fileId);
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

  const filteredItems = items.filter(item => {
    if (searchQuery && !item.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterPriority !== 'All' && item.priority !== filterPriority) return false;
    return true;
  });

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
            <button onClick={handleManualSave} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}>
              <Save className="w-4 h-4" /> Save
            </button>
        </div>
      </div>

      {/* Quick Add & Filters */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900 shrink-0 flex flex-col xl:flex-row gap-4">
          {/* Add Bar */}
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 flex gap-2 items-center shadow-sm">
             <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
                placeholder="Add a new task..."
                className="flex-1 bg-transparent px-3 text-sm text-white focus:outline-none placeholder:text-zinc-600"
             />
             <div className="h-4 w-px bg-zinc-800"></div>
             <div className="flex items-center gap-2">
                 <select value={newItemPriority} onChange={(e) => setNewItemPriority(e.target.value as Priority)} className="bg-transparent text-xs text-zinc-400 focus:outline-none cursor-pointer hover:text-white">
                    <option value="Low" className="bg-zinc-900">Low</option>
                    <option value="Medium" className="bg-zinc-900">Medium</option>
                    <option value="High" className="bg-zinc-900">High</option>
                 </select>
                 <input type="date" value={newItemDate} onChange={(e) => setNewItemDate(e.target.value)} className="bg-transparent text-xs text-zinc-400 focus:outline-none [color-scheme:dark] cursor-pointer" />
             </div>
             <button onClick={handleAddItem} disabled={!newItemText.trim()} className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-md disabled:opacity-50 transition-colors">
                <Plus className="w-4 h-4" />
             </button>
          </div>

          {/* Filters */}
          <div className="flex gap-3 items-center">
             <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="bg-zinc-950 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 w-48"
                />
             </div>
             <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2">
                <Filter className="w-3.5 h-3.5 text-zinc-500" />
                <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as any)} className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer">
                    <option value="All">All Priorities</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                </select>
             </div>
          </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6 bg-zinc-900">
        <div className="flex gap-6 h-full min-w-[900px]">
          {COLUMNS.map(column => {
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
                                      <p className={`text-sm font-medium leading-snug break-words ${item.status === 'Done' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{item.text}</p>
                                  </div>
                                  <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="text-zinc-600 hover:text-white transition-colors">
                                     {isExpanded ? <ChevronUp className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
                                  </button>
                              </div>

                              {/* Card Tags */}
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${getPriorityColor(item.priority)}`}>{item.priority}</span>
                                  {item.dueDate && (
                                     <span className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded">
                                        <Calendar className="w-3 h-3" /> {new Date(item.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                     </span>
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
                                      {/* Description */}
                                      <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Notes</span>
                                              <button
                                                onClick={() => appendFileLinkToDescription(item.id)}
                                                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                                                title="Insert File Link"
                                              >
                                                <LinkIcon className="w-3 h-3" /> Link File
                                              </button>
                                              <select
                                                value={selectedLinkFileId}
                                                onChange={(e) => setSelectedLinkFileId(e.target.value)}
                                                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 max-w-[150px]"
                                                disabled={linkableFiles.length === 0}
                                              >
                                                {linkableFiles.length === 0 ? (
                                                  <option value="">No link targets</option>
                                                ) : (
                                                  linkableFiles.map(f => (
                                                    <option key={f.id} value={f.id}>{f.name}</option>
                                                  ))
                                                )}
                                              </select>
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
                                      <div className="flex justify-end pt-2">
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
                        </div>
                    )}
                 </div>
               </div>
             );
          })}
        </div>
      </div>
    </div>
  );
};

export default TodoEditor;
