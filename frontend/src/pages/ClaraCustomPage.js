import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plug, Plus, RefreshCw, Trash2, CheckCircle2, XCircle, Clock, Loader2,
  Upload, Sparkles, FileJson, FormInput, Lock, Activity, AlertTriangle,
} from 'lucide-react';
import PendingSetupBanner from '../components/ClaraCustom/PendingSetupBanner';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_META = {
  connected: { color: '#10b981', label: 'Connected', icon: CheckCircle2 },
  failed:    { color: '#ef4444', label: 'Failed',    icon: XCircle },
  timeout:   { color: '#f59e0b', label: 'Timeout',   icon: Clock },
  error:     { color: '#ef4444', label: 'Error',     icon: AlertTriangle },
};

const TABS = [
  { id: 'prompt',  label: 'AI Prompt',  icon: Sparkles, desc: 'Paste docs/notes, Clara parses them' },
  { id: 'openapi', label: 'OpenAPI',    icon: FileJson, desc: 'Paste Swagger / OpenAPI JSON or YAML' },
  { id: 'postman', label: 'Postman',    icon: Upload,   desc: 'Paste a Postman v2 collection JSON' },
  { id: 'manual',  label: 'Manual',     icon: FormInput, desc: 'Enter endpoint details by hand' },
];

function StatusPill({ check }) {
  if (!check || !check.status) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-semibold"><Clock className="w-3 h-3" /> Not checked</span>;
  }
  const meta = STATUS_META[check.status] || STATUS_META.error;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

