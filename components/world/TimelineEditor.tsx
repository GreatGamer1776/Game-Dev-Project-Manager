import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Undo2, Redo2, Settings2, ListOrdered, GanttChartSquare, Search, Link2, Trash2, Maximize2, History,
} from 'lucide-react';
import type { EditorProps } from '../../types';
import {
  TimelineData, TimelineDate, TimelineEvent, TIMELINE_COLORS, ZOOM_MAX, ZOOM_MIN, DEFAULT_MONTHS,
  compareEvents, dateKey, eraFor, formatDate, formatRange, parseTimeline, sortEras, yearPosition, yearSpan,
} from '../../utils/timelineModel';
import { useEditorDocument } from '../../hooks/useEditorDocument';
import { uid } from '../../utils/id';
import { confirmDialog } from '../../stores/useUiStore';
import MarkdownView from '../markdown/MarkdownView';
import EntryPicker from './EntryPicker';
import { ColorButton, ToolbarButton, ToolbarDivider, ViewToggle, insertAtCursor } from './shared';
import { Button, Field, Input, Modal, SaveIndicator, Select, Textarea, cn } from '../ui';

/** Timeline editor: world history on a fictional calendar, as a chronicle or as lanes. */
const TimelineEditor: React.FC<EditorProps> = ({ initialContent, onSave, projectFiles = [], activeFileId, onOpenHref, assets }) => {
  const doc = useEditorDocument<TimelineData>(() => parseTimeline(initialContent), onSave);
  const { data, update } = doc;
  const [editing, setEditing] = useState<{ event: TimelineEvent; isNew: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [laneFilter, setLaneFilter] = useState('');
  const [query, setQuery] = useState('');

  const laneById = useMemo(() => new Map(data.lanes.map(l => [l.id, l])), [data.lanes]);
  const events = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.events
      .filter(e => !laneFilter || e.laneId === laneFilter)
      .filter(e => !q || `${e.title} ${e.description}`.toLowerCase().includes(q))
      .sort(compareEvents);
  }, [data.events, laneFilter, query]);

  const newEvent = (start?: TimelineDate, laneId?: string) => {
    const last = [...data.events].sort(compareEvents).pop();
    setEditing({
      isNew: true,
      event: {
        id: uid(),
        title: '',
        start: start ?? { year: last ? last.start.year : (data.eras[0]?.start ?? 1) },
        laneId: laneId ?? (laneFilter || data.lanes[0].id),
        description: '',
      },
    });
  };

  const saveEvent = (event: TimelineEvent) => {
    update(d => {
      const exists = d.events.some(e => e.id === event.id);
      return { ...d, events: exists ? d.events.map(e => (e.id === event.id ? event : e)) : [...d.events, event] };
    });
    setEditing(null);
  };

  const deleteEvent = (id: string) => {
    update(d => ({ ...d, events: d.events.filter(e => e.id !== id) }));
    setEditing(null);
  };

  const openHref = (href: string, newTab: boolean) => onOpenHref?.(href, newTab);

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/70 px-2 [scrollbar-width:none]">
        <ToolbarButton icon={Plus} title="Add event" label="Add event" onClick={() => newEvent()} />
        <ToolbarDivider />
        <ViewToggle
          value={data.view}
          onChange={view => update(d => ({ ...d, view }))}
          options={[
            { id: 'chronicle', label: 'Chronicle', icon: ListOrdered },
            { id: 'lanes', label: 'Lanes', icon: GanttChartSquare },
          ]}
        />
        {data.lanes.length > 1 && (
          <select
            value={laneFilter}
            onChange={e => setLaneFilter(e.target.value)}
            aria-label="Filter by lane"
            className="ml-1 h-7 shrink-0 rounded-md border border-border bg-surface px-1.5 text-xs text-content outline-none focus:border-accent"
          >
            <option value="">All lanes</option>
            {data.lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <div className="ml-1 flex h-7 w-40 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 focus-within:border-accent">
          <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search events"
            aria-label="Search events"
            className="min-w-0 flex-1 bg-transparent text-xs text-content outline-none placeholder:text-faint"
          />
        </div>
        <ToolbarDivider />
        <ToolbarButton icon={Undo2} title="Undo (Ctrl+Z)" onClick={doc.undo} disabled={!doc.canUndo} />
        <ToolbarButton icon={Redo2} title="Redo (Ctrl+Y)" onClick={doc.redo} disabled={!doc.canRedo} />
        <ToolbarButton icon={Settings2} title="Eras, lanes, and calendar" onClick={() => setSettingsOpen(true)} />
        <div className="ml-auto pl-2">
          <SaveIndicator status={doc.saveStatus} onSaveNow={doc.flushSave} />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {data.events.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <History className="mx-auto h-6 w-6 text-faint" />
              <h2 className="mt-3 font-display text-base font-medium text-content">No events yet</h2>
              <p className="mt-1 text-sm text-muted">
                Add the moments that shaped your world. Years can be negative, and eras label them for you
                (Year 433 of the Third Era shows as “3E 433”).
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" icon={Plus} onClick={() => newEvent()}>Add event</Button>
                <Button size="sm" variant="secondary" icon={Settings2} onClick={() => setSettingsOpen(true)}>Set up eras</Button>
              </div>
            </div>
          </div>
        ) : data.view === 'chronicle' ? (
          <Chronicle data={data} events={events} laneById={laneById} files={projectFiles} assets={assets} onOpenHref={openHref} onEdit={event => setEditing({ event, isNew: false })} />
        ) : (
          <Lanes
            data={data}
            events={events}
            laneFilter={laneFilter}
            onZoom={zoom => update(d => ({ ...d, zoom }), { batch: true })}
            onEdit={event => setEditing({ event, isNew: false })}
            onAdd={(year, laneId) => newEvent({ year }, laneId)}
          />
        )}
      </div>

      {editing && (
        <EventDialog
          key={editing.event.id}
          data={data}
          event={editing.event}
          isNew={editing.isNew}
          files={projectFiles}
          activeFileId={activeFileId}
          onSave={saveEvent}
          onDelete={() => deleteEvent(editing.event.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {settingsOpen && <SettingsDialog data={data} update={update} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

// --- Chronicle ---------------------------------------------------------------

const Chronicle: React.FC<{
  data: TimelineData;
  events: TimelineEvent[];
  laneById: Map<string, TimelineData['lanes'][number]>;
  files: EditorProps['projectFiles'];
  assets?: Record<string, string>;
  onOpenHref: (href: string, newTab: boolean) => void;
  onEdit: (event: TimelineEvent) => void;
}> = ({ data, events, laneById, files = [], assets, onOpenHref, onEdit }) => {
  if (events.length === 0) return <p className="py-16 text-center text-sm text-faint">No events match.</p>;
  // Group consecutive events by era.
  const groups: { era: ReturnType<typeof eraFor>; events: TimelineEvent[] }[] = [];
  for (const event of events) {
    const era = eraFor(event.start.year, data.eras);
    const last = groups[groups.length - 1];
    if (last && last.era?.id === era?.id) last.events.push(event);
    else groups.push({ era, events: [event] });
  }
  const showLanes = data.lanes.length > 1;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
        {groups.map((group, gi) => (
          <section key={`${group.era?.id ?? 'none'}-${gi}`} className="mb-6">
            {(data.eras.length > 0) && (
              <div className="mb-3 flex items-center gap-2">
                <span className="h-3 w-1 rounded-full" style={{ background: group.era?.color ?? 'rgb(var(--color-border-strong))' }} />
                <h2 className="text-sm font-semibold text-content">{group.era ? group.era.name : 'Before recorded eras'}</h2>
                {group.era && <span className="text-xs text-faint">from Year {group.era.start}</span>}
              </div>
            )}
            <ol className="relative ml-[7.5rem] border-l border-border sm:ml-36">
              {group.events.map(event => {
                const lane = laneById.get(event.laneId);
                const color = event.color || lane?.color || TIMELINE_COLORS[0];
                return (
                  <li key={event.id} className="relative pb-4 pl-5">
                    <span className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-bg" style={{ background: color }} />
                    <div className="absolute -left-[7.5rem] top-1 w-[6.75rem] text-right text-xs leading-5 text-muted sm:-left-36 sm:w-[8.25rem]">
                      {formatDate(event.start, data)}
                      {event.end && <div className="text-faint">to {formatDate(event.end, data)}</div>}
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={e => { if (!(e.target as HTMLElement).closest('a, button, input')) onEdit(event); }}
                      onKeyDown={e => { if (e.key === 'Enter') onEdit(event); }}
                      className="cursor-pointer rounded-lg border border-transparent px-3 py-1.5 transition-colors hover:border-border hover:bg-surface"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.875rem] font-medium text-content">{event.title || 'Untitled event'}</h3>
                        {showLanes && lane && (
                          <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: `${lane.color}22`, color: lane.color }}>{lane.name}</span>
                        )}
                      </div>
                      {event.description.trim() && (
                        <div className="mt-1 text-[0.8125rem]">
                          <MarkdownView source={event.description} files={files} assets={assets} onOpenHref={onOpenHref} hideProperties className="md-compact" />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
};

// --- Lanes ---------------------------------------------------------------------

// Room after the last year so the final event's label isn't cut off.
const END_ROOM = 160;
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const LANE_LABEL_W = 144;
const ROW_H = 26;

const Lanes: React.FC<{
  data: TimelineData;
  events: TimelineEvent[];
  laneFilter: string;
  onZoom: (zoom: number) => void;
  onEdit: (event: TimelineEvent) => void;
  onAdd: (year: number, laneId: string) => void;
}> = ({ data, events, laneFilter, onZoom, onEdit, onAdd }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const span = useMemo(() => yearSpan(data), [data]);
  const zoom = data.zoom;
  const width = Math.max(1, (span.to - span.from) * zoom);
  const x = (year: number) => (year - span.from) * zoom;
  const months = data.calendar.months;
  const tickStep = TICK_STEPS.find(s => s * zoom >= 72) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: number[] = [];
  for (let y = Math.ceil(span.from / tickStep) * tickStep; y <= span.to; y += tickStep) ticks.push(y);
  const eras = sortEras(data.eras);
  const lanes = data.lanes.filter(l => !laneFilter || l.id === laneFilter);

  // Pack each lane's events into rows so labels don't collide.
  const layout = lanes.map(lane => {
    const rows: number[] = [];
    const placed = events
      .filter(e => e.laneId === lane.id)
      .map(event => {
        const start = x(yearPosition(event.start, months));
        const end = event.end ? Math.max(start + 6, x(yearPosition(event.end, months))) : start;
        const labelEnd = Math.max(end, start + 16 + event.title.length * 6.2);
        let row = rows.findIndex(r => r + 8 <= start);
        if (row === -1) { row = rows.length; rows.push(labelEnd); } else rows[row] = labelEnd;
        return { event, start, end, row };
      });
    return { lane, placed, rows: Math.max(1, rows.length) };
  });

  // Open on the earliest event rather than on the empty padding before it.
  useEffect(() => {
    const first = events[0];
    if (first && scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, x(yearPosition(first.start, months)) - 48);
    // Only on mount: later edits shouldn't yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fit = () => {
    const available = (scrollRef.current?.clientWidth ?? 800) - LANE_LABEL_W - END_ROOM;
    onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, available / Math.max(1, span.to - span.from))));
  };

  const zoomLog = Math.log(zoom);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-1.5 text-xs text-faint">
        <span>Zoom</span>
        <input
          type="range"
          min={Math.log(ZOOM_MIN)}
          max={Math.log(ZOOM_MAX)}
          step={0.01}
          value={zoomLog}
          onChange={e => onZoom(Math.exp(Number(e.target.value)))}
          aria-label="Zoom"
          className="w-40 accent-[rgb(var(--color-accent))]"
        />
        <button type="button" onClick={fit} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-hover hover:text-content">
          <Maximize2 className="h-3 w-3" /> Fit
        </button>
        <span className="ml-auto">Double-click a lane to add an event there.</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: width + LANE_LABEL_W + END_ROOM }}>
          {/* Axis */}
          <div className="sticky top-0 z-20 flex h-12 border-b border-border bg-bg">
            <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-bg" style={{ width: LANE_LABEL_W }} />
            <div className="relative" style={{ width }}>
              {eras.map((era, i) => {
                const left = Math.max(0, x(era.start));
                const right = i + 1 < eras.length ? x(eras[i + 1].start) : width;
                if (right <= 0 || left >= width) return null;
                return (
                  <div key={era.id} className="absolute top-0 h-5 truncate px-1.5 text-[11px] font-medium leading-5" style={{ left, width: Math.max(0, right - left), background: `${era.color}26`, color: era.color }} title={era.name}>
                    {era.name}
                  </div>
                );
              })}
              {ticks.map(year => (
                <div key={year} className="absolute bottom-0 h-6 border-l border-border pl-1 text-[11px] text-faint" style={{ left: x(year) }}>
                  {year}
                </div>
              ))}
            </div>
          </div>
          {/* Era bands behind lanes */}
          <div className="pointer-events-none absolute bottom-0 top-12" style={{ left: LANE_LABEL_W, width }}>
            {eras.map((era, i) => {
              const left = Math.max(0, x(era.start));
              const right = i + 1 < eras.length ? x(eras[i + 1].start) : width;
              return <div key={era.id} className="absolute inset-y-0 border-l" style={{ left, width: Math.max(0, right - left), background: `${era.color}0d`, borderColor: `${era.color}55` }} />;
            })}
          </div>
          {/* Lanes */}
          {layout.map(({ lane, placed, rows }) => (
            <div key={lane.id} className="relative flex border-b border-border/70">
              <div className="sticky left-0 z-10 flex shrink-0 items-start gap-2 border-r border-border bg-bg px-3 py-2" style={{ width: LANE_LABEL_W }}>
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: lane.color }} />
                <span className="truncate text-xs font-medium text-content">{lane.name}</span>
              </div>
              <div
                className="relative"
                style={{ width, height: rows * ROW_H + 16 }}
                onDoubleClick={e => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onAdd(Math.floor(span.from + (e.clientX - rect.left) / zoom), lane.id);
                }}
              >
                {placed.map(({ event, start, end, row }) => {
                  const color = event.color || lane.color;
                  const top = 8 + row * ROW_H;
                  const label = `${event.title || 'Untitled event'} · ${formatRange(event, data)}`;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onEdit(event)}
                      title={label}
                      className="group absolute flex h-5 items-center gap-1.5 whitespace-nowrap text-left"
                      style={{ left: start - (event.end ? 0 : 5), top }}
                    >
                      {event.end ? (
                        <span className="h-3 rounded-full opacity-80 transition-opacity group-hover:opacity-100" style={{ width: end - start, background: color }} />
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-bg" style={{ background: color }} />
                      )}
                      <span className="text-[11px] text-muted group-hover:text-content">{event.title || 'Untitled event'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Event dialog ----------------------------------------------------------------

interface DateFields { year: string; month: string; day: string }

const toFields = (d?: TimelineDate): DateFields => ({ year: d ? String(d.year) : '', month: d?.month ? String(d.month) : '', day: d?.day ? String(d.day) : '' });
const fromFields = (f: DateFields): TimelineDate | null => {
  if (!/^-?\d+$/.test(f.year.trim())) return null;
  const date: TimelineDate = { year: Number(f.year) };
  if (f.month) {
    date.month = Number(f.month);
    if (/^\d+$/.test(f.day.trim()) && Number(f.day) > 0) date.day = Number(f.day);
  }
  return date;
};

const DateInput: React.FC<{ label: string; value: DateFields; onChange: (v: DateFields) => void; data: TimelineData; autoFocus?: boolean }> = ({ label, value, onChange, data, autoFocus }) => {
  const parsed = fromFields(value);
  const maxDay = value.month ? data.calendar.months[Number(value.month) - 1]?.days : undefined;
  return (
    <Field label={label} hint={parsed ? `Shown as ${formatDate(parsed, data)}` : 'Enter a whole year; negative years are fine.'}>
      <div className="flex gap-2">
        <Input
          autoFocus={autoFocus}
          inputMode="numeric"
          aria-label={`${label} year`}
          placeholder="Year"
          value={value.year}
          onChange={e => onChange({ ...value, year: e.target.value })}
          className="w-24"
        />
        <Select aria-label={`${label} month`} value={value.month} onChange={e => onChange({ ...value, month: e.target.value, day: e.target.value ? value.day : '' })} className="flex-1">
          <option value="">No month</option>
          {data.calendar.months.map((m, i) => <option key={i} value={i + 1}>{m.name}</option>)}
        </Select>
        <Input
          inputMode="numeric"
          aria-label={`${label} day`}
          placeholder="Day"
          disabled={!value.month}
          value={value.day}
          onChange={e => onChange({ ...value, day: e.target.value })}
          max={maxDay}
          className="w-20"
        />
      </div>
    </Field>
  );
};

const EventDialog: React.FC<{
  data: TimelineData;
  event: TimelineEvent;
  isNew: boolean;
  files: EditorProps['projectFiles'];
  activeFileId?: string | null;
  onSave: (event: TimelineEvent) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ data, event, isNew, files = [], activeFileId, onSave, onDelete, onClose }) => {
  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(toFields(event.start));
  const [hasEnd, setHasEnd] = useState(Boolean(event.end));
  const [end, setEnd] = useState(toFields(event.end ?? event.start));
  const [laneId, setLaneId] = useState(event.laneId);
  const [color, setColor] = useState(event.color);
  const [description, setDescription] = useState(event.description);
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const startDate = fromFields(start);
  const endDate = hasEnd ? fromFields(end) : null;
  const error = !startDate ? 'Enter a start year.'
    : hasEnd && !endDate ? 'Enter an end year, or untick “Lasts a while”.'
      : hasEnd && endDate && dateKey(endDate) <= dateKey(startDate) ? 'The end has to come after the start.'
        : null;

  const submit = () => {
    if (error || !startDate) return;
    const next: TimelineEvent = { id: event.id, title: title.trim() || 'Untitled event', start: startDate, laneId, description };
    if (hasEnd && endDate) next.end = endDate;
    if (color) next.color = color;
    onSave(next);
  };

  const insertLink = (name: string) => {
    const { value, caret } = insertAtCursor(textRef.current, description, `[[${name}]]`);
    setDescription(value);
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(caret, caret);
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'New event' : 'Edit event'}
      footer={(
        <>
          {!isNew && (
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              className="mr-auto"
              onClick={() => void confirmDialog({ title: 'Delete this event?', message: `“${event.title || 'Untitled event'}” will be removed from the timeline.`, confirmText: 'Delete', danger: true }).then(ok => ok && onDelete())}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={Boolean(error)}>{isNew ? 'Add event' : 'Save'}</Button>
        </>
      )}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={e => { e.preventDefault(); submit(); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
      >
        <Field label="Title">
          <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="The Sundering of Varn" />
        </Field>
        <DateInput label="Start" value={start} onChange={setStart} data={data} />
        <label className="-mt-1 flex items-center gap-2 text-[0.8125rem] text-content">
          <input type="checkbox" checked={hasEnd} onChange={e => setHasEnd(e.target.checked)} className="accent-[rgb(var(--color-accent))]" />
          Lasts a while (wars, reigns, ages)
        </label>
        {hasEnd && <DateInput label="End" value={end} onChange={setEnd} data={data} />}
        <div className="flex gap-2">
          <Field label="Lane" className="flex-1">
            <Select value={laneId} onChange={e => setLaneId(e.target.value)}>
              {data.lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Color">
            <ColorButton color={color} colors={TIMELINE_COLORS} allowNone onChange={setColor} title="Event color (default: the lane's)" />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            ref={textRef}
            rows={6}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What happened, who was involved, what changed. Markdown and [[links]] work here."
          />
          <div>
            <button
              type="button"
              onClick={e => setPicker(picker ? null : e.currentTarget)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-hover hover:text-content"
            >
              <Link2 className="h-3.5 w-3.5" /> Link an entry or file
            </button>
          </div>
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button type="submit" hidden />
      </form>
      <EntryPicker anchor={picker} files={files} includeFiles excludeFileId={activeFileId} onPick={insertLink} onClose={() => setPicker(null)} />
    </Modal>
  );
};

// --- Settings: eras, lanes, calendar ------------------------------------------

const SettingsDialog: React.FC<{
  data: TimelineData;
  update: (fn: (d: TimelineData) => TimelineData, options?: { batch?: boolean }) => void;
  onClose: () => void;
}> = ({ data, update, onClose }) => {
  const [tab, setTab] = useState<'eras' | 'lanes' | 'calendar'>('eras');
  const yearInput = (value: number, onChange: (n: number) => void, label: string) => (
    <YearField value={value} onChange={onChange} label={label} />
  );

  const removeLane = (id: string) => {
    const used = data.events.filter(e => e.laneId === id).length;
    const run = () => update(d => {
      const lanes = d.lanes.filter(l => l.id !== id);
      return { ...d, lanes, events: d.events.map(e => (e.laneId === id ? { ...e, laneId: lanes[0].id } : e)) };
    });
    if (used === 0) run();
    else void confirmDialog({ title: 'Delete this lane?', message: `Its ${used} ${used === 1 ? 'event moves' : 'events move'} to “${data.lanes.find(l => l.id !== id)?.name}”.`, confirmText: 'Delete lane', danger: true }).then(ok => ok && run());
  };

  const tabs = [
    { id: 'eras' as const, label: 'Eras' },
    { id: 'lanes' as const, label: 'Lanes' },
    { id: 'calendar' as const, label: 'Calendar' },
  ];

  return (
    <Modal open onClose={onClose} size="lg" title="Timeline settings" footer={<Button size="sm" onClick={onClose}>Done</Button>}>
      <div className="mb-4 flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn('-mb-px border-b-2 px-3 py-1.5 text-[0.8125rem]', tab === t.id ? 'border-accent text-content' : 'border-transparent text-muted hover:text-content')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'eras' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            An era starts at an absolute year, and that year is year 1 of the era. With the label “3E” and a start of 2001,
            year 2433 shows as “3E 433”. Leave the label empty to show the era’s name instead.
          </p>
          {sortEras(data.eras).map(era => (
            <div key={era.id} className="flex items-center gap-2">
              <ColorButton color={era.color} colors={TIMELINE_COLORS} onChange={c => c && update(d => ({ ...d, eras: d.eras.map(x => (x.id === era.id ? { ...x, color: c } : x)) }))} />
              <Input aria-label="Era name" value={era.name} onChange={e => update(d => ({ ...d, eras: d.eras.map(x => (x.id === era.id ? { ...x, name: e.target.value } : x)) }), { batch: true })} className="flex-1" />
              <Input aria-label="Era label" placeholder="Label" value={era.abbr} onChange={e => update(d => ({ ...d, eras: d.eras.map(x => (x.id === era.id ? { ...x, abbr: e.target.value } : x)) }), { batch: true })} className="w-20" />
              {yearInput(era.start, n => update(d => ({ ...d, eras: sortEras(d.eras.map(x => (x.id === era.id ? { ...x, start: n } : x))) }), { batch: true }), 'Era start year')}
              <button type="button" className="icon-btn" aria-label={`Delete ${era.name}`} onClick={() => update(d => ({ ...d, eras: d.eras.filter(x => x.id !== era.id) }))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() => update(d => {
                const last = sortEras(d.eras).pop();
                const start = last ? last.start + 1000 : 1;
                return { ...d, eras: sortEras([...d.eras, { id: uid(), name: `Era ${d.eras.length + 1}`, abbr: '', start, color: TIMELINE_COLORS[(d.eras.length + 3) % TIMELINE_COLORS.length] }]) };
              })}
            >
              Add era
            </Button>
          </div>
        </div>
      )}

      {tab === 'lanes' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">Lanes are parallel tracks: a kingdom, a character, a plot line.</p>
          {data.lanes.map(lane => (
            <div key={lane.id} className="flex items-center gap-2">
              <ColorButton color={lane.color} colors={TIMELINE_COLORS} onChange={c => c && update(d => ({ ...d, lanes: d.lanes.map(x => (x.id === lane.id ? { ...x, color: c } : x)) }))} />
              <Input aria-label="Lane name" value={lane.name} onChange={e => update(d => ({ ...d, lanes: d.lanes.map(x => (x.id === lane.id ? { ...x, name: e.target.value } : x)) }), { batch: true })} className="flex-1" />
              <span className="w-16 text-right text-xs tabular-nums text-faint">{data.events.filter(e => e.laneId === lane.id).length} events</span>
              <button type="button" className="icon-btn" disabled={data.lanes.length === 1} aria-label={`Delete ${lane.name}`} onClick={() => removeLane(lane.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => update(d => ({ ...d, lanes: [...d.lanes, { id: uid(), name: `Lane ${d.lanes.length + 1}`, color: TIMELINE_COLORS[d.lanes.length % TIMELINE_COLORS.length] }] }))}>
              Add lane
            </Button>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">Name your world’s months and set their lengths. Events only need a year; months and days are optional.</p>
          {data.calendar.months.map((month, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs tabular-nums text-faint">{i + 1}</span>
              <Input aria-label={`Month ${i + 1} name`} value={month.name} onChange={e => update(d => ({ ...d, calendar: { months: d.calendar.months.map((m, j) => (j === i ? { ...m, name: e.target.value } : m)) } }), { batch: true })} className="flex-1" />
              <Input
                aria-label={`Month ${i + 1} days`}
                inputMode="numeric"
                value={String(month.days)}
                onChange={e => {
                  const days = Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1));
                  update(d => ({ ...d, calendar: { months: d.calendar.months.map((m, j) => (j === i ? { ...m, days } : m)) } }), { batch: true });
                }}
                className="w-20"
              />
              <span className="text-xs text-faint">days</span>
              <button type="button" className="icon-btn" disabled={data.calendar.months.length === 1} aria-label={`Delete ${month.name}`} onClick={() => update(d => ({ ...d, calendar: { months: d.calendar.months.filter((_, j) => j !== i) } }))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => update(d => ({ ...d, calendar: { months: [...d.calendar.months, { name: `Month ${d.calendar.months.length + 1}`, days: 30 }] } }))}>
              Add month
            </Button>
            <Button size="sm" variant="ghost" onClick={() => update(d => ({ ...d, calendar: { months: DEFAULT_MONTHS.map(m => ({ ...m })) } }))}>
              Reset to default
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

/** Integer input that keeps what you type (e.g. "-") until it is a valid number. */
const YearField: React.FC<{ value: number; onChange: (n: number) => void; label: string }> = ({ value, onChange, label }) => {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      value={focused ? text : String(value)}
      onFocus={() => { setText(String(value)); setFocused(true); }}
      onBlur={() => setFocused(false)}
      onChange={e => {
        setText(e.target.value);
        if (/^-?\d+$/.test(e.target.value.trim())) onChange(Number(e.target.value));
      }}
      className="w-24"
    />
  );
};

export default TimelineEditor;
