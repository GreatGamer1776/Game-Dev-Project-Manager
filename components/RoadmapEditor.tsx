import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Filter, Flag, Pencil, Plus, RotateCcw, Save, Search, Trash2, Undo2, Redo2 } from 'lucide-react';
import { EditorProps, RoadmapItem, RoadmapItemType, RoadmapStatus } from '../types';
import { SaveIndicator } from './ui/SaveIndicator';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { confirmDialog } from '../stores/useUiStore';
import { uid } from '../utils/id';

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
  planned: { label: 'Planned', badge: 'bg-surface-raised text-content border-border-strong' },
  'in-progress': { label: 'In Progress', badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  completed: { label: 'Completed', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  delayed: { label: 'Delayed', badge: 'bg-red-500/15 text-red-300 border-red-500/40' },
  dropped: { label: 'Dropped', badge: 'bg-surface-raised/80 text-content border-border-strong' }
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
        id: typeof item.id === 'string' ? item.id : uid(),
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
  const undoRedo = useUndoRedo<RoadmapItem[]>(initialItemsRef.current);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const lastSavedRef = useRef(JSON.stringify(initialItemsRef.current));
  const latestItemsRef = useRef<RoadmapItem[]>(initialItemsRef.current);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RoadmapStatus>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | RoadmapItemType>('All');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormState>(defaultForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calendarMonthTs, setCalendarMonthTs] = useState(firstOfMonthTs(Date.now()));

  const clearSaveStatusTimer = () => {
    if (saveStatusTimerRef.current) {
      clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = null;
    }
  };

  const persistItems = (nextItems: RoadmapItem[]) => {
    onSave({ items: nextItems });
    lastSavedRef.current = JSON.stringify(nextItems);
    latestItemsRef.current = nextItems;
  };

  const flushPendingSave = () => {
    const nextItems = latestItemsRef.current;
    if (JSON.stringify(nextItems) === lastSavedRef.current) return;
    persistItems(nextItems);
  };

  useEffect(() => {
    const normalized = normalizeItems(initialContent);
    setItems(normalized);
    undoRedo.reset(normalized);
    lastSavedRef.current = JSON.stringify(normalized);
    latestItemsRef.current = normalized;
    clearSaveStatusTimer();
    setSaveStatus('saved');
    setSelectedId(prev => (prev && normalized.some(item => item.id === prev) ? prev : normalized[0]?.id || null));
  }, [initialContent]);

  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const current = JSON.stringify(items);
    if (current === lastSavedRef.current) return;
    setSaveStatus('unsaved');
    const timer = setTimeout(() => saveNow(), 1200);
    return () => clearTimeout(timer);
  }, [items]);

  useEffect(() => {
    return () => {
      clearSaveStatusTimer();
      flushPendingSave();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNow();
      }
      if (isModalOpen) {
        if (event.key === 'Escape') closeModal();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || target.closest('[role="dialog"]'))) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const selected = items.find(item => item.id === selectedId);
        const key = event.key.toLowerCase();
        if (key === 'n') { event.preventDefault(); openCreate('phase'); return; }
        if (key === 'm') { event.preventDefault(); openCreate('milestone'); return; }
        if (selected && event.key === 'Enter') { event.preventDefault(); openEdit(selected); return; }
        if (selected && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); void handleDelete(selected.id); return; }
        if (selected && event.key === 'Escape') { setSelectedId(null); return; }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        const prev = undoRedo.undo();
        if (prev !== undefined) setItems(prev);
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        const next = undoRedo.redo();
        if (next !== undefined) setItems(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, undoRedo, isModalOpen, selectedId]);

  // Push to undo stack when items change
  const lastUndoPushRef = useRef(JSON.stringify(items));
  useEffect(() => {
    const serialized = JSON.stringify(items);
    if (serialized === lastUndoPushRef.current) return;
    lastUndoPushRef.current = serialized;
    undoRedo.pushState(items);
  }, [items, undoRedo]);

  const saveNow = () => {
    clearSaveStatusTimer();
    setSaveStatus('saving');
    persistItems(latestItemsRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('saved'), 300);
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

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Delete this roadmap item?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
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
      id: editingId || uid(),
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

  const filtersActive = Boolean(searchQuery.trim()) || statusFilter !== 'All' || typeFilter !== 'All';

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setTypeFilter('All');
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-bg px-3 [scrollbar-width:thin]">
        <button onClick={() => { const prev = undoRedo.undo(); if (prev !== undefined) setItems(prev); }} disabled={!undoRedo.canUndo} className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="w-4 h-4" /></button>
        <button onClick={() => { const next = undoRedo.redo(); if (next !== undefined) setItems(next); }} disabled={!undoRedo.canRedo} className="icon-btn" title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 className="w-4 h-4" /></button>
        <span className="mx-1 h-4 w-px shrink-0 bg-border" />
        <button onClick={() => openCreate('phase')} className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-content hover:bg-accent-hover" title="New phase — a stretch of time like Alpha or Beta (N)">
          <Plus className="w-3.5 h-3.5" /> Phase
        </button>
        <button onClick={() => openCreate('milestone')} className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-content" title="New milestone — a single date like Launch (M)">
          <Flag className="w-3.5 h-3.5" /> Milestone
        </button>
        <div className="relative ml-2 w-44 shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filter items…"
            aria-label="Filter roadmap items"
            className="h-7 w-full rounded-md border border-border bg-surface-raised pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'All' | RoadmapStatus)}
          aria-label="Filter by status"
          title="Filter by status"
          className={`h-7 shrink-0 rounded-md border bg-surface-raised px-1.5 text-[12px] outline-none focus:border-accent ${statusFilter === 'All' ? 'border-border text-muted' : 'border-accent/60 text-content'}`}
        >
          <option value="All">All statuses</option>
          {ROADMAP_STATUS_OPTIONS.map(status => (
            <option key={status} value={status}>{STATUS_META[status].label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as 'All' | RoadmapItemType)}
          aria-label="Filter by type"
          title="Filter by type"
          className={`h-7 shrink-0 rounded-md border bg-surface-raised px-1.5 text-[12px] outline-none focus:border-accent ${typeFilter === 'All' ? 'border-border text-muted' : 'border-accent/60 text-content'}`}
        >
          <option value="All">All types</option>
          {ROADMAP_TYPE_OPTIONS.map(type => (
            <option key={type} value={type}>{type === 'phase' ? 'Phases' : 'Milestones'}</option>
          ))}
        </select>
        {filtersActive && (
          <button onClick={resetFilters} className="icon-btn" title="Clear filters" aria-label="Clear filters">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="ml-auto shrink-0 pl-3" />
        <SaveIndicator status={saveStatus} onSaveNow={saveNow} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        <div className="h-full min-h-0 min-w-[640px] border border-border rounded-xl overflow-hidden bg-bg grid grid-cols-[minmax(240px,34%)_1fr]">
          <section className="min-h-0 border-r border-border flex flex-col">
            <div className="h-10 px-3 flex items-center justify-between gap-2 text-[11px] text-faint border-b border-border bg-surface">
              <span className="uppercase tracking-wide">Items</span>
              <span className="truncate tabular-nums" title={`${stats.total} total · ${stats.active} in progress · ${stats.delayed} delayed · ${stats.done} done`}>
                {visibleItems.length === stats.total ? stats.total : `${visibleItems.length} of ${stats.total}`}
                {stats.active > 0 && ` · ${stats.active} active`}
                {stats.delayed > 0 && <span className="text-warning"> · {stats.delayed} delayed</span>}
                {stats.done > 0 && ` · ${stats.done} done`}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-2">
              {items.length === 0 && (
                <div className="m-2 rounded-lg border border-border bg-surface px-4 py-3 text-[12px] leading-relaxed text-muted">
                  <div className="mb-1 text-[13px] font-medium text-content">Plan your roadmap</div>
                  Add <b className="text-content">phases</b> for stretches of work (Prototype, Alpha, Beta) and <b className="text-content">milestones</b> for single dates (Demo day, Launch). They show up on the calendar on the right.
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => openCreate('phase')} className="rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-accent-content hover:bg-accent-hover">Add a phase</button>
                    <button type="button" onClick={() => openCreate('milestone')} className="rounded-md px-2 py-1 text-[12px] text-muted ring-1 ring-border hover:bg-surface-hover">Add a milestone</button>
                  </div>
                </div>
              )}
              {items.length > 0 && visibleItems.length === 0 && (
                <div className="p-6 text-center text-[12px] text-faint">
                  No items match these filters.
                  <button type="button" onClick={resetFilters} className="ml-1 text-accent hover:underline">Clear filters</button>
                </div>
              )}

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
                    className={`group relative rounded-lg border mb-2 ${isSelected ? 'bg-surface border-border-strong' : index % 2 === 0 ? 'bg-bg border-border' : 'bg-surface/60 border-border'}`}
                  >
                    <button
                      onClick={() => {
                        setSelectedId(item.id);
                        setCalendarMonthTs(firstOfMonthTs(dateToTs(item.startDate)));
                      }}
                      onDoubleClick={() => openEdit(item)}
                      title="Click to show on the calendar · double-click to edit"
                      className={`w-full px-3 py-2.5 text-left hover:bg-surface-hover/60 rounded-lg transition-colors ${isSelected ? 'pr-16' : ''}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.type === 'milestone' ? <Flag className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        <span className="truncate text-sm text-content">{item.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${meta.badge}`}>{meta.label}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-faint">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colors.solid }} />
                        <span className="truncate">{formatDisplayDate(item.startDate)} - {formatDisplayDate(endDateText)} • {duration} day{duration === 1 ? '' : 's'} • {item.progress}%</span>
                      </div>
                      <p className="mt-1 text-[11px] text-faint truncate">{shortDescription || 'No description provided.'}</p>
                    </button>

                    {isSelected && (
                      <div className="absolute right-2 top-2 z-20 flex items-center gap-0.5">
                        <button onClick={() => openEdit(item)} className="icon-btn" title="Edit (Enter)" aria-label="Edit item">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="icon-btn hover:!text-danger" title="Delete (Del)" aria-label="Delete item">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="min-h-0 flex flex-col">
            <div className="shrink-0 border-b border-border bg-surface">
              <div className="h-10 px-3 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2">
                  <button onClick={() => shiftCalendarMonth(-1)} className="icon-btn" title="Previous month" aria-label="Previous month">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={jumpToCurrentMonth} className="h-7 rounded-md px-2 text-[12px] text-muted ring-1 ring-border hover:bg-surface-hover hover:text-content">
                    Today
                  </button>
                  <button onClick={() => shiftCalendarMonth(1)} className="icon-btn" title="Next month" aria-label="Next month">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm font-semibold text-content">{calendarMonthLabel}</div>
                <div className="w-[88px]" />
              </div>

              <div className="grid grid-cols-7">
                {DAY_LABELS.map(label => (
                  <div key={label} className="h-8 border-r border-border last:border-r-0 flex items-center justify-center text-[11px] uppercase tracking-wide text-faint">
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 p-2">
              <div className="h-full min-h-[580px] border border-border rounded-lg overflow-auto custom-scrollbar">
                {calendarWeeks.map((week, weekIndex) => {
                  const laneHeight = 24;
                  const laneOffset = 24;
                  const weekHeight = Math.max(92, laneOffset + Math.max(1, week.laneCount) * laneHeight + 8);

                  return (
                    <div key={`week-${weekIndex}`} className="relative border-b border-border last:border-b-0" style={{ height: `${weekHeight}px` }}>
                      <div className="absolute inset-0 grid grid-cols-7">
                        {week.days.map((day, dayIndex) => (
                          <div
                            key={day.iso}
                            className={`relative p-1.5 ${dayIndex < 6 ? 'border-r border-border' : ''} ${day.isCurrentMonth ? 'bg-bg' : 'bg-surface/55'} ${day.isToday ? 'ring-1 ring-inset ring-cyan-500/50' : ''}`}
                          >
                            <div className={`text-[11px] font-medium ${day.isToday ? 'text-cyan-300' : day.isCurrentMonth ? 'text-content' : 'text-faint'}`}>
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
                                  className={`h-5 w-full border text-left text-[10px] text-content px-1 flex items-center gap-1 hover:brightness-110 ${segment.isStart ? 'rounded-l-md' : 'rounded-l-sm'} ${segment.isEnd ? 'rounded-r-md' : 'rounded-r-sm'} ${isSelected ? 'ring-1 ring-cyan-400/60' : ''}`}
                                  style={{ backgroundColor: colors.soft, borderColor: colors.border }}
                                  title={item.title}
                                >
                                  {!segment.isStart && <span className="text-[9px] text-content/80">...</span>}
                                  <span className="truncate flex-1">{item.title}</span>
                                  {item.type === 'milestone' && <span className="text-[9px] text-amber-300">M</span>}
                                  {!segment.isEnd && <span className="text-[9px] text-content/80">...</span>}
                                </button>
                                <div className="absolute left-0 top-full mt-1 w-64 rounded-md border border-border-strong bg-surface-raised shadow-pop px-2.5 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                                  <p className="text-xs font-semibold text-content mb-1">{item.title}</p>
                                  <p className="text-[11px] text-muted mb-1">{meta.label} • {item.type === 'milestone' ? 'Milestone' : 'Phase'}</p>
                                  <p className="text-[11px] text-muted mb-1">
                                    {formatDisplayDate(item.startDate)} - {formatDisplayDate(item.type === 'milestone' ? item.startDate : item.endDate)}
                                  </p>
                                  <p className="text-[11px] text-faint break-words">{overview}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-content mb-5">{editingId ? `Edit ${formData.type}` : formData.type === 'milestone' ? 'New milestone' : 'New phase'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1">Title</label>
                <input
                  autoFocus
                  type="text"
                  value={formData.title}
                  onChange={(event) => setFormData(prev => ({ ...prev, title: event.target.value }))}
                  className="w-full bg-bg border border-border rounded p-2.5 text-content focus:border-accent outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Type</label>
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
                    className="w-full bg-bg border border-border rounded p-2.5 text-content focus:border-accent outline-none"
                  >
                    {ROADMAP_TYPE_OPTIONS.map(type => (
                      <option key={type} value={type}>
                        {type === 'phase' ? 'Phase' : 'Milestone'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(event) => setFormData(prev => ({ ...prev, status: event.target.value as RoadmapStatus }))}
                    className="w-full bg-bg border border-border rounded p-2.5 text-content focus:border-accent outline-none"
                  >
                    {ROADMAP_STATUS_OPTIONS.map(status => (
                      <option key={status} value={status}>
                        {STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Progress ({formData.progress}%)</label>
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
                  <label className="block text-sm text-muted mb-1">{formData.type === 'milestone' ? 'Date' : 'Start Date'}</label>
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
                    className="w-full bg-bg border border-border rounded p-2.5 text-content focus:border-accent outline-none [color-scheme:light] dark:[color-scheme:dark]"
                    required
                  />
                </div>
                {formData.type === 'phase' && (
                  <div>
                    <label className="block text-sm text-muted mb-1">End Date</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(event) => setFormData(prev => ({ ...prev, endDate: event.target.value }))}
                      className="w-full bg-bg border border-border rounded p-2.5 text-content focus:border-accent outline-none [color-scheme:light] dark:[color-scheme:dark]"
                      required
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-muted mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(event) => setFormData(prev => ({ ...prev, description: event.target.value }))}
                  className="w-full bg-bg border border-border rounded p-2.5 text-content focus:border-accent outline-none min-h-[110px]"
                  placeholder="Context, risks, dependencies..."
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-border">
                {editingId && (
                  <button type="button" onClick={() => handleDelete(editingId)} className="px-4 py-2 rounded-md text-danger hover:bg-danger/10 text-sm font-medium">
                    Delete
                  </button>
                )}
                <div className="flex-1" />
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-muted hover:text-content">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 rounded-md bg-accent hover:bg-accent-hover text-accent-content text-sm font-medium">
                  {editingId ? 'Save changes' : formData.type === 'milestone' ? 'Add milestone' : 'Add phase'}
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
