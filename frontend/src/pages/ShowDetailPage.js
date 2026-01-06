import { useState, useEffect } from 'react';
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
  Plus,
  Music,
  Mic,
  FileText,
  Radio,
  GripVertical,
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
import { toast } from 'sonner';
import RundownEditor from '../components/RundownEditor';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

const ShowDetailPage = () => {
  const { showId } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchShow();
  }, [showId]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.put(`${API}/shows/${showId}`, {
        title: editData.title,
        description: editData.description,
        date: editData.date,
        start_time: editData.start_time,
        end_time: editData.end_time,
        status: editData.status,
      });
      setShow(response.data);
      setIsEditing(false);
      toast.success('Show updated successfully');
    } catch (error) {
      toast.error('Failed to update show');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/shows/${showId}`);
      toast.success('Show deleted');
      navigate('/shows');
    } catch (error) {
      toast.error('Failed to delete show');
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
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{show.title}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span className="font-mono">{format(parseISO(show.date), 'MMMM d, yyyy')}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span className="font-mono">{show.start_time} - {show.end_time}</span>
            </span>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${statusColors[show.status]}`}>
          {statusLabels[show.status]}
        </span>
      </div>

      {/* Show Details Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Show Details</h2>
          {!isEditing ? (
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
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-2 bg-transparent border-zinc-700 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
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
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
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

      {/* Rundown Section */}
      <RundownEditor showId={showId} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Show</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{show.title}"? This action cannot be undone and will also delete all rundown items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-btn"
              onClick={handleDelete}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ShowDetailPage;
