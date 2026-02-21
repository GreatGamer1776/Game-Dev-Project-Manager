import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock3,
  Filter,
  Flag,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2
} from 'lucide-react';
import { EditorProps, RoadmapItem, RoadmapItemType, RoadmapStatus } from '../types';

const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const STATUS_ORDER: RoadmapStatus[] = ['planned', 'in-progress', 'completed', 'delayed', 'dropped'];
const TYPE_OPTIONS: RoadmapItemType[] = ['phase', 'milestone'];

type SaveStatus = 'saved' | 'saving' | 'unsaved';
type ScopeFilter = 'all' | 'active' | 'next90' | 'overdue' | 'completed';
type SortBy = 'start' | 'end' | 'title' | 'progress';

interface RoadmapFormState {
  title: string;
  type: RoadmapItemType;
  status: RoadmapStatus;
  startDate: string;
  endDate: string;
  progress: number;
  description: string;
}

const STATUS_META: Record<RoadmapStatus, { label: string; chip: string; dot: string; bar: string; panel: string }> = {
  planned: {
    label: 'Planned',
    chip: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    dot: 'bg-zinc-500',
    bar: 'bg-zinc-500',
    panel: 'border-zinc-800'
  },
  'in-progress': {
    label: 'In Progress',
    chip: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    dot: 'bg-blue-400',
    bar: 'bg-blue-500',
    panel: 'border-blue-500/30'
  },
  completed: {
    label: 'Completed',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    dot: 'bg-emerald-400',
    bar: 'bg-emerald-500',
    panel: 'border-emerald-500/30'
  },
  delayed: {
    label: 'Delayed',
    chip: 'bg-red-500/15 text-red-300 border-red-500/40',
    dot: 'bg-red-400',
    bar: 'bg-red-500',
    panel: 'border-red-500/30'
  },
  dropped: {
    label: 'Dropped',
    chip: 'bg-zinc-700/80 text-zinc-300 border-zinc-600',
    dot: 'bg-zinc-400',
    bar: 'bg-zinc-600',
    panel: 'border-zinc-700'
  }
};

const typeLabel = (type: RoadmapItemType) => (type === 'milestone' ? 'Milestone' : 'Phase');
const todayIso = () => new Date().toISOString().split('T')[0];

const dateToTs = (date: string) => {
  const ts = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(ts) ? ts : Date.now();
};

const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const getItemHue = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
};

const getItemColors = (id: string) => {
  const hue = getItemHue(id);
  return {
    solid: `hsl(${hue} 72% 52%)`,
    soft: `hsla(${hue}, 72%, 52%, 0.22)`,
    border: `hsla(${hue}, 72%, 52%, 0.55)`
  };
};

const defaultForm = (type: RoadmapItemType = 'phase'): RoadmapFormState => {
  const start = todayIso();
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().split('T')[0];
  return {
    title: '',
    type,
    status: 'planned',
    startDate: start,
    endDate: type === 'milestone' ? start : end,
    progress: 0,
    description: ''
  };
};

const normalizeItems = (content: any): RoadmapItem[] => {
  const rawItems = Array.isArray(content?.items) ? content.items : [];
  return rawItems
    .filter((item: any) => typeof item?.title === 'string')
    .map((item: any): RoadmapItem => {
      const startDate = typeof item.startDate === 'string' && item.startDate ? item.startDate : todayIso();
      const rawType = item.type === 'milestone' ? 'milestone' : 'phase';
      const endDate =
        rawType === 'milestone'
          ? startDate
          : typeof item.endDate === 'string' && item.endDate
            ? item.endDate
            : startDate;
      const status: RoadmapStatus = STATUS_ORDER.includes(item.status) ? item.status : 'planned';
      const progress = rawType === 'milestone' ? (status === 'completed' ? 100 : 0) : clampProgress(Number(item.progress) || 0);
      return {
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        title: item.title.trim() || 'Untitled Item',
        startDate,
        endDate,
        type: rawType,
        status,
        progress,
        description: typeof item.description === 'string' ? item.description : ''
      };
    });
};