export default function ClaraCustomPage() {
  const { token } = useAuth();
  const { mainSite } = useMainSite() || {};
  const { slug } = useParams();
  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;

  const [apis, setApis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingIds, setCheckingIds] = useState(new Set());

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('manual');
  const [importContent, setImportContent] = useState('');
  const [manualApi, setManualApi] = useState({
    name: '', base_url: '', method: 'GET',
    health_check_path: '/health', expected_status: 200,
    auth_header: '', expected_schema_text: '',
  });
  const [importing, setImporting] = useState(false);
  const [previewResults, setPreviewResults] = useState(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const mainSiteId = mainSite?.id;

  const fetchApis = useCallback(async () => {
    if (!mainSiteId || !headers) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/clara-custom/apis`, { headers, params: { main_site_id: mainSiteId } });
      setApis(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load APIs');
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSiteId]);

  useEffect(() => { fetchApis(); }, [fetchApis]);

  const checkOne = async (apiId) => {
    setCheckingIds((s) => new Set([...s, apiId]));
    try {
      const r = await axios.post(`${API}/api/clara-custom/apis/${apiId}/check`, {}, { headers });
      setApis((list) => list.map((a) => a.id === apiId ? { ...a, last_health_check: r.data } : a));
    } catch (e) {
      toast.error('Health check failed');
    }
    setCheckingIds((s) => { const n = new Set(s); n.delete(apiId); return n; });
  };

  const checkAll = async () => {
    if (!mainSiteId) return;
    setCheckingAll(true);
    try {
      const r = await axios.post(`${API}/api/clara-custom/check-all?main_site_id=${mainSiteId}`, {}, { headers });
      toast.success(`${r.data?.connected || 0} of ${r.data?.checked || 0} APIs connected`);
      await fetchApis();
    } catch (e) {
      toast.error('Check failed');
    }
    setCheckingAll(false);
  };

  const submitImport = async () => {
    if (!mainSiteId) return;
    setImporting(true);
    setPreviewResults(null);
    try {
      if (activeTab === 'manual') {
        let schema = null;
        if (manualApi.expected_schema_text) {
          try { schema = JSON.parse(manualApi.expected_schema_text); }
          catch { toast.error('Expected schema is not valid JSON'); setImporting(false); return; }
        }
        await axios.post(`${API}/api/clara-custom/apis`, {
          main_site_id: mainSiteId,
          name: manualApi.name || manualApi.base_url,
          base_url: manualApi.base_url,
          method: manualApi.method,
          health_check_path: manualApi.health_check_path,
          expected_status: parseInt(manualApi.expected_status) || 200,
          auth_header: manualApi.auth_header,
          expected_schema: schema,
        }, { headers });
        toast.success('API added');
        setManualApi({ name: '', base_url: '', method: 'GET', health_check_path: '/health', expected_status: 200, auth_header: '', expected_schema_text: '' });
      } else {
        let content = importContent;
        if (!content?.trim()) { toast.error('Paste some content first'); setImporting(false); return; }
        if (activeTab !== 'prompt') {
          // try parse JSON for openapi/postman, allow user to paste raw text and let server parse
          try { content = JSON.parse(importContent); } catch { /* let server try */ }
        }
        const r = await axios.post(`${API}/api/clara-custom/import`, {
          main_site_id: mainSiteId,
          mode: activeTab,
          content,
          save: true,
        }, { headers });
        toast.success(`${r.data?.created || 0} APIs imported`);
        setPreviewResults(r.data);
      }
      await fetchApis();
      if (activeTab === 'manual') setAddOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Import failed');
    }
    setImporting(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/api/clara-custom/apis/${deleteTarget.id}`, { headers });
      toast.success('API removed');
      setApis((list) => list.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error('Delete failed');
    }
    setDeleting(false);
  };

  if (!mainSite) {
    return (
      <div className="p-8 text-zinc-500 text-sm">Loading site context…</div>
    );
  }

  return (
    <div className="min-h-full bg-[#F0F0F2] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c1ac8] to-[#dd0c51] flex items-center justify-center text-white shadow-sm">
              <Plug className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Clara Custom</h1>
              <p className="text-xs text-zinc-500">External API connections for <strong>{mainSite.name}</strong></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={checkAll}
              disabled={checkingAll || apis.length === 0}
              className="gap-2"
              data-testid="check-all-btn"
            >
              {checkingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              Check all
            </Button>
            <Button
              onClick={() => setAddOpen(true)}
              className="gap-2 bg-[#7c1ac8] hover:bg-[#6b14b0] !text-white [&_svg]:!text-white"
              data-testid="add-api-btn"
            >
              <Plus className="w-4 h-4" /> Add API
            </Button>
          </div>
        </div>

        {/* Pending setup banner — shown for auto-discovered sites awaiting admin completion */}
        {mainSite?.pending_setup && (
          <PendingSetupBanner
            mainSite={mainSite}
            token={token}
            headers={headers}
            apis={apis}
            onRefresh={fetchApis}
          />
        )}

        {/* Health overview cards */}
        {apis.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {(['connected', 'failed', 'timeout', 'error']).map((status) => {
              const count = apis.filter((a) => a.last_health_check?.status === status).length;
              const meta = STATUS_META[status];
              const Icon = meta.icon;
              return (
                <div key={status} className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3" data-testid={`stat-${status}`}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}1a` }}>
                    <Icon className="w-5 h-5" style={{ color: meta.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900">{count}</p>
                    <p className="text-xs text-zinc-500">{meta.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading / empty */}
        {loading && (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>
        )}
        {!loading && apis.length === 0 && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center" data-testid="empty-state">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7c1ac8]/15 to-[#dd0c51]/15 mx-auto mb-3 flex items-center justify-center">
              <Plug className="w-7 h-7 text-[#7c1ac8]" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 mb-1">No APIs registered yet</h3>
            <p className="text-sm text-zinc-500 mb-4">Add external services to monitor their connectivity from Clara.</p>
            <Button onClick={() => setAddOpen(true)} className="gap-2 bg-[#7c1ac8] hover:bg-[#6b14b0] !text-white [&_svg]:!text-white"><Plus className="w-4 h-4" /> Add first API</Button>
          </div>
        )}

        {/* APIs list */}
        {!loading && apis.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence>
              {apis.map((api) => (
                <motion.div
                  key={api.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="bg-white rounded-xl border border-zinc-200 p-4 flex items-center gap-4 hover:border-zinc-300 transition-colors"
                  data-testid={`api-row-${api.id}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#7c1ac8]/10 flex items-center justify-center flex-shrink-0">
                    <Plug className="w-5 h-5 text-[#7c1ac8]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-zinc-900 truncate">{api.name}</h4>
                      <StatusPill check={api.last_health_check} />
                      {api.auth_header && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-semibold">
                          <Lock className="w-3 h-3" /> Auth
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                      <span className="text-zinc-400">{api.method}</span> {api.base_url}{api.health_check_path}
                    </p>
                    {api.last_health_check?.message && (
                      <p className="text-[11px] text-zinc-400 mt-1 truncate">
                        Last check: {api.last_health_check.message}
                        {api.last_health_check.response_time_ms ? ` · ${api.last_health_check.response_time_ms}ms` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => checkOne(api.id)}
                      disabled={checkingIds.has(api.id)}
                      className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors disabled:opacity-50"
                      data-testid={`check-${api.id}`}
                      title="Re-check"
                    >
                      {checkingIds.has(api.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(api)}
                      className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors"
                      data-testid={`delete-${api.id}`}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Add API dialog */}
        <Dialog open={addOpen} onOpenChange={(o) => !importing && setAddOpen(o)}>
          <DialogContent className="bg-white max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4 text-[#7c1ac8]" /> Add APIs</DialogTitle>
              <DialogDescription>Add one API by hand, or paste a spec for Clara to parse.</DialogDescription>
            </DialogHeader>

            {/* Tabs */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setActiveTab(t.id); setPreviewResults(null); }}
                    data-testid={`tab-${t.id}`}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-all ${
                      active ? 'border-transparent text-white bg-[#7c1ac8]' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold">{t.label}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-zinc-500 mb-3">{TABS.find((t) => t.id === activeTab)?.desc}</p>

            {/* Tab body */}
            {activeTab === 'manual' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">Name</Label>
                    <Input value={manualApi.name} onChange={(e) => setManualApi((a) => ({ ...a, name: e.target.value }))} placeholder="CRM" data-testid="manual-name-input" />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">Method</Label>
                    <select value={manualApi.method} onChange={(e) => setManualApi((a) => ({ ...a, method: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white">
                      {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Base URL</Label>
                  <Input value={manualApi.base_url} onChange={(e) => setManualApi((a) => ({ ...a, base_url: e.target.value }))} placeholder="https://api.example.com" className="font-mono text-sm" data-testid="manual-url-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">Health check path</Label>
                    <Input value={manualApi.health_check_path} onChange={(e) => setManualApi((a) => ({ ...a, health_check_path: e.target.value }))} placeholder="/health" className="font-mono text-sm" data-testid="manual-path-input" />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">Expected status</Label>
                    <Input type="number" value={manualApi.expected_status} onChange={(e) => setManualApi((a) => ({ ...a, expected_status: e.target.value }))} placeholder="200" data-testid="manual-status-input" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Authorization header (optional)</Label>
                  <Input value={manualApi.auth_header} onChange={(e) => setManualApi((a) => ({ ...a, auth_header: e.target.value }))} placeholder="Bearer ..." className="font-mono text-xs" data-testid="manual-auth-input" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Expected JSON schema (optional)</Label>
                  <Textarea
                    value={manualApi.expected_schema_text}
                    onChange={(e) => setManualApi((a) => ({ ...a, expected_schema_text: e.target.value }))}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder='{"type":"object","required":["status"]}'
                    data-testid="manual-schema-input"
                  />
                </div>
              </div>
            )}
            {activeTab === 'prompt' && (
              <Textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder="Paste any API docs or describe your APIs. e.g.:\n\nOur CRM exposes https://crm.example.com/api with /health and /v1/contacts.\nAuth: Bearer eyJhb...\nMonitoring should hit /health expecting 200."
                data-testid="prompt-input"
              />
            )}
            {activeTab === 'openapi' && (
              <Textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder='Paste OpenAPI 3.x JSON or YAML here...'
                data-testid="openapi-input"
              />
            )}
            {activeTab === 'postman' && (
              <Textarea
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder='Paste Postman Collection v2 JSON export here...'
                data-testid="postman-input"
              />
            )}

            {previewResults && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                Imported {previewResults.created} API(s).
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={importing}>Cancel</Button>
              <Button onClick={submitImport} disabled={importing} className="gap-2 bg-[#7c1ac8] hover:bg-[#6b14b0] !text-white [&_svg]:!text-white" data-testid="submit-import-btn">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : (activeTab === 'manual' ? 'Add API' : 'Import')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !deleting && !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this API?</AlertDialogTitle>
              <AlertDialogDescription>
                The API <strong>{deleteTarget?.name}</strong> and all its health-check history will be permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Removing...</> : 'Yes, remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
