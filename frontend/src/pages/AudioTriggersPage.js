import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import {
  Radio,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  Upload,
  Clock,
  Play,
  Pause,
  Settings,
  AlertCircle,
  Check,
  X,
  Loader2,
  Music,
  Bell,
  BellOff,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Time Window Editor Component
const TimeWindowEditor = ({ windows, onChange }) => {
  const addWindow = () => {
    onChange([...windows, { start_time: '07:00', end_time: '19:00', days: [0, 1, 2, 3, 4] }]);
  };

  const removeWindow = (index) => {
    onChange(windows.filter((_, i) => i !== index));
  };

  const updateWindow = (index, field, value) => {
    const updated = [...windows];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const toggleDay = (windowIndex, day) => {
    const updated = [...windows];
    const days = updated[windowIndex].days || [];
    if (days.includes(day)) {
      updated[windowIndex].days = days.filter(d => d !== day);
    } else {
      updated[windowIndex].days = [...days, day].sort();
    }
    onChange(updated);
  };

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-3">
      {windows.map((window, index) => (
        <div key={index} className="bg-zinc-100/70 rounded-lg p-3 border border-zinc-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-zinc-400">From</Label>
              <Input
                type="time"
                value={window.start_time}
                onChange={(e) => updateWindow(index, 'start_time', e.target.value)}
                className="w-24 h-8 bg-zinc-900 border-zinc-300 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-zinc-400">To</Label>
              <Input
                type="time"
                value={window.end_time}
                onChange={(e) => updateWindow(index, 'end_time', e.target.value)}
                className="w-24 h-8 bg-zinc-900 border-zinc-300 text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeWindow(index)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            {dayNames.map((name, dayIndex) => (
              <button
                key={dayIndex}
                onClick={() => toggleDay(index, dayIndex)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  (window.days || []).includes(dayIndex)
                    ? 'bg-orange-500 text-white'
                    : 'bg-zinc-200 text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={addWindow}
        className="w-full border-dashed border-zinc-600 text-zinc-400"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Time Window
      </Button>
    </div>
  );
};

// Audio File Upload Component
const AudioFileUpload = ({ label, filename, onUpload, onDelete, isUploading }) => {
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm text-zinc-600">{label}</Label>
      {filename ? (
        <div className="flex items-center gap-2 p-2 bg-white/40 backdrop-blur-sm rounded-lg border border-zinc-300">
          <Music className="w-4 h-4 text-green-400" />
          <span className="text-sm text-zinc-600 flex-1 truncate">{filename}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-400 hover:text-red-300 h-7 px-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-zinc-300 rounded-lg cursor-pointer hover:border-zinc-600 transition-colors">
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          ) : (
            <>
              <Upload className="w-5 h-5 text-zinc-400" />
              <span className="text-sm text-zinc-400">Upload MP3/WAV file</span>
            </>
          )}
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.aac"
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploading}
          />
        </label>
      )}
    </div>
  );
};

// Create/Edit Trigger Dialog
const TriggerDialog = ({ isOpen, onClose, trigger, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    station: 'mfy',
    time_windows: [],
    in_action_type: 'custom_text',
    in_action_text: 'Reclame',
    out_action_type: 'now_playing',
    out_action_text: '',
    timeout_minutes: 5,
    threshold: 0.85,
    enabled: true,
  });
  const [uploadingIn, setUploadingIn] = useState(false);
  const [uploadingOut, setUploadingOut] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (trigger) {
      setFormData({
        name: trigger.name || '',
        station: trigger.station || 'mfy',
        time_windows: trigger.time_windows || [],
        in_action_type: trigger.in_action_type || 'custom_text',
        in_action_text: trigger.in_action_text || 'Reclame',
        out_action_type: trigger.out_action_type || 'now_playing',
        out_action_text: trigger.out_action_text || '',
        timeout_minutes: trigger.timeout_minutes || 5,
        threshold: trigger.threshold || 0.85,
        enabled: trigger.enabled !== false,
      });
    } else {
      setFormData({
        name: '',
        station: 'mfy',
        time_windows: [{ start_time: '07:00', end_time: '19:00', days: [0, 1, 2, 3, 4] }],
        in_action_type: 'custom_text',
        in_action_text: 'Reclame',
        out_action_type: 'now_playing',
        out_action_text: '',
        timeout_minutes: 5,
        threshold: 0.85,
        enabled: true,
      });
    }
  }, [trigger, isOpen]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData, trigger?.id);
      onClose();
    } catch (error) {
      toast.error('Could not save trigger');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadInSound = async (file) => {
    if (!trigger?.id) {
      toast.error('Save the trigger first before uploading sounds');
      return;
    }

    setUploadingIn(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      await axios.post(`${API}/audio-triggers/${trigger.id}/in-sound`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('IN sound uploaded');
      onSave(formData, trigger.id); // Refresh
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploadingIn(false);
    }
  };

  const handleUploadOutSound = async (file) => {
    if (!trigger?.id) {
      toast.error('Save the trigger first before uploading sounds');
      return;
    }

    setUploadingOut(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      await axios.post(`${API}/audio-triggers/${trigger.id}/out-sound`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('OUT sound uploaded');
      onSave(formData, trigger.id); // Refresh
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploadingOut(false);
    }
  };

  const handleDeleteInSound = async () => {
    if (!trigger?.id) return;
    try {
      await axios.delete(`${API}/audio-triggers/${trigger.id}/in-sound`);
      toast.success('IN sound deleted');
      onSave(formData, trigger.id); // Refresh
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const handleDeleteOutSound = async () => {
    if (!trigger?.id) return;
    try {
      await axios.delete(`${API}/audio-triggers/${trigger.id}/out-sound`);
      toast.success('OUT sound deleted');
      onSave(formData, trigger.id); // Refresh
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white/80 backdrop-blur-2xl border-white/60 shadow-[0_8px_40px_rgba(0,0,0,0.1)] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-900 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-orange-400" />
            {trigger ? 'Edit Audio Trigger' : 'Create Audio Trigger'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-600">Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Commercial Break MFY"
                className="bg-zinc-900 border-zinc-300"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-600">Station</Label>
              <Select
                value={formData.station}
                onValueChange={(v) => setFormData({ ...formData, station: v })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-300">
                  <SelectItem value="mfy">Radio MFY</SelectItem>
                  <SelectItem value="grk">Radio GRK</SelectItem>
                  <SelectItem value="both">Both Stations</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Time Windows */}
          <div className="space-y-2">
            <Label className="text-zinc-600 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Listening Windows (when to monitor for the sound)
            </Label>
            <TimeWindowEditor
              windows={formData.time_windows}
              onChange={(w) => setFormData({ ...formData, time_windows: w })}
            />
            <p className="text-xs text-zinc-500">
              Leave empty to always listen. The system only analyzes the stream during these windows to save resources.
            </p>
          </div>

          {/* Audio Files */}
          {trigger?.id && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <AudioFileUpload
                  label="IN Sound (triggers activation)"
                  filename={trigger?.in_sound_filename}
                  onUpload={handleUploadInSound}
                  onDelete={handleDeleteInSound}
                  isUploading={uploadingIn}
                />
              </div>
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AudioFileUpload
                  label="OUT Sound (triggers deactivation) - Optional"
                  filename={trigger?.out_sound_filename}
                  onUpload={handleUploadOutSound}
                  onDelete={handleDeleteOutSound}
                  isUploading={uploadingOut}
                />
              </div>
            </div>
          )}

          {!trigger?.id && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Save the trigger first, then you can upload the audio files.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <Label className="text-green-400 font-medium">When IN sound detected:</Label>
              <Select
                value={formData.in_action_type}
                onValueChange={(v) => setFormData({ ...formData, in_action_type: v })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-300">
                  <SelectItem value="custom_text">Show Custom Text</SelectItem>
                  <SelectItem value="show_name">Show Program Name</SelectItem>
                </SelectContent>
              </Select>
              {formData.in_action_type === 'custom_text' && (
                <Input
                  value={formData.in_action_text}
                  onChange={(e) => setFormData({ ...formData, in_action_text: e.target.value })}
                  placeholder="e.g., Reclame"
                  className="bg-zinc-900 border-zinc-300"
                />
              )}
            </div>
            <div className="space-y-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <Label className="text-red-400 font-medium">When OUT sound / timeout:</Label>
              <Select
                value={formData.out_action_type}
                onValueChange={(v) => setFormData({ ...formData, out_action_type: v })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-300">
                  <SelectItem value="now_playing">Resume Now Playing</SelectItem>
                  <SelectItem value="show_name">Show Program Name</SelectItem>
                  <SelectItem value="custom_text">Show Custom Text</SelectItem>
                </SelectContent>
              </Select>
              {formData.out_action_type === 'custom_text' && (
                <Input
                  value={formData.out_action_text}
                  onChange={(e) => setFormData({ ...formData, out_action_text: e.target.value })}
                  placeholder="Custom text..."
                  className="bg-zinc-900 border-zinc-300"
                />
              )}
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-600">Timeout (minutes)</Label>
              <Input
                type="number"
                min="1"
                max="30"
                value={formData.timeout_minutes}
                onChange={(e) => setFormData({ ...formData, timeout_minutes: parseInt(e.target.value) || 5 })}
                className="bg-zinc-900 border-zinc-300"
              />
              <p className="text-xs text-zinc-500">Auto-deactivate if no OUT sound detected</p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-600">Match Threshold ({Math.round(formData.threshold * 100)}%)</Label>
              <input
                type="range"
                min="0.5"
                max="0.99"
                step="0.01"
                value={formData.threshold}
                onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-zinc-500">Higher = stricter matching (fewer false positives)</p>
            </div>
          </div>

          {/* Enable Switch */}
          <div className="flex items-center justify-between p-3 bg-white/40 backdrop-blur-sm rounded-lg">
            <div>
              <Label className="text-zinc-600">Enable Trigger</Label>
              <p className="text-xs text-zinc-500">When enabled, the system will listen for this sound</p>
            </div>
            <Switch
              checked={formData.enabled}
              onCheckedChange={(v) => setFormData({ ...formData, enabled: v })}
              className="data-[state=checked]:bg-green-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
            <Button variant="outline" onClick={onClose} className="border-zinc-300">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {trigger ? 'Save Changes' : 'Create Trigger'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Main Page Component
const AudioTriggersPage = () => {
  const [triggers, setTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, triggerId: null, triggerName: '' });

  const fetchTriggers = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/audio-triggers`);
      setTriggers(response.data);
    } catch (error) {
      console.error('Error fetching triggers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/audio-triggers/logs?limit=50`);
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  }, []);

  useEffect(() => {
    fetchTriggers();
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [fetchTriggers, fetchLogs]);

  const handleSave = async (formData, triggerId) => {
    try {
      if (triggerId) {
        await axios.put(`${API}/audio-triggers/${triggerId}`, formData);
        toast.success('Trigger updated');
      } else {
        const response = await axios.post(`${API}/audio-triggers`, formData);
        setEditingTrigger(response.data);
        toast.success('Trigger created - now upload the audio files');
        // Don't close dialog - let user upload files
        fetchTriggers();
        return;
      }
      fetchTriggers();
    } catch (error) {
      throw error;
    }
  };

  const handleDelete = async (triggerId) => {
    try {
      await axios.delete(`${API}/audio-triggers/${triggerId}`);
      toast.success('Trigger deleted');
      setDeleteDialog({ open: false, triggerId: null, triggerName: '' });
      fetchTriggers();
    } catch (error) {
      toast.error('Could not delete trigger');
    }
  };

  const handleDeleteClick = (triggerId, triggerName) => {
    setDeleteDialog({ open: true, triggerId, triggerName });
  };

  const handleTest = async (triggerId, action) => {
    try {
      await axios.post(`${API}/audio-triggers/${triggerId}/test?action=${action}`);
      toast.success(action === 'activate' ? 'Trigger activated (test)' : 'Trigger deactivated (test)');
      fetchLogs();
    } catch (error) {
      toast.error('Test failed');
    }
  };

  const handleToggle = async (trigger, enabled) => {
    try {
      await axios.put(`${API}/audio-triggers/${trigger.id}`, { enabled });
      toast.success(enabled ? 'Trigger enabled' : 'Trigger disabled');
      fetchTriggers();
    } catch (error) {
      toast.error('Could not update trigger');
    }
  };

  const stationColors = {
    mfy: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
    grk: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400' },
    both: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Volume2 className="w-7 h-7 text-orange-400" />
            Audio Triggers
          </h1>
          <p className="text-zinc-400 mt-1">
            Detect specific sounds in the stream and trigger RDS text changes automatically
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowLogs(!showLogs)}
            className="border-zinc-300"
          >
            <Calendar className="w-4 h-4 mr-2" />
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </Button>
          <Button
            onClick={() => {
              setEditingTrigger(null);
              setDialogOpen(true);
            }}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Audio Trigger
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
        <h3 className="text-blue-400 font-medium mb-2">How Audio Triggers Work</h3>
        <ul className="text-sm text-blue-300/80 space-y-1">
          <li>• Upload an "IN sound" (e.g., commercial jingle) that triggers the RDS text change</li>
          <li>• Optionally upload an "OUT sound" that ends the triggered state</li>
          <li>• Set time windows when the system should listen (e.g., only during drive time)</li>
          <li>• Priority: Shows {'>'} Audio Triggers {'>'} Scheduled Texts {'>'} Sequence Items</li>
        </ul>
      </div>

      {/* Triggers List */}
      <div className="space-y-4">
        {triggers.length === 0 ? (
          <div className="text-center py-12 bg-white/60 rounded-lg border border-zinc-200">
            <Volume2 className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
            <p className="text-zinc-400">No audio triggers configured</p>
            <p className="text-sm text-zinc-500 mt-1">Create one to start detecting sounds in your stream</p>
          </div>
        ) : (
          triggers.map((trigger) => {
            const colors = stationColors[trigger.station] || stationColors.mfy;
            const hasInSound = !!trigger.in_sound_filename;
            const hasOutSound = !!trigger.out_sound_filename;

            return (
              <div
                key={trigger.id}
                className={`p-4 rounded-lg border ${colors.border} ${colors.bg}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <Switch
                      checked={trigger.enabled}
                      onCheckedChange={(v) => handleToggle(trigger, v)}
                      className="data-[state=checked]:bg-green-500 mt-1"
                    />
                    <div>
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        {trigger.name}
                        <span className={`text-xs px-2 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
                          {trigger.station === 'both' ? 'Both' : trigger.station.toUpperCase()}
                        </span>
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className={`flex items-center gap-1 ${hasInSound ? 'text-green-400' : 'text-zinc-500'}`}>
                          {hasInSound ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          IN: {trigger.in_sound_filename || 'Not uploaded'}
                        </span>
                        <span className={`flex items-center gap-1 ${hasOutSound ? 'text-red-400' : 'text-zinc-500'}`}>
                          {hasOutSound ? <Check className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                          OUT: {trigger.out_sound_filename || 'Optional'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        <span>Action: "{trigger.in_action_text || trigger.in_action_type}"</span>
                        <span>Timeout: {trigger.timeout_minutes}min</span>
                        <span>Threshold: {Math.round(trigger.threshold * 100)}%</span>
                        {trigger.time_windows?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {trigger.time_windows.length} window(s)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(trigger.id, 'activate')}
                      className="border-green-600 text-green-400 hover:bg-green-500/20"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Test IN
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(trigger.id, 'deactivate')}
                      className="border-red-600 text-red-400 hover:bg-red-500/20"
                    >
                      <Pause className="w-3.5 h-3.5 mr-1" />
                      Test OUT
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingTrigger(trigger);
                        setDialogOpen(true);
                      }}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(trigger.id, trigger.name)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, triggerId: null, triggerName: '' })}>
        <AlertDialogContent className="bg-white/50 backdrop-blur-lg border-white/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Audio Trigger</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{deleteDialog.triggerName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-300 text-white hover:bg-zinc-200">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleDelete(deleteDialog.triggerId)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logs Section */}
      {showLogs && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Detection Logs</h2>
            <Button variant="ghost" size="sm" onClick={fetchLogs} className="text-zinc-400">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
          <div className="bg-white/60 rounded-lg border border-zinc-200 overflow-hidden">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                No detection logs yet
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-zinc-400">Time</th>
                      <th className="px-4 py-2 text-left text-zinc-400">Trigger</th>
                      <th className="px-4 py-2 text-left text-zinc-400">Station</th>
                      <th className="px-4 py-2 text-left text-zinc-400">Event</th>
                      <th className="px-4 py-2 text-left text-zinc-400">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-t border-zinc-200">
                        <td className="px-4 py-2 text-zinc-400">
                          {format(new Date(log.timestamp), 'HH:mm:ss')}
                        </td>
                        <td className="px-4 py-2 text-white">{log.trigger_name}</td>
                        <td className="px-4 py-2 text-zinc-400">{log.station}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            log.event === 'in_detected' ? 'bg-green-500/20 text-green-400' :
                            log.event === 'out_detected' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {log.event}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-400">{log.action_text || log.action_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <TriggerDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTrigger(null);
        }}
        trigger={editingTrigger}
        onSave={handleSave}
      />
    </div>
  );
};

export default AudioTriggersPage;
