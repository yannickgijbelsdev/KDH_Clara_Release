import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, RefreshCw, Trash2, Copy, Clock,
  CheckCircle, XCircle, Loader2, HardDrive, Shield, AlertTriangle,
  Database, FolderArchive, RotateCcw, Server, Search, X,
  Radio, Network, LayoutGrid, ExternalLink, Zap, Plus,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

/* ── Helpers ── */
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
  return d.toLocaleDateString('en-GB', {
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

/* ── Config ── */
const SITE_TYPE_CONFIG = {
  radio:          { icon: Radio,        color: '#f97316', label: 'Radio',       bg: '/images/env_radio.jpg' },
  server:         { icon: HardDrive,    color: '#3b82f6', label: 'Datacenter',  bg: '/images/env_server.jpg' },
  technical:      { icon: Network,      color: '#10b981', label: 'Data Conn.',  bg: '/images/env_technical.jpg' },
  task_scheduler: { icon: LayoutGrid,   color: '#8b5cf6', label: 'Tasks',       bg: '/images/env_task_scheduler.jpg' },
  external_host:  { icon: ExternalLink, color: '#06b6d4', label: 'Ext. Host',   bg: '/images/env_external_host.jpg' },
  wp_security:    { icon: Shield,       color: '#ef4444', label: 'WP Security', bg: '/images/env_wp_security.jpg' },
};

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Failed' },
  in_progress: { icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-50', label: 'In Progress', spin: true },
};

const TYPE_LABELS = {
  manual: 'Manual',
  automatic: 'Automatic',
  'pre-restore': 'Safety Backup',
};


/* ═══════════════════════════════════════════════════
   Isometric Backup Card (per site)
   ═══════════════════════════════════════════════════ */
const BackupSiteCard = ({ site, index, isSelected, onClick, backupCount, lastBackupTime }) => {
  const cfg = SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio;
  const Icon = cfg.icon;

  return (
    <motion.div
      data-testid={`backup-card-${site.slug || site.id}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="cursor-pointer group relative w-[260px] flex-shrink-0"
    >
      <div
        className={`relative rounded-2xl overflow-hidden transition-all duration-300 border ${
          isSelected
            ? 'border-orange-300 shadow-[0_8px_40px_rgba(249,115,22,0.15)] scale-[1.03]'
            : 'border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02]'
        }`}
        style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}
      >
        {/* Room image */}
        <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
          <img
            src={cfg.bg}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            style={{
              WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
            }}
          />
          {/* Type badge */}
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
            <div className="flex items-center gap-1.5">
              <Icon className="w-3 h-3" style={{ color: cfg.color }} />
              <span className="text-[10px] font-bold tracking-wider" style={{ color: cfg.color }}>{cfg.label.toUpperCase()}</span>
            </div>
          </div>
          {/* Backup count badge */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-1 border border-black/[0.06] shadow-sm">
            <Database className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-semibold text-zinc-600">{backupCount}</span>
          </div>
        </div>

        {/* Info */}
        <div className="px-3.5 py-3">
          <h3 className="text-sm font-bold text-zinc-800 truncate">{site.name}</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">/{site.slug}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <Clock className="w-3 h-3" />
              <span>{lastBackupTime || 'No backups'}</span>
            </div>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}60)` }} />
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <motion.div
          layoutId="backup-select-bar"
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 w-12 rounded-full bg-orange-500"
          style={{ boxShadow: '0 0 12px rgba(249,115,22,0.5)' }}
        />
      )}
    </motion.div>
  );
};


/* ═══════════════════════════════════════════════════
   Backup Detail Panel (popup on right)
   ═══════════════════════════════════════════════════ */
