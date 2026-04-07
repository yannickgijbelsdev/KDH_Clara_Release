import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, Upload, RefreshCw, Trash2, Copy, Clock,
  CheckCircle, XCircle, Loader2, HardDrive, Shield, AlertTriangle,
  Database, FolderArchive, RotateCcw, Server, Search,
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
  if (mins < 60) return `${mins}m geleden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}u geleden`;
  return `${Math.floor(hrs / 24)}d geleden`;
}

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Failed' },
  in_progress: { icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-50', label: 'In Progress', spin: true },
};

const TYPE_LABELS = {
  manual: 'Handmatig',
  automatic: 'Automatisch',
  'pre-restore': 'Veiligheidsback-up',
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
  const [searchQuery, setSearchQuery] = useState('');

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
      const res = await fetch(`${API}/api/backups/${selectedSite.id}`, { method: 'POST', headers });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Backup aangemaakt: ${data.document_count} documenten`);
      } else {
        toast.error(`Backup mislukt: ${data.error_message || 'Onbekende fout'}`);
      }
      fetchBackups();
    } catch { toast.error('Backup maken mislukt'); }
    setCreating(false);
  };

  const restoreBackup = async (backupId) => {
    setRestoring(backupId);
    setShowRestoreConfirm(null);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}/restore`, {
        method: 'POST', headers, body: JSON.stringify({ backup_id: backupId }),
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success('Herstel voltooid! Veiligheidsback-up is automatisch aangemaakt.');
      } else {
        toast.error(`Herstel mislukt: ${data.detail || 'Onbekende fout'}`);
      }
      fetchBackups();
    } catch { toast.error('Herstel mislukt'); }
    setRestoring(null);
  };

  const deleteBackup = async (backupId) => {
    try {
      await fetch(`${API}/api/backups/single/${backupId}`, { method: 'DELETE', headers });
      toast.success('Backup verwijderd');
      fetchBackups();
    } catch { toast.error('Verwijderen mislukt'); }
  };

  const cloneSite = async () => {
    if (!cloneName.trim()) return;
    setCloning(true);
    setShowCloneDialog(false);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}/clone`, {
        method: 'POST', headers, body: JSON.stringify({ clone_name: cloneName.trim() }),
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Clone "${cloneName}" aangemaakt met ${data.document_count} documenten`);
        setCloneName('');
        fetchBackups();
        fetchMainSites();
      } else {
        toast.error(`Clone mislukt: ${data.detail || 'Onbekende fout'}`);
      }
    } catch { toast.error('Clone mislukt'); }
    setCloning(false);
  };

  const removeClone = async (cloneId) => {
    setDeletingClone(cloneId);
    try {
      const res = await fetch(`${API}/api/backups/clone/${cloneId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Clone verwijderd (${data.documents_deleted} documenten gewist)`);
        fetchBackups();
        fetchMainSites();
      } else {
        toast.error(`Verwijderen mislukt: ${data.detail || 'Onbekende fout'}`);
      }
    } catch { toast.error('Verwijderen mislukt'); }
    setDeletingClone(null);
  };

  if (!user?.is_network_admin) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center text-zinc-400">
        Network admin toegang vereist
      </div>
    );
  }

  const completedBackups = backups.filter(b => b.status === 'completed');
  const lastBackup = completedBackups[0];
  const failedCount = backups.filter(b => b.status === 'failed').length;
  const totalSize = completedBackups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);

  const filteredBackups = searchQuery
    ? backups.filter(b =>
        (TYPE_LABELS[b.type] || b.type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        formatDate(b.created_at).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.collections_backed_up || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : backups;

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/60 backdrop-blur-2xl border-b border-black/[0.06] shadow-[0_1px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/network')} className="rounded-xl text-zinc-400 hover:text-zinc-900" data-testid="backup-back-btn">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-zinc-900" data-testid="backup-title">Backups & Clones</h1>
              <p className="text-xs text-zinc-400">Beheer site back-ups, herstel versies en kloon sites</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => { setCloneName(`[TEST] ${selectedSite?.name || ''}`); setShowCloneDialog(true); }}
              variant="outline"
              className="gap-2 rounded-xl border-black/10 text-zinc-600 hover:bg-black/5"
              disabled={!selectedSite}
              data-testid="clone-site-btn"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">Clone Site</span>
            </Button>
            <Button
              onClick={createBackup}
              disabled={creating || !selectedSite}
              className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl"
              data-testid="create-backup-btn"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
              <span className="hidden sm:inline">Nieuwe Backup</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Site Selector Pills */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide" data-testid="site-selector">
          {mainSites.map(site => (
            <button
              key={site.id}
              onClick={() => setSelectedSite(site)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 flex items-center gap-2 ${
                selectedSite?.id === site.id
                  ? 'bg-zinc-900 text-white shadow-md'
                  : 'bg-white text-zinc-500 hover:text-zinc-700 hover:bg-white/80 border border-black/[0.06]'
              }`}
              data-testid={`site-tab-${site.slug || site.id}`}
            >
              {site.name}
              {site.site_type === 'server' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">Datacenter</span>}
              {site.site_type === 'technical' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-medium">Data</span>}
              {site.site_type === 'task_scheduler' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium">Tasks</span>}
              {site.site_type === 'external_host' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-600 font-medium">Extern</span>}
            </button>
          ))}
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="backup-status-cards">
          <StatusCard icon={Database} label="Totaal Back-ups" value={backups.length} color="text-blue-500" bg="bg-blue-50" />
          <StatusCard icon={CheckCircle} label="Laatste Backup" value={lastBackup ? timeAgo(lastBackup.created_at) : 'Nooit'} color="text-emerald-500" bg="bg-emerald-50" />
          <StatusCard icon={failedCount > 0 ? AlertTriangle : Shield} label="Mislukt" value={failedCount} color={failedCount > 0 ? 'text-red-500' : 'text-emerald-500'} bg={failedCount > 0 ? 'bg-red-50' : 'bg-emerald-50'} />
          <StatusCard icon={HardDrive} label="Opslag Gebruikt" value={formatBytes(totalSize)} color="text-amber-500" bg="bg-amber-50" />
        </div>

        {/* Clones Section */}
        {clones.length > 0 && (
          <div className="mb-8" data-testid="clones-section">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
              <Copy className="w-4 h-4" />
              Actieve Clones
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clones.map(clone => (
                <div key={clone.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div>
                    <p className="font-medium text-sm text-zinc-900">{clone.name}</p>
                    <p className="text-xs text-zinc-400">{formatDate(clone.created_at)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
              <FolderArchive className="w-4 h-4" />
              Backup Geschiedenis
              <span className="text-[11px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">{backups.length}</span>
            </h2>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Zoek backups..."
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-black/[0.06] rounded-xl text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                data-testid="backup-search"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : filteredBackups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Database className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm font-medium">Geen backups gevonden</p>
              <p className="text-zinc-400 text-xs mt-1">Maak je eerste backup of wacht op de dagelijkse automatische backup</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBackups.map(backup => {
                const cfg = STATUS_CONFIG[backup.status] || STATUS_CONFIG.completed;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={backup.id}
                    className="bg-white rounded-2xl border border-black/[0.06] p-4 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200"
                    data-testid={`backup-row-${backup.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                        <StatusIcon className={`w-5 h-5 ${cfg.color} ${cfg.spin ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            backup.type === 'automatic' ? 'bg-blue-50 text-blue-600' :
                            backup.type === 'pre-restore' ? 'bg-purple-50 text-purple-600' :
                            'bg-zinc-100 text-zinc-600'
                          }`}>
                            {TYPE_LABELS[backup.type] || backup.type}
                          </span>
                          <span className="text-xs text-zinc-400">{formatDate(backup.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-400">
                          <span>{backup.document_count || 0} documenten</span>
                          <span>{formatBytes(backup.size_bytes)}</span>
                          {backup.error_message && (
                            <span className="text-red-400 truncate max-w-xs">{backup.error_message}</span>
                          )}
                          {backup.collections_backed_up?.length > 0 && (
                            <span className="text-zinc-400 truncate max-w-md">
                              {backup.collections_backed_up.slice(0, 4).join(', ')}
                              {backup.collections_backed_up.length > 4 && ` +${backup.collections_backed_up.length - 4}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {backup.status === 'completed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl"
                            onClick={() => setShowRestoreConfirm(backup.id)}
                            disabled={restoring === backup.id}
                            data-testid={`restore-btn-${backup.id}`}
                          >
                            {restoring === backup.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            Herstel
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
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
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" data-testid="restore-confirm-dialog">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-black/[0.06]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900">Backup herstellen?</h3>
                <p className="text-xs text-zinc-400">Dit overschrijft de huidige gegevens</p>
              </div>
            </div>
            <p className="text-sm text-zinc-500 mb-1">
              Er wordt automatisch een veiligheidsback-up gemaakt van de huidige status.
            </p>
            <p className="text-xs text-zinc-400 mb-6">
              Je kunt altijd terugkeren met de veiligheidsback-up als er iets misgaat.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRestoreConfirm(null)} className="rounded-xl border-black/10" data-testid="restore-cancel-btn">
                Annuleren
              </Button>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white gap-2 rounded-xl"
                onClick={() => restoreBackup(showRestoreConfirm)}
                data-testid="restore-confirm-btn"
              >
                <RotateCcw className="w-4 h-4" />
                Herstellen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Dialog */}
      {showCloneDialog && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" data-testid="clone-dialog">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-black/[0.06]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Copy className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900">Site Klonen</h3>
                <p className="text-xs text-zinc-400">Maak een testkopie van {selectedSite?.name}</p>
              </div>
            </div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">Clone Naam</label>
            <input
              type="text"
              value={cloneName}
              onChange={e => setCloneName(e.target.value)}
              className="w-full bg-zinc-50 border border-black/[0.08] rounded-xl px-3 py-2.5 text-sm text-zinc-900 mb-4 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-300"
              placeholder="bijv. [TEST] Radiogroep MFY/GRK"
              data-testid="clone-name-input"
            />
            <p className="text-xs text-zinc-400 mb-4">
              De clone bevat alle content, shows, WordPress configuratie en instellingen.
              Subsites worden voorafgegaan door [CLONE].
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCloneDialog(false)} className="rounded-xl border-black/10" data-testid="clone-cancel-btn">
                Annuleren
              </Button>
              <Button
                className="bg-zinc-900 hover:bg-zinc-800 text-white gap-2 rounded-xl"
                onClick={cloneSite}
                disabled={!cloneName.trim() || cloning}
                data-testid="clone-confirm-btn"
              >
                {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Clone Aanmaken
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid={`status-${label.toLowerCase().replace(/\s/g,'-')}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl ${bg || 'bg-zinc-50'} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}
