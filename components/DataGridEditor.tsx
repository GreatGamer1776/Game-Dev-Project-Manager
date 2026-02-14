import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, Columns, GripVertical, Download, Upload, Loader2, Check, AlertCircle } from 'lucide-react';
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

const DataGridEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  const [columns, setColumns] = useState<GridColumn[]>(initialContent?.columns || [
    { id: 'col_1', name: 'ID', type: 'text' },
    { id: 'col_2', name: 'Name', type: 'text' },
    { id: 'col_3', name: 'Value', type: 'number' }
  ]);
  const [rows, setRows] = useState<GridRow[]>(initialContent?.rows || []);
  
  // Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(JSON.stringify({ columns: initialContent?.columns, rows: initialContent?.rows }));

  // Autosave
  useEffect(() => {
    const currentData = JSON.stringify({ columns, rows });
    if (currentData === lastSavedData.current) return;

    setSaveStatus('unsaved');
    const timer = setTimeout(() => handleManualSave(), 2000);
    return () => clearTimeout(timer);
  }, [columns, rows]);

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave({ columns, rows });
    lastSavedData.current = JSON.stringify({ columns, rows });
    setTimeout(() => setSaveStatus('saved'), 500);
  };

  const addColumn = () => {
    const name = prompt("Column Name:");
    if (!name) return;
    const newCol: GridColumn = { id: crypto.randomUUID(), name, type: 'text' };
    setColumns([...columns, newCol]);
  };

  const addRow = () => {
    const newRow: GridRow = { id: crypto.randomUUID() };
    columns.forEach(col => newRow[col.id] = col.type === 'number' ? 0 : '');
    setRows([...rows, newRow]);
  };

  const updateCell = (rowId: string, colId: string, value: any) => {
    setRows(rows.map(r => r.id === rowId ? { ...r, [colId]: value } : r));
  };

  const deleteRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const deleteColumn = (id: string) => {
    if (confirm("Delete column? Data will be lost.")) {
        setColumns(columns.filter(c => c.id !== id));
    }
  };

  const exportCSV = () => {
      const headers = columns.map(c => c.name).join(',');
      const csvRows = rows.map(r => columns.map(c => r[c.id]).join(','));
      const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${fileName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-20">
        <h3 className="text-zinc-200 font-medium flex items-center gap-2"><Columns className="w-4 h-4 text-emerald-500" /> {fileName}</h3>
        <div className="flex items-center gap-3">
             <div className="flex items-center mr-2">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /> Saved</span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unsaved</span>}
            </div>
            <button onClick={exportCSV} className="text-zinc-400 hover:text-white p-2" title="Export CSV"><Download className="w-4 h-4" /></button>
            <button onClick={handleManualSave} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}>
                <Save className="w-4 h-4" /> Save
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-6">
        <div className="inline-block min-w-full align-middle">
            <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-zinc-700">
                    <thead className="bg-zinc-800">
                        <tr>
                            <th className="w-10 px-3 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">#</th>
                            {columns.map(col => (
                                <th key={col.id} className="px-3 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider group relative min-w-[150px]">
                                    <div className="flex items-center justify-between">
                                        <input 
                                            value={col.name} 
                                            onChange={(e) => setColumns(columns.map(c => c.id === col.id ? { ...c, name: e.target.value } : c))}
                                            className="bg-transparent border-none focus:ring-0 text-zinc-300 font-bold w-full"
                                        />
                                        <button onClick={() => deleteColumn(col.id)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                </th>
                            ))}
                            <th className="w-10 px-3 py-3">
                                <button onClick={addColumn} className="text-blue-400 hover:text-blue-300"><Plus className="w-4 h-4" /></button>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-zinc-900 divide-y divide-zinc-800">
                        {rows.map((row, idx) => (
                            <tr key={row.id} className="hover:bg-zinc-800/50 transition-colors">
                                <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-500">{idx + 1}</td>
                                {columns.map(col => (
                                    <td key={col.id} className="px-3 py-2 whitespace-nowrap">
                                        <input
                                            type={col.type === 'number' ? 'number' : 'text'}
                                            value={row[col.id] || ''}
                                            onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 text-sm text-zinc-200 placeholder-zinc-700"
                                        />
                                    </td>
                                ))}
                                <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => deleteRow(row.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button onClick={addRow} className="mt-4 flex items-center gap-2 text-zinc-400 hover:text-white text-sm font-medium px-4 py-2 border border-zinc-700 rounded-lg border-dashed hover:border-zinc-500 transition-colors w-full justify-center">
                <Plus className="w-4 h-4" /> Add Row
            </button>
        </div>
      </div>
    </div>
  );
};

export default DataGridEditor;