import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Save, Plus, Trash2, Calendar, Flag, AlertCircle, Loader2, Check, TrendingUp, Link as LinkIcon, Search, Filter, RotateCcw } from 'lucide-react';
import { EditorProps, RoadmapItem, RoadmapItemType, RoadmapStatus } from '../types';

const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const ROADMAP_STATUS_OPTIONS: RoadmapStatus[] = ['planned', 'in-progress', 'completed', 'delayed', 'dropped'];
const ROADMAP_TYPE_OPTIONS: RoadmapItemType[] = ['phase', 'milestone'];

const RoadmapEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, projectFiles = [], onOpenFile, activeFileId }) => {
  const [items, setItems] = useState<RoadmapItem[]>(initialContent?.items || []);
  
  // Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(JSON.stringify(initialContent?.items || []));

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState<Partial<RoadmapItem>>({
    title: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    type: 'phase',
    status: 'planned',
    progress: 0,
    description: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | RoadmapStatus>('All');
  const [filterType, setFilterType] = useState<'All' | RoadmapItemType>('All');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const linkPickerRef = useRef<HTMLDivElement | null>(null);
  const fileLookup = useMemo(() => new Map(projectFiles.map(f => [f.id, f.name])), [projectFiles]);
  const linkableFiles = useMemo(
    () => projectFiles.filter(f => f.id !== activeFileId).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [projectFiles, activeFileId]
  );
  const filteredLinkableFiles = useMemo(() => {
    const query = linkPickerQuery.trim().toLowerCase();
    if (!query) return linkableFiles;
    return linkableFiles.filter(file =>
      file.name.toLowerCase().includes(query) || file.id.toLowerCase().includes(query)
    );
  }, [linkableFiles, linkPickerQuery]);

  // Sync Content
  useEffect(() => {
    setItems(initialContent?.items || []);
    lastSavedData.current = JSON.stringify(initialContent?.items || []);
  }, [initialContent]);

  useEffect(() => {
    if (linkableFiles.length > 0) return;
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
  }, [linkableFiles]);

  useEffect(() => {
    if (!isFormOpen || !linkPickerOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!linkPickerRef.current) return;
      if (linkPickerRef.current.contains(event.target as Node)) return;
      setLinkPickerOpen(false);
      setLinkPickerQuery('');
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isFormOpen, linkPickerOpen]);

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

  const resetRoadmapFilters = () => {
    setSearchQuery('');
    setFilterStatus('All');
    setFilterType('All');
  };

  const addDays = (dateText: string | undefined, days: number) => {
    if (!dateText) return '';
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  // --- CRUD Operations ---

  const handleAddNew = () => {
    setEditingId(null);
    setFormData({
      title: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0],
      type: 'phase',
      status: 'planned',
      progress: 0,
      description: ''
    });
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
    setIsFormOpen(true);
  };

  const handleEdit = (item: RoadmapItem) => {
    setEditingId(item.id);
    setFormData({ ...item });
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this roadmap item?")) {
      setItems(items.filter(i => i.id !== id));
      if (editingId === id) setIsFormOpen(false);
    }
  };

  const appendFileLinkToDescription = (fileId: string) => {
    const selected = projectFiles.find(f => f.id === fileId);
    if (!selected) return;
    setFormData(prev => ({ ...prev, description: `${prev.description || ''}${prev.description ? '\n' : ''}[${selected.name}](file://${selected.id})` }));
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
    setFormData(prev => ({ ...prev, description: `${prev.description || ''}${prev.description ? '\n' : ''}[${file.name}](file://${file.id})` }));
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
      const label = match[1];
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
          {label}
        </button>
      );
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      nodes.push(<span key={`txt-end-${lastIdx}`}>{text.slice(lastIdx)}</span>);
    }
    return nodes.length ? nodes : text;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safeTitle = (formData.title || '').trim();
    if (!safeTitle) return;
    const safeStartDate = formData.startDate || new Date().toISOString().split('T')[0];
    const computedEndDate = formData.type === 'milestone' ? safeStartDate : (formData.endDate || safeStartDate);
    const safeEndDate = new Date(computedEndDate) < new Date(safeStartDate) ? safeStartDate : computedEndDate;

    const newItem: RoadmapItem = {
      id: editingId || crypto.randomUUID(),
      title: safeTitle,
      startDate: safeStartDate,
      endDate: safeEndDate,
      type: formData.type as RoadmapItemType,
      status: formData.status as RoadmapStatus,
      progress: Number(formData.progress) || 0,
      description: formData.description || ''
    };

    if (editingId) {
      setItems(items.map(i => i.id === editingId ? newItem : i));
    } else {
      setItems([...items, newItem]);
    }

    setIsFormOpen(false);
  };

  // --- Timeline Calculations ---
  const visibleItems = [...items]
    .filter(item => {
      if (filterStatus !== 'All' && item.status !== filterStatus) return false;
      if (filterType !== 'All' && item.type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchable = `${item.title} ${item.description || ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const timelineData = useMemo(() => {
    if (visibleItems.length === 0) return { months: [], totalDays: 0, startTs: 0, endTs: 0 };

    // Find range
    const timestamps = visibleItems.flatMap(i => [new Date(i.startDate).getTime(), new Date(i.endDate).getTime()]);
    let minTs = Math.min(...timestamps);
    let maxTs = Math.max(...timestamps);

    // Buffer (1 month before, 1 month after)
    minTs -= 2629800000; 
    maxTs += 2629800000;

    const startDate = new Date(minTs);
    const endDate = new Date(maxTs);
    const totalDays = (maxTs - minTs) / (1000 * 60 * 60 * 24);

    // Generate Month Grid
    const months: { label: string, offset: number }[] = [];
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    
    while (current.getTime() < maxTs) {
      const offset = (current.getTime() - minTs) / (maxTs - minTs) * 100;
      months.push({ 
        label: current.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), 
        offset 
      });
      current.setMonth(current.getMonth() + 1);
    }

    return { months, totalDays, startTs: minTs, endTs: maxTs };
  }, [visibleItems]);

  const getPositionStyles = (start: string, end: string) => {
    if (!timelineData.totalDays) return { left: '0%', width: '0%' };
    
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const totalMs = timelineData.endTs - timelineData.startTs;

    const left = ((s - timelineData.startTs) / totalMs) * 100;
    const width = Math.max(((e - s) / totalMs) * 100, 0.5); // Min width visibility

    return { left: `${left}%`, width: `${width}%` };
  };

  // --- Helpers ---

  const getStatusColor = (status: RoadmapStatus) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500';
      case 'in-progress': return 'bg-blue-500';
      case 'delayed': return 'bg-red-500';
      case 'dropped': return 'bg-zinc-600';
      default: return 'bg-zinc-500'; // planned
    }
  };

  const getStatusBadge = (status: RoadmapStatus) => {
    switch (status) {
      case 'completed': return <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-emerald-400/20">Done</span>;
      case 'in-progress': return <span className="text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-blue-400/20">Active</span>;
      case 'delayed': return <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-red-400/20">Delayed</span>;
      default: return <span className="text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-zinc-700">Planned</span>;
    }
  };

  const todayLeft = timelineData.totalDays
    ? `${Math.min(100, Math.max(0, ((Date.now() - timelineData.startTs) / (timelineData.endTs - timelineData.startTs || 1)) * 100))}%`
    : '0%';
  const roadmapStats = useMemo(() => ({
    total: visibleItems.length,
    active: visibleItems.filter(item => item.status === 'in-progress').length,
    delayed: visibleItems.filter(item => item.status === 'delayed').length,
    milestones: visibleItems.filter(item => item.type === 'milestone').length
  }), [visibleItems]);

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Header */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
            <h3 className="text-zinc-200 font-medium">{fileName}</h3>
        </div>
        <div className="flex items-center gap-3">
             <div className="flex items-center mr-2">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /> Saved</span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unsaved</span>}
            </div>
            <button onClick={handleAddNew} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-md text-sm font-medium transition-colors border border-zinc-700">
                <Plus className="w-4 h-4" /> Add Item
            </button>
            <button onClick={handleManualSave} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}>
                <Save className="w-4 h-4" /> Save
            </button>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900 flex flex-wrap items-center gap-3">
        <div className="relative w-60">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roadmap items..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <span>Status</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'All' | RoadmapStatus)}
            className="bg-transparent focus:outline-none text-xs text-zinc-200"
          >
            <option value="All">All</option>
            {ROADMAP_STATUS_OPTIONS.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
          <span>Type</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'All' | RoadmapItemType)}
            className="bg-transparent focus:outline-none text-xs text-zinc-200"
          >
            <option value="All">All</option>
            {ROADMAP_TYPE_OPTIONS.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <button
          onClick={resetRoadmapFilters}
          className="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-xs text-zinc-300 hover:text-white flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Total {roadmapStats.total}</span>
          <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Active {roadmapStats.active}</span>
          <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Delayed {roadmapStats.delayed}</span>
          <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Milestones {roadmapStats.milestones}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Panel: List View */}
        <div className="w-full lg:w-1/3 border-r border-zinc-800 flex flex-col bg-zinc-950/50">
           <div className="p-4 border-b border-zinc-800 bg-zinc-950 font-semibold text-sm text-zinc-400 uppercase tracking-wider">
              Items List
              <span className="ml-2 text-[10px] font-normal text-zinc-500 normal-case">
                {visibleItems.length} shown / {items.length} total
              </span>
           </div>
           <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
              {visibleItems.length === 0 ? (
                  <div className="text-center py-10 text-zinc-600 text-sm">
                    {items.length === 0 ? 'No roadmap items yet.' : 'No items match the current filters.'}
                  </div>
              ) : (
                  visibleItems.map(item => (
                      <div 
                        key={item.id} 
                        onClick={() => handleEdit(item)}
                        className={`p-3 rounded-lg border cursor-pointer hover:border-zinc-600 transition-all ${editingId === item.id ? 'bg-zinc-900 border-blue-500/50 shadow-md' : 'bg-zinc-900/50 border-zinc-800'}`}
                      >
                          <div className="flex justify-between items-start mb-2">
                             <div className="flex items-center gap-2">
                                {item.type === 'milestone' ? <Flag className="w-4 h-4 text-amber-500" /> : <Calendar className="w-4 h-4 text-blue-500" />}
                                <span className="font-medium text-zinc-200 text-sm">{item.title}</span>
                             </div>
                             {getStatusBadge(item.status)}
                          </div>
                          
                          <div className="flex justify-between items-center text-xs text-zinc-500">
                             <span>{new Date(item.startDate).toLocaleDateString()} {item.type === 'phase' && ` - ${new Date(item.endDate).toLocaleDateString()}`}</span>
                             {item.type === 'phase' && (
                                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {item.progress}%</span>
                             )}
                          </div>
                          
                          {item.type === 'phase' && (
                              <div className="w-full h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                                  <div className={`h-full ${getStatusColor(item.status)}`} style={{ width: `${item.progress}%`, opacity: 0.7 }}></div>
                              </div>
                          )}
                      </div>
                  ))
              )}
           </div>
        </div>

        {/* Right Panel: Timeline Visualization */}
        <div className="flex-1 flex flex-col bg-zinc-900 overflow-hidden relative">
            {/* Timeline Header */}
            <div className="h-10 bg-zinc-950 border-b border-zinc-800 relative overflow-hidden shrink-0 select-none">
                {timelineData.months.map((m, idx) => (
                    <div 
                        key={idx} 
                        className="absolute top-0 bottom-0 border-l border-zinc-800 text-[10px] text-zinc-500 pl-1 pt-2 truncate"
                        style={{ left: `${m.offset}%` }}
                    >
                        {m.label}
                    </div>
                ))}
            </div>

            {/* Timeline Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative p-4 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')]">
                {/* Vertical Grid Lines */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    {timelineData.months.map((m, idx) => (
                        <div key={idx} className="absolute top-0 bottom-0 border-l border-zinc-800/30" style={{ left: `${m.offset}%` }}></div>
                    ))}
                    {/* Today Line */}
                    <div 
                        className="absolute top-0 bottom-0 border-l border-red-500/50 z-0"
                        style={{ left: todayLeft }}
                    >
                        <div className="text-[9px] text-red-500 bg-red-500/10 px-1 ml-1 mt-1 rounded">Today</div>
                    </div>
                </div>

                {/* Items */}
                <div className="relative z-10 space-y-6 mt-2">
                    {visibleItems.length === 0 && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 text-center text-sm text-zinc-500">
                            No timeline items for the current filters.
                        </div>
                    )}
                    {visibleItems.map(item => {
                        const style = getPositionStyles(item.startDate, item.endDate);
                        
                        if (item.type === 'milestone') {
                            return (
                                <div key={item.id} className="relative h-6 group">
                                    <div 
                                        className="absolute transform -translate-x-1/2 flex flex-col items-center cursor-pointer"
                                        style={{ left: style.left }}
                                        onClick={() => handleEdit(item)}
                                    >
                                        <div className={`w-3 h-3 rotate-45 border border-zinc-900 ${getStatusColor(item.status)} shadow-lg shadow-black/50 hover:scale-125 transition-transform`}></div>
                                        <div className="w-0.5 h-full bg-zinc-700/50 absolute top-3"></div>
                                        <span className="text-xs text-zinc-300 mt-1 whitespace-nowrap bg-zinc-950/80 px-1.5 rounded border border-zinc-800">{item.title}</span>
                                        <span className="text-[10px] text-zinc-500 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">{new Date(item.startDate).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            );
                        } else {
                            // Phase
                            return (
                                <div 
                                    key={item.id} 
                                    className="relative h-8 group cursor-pointer" 
                                    style={{ marginLeft: style.left, width: style.width }}
                                    onClick={() => handleEdit(item)}
                                >
                                    <div className={`h-full rounded-md border border-white/5 overflow-hidden relative shadow-sm hover:shadow-lg transition-shadow bg-zinc-800`}>
                                        {/* Progress Fill */}
                                        <div 
                                            className={`absolute top-0 left-0 bottom-0 ${getStatusColor(item.status)} opacity-20`} 
                                            style={{ width: '100%' }}
                                        ></div>
                                        <div 
                                            className={`absolute top-0 left-0 bottom-0 ${getStatusColor(item.status)}`} 
                                            style={{ width: `${item.progress}%` }}
                                        ></div>
                                        
                                        {/* Label */}
                                        <div className="absolute inset-0 flex items-center px-2">
                                            <span className="text-xs font-medium text-white drop-shadow-md truncate sticky left-0">{item.title}</span>
                                        </div>
                                    </div>
                                    {/* Dates Tooltip */}
                                    <div className="absolute top-full left-0 mt-1 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none border border-zinc-800">
                                        {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()} ({item.progress}%)
                                    </div>
                                </div>
                            );
                        }
                    })}
                </div>
            </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-6">{editingId ? 'Edit Item' : 'Add Roadmap Item'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-zinc-400 mb-1">Title</label>
                        <input 
                            type="text" 
                            required
                            value={formData.title} 
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:border-blue-500 outline-none" 
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Type</label>
                            <select 
                                value={formData.type}
                                onChange={e => {
                                  const nextType = e.target.value as RoadmapItemType;
                                  setFormData(prev => ({
                                    ...prev,
                                    type: nextType,
                                    endDate: nextType === 'milestone' ? prev.startDate : prev.endDate
                                  }));
                                }}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:border-blue-500 outline-none"
                            >
                                {ROADMAP_TYPE_OPTIONS.map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Status</label>
                            <select 
                                value={formData.status}
                                onChange={e => setFormData({...formData, status: e.target.value as RoadmapStatus})}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:border-blue-500 outline-none"
                            >
                                {ROADMAP_STATUS_OPTIONS.map(status => (
                                  <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">{formData.type === 'milestone' ? 'Date' : 'Start Date'}</label>
                            <input 
                                type="date" 
                                required
                                value={formData.startDate} 
                                onChange={e => setFormData({...formData, startDate: e.target.value})}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:border-blue-500 outline-none [color-scheme:dark]" 
                            />
                        </div>
                        {formData.type === 'phase' && (
                            <div>
                                <label className="block text-sm text-zinc-400 mb-1">End Date</label>
                                <input 
                                    type="date" 
                                    required
                                    value={formData.endDate} 
                                    onChange={e => setFormData({...formData, endDate: e.target.value})}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:border-blue-500 outline-none [color-scheme:dark]" 
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {[7, 14, 30, 60].map(days => (
                                      <button
                                        key={days}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, endDate: addDays(prev.startDate, days) || prev.endDate }))}
                                        className="px-2 py-1 text-[10px] rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white"
                                      >
                                        +{days}d
                                      </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {formData.type === 'phase' && (
                        <div>
                            <label className="block text-sm text-zinc-400 mb-1">Progress ({formData.progress}%)</label>
                            <input 
                                type="range" 
                                min="0" max="100" 
                                value={formData.progress} 
                                onChange={e => setFormData({...formData, progress: parseInt(e.target.value)})}
                                className="w-full accent-blue-500" 
                            />
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm text-zinc-400">Description</label>
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
                            value={formData.description} 
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            onDragOver={handleDescriptionDragOver}
                            onDrop={handleDescriptionDrop}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white focus:border-blue-500 outline-none min-h-[80px]" 
                        />
                        {formData.description && formData.description.includes('file://') && (
                            <div className="mt-2 text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded p-2 break-words">
                                {renderTextWithFileLinks(formData.description)}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-zinc-800 mt-4">
                        {editingId && (
                            <button 
                                type="button" 
                                onClick={() => handleDelete(editingId)}
                                className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded font-medium text-sm border border-red-500/20"
                            >
                                Delete
                            </button>
                        )}
                        <div className="flex-1"></div>
                        <button 
                            type="button" 
                            onClick={() => setIsFormOpen(false)}
                            className="px-4 py-2 text-zinc-400 hover:text-white font-medium text-sm"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm"
                        >
                            {editingId ? 'Save Changes' : 'Create Item'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default RoadmapEditor;