const BackupDetailPanel = ({
  site, backups, clones, loading, onClose,
  onCreateBackup, creating,
  onRestore, restoring,
  onDeleteBackup,
  onCloneSite, cloning,
  onRemoveClone, deletingClone,
}) => {
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(null);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const cfg = SITE_TYPE_CONFIG[site?.site_type] || SITE_TYPE_CONFIG.radio;
  const Icon = cfg.icon;

  const completedBackups = backups.filter(b => b.status === 'completed');
  const totalSize = completedBackups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);

  const filteredBackups = searchQuery
    ? backups.filter(b =>
        (TYPE_LABELS[b.type] || b.type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        formatDate(b.created_at).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : backups;

  const handleClone = () => {
    if (!cloneName.trim()) return;
    onCloneSite(cloneName.trim());
    setCloneName('');
    setShowCloneDialog(false);
  };

  return (
    <motion.div
      key="backup-detail"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-0 top-0 bottom-0 w-[420px] flex items-start pt-2 z-30"
      data-testid="backup-detail-panel"
    >
      <div className="bg-white/95 backdrop-blur-2xl rounded-[20px] border border-black/[0.06] shadow-[0_12px_48px_rgba(0,0,0,0.12)] w-full max-h-[96%] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.05] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${cfg.color}12` }}>
              <Icon className="w-4.5 h-4.5" style={{ color: cfg.color }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-zinc-900 truncate">{site.name}</h3>
              <span className="text-[11px] text-zinc-400">{backups.length} backups &middot; {formatBytes(totalSize)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] transition-colors flex-shrink-0"
            data-testid="backup-panel-close"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Action bar */}
        <div className="px-4 py-3 flex items-center gap-2 border-b border-black/[0.05] flex-shrink-0">
          <Button
            onClick={onCreateBackup}
            disabled={creating}
            size="sm"
            className="gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs"
            data-testid="panel-create-backup-btn"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
            New Backup
          </Button>
          <Button
            onClick={() => { setCloneName(`[TEST] ${site.name}`); setShowCloneDialog(true); }}
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl border-black/10 text-zinc-600 text-xs"
            data-testid="panel-clone-btn"
          >
            <Copy className="w-3.5 h-3.5" />
            Clone
          </Button>
          <div className="flex-1" />
          <div className="relative w-36">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-zinc-50 border border-black/[0.06] rounded-lg text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-900/10"
              data-testid="backup-panel-search"
            />
          </div>
        </div>

        {/* Clones */}
        {clones.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex-shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-2 flex items-center gap-1.5">
              <Copy className="w-3 h-3" /> Active Clones
            </p>
            <div className="space-y-1 mb-2">
              {clones.map(clone => (
                <div key={clone.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
                  <div>
                    <p className="text-xs font-medium text-zinc-700">{clone.name}</p>
                    <p className="text-[10px] text-zinc-400">{formatDate(clone.created_at)}</p>
                  </div>
                  <button
                    onClick={() => onRemoveClone(clone.id)}
                    disabled={deletingClone === clone.id}
                    className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-100 text-zinc-400 hover:text-red-500 transition-colors"
                    data-testid={`panel-delete-clone-${clone.id}`}
                  >
                    {deletingClone === clone.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Backup list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : filteredBackups.length === 0 ? (
            <div className="text-center py-10">
              <Database className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs text-zinc-400">No backups found</p>
            </div>
          ) : (
            filteredBackups.map(backup => {
              const scfg = STATUS_CONFIG[backup.status] || STATUS_CONFIG.completed;
              const StatusIcon = scfg.icon;
              return (
                <div
                  key={backup.id}
                  className="rounded-xl border border-black/[0.05] bg-white p-3 hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-shadow"
                  data-testid={`backup-row-${backup.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg ${scfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <StatusIcon className={`w-4 h-4 ${scfg.color} ${scfg.spin ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          backup.type === 'automatic' ? 'bg-blue-50 text-blue-600' :
                          backup.type === 'pre-restore' ? 'bg-purple-50 text-purple-600' :
                          'bg-zinc-100 text-zinc-600'
                        }`}>{TYPE_LABELS[backup.type] || backup.type}</span>
                        <span className="text-[10px] text-zinc-400">{formatDate(backup.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                        <span>{backup.document_count || 0} docs</span>
                        <span>{formatBytes(backup.size_bytes)}</span>
                      </div>
                      {backup.error_message && (
                        <p className="text-[10px] text-red-400 mt-1 truncate">{backup.error_message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {backup.status === 'completed' && (
                        <button
                          onClick={() => setShowRestoreConfirm(backup.id)}
                          disabled={restoring === backup.id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-emerald-50 text-zinc-400 hover:text-emerald-600 transition-colors"
                          title="Restore"
                          data-testid={`restore-btn-${backup.id}`}
                        >
                          {restoring === backup.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteBackup(backup.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-zinc-300 hover:text-red-500 transition-colors"
                        title="Delete"
                        data-testid={`delete-backup-${backup.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Restore confirm overlay */}
        {showRestoreConfirm && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex items-center justify-center p-6 rounded-[20px]" data-testid="restore-confirm-dialog">
            <div className="text-center max-w-xs">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <h3 className="font-semibold text-zinc-900 mb-1">Restore backup?</h3>
              <p className="text-xs text-zinc-400 mb-4">This will overwrite current data. A safety backup will be created automatically.</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => setShowRestoreConfirm(null)} className="rounded-xl border-black/10" data-testid="restore-cancel-btn">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 rounded-xl"
                  onClick={() => { onRestore(showRestoreConfirm); setShowRestoreConfirm(null); }}
                  data-testid="restore-confirm-btn"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Clone overlay */}
        {showCloneDialog && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex items-center justify-center p-6 rounded-[20px]" data-testid="clone-dialog">
            <div className="max-w-xs w-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Copy className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 text-sm">Clone Site</h3>
                  <p className="text-[10px] text-zinc-400">Test copy of {site.name}</p>
                </div>
              </div>
              <input
                type="text"
                value={cloneName}
                onChange={e => setCloneName(e.target.value)}
                className="w-full bg-zinc-50 border border-black/[0.08] rounded-xl px-3 py-2.5 text-sm text-zinc-900 mb-3 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-300"
                placeholder="Clone name..."
                data-testid="clone-name-input"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowCloneDialog(false)} className="rounded-xl border-black/10" data-testid="clone-cancel-btn">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5 rounded-xl"
                  onClick={handleClone}
                  disabled={!cloneName.trim() || cloning}
                  data-testid="clone-confirm-btn"
                >
                  {cloning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                  Clone
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};


/* ═══════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════ */
export default function BackupManagementPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [mainSites, setMainSites] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [backups, setBackups] = useState([]);
  const [clones, setClones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [cloning, setCloning] = useState(false);
  const [deletingClone, setDeletingClone] = useState(null);
  // Track per-site backup counts for cards
  const [siteBackupCounts, setSiteBackupCounts] = useState({});

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchMainSites = useCallback(async () => {
    try {
      const [sitesRes, envsRes] = await Promise.all([
        fetch(`${API}/api/main-sites`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/environments`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      if (sitesRes.ok) {
        const data = await sitesRes.json();
        const real = (data.main_sites || data || []).filter(s => !s.cloned_from);
        setMainSites(real);
      }
      if (envsRes?.ok) {
        setEnvironments(await envsRes.json());
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  // Fetch backup count for each site (lightweight)
  const fetchSiteBackupCounts = useCallback(async () => {
    if (!mainSites.length) return;
    const counts = {};
    await Promise.all(mainSites.map(async (site) => {
      try {
        const res = await fetch(`${API}/api/backups/${site.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const bk = data.backups || [];
          counts[site.id] = {
            count: bk.length,
            lastBackup: bk.find(b => b.status === 'completed')?.created_at || null,
          };
        }
      } catch { counts[site.id] = { count: 0, lastBackup: null }; }
    }));
    setSiteBackupCounts(counts);
  }, [mainSites, token]);

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
  useEffect(() => { fetchSiteBackupCounts(); }, [fetchSiteBackupCounts]);
  useEffect(() => { if (selectedSite) fetchBackups(); }, [selectedSite, fetchBackups]);

  const createBackup = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}`, { method: 'POST', headers });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Backup created: ${data.document_count} documents`);
      } else {
        toast.error(`Backup failed: ${data.error_message || 'Unknown error'}`);
      }
      fetchBackups();
      fetchSiteBackupCounts();
    } catch { toast.error('Failed to create backup'); }
    setCreating(false);
  };

  const restoreBackup = async (backupId) => {
    setRestoring(backupId);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}/restore`, {
        method: 'POST', headers, body: JSON.stringify({ backup_id: backupId }),
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success('Restore completed!');
      } else {
        toast.error(`Restore failed: ${data.detail || 'Unknown error'}`);
      }
      fetchBackups();
    } catch { toast.error('Restore failed'); }
    setRestoring(null);
  };

  const deleteBackup = async (backupId) => {
    try {
      await fetch(`${API}/api/backups/single/${backupId}`, { method: 'DELETE', headers });
      toast.success('Backup deleted');
      fetchBackups();
      fetchSiteBackupCounts();
    } catch { toast.error('Failed to delete'); }
  };

  const cloneSite = async (cloneName) => {
    setCloning(true);
    try {
      const res = await fetch(`${API}/api/backups/${selectedSite.id}/clone`, {
        method: 'POST', headers, body: JSON.stringify({ clone_name: cloneName }),
      });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success(`Clone "${cloneName}" created`);
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
      const res = await fetch(`${API}/api/backups/clone/${cloneId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.status === 'completed') {
        toast.success('Clone removed');
        fetchBackups();
        fetchMainSites();
      } else {
        toast.error('Failed to remove clone');
      }
    } catch { toast.error('Failed to remove clone'); }
    setDeletingClone(null);
  };

  // Group sites by environment
  const sitesByEnv = useMemo(() => {
    const groups = {};
    mainSites.forEach(site => {
      const envId = site.environment_id || 'default';
      if (!groups[envId]) groups[envId] = [];
      groups[envId].push(site);
    });
    return groups;
  }, [mainSites]);

  const totalBackups = Object.values(siteBackupCounts).reduce((sum, s) => sum + (s.count || 0), 0);

  if (!user?.is_network_admin) {
    return (
      <div className="min-h-screen bg-[#F0F0F2] flex items-center justify-center text-zinc-400">
        Network admin access required
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#F0F0F2]" data-testid="backup-management-page">
      {/* Dot pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, #999 0.5px, transparent 0.5px)',
        backgroundSize: '24px 24px',
      }} />

      <div className="absolute inset-0 z-10 flex flex-col p-4 sm:p-5">

        {/* ── Top bar ── */}
        <div className="flex items-start justify-between flex-shrink-0 mb-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4"
            data-testid="panel-backup-header"
          >
            <button onClick={() => navigate('/network')} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-black/[0.05] transition-colors" data-testid="backup-back-btn">
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Backups & Clones</div>
              <div className="text-sm font-semibold text-zinc-700">Manage site backups</div>
            </div>
            <div className="w-px h-8 bg-black/[0.06] mx-1" />
            <div className="text-3xl font-bold text-zinc-900">{mainSites.length}</div>
            <div className="text-sm text-zinc-500">Sites</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-3"
            data-testid="panel-backup-stats"
          >
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">Backups</span>
              <span className="text-lg font-bold text-zinc-900">{totalBackups}</span>
            </div>
            <div className="w-px h-6 bg-black/[0.06]" />
            <div className="flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">Envs</span>
              <span className="text-lg font-bold text-zinc-900">{Object.keys(sitesByEnv).length}</span>
            </div>
          </motion.div>
        </div>

        {/* ── Center: Card grid ── */}
        <div className="flex-1 flex relative overflow-hidden gap-4">
          {/* Scrollable card area */}
          <div className={`flex-1 overflow-y-auto pr-1 transition-all duration-300 ${selectedSite ? 'mr-[430px]' : ''}`}>
            <div className="space-y-6 pb-4">
              {Object.entries(sitesByEnv).map(([envId, envSites]) => {
                const env = environments.find(e => e.id === envId);
                return (
                  <div key={envId}>
                    {/* Environment label */}
                    {(Object.keys(sitesByEnv).length > 1 || env) && (
                      <div className="flex items-center gap-3 mb-3 ml-1">
                        <div className="bg-white/70 backdrop-blur-xl rounded-full px-4 py-1.5 border border-black/[0.05] shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: env?.color || '#71717a' }} />
                            <span className="text-[11px] font-semibold text-zinc-600">{env?.name || 'Production'}</span>
                            <span className="text-[10px] text-zinc-400">({envSites.length})</span>
                          </div>
                        </div>
                        <div className="flex-1 h-px bg-black/[0.04]" />
                      </div>
                    )}
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
                      {envSites.map((site, i) => {
                        const sbc = siteBackupCounts[site.id] || { count: 0, lastBackup: null };
                        return (
                          <BackupSiteCard
                            key={site.id}
                            site={site}
                            index={i}
                            isSelected={selectedSite?.id === site.id}
                            onClick={() => setSelectedSite(selectedSite?.id === site.id ? null : site)}
                            backupCount={sbc.count}
                            lastBackupTime={sbc.lastBackup ? timeAgo(sbc.lastBackup) : null}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Backup detail panel ── */}
          <AnimatePresence>
            {selectedSite && (
              <BackupDetailPanel
                site={selectedSite}
                backups={backups}
                clones={clones}
                loading={loading}
                onClose={() => setSelectedSite(null)}
                onCreateBackup={createBackup}
                creating={creating}
                onRestore={restoreBackup}
                restoring={restoring}
                onDeleteBackup={deleteBackup}
                onCloneSite={cloneSite}
                cloning={cloning}
                onRemoveClone={removeClone}
                deletingClone={deletingClone}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ── Bottom bar ── */}
        <div className="flex items-end justify-between flex-shrink-0">
          {!selectedSite && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.5 }}
              className="text-xs text-zinc-400 bg-white/60 backdrop-blur-xl rounded-full px-4 py-2 border border-black/[0.05]"
            >
              Click a site to view its backups
            </motion.div>
          )}
          <div className="flex-1" />
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-3.5 flex items-center gap-3"
            data-testid="panel-backup-status"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
            <span className="text-sm font-medium text-zinc-700">Backup system active</span>
            <div className="w-px h-5 bg-black/[0.06]" />
            <HardDrive className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-bold text-zinc-900">{mainSites.length} sites</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
