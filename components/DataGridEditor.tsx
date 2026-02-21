import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Columns,
  Download,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Upload
} from 'lucide-react';
import { EditorProps } from '../types';

interface GridColumn {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean';
}

interface GridRow {
  id: string;
  [key: string]: any;
}

interface GridData {
  columns: GridColumn[];
  rows: GridRow[];
}

type SortDirection = 'asc' | 'desc' | null;
type SaveStatus = 'saved' | 'saving' | 'unsaved';

const ROW_HEIGHT = 50;
const ROW_OVERSCAN = 10;

const normalizeInitialData = (content: any): GridData => {
  const defaultColumns: GridColumn[] = [
    { id: 'col_1', name: 'Name', type: 'text' },
    { id: 'col_2', name: 'Priority', type: 'text' },
    { id: 'col_3', name: 'Estimate', type: 'number' }
  ];

  const rawColumns = Array.isArray(content?.columns) ? content.columns : [];
  const columns: GridColumn[] = rawColumns.length
    ? rawColumns.map((column: any, index: number) => ({
        id: typeof column?.id === 'string' ? column.id : `col_${index + 1}`,
        name: typeof column?.name === 'string' && column.name.trim() ? column.name : `Column ${index + 1}`,
        type: column?.type === 'number' || column?.type === 'boolean' ? column.type : 'text'
      }))
    : defaultColumns;

  const rawRows = Array.isArray(content?.rows) ? content.rows : [];
  const rows: GridRow[] = rawRows.map((row: any) => {
    const normalized: GridRow = { id: typeof row?.id === 'string' ? row.id : crypto.randomUUID() };
    for (const col of columns) {
      normalized[col.id] = row?.[col.id] ?? defaultValueForType(col.type);
    }
    return normalized;
  });

  return { columns, rows };
};

const defaultValueForType = (type: GridColumn['type']) => {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  return '';
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(normalized);
};

const toNumber = (value: unknown): number | '' => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return '';
};

const castForColumnType = (value: unknown, type: GridColumn['type']) => {
  if (type === 'boolean') return toBoolean(value);
  if (type === 'number') return toNumber(value);
  return value == null ? '' : String(value);
};

const compareValues = (a: unknown, b: unknown, type: GridColumn['type']) => {
  if (type === 'number') {
    const aNum = toNumber(a);
    const bNum = toNumber(b);
    const aVal = aNum === '' ? Number.POSITIVE_INFINITY : aNum;
    const bVal = bNum === '' ? Number.POSITIVE_INFINITY : bNum;
    return aVal - bVal;
  }
  if (type === 'boolean') {
    return Number(toBoolean(a)) - Number(toBoolean(b));
  }
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
};

const escapeCsvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
};

const detectImportedType = (values: string[]): GridColumn['type'] => {
  const nonEmpty = values.map(v => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return 'text';

  const allBoolean = nonEmpty.every(v => ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(v.toLowerCase()));
  if (allBoolean) return 'boolean';

  const allNumber = nonEmpty.every(v => Number.isFinite(Number(v)));
  if (allNumber) return 'number';

  return 'text';
};

const parseCsvToGrid = (text: string): GridData => {
  const lines = text.replace(/\r/g, '').split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('CSV is empty.');
  }

  const headers = parseCsvLine(lines[0]).map((header, index) => header.trim() || `Column ${index + 1}`);
  const parsedRows = lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    while (cells.length < headers.length) cells.push('');
    return cells.slice(0, headers.length);
  });

  const detectedTypes = headers.map((_, index) => detectImportedType(parsedRows.map(row => row[index] || '')));
  const columns: GridColumn[] = headers.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    type: detectedTypes[index]
  }));

  const rows: GridRow[] = parsedRows.map(cells => {
    const row: GridRow = { id: crypto.randomUUID() };
    columns.forEach((column, index) => {
      row[column.id] = castForColumnType(cells[index], column.type);
    });
    return row;
  });

  return { columns, rows };
};

const DataGridEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  const initialDataRef = useRef<GridData>(normalizeInitialData(initialContent));
  const [columns, setColumns] = useState<GridColumn[]>(initialDataRef.current.columns);
  const [rows, setRows] = useState<GridRow[]>(initialDataRef.current.rows);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<GridColumn['type']>('text');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const lastSavedData = useRef(JSON.stringify(initialDataRef.current));
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const normalized = normalizeInitialData(initialContent);
    setColumns(normalized.columns);
    setRows(normalized.rows);
    setSearchQuery('');
    setSelectedRowIds(new Set());
    setSortColumnId(null);
    setSortDirection(null);
    lastSavedData.current = JSON.stringify(normalized);
    setSaveStatus('saved');
  }, [initialContent]);

  useEffect(() => {
    const currentData = JSON.stringify({ columns, rows });
    if (currentData === lastSavedData.current) return;

    setSaveStatus('unsaved');
    const timer = setTimeout(() => handleManualSave(), 1200);
    return () => clearTimeout(timer);
  }, [columns, rows]);

  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(tableScrollRef.current?.clientHeight || 600);
    };
    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  useEffect(() => {
    const existing = new Set(rows.map(row => row.id));
    setSelectedRowIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if (existing.has(id)) next.add(id);
      });
      return next;
    });
  }, [rows]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [columns, rows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter(row => {
      if (row.id.toLowerCase().includes(query)) return true;
      return columns.some(column => String(row[column.id] ?? '').toLowerCase().includes(query));
    });
  }, [columns, rows, searchQuery]);

  const displayedRows = useMemo(() => {
    if (!sortColumnId || !sortDirection) return filteredRows;
    const column = columns.find(col => col.id === sortColumnId);
    if (!column) return filteredRows;

    const sorted = [...filteredRows].sort((a, b) => {
      const result = compareValues(a[column.id], b[column.id], column.type);
      return sortDirection === 'asc' ? result : -result;
    });
    return sorted;
  }, [columns, filteredRows, sortColumnId, sortDirection]);

  const totalRows = displayedRows.length;
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + ROW_OVERSCAN * 2;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - ROW_OVERSCAN);
  const endIndex = Math.min(totalRows, startIndex + visibleRowCount);
  const visibleRows = displayedRows.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT);
  const allVisibleSelected = displayedRows.length > 0 && displayedRows.every(row => selectedRowIds.has(row.id));

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave({ columns, rows });
    lastSavedData.current = JSON.stringify({ columns, rows });
    setTimeout(() => setSaveStatus('saved'), 300);
  };

  const addColumn = () => {
    const trimmedName = newColumnName.trim();
    if (!trimmedName) return;

    const nextColumn: GridColumn = {
      id: crypto.randomUUID(),
      name: trimmedName,
      type: newColumnType
    };
    setColumns(prev => [...prev, nextColumn]);
    setRows(prev => prev.map(row => ({ ...row, [nextColumn.id]: defaultValueForType(newColumnType) })));
    setNewColumnName('');
    setNewColumnType('text');
  };

  const addRow = () => {
    const newRow: GridRow = { id: crypto.randomUUID() };
    columns.forEach(column => {
      newRow[column.id] = defaultValueForType(column.type);
    });
    setRows(prev => [...prev, newRow]);
  };

  const updateCell = (rowId: string, column: GridColumn, value: unknown) => {
    setRows(prev => prev.map(row => (row.id === rowId ? { ...row, [column.id]: castForColumnType(value, column.type) } : row)));
  };

  const updateColumnName = (columnId: string, name: string) => {
    setColumns(prev => prev.map(column => (column.id === columnId ? { ...column, name } : column)));
  };

  const updateColumnType = (columnId: string, type: GridColumn['type']) => {
    setColumns(prev => prev.map(column => (column.id === columnId ? { ...column, type } : column)));
    setRows(prev =>
      prev.map(row => ({
        ...row,
        [columnId]: castForColumnType(row[columnId], type)
      }))
    );
  };

  const deleteColumn = (columnId: string) => {
    const column = columns.find(c => c.id === columnId);
    if (!column) return;
    const confirmed = confirm(`Delete "${column.name}" column? This removes all values in that column.`);
    if (!confirmed) return;

    setColumns(prev => prev.filter(c => c.id !== columnId));
    setRows(prev =>
      prev.map(row => {
        const next = { ...row };
        delete next[columnId];
        return next;
      })
    );

    if (sortColumnId === columnId) {
      setSortColumnId(null);
      setSortDirection(null);
    }
  };

  const deleteRow = (rowId: string) => {
    setRows(prev => prev.filter(row => row.id !== rowId));
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  };

  const deleteSelectedRows = () => {
    if (selectedRowIds.size === 0) return;
    const confirmed = confirm(`Delete ${selectedRowIds.size} selected row${selectedRowIds.size === 1 ? '' : 's'}?`);
    if (!confirmed) return;
    setRows(prev => prev.filter(row => !selectedRowIds.has(row.id)));
    setSelectedRowIds(new Set());
  };

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = displayedRows.map(row => row.id);
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSort = (columnId: string) => {
    if (sortColumnId !== columnId) {
      setSortColumnId(columnId);
      setSortDirection('asc');
      return;
    }
    if (sortDirection === 'asc') {
      setSortDirection('desc');
      return;
    }
    if (sortDirection === 'desc') {
      setSortColumnId(null);
      setSortDirection(null);
      return;
    }
    setSortDirection('asc');
  };

  const exportCsv = () => {
    const header = columns.map(column => escapeCsvCell(column.name)).join(',');
    const body = rows.map(row => columns.map(column => escapeCsvCell(row[column.id])).join(',')).join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importCsv = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = parseCsvToGrid(text);
        if (rows.length > 0 || columns.length > 0) {
          const confirmed = confirm('Replace current grid with imported CSV data?');
          if (!confirmed) return;
        }
        setColumns(parsed.columns);
        setRows(parsed.rows);
        setSelectedRowIds(new Set());
        setSortColumnId(null);
        setSortDirection(null);
        setSearchQuery('');
      } catch (error) {
        console.error(error);
        alert('Failed to import CSV.');
      }
    };
    input.click();
  };

  const renderSortIcon = (columnId: string) => {
    if (sortColumnId !== columnId || !sortDirection) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-sm px-6 py-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-zinc-200 font-medium flex items-center gap-2">
            <Columns className="w-4 h-4 text-emerald-400" />
            {fileName}
          </h3>
          <div className="flex items-center gap-2">
            <div className="text-xs">
              {saveStatus === 'saving' && (
                <span className="text-zinc-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-zinc-500 flex items-center gap-1 opacity-70">
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
            <button onClick={importCsv} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded" title="Import CSV">
              <Upload className="w-4 h-4" />
            </button>
            <button onClick={exportCsv} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded" title="Export CSV">
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleManualSave}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                saveStatus === 'unsaved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
              }`}
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72 max-w-full">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across all columns..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <button onClick={addRow} className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
            <Plus className="w-4 h-4" />
            Add Row
          </button>

          <button
            onClick={deleteSelectedRows}
            disabled={selectedRowIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
          </button>

          <div className="h-6 w-px bg-zinc-800" />

          <input
            type="text"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="New column name"
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 w-44"
          />
          <select
            value={newColumnType}
            onChange={(e) => setNewColumnType(e.target.value as GridColumn['type'])}
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
          </select>
          <button onClick={addColumn} className="flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium">
            <Plus className="w-4 h-4" />
            Add Column
          </button>

          <div className="ml-auto text-xs text-zinc-500">
            {rows.length} rows | {columns.length} columns | {displayedRows.length} shown
          </div>
        </div>
      </div>

      <div
        ref={tableScrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 overflow-auto custom-scrollbar p-6"
      >
        <div className="min-w-full inline-block align-middle">
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
            <table className="min-w-full">
              <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800">
                <tr>
                  <th className="w-10 px-2 py-2 text-left">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={allVisibleSelected}
                      onClick={toggleSelectAllVisible}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:ring-offset-1 focus:ring-offset-zinc-900 ${
                        allVisibleSelected
                          ? 'border-blue-500 bg-blue-500 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                          : 'border-zinc-500 bg-zinc-900 text-transparent hover:border-zinc-300 hover:bg-zinc-800'
                      }`}
                      aria-label="Select all visible rows"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="w-12 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">#</th>
                  {columns.map((column) => (
                    <th key={column.id} className="min-w-[220px] px-2 py-2 text-left align-top border-l border-zinc-800">
                      <div className="flex items-center gap-1">
                        <input
                          value={column.name}
                          onChange={(e) => updateColumnName(column.id, e.target.value)}
                          className="w-full bg-transparent text-sm font-semibold text-zinc-200 focus:outline-none"
                        />
                        <button
                          onClick={() => toggleSort(column.id)}
                          className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded"
                          title="Sort"
                        >
                          {renderSortIcon(column.id)}
                        </button>
                        <button
                          onClick={() => deleteColumn(column.id)}
                          className="p-1 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded"
                          title="Delete column"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <select
                        value={column.type}
                        onChange={(e) => updateColumnType(column.id, e.target.value as GridColumn['type'])}
                        className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-600"
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </th>
                  ))}
                  <th className="w-10 px-2 py-2 border-l border-zinc-800" />
                </tr>
              </thead>

              <tbody>
                {topSpacerHeight > 0 && (
                  <tr>
                    <td colSpan={columns.length + 3} style={{ height: topSpacerHeight }} />
                  </tr>
                )}

                {visibleRows.map((row, idx) => {
                  const isSelected = selectedRowIds.has(row.id);
                  return (
                    <tr key={row.id} className={`border-b border-zinc-900 hover:bg-zinc-900/60 ${isSelected ? 'bg-blue-500/10' : 'bg-zinc-950'}`}>
                      <td className="px-2 py-2 align-middle" style={{ height: ROW_HEIGHT }}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          onClick={() => toggleRowSelection(row.id)}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:ring-offset-1 focus:ring-offset-zinc-900 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                              : 'border-zinc-500 bg-zinc-900 text-transparent hover:border-zinc-300 hover:bg-zinc-800'
                          }`}
                          aria-label={`Select row ${startIndex + idx + 1}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="px-2 py-2 text-xs text-zinc-500 align-middle" style={{ height: ROW_HEIGHT }}>
                        {startIndex + idx + 1}
                      </td>
                      {columns.map((column) => (
                        <td key={column.id} className="px-2 py-2 align-middle border-l border-zinc-900" style={{ height: ROW_HEIGHT }}>
                          {column.type === 'boolean' ? (
                            <button
                              onClick={() => updateCell(row.id, column, !toBoolean(row[column.id]))}
                              className={`w-full text-left px-2 py-1.5 rounded border text-xs transition-colors ${
                                toBoolean(row[column.id])
                                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {toBoolean(row[column.id]) ? 'True' : 'False'}
                            </button>
                          ) : (
                            <input
                              type={column.type === 'number' ? 'number' : 'text'}
                              value={column.type === 'number' ? toNumber(row[column.id]) : String(row[column.id] ?? '')}
                              onChange={(e) => updateCell(row.id, column, e.target.value)}
                              className={`w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 ${
                                column.type === 'number' ? 'text-right' : ''
                              }`}
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-2 align-middle border-l border-zinc-900" style={{ height: ROW_HEIGHT }}>
                        <button onClick={() => deleteRow(row.id)} className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded" title="Delete row">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {bottomSpacerHeight > 0 && (
                  <tr>
                    <td colSpan={columns.length + 3} style={{ height: bottomSpacerHeight }} />
                  </tr>
                )}

                {displayedRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 3} className="px-6 py-10 text-center text-sm text-zinc-500">
                      No rows match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataGridEditor;
