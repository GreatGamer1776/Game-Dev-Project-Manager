import { uid } from './id';

// "Base" — a Notion/Obsidian-Bases style database stored as JSON in a file.
// Plain data only (columns / rows / views); the editor calls onSave with a
// new object and the normal project-save pipeline persists it.

export type BaseColumnType = 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'checkbox' | 'url' | 'file';

export interface BaseOption {
  id: string;
  label: string;
  color: string;
}

export interface BaseColumn {
  id: string;
  name: string;
  type: BaseColumnType;
  options?: BaseOption[];
  width?: number;
}

export type CellValue = string | number | boolean | string[] | null;

export interface BaseRow {
  id: string;
  cells: Record<string, CellValue>;
  /** Free-form markdown notes shown in the row panel. */
  notes?: string;
  createdAt: number;
}

export type BaseViewType = 'table' | 'board' | 'gallery' | 'calendar';
export type FilterOp = 'contains' | 'not_contains' | 'is' | 'is_not' | 'gt' | 'lt' | 'empty' | 'not_empty' | 'checked' | 'unchecked';

export interface BaseFilter {
  id: string;
  columnId: string;
  op: FilterOp;
  value?: string;
}

export interface BaseSort {
  columnId: string;
  dir: 'asc' | 'desc';
}

export interface BaseView {
  id: string;
  name: string;
  type: BaseViewType;
  groupBy?: string;
  dateColumn?: string;
  coverColumn?: string;
  hidden?: string[];
  sorts?: BaseSort[];
  filters?: BaseFilter[];
  /** Table footer summaries per column. */
  aggregates?: Record<string, Aggregate>;
}

export interface BaseData {
  columns: BaseColumn[];
  rows: BaseRow[];
  views: BaseView[];
  activeViewId: string;
}

export const COLUMN_TYPES: { type: BaseColumnType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Select' },
  { type: 'multi_select', label: 'Multi-select' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'url', label: 'URL' },
  { type: 'file', label: 'File link' },
];

