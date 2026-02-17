import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, Trash2, Bold, Italic, List, ListOrdered, 
  Heading1, Heading2, Quote, Code, Image as ImageIcon, 
  Eye, Columns, PenTool, Link as LinkIcon, Check, Loader2, AlertCircle,
  Underline, Strikethrough, Palette, Video, Music, X
} from 'lucide-react';
import { EditorProps } from '../types';

// --- CUSTOM PARSER LOGIC ---

// A lightweight parser to handle Markdown + HTML + Custom Media types
// This replaces ReactMarkdown to allow specific features like Color, Underline, and AV players.
const parseDoc = (text: string, assets: Record<string, string>) => {
    
    // Helper to resolve asset:// links to their base64/blob data
    const resolveSrc = (src: string) => {
        if (!src) return '';
        if (src.startsWith('asset://')) {
            const id = src.replace('asset://', '');
            return assets[id] || src;
        }
        return src;
    };

    const lines = text.split('\n');
    let html = '';
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1. Code Blocks
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            html += inCodeBlock 
                ? '<div class="bg-zinc-950 p-4 rounded-lg my-4 border border-zinc-800 font-mono text-sm text-zinc-300 overflow-x-auto"><pre>' 
                : '</pre></div>';
            continue;
        }
        if (inCodeBlock) {
            // Escape HTML in code blocks to prevent rendering
            const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `${escaped}\n`;
            continue;
        }

        // 2. Headers
        if (line.startsWith('# ')) {
            html += `<h1 class="text-3xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800 mt-6">${parseInline(line.slice(2), assets)}</h1>`;
            continue;
        }
        if (line.startsWith('## ')) {
            html += `<h2 class="text-2xl font-semibold text-zinc-100 mb-3 mt-8">${parseInline(line.slice(3), assets)}</h2>`;
            continue;
        }
        if (line.startsWith('### ')) {
            html += `<h3 class="text-xl font-medium text-zinc-200 mb-2 mt-6">${parseInline(line.slice(4), assets)}</h3>`;
            continue;
        }

        // 3. Blockquotes
        if (line.startsWith('> ')) {
            html += `<blockquote class="border-l-4 border-blue-500 pl-4 py-2 my-4 text-zinc-400 italic bg-zinc-800/30 rounded-r">${parseInline(line.slice(2), assets)}</blockquote>`;
            continue;
        }

        // 4. Lists
        if (line.match(/^\s*-\s/)) {
            html += `<div class="flex gap-2 ml-4 mb-1 text-zinc-300"><span class="text-zinc-500">•</span><span>${parseInline(line.replace(/^\s*-\s/, ''), assets)}</span></div>`;
            continue;
        }
        if (line.match(/^\s*\d+\.\s/)) {
            const num = line.match(/^\s*(\d+)\./)?.[1] || '1';
            html += `<div class="flex gap-2 ml-4 mb-1 text-zinc-300"><span class="text-zinc-500 font-mono">${num}.</span><span>${parseInline(line.replace(/^\s*\d+\.\s/, ''), assets)}</span></div>`;
            continue;
        }

        // 5. Media (Images/Video/Audio) using Markdown Image Syntax: ![alt](src)
        const mediaMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (mediaMatch) {
            const [_, alt, src] = mediaMatch;
            const resolved = resolveSrc(src);
            
            // Heuristic detection of media type
            const isVideo = resolved.startsWith('data:video') || src.match(/\.(mp4|webm|mov)$/i);
            const isAudio = resolved.startsWith('data:audio') || src.match(/\.(mp3|wav|ogg)$/i);

            if (isVideo) {
                html += `<div class="my-6"><video controls src="${resolved}" class="max-w-full rounded-lg shadow-lg border border-zinc-800 bg-black max-h-[500px]"></video><div class="text-xs text-zinc-500 mt-2 text-center italic">${alt}</div></div>`;
            } else if (isAudio) {
                html += `<div class="my-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-800 flex flex-col gap-2"><div class="text-xs text-zinc-400 flex items-center gap-2 font-mono uppercase"><span class="w-2 h-2 rounded-full bg-purple-500"></span> ${alt || 'Audio Track'}</div><audio controls src="${resolved}" class="w-full h-8"></audio></div>`;
            } else {
                html += `<div class="my-6"><img src="${resolved}" alt="${alt}" class="max-w-full rounded-lg shadow-lg border border-zinc-800" /><div class="text-xs text-zinc-500 mt-2 text-center italic">${alt}</div></div>`;
            }
            continue;
        }

        // 6. Horizontal Rule
        if (line.trim() === '---' || line.trim() === '***') {
            html += `<hr class="border-zinc-800 my-8" />`;
            continue;
        }

        // 7. Empty lines
        if (line.trim() === '') {
            html += `<div class="h-4"></div>`;
            continue;
        }

        // 8. Paragraphs
        html += `<p class="mb-2 leading-relaxed text-zinc-300">${parseInline(line, assets)}</p>`;
    }
    return html;
};

