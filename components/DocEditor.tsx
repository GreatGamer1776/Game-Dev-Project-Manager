import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Save, Trash2, Bold, Italic, List, ListOrdered, 
  Heading1, Heading2, Quote, Code, Image as ImageIcon, 
  Eye, Columns, PenTool, Link as LinkIcon 
} from 'lucide-react';

interface DocEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  fileName: string;
}

type ViewMode = 'edit' | 'preview' | 'split';

const DocEditor: React.FC<DocEditorProps> = ({ initialContent, onSave, fileName }) => {
  const [content, setContent] = useState(initialContent);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync content when file switches
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleClear = () => {
    if (confirm('Are you sure you want to clear the entire document? This cannot be undone.')) {
      setContent('');
    }
  };

  // --- Formatting Logic ---

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const previousText = textarea.value;
    const selectedText = previousText.substring(start, end);

    const newText = 
      previousText.substring(0, start) +
      before + selectedText + after +
      previousText.substring(end);

    setContent(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        end + before.length
      );
    }, 0);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      if(!confirm("This image is large (>1MB). Embedding it might slow down the project file saving. Continue?")) {
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      insertText(`\n![${file.name}](${base64})\n`);
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Toolbar Component ---

  const ToolbarButton = ({ icon: Icon, onClick, title, active = false }: any) => (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-md transition-all ${
        active 
          ? 'bg-blue-600 text-white shadow-sm' 
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
      title={title}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Header & Main Toolbar */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-4">
           <h3 className="text-zinc-200 font-medium mr-2 truncate max-w-[150px]">{fileName}</h3>
           
           <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

           {/* Formatting Toolbar */}
           <div className="flex items-center gap-0.5">
              <ToolbarButton icon={Bold} onClick={() => insertText('**', '**')} title="Bold" />
              <ToolbarButton icon={Italic} onClick={() => insertText('*', '*')} title="Italic" />
              <ToolbarButton icon={Heading1} onClick={() => insertText('# ')} title="Heading 1" />
              <ToolbarButton icon={Heading2} onClick={() => insertText('## ')} title="Heading 2" />
              <div className="w-2"></div>
              <ToolbarButton icon={List} onClick={() => insertText('- ')} title="Bullet List" />
              <ToolbarButton icon={ListOrdered} onClick={() => insertText('1. ')} title="Numbered List" />
              <ToolbarButton icon={Quote} onClick={() => insertText('> ')} title="Quote" />
              <ToolbarButton icon={Code} onClick={() => insertText('```\n', '\n```')} title="Code Block" />
              <ToolbarButton icon={LinkIcon} onClick={() => insertText('[', '](url)')} title="Link" />
              
              <div className="w-2"></div>
              
              {/* Image Upload */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload}
              />
              <ToolbarButton icon={ImageIcon} onClick={() => fileInputRef.current?.click()} title="Insert Image" />
           </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-zinc-800 p-1 rounded-lg border border-zinc-700 hidden sm:flex">
            <button
              onClick={() => setViewMode('edit')}
              className={`p-1.5 rounded transition-all ${viewMode === 'edit' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`}
              title="Edit Only"
            >
              <PenTool className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`p-1.5 rounded transition-all ${viewMode === 'split' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`}
              title="Split View"
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`p-1.5 rounded transition-all ${viewMode === 'preview' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`}
              title="Preview Only"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>

          <button 
             onClick={handleClear}
             className="p-2 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400 transition-colors"
             title="Clear Document"
          >
             <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => onSave(content)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Editor Pane */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={`h-full flex flex-col ${viewMode === 'split' ? 'w-1/2 border-r border-zinc-800' : 'w-full'}`}>
            <textarea
              ref={textareaRef}
              className="w-full h-full bg-zinc-950 p-6 text-zinc-300 font-mono text-sm resize-none focus:outline-none leading-relaxed custom-scrollbar selection:bg-blue-500/30"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Start writing your masterpiece..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview Pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`h-full overflow-auto custom-scrollbar bg-zinc-900 ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
             <div className="max-w-3xl mx-auto p-8">
                <ReactMarkdown
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-3xl font-bold text-zinc-100 mb-6 pb-2 border-b border-zinc-700" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-2xl font-semibold text-zinc-100 mb-4 mt-8" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-xl font-semibold text-zinc-200 mb-3 mt-6" {...props} />,
                    p: ({node, ...props}) => <p className="text-zinc-300 leading-7 mb-4" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc list-outside ml-6 mb-4 text-zinc-300" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-6 mb-4 text-zinc-300" {...props} />,
                    li: ({node, ...props}) => <li className="mb-1 pl-1" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 bg-zinc-800/30 pl-4 py-2 my-4 text-zinc-400 italic rounded-r" {...props} />,
                    code: ({node, inline, className, children, ...props}: any) => {
                       return inline 
                         ? <code className="bg-zinc-800 text-red-400 px-1.5 py-0.5 rounded text-sm font-mono border border-zinc-700/50" {...props}>{children}</code>
                         : <div className="bg-zinc-950 p-4 rounded-lg my-4 overflow-x-auto border border-zinc-800 shadow-inner"><code className="text-sm font-mono text-zinc-300 block" {...props}>{children}</code></div>
                    },
                    a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 hover:underline transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
                    img: ({node, ...props}) => <img className="max-w-full h-auto rounded-lg shadow-lg my-6 border border-zinc-800" {...props} />,
                    hr: ({node, ...props}) => <hr className="border-zinc-800 my-8" {...props} />,
                    table: ({node, ...props}) => <div className="overflow-x-auto my-6 rounded-lg border border-zinc-800"><table className="w-full text-left text-sm" {...props} /></div>,
                    th: ({node, ...props}) => <th className="bg-zinc-800 p-3 font-semibold text-zinc-200 border-b border-zinc-700" {...props} />,
                    td: ({node, ...props}) => <td className="p-3 border-b border-zinc-800 text-zinc-300" {...props} />,
                  }}
                >
                  {content || '*Preview will appear here...*'}
                </ReactMarkdown>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocEditor;