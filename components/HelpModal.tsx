import React from 'react';
import { X, FileText, Network, CheckSquare, Bug, Map, Table, PenTool, Image as ImageIcon, LayoutDashboard, Box } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const tools = [
    {
      icon: FileText,
      color: "text-blue-400",
      title: "Documents",
      desc: "Markdown-based text editor. Use this for Game Design Documents (GDD), technical specifications, story drafts, and general notes. Supports inserting images from the Asset Library."
    },
    {
      icon: Network,
      color: "text-purple-400",
      title: "Flowcharts",
      desc: "Node-based diagram editor. Perfect for visualizing game loops, dialogue trees, quest branching, or finite state machines (FSM) for AI behavior."
    },
    {
      icon: CheckSquare,
      color: "text-emerald-400",
      title: "Task Lists",
      desc: "Simple, prioritized checklist for daily tasks. Supports sub-tasks and drag-and-drop reordering to keep track of immediate to-dos."
    },
    {
      icon: Bug,
      color: "text-red-400",
      title: "Bug Tracker",
      desc: "A Kanban board (To Do, In Progress, Done) designed for tracking bugs, glitches, and feature requests. Allows assigning severity levels to issues."
    },
    {
      icon: Map,
      color: "text-amber-400",
      title: "Roadmap",
      desc: "Timeline view for long-term project planning. Create phases and milestones to visualize your development schedule over weeks or months."
    },
    {
      icon: Table,
      color: "text-cyan-400",
      title: "Data Grid",
      desc: "Spreadsheet-like database editor. Essential for balancing game stats (e.g., weapon damage, enemy HP), managing item lists, or localized strings."
    },
    {
      icon: PenTool,
      color: "text-pink-400",
      title: "Whiteboard",
      desc: "Infinite canvas for freehand drawing and brainstorming. Great for quick level layout sketches, UI mockups, or scribbling ideas during meetings."
    },
    {
      icon: ImageIcon,
      color: "text-indigo-400",
      title: "Asset Library",
      desc: "Central repository for project images. Upload reference art or screenshots here to use them inside Documents and Whiteboards."
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-950/50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
                <Box className="w-6 h-6 text-blue-500" />
            </div>
            <div>
                <h2 className="text-xl font-bold text-white">DevArchitect Guide</h2>
                <p className="text-sm text-zinc-400">Project management suite for game developers</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-zinc-900/50">
          
          {/* Intro Section */}
          <div className="mb-10 bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">What is this tool?</h3>
            <p className="text-zinc-400 leading-relaxed">
              DevArchitect is an offline-capable workspace designed to centralize the messy process of game development planning. 
              Instead of scattering your GDDs in Word, tasks in Trello, and stats in Excel, this tool keeps everything in one project file 
              that can be saved locally to your disk or version control system.
            </p>
          </div>

          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-4 px-2">Available Tools</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tools.map((tool) => (
              <div key={tool.title} className="flex gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors">
                <div className={`shrink-0 p-3 rounded-lg bg-zinc-900 h-fit ${tool.color}`}>
                   <tool.icon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-zinc-200 mb-1">{tool.title}</h4>
                  <p className="text-sm text-zinc-500 leading-snug">{tool.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 p-4 border-t border-zinc-800 text-center text-xs text-zinc-600">
             <p>Use <span className="font-mono bg-zinc-800 px-1 rounded text-zinc-400">Ctrl + K</span> to open the Command Palette anywhere.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;