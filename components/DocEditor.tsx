
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Save, Trash2 } from 'lucide-react';

interface DocEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  fileName: string;
}

const DocEditor: React.FC<DocEditorProps> = ({ initialContent, onSave, fileName }) => {
  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  // Sync content when file switches
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleClear = () => {
    if (confirm('Are you sure you want to clear the entire document? This cannot be undone.')) {
      setContent('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Toolbar */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
           <h3 className="text-zinc-200 font-medium mr-4">{fileName}</h3>
          <div className="flex bg-zinc-800 p-1 rounded-lg border border-zinc-700">
            <button
              onClick={() => setActiveTab('write')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'write' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Write
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'preview' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Preview
            </button>
          </div>
          <button 
             onClick={handleClear}
             className="p-2 ml-2 hover:bg-red-500/10 rounded text-zinc-400 hover:text-red-400 transition-colors"
             title="Clear Document"
          >
             <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => onSave(content)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20"
        >
          <Save className="w-4 h-4" />
          Save Document
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Editor / Preview Area */}
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          {activeTab === 'write' ? (
            <textarea
              className="w-full h-full bg-zinc-950 p-8 text-zinc-300 font-mono text-sm resize-none focus:outline-none leading-relaxed"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Start writing..."
            />
          ) : (
            <div className="w-full h-full bg-zinc-900 p-8 overflow-auto prose prose-invert prose-zinc max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocEditor;
