import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Calendar, Check, Filter, Flag, Loader2, Pencil, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import { EditorProps, RoadmapItem, RoadmapItemType, RoadmapStatus } from '../types';

const ROADMAP_STATUS_OPTIONS: RoadmapStatus[] = ['planned', 'in-progress', 'completed', 'delayed', 'dropped'];
const ROADMAP_TYPE_OPTIONS: RoadmapItemType[] = ['phase', 'milestone'];
const DAY_MS = 1000 * 60 * 60 * 24;

type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface FormState {
  title: string;
  type: RoadmapItemType;
  status: RoadmapStatus;
  startDate: string;
  endDate: string;
  progress: number;
  description: string;
}

const STATUS_META: Record<RoadmapStatus, { label: string; badge: string }> = {
  planned: { label: 'Planned', badge: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  'in-progress': { label: 'In Progress', badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  completed: { label: 'Completed', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  delayed: { label: 'Delayed', badge: 'bg-red-500/15 text-red-300 border-red-500/40' },
  dropped: { label: 'Dropped', badge: 'bg-zinc-700/80 text-zinc-300 border-zinc-600' }
};

const todayIso = () => new Date().toISOString().split('T')[0];

const dateToTs = (date: string) => {
  const ts = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(ts) ? ts : Date.now();
};

const startOfWeekTs = (ts: number) => {
  const date = new Date(ts);
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const defaultForm = (type: RoadmapItemType = 'phase'): FormState => {
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
      const type: RoadmapItemType = item.type === 'milestone' ? 'milestone' : 'phase';
      const endDate =
        type === 'milestone'
          ? startDate
          : typeof item.endDate === 'string' && item.endDate
            ? item.endDate
            : startDate;
      const status: RoadmapStatus = ROADMAP_STATUS_OPTIONS.includes(item.status) ? item.status : 'planned';
      const progress = type === 'milestone' ? (status === 'completed' ? 100 : 0) : clampProgress(Number(item.progress) || 0);
      return {
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        title: item.title.trim() || 'Untitled Item',
        startDate,
        endDate,
        type,
        status,
        progress,
        description: typeof item.description === 'string' ? item.description : ''
      };
    });
};

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
    border: `hsla(${hue}, 72%, 52%, 0.58)`
  };
};

const trimOverview = (text: string) => {
  const safe = (text || 'No description provided.').trim();
  return safe.length > 180 ? `${safe.slice(0, 180)}...` : safe;
};

const formatDisplayDate = (date: string) => new Date(dateToTs(date)).toLocaleDateString();

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const getDurationDays = (item: RoadmapItem) => {
  if (item.type === 'milestone') return 1;
  const start = dateToTs(item.startDate);
  const end = dateToTs(item.endDate);
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
};

const RoadmapEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  const initialItemsRef = useRef(normalizeItems(initialContent));
  const [items, setItems] = useState<RoadmapItem[]>(initialItemsRef.current);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const lastSavedRef = useRef(JSON.stringify(initialItemsRef.current));

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RoadmapStatus>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | RoadmapItemType>('All');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormState>(defaultForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const normalized = normalizeItems(initialContent);
    setItems(normalized);
    lastSavedRef.current = JSON.stringify(normalized);
    setSaveStatus('saved');
    setSelectedId(prev => (prev && normalized.some(item => item.id === prev) ? prev : normalized[0]?.id || null));
  }, [initialContent]);

  useEffect(() => {
    const current = JSON.stringify(items);
    if (current === lastSavedRef.current) return;
    setSaveStatus('unsaved');
    const timer = setTimeout(() => saveNow(), 1200);
    return () => clearTimeout(timer);
  }, [items]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items]);

  const saveNow = () => {
    setSaveStatus('saving');
    onSave({ items });
    lastSavedRef.current = JSON.stringify(items);
    setTimeout(() => setSaveStatus('saved'), 300);
  };

  const openCreate = (type: RoadmapItemType = 'phase') => {
    setEditingId(null);
    setFormData(defaultForm(type));
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const safeTitle = formData.title.trim();
    if (!safeTitle) return;

    const safeStart = formData.startDate || todayIso();
    const rawEnd = formData.type === 'milestone' ? safeStart : (formData.endDate || safeStart);
    const safeEnd = dateToTs(rawEnd) < dateToTs(safeStart) ? safeStart : rawEnd;

    const next: RoadmapItem = {
      id: editingId || crypto.randomUUID(),
      title: safeTitle,
      type: formData.type,
      status: formData.status,
      startDate: safeStart,
      endDate: formData.type === 'milestone' ? safeStart : safeEnd,
      progress: formData.type === 'milestone' ? (formData.status === 'completed' ? 100 : 0) : clampProgress(formData.progress),
      description: formData.description.trim()
    };

    setItems(prev => {
      if (prev.some(item => item.id === next.id)) {
        return prev.map(item => (item.id === next.id ? next : item));
      }
      return [...prev, next];
    });

    setSelectedId(next.id);
    closeModal();
  };

  const visibleItems = useMemo(() => {
    return [...items]
      .filter(item => {
        if (statusFilter !== 'All' && item.status !== statusFilter) return false;
        if (typeFilter !== 'All' && item.type !== typeFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const text = `${item.title} ${item.description || ''}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => dateToTs(a.startDate) - dateToTs(b.startDate));
  }, [items, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(
    () => ({
      total: items.length,
      active: items.filter(item => item.status === 'in-progress').length,
      delayed: items.filter(item => item.status === 'delayed').length,
      done: items.filter(item => item.status === 'completed').length
    }),
    [items]
  );

  const timelineRange = useMemo(() => {
    if (visibleItems.length === 0) {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const end = new Date();
      end.setDate(end.getDate() + 150);
      return { startTs: start.getTime(), endTs: end.getTime(), span: Math.max(1, end.getTime() - start.getTime()) };
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

  const weekMarkers = useMemo(() => {
    const markers: Array<{ label: string; left: number; weekOfYear: number }> = [];
    let cursorTs = startOfWeekTs(timelineRange.startTs);
    while (cursorTs <= timelineRange.endTs + DAY_MS * 7) {
      const left = ((cursorTs - timelineRange.startTs) / timelineRange.span) * 100;
      const date = new Date(cursorTs);
      const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
      const dayOffset = Math.floor((cursorTs - firstDayOfYear.getTime()) / DAY_MS);
      const weekOfYear = Math.floor((dayOffset + firstDayOfYear.getDay() + 6) / 7) + 1;
      markers.push({ label: `W${weekOfYear}`, left, weekOfYear });
      cursorTs += DAY_MS * 7;
    }
    return markers;
  }, [timelineRange]);

  const weekSegments = useMemo(() => {
    return weekMarkers.map((marker, index) => {
      const next = weekMarkers[index + 1];
      const start = clampPercent(marker.left);
      const end = next ? clampPercent(next.left) : 100;
      const width = Math.max(0, end - start);
      return { ...marker, left: start, width };
    });
  }, [weekMarkers]);

  const todayLeft = Math.min(100, Math.max(0, ((Date.now() - timelineRange.startTs) / timelineRange.span) * 100));

  const getPosition = (item: RoadmapItem) => {
    const start = dateToTs(item.startDate);
    const endTsInclusive = item.type === 'milestone' ? start : dateToTs(item.endDate) + DAY_MS;
    const left = clampPercent(((start - timelineRange.startTs) / timelineRange.span) * 100);
    const right = clampPercent(((endTsInclusive - timelineRange.startTs) / timelineRange.span) * 100);
    const width = item.type === 'milestone' ? 1.1 : Math.max(right - left, 1.8);
    return { left, width };
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setTypeFilter('All');
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
            <button onClick={saveNow} className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-2">
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
              {ROADMAP_STATUS_OPTIONS.map(status => (
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
              {ROADMAP_TYPE_OPTIONS.map(type => (
                <option key={type} value={type}>
                  {type === 'phase' ? 'Phase' : 'Milestone'}
                </option>
              ))}
            </select>
          </div>

          <span className="px-3 py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-xs font-medium">Single Calendar</span>

          <button onClick={resetFilters} className="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-xs text-zinc-300 hover:text-white flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Total {stats.total}</span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Active {stats.active}</span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Delayed {stats.delayed}</span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">Done {stats.done}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar px-4 pt-4 pb-0">
        <div className="min-w-[1220px] h-full min-h-full border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
          <div className="grid grid-cols-[minmax(360px,42%)_1fr] sticky top-0 z-20 border-b border-zinc-800 bg-zinc-900 shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
            <div className="border-r border-zinc-800">
              <div className="h-8 px-3 flex items-center justify-between text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                <span>Roadmap Items</span>
                <span>{visibleItems.length}</span>
              </div>
              <div className="px-3 py-2 text-[11px] text-zinc-500">Left list stays intact. Timeline renders on the right pane.</div>
            </div>

            <div>
              <div className="h-8 px-3 flex items-center justify-between text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                <span>Gantt Timeline</span>
                <span>{formatDisplayDate(new Date().toISOString().split('T')[0])}</span>
              </div>
              <div className="relative h-9 border-b border-zinc-800 bg-zinc-900">
                {monthMarkers.map((marker, idx) => (
                  <div
                    key={`month-${marker.label}-${idx}`}
                    className="absolute top-0 bottom-0 border-l border-zinc-700/70 pl-1.5 pt-1 text-[10px] text-zinc-300"
                    style={{ left: `${clampPercent(marker.left)}%` }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>
              <div className="relative h-8 bg-zinc-900/75">
                {weekSegments.map((segment, idx) => (
                  <div
                    key={`week-${segment.weekOfYear}-${idx}`}
                    className={`absolute top-0 bottom-0 border-l border-zinc-800/90 pt-1 text-[10px] text-center ${idx % 2 === 0 ? 'bg-zinc-900/25 text-zinc-600' : 'bg-zinc-800/20 text-zinc-500'}`}
                    style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                  >
                    {segment.label}
                  </div>
                ))}
                <div className="absolute top-0 bottom-0 border-l border-red-500/75 pointer-events-none z-10" style={{ left: `${todayLeft}%` }} />
                <div className="absolute right-2 top-1 rounded-sm border border-red-400/50 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-200">Today</div>
              </div>
            </div>
          </div>

          {visibleItems.length === 0 && <div className="p-10 text-center text-sm text-zinc-500">No roadmap items match your current filters.</div>}

          {visibleItems.map((item, index) => {
            const meta = STATUS_META[item.status];
            const position = getPosition(item);
            const colors = getItemColors(item.id);
            const isSelected = selectedId === item.id;
            const overview = trimOverview(item.description || '');
            const endDateText = item.type === 'milestone' ? item.startDate : item.endDate;
            const duration = getDurationDays(item);
            const shortDescription = (item.description || '').trim();

            return (
              <div key={item.id} className={`group grid grid-cols-[minmax(360px,42%)_1fr] border-b border-zinc-900/80 ${isSelected ? 'bg-zinc-900/65' : index % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-950/72'}`}>
                <div className="relative border-r border-zinc-900 h-20">
                  <button onClick={() => setSelectedId(item.id)} className="w-full h-full px-3 text-left hover:bg-zinc-900/45 transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.type === 'milestone' ? <Flag className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      <span className="truncate text-sm text-zinc-100">{item.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${meta.badge}`}>{meta.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500 truncate">
                      {formatDisplayDate(item.startDate)} - {formatDisplayDate(endDateText)} • {duration} day{duration === 1 ? '' : 's'} • {item.progress}%
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600 truncate">{shortDescription || 'No description provided.'}</p>
                  </button>

                  <div className="absolute right-2 top-2 z-30 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded text-zinc-300 bg-zinc-900/90 border border-zinc-700 hover:text-blue-300 hover:border-blue-500/50" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded text-zinc-300 bg-zinc-900/90 border border-zinc-700 hover:text-red-400 hover:border-red-500/50" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="relative h-20 overflow-visible pr-16">
                  {weekSegments.map((segment, idx) => (
                    <div
                      key={`${item.id}-grid-${segment.weekOfYear}-${idx}`}
                      className={`absolute top-0 bottom-0 border-l border-zinc-900/80 pointer-events-none ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}
                      style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                    />
                  ))}
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-zinc-800/75 pointer-events-none" />
                  <div className="absolute top-0 bottom-0 border-l border-red-500/60 pointer-events-none z-10" style={{ left: `${todayLeft}%` }} />

                  {item.type === 'milestone' ? (
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group z-20" style={{ left: `${position.left}%` }}>
                      <button
                        onClick={() => {
                          setSelectedId(item.id);
                          openEdit(item);
                        }}
                        className="block w-5 h-5 rotate-45 rounded-sm border shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                        style={{ backgroundColor: colors.solid, borderColor: colors.border }}
                        title={item.title}
                      />
                      <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 w-64 rounded-md border border-zinc-700 bg-black/95 px-3 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                        <p className="text-xs font-semibold text-white mb-1">{item.title}</p>
                        <p className="text-[11px] text-zinc-300 mb-1">{meta.label} • Milestone</p>
                        <p className="text-[11px] text-zinc-400 mb-1">{formatDisplayDate(item.startDate)}</p>
                        <p className="text-[11px] text-zinc-500 break-words">{overview}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute top-1/2 -translate-y-1/2 group z-20" style={{ left: `${position.left}%`, width: `${position.width}%`, maxWidth: 'calc(100% - 92px)' }}>
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: colors.solid, borderColor: colors.border }} />
                      <button
                        onClick={() => {
                          setSelectedId(item.id);
                          openEdit(item);
                        }}
                        className="relative h-8 w-full rounded-md border shadow-sm hover:brightness-110 transition flex items-center px-2 overflow-hidden"
                        style={{ backgroundColor: colors.soft, borderColor: colors.border }}
                        title={`${item.title} (${item.progress}%)`}
                      >
                        <span
                          className="absolute left-0 top-0 bottom-0"
                          style={{
                            width: `${item.progress}%`,
                            backgroundColor: colors.solid,
                            opacity: item.status === 'delayed' ? 0.75 : 0.95
                          }}
                        />
                        <span className="relative text-xs text-zinc-100 truncate flex-1">{item.title}</span>
                        <span className="relative text-[10px] text-zinc-200 ml-2 shrink-0">{item.progress}%</span>
                      </button>
                      <div className="absolute -right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: colors.solid, borderColor: colors.border }} />
                      <div className="absolute left-0 top-full mt-2 w-72 rounded-md border border-zinc-700 bg-black/95 px-3 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                        <p className="text-xs font-semibold text-white mb-1">{item.title}</p>
                        <p className="text-[11px] text-zinc-300 mb-1">{meta.label} • Phase • {item.progress}% • {duration} days</p>
                        <p className="text-[11px] text-zinc-400 mb-1">
                          {formatDisplayDate(item.startDate)} - {formatDisplayDate(item.endDate)}
                        </p>
                        <p className="text-[11px] text-zinc-500 break-words">{overview}</p>
                      </div>
                    </div>
                  )}
                </div>
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
                    {ROADMAP_TYPE_OPTIONS.map(type => (
                      <option key={type} value={type}>
                        {type === 'phase' ? 'Phase' : 'Milestone'}
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
                    {ROADMAP_STATUS_OPTIONS.map(status => (
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
                <label className="block text-sm text-zinc-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(event) => setFormData(prev => ({ ...prev, description: event.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-white focus:border-cyan-500 outline-none min-h-[110px]"
                  placeholder="Context, risks, dependencies..."
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
