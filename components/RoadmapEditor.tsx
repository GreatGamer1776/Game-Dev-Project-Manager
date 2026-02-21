import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Calendar, Check, ChevronLeft, ChevronRight, Filter, Flag, Loader2, Pencil, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
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

interface CalendarDayCell {
  ts: number;
  iso: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

interface CalendarWeekSegment {
  item: RoadmapItem;
  startCol: number;
  endCol: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
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

const tsToLocalIso = (ts: number) => {
  const date = new Date(ts);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const firstOfMonthTs = (ts: number) => {
  const date = new Date(ts);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const [calendarMonthTs, setCalendarMonthTs] = useState(firstOfMonthTs(Date.now()));

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

  const calendarMonthLabel = useMemo(
    () => new Date(calendarMonthTs).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [calendarMonthTs]
  );

  const calendarDays = useMemo<CalendarDayCell[]>(() => {
    const monthStart = new Date(calendarMonthTs);
    const gridStart = new Date(calendarMonthTs);
    gridStart.setDate(1 - monthStart.getDay());
    gridStart.setHours(0, 0, 0, 0);
    const today = todayIso();

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      day.setHours(0, 0, 0, 0);
      const ts = day.getTime();
      const iso = tsToLocalIso(ts);
      return {
        ts,
        iso,
        dayNumber: day.getDate(),
        isCurrentMonth: day.getMonth() === monthStart.getMonth(),
        isToday: iso === today
      };
    });
  }, [calendarMonthTs]);