export const OPTION_COLORS = ['#9ca3af', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

export const FILTER_OPS: Record<BaseColumnType, { op: FilterOp; label: string }[]> = {
  text: [{ op: 'contains', label: 'contains' }, { op: 'not_contains', label: 'does not contain' }, { op: 'is', label: 'is' }, { op: 'empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
  url: [{ op: 'contains', label: 'contains' }, { op: 'empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
  number: [{ op: 'is', label: '=' }, { op: 'is_not', label: '≠' }, { op: 'gt', label: '>' }, { op: 'lt', label: '<' }, { op: 'empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
  select: [{ op: 'is', label: 'is' }, { op: 'is_not', label: 'is not' }, { op: 'empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
  multi_select: [{ op: 'contains', label: 'has' }, { op: 'not_contains', label: 'does not have' }, { op: 'empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
  date: [{ op: 'is', label: 'is' }, { op: 'lt', label: 'is before' }, { op: 'gt', label: 'is after' }, { op: 'empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
  checkbox: [{ op: 'checked', label: 'is checked' }, { op: 'unchecked', label: 'is unchecked' }],
  file: [{ op: 'empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
};

export const NO_VALUE_OPS = new Set<FilterOp>(['empty', 'not_empty', 'checked', 'unchecked']);

export const emptyValue = (type: BaseColumnType): CellValue => {
  if (type === 'checkbox') return false;
  if (type === 'multi_select' || type === 'file') return [];
  return null;
};

export const makeRow = (columns: BaseColumn[], cells: Record<string, CellValue> = {}): BaseRow => ({
  id: uid(),
  cells: Object.fromEntries(columns.map(c => [c.id, cells[c.id] ?? emptyValue(c.type)])),
  createdAt: Date.now(),
});

export const createDefaultBase = (): BaseData => {
  const name: BaseColumn = { id: uid(), name: 'Name', type: 'text', width: 240 };
  const status: BaseColumn = {
    id: uid(),
    name: 'Status',
    type: 'select',
    options: [
      { id: uid(), label: 'Not started', color: OPTION_COLORS[0] },
      { id: uid(), label: 'In progress', color: OPTION_COLORS[5] },
      { id: uid(), label: 'Done', color: OPTION_COLORS[4] },
    ],
  };
  const tags: BaseColumn = { id: uid(), name: 'Tags', type: 'multi_select', options: [] };
  const due: BaseColumn = { id: uid(), name: 'Due', type: 'date' };
  const columns = [name, status, tags, due];
  const table: BaseView = { id: uid(), name: 'Table', type: 'table' };
  return {
    columns,
    rows: [makeRow(columns, { [name.id]: 'First item', [status.id]: status.options![0].id })],
    views: [
      table,
      { id: uid(), name: 'Board', type: 'board', groupBy: status.id },
      { id: uid(), name: 'Gallery', type: 'gallery' },
      { id: uid(), name: 'Calendar', type: 'calendar', dateColumn: due.id },
    ],
    activeViewId: table.id,
  };
};

/** Accepts anything (old/partial data) and returns a well-formed base. */
export const parseBase = (raw: unknown): BaseData => {
  const data = raw && typeof raw === 'object' ? raw as Partial<BaseData> : null;
  if (!data || !Array.isArray(data.columns) || data.columns.length === 0) return createDefaultBase();
  const columns = data.columns.filter(c => c && typeof c.id === 'string').map(c => ({ ...c, name: String(c.name ?? 'Column'), type: (c.type || 'text') as BaseColumnType }));
  const rows = (Array.isArray(data.rows) ? data.rows : [])
    .filter(r => r && typeof r.id === 'string')
    .map(r => ({ ...r, cells: r.cells && typeof r.cells === 'object' ? r.cells : {}, createdAt: Number(r.createdAt) || Date.now() }));
  const views = Array.isArray(data.views) && data.views.length > 0 ? data.views : [{ id: uid(), name: 'Table', type: 'table' as const }];
  const activeViewId = views.some(v => v.id === data.activeViewId) ? data.activeViewId! : views[0].id;
  return { columns, rows, views, activeViewId };
};

const isEmpty = (v: CellValue | undefined) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

const optionLabel = (column: BaseColumn, id: unknown) => column.options?.find(o => o.id === id)?.label ?? '';

/** Text used for search and sorting. */
export const cellText = (column: BaseColumn, value: CellValue | undefined, fileName?: (id: string) => string | undefined): string => {
  if (isEmpty(value)) return '';
  switch (column.type) {
    case 'select': return optionLabel(column, value);
    case 'multi_select': return (value as string[]).map(id => optionLabel(column, id)).join(', ');
    case 'checkbox': return value ? 'Yes' : 'No';
    case 'file': return (value as string[]).map(id => fileName?.(id) ?? id).join(', ');
    default: return String(value);
  }
};

const compare = (column: BaseColumn, a: CellValue | undefined, b: CellValue | undefined) => {
  // Empty values always sort last, whichever direction.
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;
  if (column.type === 'number') return Number(a) - Number(b);
  if (column.type === 'checkbox') return Number(Boolean(a)) - Number(Boolean(b));
  if (column.type === 'date') return String(a).localeCompare(String(b));
  if (column.type === 'select') {
    const order = column.options?.map(o => o.id) ?? [];
    return order.indexOf(String(a)) - order.indexOf(String(b));
  }
  return cellText(column, a).localeCompare(cellText(column, b), undefined, { numeric: true, sensitivity: 'base' });
};

const matchesFilter = (column: BaseColumn, value: CellValue | undefined, filter: BaseFilter): boolean => {
  const target = (filter.value ?? '').toLowerCase();
  switch (filter.op) {
    case 'empty': return isEmpty(value);
    case 'not_empty': return !isEmpty(value);
    case 'checked': return value === true;
    case 'unchecked': return value !== true;
    default: break;
  }
  if (!target && column.type !== 'number') return true;
  if (column.type === 'number') {
    if (filter.value === undefined || filter.value === '') return true;
    const n = Number(value);
    const t = Number(filter.value);
    if (isEmpty(value)) return false;
    if (filter.op === 'is') return n === t;
    if (filter.op === 'is_not') return n !== t;
    if (filter.op === 'gt') return n > t;
    if (filter.op === 'lt') return n < t;
  }
  if (column.type === 'select') {
    const is = String(value ?? '') === filter.value;
    return filter.op === 'is_not' ? !is : is;
  }
  if (column.type === 'multi_select') {
    const has = Array.isArray(value) && value.includes(filter.value ?? '');
    return filter.op === 'not_contains' ? !has : has;
  }
  if (column.type === 'date') {
    const v = String(value ?? '');
    if (!v) return false;
    if (filter.op === 'lt') return v < (filter.value ?? '');
    if (filter.op === 'gt') return v > (filter.value ?? '');
    return v === filter.value;
  }
  const text = cellText(column, value).toLowerCase();
  if (filter.op === 'contains') return text.includes(target);
  if (filter.op === 'not_contains') return !text.includes(target);
  if (filter.op === 'is') return text === target;
  if (filter.op === 'is_not') return text !== target;
  return true;
};

/** Rows after the view's filters, the search box, and the view's sorts. */
export const visibleRows = (data: BaseData, view: BaseView, search: string, fileName?: (id: string) => string | undefined): BaseRow[] => {
  const byId = new Map(data.columns.map(c => [c.id, c]));
  const q = search.trim().toLowerCase();
  let rows = data.rows.filter(row => (view.filters || []).every(f => {
    const column = byId.get(f.columnId);
    return !column || matchesFilter(column, row.cells[f.columnId], f);
  }));
  if (q) {
    rows = rows.filter(row => data.columns.some(c => cellText(c, row.cells[c.id], fileName).toLowerCase().includes(q)) || (row.notes || '').toLowerCase().includes(q));
  }
  const sorts = (view.sorts || []).filter(s => byId.has(s.columnId));
  if (sorts.length > 0) {
    rows = [...rows].sort((a, b) => {
      for (const s of sorts) {
        const column = byId.get(s.columnId)!;
        const aEmpty = isEmpty(a.cells[s.columnId]);
        const bEmpty = isEmpty(b.cells[s.columnId]);
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        const result = compare(column, a.cells[s.columnId], b.cells[s.columnId]);
        if (result !== 0) return s.dir === 'asc' ? result : -result;
      }
      return 0;
    });
  }
  return rows;
};

export type Aggregate = 'none' | 'count' | 'filled' | 'sum' | 'avg' | 'min' | 'max' | 'checked';

export const aggregate = (column: BaseColumn, rows: BaseRow[], kind: Aggregate): string => {
  const values = rows.map(r => r.cells[column.id]);
  switch (kind) {
    case 'count': return `${rows.length}`;
    case 'filled': return `${values.filter(v => !isEmpty(v)).length} filled`;
    case 'checked': return `${values.filter(v => v === true).length} / ${rows.length}`;
    default: break;
  }
  const nums = values.filter(v => !isEmpty(v)).map(Number).filter(n => Number.isFinite(n));
  if (nums.length === 0) return '—';
  const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString();
  if (kind === 'sum') return fmt(nums.reduce((s, n) => s + n, 0));
  if (kind === 'avg') return fmt(nums.reduce((s, n) => s + n, 0) / nums.length);
  if (kind === 'min') return fmt(Math.min(...nums));
  if (kind === 'max') return fmt(Math.max(...nums));
  return '';
};