// Inline parser for Bold, Italic, Link, Inline Code, Color, Underline
const parseInline = (text: string, assets: Record<string, string>) => {
    let out = text;

    // Bold (**text**)
    out = out.replace(/\*\*(.*?)\*\*/g, '<strong class="text-zinc-100 font-bold">$1</strong>');
    
    // Italic (*text*)
    out = out.replace(/\*(.*?)\*/g, '<em class="text-zinc-200 italic">$1</em>');
    
    // Strikethrough (~~text~~)
    out = out.replace(/~~(.*?)~~/g, '<s class="opacity-60 text-zinc-500 decoration-zinc-500">$1</s>');
    
    // Underline (<u>text</u>) - We respect the HTML tag
    out = out.replace(/<u>(.*?)<\/u>/g, '<u class="decoration-blue-500 decoration-2 underline-offset-4">$1</u>');

    // Color Spans (<span style="color:...">text</span>)
    // We trust the local input here for color styles
    out = out.replace(/<span style="color: (.*?)">(.*?)<\/span>/g, '<span style="color: $1">$2</span>');

    // Inline Code (`text`)
    out = out.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 text-red-400 px-1.5 py-0.5 rounded text-sm font-mono border border-zinc-700/50">$1</code>');

    // Links ([text](url))
    out = out.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer transition-colors">$1</a>');

    return out;
};


// --- COMPONENT ---

const DocEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, assets = {}, onAddAsset }) => {
  const [content, setContent] = useState(initialContent);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [isUploading, setIsUploading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  
  // Save Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedContent = useRef(initialContent);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Sync initial content
  useEffect(() => {
    if (initialContent !== content && initialContent !== lastSavedContent.current) {
        setContent(initialContent);
        lastSavedContent.current = initialContent;
    }
  }, [initialContent]);

  // Update preview
  useEffect(() => {
      setPreviewHtml(parseDoc(content, assets));
  }, [content, assets]);

  // Autosave
  useEffect(() => {
    if (content === lastSavedContent.current) return;
    setSaveStatus('unsaved');
    const timer = setTimeout(handleManualSave, 1500);
    return () => clearTimeout(timer);
  }, [content]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content]);

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave(content);
    lastSavedContent.current = content;
    setTimeout(() => setSaveStatus('saved'), 500); 
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear the entire document?')) setContent('');
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const newText = textarea.value.substring(0, start) + before + selectedText + after + textarea.value.substring(end);
    setContent(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAddAsset) return;

    setIsUploading(true);
    try {
        // We use the same asset system, but the parser detects if it's video/audio based on the data
        const assetUrl = await onAddAsset(file); 
        const safeName = file.name.replace(/[\[\]\(\)]/g, '');
        
        // Insert standard markdown image syntax. The parser is smart enough to render <video> or <audio> 
        // if the assetUrl ends in extensions or is specific data types.
        insertText(`\n![${safeName}](${assetUrl})\n`);
    } catch (error) {
        console.error("Upload failed", error);
        alert("Failed to add media.");
    } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const color = e.target.value;
      insertText(`<span style="color: ${color}">`, `</span>`);
  };

  const ToolbarButton = ({ icon: Icon, onClick, title, active = false, disabled = false, color }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={title}
    >
      <Icon className={`w-4 h-4 ${color}`} />
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Top Bar */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar mask-gradient pr-4">
           <h3 className="text-zinc-200 font-medium mr-2 truncate max-w-[150px] shrink-0">{fileName}</h3>
           <div className="h-6 w-px bg-zinc-800 hidden sm:block shrink-0"></div>
           
           <div className="flex items-center gap-0.5 shrink-0">
              {/* Text Style */}
              <ToolbarButton icon={Bold} onClick={() => insertText('**', '**')} title="Bold" />
              <ToolbarButton icon={Italic} onClick={() => insertText('*', '*')} title="Italic" />
              <ToolbarButton icon={Underline} onClick={() => insertText('<u>', '</u>')} title="Underline" />
              <ToolbarButton icon={Strikethrough} onClick={() => insertText('~~', '~~')} title="Strikethrough" />
              
              {/* Color Picker */}
              <div className="relative group mx-1 flex items-center">
                  <input 
                    ref={colorInputRef}
                    type="color" 
                    onChange={handleColorChange}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    title="Text Color"
                  />
                  <ToolbarButton icon={Palette} onClick={() => {}} title="Text Color" color="text-pink-400" />
              </div>

              <div className="w-px h-4 bg-zinc-800 mx-1"></div>

              {/* Structure */}
              <ToolbarButton icon={Heading1} onClick={() => insertText('# ')} title="Heading 1" />
              <ToolbarButton icon={Heading2} onClick={() => insertText('## ')} title="Heading 2" />
              <ToolbarButton icon={List} onClick={() => insertText('- ')} title="Bullet List" />
              <ToolbarButton icon={Quote} onClick={() => insertText('> ')} title="Quote" />
              <ToolbarButton icon={Code} onClick={() => insertText('```\n', '\n```')} title="Code Block" />
              
              <div className="w-px h-4 bg-zinc-800 mx-1"></div>

              {/* Media Upload */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*,video/*,audio/*" 
                onChange={handleMediaUpload} 
              />
              
              <ToolbarButton 
                  icon={ImageIcon} 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Insert Image"
                  color="text-emerald-400"
              />
              <ToolbarButton 
                  icon={Video} 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Insert Video"
                  color="text-blue-400"
              />
              <ToolbarButton 
                  icon={Music} 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Insert Audio"
                  color="text-purple-400"
              />
           </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center mr-2 hidden sm:flex">
            {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /></span>}
            {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /></span>}
            {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /></span>}
          </div>

          <div className="flex bg-zinc-800 p-1 rounded-lg border border-zinc-700 hidden sm:flex">
            <button onClick={() => setViewMode('edit')} className={`p-1.5 rounded transition-all ${viewMode === 'edit' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`} title="Edit Only"><PenTool className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('split')} className={`p-1.5 rounded transition-all ${viewMode === 'split' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`} title="Split View"><Columns className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('preview')} className={`p-1.5 rounded transition-all ${viewMode === 'preview' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`} title="Preview Only"><Eye className="w-4 h-4" /></button>
          </div>
          <button onClick={handleClear} className="p-2 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400 transition-colors" title="Clear Document"><Trash2 className="w-4 h-4" /></button>
          
          <button 
            onClick={handleManualSave} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-200'}`}
          >
            <Save className="w-4 h-4" />
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
              placeholder="# Start writing..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview Pane - Custom Render */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`h-full overflow-auto custom-scrollbar bg-zinc-900 ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
             <div 
                className="max-w-3xl mx-auto p-8 prose prose-invert prose-headings:border-b-0"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
             />
          </div>
        )}
      </div>
    </div>
  );
};

export default DocEditor;