const parseScope = (item: RoadmapItem, todayTs: number) => {
  const startTs = dateToTs(item.startDate);
  const endTs = dateToTs(item.type === 'milestone' ? item.startDate : item.endDate);
  const isCompleted = item.status === 'completed';
  const isActive = !isCompleted && item.status !== 'dropped' && startTs <= todayTs && endTs >= todayTs;
  const isOverdue = !isCompleted && item.status !== 'dropped' && endTs < todayTs;
  const isNext90 = startTs >= todayTs && startTs <= todayTs + 1000 * 60 * 60 * 24 * 90;
  return { isActive, isOverdue, isNext90, isCompleted };
};

const RoadmapEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, projectFiles = [], onOpenFile, activeFileId }) => {
  const initialItems = useRef(normalizeItems(initialContent));
  const [items, setItems] = useState<RoadmapItem[]>(initialItems.current);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const lastSavedData = useRef(JSON.stringify(initialItems.current));

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RoadmapStatus>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | RoadmapItemType>('All');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('start');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RoadmapFormState>(defaultForm());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const linkPickerRef = useRef<HTMLDivElement | null>(null);

  const fileLookup = useMemo(() => new Map(projectFiles.map(file => [file.id, file.name])), [projectFiles]);
  const linkableFiles = useMemo(
    () => projectFiles.filter(file => file.id !== activeFileId).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [projectFiles, activeFileId]
  );

  const filteredLinkableFiles = useMemo(() => {
    const query = linkPickerQuery.trim().toLowerCase();
    if (!query) return linkableFiles;
    return linkableFiles.filter(file => file.name.toLowerCase().includes(query) || file.id.toLowerCase().includes(query));
  }, [linkPickerQuery, linkableFiles]);

  useEffect(() => {
    const normalized = normalizeItems(initialContent);
    setItems(normalized);
    lastSavedData.current = JSON.stringify(normalized);
    setSaveStatus('saved');
    setSelectedId(prev => (prev && normalized.some(item => item.id === prev) ? prev : normalized[0]?.id || null));
  }, [initialContent]);

  useEffect(() => {
    const payload = JSON.stringify(items);
    if (payload === lastSavedData.current) return;
    setSaveStatus('unsaved');
    const timer = setTimeout(() => handleManualSave(), 1200);
    return () => clearTimeout(timer);
  }, [items]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items]);

  useEffect(() => {
    if (!isModalOpen || !linkPickerOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!linkPickerRef.current) return;
      if (linkPickerRef.current.contains(event.target as Node)) return;
      setLinkPickerOpen(false);
      setLinkPickerQuery('');
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isModalOpen, linkPickerOpen]);

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave({ items });
    lastSavedData.current = JSON.stringify(items);
    setTimeout(() => setSaveStatus('saved'), 350);
  };

  const openCreate = (type: RoadmapItemType = 'phase') => {
    setEditingId(null);
    setFormData(defaultForm(type));
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
    setIsModalOpen(true);
  };

  const openEdit = (item: RoadmapItem) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      type: item.type,
      status: item.status,
      startDate: item.startDate,
      endDate: item.type === 'milestone' ? item.startDate : item.endDate,
      progress: item.progress,
      description: item.description || ''
    });
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this roadmap item?')) return;
    setItems(prev => prev.filter(item => item.id !== id));
    setSelectedId(prev => (prev === id ? null : prev));
    if (editingId === id) closeModal();
  };

  const upsertItem = (item: RoadmapItem) => {
    setItems(prev => {
      if (prev.some(existing => existing.id === item.id)) {
        return prev.map(existing => (existing.id === item.id ? item : existing));
      }
      return [...prev, item];
    });
    setSelectedId(item.id);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const safeTitle = formData.title.trim();
    if (!safeTitle) return;

    const safeStart = formData.startDate || todayIso();
    const safeEnd = formData.type === 'milestone' ? safeStart : (formData.endDate || safeStart);
    const adjustedEnd = dateToTs(safeEnd) < dateToTs(safeStart) ? safeStart : safeEnd;

    const next: RoadmapItem = {
      id: editingId || crypto.randomUUID(),
      title: safeTitle,
      type: formData.type,
      status: formData.status,
      startDate: safeStart,
      endDate: formData.type === 'milestone' ? safeStart : adjustedEnd,
      progress: formData.type === 'milestone' ? (formData.status === 'completed' ? 100 : 0) : clampProgress(formData.progress),
      description: formData.description.trim()
    };

    upsertItem(next);
    closeModal();
  };

  const appendFileLinkToDescription = (fileId: string) => {
    const file = projectFiles.find(entry => entry.id === fileId);
    if (!file) return;
    setFormData(prev => ({
      ...prev,
      description: `${prev.description}${prev.description ? '\n' : ''}[${file.name}](file://${file.id})`
    }));
    setLinkPickerOpen(false);
    setLinkPickerQuery('');
  };

  const toggleLinkPicker = () => {
    if (linkableFiles.length === 0) return;
    setLinkPickerOpen(prev => !prev);
    setLinkPickerQuery('');
  };

  const getDraggedProjectFile = (event: React.DragEvent): { id: string; name: string } | null => {
    const raw = event.dataTransfer.getData(FILE_LINK_DRAG_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: string; name?: string };
        if (parsed?.id) return { id: parsed.id, name: parsed.name || fileLookup.get(parsed.id) || 'Linked File' };
      } catch {
        const fallback = projectFiles.find(file => file.id === raw);
        if (fallback) return { id: fallback.id, name: fallback.name };
      }
    }

    const uri = event.dataTransfer.getData('text/uri-list');
    if (uri?.startsWith('file://')) {
      const id = uri.replace('file://', '').trim();
      const file = projectFiles.find(entry => entry.id === id);
      if (file) return { id: file.id, name: file.name };
    }

    const text = event.dataTransfer.getData('text/plain');
    const markdownMatch = text.match(/\[([^\]]+)\]\(file:\/\/([^)]+)\)/);
    if (markdownMatch?.[2]) {
      const file = projectFiles.find(entry => entry.id === markdownMatch[2]);
      if (file) return { id: file.id, name: file.name };
    }

    const fallback = projectFiles.find(entry => entry.id === text.trim());
    if (!fallback) return null;
    return { id: fallback.id, name: fallback.name };
  };

  const handleDescriptionDragOver = (event: React.DragEvent<HTMLTextAreaElement>) => {
    if (!getDraggedProjectFile(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDescriptionDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    const file = getDraggedProjectFile(event);
    if (!file) return;
    event.preventDefault();
    setFormData(prev => ({
      ...prev,
      description: `${prev.description}${prev.description ? '\n' : ''}[${file.name}](file://${file.id})`
    }));
  };

  const renderTextWithFileLinks = (text: string) => {
    const nodes: React.ReactNode[] = [];
    const regex = /\[([^\]]+)\]\(file:\/\/([^)]+)\)/g;
    let last = 0;
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) nodes.push(<span key={`txt-${last}`}>{text.slice(last, match.index)}</span>);
      const label = match[1];
      const fileId = match[2];
      const exists = fileLookup.has(fileId);
      nodes.push(
        <button
          key={`lnk-${fileId}-${match.index}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenFile?.(fileId);
          }}
          className={`underline underline-offset-2 ${exists ? 'text-cyan-400 hover:text-cyan-300' : 'text-zinc-500 line-through'}`}
          title={exists ? `Open ${fileLookup.get(fileId)}` : 'Linked file not found'}
        >
          {label}
        </button>
      );
      last = regex.lastIndex;
    }

    if (last < text.length) nodes.push(<span key={`txt-end-${last}`}>{text.slice(last)}</span>);
    return nodes.length > 0 ? nodes : text;
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setTypeFilter('All');
    setScopeFilter('all');
    setSortBy('start');
  };

  const todayTs = useMemo(() => dateToTs(todayIso()), []);

  const visibleItems = useMemo(() => {
    let next = [...items];

    next = next.filter(item => {
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const searchable = `${item.title} ${item.description || ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      const scope = parseScope(item, todayTs);
      if (scopeFilter === 'active' && !scope.isActive) return false;
      if (scopeFilter === 'next90' && !scope.isNext90) return false;
      if (scopeFilter === 'overdue' && !scope.isOverdue) return false;
      if (scopeFilter === 'completed' && !scope.isCompleted) return false;
      return true;
    });

    next.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      if (sortBy === 'progress') return b.progress - a.progress;
      if (sortBy === 'end') return dateToTs(a.type === 'milestone' ? a.startDate : a.endDate) - dateToTs(b.type === 'milestone' ? b.startDate : b.endDate);
      return dateToTs(a.startDate) - dateToTs(b.startDate);
    });

    return next;
  }, [items, statusFilter, typeFilter, searchQuery, scopeFilter, sortBy, todayTs]);

  const stats = useMemo(
    () => ({
      total: items.length,
      active: items.filter(item => item.status === 'in-progress').length,
      overdue: items.filter(item => parseScope(item, todayTs).isOverdue).length,
      completed: items.filter(item => item.status === 'completed').length
    }),
    [items, todayTs]
  );

  const timelineRange = useMemo(() => {
    if (visibleItems.length === 0) {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const end = new Date();
      end.setDate(end.getDate() + 150);
      return {
        startTs: start.getTime(),
        endTs: end.getTime(),
        span: Math.max(1, end.getTime() - start.getTime())
      };
    }

    const timestamps = visibleItems.flatMap(item => [
      dateToTs(item.startDate),
      dateToTs(item.type === 'milestone' ? item.startDate : item.endDate)
    ]);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const buffer = 1000 * 60 * 60 * 24 * 20;
    const startTs = minTs - buffer;
    const endTs = maxTs + buffer;
    return { startTs, endTs, span: Math.max(1, endTs - startTs) };
  }, [visibleItems]);

  const monthMarkers = useMemo(() => {
    const markers: Array<{ label: string; left: number }> = [];
    const cursor = new Date(timelineRange.startTs);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= timelineRange.endTs + 1000 * 60 * 60 * 24 * 32) {
      const left = ((cursor.getTime() - timelineRange.startTs) / timelineRange.span) * 100;
      markers.push({
        label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        left
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return markers;
  }, [timelineRange]);

  const todayLeft = Math.min(100, Math.max(0, ((Date.now() - timelineRange.startTs) / timelineRange.span) * 100));

  const getTimelinePosition = (item: RoadmapItem) => {
    const start = dateToTs(item.startDate);
    const end = dateToTs(item.type === 'milestone' ? item.startDate : item.endDate);
    const left = ((start - timelineRange.startTs) / timelineRange.span) * 100;
    const width = item.type === 'milestone' ? 0.9 : Math.max(((end - start) / timelineRange.span) * 100, 1.5);
    return { left, width };
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-sm px-6 py-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h3 className="text-zinc-100 font-semibold">{fileName}</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs">
              {saveStatus === 'saving' && (
                <span className="text-zinc-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-zinc-500 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              {saveStatus === 'unsaved' && (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Unsaved
                </span>
              )}
            </div>
            <button onClick={() => openCreate('phase')} className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Phase
            </button>
            <button
              onClick={() => openCreate('milestone')}
              className="px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium flex items-center gap-2 border border-zinc-700"
            >
              <Flag className="w-4 h-4" />
              New Milestone
            </button>
            <button onClick={handleManualSave} className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64 max-w-full">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title or description..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'All' | RoadmapStatus)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
            >
              <option value="All">All</option>
              {STATUS_ORDER.map(status => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <span>Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'All' | RoadmapItemType)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
            >
              <option value="All">All</option>
              {TYPE_OPTIONS.map(type => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <Clock3 className="w-3.5 h-3.5 text-zinc-500" />
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as ScopeFilter)} className="bg-transparent text-xs text-zinc-200 focus:outline-none">
              <option value="all">All Scope</option>
              <option value="active">Active Now</option>
              <option value="next90">Next 90 Days</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300">
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} className="bg-transparent text-xs text-zinc-200 focus:outline-none">
              <option value="start">Start Date</option>
              <option value="end">End Date</option>
              <option value="title">Title</option>
              <option value="progress">Progress</option>
            </select>
          </div>

          <span className="px-3 py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-xs font-medium">
            Calendar View
          </span>

          <button onClick={resetFilters} className="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-xs text-zinc-300 hover:text-white flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Total {stats.total}</span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Active {stats.active}</span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Overdue {stats.overdue}</span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Done {stats.completed}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4">
        <div className="min-w-[1050px] border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
          <div className="border-b border-zinc-800 bg-zinc-900 sticky top-0 z-10">
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">Roadmap Calendar</div>
            <div className="relative px-2 py-3 min-h-[40px]">
              {monthMarkers.map(marker => (
                <div key={`${marker.label}-${marker.left}`} className="absolute top-0 bottom-0 text-[10px] text-zinc-500 border-l border-zinc-800/60 pl-1 pt-3" style={{ left: `${marker.left}%` }}>
                  {marker.label}
                </div>
              ))}
            </div>
          </div>

          {visibleItems.length === 0 && <div className="p-10 text-center text-sm text-zinc-500">No roadmap items match your current filters.</div>}

          {visibleItems.map(item => {
            const meta = STATUS_META[item.status];
            const position = getTimelinePosition(item);
            const colors = getItemColors(item.id);
            const isSelected = selectedId === item.id;
            const overview = (item.description || 'No description provided.').trim();
            const overviewText = overview.length > 180 ? `${overview.slice(0, 180)}...` : overview;

            return (
              <div
                key={item.id}
                className={`relative h-14 border-b border-zinc-900/80 transition-colors ${isSelected ? 'bg-zinc-900/70' : 'hover:bg-zinc-900/40'}`}
              >
                {monthMarkers.map(marker => (
                  <div key={`${item.id}-line-${marker.label}-${marker.left}`} className="absolute top-0 bottom-0 border-l border-zinc-900/80 pointer-events-none" style={{ left: `${marker.left}%` }} />
                ))}
                <div className="absolute top-0 bottom-0 border-l border-red-500/50 pointer-events-none" style={{ left: `${todayLeft}%` }} />

                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded text-zinc-500 hover:text-blue-300 hover:bg-zinc-800" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {item.type === 'milestone' ? (
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group z-10" style={{ left: `${position.left}%` }}>
                    <button
                      onClick={() => {
                        setSelectedId(item.id);
                        openEdit(item);
                      }}
                      className="block w-4 h-4 rotate-45 rounded-sm border shadow-md"
                      style={{ backgroundColor: colors.solid, borderColor: colors.border }}
                      title={item.title}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-100 bg-zinc-900/85 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                      {item.title}
                    </span>
                    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 w-64 rounded-md border border-zinc-700 bg-black/95 px-3 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                      <p className="text-xs font-semibold text-white mb-1">{item.title}</p>
                      <p className="text-[11px] text-zinc-300 mb-1">{meta.label} • {typeLabel(item.type)}</p>
                      <p className="text-[11px] text-zinc-400 mb-1">{new Date(item.startDate).toLocaleDateString()}</p>
                      <p className="text-[11px] text-zinc-500 break-words">{overviewText}</p>
                    </div>
                  </div>
                ) : (
                  <div className="absolute top-1/2 -translate-y-1/2 group z-10" style={{ left: `${position.left}%`, width: `${position.width}%`, maxWidth: 'calc(100% - 70px)' }}>
                    <button
                      onClick={() => {
                        setSelectedId(item.id);
                        openEdit(item);
                      }}
                      className="h-6 w-full rounded border shadow-sm hover:brightness-110 transition flex items-center justify-between px-2"
                      style={{ backgroundColor: colors.soft, borderColor: colors.border }}
                      title={`${item.title} (${item.progress}%)`}
                    >
                      <span className="text-xs text-zinc-100 truncate">{item.title}</span>
                      <span className="text-[10px] text-zinc-200 ml-2 shrink-0">{item.progress}%</span>
                    </button>
                    <div
                      className="absolute inset-0 rounded pointer-events-none"
                      style={{
                        background: `linear-gradient(to right, ${colors.solid} ${item.progress}%, transparent ${item.progress}%)`
                      }}
                    />
                    <div className="absolute left-0 top-full mt-2 w-72 rounded-md border border-zinc-700 bg-black/95 px-3 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                      <p className="text-xs font-semibold text-white mb-1">{item.title}</p>
                      <p className="text-[11px] text-zinc-300 mb-1">{meta.label} • {typeLabel(item.type)} • {item.progress}%</p>
                      <p className="text-[11px] text-zinc-400 mb-1">
                        {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}
                      </p>
                      <p className="text-[11px] text-zinc-500 break-words">{overviewText}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-5">{editingId ? 'Edit Roadmap Item' : 'Create Roadmap Item'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Title</label>
                <input
                  autoFocus
                  type="text"
                  value={formData.title}
                  onChange={(event) => setFormData(prev => ({ ...prev, title: event.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-white focus:border-cyan-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(event) => {
                      const nextType = event.target.value as RoadmapItemType;
                      setFormData(prev => ({
                        ...prev,
                        type: nextType,
                        endDate: nextType === 'milestone' ? prev.startDate : prev.endDate
                      }));
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-white focus:border-cyan-500 outline-none"
                  >
                    {TYPE_OPTIONS.map(type => (
                      <option key={type} value={type}>
                        {typeLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(event) => setFormData(prev => ({ ...prev, status: event.target.value as RoadmapStatus }))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-white focus:border-cyan-500 outline-none"
                  >
                    {STATUS_ORDER.map(status => (
                      <option key={status} value={status}>
                        {STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Progress ({formData.progress}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={formData.type === 'milestone' ? (formData.status === 'completed' ? 100 : 0) : formData.progress}
                    onChange={(event) => setFormData(prev => ({ ...prev, progress: clampProgress(Number(event.target.value)) }))}
                    disabled={formData.type === 'milestone'}
                    className="w-full accent-cyan-500 disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">{formData.type === 'milestone' ? 'Date' : 'Start Date'}</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(event) =>
                      setFormData(prev => ({
                        ...prev,
                        startDate: event.target.value,
                        endDate: prev.type === 'milestone' ? event.target.value : prev.endDate
                      }))
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-white focus:border-cyan-500 outline-none [color-scheme:dark]"
                    required
                  />
                </div>
                {formData.type === 'phase' && (
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(event) => setFormData(prev => ({ ...prev, endDate: event.target.value }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-white focus:border-cyan-500 outline-none [color-scheme:dark]"
                      required
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm text-zinc-400">Description</label>
                  <div className="relative" ref={linkPickerRef}>
                    <button
                      type="button"
                      onClick={toggleLinkPicker}
                      disabled={linkableFiles.length === 0}
                      className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-zinc-600 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <LinkIcon className="w-3 h-3" />
                      Link File
                    </button>
                    {linkPickerOpen && (
                      <div className="absolute right-0 top-5 z-30 w-72 rounded-md border border-zinc-700 bg-zinc-900 p-2 shadow-lg">
                        <input
                          type="text"
                          value={linkPickerQuery}
                          onChange={(event) => setLinkPickerQuery(event.target.value)}
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
                  onChange={(event) => setFormData(prev => ({ ...prev, description: event.target.value }))}
                  onDragOver={handleDescriptionDragOver}
                  onDrop={handleDescriptionDrop}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-white focus:border-cyan-500 outline-none min-h-[110px]"
                  placeholder="Context, risks, dependencies, linked docs..."
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-zinc-800">
                {editingId && (
                  <button type="button" onClick={() => handleDelete(editingId)} className="px-4 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 text-sm font-medium">
                    Delete
                  </button>
                )}
                <div className="flex-1" />
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium">
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
