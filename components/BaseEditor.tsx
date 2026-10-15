import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Table2, Kanban, LayoutGrid, CalendarDays, Plus, Search, Filter, ArrowUpDown, SlidersHorizontal, Undo2, Redo2,
  MoreHorizontal, Trash2, Copy, Maximize2, X, Pencil, EyeOff, Eye, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  ExternalLink, Type, Hash, ChevronsUpDown, Tags, Calendar, CheckSquare, Link2, FileSymlink, Palette, ArrowLeftToLine, ArrowRightToLine,
} from 'lucide-react';
import { EditorProps } from '../types';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { showMenu } from '../stores/useMenuStore';
import { confirmDialog, promptDialog } from '../stores/useUiStore';
import { uid } from '../utils/id';
import {
  BaseData, BaseColumn, BaseColumnType, BaseRow, BaseView, BaseViewType, BaseFilter, CellValue, Aggregate,
  COLUMN_TYPES, OPTION_COLORS, FILTER_OPS, NO_VALUE_OPS, parseBase, makeRow, emptyValue, cellText, visibleRows, aggregate,
} from '../utils/baseModel';
import { getFileTypeMeta } from './fileTypes';
import MarkdownView from './markdown/MarkdownView';
import SearchPicker, { PickerItem } from './ui/SearchPicker';
import Popover from './ui/Popover';
import { Modal, Button, cn } from './ui';

const VIEW_ICONS: Record<BaseViewType, React.ComponentType<{ className?: string }>> = {
  table: Table2, board: Kanban, gallery: LayoutGrid, calendar: CalendarDays,
};
const TYPE_ICONS: Record<BaseColumnType, React.ComponentType<{ className?: string }>> = {
  text: Type, number: Hash, select: ChevronsUpDown, multi_select: Tags, date: Calendar, checkbox: CheckSquare, url: Link2, file: FileSymlink,
};
const ROW_DRAG_MIME = 'application/x-gdpm-base-row';
const SAVE_DEBOUNCE_MS = 300;

const Chip: React.FC<{ label: string; color: string; onRemove?: () => void }> = ({ label, color, onRemove }) => (
  <span
    className="inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-px text-[12px] leading-5"
    style={{ backgroundColor: `${color}2e`, color: `color-mix(in srgb, ${color} 75%, rgb(var(--color-content)))` }}
  >
    <span className="truncate">{label || 'Untitled'}</span>
    {onRemove && (
      <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }} className="opacity-60 hover:opacity-100" aria-label={`Remove ${label}`}>
        <X className="h-3 w-3" />
      </button>
    )}
  </span>
);

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface CellProps {
  column: BaseColumn;
  value: CellValue | undefined;
  onChange: (value: CellValue) => void;
  onCreateOption: (columnId: string) => Promise<string | null>;
  onPickFile: (anchor: HTMLElement) => void;
  fileName: (id: string) => string | undefined;
  onOpenFile?: (id: string) => void;
  /** Larger controls for the row panel. */
  roomy?: boolean;
}

/** One editable cell; the same control renders in the table, cards, and the row panel. */
const Cell: React.FC<CellProps> = ({ column, value, onChange, onCreateOption, onPickFile, fileName, onOpenFile, roomy }) => {
  const base = cn('w-full min-w-0 bg-transparent text-[0.8125rem] text-content outline-none placeholder:text-faint', roomy ? 'rounded-md border border-border px-2 py-1.5 focus:border-accent' : 'px-2 py-1.5');
  switch (column.type) {
    case 'checkbox':
      return (
        <div className={cn('flex items-center', roomy ? 'py-1' : 'px-2 py-1.5')}>
          <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} className="md-checkbox" aria-label={column.name} />
        </div>
      );
    case 'number':
      return <input type="number" value={value === null || value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} className={cn(base, 'text-right tabular-nums')} aria-label={column.name} />;
    case 'date':
      return <input type="date" value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || null)} className={cn(base, '[color-scheme:light] dark:[color-scheme:dark]')} aria-label={column.name} />;
    case 'url': {
      const url = typeof value === 'string' ? value : '';
      return (
        <div className="flex min-w-0 items-center">
          <input value={url} onChange={e => onChange(e.target.value || null)} placeholder="https://" className={base} aria-label={column.name} />
          {/^https?:\/\//.test(url) && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="mr-1 shrink-0 rounded p-1 text-faint hover:text-accent" title="Open link"><ExternalLink className="h-3.5 w-3.5" /></a>
          )}
        </div>
      );
    }
    case 'select': {
      const option = column.options?.find(o => o.id === value);
      const open = (e: React.MouseEvent) => showMenu(e, [
        ...(column.options || []).map(o => ({ label: o.label, checked: o.id === value, icon: dot(o.color), onSelect: () => onChange(o.id) })),
        { kind: 'separator' as const },
        { label: 'New option…', icon: Plus, onSelect: () => { void onCreateOption(column.id).then(id => id && onChange(id)); } },
        ...(value ? [{ label: 'Clear', icon: X, onSelect: () => onChange(null) }] : []),
      ], 'below');
      return (
        <button type="button" onClick={open} className={cn('flex w-full min-w-0 items-center text-left', roomy ? 'min-h-[2rem] rounded-md border border-border px-2 hover:border-border-strong' : 'min-h-[2rem] px-2')}>
          {option ? <Chip label={option.label} color={option.color} /> : <span className="text-[0.8125rem] text-faint">{roomy ? 'Select…' : ''}</span>}
        </button>
      );
    }
    case 'multi_select': {
      const ids = Array.isArray(value) ? value : [];
      const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
      const open = (e: React.MouseEvent) => showMenu(e, [
        ...(column.options || []).map(o => ({ label: o.label, checked: ids.includes(o.id), icon: dot(o.color), onSelect: () => toggle(o.id) })),
        { kind: 'separator' as const },
        { label: 'New option…', icon: Plus, onSelect: () => { void onCreateOption(column.id).then(id => id && onChange([...ids, id])); } },
      ], 'below');
      return (
        <div onClick={open} role="button" tabIndex={0} className={cn('flex min-h-[2rem] w-full min-w-0 cursor-pointer flex-wrap items-center gap-1', roomy ? 'rounded-md border border-border px-2 py-1 hover:border-border-strong' : 'px-2 py-1')}>
          {ids.map(id => {
            const o = column.options?.find(opt => opt.id === id);
            return o ? <Chip key={id} label={o.label} color={o.color} onRemove={() => toggle(id)} /> : null;
          })}
          {ids.length === 0 && roomy && <span className="text-[0.8125rem] text-faint">Add…</span>}
        </div>
      );
    }
    case 'file': {
      const ids = Array.isArray(value) ? value : [];
      return (
        <div className={cn('flex min-h-[2rem] w-full min-w-0 flex-wrap items-center gap-1', roomy ? 'rounded-md border border-border px-2 py-1' : 'px-2 py-1')}>
          {ids.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded bg-surface-hover px-1.5 text-[12px] leading-5">
              <button type="button" onClick={() => onOpenFile?.(id)} className={cn('truncate hover:underline', fileName(id) ? 'text-accent' : 'text-faint line-through')}>
                {fileName(id) || 'Missing file'}
              </button>
              <button type="button" onClick={() => onChange(ids.filter(x => x !== id))} className="text-faint hover:text-content" aria-label="Remove link"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <button type="button" onClick={e => onPickFile(e.currentTarget)} className="rounded p-0.5 text-faint hover:bg-surface-hover hover:text-content" title="Link a file" aria-label="Link a file">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }
    default:
      return <input value={typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value)} className={base} aria-label={column.name} />;
  }
};

