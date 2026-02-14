import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, Network, CheckSquare, Bug, Map, Table, PenTool, LayoutDashboard, FolderOpen, Plus } from 'lucide-react';
import { Project, ProjectFile, FileType } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  activeProject: Project | undefined;
  onSelectFile: (fileId: string) => void;
  onSelectProject: (projectId: string) => void;
  onCreateFile: (type: FileType) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  projects,
  activeProject,
  onSelectFile,
  onSelectProject,
  onCreateFile
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Slight delay to allow render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'doc': return <FileText className="w-4 h-4" />;
      case 'flowchart': return <Network className="w-4 h-4" />;
      case 'todo': return <CheckSquare className="w-4 h-4" />;
      case 'kanban': return <Bug className="w-4 h-4" />;
      case 'roadmap': return <Map className="w-4 h-4" />;
      case 'grid': return <Table className="w-4 h-4" />;
      case 'whiteboard': return <PenTool className="w-4 h-4" />;
      case 'project': return <LayoutDashboard className="w-4 h-4" />;
      case 'create': return <Plus className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  // --- Build Options ---
  
  let options: { id: string, type: string, label: string, subLabel?: string, action: () => void }[] = [];

  if (activeProject) {
    // 1. Current Project Files
    activeProject.files.forEach(f => {
      options.push({
        id: f.id,
        type: f.type,
        label: f.name,
        subLabel: 'Go to file',
        action: () => { onSelectFile(f.id); onClose(); }
      });
    });

    // 2. Create Actions
    options.push({ id: 'new-doc', type: 'create', label: 'Create Document', action: () => { onCreateFile('doc'); onClose(); } });
    options.push({ id: 'new-flow', type: 'create', label: 'Create Flowchart', action: () => { onCreateFile('flowchart'); onClose(); } });
    options.push({ id: 'new-todo', type: 'create', label: 'Create Task List', action: () => { onCreateFile('todo'); onClose(); } });
    options.push({ id: 'new-kanban', type: 'create', label: 'Create Bug Tracker', action: () => { onCreateFile('kanban'); onClose(); } });
    options.push({ id: 'new-roadmap', type: 'create', label: 'Create Roadmap', action: () => { onCreateFile('roadmap'); onClose(); } });
    options.push({ id: 'new-grid', type: 'create', label: 'Create Data Grid', action: () => { onCreateFile('grid'); onClose(); } });
    options.push({ id: 'new-wb', type: 'create', label: 'Create Whiteboard', action: () => { onCreateFile('whiteboard'); onClose(); } });
  }

  // 3. Switch Projects
  projects.forEach(p => {
    if (p.id !== activeProject?.id) {
      options.push({
        id: p.id,
        type: 'project',
        label: p.name,
        subLabel: p.isLocal ? 'Switch to Local Repo' : 'Switch Project',
        action: () => { onSelectProject(p.id); onClose(); }
      });
    }
  });

  // Filter
  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(query.toLowerCase()) || 
    opt.type.toLowerCase().includes(query.toLowerCase())
  );

  // Clamp selected index
  if (selectedIndex >= filteredOptions.length && filteredOptions.length > 0) {
    setSelectedIndex(filteredOptions.length - 1);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[selectedIndex]) {
        filteredOptions[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-zinc-800">
          <Search className="w-5 h-5 text-zinc-500 mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-lg text-white placeholder-zinc-600 focus:outline-none"
            placeholder={activeProject ? `Search files in ${activeProject.name}...` : "Search projects..."}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <div className="text-xs text-zinc-600 border border-zinc-800 rounded px-2 py-1">ESC</div>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
          {filteredOptions.length === 0 ? (
            <div className="p-4 text-center text-zinc-500">No results found.</div>
          ) : (
            filteredOptions.map((option, idx) => (
              <div
                key={`${option.type}-${option.id}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                  idx === selectedIndex ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
                onClick={() => option.action()}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className={`p-2 rounded-md ${idx === selectedIndex ? 'bg-white/20' : 'bg-zinc-800'}`}>
                  {getIcon(option.type)}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{option.label}</div>
                  {option.subLabel && <div className={`text-xs ${idx === selectedIndex ? 'text-blue-200' : 'text-zinc-500'}`}>{option.subLabel}</div>}
                </div>
                {idx === selectedIndex && <div className="text-xs opacity-70">Enter</div>}
              </div>
            ))
          )}
        </div>
        
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 text-[10px] text-zinc-500 flex justify-between">
           <span>Navigate with ↑↓</span>
           <span>Use keywords like "create", "todo", "doc"</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;