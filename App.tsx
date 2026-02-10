
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Network, ArrowLeft, Plus, Folder, File, Settings, Download, CheckSquare, Bug as BugIcon } from 'lucide-react';
import Dashboard from './components/Dashboard';
import FlowchartEditor from './components/FlowchartEditor';
import DocEditor from './components/DocEditor';
import TodoEditor from './components/TodoEditor';
import KanbanBoard from './components/KanbanBoard';
import { Project, ViewState, ProjectFile, FlowchartData, FileType, TodoData, KanbanData } from './types';
import { Node, Edge } from 'reactflow';

// Migrated Mock Data
const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Cosmic Invaders',
    type: 'Game',
    description: 'A retro-style space shooter with RPG elements.',
    lastModified: Date.now(),
    files: [
      {
        id: 'f1',
        name: 'Game Design Document',
        type: 'doc',
        content: '# Cosmic Invaders\n\n## 1. Introduction\nA fast-paced shooter set in the Andromeda galaxy.\n\n## 2. Core Mechanics\n- Ship customization\n- Loot drops\n- Boss battles'
      },
      {
        id: 'f2',
        name: 'Game Loop',
        type: 'flowchart',
        content: {
          nodes: [
            { id: '1', type: 'circle', data: { label: 'Start' }, position: { x: 250, y: 0 }, style: { } },
            { id: '2', type: 'default', data: { label: 'Main Menu' }, position: { x: 250, y: 150 }, style: { background: '#18181b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px', padding: '10px', width: 150, textAlign: 'center' } },
          ],
          edges: [
            { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#71717a' } },
          ],
        }
      },
      {
        id: 'f3',
        name: 'Launch Tasks',
        type: 'todo',
        content: {
          items: [
            { id: 't1', text: 'Design main character sprite', completed: true, priority: 'High', description: 'Pixel art style, 32x32' },
            { id: 't2', text: 'Implement shooting mechanics', completed: false, priority: 'High', dueDate: '2024-12-01' },
          ]
        }
      },
      {
        id: 'f4',
        name: 'Alpha Bugs',
        type: 'kanban',
        content: {
          tasks: [
            { id: 'b1', title: 'Ship clips through walls', severity: 'High', status: 'In Progress', description: 'Collision detection fails at high speeds.', createdAt: Date.now() },
            { id: 'b2', title: 'Typo in credits', severity: 'Low', status: 'Open', description: 'Says "Prgramming" instead of "Programming"', createdAt: Date.now() }
          ]
        }
      }
    ]
  },
];

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem('devarchitect_projects');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Basic schema check
        if (parsed.length > 0 && parsed[0].files) {
          return parsed;
        }
        return MOCK_PROJECTS;
      }
    } catch (e) {
      console.error("Failed to load projects", e);
    }
    return MOCK_PROJECTS;
  });
  
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Auto-save projects to local storage
  useEffect(() => {
    localStorage.setItem('devarchitect_projects', JSON.stringify(projects));
  }, [projects]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeFile = activeProject?.files.find(f => f.id === activeFileId);

  const handleCreateProject = (name: string, type: Project['type']) => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      type,
      description: '',
      lastModified: Date.now(),
      files: [
        {
          id: crypto.randomUUID(),
          name: 'Readme',
          type: 'doc',
          content: `# ${name}\n\nProject created on ${new Date().toLocaleDateString()}`
        }
      ]
    };
    setProjects([newProject, ...projects]);
  };

  const handleDeleteProject = (id: string) => {
    if (confirm("Are you sure you want to delete this project?")) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setCurrentView(ViewState.DASHBOARD);
      }
    }
  };

  const handleExportProject = (project: Project) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${project.name.replace(/\s+/g, '_')}_data.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleCreateFile = (type: FileType) => {
    if (!activeProjectId) return;
    
    let typeName = 'document';
    if (type === 'flowchart') typeName = 'flowchart';
    if (type === 'todo') typeName = 'to-do list';
    if (type === 'kanban') typeName = 'bug tracker';

    const name = prompt(`Enter name for new ${typeName}:`);
    if (!name) return;

    let content: any = '';
    if (type === 'flowchart') content = { nodes: [], edges: [] };
    if (type === 'todo') content = { items: [] };
    if (type === 'kanban') content = { tasks: [] };

    const newFile: ProjectFile = {
      id: crypto.randomUUID(),
      name,
      type,
      content
    };

    const updatedProjects = projects.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          lastModified: Date.now(),
          files: [...p.files, newFile]
        };
      }
      return p;
    });

    setProjects(updatedProjects);
    setActiveFileId(newFile.id);
  };

  const updateFileContent = (content: any) => {
    if (!activeProjectId || !activeFileId) return;

    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          lastModified: Date.now(),
          files: p.files.map(f => f.id === activeFileId ? { ...f, content } : f)
        };
      }
      return p;
    }));
  };

  const renderSidebar = () => {
    if (currentView === ViewState.DASHBOARD || !activeProject) {
      return (
        <aside className="w-16 md:w-20 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-6 gap-6 z-20">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 mb-4">
            <Folder className="w-6 h-6 text-white" />
          </div>
          <nav className="flex-1 flex flex-col gap-4 w-full px-2">
            <button
              className="p-3 rounded-xl bg-zinc-800 text-white shadow-md flex justify-center"
              title="Dashboard"
            >
              <LayoutDashboard className="w-5 h-5" />
            </button>
          </nav>
        </aside>
      );
    }

    return (
      <aside className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 shrink-0">
          <button 
             onClick={() => {
               setActiveProjectId(null);
               setCurrentView(ViewState.DASHBOARD);
             }}
             className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
           >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-6">
             <h2 className="text-zinc-100 font-semibold truncate mb-1" title={activeProject.name}>{activeProject.name}</h2>
             <p className="text-xs text-zinc-500 uppercase tracking-wider">{activeProject.type} Project</p>
          </div>

          <div className="space-y-6">
            {/* Documents */}
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Documents</span>
                <button onClick={() => handleCreateFile('doc')} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1">
                {activeProject.files.filter(f => f.type === 'doc').map(file => (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeFileId === file.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                ))}
                {activeProject.files.filter(f => f.type === 'doc').length === 0 && (
                   <p className="text-xs text-zinc-600 px-3 italic">No documents</p>
                )}
              </div>
            </div>

            {/* Flowcharts */}
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Flowcharts</span>
                <button onClick={() => handleCreateFile('flowchart')} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1">
                {activeProject.files.filter(f => f.type === 'flowchart').map(file => (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeFileId === file.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300'
                    }`}
                  >
                    <Network className="w-4 h-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                ))}
                 {activeProject.files.filter(f => f.type === 'flowchart').length === 0 && (
                   <p className="text-xs text-zinc-600 px-3 italic">No flowcharts</p>
                )}
              </div>
            </div>

            {/* Todo Lists */}
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Task Lists</span>
                <button onClick={() => handleCreateFile('todo')} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1">
                {activeProject.files.filter(f => f.type === 'todo').map(file => (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeFileId === file.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                ))}
                 {activeProject.files.filter(f => f.type === 'todo').length === 0 && (
                   <p className="text-xs text-zinc-600 px-3 italic">No task lists</p>
                )}
              </div>
            </div>

            {/* Bug Trackers */}
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Bug Trackers</span>
                <button onClick={() => handleCreateFile('kanban')} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1">
                {activeProject.files.filter(f => f.type === 'kanban').map(file => (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeFileId === file.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300'
                    }`}
                  >
                    <BugIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                ))}
                 {activeProject.files.filter(f => f.type === 'kanban').length === 0 && (
                   <p className="text-xs text-zinc-600 px-3 italic">No bug trackers</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </aside>
    );
  };

  const renderContent = () => {
    if (currentView === ViewState.DASHBOARD) {
      return (
        <Dashboard
          projects={projects}
          onSelectProject={(id) => {
            setActiveProjectId(id);
            const project = projects.find(p => p.id === id);
            if (project && project.files.length > 0) {
              setActiveFileId(project.files[0].id);
            } else {
              setActiveFileId(null);
            }
            setCurrentView(ViewState.PROJECT);
          }}
          onCreateProject={handleCreateProject}
          onExportProject={handleExportProject}
          onDeleteProject={handleDeleteProject}
        />
      );
    }

    if (!activeProject) return <div>Project not found</div>;

    if (!activeFile) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500">
          <File className="w-16 h-16 mb-4 opacity-20" />
          <p>Select a file to edit or create a new one.</p>
        </div>
      );
    }

    if (activeFile.type === 'doc') {
      return (
        <DocEditor
          key={activeFile.id}
          fileName={activeFile.name}
          initialContent={activeFile.content as string}
          onSave={(content) => updateFileContent(content)}
        />
      );
    }

    if (activeFile.type === 'flowchart') {
      const data = activeFile.content as FlowchartData;
      return (
        <FlowchartEditor
          key={activeFile.id}
          fileName={activeFile.name}
          initialNodes={data.nodes}
          initialEdges={data.edges}
          onSave={(nodes, edges) => updateFileContent({ nodes, edges })}
        />
      );
    }

    if (activeFile.type === 'todo') {
      const data = activeFile.content as TodoData;
      return (
        <TodoEditor
          key={activeFile.id}
          fileName={activeFile.name}
          initialItems={data.items || []}
          onSave={(items) => updateFileContent({ items })}
        />
      );
    }

    if (activeFile.type === 'kanban') {
      const data = activeFile.content as KanbanData;
      return (
        <KanbanBoard
          key={activeFile.id}
          fileName={activeFile.name}
          initialBugs={data.tasks || []}
          onSave={(tasks) => updateFileContent({ tasks })}
        />
      );
    }
  };

  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans overflow-hidden">
      {renderSidebar()}
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        <div className="flex-1 overflow-hidden relative">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