const dot = (color: string): React.ComponentType<{ className?: string }> => {
  const Dot = ({ className }: { className?: string }) => <span className={cn('inline-block rounded-full', className)} style={{ backgroundColor: color }} />;
  return Dot;
};

/** Converts every row's value when a column changes type. */
const convertColumn = (data: BaseData, columnId: string, type: BaseColumnType): BaseData => {
  const column = data.columns.find(c => c.id === columnId)!;
  let options = column.options || [];
  if ((type === 'select' || type === 'multi_select') && column.type !== 'select' && column.type !== 'multi_select') {
    const labels = Array.from(new Set(data.rows.map(r => cellText(column, r.cells[columnId])).flatMap(t => t.split(',').map(s => s.trim())).filter(Boolean)));
    options = labels.map((label, i) => ({ id: uid(), label, color: OPTION_COLORS[i % OPTION_COLORS.length] }));
  }
  const nextColumn: BaseColumn = { ...column, type, options };
  const convert = (value: CellValue | undefined): CellValue => {
    const text = cellText(column, value);
    switch (type) {
      case 'text': case 'url': return text || null;
      case 'number': { const n = parseFloat(text); return Number.isFinite(n) ? n : null; }
      case 'checkbox': return value === true || /^(yes|true|x|1|done)$/i.test(text);
      case 'date': return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
      case 'select': {
        if (column.type === 'multi_select' && Array.isArray(value)) return value[0] ?? null;
        return options.find(o => o.label === text.split(',')[0]?.trim())?.id ?? null;
      }
      case 'multi_select': {
        if (column.type === 'select') return value ? [String(value)] : [];
        return text.split(',').map(s => options.find(o => o.label === s.trim())?.id).filter((id): id is string => Boolean(id));
      }
      case 'file': return column.type === 'file' && Array.isArray(value) ? value : [];
      default: return null;
    }
  };
  return {
    ...data,
    columns: data.columns.map(c => (c.id === columnId ? nextColumn : c)),
    rows: data.rows.map(r => ({ ...r, cells: { ...r.cells, [columnId]: convert(r.cells[columnId]) } })),
  };
};

/**
 * Notion / Obsidian Bases-style database: typed columns, and table, board,
 * gallery, and calendar views with per-view filters, sorts, and hidden columns.
 */
