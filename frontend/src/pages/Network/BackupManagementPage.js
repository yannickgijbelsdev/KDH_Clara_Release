import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, Upload, RefreshCw, Trash2, Copy, Clock,
  CheckCircle, XCircle, Loader2, HardDrive, Shield, AlertTriangle,
  Database, FolderArchive, RotateCcw, Server,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
  in_progress: { icon: Loader2, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'In Progress', spin: true },
};

const TYPE_LABELS = {
  manual: 'Manual',
  automatic: 'Automatic',
  'pre-restore': 'Pre-Restore Safety',
};

export default function BackupManagementPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [mainSites, setMainSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [backups, setBackups] = useState([]);
  const [clones, setClones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [cloning, setCloning] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(null);
  const [deletingClone, setDeletingClone] = useState(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchMainSites = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/main-sites`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const real = (data.main_sites || data || []).filter(s => !s.cloned_from);
        setMainSites(real);
        if (real.length && !selectedSite) setSelectedSite(real[0]);
      }
    } catch { /* ignore */ }
  }, [token]);

  const fetchBackups = useCallback(async () => {
    if (!selectedSite) return;
    setLoading(true);
    try {
      const [bRes, cRes] = await Promise.all([
        fetch(`${API}/api/backups/${selectedSite.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/backups/${selectedSite.id}/clones`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (bRes.ok) setBackups((await bRes.json()).backups || []);
      if (cRes.ok) setClones((await cRes.json()).clones || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedSite, token]);

  useEffect(() => { fetchMainSites(); }, [fetchMainSites]);
  useEffect(() => { if (selectedSite) fetchBackups(); }, [selectedSite, fetchBackups]);

  const createBackup = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}`, {
        method: 'POST', headers,
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Backup created: ${data.document_count} documents`);
      } else {
        toast.error(`Backup failed: ${data.error_message || 'Unknown error'}`);
      }
      fetchBackups();
    } catch (err) {
      toast.error('Backup creation failed');
    }
    setCreating(false);
  };

  const restoreBackup = async (backupId) => {
    setRestoring(backupId);
    setShowRestoreConfirm(null);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}/restore`, {
        method: 'POST', headers,
        body: JSON.stringify({ backup_id: backupId }),
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success('Restore completed! Safety backup was created automatically.');
      } else {
        toast.error(`Restore failed: ${data.detail || 'Unknown error'}`);
      }
      fetchBackups();
    } catch (err) {
      toast.error('Restore failed');
    }
    setRestoring(null);
  };

  const deleteBackup = async (backupId) => {
    try {
      await fetch(`${API}/api/backups/single/${backupId}`, {
        method: 'DELETE', headers,
      });
      toast.success('Backup deleted');
      fetchBackups();
    } catch { toast.error('Delete failed'); }
  };

  const cloneSite = async () => {
    if (!cloneName.trim()) return;
    setCloning(true);
    setShowCloneDialog(false);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}/clone`, {
        method: 'POST', headers,
        body: JSON.stringify({ clone_name: cloneName.trim() }),
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Clone "${cloneName}" created with ${data.document_count} documents`);
        setCloneName('');
        fetchBackups();
        fetchMainSites();
      } else {
        toast.error(`Clone failed: ${data.detail || 'Unknown error'}`);
      }
    } catch { toast.error('Clone failed'); }
    setCloning(false);
  };

  const removeClone = async (cloneId) => {
    setDeletingClone(cloneId);
    try {
      const res = await fetch(`${API}/api/backups/clone/${cloneId}`, {
        method: 'DELETE', headers,
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Clone deleted (${data.documents_deleted} documents removed)`);
        fetchBackups();
        fetchMainSites();
      } else {
        toast.error(`Delete failed: ${data.detail || 'Unknown error'}`);
      }
    } catch { toast.error('Delete failed'); }
    setDeletingClone(null);
  };

  if (!user?.is_network_admin) {
    return (
      <div className="min-h-screen bg-[#F0F0F2] flex items-center justify-center text-zinc-400">
        Network admin access required
      </div>
    );
  }

  const completedBackups = backups.filter(b => b.status === 'completed');
  const lastBackup = completedBackups[0];
  const failedCount = backups.filter(b => b.status === 'failed').length;
  const totalSize = completedBackups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);

  return (
    <div className="min-h-screen bg-[#F0F0F2] text-zinc-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#F0F0F2]/80 backdrop-blur-xl border-b border-zinc-200">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="backup-back-btn">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold" data-testid="backup-title">Backups & Clones</h1>
              <p className="text-xs text-zinc-500">Manage site backups, restore versions, and clone sites</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => { setCloneName(`[TEST] ${selectedSite?.name || ''}`); setShowCloneDialog(true); }}
              variant="outline"
              className="gap-2"
              disabled={!selectedSite}
              data-testid="clone-site-btn"
            >
              <Copy className="w-4 h-4" />
              Clone Site
            </Button>
            <Button
              onClick={createBackup}
              disabled={creating || !selectedSite}
              className="gap-2 bg-orange-600 hover:bg-orange-700"
              data-testid="create-backup-btn"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
              Create Backup
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-12 px-6 max-w-7xl mx-auto">
        {/* Site Selector */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2" data-testid="site-selector">
          {mainSites.map(site => (
            <button
              key={site.id}
              onClick={() => setSelectedSite(site)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                selectedSite?.id === site.id
                  ? 'bg-orange-600 text-zinc-900'
                  : 'bg-zinc-50 text-zinc-500 hover:bg-white/50 backdrop-blur-lg border border-white/60'
              }`}
              data-testid={`site-tab-${site.slug || site.id}`}
            >
              {site.name}
              {site.site_type === 'server' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">Virtual Datacenter</span>}
              {site.site_type === 'technical' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">Data Connection</span>}
              {site.site_type === 'task_scheduler' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30 font-medium">Tasks</span>}
              {site.site_type === 'external_host' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-medium">External Host</span>}
            </button>
          ))}
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="backup-status-cards">
          <StatusCard icon={Database} label="Total Backups" value={backups.length} color="text-blue-400" />
          <StatusCard
            icon={CheckCircle}
            label="Last Backup"
            value={lastBackup ? timeAgo(lastBackup.created_at) : 'Never'}
            color="text-green-400"
          />
          <StatusCard
            icon={failedCount > 0 ? AlertTriangle : Shield}
            label="Failed"
            value={failedCount}
            color={failedCount > 0 ? 'text-red-400' : 'text-green-400'}
          />
          <StatusCard icon={HardDrive} label="Storage Used" value={formatBytes(totalSize)} color="text-amber-400" />
        </div>

        {/* Clones Section */}
        {clones.length > 0 && (
          <div className="mb-8" data-testid="clones-section">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
              <Copy className="w-4 h-4" />
              Active Clones
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clones.map(clone => (
                <div key={clone.id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{clone.name}</p>
                    <p className="text-xs text-zinc-500">{formatDate(clone.created_at)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => removeClone(clone.id)}
                    disabled={deletingClone === clone.id}
                    data-testid={`delete-clone-${clone.id}`}
                  >
                    {deletingClone === clone.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Backup List */}
        <div data-testid="backup-list">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
            <FolderArchive className="w-4 h-4" />
            Backup History
            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full">{backups.length}</span>
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : backups.length === 0 ? (
            <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-12 text-center">
              <Database className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">No backups yet</p>
              <p className="text-zinc-600 text-xs mt-1">Create your first backup or wait for the daily automatic backup</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map(backup => {
                const cfg = STATUS_CONFIG[backup.status] || STATUS_CONFIG.completed;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={backup.id}
                    className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-4 hover:border-zinc-300 transition-colors"
                    data-testid={`backup-row-${backup.id}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Status */}
                      <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                        <StatusIcon className={`w-5 h-5 ${cfg.color} ${cfg.spin ? 'animate-spin' : ''}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            backup.type === 'automatic' ? 'bg-blue-500/10 text-blue-400' :
                            backup.type === 'pre-restore' ? 'bg-purple-500/10 text-purple-400' :
                            'bg-zinc-200 text-zinc-600'
                          }`}>
                            {TYPE_LABELS[backup.type] || backup.type}
                          </span>
                          <span className="text-xs text-zinc-500">{formatDate(backup.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                          <span>{backup.document_count || 0} documents</span>
                          <span>{formatBytes(backup.size_bytes)}</span>
                          {backup.error_message && (
                            <span className="text-red-400 truncate max-w-xs">{backup.error_message}</span>
                          )}
                          {backup.collections_backed_up?.length > 0 && (
                            <span className="text-zinc-600 truncate max-w-md">
                              {backup.collections_backed_up.slice(0, 4).join(', ')}
                              {backup.collections_backed_up.length > 4 && ` +${backup.collections_backed_up.length - 4}`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {backup.status === 'completed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs text-zinc-400 hover:text-green-400"
                            onClick={() => setShowRestoreConfirm(backup.id)}
                            disabled={restoring === backup.id}
                            data-testid={`restore-btn-${backup.id}`}
                          >
                            {restoring === backup.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            Restore
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-zinc-600 hover:text-red-400"
                          onClick={() => deleteBackup(backup.id)}
                          data-testid={`delete-backup-${backup.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Restore Confirmation Dialog */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" data-testid="restore-confirm-dialog">
          <div className="bg-white/80 backdrop-blur border border-zinc-200 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold">Restore Backup?</h3>
                <p className="text-xs text-zinc-500">This will overwrite current data</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-1">
              A safety backup of the current state will be created automatically before restoring.
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              You can always revert using the safety backup if something goes wrong.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRestoreConfirm(null)} data-testid="restore-cancel-btn">
                Cancel
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 gap-2"
                onClick={() => restoreBackup(showRestoreConfirm)}
                data-testid="restore-confirm-btn"
              >
                <RotateCcw className="w-4 h-4" />
                Restore
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Dialog */}
      {showCloneDialog && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" data-testid="clone-dialog">
          <div className="bg-white/80 backdrop-blur border border-zinc-200 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Copy className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold">Clone Site</h3>
                <p className="text-xs text-zinc-500">Create a test copy of {selectedSite?.name}</p>
              </div>
            </div>
            <label className="block text-xs text-zinc-500 mb-1.5">Clone Name</label>
            <input
              type="text"
              value={cloneName}
              onChange={e => setCloneName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 mb-4 focus:outline-none focus:border-orange-500"
              placeholder="e.g. [TEST] Radiogroep MFY/GRK"
              data-testid="clone-name-input"
            />
            <p className="text-xs text-zinc-500 mb-4">
              The clone will include all content, shows, WordPress config, and settings.
              Child sites will be prefixed with [CLONE].
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCloneDialog(false)} data-testid="clone-cancel-btn">
                Cancel
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 gap-2"
                onClick={cloneSite}
                disabled={!cloneName.trim() || cloning}
                data-testid="clone-confirm-btn"
              >
                {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Create Clone
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-4" data-testid={`status-${label.toLowerCase().replace(/\s/g,'-')}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
