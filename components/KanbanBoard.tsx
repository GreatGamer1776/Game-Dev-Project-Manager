import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, AlertCircle, ChevronLeft, ChevronRight, X, Trash2, Bug as BugIcon, Search, Filter, Pencil, Loader2, Check, Link as LinkIcon, ArrowUpDown, Calendar, Tags } from 'lucide-react';
import { Bug, BugSeverity, BugStatus, EditorProps } from '../types';

const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const BUG_CATEGORIES = ['General', 'Gameplay', 'UI/UX', 'Audio', 'Performance', 'Networking', 'Build/CI'] as const;
type BugSort = 'Newest' | 'Oldest' | 'Severity' | 'Due Date';
const BUG_COLUMNS: BugStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed'];
const COLUMN_CARD_ESTIMATE = 250;
const COLUMN_OVERSCAN = 3;

const KanbanBoard: React.FC<EditorProps> = ({ initialContent, onSave, fileName, projectFiles = [], onOpenFile, activeFileId }) => {
  const [bugs, setBugs] = useState<Bug[]>(initialContent?.tasks || []);
  
  // Save Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(JSON.stringify(initialContent?.tasks || []));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBug, setEditingBug] = useState<Bug | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<'All' | BugSeverity>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | BugStatus>('All');
  const [filterCategory, setFilterCategory] = useState<'All' | string>('All');
  const [sortBy, setSortBy] = useState<BugSort>('Newest');
  
  const [newTitle, setNewTitle] = useState('');
  const [newSeverity, setNewSeverity] = useState<BugSeverity>('Medium');
  const [newStatus, setNewStatus] = useState<BugStatus>('Open');
  const [newDueDate, setNewDueDate] = useState('');
  const [newCategory, setNewCategory] = useState<string>('General');
  const [newTags, setNewTags] = useState('');
  const [newReproducible, setNewReproducible] = useState(true);
  const [newDesc, setNewDesc] = useState('');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const linkPickerRef = useRef<HTMLDivElement | null>(null);

  const [draggedBugId, setDraggedBugId] = useState<string | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<BugStatus | null>(null);
  const columnBodyRefs = useRef<Record<BugStatus, HTMLDivElement | null>>({
    Open: null,
    'In Progress': null,
    Resolved: null,
    Closed: null
  });
  const [columnScrollTop, setColumnScrollTop] = useState<Record<BugStatus, number>>({
    Open: 0,
    'In Progress': 0,
    Resolved: 0,
    Closed: 0
  });
  const [columnViewportHeights, setColumnViewportHeights] = useState<Record<BugStatus, number>>({
    Open: 600,
    'In Progress': 600,
    Resolved: 600,
    Closed: 600
  });
  const fileLookup = React.useMemo(() => new Map(projectFiles.map(f => [f.id, f.name])), [projectFiles]);
  const linkableFiles = React.useMemo(
    () => projectFiles.filter(f => f.id !== activeFileId).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [projectFiles, activeFileId]
  );
  const filteredLinkableFiles = React.useMemo(() => {
    const query = linkPickerQuery.trim().toLowerCase();
    if (!query) return linkableFiles;
    return linkableFiles.filter(file =>
      file.name.toLowerCase().includes(query) || file.id.toLowerCase().includes(query)
    );
  }, [linkableFiles, linkPickerQuery]);

  useEffect(() => {
    setBugs(initialContent?.tasks || []);
    lastSavedData.current = JSON.stringify(initialContent?.tasks || []);
  }, [initialContent]);

  useEffect(() => {
    if (linkableFiles.length > 0) return;
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
  }, [linkableFiles]);

  useEffect(() => {
    if (!isModalOpen || !linkPickerOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!linkPickerRef.current) return;
      if (linkPickerRef.current.contains(event.target as Node)) return;
      setLinkPickerOpen(false);
      setLinkPickerQuery('');
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isModalOpen, linkPickerOpen]);

  // Autosave Logic
  useEffect(() => {
    const currentData = JSON.stringify(bugs);
    if (currentData === lastSavedData.current) return;

    setSaveStatus('unsaved');
    const timer = setTimeout(() => {
      handleManualSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [bugs]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bugs]);

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave({ tasks: bugs });
    lastSavedData.current = JSON.stringify(bugs);
    setTimeout(() => setSaveStatus('saved'), 500);
  };

  const resetForm = () => {
    setNewTitle('');
    setNewDesc('');
    setNewSeverity('Medium');
    setNewStatus('Open');
    setNewDueDate('');
    setNewCategory('General');
    setNewTags('');
    setNewReproducible(true);
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
    setEditingBug(null);
    setIsModalOpen(false);
  };

  const handleOpenCreate = () => {
    setEditingBug(null);
    setNewTitle('');
    setNewDesc('');
    setNewSeverity('Medium');
    setNewStatus('Open');
    setNewDueDate('');
    setNewCategory('General');
    setNewTags('');
    setNewReproducible(true);
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, bug: Bug) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingBug(bug);
    setNewTitle(bug.title);
    setNewDesc(bug.description);
    setNewSeverity(bug.severity);
    setNewStatus(bug.status);
    setNewDueDate(bug.dueDate || '');
    setNewCategory(bug.category || 'General');
    setNewTags((bug.tags || []).join(', '));
    setNewReproducible(bug.reproducible ?? true);
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
    setIsModalOpen(true);
  };

  const parseTagInput = (value: string) =>
    Array.from(new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))).slice(0, 8);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const parsedTags = parseTagInput(newTags);

    if (editingBug) {
      setBugs(prev => prev.map(b => b.id === editingBug.id ? {
        ...b,
        title: newTitle,
        description: newDesc,
        severity: newSeverity,
        status: newStatus,
        dueDate: newDueDate || undefined,
        category: newCategory,
        tags: parsedTags.length ? parsedTags : undefined,
        reproducible: newReproducible
      } : b));
    } else {
      const newBug: Bug = {
        id: crypto.randomUUID(),
        title: newTitle,
        description: newDesc,
        severity: newSeverity,
        status: newStatus,
        createdAt: Date.now(),
        dueDate: newDueDate || undefined,
        category: newCategory,
        tags: parsedTags.length ? parsedTags : undefined,
        reproducible: newReproducible
      };
      setBugs([...bugs, newBug]);
    }
    
    resetForm();
  };

  const updateStatus = (id: string, newStatus: BugStatus) => {
    setBugs(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
  };

  const deleteBug = (id: string) => {
    if (confirm("Delete this bug ticket?")) {
      setBugs(prev => prev.filter(b => b.id !== id));
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedBugId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, status: BugStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDropZone !== status) {
        setActiveDropZone(status);
    }
  };

  const handleDrop = (e: React.DragEvent, status: BugStatus) => {
    e.preventDefault();
    setActiveDropZone(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id && id === draggedBugId) {
      updateStatus(id, status);
    }
    setDraggedBugId(null);
  };

  const handleDragEnd = () => {
    setDraggedBugId(null);
    setActiveDropZone(null);
  };

  const getSeverityColor = (s: BugSeverity) => {
    switch (s) {
      case 'Critical': return 'bg-red-500 text-white border-red-600';
      case 'High': return 'bg-orange-500 text-white border-orange-600';
      case 'Medium': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/40';
      case 'Low': return 'bg-blue-500/20 text-blue-500 border-blue-500/40';
    }
  };

  const getSeverityIcon = (s: BugSeverity) => {
    if (s === 'Critical') return <AlertCircle className="w-3 h-3 fill-white text-red-600" />;
    return <AlertCircle className="w-3 h-3" />;
  };

  const appendFileLinkToDescription = (fileId: string) => {
    const file = projectFiles.find(f => f.id === fileId);
    if (!file) return;
    setNewDesc(prev => `${prev}${prev ? '\n' : ''}[${file.name}](file://${file.id})`);
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
  };

  const toggleLinkPicker = () => {
    if (linkableFiles.length === 0) return;
    setLinkPickerOpen(prev => !prev);
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

  const handleDescriptionDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const file = getDraggedProjectFile(e);
    if (!file) return;
    e.preventDefault();
    setNewDesc(prev => `${prev}${prev ? '\n' : ''}[${file.name}](file://${file.id})`);
  };

  const renderDescriptionWithLinks = (text: string) => {
    const nodes: React.ReactNode[] = [];
    const regex = /\[([^\]]+)\]\(file:\/\/([^)]+)\)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        nodes.push(<span key={`txt-${lastIdx}`}>{text.slice(lastIdx, match.index)}</span>);
      }
      const label = match[1];
      const fileId = match[2];
      const linkedName = fileLookup.get(fileId);
      nodes.push(
        <button
          key={`lnk-${fileId}-${match.index}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenFile?.(fileId);
          }}
          className={`underline underline-offset-2 ${linkedName ? 'text-cyan-400 hover:text-cyan-300' : 'text-zinc-500 line-through'}`}
          title={linkedName ? `Open ${linkedName}` : 'Linked file not found'}
        >
          {label}
        </button>
      );
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) {
      nodes.push(<span key={`txt-end-${lastIdx}`}>{text.slice(lastIdx)}</span>);
    }
    return nodes.length > 0 ? nodes : text;
  };

  const resetBoardFilters = () => {
    setSearchQuery('');
    setFilterSeverity('All');
    setFilterStatus('All');
    setFilterCategory('All');
    setSortBy('Newest');
  };

  const severityRank: Record<BugSeverity, number> = {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1
  };

  const filteredBugs = [...bugs]
    .filter(bug => {
      if (filterSeverity !== 'All' && bug.severity !== filterSeverity) return false;
      if (filterStatus !== 'All' && bug.status !== filterStatus) return false;
      if (filterCategory !== 'All' && (bug.category || 'General') !== filterCategory) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          bug.title,
          bug.description,
          bug.category || '',
          ...(bug.tags || [])
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'Oldest':
          return a.createdAt - b.createdAt;
        case 'Severity':
          return severityRank[b.severity] - severityRank[a.severity];
        case 'Due Date': {
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return aDue - bDue;
        }
        case 'Newest':
        default:
          return b.createdAt - a.createdAt;
      }
    });

  const visibleColumns: BugStatus[] = filterStatus === 'All' ? BUG_COLUMNS : [filterStatus];

  useEffect(() => {
    const observers: ResizeObserver[] = [];
    const statuses = visibleColumns.length > 0 ? visibleColumns : BUG_COLUMNS;
    for (const status of statuses) {
      const el = columnBodyRefs.current[status];
      if (!el) continue;
      const updateHeight = () => {
        const nextHeight = el.clientHeight || 600;
        setColumnViewportHeights(prev => (prev[status] === nextHeight ? prev : { ...prev, [status]: nextHeight }));
      };
      updateHeight();
      const observer = new ResizeObserver(updateHeight);
      observer.observe(el);
      observers.push(observer);
    }
    return () => observers.forEach(observer => observer.disconnect());
  }, [visibleColumns]);

  const setColumnBodyRef = (status: BugStatus) => (el: HTMLDivElement | null) => {
    columnBodyRefs.current[status] = el;
    if (!el) return;
    const nextHeight = el.clientHeight || 600;
    setColumnViewportHeights(prev => (prev[status] === nextHeight ? prev : { ...prev, [status]: nextHeight }));
  };

  const handleColumnScroll = (status: BugStatus) => (e: React.UIEvent<HTMLDivElement>) => {
    const nextTop = e.currentTarget.scrollTop;
    setColumnScrollTop(prev => (prev[status] === nextTop ? prev : { ...prev, [status]: nextTop }));
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
             <BugIcon className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-zinc-200 font-medium">{fileName}</h3>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center mr-2">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /> Saved</span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unsaved</span>}
            </div>

            <button
                onClick={handleOpenCreate}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-md text-sm font-medium transition-colors border border-zinc-700"
            >
                <Plus className="w-4 h-4" />
                Report Bug
            </button>
            <button
                onClick={handleManualSave}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}
            >
                <Save className="w-4 h-4" />
                Save Board
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-zinc-800 flex flex-wrap gap-3 items-center bg-zinc-900">
         <div className="relative w-56">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bugs..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
         </div>
         <div className="h-6 w-px bg-zinc-800 hidden lg:block"></div>
         <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Filter className="w-4 h-4" />
            <span>Severity:</span>
            <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
               {(['All', 'Low', 'Medium', 'High', 'Critical'] as const).map(sev => (
                 <button
                   key={sev}
                   onClick={() => setFilterSeverity(sev)}
                   className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                     filterSeverity === sev 
                       ? 'bg-zinc-800 text-white shadow-sm' 
                       : 'text-zinc-500 hover:text-zinc-300'
                   }`}
                 >
                   {sev}
                 </button>
               ))}
            </div>
         </div>
         <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <span>Status</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'All' | BugStatus)}
              className="bg-transparent focus:outline-none text-xs text-zinc-200"
            >
              <option value="All">All</option>
              {BUG_COLUMNS.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
         </div>
         <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <span>Category</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-transparent focus:outline-none text-xs text-zinc-200"
            >
              <option value="All">All</option>
              {BUG_CATEGORIES.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
         </div>
         <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as BugSort)}
              className="bg-transparent focus:outline-none text-xs text-zinc-200"
            >
              <option value="Newest">Newest</option>
              <option value="Oldest">Oldest</option>
              <option value="Severity">Severity</option>
              <option value="Due Date">Due Date</option>
            </select>
         </div>
         <button
           onClick={resetBoardFilters}
           className="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-xs text-zinc-300 hover:text-white"
         >
           Reset Filters
         </button>
         <div className="ml-auto text-xs text-zinc-500">
            Showing {filteredBugs.length} of {bugs.length} bugs
         </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <div className={`flex gap-6 h-full ${visibleColumns.length === 1 ? 'min-w-[320px]' : 'min-w-[1000px]'}`}>
          {visibleColumns.map(status => {
             const colBugs = filteredBugs.filter(b => b.status === status);
             const isActiveDrop = activeDropZone === status;
             const shouldVirtualize = colBugs.length > 32;
             const viewportHeight = columnViewportHeights[status] || 600;
             const scrollTop = columnScrollTop[status] || 0;
             const virtualCount = Math.ceil(viewportHeight / COLUMN_CARD_ESTIMATE) + COLUMN_OVERSCAN * 2;
             const virtualStart = shouldVirtualize ? Math.max(0, Math.floor(scrollTop / COLUMN_CARD_ESTIMATE) - COLUMN_OVERSCAN) : 0;
             const virtualEnd = shouldVirtualize ? Math.min(colBugs.length, virtualStart + virtualCount) : colBugs.length;
             const visibleBugs = shouldVirtualize ? colBugs.slice(virtualStart, virtualEnd) : colBugs;
             const topSpacerHeight = shouldVirtualize ? virtualStart * COLUMN_CARD_ESTIMATE : 0;
             const bottomSpacerHeight = shouldVirtualize ? Math.max(0, (colBugs.length - virtualEnd) * COLUMN_CARD_ESTIMATE) : 0;
             
             return (
               <div 
                  key={status}
                  onDragOver={(e) => handleDragOver(e, status)}
                  onDrop={(e) => handleDrop(e, status)}
                  className={`
                    flex-1 flex flex-col min-w-[300px] h-full rounded-xl overflow-hidden transition-all duration-200
                    ${isActiveDrop 
                       ? 'bg-zinc-900 border-2 border-blue-500/50 shadow-[0_0_30px_-5px_rgba(59,130,246,0.2)]' 
                       : 'bg-zinc-950/50 border border-zinc-800'}
                  `}
               >
                 <div className={`p-4 border-b flex justify-between items-center sticky top-0 ${isActiveDrop ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-900 border-zinc-800'}`}>
                    <h4 className={`font-semibold transition-colors ${isActiveDrop ? 'text-blue-400' : 'text-zinc-300'}`}>{status}</h4>
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full">{colBugs.length}</span>
                 </div>
                 
                 <div
                    ref={setColumnBodyRef(status)}
                    onScroll={handleColumnScroll(status)}
                    className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar"
                 >
                    {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}
                    {visibleBugs.map(bug => (
                      <div 
                        key={bug.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, bug.id)}
                        onDragEnd={handleDragEnd}
                        className={`bg-zinc-900 border border-zinc-800 p-4 rounded-lg shadow-sm hover:border-zinc-700 transition-colors group cursor-grab active:cursor-grabbing ${draggedBugId === bug.id ? 'opacity-40 grayscale border-dashed border-zinc-600' : 'opacity-100'}`}
                      >
                         <div className="flex justify-between items-start mb-2 relative">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 pointer-events-none ${getSeverityColor(bug.severity)}`}>
                              {getSeverityIcon(bug.severity)}
                              {bug.severity}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative z-20">
                                <button 
                                    onClick={(e) => handleOpenEdit(e, bug)}
                                    className="p-1 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded cursor-pointer"
                                    title="Edit Bug"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        deleteBug(bug.id);
                                    }} 
                                    className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded cursor-pointer"
                                    title="Delete Bug"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                         </div>
                         <h5 className="text-sm font-medium text-zinc-200 mb-1 pointer-events-none">{bug.title}</h5>
                         <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                           {bug.category && (
                             <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5">
                               <Tags className="h-3 w-3" /> {bug.category}
                             </span>
                           )}
                           {bug.dueDate && (
                             <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5">
                               <Calendar className="h-3 w-3" /> {new Date(bug.dueDate).toLocaleDateString()}
                             </span>
                           )}
                           {bug.reproducible === false && (
                             <span className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-zinc-400">Intermittent</span>
                           )}
                         </div>
                         {bug.tags && bug.tags.length > 0 && (
                           <div className="mb-2 flex flex-wrap gap-1">
                             {bug.tags.map(tag => (
                               <span key={`${bug.id}-${tag}`} className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
                                 #{tag}
                               </span>
                             ))}
                           </div>
                         )}
                         <p className="text-xs text-zinc-500 line-clamp-2 mb-3 break-words">
                           {bug.description ? renderDescriptionWithLinks(bug.description) : "No description provided."}
                         </p>
                         
                         <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-800 pointer-events-auto relative z-10">
                           {status !== 'Open' ? (
                             <button 
                               onClick={() => updateStatus(bug.id, BUG_COLUMNS[BUG_COLUMNS.indexOf(status) - 1])}
                               className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 hover:bg-zinc-800 px-2 py-1 rounded transition-colors"
                             >
                               <ChevronLeft className="w-3 h-3" /> Prev
                             </button>
                           ) : <div></div>}
                           
                           {status !== 'Closed' ? (
                             <button 
                               onClick={() => updateStatus(bug.id, BUG_COLUMNS[BUG_COLUMNS.indexOf(status) + 1])}
                               className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 hover:bg-zinc-800 px-2 py-1 rounded transition-colors"
                             >
                               Next <ChevronRight className="w-3 h-3" />
                             </button>
                           ) : <div></div>}
                         </div>
                      </div>
                    ))}
                    {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
                    {colBugs.length === 0 && (
                      <div className={`text-center py-8 pointer-events-none transition-opacity ${isActiveDrop ? 'opacity-50 text-blue-400' : 'opacity-30 text-zinc-500'}`}>
                        <div className="text-sm italic">{isActiveDrop ? 'Drop to move here' : 'Drop items here'}</div>
                      </div>
                    )}
                 </div>
               </div>
             )
          })}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">{editingBug ? 'Edit Bug Report' : 'Report Bug'}</h2>
              <button onClick={resetForm} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Title</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  placeholder="e.g., Crash on startup"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Severity</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Medium', 'High', 'Critical'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setNewSeverity(sev)}
                      className={`py-2 px-1 rounded-lg text-xs font-medium border transition-all ${
                        newSeverity === sev
                          ? 'bg-zinc-800 border-zinc-600 text-white ring-1 ring-zinc-500'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as BugStatus)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  >
                    {BUG_COLUMNS.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  >
                    {BUG_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Target Date</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all [color-scheme:dark]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Tags</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  placeholder="rendering, crash, multiplayer"
                />
                <p className="mt-1 text-[11px] text-zinc-500">Comma-separated. Up to 8 tags.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Reproducibility</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewReproducible(true)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      newReproducible ? 'border-zinc-600 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    Always Reproducible
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewReproducible(false)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      !newReproducible ? 'border-zinc-600 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    Intermittent
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-zinc-400">Description</label>
                  <div className="relative" ref={linkPickerRef}>
                    <button
                      type="button"
                      onClick={toggleLinkPicker}
                      disabled={linkableFiles.length === 0}
                      className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-zinc-600 disabled:cursor-not-allowed flex items-center gap-1"
                      title={linkableFiles.length === 0 ? 'No files available to link' : 'Insert File Link'}
                    >
                      <LinkIcon className="w-3 h-3" /> Link File
                    </button>
                    {linkPickerOpen && (
                      <div className="absolute right-0 top-5 z-30 w-72 rounded-md border border-zinc-700 bg-zinc-900 p-2 shadow-lg">
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
                            <p className="px-2 py-2 text-xs text-zinc-500">No matching files.</p>
                          ) : (
                            filteredLinkableFiles.map(file => (
                              <button
                                key={file.id}
                                type="button"
                                onClick={() => appendFileLinkToDescription(file.id)}
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
                </div>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  onDragOver={handleDescriptionDragOver}
                  onDrop={handleDescriptionDrop}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all min-h-[100px]"
                  placeholder="Steps to reproduce..."
                />
              </div>
              
              <div className="pt-4 border-t border-zinc-800">
                <button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {editingBug ? 'Save Changes' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanBoard;