const BaseEditor: React.FC<EditorProps> = ({ initialContent, onSave, projectFiles = [], onOpenFile }) => {
  const [data, setData] = useState<BaseData>(() => parseBase(initialContent));
  const dataRef = useRef(data);
  const history = useUndoRedo<BaseData>(data);
  const [search, setSearch] = useState('');
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [filePicker, setFilePicker] = useState<{ rowId: string; columnId: string; anchor: HTMLElement } | null>(null);
  const [panel, setPanel] = useState<{ kind: 'filter' | 'sort' | 'options'; anchor: HTMLElement } | null>(null);
  const [editingOptions, setEditingOptions] = useState<string | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  // --- State plumbing --------------------------------------------------------

  const historyTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const flushSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    onSave(dataRef.current);
  }, [onSave]);

  const commit = useCallback((next: BaseData, { batch = false } = {}) => {
    dataRef.current = next;
    setData(next);
    if (historyTimer.current) window.clearTimeout(historyTimer.current);
    // Typing is batched into one undo step.
    historyTimer.current = window.setTimeout(() => history.pushState(dataRef.current), batch ? 500 : 0);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [history, flushSave]);

  const update = useCallback((fn: (d: BaseData) => BaseData, opts?: { batch?: boolean }) => commit(fn(dataRef.current), opts), [commit]);

  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;
  useEffect(() => () => {
    if (saveTimer.current) flushRef.current();
  }, []);

  const restore = (next: BaseData | undefined) => {
    if (!next) return;
    dataRef.current = next;
    setData(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); restore(history.undo()); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); restore(history.redo()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const view = data.views.find(v => v.id === data.activeViewId) || data.views[0];
  const fileName = useCallback((id: string) => projectFiles.find(f => f.id === id)?.name, [projectFiles]);
  const rows = useMemo(() => visibleRows(data, view, search, fileName), [data, view, search, fileName]);
  const titleColumn = data.columns[0];
  const shownColumns = data.columns.filter(c => !(view.hidden || []).includes(c.id));

  // --- Mutations -------------------------------------------------------------

  const setCell = (rowId: string, columnId: string, value: CellValue) =>
    update(d => ({ ...d, rows: d.rows.map(r => (r.id === rowId ? { ...r, cells: { ...r.cells, [columnId]: value } } : r)) }), { batch: true });

  const setNotes = (rowId: string, notes: string) =>
    update(d => ({ ...d, rows: d.rows.map(r => (r.id === rowId ? { ...r, notes } : r)) }), { batch: true });

  const addRow = (cells: Record<string, CellValue> = {}, open = false) => {
    // New rows satisfy simple "is" filters so they don't vanish immediately.
    const preset: Record<string, CellValue> = {};
    for (const f of view.filters || []) {
      const column = data.columns.find(c => c.id === f.columnId);
      if (!column || !f.value) continue;
      if (f.op === 'is' && column.type === 'select') preset[column.id] = f.value;
      if (f.op === 'contains' && column.type === 'multi_select') preset[column.id] = [f.value];
    }
    const row = makeRow(data.columns, { ...preset, ...cells });
    update(d => ({ ...d, rows: [...d.rows, row] }));
    if (open) setOpenRowId(row.id);
    return row.id;
  };

  const deleteRow = (rowId: string) => {
    update(d => ({ ...d, rows: d.rows.filter(r => r.id !== rowId) }));
    if (openRowId === rowId) setOpenRowId(null);
  };

  const duplicateRow = (rowId: string) => update(d => {
    const index = d.rows.findIndex(r => r.id === rowId);
    if (index < 0) return d;
    const copy = { ...d.rows[index], id: uid(), cells: { ...d.rows[index].cells }, createdAt: Date.now() };
    return { ...d, rows: [...d.rows.slice(0, index + 1), copy, ...d.rows.slice(index + 1)] };
  });

  const updateView = (patch: Partial<BaseView>) =>
    update(d => ({ ...d, views: d.views.map(v => (v.id === view.id ? { ...v, ...patch } : v)) }));

  const createOption = async (columnId: string): Promise<string | null> => {
    const label = await promptDialog({ title: 'New option', label: 'Option name', confirmText: 'Add' });
    if (!label) return null;
    const column = dataRef.current.columns.find(c => c.id === columnId);
    const existing = column?.options?.find(o => o.label.toLowerCase() === label.toLowerCase());
    if (existing) return existing.id;
    const option = { id: uid(), label, color: OPTION_COLORS[(column?.options?.length || 0) % OPTION_COLORS.length] };
    update(d => ({ ...d, columns: d.columns.map(c => (c.id === columnId ? { ...c, options: [...(c.options || []), option] } : c)) }));
    return option.id;
  };

  const addColumn = (type: BaseColumnType, at?: number) => {
    const label = COLUMN_TYPES.find(t => t.type === type)?.label || 'Column';
    const names = new Set(data.columns.map(c => c.name.toLowerCase()));
    let name = label;
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${label} ${i}`;
    const column: BaseColumn = { id: uid(), name, type, options: type === 'select' || type === 'multi_select' ? [] : undefined };
    update(d => {
      const columns = [...d.columns];
      columns.splice(at ?? columns.length, 0, column);
      return { ...d, columns, rows: d.rows.map(r => ({ ...r, cells: { ...r.cells, [column.id]: emptyValue(type) } })) };
    });
  };

  const renameColumn = async (column: BaseColumn) => {
    const name = await promptDialog({ title: 'Rename property', label: 'Name', defaultValue: column.name, confirmText: 'Rename' });
    if (name) update(d => ({ ...d, columns: d.columns.map(c => (c.id === column.id ? { ...c, name } : c)) }));
  };

  const deleteColumn = async (column: BaseColumn) => {
    if (data.columns.length <= 1) return;
    const ok = await confirmDialog({ title: `Delete "${column.name}"?`, message: 'Its value is removed from every row.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    update(d => ({
      ...d,
      columns: d.columns.filter(c => c.id !== column.id),
      rows: d.rows.map(r => { const cells = { ...r.cells }; delete cells[column.id]; return { ...r, cells }; }),
      views: d.views.map(v => ({
        ...v,
        filters: v.filters?.filter(f => f.columnId !== column.id),
        sorts: v.sorts?.filter(s => s.columnId !== column.id),
        hidden: v.hidden?.filter(h => h !== column.id),
        groupBy: v.groupBy === column.id ? undefined : v.groupBy,
        dateColumn: v.dateColumn === column.id ? undefined : v.dateColumn,
        coverColumn: v.coverColumn === column.id ? undefined : v.coverColumn,
      })),
    }));
  };

  const moveColumn = (columnId: string, delta: number) => update(d => {
    const i = d.columns.findIndex(c => c.id === columnId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= d.columns.length) return d;
    const columns = [...d.columns];
    [columns[i], columns[j]] = [columns[j], columns[i]];
    return { ...d, columns };
  });

  const columnMenu = (e: React.MouseEvent, column: BaseColumn) => {
    const index = data.columns.findIndex(c => c.id === column.id);
    const sorted = view.sorts?.find(s => s.columnId === column.id);
    showMenu(e, [
      { label: 'Rename', icon: Pencil, onSelect: () => void renameColumn(column) },
      {
        label: 'Change type…', icon: TYPE_ICONS[column.type], onSelect: () => showMenu(e, COLUMN_TYPES.map(t => ({
          label: t.label, icon: TYPE_ICONS[t.type], checked: t.type === column.type,
          onSelect: () => t.type !== column.type && update(d => convertColumn(d, column.id, t.type)),
        })), 'below'),
      },
      ...(column.type === 'select' || column.type === 'multi_select' ? [{ label: 'Edit options…', icon: Palette, onSelect: () => setEditingOptions(column.id) }] : []),
      { kind: 'separator' },
      { label: 'Sort ascending', icon: ArrowUp, checked: sorted?.dir === 'asc', onSelect: () => updateView({ sorts: [{ columnId: column.id, dir: 'asc' }] }) },
      { label: 'Sort descending', icon: ArrowDown, checked: sorted?.dir === 'desc', onSelect: () => updateView({ sorts: [{ columnId: column.id, dir: 'desc' }] }) },
      { label: 'Filter by this…', icon: Filter, onSelect: () => addFilter(column.id) },
      { label: 'Hide in this view', icon: EyeOff, onSelect: () => updateView({ hidden: [...(view.hidden || []), column.id] }), disabled: index === 0 },
      { kind: 'separator' },
      { label: 'Move left', icon: ArrowLeftToLine, onSelect: () => moveColumn(column.id, -1), disabled: index === 0 },
      { label: 'Move right', icon: ArrowRightToLine, onSelect: () => moveColumn(column.id, 1), disabled: index === data.columns.length - 1 },
      { kind: 'separator' },
      { label: 'Delete property', icon: Trash2, danger: true, disabled: data.columns.length <= 1, onSelect: () => void deleteColumn(column) },
    ]);
  };

  const addColumnMenu = (e: React.MouseEvent) => showMenu(e, [
    { kind: 'heading', label: 'New property' },
    ...COLUMN_TYPES.map(t => ({ label: t.label, icon: TYPE_ICONS[t.type], onSelect: () => addColumn(t.type) })),
  ], 'below');

  const rowMenu = (e: React.MouseEvent, row: BaseRow) => showMenu(e, [
    { label: 'Open', icon: Maximize2, onSelect: () => setOpenRowId(row.id) },
    { label: 'Duplicate', icon: Copy, onSelect: () => duplicateRow(row.id) },
    { kind: 'separator' },
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => deleteRow(row.id) },
  ]);

  // --- Views -----------------------------------------------------------------

  const addView = (type: BaseViewType) => {
    const firstOf = (t: BaseColumnType) => data.columns.find(c => c.type === t)?.id;
    const v: BaseView = {
      id: uid(),
      name: { table: 'Table', board: 'Board', gallery: 'Gallery', calendar: 'Calendar' }[type],
      type,
      groupBy: type === 'board' ? firstOf('select') : undefined,
      dateColumn: type === 'calendar' ? firstOf('date') : undefined,
    };
    update(d => ({ ...d, views: [...d.views, v], activeViewId: v.id }));
  };

  const viewMenu = (e: React.MouseEvent, v: BaseView) => showMenu(e, [
    {
      label: 'Rename', icon: Pencil, onSelect: async () => {
        const name = await promptDialog({ title: 'Rename view', label: 'Name', defaultValue: v.name, confirmText: 'Rename' });
        if (name) update(d => ({ ...d, views: d.views.map(x => (x.id === v.id ? { ...x, name } : x)) }));
      },
    },
    { label: 'Duplicate', icon: Copy, onSelect: () => { const copy = { ...v, id: uid(), name: `${v.name} copy` }; update(d => ({ ...d, views: [...d.views, copy], activeViewId: copy.id })); } },
    { kind: 'separator' },
    {
      label: 'Delete view', icon: Trash2, danger: true, disabled: data.views.length <= 1,
      onSelect: () => update(d => {
        const views = d.views.filter(x => x.id !== v.id);
        return { ...d, views, activeViewId: d.activeViewId === v.id ? views[0].id : d.activeViewId };
      }),
    },
  ]);

  const addFilter = (columnId?: string) => {
    const column = data.columns.find(c => c.id === columnId) || data.columns[0];
    const filter: BaseFilter = { id: uid(), columnId: column.id, op: FILTER_OPS[column.type][0].op };
    updateView({ filters: [...(view.filters || []), filter] });
  };

  // --- Rendering helpers -----------------------------------------------------

  const cellProps = (row: BaseRow, column: BaseColumn) => ({
    column,
    value: row.cells[column.id],
    onChange: (value: CellValue) => setCell(row.id, column.id, value),
    onCreateOption: createOption,
    onPickFile: (anchor: HTMLElement) => setFilePicker({ rowId: row.id, columnId: column.id, anchor }),
    fileName,
    onOpenFile,
  });

  const titleOf = (row: BaseRow) => cellText(titleColumn, row.cells[titleColumn.id], fileName) || 'Untitled';

  // Plain render functions (not components): a component defined during
  // render would remount on every update and cancel in-progress drags.
  const renderPreview = (row: BaseRow) => (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {shownColumns.slice(1).map(column => {
        const value = row.cells[column.id];
        if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0) || value === false) return null;
        if (column.type === 'select') {
          const o = column.options?.find(opt => opt.id === value);
          return o ? <Chip key={column.id} label={o.label} color={o.color} /> : null;
        }
        if (column.type === 'multi_select') {
          return (value as string[]).map(id => {
            const o = column.options?.find(opt => opt.id === id);
            return o ? <Chip key={`${column.id}-${id}`} label={o.label} color={o.color} /> : null;
          });
        }
        return (
          <span key={column.id} className="inline-flex max-w-full items-center gap-1 truncate rounded bg-surface-hover px-1.5 text-[11px] leading-5 text-muted">
            {column.type === 'checkbox' ? `✓ ${column.name}` : cellText(column, value, fileName)}
          </span>
        );
      })}
    </div>
  );

  const renderTable = () => (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="w-8 border-b border-border" />
            {shownColumns.map(column => {
              const Icon = TYPE_ICONS[column.type];
              const sort = view.sorts?.find(s => s.columnId === column.id);
              return (
                <th key={column.id} className="border-b border-r border-border p-0 font-normal" style={{ minWidth: column.width || (column.type === 'checkbox' ? 90 : 170) }}>
                  <button type="button" onClick={e => columnMenu(e, column)} onContextMenu={e => columnMenu(e, column)} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-hover hover:text-content">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
                    <span className="truncate">{column.name}</span>
                    {sort && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 text-accent" /> : <ArrowDown className="h-3 w-3 text-accent" />)}
                  </button>
                </th>
              );
            })}
            <th className="border-b border-border p-0">
              <button type="button" onClick={addColumnMenu} className="flex items-center gap-1 px-2 py-1.5 text-[12px] text-faint hover:text-content" title="Add property">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="group hover:bg-surface/60" onContextMenu={e => { if ((e.target as HTMLElement).closest('input,textarea')) return; rowMenu(e, row); }}>
              <td className="border-b border-border p-0 align-middle">
                <button type="button" onClick={() => setOpenRowId(row.id)} className="flex h-8 w-8 items-center justify-center text-faint opacity-0 hover:text-content group-hover:opacity-100 focus:opacity-100" title="Open row" aria-label="Open row">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </td>
              {shownColumns.map(column => (
                <td key={column.id} className="border-b border-r border-border p-0 align-top focus-within:bg-accent/5 focus-within:outline focus-within:outline-1 focus-within:outline-accent/50">
                  <Cell {...cellProps(row, column)} />
                </td>
              ))}
              <td className="border-b border-border" />
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-bg">
          <tr>
            <td className="border-b border-border p-0" colSpan={shownColumns.length + 2}>
              <button type="button" onClick={() => addRow()} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[0.8125rem] text-faint hover:bg-surface-hover hover:text-content">
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </td>
          </tr>
          <tr>
            <td />
            {shownColumns.map(column => {
              const kind = view.aggregates?.[column.id] || 'none';
              const options: Aggregate[] = column.type === 'number' ? ['none', 'count', 'filled', 'sum', 'avg', 'min', 'max']
                : column.type === 'checkbox' ? ['none', 'count', 'checked'] : ['none', 'count', 'filled'];
              const labels: Record<Aggregate, string> = { none: 'None', count: 'Count', filled: 'Count filled', sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max', checked: 'Checked' };
              return (
                <td key={column.id} className="p-0">
                  <button
                    type="button"
                    onClick={e => showMenu(e, options.map(a => ({ label: labels[a], checked: a === kind, onSelect: () => updateView({ aggregates: { ...(view.aggregates || {}), [column.id]: a } }) })), 'below')}
                    className="w-full px-2 py-1 text-right text-[11px] text-faint opacity-60 hover:bg-surface-hover hover:opacity-100"
                  >
                    {kind === 'none' ? 'Calculate' : <><span className="mr-1 uppercase">{labels[kind]}</span><span className="text-content">{aggregate(column, rows, kind)}</span></>}
                  </button>
                </td>
              );
            })}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const dragProps = (row: BaseRow) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragRow(row.id); e.dataTransfer.setData(ROW_DRAG_MIME, row.id); e.dataTransfer.effectAllowed = 'move'; },
    onDragEnd: () => { setDragRow(null); setDropKey(null); },
  });

  const dropProps = (key: string, apply: (rowId: string) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(ROW_DRAG_MIME)) return;
      e.preventDefault();
      if (dropKey !== key) setDropKey(key);
    },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey(null); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const rowId = e.dataTransfer.getData(ROW_DRAG_MIME);
      setDropKey(null);
      setDragRow(null);
      if (rowId) apply(rowId);
    },
  });

  const renderCard = (row: BaseRow, cover = false) => {
    const coverColumn = data.columns.find(c => c.id === view.coverColumn);
    const coverValue = coverColumn ? String(row.cells[coverColumn.id] ?? '') : '';
    const coverSrc = /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(coverValue) ? coverValue : undefined;
    return (
      <div
        key={row.id}
        {...dragProps(row)}
        onClick={() => setOpenRowId(row.id)}
        onContextMenu={e => rowMenu(e, row)}
        className={cn('cursor-pointer overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong', dragRow === row.id && 'opacity-40')}
      >
        {cover && (
          <div className="flex h-28 items-center justify-center bg-surface-raised">
            {coverSrc ? <img src={coverSrc} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl font-semibold text-faint">{titleOf(row).slice(0, 1).toUpperCase()}</span>}
          </div>
        )}
        <div className="px-3 py-2">
          <div className="truncate text-[0.8125rem] font-medium text-content">{titleOf(row)}</div>
          {renderPreview(row)}
        </div>
      </div>
    );
  };

  const renderBoard = () => {
    const group = data.columns.find(c => c.id === view.groupBy && c.type === 'select');
    if (!group) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[0.8125rem] text-faint">
          <Kanban className="h-8 w-8" />
          Boards group rows by a Select property.
          {data.columns.some(c => c.type === 'select')
            ? <Button size="sm" variant="secondary" onClick={() => updateView({ groupBy: data.columns.find(c => c.type === 'select')!.id })}>Group by {data.columns.find(c => c.type === 'select')!.name}</Button>
            : <Button size="sm" variant="secondary" onClick={() => addColumn('select')}>Add a Select property</Button>}
        </div>
      );
    }
    const lanes = [...(group.options || []).map(o => ({ key: o.id, label: o.label, color: o.color })), { key: '__none__', label: `No ${group.name}`, color: '#9ca3af' }];
    return (
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {lanes.map(lane => {
          const laneRows = rows.filter(r => (lane.key === '__none__' ? !r.cells[group.id] || !group.options?.some(o => o.id === r.cells[group.id]) : r.cells[group.id] === lane.key));
          return (
            <div
              key={lane.key}
              {...dropProps(lane.key, rowId => setCell(rowId, group.id, lane.key === '__none__' ? null : lane.key))}
              className={cn('flex w-64 shrink-0 flex-col rounded-lg bg-chrome/60 p-2 transition-colors', dropKey === lane.key && 'bg-accent/10 ring-1 ring-accent/40')}
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <Chip label={lane.label} color={lane.color} />
                <span className="text-[11px] text-faint">{laneRows.length}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {laneRows.map(row => renderCard(row))}
              </div>
              <button type="button" onClick={() => addRow({ [group.id]: lane.key === '__none__' ? null : lane.key }, true)} className="mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-faint hover:bg-surface-hover hover:text-content">
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderGallery = () => (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {rows.map(row => renderCard(row, true))}
        <button type="button" onClick={() => addRow({}, true)} className="flex min-h-[10rem] items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[0.8125rem] text-faint hover:border-border-strong hover:text-content">
          <Plus className="h-4 w-4" /> New
        </button>
      </div>
    </div>
  );

  const renderCalendar = () => {
    const dateCol = data.columns.find(c => c.id === view.dateColumn && c.type === 'date');
    if (!dateCol) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[0.8125rem] text-faint">
          <CalendarDays className="h-8 w-8" />
          Calendars place rows by a Date property.
          {data.columns.some(c => c.type === 'date')
            ? <Button size="sm" variant="secondary" onClick={() => updateView({ dateColumn: data.columns.find(c => c.type === 'date')!.id })}>Use {data.columns.find(c => c.type === 'date')!.name}</Button>
            : <Button size="sm" variant="secondary" onClick={() => addColumn('date')}>Add a Date property</Button>}
        </div>
      );
    }
    const first = new Date(month.y, month.m, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // weeks start Monday
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const today = isoDate(new Date());
    const byDay = new Map<string, BaseRow[]>();
    rows.forEach(r => {
      const v = r.cells[dateCol.id];
      if (typeof v === 'string' && v) byDay.set(v.slice(0, 10), [...(byDay.get(v.slice(0, 10)) || []), r]);
    });
    const undated = rows.filter(r => !r.cells[dateCol.id]).length;
    return (
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[0.9375rem] font-semibold text-content">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <div className="ml-auto flex items-center gap-1">
            {undated > 0 && <span className="mr-2 text-[11px] text-faint">{undated} without a date</span>}
            <button type="button" className="icon-btn" onClick={() => setMonth(m => (m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <Button size="sm" variant="secondary" onClick={() => { const d = new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); }}>Today</Button>
            <button type="button" className="icon-btn" onClick={() => setMonth(m => (m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-l border-t border-border text-[11px] text-faint">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="border-b border-r border-border px-2 py-1">{d}</div>)}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 border-l border-border">
          {days.map(day => {
            const key = isoDate(day);
            const inMonth = day.getMonth() === month.m;
            const items = byDay.get(key) || [];
            return (
              <div
                key={key}
                {...dropProps(key, rowId => setCell(rowId, dateCol.id, key))}
                onDoubleClick={() => addRow({ [dateCol.id]: key }, true)}
                className={cn('group relative min-h-0 overflow-hidden border-b border-r border-border p-1', !inMonth && 'bg-chrome/40', dropKey === key && 'bg-accent/10')}
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]', key === today ? 'bg-accent text-accent-content' : inMonth ? 'text-muted' : 'text-faint')}>{day.getDate()}</span>
                  <button type="button" onClick={() => addRow({ [dateCol.id]: key }, true)} className="rounded p-0.5 text-faint opacity-0 hover:text-content group-hover:opacity-100" aria-label={`New row on ${key}`}>
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-y-auto">
                  {items.map(row => (
                    <button
                      key={row.id}
                      type="button"
                      {...dragProps(row)}
                      onClick={() => setOpenRowId(row.id)}
                      onContextMenu={e => rowMenu(e, row)}
                      className={cn('truncate rounded bg-accent/15 px-1.5 py-px text-left text-[11px] text-content hover:bg-accent/25', dragRow === row.id && 'opacity-40')}
                    >
                      {titleOf(row)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const openRow = data.rows.find(r => r.id === openRowId);
  const optionsColumn = data.columns.find(c => c.id === editingOptions);
  const filterCount = view.filters?.length || 0;
  const sortCount = view.sorts?.length || 0;

  return (
    <div className="relative flex h-full flex-col bg-bg">
      {/* View tabs + actions */}
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/70 px-2 [scrollbar-width:none]">
        {data.views.map(v => {
          const Icon = VIEW_ICONS[v.type];
          const active = v.id === view.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => update(d => ({ ...d, activeViewId: v.id }))}
              onContextMenu={e => viewMenu(e, v)}
              onDoubleClick={e => viewMenu(e, v)}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[0.8125rem] transition-colors', active ? 'bg-surface-hover text-content' : 'text-muted hover:bg-surface-hover/60 hover:text-content')}
            >
              <Icon className="h-3.5 w-3.5" />
              {v.name}
            </button>
          );
        })}
        <button
          type="button"
          className="icon-btn"
          title="Add view"
          aria-label="Add view"
          onClick={e => showMenu(e, (['table', 'board', 'gallery', 'calendar'] as BaseViewType[]).map(t => ({
            label: { table: 'Table', board: 'Board', gallery: 'Gallery', calendar: 'Calendar' }[t], icon: VIEW_ICONS[t], onSelect: () => addView(t),
          })), 'below')}
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" aria-label="Search rows" className="h-7 w-36 rounded-md border border-border bg-surface-raised pl-7 pr-2 text-[0.8125rem] text-content outline-none placeholder:text-faint focus:w-48 focus:border-accent transition-[width]" />
          </div>
          <button type="button" className={cn('icon-btn w-auto px-1.5 gap-1 text-[12px]', filterCount > 0 && 'text-accent')} onClick={e => setPanel({ kind: 'filter', anchor: e.currentTarget })} title="Filter">
            <Filter className="h-4 w-4" />{filterCount > 0 && filterCount}
          </button>
          <button type="button" className={cn('icon-btn w-auto px-1.5 gap-1 text-[12px]', sortCount > 0 && 'text-accent')} onClick={e => setPanel({ kind: 'sort', anchor: e.currentTarget })} title="Sort">
            <ArrowUpDown className="h-4 w-4" />{sortCount > 0 && sortCount}
          </button>
          <button type="button" className="icon-btn" onClick={e => setPanel({ kind: 'options', anchor: e.currentTarget })} title="View options" aria-label="View options">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button type="button" className="icon-btn" onClick={() => restore(history.undo())} disabled={!history.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
          <button type="button" className="icon-btn" onClick={() => restore(history.redo())} disabled={!history.canRedo} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
          <Button size="sm" icon={Plus} onClick={() => addRow({}, view.type !== 'table')}>New</Button>
        </div>
      </div>

      {view.type === 'table' && renderTable()}
      {view.type === 'board' && renderBoard()}
      {view.type === 'gallery' && renderGallery()}
      {view.type === 'calendar' && renderCalendar()}

      <div className="shrink-0 border-t border-border/70 px-3 py-1 text-[11px] text-faint">
        {rows.length === data.rows.length ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}` : `${rows.length} of ${data.rows.length} rows`}
      </div>

      {/* Row detail panel */}
      {openRow && (
        <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-border bg-bg shadow-pop animate-slide-in-right">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
            <button type="button" className="icon-btn" onClick={() => setOpenRowId(null)} aria-label="Close row"><X className="h-4 w-4" /></button>
            <span className="text-[12px] text-faint">Created {new Date(openRow.createdAt).toLocaleDateString()}</span>
            <button type="button" className="icon-btn ml-auto" onClick={e => rowMenu(e, openRow)} aria-label="Row options"><MoreHorizontal className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <input
              value={cellText(titleColumn, openRow.cells[titleColumn.id])}
              onChange={e => setCell(openRow.id, titleColumn.id, titleColumn.type === 'number' ? Number(e.target.value) : e.target.value)}
              placeholder="Untitled"
              aria-label={titleColumn.name}
              className="mb-4 w-full bg-transparent text-xl font-semibold text-content outline-none placeholder:text-faint"
              readOnly={titleColumn.type !== 'text' && titleColumn.type !== 'number'}
            />
            <div className="space-y-1.5">
              {data.columns.slice(1).map(column => {
                const Icon = TYPE_ICONS[column.type];
                return (
                  <div key={column.id} className="flex items-start gap-3">
                    <button type="button" onClick={e => columnMenu(e, column)} className="flex w-32 shrink-0 items-center gap-1.5 rounded px-1 py-1.5 text-left text-[12px] text-muted hover:bg-surface-hover">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <span className="truncate">{column.name}</span>
                    </button>
                    <div className="min-w-0 flex-1"><Cell {...cellProps(openRow, column)} roomy /></div>
                  </div>
                );
              })}
              <button type="button" onClick={addColumnMenu} className="flex items-center gap-1.5 px-1 py-1 text-[12px] text-faint hover:text-content">
                <Plus className="h-3.5 w-3.5" /> Add property
              </button>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <div className="eyebrow mb-2">Notes</div>
              <textarea
                value={openRow.notes || ''}
                onChange={e => setNotes(openRow.id, e.target.value)}
                placeholder="Markdown notes for this row…"
                rows={6}
                className="w-full resize-y rounded-md border border-border bg-surface-raised p-2 text-[0.8125rem] text-content outline-none placeholder:text-faint focus:border-accent"
              />
              {openRow.notes?.trim() && (
                <div className="mt-3 rounded-md border border-border/60 px-3 py-2 text-[0.875rem]">
                  <MarkdownView source={openRow.notes} files={projectFiles} hideProperties onOpenHref={href => href.startsWith('file://') && onOpenFile?.(href.slice(7))} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter / sort / view option panels */}
      <Popover anchor={panel?.anchor ?? null} onClose={() => setPanel(null)} className="w-[26rem] max-w-[calc(100vw-1rem)]">
        {panel?.kind === 'filter' && (
          <div className="space-y-1.5">
            {(view.filters || []).length === 0 && <p className="px-1 py-1 text-[12px] text-faint">No filters in this view.</p>}
            {(view.filters || []).map(f => {
              const column = data.columns.find(c => c.id === f.columnId) || data.columns[0];
              const setFilter = (patch: Partial<BaseFilter>) => updateView({ filters: view.filters!.map(x => (x.id === f.id ? { ...x, ...patch } : x)) });
              return (
                <div key={f.id} className="flex items-center gap-1">
                  <select value={column.id} onChange={e => { const c = data.columns.find(x => x.id === e.target.value)!; setFilter({ columnId: c.id, op: FILTER_OPS[c.type][0].op, value: undefined }); }} className="h-7 w-28 rounded border border-border bg-bg px-1 text-[12px] text-content">
                    {data.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={f.op} onChange={e => setFilter({ op: e.target.value as BaseFilter['op'] })} className="h-7 w-28 rounded border border-border bg-bg px-1 text-[12px] text-content">
                    {FILTER_OPS[column.type].map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  {!NO_VALUE_OPS.has(f.op) && (column.type === 'select' || column.type === 'multi_select' ? (
                    <select value={f.value || ''} onChange={e => setFilter({ value: e.target.value })} className="h-7 min-w-0 flex-1 rounded border border-border bg-bg px-1 text-[12px] text-content">
                      <option value="">Choose…</option>
                      {(column.options || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input type={column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'} value={f.value || ''} onChange={e => setFilter({ value: e.target.value })} placeholder="Value" className="h-7 min-w-0 flex-1 rounded border border-border bg-bg px-1.5 text-[12px] text-content outline-none focus:border-accent" />
                  ))}
                  <button type="button" className="icon-btn h-7 w-7" onClick={() => updateView({ filters: view.filters!.filter(x => x.id !== f.id) })} aria-label="Remove filter"><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
            <button type="button" onClick={() => addFilter()} className="flex items-center gap-1 rounded px-1 py-1 text-[12px] text-accent hover:underline"><Plus className="h-3.5 w-3.5" /> Add filter</button>
          </div>
        )}
        {panel?.kind === 'sort' && (
          <div className="space-y-1.5">
            {(view.sorts || []).length === 0 && <p className="px-1 py-1 text-[12px] text-faint">Rows keep their manual order.</p>}
            {(view.sorts || []).map((s, i) => (
              <div key={`${s.columnId}-${i}`} className="flex items-center gap-1">
                <select value={s.columnId} onChange={e => updateView({ sorts: view.sorts!.map((x, j) => (j === i ? { ...x, columnId: e.target.value } : x)) })} className="h-7 flex-1 rounded border border-border bg-bg px-1 text-[12px] text-content">
                  {data.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={s.dir} onChange={e => updateView({ sorts: view.sorts!.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)) })} className="h-7 w-32 rounded border border-border bg-bg px-1 text-[12px] text-content">
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
                <button type="button" className="icon-btn h-7 w-7" onClick={() => updateView({ sorts: view.sorts!.filter((_, j) => j !== i) })} aria-label="Remove sort"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <button type="button" onClick={() => updateView({ sorts: [...(view.sorts || []), { columnId: data.columns[0].id, dir: 'asc' }] })} className="flex items-center gap-1 rounded px-1 py-1 text-[12px] text-accent hover:underline"><Plus className="h-3.5 w-3.5" /> Add sort</button>
          </div>
        )}
        {panel?.kind === 'options' && (
          <div className="space-y-2">
            {view.type === 'board' && (
              <label className="flex items-center justify-between gap-2 text-[12px] text-muted">Group by
                <select value={view.groupBy || ''} onChange={e => updateView({ groupBy: e.target.value || undefined })} className="h-7 w-40 rounded border border-border bg-bg px-1 text-[12px] text-content">
                  <option value="">None</option>
                  {data.columns.filter(c => c.type === 'select').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {view.type === 'calendar' && (
              <label className="flex items-center justify-between gap-2 text-[12px] text-muted">Date property
                <select value={view.dateColumn || ''} onChange={e => updateView({ dateColumn: e.target.value || undefined })} className="h-7 w-40 rounded border border-border bg-bg px-1 text-[12px] text-content">
                  <option value="">None</option>
                  {data.columns.filter(c => c.type === 'date').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {view.type === 'gallery' && (
              <label className="flex items-center justify-between gap-2 text-[12px] text-muted">Card cover (image URL)
                <select value={view.coverColumn || ''} onChange={e => updateView({ coverColumn: e.target.value || undefined })} className="h-7 w-40 rounded border border-border bg-bg px-1 text-[12px] text-content">
                  <option value="">None</option>
                  {data.columns.filter(c => c.type === 'url' || c.type === 'text').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <div className="eyebrow px-1 pt-1">Properties shown</div>
            {data.columns.map((c, i) => {
              const hidden = (view.hidden || []).includes(c.id);
              const Icon = TYPE_ICONS[c.type];
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={i === 0}
                  onClick={() => updateView({ hidden: hidden ? view.hidden!.filter(h => h !== c.id) : [...(view.hidden || []), c.id] })}
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[12px] text-content hover:bg-surface-hover disabled:opacity-60"
                >
                  <Icon className="h-3.5 w-3.5 text-faint" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {hidden ? <EyeOff className="h-3.5 w-3.5 text-faint" /> : <Eye className="h-3.5 w-3.5 text-muted" />}
                </button>
              );
            })}
          </div>
        )}
      </Popover>

      <SearchPicker
        anchor={filePicker?.anchor ?? null}
        items={projectFiles.map<PickerItem>(f => ({ id: f.id, label: f.name, sub: getFileTypeMeta(f.type).label, icon: getFileTypeMeta(f.type).icon }))}
        placeholder="Link a file…"
        onPick={item => {
          if (!filePicker) return;
          const current = dataRef.current.rows.find(r => r.id === filePicker.rowId)?.cells[filePicker.columnId];
          const ids = Array.isArray(current) ? current : [];
          if (!ids.includes(item.id)) setCell(filePicker.rowId, filePicker.columnId, [...ids, item.id]);
        }}
        onClose={() => setFilePicker(null)}
      />

      <Modal open={Boolean(optionsColumn)} onClose={() => setEditingOptions(null)} title={`Options — ${optionsColumn?.name ?? ''}`} size="sm">
        {optionsColumn && (
          <div className="space-y-2">
            {(optionsColumn.options || []).map(option => {
              const setOption = (patch: Partial<typeof option>) => update(d => ({
                ...d,
                columns: d.columns.map(c => (c.id === optionsColumn.id ? { ...c, options: c.options!.map(o => (o.id === option.id ? { ...o, ...patch } : o)) } : c)),
              }), { batch: true });
              return (
                <div key={option.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-5 w-5 shrink-0 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: option.color }}
                    aria-label="Change color"
                    onClick={e => showMenu(e, OPTION_COLORS.map(color => ({ label: color, icon: dot(color), checked: color === option.color, onSelect: () => setOption({ color }) })), 'below')}
                  />
                  <input value={option.label} onChange={e => setOption({ label: e.target.value })} className="h-8 flex-1 rounded-md border border-border bg-surface-raised px-2 text-[0.8125rem] text-content outline-none focus:border-accent" aria-label="Option name" />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete ${option.label}`}
                    onClick={() => update(d => ({
                      ...d,
                      columns: d.columns.map(c => (c.id === optionsColumn.id ? { ...c, options: c.options!.filter(o => o.id !== option.id) } : c)),
                      rows: d.rows.map(r => {
                        const v = r.cells[optionsColumn.id];
                        if (Array.isArray(v)) return { ...r, cells: { ...r.cells, [optionsColumn.id]: v.filter(id => id !== option.id) } };
                        return v === option.id ? { ...r, cells: { ...r.cells, [optionsColumn.id]: null } } : r;
                      }),
                    }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => void createOption(optionsColumn.id)}>Add option</Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BaseEditor;
