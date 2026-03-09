import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMainSite } from '../../context/MainSiteContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import {
  DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay,
  useDroppable, useDraggable
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import {
  Plus, MoreHorizontal, Trash2, Pencil, Calendar, User, Tag, Paperclip,
  MessageSquare, CheckSquare, Clock, ArrowLeft, GripVertical, X, ChevronDown,
  Upload, Flag, LayoutList
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '../../components/ui/dropdown-menu';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  medium: { label: 'Medium', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  high: { label: 'High', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  urgent: { label: 'Urgent', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const LABEL_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

// ─── Board List View ───
function BoardListView({ boards, onSelect, onCreate, onDelete, mainSiteSlug }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#f59e0b');

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: desc, color });
    setShowCreate(false);
    setName('');
    setDesc('');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Boards</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage your projects with Kanban boards</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="create-board-btn">
          <Plus className="w-4 h-4 mr-2" /> New Board
        </Button>
      </div>

      {boards.length === 0 ? (
        <div className="text-center py-20" data-testid="empty-boards">
          <LayoutList className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">No boards yet</p>
          <p className="text-zinc-500 text-sm mt-1">Create your first board to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="boards-grid">
          {boards.map(board => (
            <div
              key={board.id}
              onClick={() => onSelect(board.id)}
              className="group cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-all p-5"
              data-testid={`board-card-${board.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-3 h-3 rounded-full mt-1" style={{ backgroundColor: board.color }} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700">
                    <DropdownMenuItem className="text-red-400" onClick={e => { e.stopPropagation(); onDelete(board.id); }}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1">{board.name}</h3>
              {board.description && <p className="text-zinc-400 text-sm line-clamp-2 mb-3">{board.description}</p>}
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <LayoutList className="w-3.5 h-3.5" />
                <span>{board.task_count || 0} tasks</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Create Board</DialogTitle>
            <DialogDescription className="text-zinc-400">Add a new Kanban board to organize your tasks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="Board name" value={name} onChange={e => setName(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" data-testid="board-name-input" autoFocus />
            <Textarea placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" rows={2} />
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Color</label>
              <div className="flex gap-2">
                {['#f59e0b','#ef4444','#3b82f6','#22c55e','#8b5cf6','#ec4899','#06b6d4','#6b7280'].map(c => (
                  <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} className="w-full bg-orange-500 hover:bg-orange-600 text-white" data-testid="confirm-create-board">Create Board</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sortable Task Card ───
function SortableTaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const checkedCount = (task.checklist || []).filter(c => c.done).length;
  const totalChecklist = (task.checklist || []).length;

  return (
    <div ref={setNodeRef} style={style} {...attributes}
      className="group bg-zinc-800/80 rounded-lg border border-zinc-700/50 p-3 cursor-pointer hover:border-zinc-500 transition-all"
      onClick={() => onClick(task)} data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start gap-2">
        <div {...listeners} className="mt-1 cursor-grab opacity-0 group-hover:opacity-60 transition-opacity">
          <GripVertical className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="flex-1 min-w-0">
          {task.labels?.length > 0 && (
            <div className="flex gap-1 flex-wrap mb-2">
              {task.labels.map((label, i) => (
                <span key={i} className="h-1.5 w-8 rounded-full" style={{ backgroundColor: LABEL_COLORS[i % LABEL_COLORS.length] }} />
              ))}
            </div>
          )}
          <p className="text-sm text-white font-medium leading-snug">{task.title}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
            {task.deadline && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(task.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {totalChecklist > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                {checkedCount}/{totalChecklist}
              </span>
            )}
            {(task.comments?.length || 0) > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {task.comments.length}
              </span>
            )}
            {(task.attachments?.length || 0) > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="w-3 h-3" />
                {task.attachments.length}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${prio.color}`}>{prio.label}</span>
            {task.assignee_name && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <User className="w-3 h-3" />{task.assignee_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Droppable Column ───
function DroppableColumn({ column, tasks, onAddTask, onTaskClick, onEditColumn, onDeleteColumn }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const taskIds = tasks.map(t => t.id);
  const [addingTask, setAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleAddTask = () => {
    if (!newTitle.trim()) return;
    onAddTask(column.id, newTitle.trim());
    setNewTitle('');
    setAddingTask(false);
  };

  return (
    <div className={`flex flex-col w-72 min-w-[288px] bg-zinc-900/60 rounded-xl border transition-colors ${isOver ? 'border-orange-500/50' : 'border-zinc-800'}`}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
          <h3 className="text-sm font-semibold text-zinc-200">{column.name}</h3>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 rounded">{tasks.length}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-6 h-6">
              <MoreHorizontal className="w-3.5 h-3.5 text-zinc-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700">
            <DropdownMenuItem onClick={() => onEditColumn(column)}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-400" onClick={() => onDeleteColumn(column.id)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-240px)] scrollbar-thin">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <SortableTaskCard key={task.id} task={task} onClick={onTaskClick} />
          ))}
        </SortableContext>
      </div>
      <div className="p-2 border-t border-zinc-800">
        {addingTask ? (
          <div className="space-y-2">
            <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title..." autoFocus
              className="bg-zinc-800 border-zinc-700 text-white text-sm h-8"
              onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setAddingTask(false); }}
              data-testid={`add-task-input-${column.id}`}
            />
            <div className="flex gap-1">
              <Button size="sm" onClick={handleAddTask} className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-7 px-2" data-testid={`confirm-add-task-${column.id}`}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingTask(false)} className="text-xs h-7 px-2">Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="w-full justify-start text-zinc-400 text-sm h-8 hover:text-white" onClick={() => setAddingTask(true)} data-testid={`add-task-btn-${column.id}`}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add task
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Task Detail Modal ───
function TaskDetailModal({ task, open, onClose, onUpdate, onDelete, onAddComment, onDeleteComment, onAddAttachment, onDeleteAttachment, users }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [labels, setLabels] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'medium');
      setDeadline(task.deadline || '');
      setAssigneeId(task.assignee_id || '');
      setLabels(task.labels || []);
      setChecklist(task.checklist || []);
    }
  }, [task]);

  if (!task) return null;

  const handleSave = () => {
    const assignee = users.find(u => u.id === assigneeId);
    onUpdate(task.id, {
      title, description, priority, deadline: deadline || null,
      assignee_id: assigneeId || null,
      assignee_name: assignee?.name || null,
      labels, checklist
    });
  };

  const toggleCheckItem = (idx) => {
    const updated = [...checklist];
    updated[idx] = { ...updated[idx], done: !updated[idx].done };
    setChecklist(updated);
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setChecklist([...checklist, { id: Date.now().toString(), text: newCheckItem.trim(), done: false }]);
    setNewCheckItem('');
  };

  const removeCheckItem = (idx) => {
    setChecklist(checklist.filter((_, i) => i !== idx));
  };

  const addLabel = () => {
    if (!newLabel.trim() || labels.includes(newLabel.trim())) return;
    setLabels([...labels, newLabel.trim()]);
    setNewLabel('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await onAddAttachment(task.id, file);
    setUploading(false);
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    onAddComment(task.id, commentText.trim());
    setCommentText('');
  };

  const checkedCount = checklist.filter(c => c.done).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white sr-only">Edit Task</DialogTitle>
          <DialogDescription className="sr-only">Edit task details, checklist, labels, and attachments.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Title */}
          <Input value={title} onChange={e => setTitle(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white text-lg font-semibold h-11" data-testid="task-title-input" />

          {/* Priority & Deadline row */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-zinc-400 mb-1 block">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm" data-testid="task-priority-select">
                {Object.entries(PRIORITY_CONFIG).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-zinc-400 mb-1 block">Deadline</label>
              <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white text-sm" data-testid="task-deadline-input" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-zinc-400 mb-1 block">Assignee</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm" data-testid="task-assignee-select">
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Add a description..." className="bg-zinc-800 border-zinc-700 text-white text-sm" data-testid="task-description-input" />
          </div>

          {/* Labels */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block flex items-center gap-1"><Tag className="w-3 h-3" /> Labels</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {labels.map((label, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: LABEL_COLORS[i % LABEL_COLORS.length] }}>
                  {label}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setLabels(labels.filter((_, j) => j !== i))} />
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Add label..." className="bg-zinc-800 border-zinc-700 text-white text-xs h-7 flex-1" onKeyDown={e => e.key === 'Enter' && addLabel()} />
              <Button size="sm" variant="outline" onClick={addLabel} className="h-7 text-xs border-zinc-700">Add</Button>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block flex items-center gap-1">
              <CheckSquare className="w-3 h-3" /> Checklist
              {checklist.length > 0 && <span className="text-zinc-500 ml-1">({checkedCount}/{checklist.length})</span>}
            </label>
            {checklist.length > 0 && (
              <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-2">
                <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${checklist.length > 0 ? (checkedCount / checklist.length) * 100 : 0}%` }} />
              </div>
            )}
            <div className="space-y-1 mb-2">
              {checklist.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={item.done} onChange={() => toggleCheckItem(idx)} className="accent-green-500" />
                  <span className={`text-sm flex-1 ${item.done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>{item.text}</span>
                  <X className="w-3.5 h-3.5 text-zinc-500 cursor-pointer opacity-0 group-hover:opacity-100" onClick={() => removeCheckItem(idx)} />
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <Input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="Add item..." className="bg-zinc-800 border-zinc-700 text-white text-xs h-7 flex-1" onKeyDown={e => e.key === 'Enter' && addCheckItem()} />
              <Button size="sm" variant="outline" onClick={addCheckItem} className="h-7 text-xs border-zinc-700">Add</Button>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block flex items-center gap-1"><Paperclip className="w-3 h-3" /> Attachments</label>
            {(task.attachments || []).length > 0 && (
              <div className="space-y-1 mb-2">
                {task.attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 text-xs bg-zinc-800 rounded px-2 py-1.5 group">
                    <Paperclip className="w-3 h-3 text-zinc-400" />
                    <a href={att.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex-1 truncate">{att.name}</a>
                    <span className="text-zinc-500">{(att.size / 1024).toFixed(0)} KB</span>
                    <X className="w-3.5 h-3.5 text-zinc-500 cursor-pointer opacity-0 group-hover:opacity-100" onClick={() => onDeleteAttachment(task.id, att.id)} />
                  </div>
                ))}
              </div>
            )}
            <label className={`flex items-center gap-2 text-xs text-zinc-400 cursor-pointer border border-dashed border-zinc-700 rounded px-3 py-2 hover:border-zinc-500 transition-colors ${uploading ? 'opacity-50' : ''}`}>
              <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : 'Upload file'}
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>

          {/* Comments */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Comments ({(task.comments || []).length})</label>
            <div className="space-y-2 mb-2 max-h-40 overflow-y-auto">
              {(task.comments || []).map(c => (
                <div key={c.id} className="bg-zinc-800 rounded px-3 py-2 group">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">{c.author_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500">{new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <X className="w-3 h-3 text-zinc-500 cursor-pointer opacity-0 group-hover:opacity-100" onClick={() => onDeleteComment(task.id, c.id)} />
                    </div>
                  </div>
                  <p className="text-sm text-zinc-300 mt-1">{c.text}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <Input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write a comment..." className="bg-zinc-800 border-zinc-700 text-white text-xs h-8 flex-1" onKeyDown={e => e.key === 'Enter' && handleAddComment()} />
              <Button size="sm" onClick={handleAddComment} className="bg-zinc-700 hover:bg-zinc-600 text-white h-8 text-xs">Post</Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between pt-2 border-t border-zinc-800">
            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 text-xs" onClick={() => onDelete(task.id)} data-testid="delete-task-btn">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Task
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white text-xs" data-testid="save-task-btn">
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Kanban Board View ───
function KanbanBoardView({ boardId, onBack, mainSiteId, headers }) {
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editCol, setEditCol] = useState(null);
  const [editColName, setEditColName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const fetchBoard = useCallback(async () => {
    try {
      const [boardRes, colsRes, tasksRes] = await Promise.all([
        axios.get(`${API}/task-boards/boards/${boardId}`, { headers }),
        axios.get(`${API}/task-boards/boards/${boardId}/columns`, { headers }),
        axios.get(`${API}/task-boards/boards/${boardId}/tasks`, { headers }),
      ]);
      setBoard(boardRes.data);
      setColumns(colsRes.data);
      setTasks(tasksRes.data);
    } catch (err) {
      toast.error('Failed to load board');
    }
  }, [boardId, headers]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/main-sites/${mainSiteId}/users`, { headers });
      setUsers(res.data.map(u => ({ id: u.user_id, name: u.user_name, email: u.user_email })));
    } catch { /* ignore */ }
  }, [mainSiteId, headers]);

  useEffect(() => { fetchBoard(); fetchUsers(); }, [fetchBoard, fetchUsers]);

  const getTasksForColumn = (columnId) => tasks.filter(t => t.column_id === columnId).sort((a, b) => a.order - b.order);

  const handleAddTask = async (columnId, title) => {
    try {
      const res = await axios.post(`${API}/task-boards/boards/${boardId}/tasks`, { title, column_id: columnId }, { headers });
      setTasks(prev => [...prev, res.data]);
    } catch { toast.error('Failed to create task'); }
  };

  const handleUpdateTask = async (taskId, updates) => {
    try {
      const res = await axios.put(`${API}/task-boards/boards/${boardId}/tasks/${taskId}`, updates, { headers });
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t));
      setSelectedTask(res.data);
      toast.success('Task updated');
    } catch { toast.error('Failed to update task'); }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await axios.delete(`${API}/task-boards/boards/${boardId}/tasks/${taskId}`, { headers });
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
      toast.success('Task deleted');
    } catch { toast.error('Failed to delete task'); }
  };

  const handleAddComment = async (taskId, text) => {
    try {
      const res = await axios.post(`${API}/task-boards/boards/${boardId}/tasks/${taskId}/comments`, { text }, { headers });
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t));
      setSelectedTask(res.data);
    } catch { toast.error('Failed to add comment'); }
  };

  const handleDeleteComment = async (taskId, commentId) => {
    try {
      const res = await axios.delete(`${API}/task-boards/boards/${boardId}/tasks/${taskId}/comments/${commentId}`, { headers });
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t));
      setSelectedTask(res.data);
    } catch { toast.error('Failed to delete comment'); }
  };

  const handleAddAttachment = async (taskId, file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`${API}/task-boards/boards/${boardId}/tasks/${taskId}/attachments`, formData, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t));
      setSelectedTask(res.data);
      toast.success('File uploaded');
    } catch { toast.error('Failed to upload file'); }
  };

  const handleDeleteAttachment = async (taskId, attachmentId) => {
    try {
      const res = await axios.delete(`${API}/task-boards/boards/${boardId}/tasks/${taskId}/attachments/${attachmentId}`, { headers });
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t));
      setSelectedTask(res.data);
    } catch { toast.error('Failed to delete attachment'); }
  };

  const handleAddColumn = async () => {
    if (!newColName.trim()) return;
    try {
      const res = await axios.post(`${API}/task-boards/boards/${boardId}/columns`, { name: newColName.trim() }, { headers });
      setColumns(prev => [...prev, res.data]);
      setNewColName('');
      setShowAddCol(false);
    } catch { toast.error('Failed to add column'); }
  };

  const handleEditColumn = async () => {
    if (!editCol || !editColName.trim()) return;
    try {
      const res = await axios.put(`${API}/task-boards/boards/${boardId}/columns/${editCol.id}`, { name: editColName.trim() }, { headers });
      setColumns(prev => prev.map(c => c.id === editCol.id ? res.data : c));
      setEditCol(null);
    } catch { toast.error('Failed to update column'); }
  };

  const handleDeleteColumn = async (columnId) => {
    if (!window.confirm('Delete this column and all its tasks?')) return;
    try {
      await axios.delete(`${API}/task-boards/boards/${boardId}/columns/${columnId}`, { headers });
      setColumns(prev => prev.filter(c => c.id !== columnId));
      setTasks(prev => prev.filter(t => t.column_id !== columnId));
      toast.success('Column deleted');
    } catch { toast.error('Failed to delete column'); }
  };

  const handleDragStart = (event) => { setActiveId(event.active.id); };

  const handleDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    // Determine target column
    let targetColumnId = over.id;
    const isOverTask = tasks.some(t => t.id === over.id);
    if (isOverTask) {
      const overTask = tasks.find(t => t.id === over.id);
      targetColumnId = overTask.column_id;
    }

    // Check if target is a column
    const isColumn = columns.some(c => c.id === targetColumnId);
    if (!isColumn) return;

    const targetTasks = tasks.filter(t => t.column_id === targetColumnId && t.id !== active.id).sort((a, b) => a.order - b.order);
    let newOrder = 0;

    if (isOverTask) {
      const overIdx = targetTasks.findIndex(t => t.id === over.id);
      newOrder = overIdx >= 0 ? overIdx : targetTasks.length;
    } else {
      newOrder = targetTasks.length;
    }

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === active.id ? { ...t, column_id: targetColumnId, order: newOrder } : t));

    try {
      await axios.put(`${API}/task-boards/boards/${boardId}/tasks/${active.id}/move`, { column_id: targetColumnId, order: newOrder }, { headers });
    } catch {
      fetchBoard();
      toast.error('Failed to move task');
    }
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  if (!board) return <div className="flex items-center justify-center min-h-[300px]"><div className="animate-pulse text-zinc-400">Loading board...</div></div>;

  return (
    <div className="flex flex-col h-full" data-testid="kanban-board">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} className="w-8 h-8" data-testid="back-to-boards-btn">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: board.color }} />
        <h2 className="text-lg font-bold text-white">{board.name}</h2>
        <span className="text-xs text-zinc-500">{tasks.length} tasks</span>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => setShowAddCol(true)} className="border-zinc-700 text-zinc-300 text-xs h-7" data-testid="add-column-btn">
            <Plus className="w-3.5 h-3.5 mr-1" /> Column
          </Button>
        </div>
      </div>

      {/* Board content */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full">
            {columns.map(col => (
              <DroppableColumn
                key={col.id}
                column={col}
                tasks={getTasksForColumn(col.id)}
                onAddTask={handleAddTask}
                onTaskClick={setSelectedTask}
                onEditColumn={(c) => { setEditCol(c); setEditColName(c.name); }}
                onDeleteColumn={handleDeleteColumn}
              />
            ))}
            {/* Add column inline */}
            {!showAddCol && (
              <button onClick={() => setShowAddCol(true)} className="w-72 min-w-[288px] rounded-xl border-2 border-dashed border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors h-32">
                <Plus className="w-5 h-5 mr-2" /> Add Column
              </button>
            )}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="bg-zinc-800 rounded-lg border border-orange-500/50 p-3 shadow-xl w-72 opacity-90">
                <p className="text-sm text-white font-medium">{activeTask.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Task detail modal */}
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        onAddComment={handleAddComment}
        onDeleteComment={handleDeleteComment}
        onAddAttachment={handleAddAttachment}
        onDeleteAttachment={handleDeleteAttachment}
        users={users}
      />

      {/* Add column dialog */}
      <Dialog open={showAddCol} onOpenChange={setShowAddCol}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Add Column</DialogTitle>
            <DialogDescription className="text-zinc-400">Create a new column for this board.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="Column name" className="bg-zinc-800 border-zinc-700 text-white" autoFocus onKeyDown={e => e.key === 'Enter' && handleAddColumn()} data-testid="new-column-name-input" />
            <Button onClick={handleAddColumn} className="w-full bg-orange-500 hover:bg-orange-600 text-white" data-testid="confirm-add-column">Add Column</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit column dialog */}
      <Dialog open={!!editCol} onOpenChange={() => setEditCol(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Rename Column</DialogTitle>
            <DialogDescription className="text-zinc-400">Change the column name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input value={editColName} onChange={e => setEditColName(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" autoFocus onKeyDown={e => e.key === 'Enter' && handleEditColumn()} />
            <Button onClick={handleEditColumn} className="w-full bg-orange-500 hover:bg-orange-600 text-white">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───
export default function TaskBoardsPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { mainSite, mainSiteSlug } = useMainSite();
  const { user } = useAuth();
  const [boards, setBoards] = useState([]);

  const headers = {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'X-Main-Site-ID': mainSite?.id || '',
  };

  const fetchBoards = useCallback(async () => {
    if (!mainSite?.id) return;
    try {
      const res = await axios.get(`${API}/task-boards/boards`, { headers });
      setBoards(res.data);
    } catch { /* ignore */ }
  }, [mainSite?.id]);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  const handleCreateBoard = async (data) => {
    try {
      const res = await axios.post(`${API}/task-boards/boards`, data, { headers });
      setBoards(prev => [res.data, ...prev]);
      toast.success('Board created');
      navigate(`/${mainSiteSlug}/task-boards/${res.data.id}`);
    } catch { toast.error('Failed to create board'); }
  };

  const handleDeleteBoard = async (id) => {
    if (!window.confirm('Delete this board and all its tasks?')) return;
    try {
      await axios.delete(`${API}/task-boards/boards/${id}`, { headers });
      setBoards(prev => prev.filter(b => b.id !== id));
      if (boardId === id) navigate(`/${mainSiteSlug}/task-boards`);
      toast.success('Board deleted');
    } catch { toast.error('Failed to delete board'); }
  };

  if (boardId) {
    return (
      <KanbanBoardView
        boardId={boardId}
        onBack={() => { navigate(`/${mainSiteSlug}/task-boards`); fetchBoards(); }}
        mainSiteId={mainSite?.id}
        headers={headers}
      />
    );
  }

  return (
    <BoardListView
      boards={boards}
      onSelect={(id) => navigate(`/${mainSiteSlug}/task-boards/${id}`)}
      onCreate={handleCreateBoard}
      onDelete={handleDeleteBoard}
      mainSiteSlug={mainSiteSlug}
    />
  );
}
