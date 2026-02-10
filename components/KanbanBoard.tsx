
import React, { useState, useEffect } from 'react';
import { Save, Plus, AlertCircle, ChevronLeft, ChevronRight, X, Trash2, Bug as BugIcon, Search, Filter } from 'lucide-react';
import { Bug, BugSeverity, BugStatus } from '../types';

interface KanbanBoardProps {
  initialBugs: Bug[];
  onSave: (bugs: Bug[]) => void;
  fileName: string;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ initialBugs, onSave, fileName }) => {
  const [bugs, setBugs] = useState<Bug[]>(initialBugs);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<'All' | BugSeverity>('All');
  
  // New Bug Form
  const [newTitle, setNewTitle] = useState('');
  const [newSeverity, setNewSeverity] = useState<BugSeverity>('Medium');
  const [newDesc, setNewDesc] = useState('');

  // Drag and Drop State
  const [draggedBugId, setDraggedBugId] = useState<string | null>(null);

  useEffect(() => {
    setBugs(initialBugs);
  }, [initialBugs]);

  const columns: BugStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed'];

  const handleAddBug = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newBug: Bug = {
      id: crypto.randomUUID(),
      title: newTitle,
      description: newDesc,
      severity: newSeverity,
      status: 'Open',
      createdAt: Date.now()
    };

    setBugs([...bugs, newBug]);
    setNewTitle('');
    setNewDesc('');
    setNewSeverity('Medium');
    setIsModalOpen(false);
  };

  const updateStatus = (id: string, newStatus: BugStatus) => {
    setBugs(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
  };

  const deleteBug = (id: string) => {
    if (confirm("Delete this bug ticket?")) {
      setBugs(bugs.filter(b => b.id !== id));
    }
  };

  // --- Drag and Drop Handlers ---

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedBugId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id); 
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: BugStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id && id === draggedBugId) {
      updateStatus(id, status);
    }
    setDraggedBugId(null);
  };

  const getSeverityColor = (s: BugSeverity) => {
    switch (s) {
      case 'Critical': return 'bg-red-500 text-white border-red-600';
      case 'High': return 'bg-orange-500 text-white border-orange-600';
      case 'Medium': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/40';
      case 'Low': return 'bg-blue-500/20 text-blue-500 border-blue-500/40';
    }
  };

  const getSeverityIcon = (s: BugSeverity) => {
    if (s === 'Critical') return <AlertCircle className="w-3 h-3 fill-white text-red-600" />;
    return <AlertCircle className="w-3 h-3" />;
  };

  // Filter Logic
  const filteredBugs = bugs.filter(bug => {
    // 1. Severity
    if (filterSeverity !== 'All' && bug.severity !== filterSeverity) return false;
    // 2. Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return bug.title.toLowerCase().includes(q) || bug.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Toolbar */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
             <BugIcon className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-zinc-200 font-medium">{fileName}</h3>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-md text-sm font-medium transition-colors border border-zinc-700"
          >
            <Plus className="w-4 h-4" />
            Report Bug
          </button>
          <button
            onClick={() => onSave(bugs)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
          >
            <Save className="w-4 h-4" />
            Save Board
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-4 border-b border-zinc-800 flex flex-wrap gap-4 items-center bg-zinc-900">
         <div className="relative w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bugs..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
         </div>
         <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>
         <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Filter className="w-4 h-4" />
            <span>Severity:</span>
            <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
               {(['All', 'Low', 'Medium', 'High', 'Critical'] as const).map(sev => (
                 <button
                   key={sev}
                   onClick={() => setFilterSeverity(sev)}
                   className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                     filterSeverity === sev 
                       ? 'bg-zinc-800 text-white shadow-sm' 
                       : 'text-zinc-500 hover:text-zinc-300'
                   }`}
                 >
                   {sev}
                 </button>
               ))}
            </div>
         </div>
         <div className="ml-auto text-xs text-zinc-500">
            Showing {filteredBugs.length} of {bugs.length} bugs
         </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 h-full min-w-[1000px]">
          {columns.map(status => {
             const colBugs = filteredBugs.filter(b => b.status === status);
             return (
               <div 
                  key={status}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, status)} 
                  className={`flex-1 flex flex-col min-w-[300px] h-full bg-zinc-950/50 border border-zinc-800 rounded-xl overflow-hidden transition-colors ${draggedBugId ? 'hover:bg-zinc-900/80 ring-1 ring-zinc-700/50' : ''}`}
               >
                 <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center sticky top-0">
                    <h4 className="font-semibold text-zinc-300">{status}</h4>
                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full">{colBugs.length}</span>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {colBugs.map(bug => (
                      <div 
                        key={bug.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, bug.id)}
                        className={`bg-zinc-900 border border-zinc-800 p-4 rounded-lg shadow-sm hover:border-zinc-700 transition-colors group cursor-grab active:cursor-grabbing ${draggedBugId === bug.id ? 'opacity-40 grayscale border-dashed border-zinc-600' : 'opacity-100'}`}
                      >
                         <div className="flex justify-between items-start mb-2 pointer-events-none">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${getSeverityColor(bug.severity)}`}>
                              {getSeverityIcon(bug.severity)}
                              {bug.severity}
                            </span>
                            <button onClick={(e) => {e.preventDefault(); deleteBug(bug.id);}} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                              <Trash2 className="w-4 h-4" />
                            </button>
                         </div>
                         <h5 className="text-sm font-medium text-zinc-200 mb-1 pointer-events-none">{bug.title}</h5>
                         <p className="text-xs text-zinc-500 line-clamp-2 mb-3 pointer-events-none">{bug.description || "No description provided."}</p>
                         
                         {/* Move Buttons (Still kept for accessibility or non-mouse users) */}
                         <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-800 pointer-events-auto">
                           {status !== 'Open' ? (
                             <button 
                               onClick={() => updateStatus(bug.id, columns[columns.indexOf(status) - 1])}
                               className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 hover:bg-zinc-800 px-2 py-1 rounded transition-colors"
                             >
                               <ChevronLeft className="w-3 h-3" /> Prev
                             </button>
                           ) : <div></div>}
                           
                           {status !== 'Closed' ? (
                             <button 
                               onClick={() => updateStatus(bug.id, columns[columns.indexOf(status) + 1])}
                               className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 hover:bg-zinc-800 px-2 py-1 rounded transition-colors"
                             >
                               Next <ChevronRight className="w-3 h-3" />
                             </button>
                           ) : <div></div>}
                         </div>
                      </div>
                    ))}
                    {colBugs.length === 0 && (
                      <div className="text-center py-8 opacity-30 pointer-events-none">
                        <div className="text-sm text-zinc-500 italic">Drop items here</div>
                      </div>
                    )}
                 </div>
               </div>
             )
          })}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Report Bug</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddBug} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Title</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  placeholder="e.g., Crash on startup"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Severity</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Medium', 'High', 'Critical'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setNewSeverity(sev)}
                      className={`py-2 px-1 rounded-lg text-xs font-medium border transition-all ${
                        newSeverity === sev
                          ? 'bg-zinc-800 border-zinc-600 text-white ring-1 ring-zinc-500'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all min-h-[100px]"
                  placeholder="Steps to reproduce..."
                />
              </div>
              
              <div className="pt-4 border-t border-zinc-800">
                <button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanBoard;