  const calendarWeeks = useMemo(() => {
    return Array.from({ length: 6 }, (_, weekIndex) => {
      const days = calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7);
      const weekStartTs = days[0]?.ts ?? calendarMonthTs;
      const weekEndTs = days[6]?.ts ?? weekStartTs;

      const rawSegments: Array<Omit<CalendarWeekSegment, 'lane'>> = [];
      for (const item of visibleItems) {
        const itemStart = dateToTs(item.startDate);
        const itemEnd = item.type === 'milestone' ? itemStart : dateToTs(item.endDate);
        if (itemEnd < weekStartTs || itemStart > weekEndTs) continue;

        const segmentStart = Math.max(itemStart, weekStartTs);
        const segmentEnd = Math.min(itemEnd, weekEndTs);
        const startCol = Math.max(1, Math.min(7, Math.floor((segmentStart - weekStartTs) / DAY_MS) + 1));
        const endCol = Math.max(startCol, Math.min(7, Math.floor((segmentEnd - weekStartTs) / DAY_MS) + 1));

        rawSegments.push({
          item,
          startCol,
          endCol,
          isStart: itemStart >= weekStartTs,
          isEnd: itemEnd <= weekEndTs
        });
      }

      rawSegments.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        const aSpan = a.endCol - a.startCol;
        const bSpan = b.endCol - b.startCol;
        if (aSpan !== bSpan) return bSpan - aSpan;
        return a.item.title.localeCompare(b.item.title);
      });

      const laneEnds: number[] = [];
      const segments: CalendarWeekSegment[] = rawSegments.map(segment => {
        let lane = 0;
        while (lane < laneEnds.length && segment.startCol <= laneEnds[lane]) lane++;
        laneEnds[lane] = segment.endCol;
        return { ...segment, lane };
      });

      return {
        days,
        segments,
        laneCount: laneEnds.length
      };
    });
  }, [calendarDays, visibleItems, calendarMonthTs]);

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonthTs(prev => {
      const date = new Date(prev);
      date.setMonth(date.getMonth() + delta);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    });
  };

  const jumpToCurrentMonth = () => {
    setCalendarMonthTs(firstOfMonthTs(Date.now()));
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

      <div className="flex-1 min-h-0 overflow-hidden px-4 pt-4 pb-0">
        <div className="h-full min-h-0 min-w-[1220px] border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 grid grid-cols-[minmax(360px,40%)_1fr]">
          <section className="min-h-0 border-r border-zinc-800 flex flex-col">
            <div className="h-10 px-3 flex items-center justify-between text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800 bg-zinc-900">
              <span>Roadmap Items</span>
              <span>{visibleItems.length}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-2">
              {visibleItems.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">No roadmap items match your current filters.</div>}

              {visibleItems.map((item, index) => {
                const meta = STATUS_META[item.status];
                const colors = getItemColors(item.id);
                const isSelected = selectedId === item.id;
                const endDateText = item.type === 'milestone' ? item.startDate : item.endDate;
                const duration = getDurationDays(item);
                const shortDescription = (item.description || '').trim();

                return (
                  <div
                    key={item.id}
                    className={`group relative rounded-lg border mb-2 ${isSelected ? 'bg-zinc-900 border-zinc-700' : index % 2 === 0 ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-900/60 border-zinc-800'}`}
                  >
                    <button
                      onClick={() => {
                        setSelectedId(item.id);
                        setCalendarMonthTs(firstOfMonthTs(dateToTs(item.startDate)));
                      }}
                      className="w-full px-3 py-2.5 text-left hover:bg-zinc-900/60 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.type === 'milestone' ? <Flag className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        <span className="truncate text-sm text-zinc-100">{item.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${meta.badge}`}>{meta.label}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colors.solid }} />
                        <span className="truncate">{formatDisplayDate(item.startDate)} - {formatDisplayDate(endDateText)} • {duration} day{duration === 1 ? '' : 's'} • {item.progress}%</span>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-600 truncate">{shortDescription || 'No description provided.'}</p>
                    </button>

                    <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded text-zinc-300 bg-zinc-900/90 border border-zinc-700 hover:text-blue-300 hover:border-blue-500/50" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded text-zinc-300 bg-zinc-900/90 border border-zinc-700 hover:text-red-400 hover:border-red-500/50" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="min-h-0 flex flex-col">
            <div className="shrink-0 border-b border-zinc-800 bg-zinc-900">
              <div className="h-10 px-3 flex items-center justify-between border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <button onClick={() => shiftCalendarMonth(-1)} className="p-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800" title="Previous Month">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={jumpToCurrentMonth} className="px-2.5 py-1.5 rounded border border-zinc-700 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800">
                    Today
                  </button>
                  <button onClick={() => shiftCalendarMonth(1)} className="p-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800" title="Next Month">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm font-semibold text-zinc-100">{calendarMonthLabel}</div>
                <div className="text-[11px] text-zinc-500">Single Calendar</div>
              </div>

              <div className="grid grid-cols-7">
                {DAY_LABELS.map(label => (
                  <div key={label} className="h-8 border-r border-zinc-800 last:border-r-0 flex items-center justify-center text-[11px] uppercase tracking-wide text-zinc-500">
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 p-2">
              <div className="h-full min-h-[580px] border border-zinc-800 rounded-lg overflow-auto custom-scrollbar">
                {calendarWeeks.map((week, weekIndex) => {
                  const laneHeight = 24;
                  const laneOffset = 24;
                  const weekHeight = Math.max(92, laneOffset + Math.max(1, week.laneCount) * laneHeight + 8);

                  return (
                    <div key={`week-${weekIndex}`} className="relative border-b border-zinc-800 last:border-b-0" style={{ height: `${weekHeight}px` }}>
                      <div className="absolute inset-0 grid grid-cols-7">
                        {week.days.map((day, dayIndex) => (
                          <div
                            key={day.iso}
                            className={`relative p-1.5 ${dayIndex < 6 ? 'border-r border-zinc-800' : ''} ${day.isCurrentMonth ? 'bg-zinc-950' : 'bg-zinc-900/55'} ${day.isToday ? 'ring-1 ring-inset ring-cyan-500/50' : ''}`}
                          >
                            <div className={`text-[11px] font-medium ${day.isToday ? 'text-cyan-300' : day.isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'}`}>
                              {day.dayNumber}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="absolute left-0 right-0 top-6 bottom-1">
                        {week.segments.map(segment => {
                          const { item } = segment;
                          const colors = getItemColors(item.id);
                          const meta = STATUS_META[item.status];
                          const overview = trimOverview(item.description || '');
                          const left = ((segment.startCol - 1) / 7) * 100;
                          const width = ((segment.endCol - segment.startCol + 1) / 7) * 100;
                          const top = segment.lane * laneHeight;
                          const isSelected = selectedId === item.id;

                          return (
                            <div key={`${weekIndex}-${item.id}-${segment.lane}-${segment.startCol}-${segment.endCol}`} className="absolute px-0.5" style={{ left: `${left}%`, width: `${width}%`, top: `${top}px` }}>
                              <div className="group relative">
                                <button
                                  onClick={() => {
                                    setSelectedId(item.id);
                                    openEdit(item);
                                  }}
                                  className={`h-5 w-full border text-left text-[10px] text-zinc-100 px-1 flex items-center gap-1 hover:brightness-110 ${segment.isStart ? 'rounded-l-md' : 'rounded-l-sm'} ${segment.isEnd ? 'rounded-r-md' : 'rounded-r-sm'} ${isSelected ? 'ring-1 ring-cyan-400/60' : ''}`}
                                  style={{ backgroundColor: colors.soft, borderColor: colors.border }}
                                  title={item.title}
                                >
                                  {!segment.isStart && <span className="text-[9px] text-zinc-300/80">...</span>}
                                  <span className="truncate flex-1">{item.title}</span>
                                  {item.type === 'milestone' && <span className="text-[9px] text-amber-300">M</span>}
                                  {!segment.isEnd && <span className="text-[9px] text-zinc-300/80">...</span>}
                                </button>
                                <div className="absolute left-0 top-full mt-1 w-64 rounded-md border border-zinc-700 bg-black/95 px-2.5 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                                  <p className="text-xs font-semibold text-white mb-1">{item.title}</p>
                                  <p className="text-[11px] text-zinc-300 mb-1">{meta.label} • {item.type === 'milestone' ? 'Milestone' : 'Phase'}</p>
                                  <p className="text-[11px] text-zinc-400 mb-1">
                                    {formatDisplayDate(item.startDate)} - {formatDisplayDate(item.type === 'milestone' ? item.startDate : item.endDate)}
                                  </p>
                                  <p className="text-[11px] text-zinc-500 break-words">{overview}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
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
