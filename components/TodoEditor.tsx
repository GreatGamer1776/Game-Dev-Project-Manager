
import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, CheckSquare, Square, Calendar, Flag, ChevronDown, ChevronUp, Search, Filter, ListChecks } from 'lucide-react';
import { TodoItem, Priority, SubTask, EditorProps } from '../types';

const TodoEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  // Standardization: extract items from initialContent
  const [items, setItems] = useState<TodoItem[]>(initialContent?.items || []);
  
  const [newItemText, setNewItemText] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<Priority>('Medium');
  const [newItemDate, setNewItemDate] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<'All' | Priority>('All');
  const [hideCompleted, setHideCompleted] = useState(false);
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubTaskText, setNewSubTaskText] = useState('');

  useEffect(() => {
    setItems(initialContent?.items || []);
  }, [initialContent]);

  const handleSave = () => {
    // Save as standard object { items: [] }
    onSave({ items });
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemText.trim()) return;

    const newItem: TodoItem = {
      id: crypto.randomUUID(),
      text: newItemText.trim(),
      completed: false,
      priority: newItemPriority,
      dueDate: newItemDate || undefined,
      description: '',
      subTasks: []
    };

    setItems([newItem, ...items]); 
    setNewItemText('');
    setNewItemPriority('Medium');
    setNewItemDate('');
  };

  const toggleComplete = (id: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const deleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this task?")) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItemDescription = (id: string, desc: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, description: desc } : item
    ));
  };

  // --- Sub Task Logic ---
  
  const addSubTask = (itemId: string) => {
    if (!newSubTaskText.trim()) return;
    
    const newSub: SubTask = {
      id: crypto.randomUUID(),
      text: newSubTaskText.trim(),
      completed: false
    };

    setItems(items.map(item => {
      if (item.id === itemId) {
        return { ...item, subTasks: [...(item.subTasks || []), newSub] };
      }
      return item;
    }));
    setNewSubTaskText('');
  };

  const toggleSubTask = (itemId: string, subTaskId: string) => {
    setItems(items.map(item => {
      if (item.id === itemId && item.subTasks) {
        return {
          ...item,
          subTasks: item.subTasks.map(sub => 
            sub.id === subTaskId ? { ...sub, completed: !sub.completed } : sub
          )
        };
      }
      return item;
    }));
  };

  const deleteSubTask = (itemId: string, subTaskId: string) => {
    setItems(items.map(item => {
      if (item.id === itemId && item.subTasks) {
        return {
          ...item,
          subTasks: item.subTasks.filter(sub => sub.id !== subTaskId)
        };
      }
      return item;
    }));
  };

  const getPriorityColor = (p: Priority) => {
    switch(p) {
      case 'High': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'Medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'Low': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    }
  };

  // Filter Logic
  const filteredItems = items.filter(item => {
    if (searchQuery && !item.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterPriority !== 'All' && item.priority !== filterPriority) return false;
    if (hideCompleted && item.completed) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <h3 className="text-zinc-200 font-medium">{fileName}</h3>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20"
        >
          <Save className="w-4 h-4" />
          Save List
        </button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-6 lg:p-10">
        <div className="max-w-4xl mx-auto">
          
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-8 shadow-xl">
            <h4 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">New Task</h4>
            <form onSubmit={handleAddItem} className="flex flex-col gap-3">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
              />
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 relative">
                  <Flag className="w-4 h-4 text-zinc-400 pointer-events-none" />
                  <select 
                    value={newItemPriority}
                    onChange={(e) => setNewItemPriority(e.target.value as Priority)}
                    className="bg-zinc-900 text-sm text-zinc-300 focus:outline-none cursor-pointer appearance-none pr-8 pl-1"
                  >
                    <option value="Low" className="bg-zinc-900">Low Priority</option>
                    <option value="Medium" className="bg-zinc-900">Medium Priority</option>
                    <option value="High" className="bg-zinc-900">High Priority</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 pointer-events-none" />
                </div>
                
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  <input 
                    type="date" 
                    value={newItemDate}
                    onChange={(e) => setNewItemDate(e.target.value)}
                    className="bg-transparent text-sm text-zinc-300 focus:outline-none [color-scheme:dark] cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!newItemText.trim()}
                  className="ml-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              </div>
            </form>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/50">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto">
               <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5">
                  <Filter className="w-3.5 h-3.5 text-zinc-500" />
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value as 'All' | Priority)}
                    className="bg-zinc-950 text-xs text-zinc-300 focus:outline-none cursor-pointer"
                  >
                    <option value="All">All Priorities</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
               </div>

               <button
                  onClick={() => setHideCompleted(!hideCompleted)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
                    hideCompleted 
                      ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' 
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
               >
                  {hideCompleted ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  Hide Done
               </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900/50">
                {items.length === 0 ? (
                   <CheckSquare className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                ) : (
                   <Search className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                )}
                <p className="text-zinc-500 font-medium">
                  {items.length === 0 ? "All caught up! No tasks." : "No tasks match your filters."}
                </p>
                {items.length > 0 && (
                  <button 
                    onClick={() => { setSearchQuery(''); setFilterPriority('All'); setHideCompleted(false); }}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item) => {
                const subTasks = item.subTasks || [];
                const completedSub = subTasks.filter(s => s.completed).length;
                const totalSub = subTasks.length;
                const progress = totalSub > 0 ? (completedSub / totalSub) * 100 : 0;

                return (
                  <div 
                    key={item.id}
                    className={`group rounded-xl border transition-all duration-200 overflow-hidden ${
                      item.completed 
                        ? 'bg-zinc-950 border-zinc-900 opacity-60' 
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:shadow-lg'
                    }`}
                  >
                    <div className="flex items-center gap-4 p-4">
                      <button
                        onClick={() => toggleComplete(item.id)}
                        className={`shrink-0 transition-colors ${
                          item.completed ? 'text-emerald-500' : 'text-zinc-600 hover:text-emerald-500'
                        }`}
                      >
                        {item.completed ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`text-base font-medium truncate ${item.completed ? 'line-through text-zinc-600' : 'text-zinc-200'}`}>
                          {item.text}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                           <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getPriorityColor(item.priority)}`}>
                             {item.priority}
                           </span>
                           {item.dueDate && (
                             <span className="flex items-center text-xs text-zinc-500">
                               <Calendar className="w-3 h-3 mr-1" />
                               {new Date(item.dueDate).toLocaleDateString()}
                             </span>
                           )}
                           {totalSub > 0 && (
                             <div className="flex items-center gap-2 text-xs text-zinc-500 ml-1">
                                <ListChecks className="w-3 h-3" />
                                <span>{completedSub}/{totalSub}</span>
                                <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500/70" style={{ width: `${progress}%` }}></div>
                                </div>
                             </div>
                           )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          className={`p-2 rounded hover:bg-zinc-800 transition-colors ${expandedId === item.id ? 'text-blue-400 bg-zinc-800' : 'text-zinc-500'}`}
                        >
                           {expandedId === item.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={(e) => deleteItem(e, item.id)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    {expandedId === item.id && (
                      <div className="px-4 pb-4 pt-0 border-t border-zinc-800 bg-zinc-950/30">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                           <div>
                              <label className="text-xs font-semibold text-zinc-500 uppercase mb-2 block">Description</label>
                              <textarea
                                value={item.description || ''}
                                onChange={(e) => updateItemDescription(item.id, e.target.value)}
                                placeholder="Add notes..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50 min-h-[120px] resize-y"
                              />
                           </div>

                           <div>
                              <label className="text-xs font-semibold text-zinc-500 uppercase mb-2 block">Sub-tasks</label>
                              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 min-h-[120px] flex flex-col">
                                 <div className="flex gap-2 mb-3">
                                   <input 
                                      type="text" 
                                      value={newSubTaskText}
                                      onChange={(e) => setNewSubTaskText(e.target.value)}
                                      onKeyDown={(e) => { if(e.key === 'Enter') addSubTask(item.id); }}
                                      placeholder="Add sub-task..."
                                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
                                   />
                                   <button 
                                     onClick={() => addSubTask(item.id)}
                                     disabled={!newSubTaskText.trim()}
                                     className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1 rounded disabled:opacity-50"
                                   >
                                     <Plus className="w-4 h-4" />
                                   </button>
                                 </div>
                                 
                                 <div className="space-y-1 flex-1">
                                    {subTasks.map(sub => (
                                      <div key={sub.id} className="flex items-center gap-2 group/sub p-1 hover:bg-zinc-900 rounded">
                                        <button 
                                          onClick={() => toggleSubTask(item.id, sub.id)}
                                          className={`text-zinc-500 hover:text-blue-400 ${sub.completed ? 'text-blue-500' : ''}`}
                                        >
                                           {sub.completed ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                        </button>
                                        <span className={`text-sm flex-1 ${sub.completed ? 'line-through text-zinc-600' : 'text-zinc-300'}`}>
                                          {sub.text}
                                        </span>
                                        <button 
                                          onClick={() => deleteSubTask(item.id, sub.id)}
                                          className="text-zinc-600 hover:text-red-400 opacity-0 group-hover/sub:opacity-100 transition-opacity"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                    {subTasks.length === 0 && (
                                      <div className="text-center text-xs text-zinc-600 py-4 italic">No sub-tasks yet</div>
                                    )}
                                 </div>
                              </div>
                           </div>
                         </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          
           {items.length > 0 && (
             <div className="mt-6 flex justify-between text-xs text-zinc-500 border-t border-zinc-800/50 pt-4">
               <div>Showing {filteredItems.length} of {items.length} tasks</div>
               <div>{items.filter(i => i.completed).length} completed total</div>
             </div>
           )}

        </div>
      </div>
    </div>
  );
};

export default TodoEditor;
