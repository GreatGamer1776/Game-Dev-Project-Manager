import React, { useState } from 'react';
import { Upload, Trash2, Image as ImageIcon, Copy, Search, Grid, Check, Download } from 'lucide-react';
import { EditorProps } from '../types';

const AssetBrowser: React.FC<EditorProps> = ({ assets = {}, onAddAsset, onDeleteAsset, onSave, fileName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const assetList = Object.entries(assets).map(([id, data]) => ({ id, data }));

  const filteredAssets = assetList.filter((item) => 
    item.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && onAddAsset) {
        await onAddAsset(file);
      }
    };
    input.click();
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(`asset://${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
      if (!onDeleteAsset) {
          alert("Delete functionality not available.");
          return;
      }
      if (confirm("Delete this asset permanently? It will disappear from all documents/whiteboards using it.")) {
          onDeleteAsset(id);
      }
  };

  const downloadAsset = (data: string, id: string) => {
      const a = document.createElement('a');
      a.href = data;
      a.download = `asset-${id.substring(0,8)}.png`;
      a.click();
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-20">
        <h3 className="text-zinc-200 font-medium flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-purple-500" /> {fileName}
        </h3>
        <div className="flex items-center gap-3">
            <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text" 
                    placeholder="Search ID..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-full py-1.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700 w-48"
                />
            </div>
            <button 
                onClick={handleUpload} 
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg shadow-purple-900/20"
            >
                <Upload className="w-4 h-4" /> Upload Asset
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {assetList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 opacity-50">
                <Grid className="w-16 h-16 mb-4" />
                <p>No assets in this project yet.</p>
                <p className="text-sm mt-2">Upload images or paste them into Documents.</p>
            </div>
        ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {filteredAssets.map(({ id, data }) => (
                    <div key={id} className="group bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all shadow-sm hover:shadow-xl">
                        {/* Image Preview */}
                        <div className="aspect-square bg-[#101012] relative flex items-center justify-center overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGgyMHYyMEgwem0xMCAxMGgxMHYxMEgxMHoiIGZpbGw9IiMxODE4MWIiIGZpbGwtb3BhY2l0eT0iMC40Ii8+PC9zdmc+')]">
                            <img src={data} alt={id} className="max-w-full max-h-full object-contain" />
                            
                            {/* Overlay Actions */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                <button 
                                    onClick={() => handleCopy(id)}
                                    className="p-2 bg-white text-black rounded-full hover:scale-110 transition-transform" 
                                    title="Copy ID"
                                >
                                    {copiedId === id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                                <button 
                                    onClick={() => downloadAsset(data, id)}
                                    className="p-2 bg-zinc-800 text-white rounded-full hover:scale-110 transition-transform"
                                    title="Download"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => handleDelete(id)}
                                    className="p-2 bg-red-600 text-white rounded-full hover:scale-110 transition-transform"
                                    title="Delete Asset"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Footer info */}
                        <div className="p-3 border-t border-zinc-800 bg-zinc-900/50">
                            <div className="text-[10px] font-mono text-zinc-500 truncate" title={id}>
                                {id}
                            </div>
                            <div className="text-[10px] text-zinc-600 mt-1">
                                {(data.length / 1024).toFixed(1)} KB • {data.split(';')[0].split(':')[1]}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default AssetBrowser;