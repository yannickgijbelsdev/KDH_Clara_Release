import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  Save,
  X,
  Printer,
  Wifi,
  WifiOff,
  Repeat,
  Settings,
  CalendarOff,
  Image,
  Loader2,
  Folder,
  FolderOpen,
  FileText,
  Music,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarPicker } from '../components/ui/calendar';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import RundownEditor from '../components/RundownEditor';
import { cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const WS_BASE_URL = process.env.REACT_APP_BACKEND_URL?.replace('https://', 'wss://').replace('http://', 'ws://');

const statusColors = {
  draft: 'status-draft',
  scheduled: 'status-scheduled',
  completed: 'status-completed',
};

const statusLabels = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  completed: 'Completed',
};

const recurrenceIntervalLabels = {
  1: 'Every week',
  2: 'Every 2 weeks',
  3: 'Every 3 weeks',
  4: 'Every 4 weeks',
};

// Presence Avatar Component
const PresenceAvatars = ({ users, maxDisplay = 5 }) => {
  if (!users || users.length === 0) return null;
  
  const displayUsers = users.slice(0, maxDisplay);
  const overflowCount = users.length - maxDisplay;
  
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };
  
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Viewing:</span>
        <div className="flex -space-x-2">
          {displayUsers.map((user, idx) => (
            <Tooltip key={user.id || idx}>
              <TooltipTrigger asChild>
                <div
                  className="w-7 h-7 rounded-full bg-orange-500/20 border-2 border-[#18181b] flex items-center justify-center cursor-default"
                  style={{ zIndex: maxDisplay - idx }}
                >
                  {user.avatar_url ? (
                    <img 
                      src={user.avatar_url} 
                      alt={user.name} 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-orange-500">
                      {user.initials || getInitials(user.name)}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{user.name}</p>
              </TooltipContent>
            </Tooltip>
          ))}
          {overflowCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-7 h-7 rounded-full bg-zinc-700 border-2 border-[#18181b] flex items-center justify-center cursor-default">
                  <span className="text-xs font-semibold text-white">+{overflowCount}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{overflowCount} more viewer{overflowCount > 1 ? 's' : ''}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

const ShowDetailPage = () => {
  const { showId } = useParams();
  const navigate = useNavigate();
  const { isEditor, token } = useAuth();
  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recurringEditDialogOpen, setRecurringEditDialogOpen] = useState(false);
  const [recurringDeleteDialogOpen, setRecurringDeleteDialogOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);
  
  // WebSocket state
  const [isConnected, setIsConnected] = useState(false);
  const [presence, setPresence] = useState([]);
  const [wsRef, setWsRef] = useState(null);
  
  // Recurrence settings state
  const [isEditingRecurrence, setIsEditingRecurrence] = useState(false);
  const [recurrenceData, setRecurrenceData] = useState({});
  const [savingRecurrence, setSavingRecurrence] = useState(false);
  const [stopRecurrenceDialogOpen, setStopRecurrenceDialogOpen] = useState(false);
  const [enableRecurrenceDialogOpen, setEnableRecurrenceDialogOpen] = useState(false);
  const [enableRecurrenceData, setEnableRecurrenceData] = useState({ interval: 1, endDate: null });
  
  // Linked folders state
  const [linkedFolders, setLinkedFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [folderAssets, setFolderAssets] = useState({});

  useEffect(() => {
    fetchShow();
    fetchLinkedFolders();
  }, [showId]);

  // WebSocket connection
  useEffect(() => {
    if (!showId || !token) return;

    const wsUrl = `${WS_BASE_URL}/ws/show/${showId}?token=${token}`;
    let ws = null;
    let pingInterval = null;
    let reconnectTimeout = null;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          setIsConnected(true);
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'presence') {
              setPresence(data.users || []);
            }
            // Note: rundown item updates are handled in RundownEditor
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          setPresence([]);
          if (pingInterval) clearInterval(pingInterval);
          
          // Reconnect if not intentionally closed
          if (event.code !== 1000) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        setWsRef(ws);
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pingInterval) clearInterval(pingInterval);
      if (ws) {
        ws.close(1000, 'User navigated away');
      }
      setIsConnected(false);
      setPresence([]);
    };
  }, [showId, token]);

  const fetchShow = async () => {
    try {
      const response = await axios.get(`${API}/shows/${showId}`);
      setShow(response.data);
      setEditData(response.data);
    } catch (error) {
      toast.error('Failed to load show');
      navigate('/shows');
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedFolders = async () => {
    try {
      const response = await axios.get(`${API}/media/folders/show/${showId}`);
      setLinkedFolders(response.data);
    } catch (error) {
      console.error('Failed to load linked folders');
    }
  };

  const toggleFolder = async (folderId) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
      // Fetch folder assets if not already loaded
      if (!folderAssets[folderId]) {
        try {
          const response = await axios.get(`${API}/media?folder_id=${folderId}`);
          setFolderAssets(prev => ({ ...prev, [folderId]: response.data }));
        } catch (error) {
          console.error('Failed to load folder assets');
        }
      }
    }
    setExpandedFolders(newExpanded);
  };

  const getFileIcon = (kind, mimeType) => {
    if (kind === 'audio' || mimeType?.startsWith('audio/')) return Music;
    if (kind === 'image' || mimeType?.startsWith('image/')) return Image;
    return FileText;
  };

  const handleSave = async (updateAll = false) => {
    setSaving(true);
    try {
      const response = await axios.put(`${API}/shows/${showId}?update_all=${updateAll}`, {
        title: editData.title,
        description: editData.description,
        date: editData.date,
        start_time: editData.start_time,
        end_time: editData.end_time,
        status: editData.status,
      });
      setShow(response.data);
      setIsEditing(false);
      setRecurringEditDialogOpen(false);
      toast.success(updateAll ? 'All occurrences updated' : 'Show updated');
    } catch (error) {
      toast.error('Failed to update show');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (show?.is_recurring) {
      setRecurringEditDialogOpen(true);
    } else {
      handleSave(false);
    }
  };

  const handleDelete = async (deleteAll = false) => {
    try {
      await axios.delete(`${API}/shows/${showId}?delete_all=${deleteAll}`);
      toast.success(deleteAll ? 'All occurrences deleted' : 'Show deleted');
      navigate('/shows');
    } catch (error) {
      toast.error('Failed to delete show');
    }
  };

  const handleDeleteClick = () => {
    if (show?.is_recurring) {
      setRecurringDeleteDialogOpen(true);
    } else {
      setDeleteDialogOpen(true);
    }
  };

  const handlePrintView = () => {
    // Use production URL for print/export
    window.open(`https://clara.koodh.com/api/shows/${showId}/rundown/print?token=${token}`, '_blank');
  };

  // Image upload handlers
  const handleImageUpload = async (file) => {
    if (!file) return;
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Use JPEG, PNG, GIF, or WebP.');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }
    
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(
        `${API}/shows/${showId}/image`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setShow(prev => ({ ...prev, image: response.data.image }));
      toast.success('Show image uploaded');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    try {
      await axios.delete(`${API}/shows/${showId}/image`);
      setShow(prev => ({ ...prev, image: null }));
      toast.success('Show image removed');
    } catch (error) {
      toast.error('Failed to remove image');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-8" />
        <div className="h-64 bg-zinc-800 rounded-xl" />
      </div>
    );
  }

  if (!show) return null;

  return (
    <div data-testid="show-detail-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          data-testid="back-btn"
          onClick={() => navigate('/shows')}
          className="text-zinc-400 hover:text-white hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        
        {/* Show Image */}
        {show.image && (
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
            <img
              src={show.image.s3_url || `${API}/uploads/show_title_images/${show.image.file_key}`}
              alt={show.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{show.title}</h1>
            {show.is_recurring && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/20 text-violet-400 rounded-full text-xs font-medium">
                <Repeat className="w-3 h-3" />
                Recurring
              </span>
            )}
            {/* Connection status */}
            <div className="flex items-center gap-1 text-xs">
              {isConnected ? (
                <span className="flex items-center gap-1 text-green-500">
                  <Wifi className="w-3 h-3" />
                  Live
                </span>
              ) : (
                <span className="flex items-center gap-1 text-zinc-500">
                  <WifiOff className="w-3 h-3" />
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span className="font-mono">{format(parseISO(show.date), 'MMMM d, yyyy')}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span className="font-mono">{show.start_time} - {show.end_time}</span>
            </span>
            {/* Presence avatars */}
            {presence.length > 0 && (
              <PresenceAvatars users={presence} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Export/Print Button */}
          <Button
            data-testid="print-rundown-btn"
            onClick={handlePrintView}
            variant="outline"
            size="sm"
            className="gap-2 border-zinc-700 text-zinc-300 hover:bg-white/5"
          >
            <Printer className="w-4 h-4" />
            Export / Print
          </Button>
          <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${statusColors[show.status]}`}>
            {statusLabels[show.status]}
          </span>
        </div>
      </div>

      {/* Show Details Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Show Details</h2>
          {!isEditing ? (
            isEditor && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="edit-show-btn"
                  onClick={() => setIsEditing(true)}
                  className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="delete-show-btn"
                  onClick={handleDeleteClick}
                  className="gap-2 bg-transparent border-zinc-700 text-orange-500 hover:bg-orange-500/10 hover:text-rose-400 hover:border-orange-500/50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            )
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditData(show);
                }}
                className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button
                size="sm"
                data-testid="save-show-btn"
                onClick={handleSaveClick}
                disabled={saving}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Title</Label>
                <Input
                  data-testid="edit-title-input"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="bg-[#27272a] border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Description</Label>
                <Textarea
                  data-testid="edit-description-input"
                  value={editData.description || ''}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  className="bg-[#27272a] border-zinc-700 text-white resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Date</Label>
                <Input
                  type="date"
                  data-testid="edit-date-input"
                  value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                  className="bg-[#27272a] border-zinc-700 text-white font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Start Time</Label>
                  <Input
                    type="time"
                    data-testid="edit-start-time-input"
                    value={editData.start_time}
                    onChange={(e) => setEditData({ ...editData, start_time: e.target.value })}
                    className="bg-[#27272a] border-zinc-700 text-white font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">End Time</Label>
                  <Input
                    type="time"
                    data-testid="edit-end-time-input"
                    value={editData.end_time}
                    onChange={(e) => setEditData({ ...editData, end_time: e.target.value })}
                    className="bg-[#27272a] border-zinc-700 text-white font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Status</Label>
                <Select
                  value={editData.status}
                  onValueChange={(value) => setEditData({ ...editData, status: value })}
                >
                  <SelectTrigger
                    data-testid="edit-status-select"
                    className="bg-[#27272a] border-zinc-700 text-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-zinc-800">
                    <SelectItem value="draft" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Draft</SelectItem>
                    <SelectItem value="scheduled" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Scheduled</SelectItem>
                    <SelectItem value="completed" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {show.description ? (
              <p className="text-zinc-400">{show.description}</p>
            ) : (
              <p className="text-zinc-600 italic">No description</p>
            )}
          </div>
        )}
      </div>

      {/* Show Settings Section - Recurrence Only */}
      {!show.is_recurring && !show.parent_show_id && isEditor && (
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">Show Settings</h2>
            </div>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Recurrence</h3>
            <p className="text-zinc-500 text-sm mb-3">Make this a recurring show to automatically schedule future episodes.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEnableRecurrenceData({ interval: 1, endDate: null });
                setEnableRecurrenceDialogOpen(true);
              }}
              className="gap-2 bg-transparent border-zinc-700 text-violet-400 hover:bg-violet-500/10 hover:border-violet-500/50"
            >
              <Repeat className="w-4 h-4" />
              Make Recurring
            </Button>
          </div>
        </div>
      )}

      {/* Recurrence Settings Section - Only for recurring shows */}
      {show.is_recurring && (
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Repeat className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold text-white">Recurrence Settings</h2>
            </div>
            {!isEditingRecurrence ? (
              isEditor && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRecurrenceData({
                        interval: show.recurrence_interval || 1,
                        endDate: show.recurrence_end_date ? parseISO(show.recurrence_end_date) : null,
                      });
                      setIsEditingRecurrence(true);
                    }}
                    className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    <Settings className="w-4 h-4" />
                    Configure
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStopRecurrenceDialogOpen(true)}
                    className="gap-2 bg-transparent border-zinc-700 text-orange-500 hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/50"
                  >
                    <CalendarOff className="w-4 h-4" />
                    Stop Recurring
                  </Button>
                </div>
              )
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingRecurrence(false)}
                  className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    setSavingRecurrence(true);
                    try {
                      const params = new URLSearchParams();
                      if (recurrenceData.interval) {
                        params.append('recurrence_interval', recurrenceData.interval);
                      }
                      if (recurrenceData.endDate) {
                        params.append('recurrence_end_date', format(recurrenceData.endDate, 'yyyy-MM-dd'));
                      } else {
                        params.append('recurrence_end_date', 'none');
                      }
                      const response = await axios.put(`${API}/shows/${showId}/recurrence?${params.toString()}`);
                      setShow(response.data);
                      setIsEditingRecurrence(false);
                      toast.success('Recurrence settings updated for all occurrences');
                    } catch (error) {
                      toast.error('Failed to update recurrence settings');
                    } finally {
                      setSavingRecurrence(false);
                    }
                  }}
                  disabled={savingRecurrence}
                  className="gap-2 bg-violet-500 hover:bg-violet-600 text-white"
                >
                  <Save className="w-4 h-4" />
                  {savingRecurrence ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </div>

          {isEditingRecurrence ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Repeat Frequency</Label>
                <Select
                  value={String(recurrenceData.interval)}
                  onValueChange={(value) => setRecurrenceData({ ...recurrenceData, interval: parseInt(value) })}
                >
                  <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-zinc-800">
                    <SelectItem value="1" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every week</SelectItem>
                    <SelectItem value="2" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every 2 weeks</SelectItem>
                    <SelectItem value="3" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every 3 weeks</SelectItem>
                    <SelectItem value="4" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every 4 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal bg-[#27272a] border-zinc-700 hover:bg-zinc-700',
                        !recurrenceData.endDate && 'text-zinc-500'
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {recurrenceData.endDate ? format(recurrenceData.endDate, 'PPP') : 'No end date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#18181b] border-zinc-800" align="start">
                    <div className="p-2 border-b border-zinc-800">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRecurrenceData({ ...recurrenceData, endDate: null })}
                        className="w-full text-zinc-400 hover:text-white"
                      >
                        Clear end date
                      </Button>
                    </div>
                    <CalendarPicker
                      mode="single"
                      selected={recurrenceData.endDate}
                      onSelect={(date) => setRecurrenceData({ ...recurrenceData, endDate: date })}
                      initialFocus
                      className="bg-[#18181b]"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-zinc-500 mb-1">Frequency</p>
                <p className="text-white font-medium">
                  {recurrenceIntervalLabels[show.recurrence_interval] || 'Every week'}
                </p>
              </div>
              <div>
                <p className="text-zinc-500 mb-1">End Date</p>
                <p className="text-white font-medium">
                  {show.recurrence_end_date 
                    ? format(parseISO(show.recurrence_end_date), 'PPP')
                    : 'No end date (repeats indefinitely)'}
                </p>
              </div>
            </div>
          )}
          
          <p className="text-xs text-zinc-500 mt-4">
            Changes to recurrence settings apply to all occurrences of this show.
          </p>
        </div>
      )}

      {/* Linked Folders Section */}
      {linkedFolders.length > 0 && (
        <div className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder className="w-5 h-5 text-orange-500" />
            Linked Media Folders
          </h3>
          <div className="space-y-2">
            {linkedFolders.map(folder => (
              <div key={folder.id} className="bg-white/5 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleFolder(folder.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedFolders.has(folder.id) ? (
                      <FolderOpen className="w-5 h-5 text-orange-400" />
                    ) : (
                      <Folder className="w-5 h-5 text-zinc-400" />
                    )}
                    <span className="text-white font-medium">{folder.name}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                      {folder.asset_count} file{folder.asset_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 text-zinc-500 transition-transform",
                    expandedFolders.has(folder.id) && "rotate-90"
                  )} />
                </button>
                
                {expandedFolders.has(folder.id) && (
                  <div className="px-4 pb-4">
                    {folderAssets[folder.id] ? (
                      folderAssets[folder.id].length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {folderAssets[folder.id].map(asset => {
                            const FileIcon = getFileIcon(asset.kind, asset.mime_type);
                            return (
                              <a
                                key={asset.id}
                                href={`${API}/uploads/media/${asset.file_storage_key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors group"
                              >
                                <FileIcon className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-zinc-300 truncate">{asset.title}</p>
                                  <p className="text-xs text-zinc-500">{asset.kind}</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500 text-center py-4">This folder is empty</p>
                      )
                    ) : (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rundown Section */}
      <RundownEditor showId={showId} canEdit={isEditor} showStartTime={show?.start_time} />

      {/* Delete Confirmation Dialog (Non-recurring) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Show</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete &ldquo;{show.title}&rdquo;? This action cannot be undone and will also delete all rundown items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-btn"
              onClick={() => handleDelete(false)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recurring Show - Edit Dialog */}
      <AlertDialog open={recurringEditDialogOpen} onOpenChange={setRecurringEditDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Repeat className="w-5 h-5 text-violet-400" />
              Update Recurring Show
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This is a recurring show. Would you like to update only this occurrence or all occurrences?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {saving ? 'Saving...' : 'Only This One'}
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="bg-violet-500 hover:bg-violet-600 text-white"
            >
              {saving ? 'Saving...' : 'All Occurrences'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recurring Show - Delete Dialog */}
      <AlertDialog open={recurringDeleteDialogOpen} onOpenChange={setRecurringDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Repeat className="w-5 h-5 text-violet-400" />
              Delete Recurring Show
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This is a recurring show. Would you like to delete only this occurrence or all occurrences?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleDelete(false)}
              className="border-orange-500/50 text-rose-400 hover:bg-orange-500/10"
            >
              Only This One
            </Button>
            <Button
              onClick={() => handleDelete(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              All Occurrences
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stop Recurrence Dialog */}
      <AlertDialog open={stopRecurrenceDialogOpen} onOpenChange={setStopRecurrenceDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <CalendarOff className="w-5 h-5 text-orange-400" />
              Stop Recurring Show
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will stop the show from repeating. What would you like to do with future scheduled occurrences?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const response = await axios.post(`${API}/shows/${showId}/stop-recurrence?delete_future=false`);
                  if (response.data.deleted) {
                    toast.success('Recurrence stopped.');
                    navigate('/calendar');
                  } else {
                    setShow(response.data);
                    setStopRecurrenceDialogOpen(false);
                    toast.success('Recurrence stopped. Future shows kept as one-time shows.');
                  }
                } catch (error) {
                  toast.error('Failed to stop recurrence');
                }
              }}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Keep Future Shows
            </Button>
            <Button
              onClick={async () => {
                try {
                  const response = await axios.post(`${API}/shows/${showId}/stop-recurrence?delete_future=true`);
                  if (response.data.deleted) {
                    toast.success('Recurrence stopped and this show was deleted (it was a future occurrence).');
                    navigate('/calendar');
                  } else {
                    setShow(response.data);
                    setStopRecurrenceDialogOpen(false);
                    toast.success('Recurrence stopped and future shows deleted.');
                  }
                } catch (error) {
                  toast.error('Failed to stop recurrence');
                }
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Delete Future Shows
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enable Recurrence Dialog */}
      <AlertDialog open={enableRecurrenceDialogOpen} onOpenChange={setEnableRecurrenceDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Repeat className="w-5 h-5 text-violet-400" />
              Enable Recurrence
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Make this show repeat on a regular schedule. Future occurrences will be generated automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Repeat Frequency</Label>
              <Select
                value={String(enableRecurrenceData.interval)}
                onValueChange={(value) => setEnableRecurrenceData({ ...enableRecurrenceData, interval: parseInt(value) })}
              >
                <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="1" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every week</SelectItem>
                  <SelectItem value="2" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every 2 weeks</SelectItem>
                  <SelectItem value="3" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every 3 weeks</SelectItem>
                  <SelectItem value="4" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Every 4 weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-zinc-400">End Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-[#27272a] border-zinc-700 hover:bg-zinc-800',
                      !enableRecurrenceData.endDate && 'text-zinc-500'
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {enableRecurrenceData.endDate ? format(enableRecurrenceData.endDate, 'PPP') : 'No end date (1 year default)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#18181b] border-zinc-800" align="start">
                  {enableRecurrenceData.endDate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEnableRecurrenceData({ ...enableRecurrenceData, endDate: null })}
                      className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      Clear end date
                    </Button>
                  )}
                  <CalendarPicker
                    mode="single"
                    selected={enableRecurrenceData.endDate}
                    onSelect={(date) => setEnableRecurrenceData({ ...enableRecurrenceData, endDate: date })}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="bg-[#18181b]"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={async () => {
                setSavingRecurrence(true);
                try {
                  const params = new URLSearchParams();
                  params.append('recurrence_interval', enableRecurrenceData.interval);
                  if (enableRecurrenceData.endDate) {
                    params.append('recurrence_end_date', format(enableRecurrenceData.endDate, 'yyyy-MM-dd'));
                  }
                  const response = await axios.post(`${API}/shows/${showId}/enable-recurrence?${params.toString()}`);
                  setShow(response.data);
                  setEnableRecurrenceDialogOpen(false);
                  toast.success('Show is now recurring! Future occurrences have been created.');
                } catch (error) {
                  toast.error(error.response?.data?.detail || 'Failed to enable recurrence');
                } finally {
                  setSavingRecurrence(false);
                }
              }}
              disabled={savingRecurrence}
              className="bg-violet-500 hover:bg-violet-600 text-white"
              data-testid="confirm-enable-recurrence-btn"
            >
              {savingRecurrence ? 'Enabling...' : 'Enable Recurrence'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ShowDetailPage;
