import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Plug, Plus, RefreshCw, Trash2, Newspaper, Copy, Loader2, CheckCircle2,
  XCircle, Clock, AlertTriangle, Power, FileCode2, Send, Rocket, Download, Stethoscope,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../ui/alert-dialog';
import { toast } from 'sonner';
import SetupStepsCard from './SetupStepsCard';

const API = process.env.REACT_APP_BACKEND_URL;

const TEMPLATE_ICONS = {
  news_blog: Newspaper,
};

/** Hide internal Emergent preview URLs from the UI — show a friendly label instead.
 *  On production (clr.koodh.com) and external-facing dashboards this prevents
 *  exposing internal *.preview.emergentagent.com URLs to end users. */
function displayBaseUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('.preview.emergentagent.com')) {
      return 'External site (linked)';
    }
    return url;
  } catch {
    return url;
  }
}

const STATUS_META = {
  pending_registration: { color: '#a1a1aa', label: 'Awaiting prompt response', icon: Clock },
  pending_approval:     { color: '#f59e0b', label: 'Pending approval',         icon: AlertTriangle },
  connected:            { color: '#10b981', label: 'Connected',                 icon: CheckCircle2 },
  disconnected:         { color: '#71717a', label: 'Disconnected',              icon: Power },
  error:                { color: '#ef4444', label: 'Error',                     icon: XCircle },
};

export default function IntegrationsTab({ mainSite, token }) {
  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;

  const [templates, setTemplates] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promoteConfig, setPromoteConfig] = useState({ enabled: false, target_url: null });

  const [pickTemplateOpen, setPickTemplateOpen] = useState(false);
  const [promptDialog, setPromptDialog] = useState(null); // {prompt_markdown, integration_id, template, integration_token}
  const [busyId, setBusyId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // {action, integ}
  const [diagnoseResult, setDiagnoseResult] = useState(null);

  const load = useCallback(async () => {
    if (!headers || !mainSite?.id) return;
    setLoading(true);
    try {
      const [t, list, pc] = await Promise.all([
        axios.get(`${API}/api/clara-custom/integrations/templates`, { headers }),
        axios.get(`${API}/api/clara-custom/integrations/by-site/${mainSite.id}`, { headers }),
        axios.get(`${API}/api/clara-custom/integrations/promote-config`, { headers }).catch(() => ({ data: { enabled: false } })),
      ]);
      setTemplates(Array.isArray(t.data) ? t.data : []);
      setIntegrations(Array.isArray(list.data) ? list.data : []);
      setPromoteConfig(pc.data || { enabled: false });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, [token, mainSite?.id]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10s so pending_approval flips to connected without manual reload
  useEffect(() => {
    if (!headers || !mainSite?.id) return;
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [load]); // eslint-disable-line

  const generatePrompt = async (templateId) => {
    try {
      const r = await axios.post(`${API}/api/clara-custom/integrations/generate-prompt`, {
        main_site_id: mainSite.id, template: templateId,
      }, { headers });
      setPromptDialog(r.data);
      setPickTemplateOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to generate prompt');
    }
  };

  const approve = async (integ) => {
    setBusyId(integ.id);
    try {
      await axios.post(`${API}/api/clara-custom/integrations/${integ.id}/approve`, null, { headers });
      toast.success('Approved — full sync started in background');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Approve failed');
    } finally { setBusyId(null); }
  };

  const disconnect = async (integ) => {
    setBusyId(integ.id);
    try {
      await axios.post(`${API}/api/clara-custom/integrations/${integ.id}/disconnect`, null, { headers });
      toast.success('Disconnected');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Disconnect failed');
    } finally { setBusyId(null); setConfirmTarget(null); }
  };

  const remove = async (integ) => {
    setBusyId(integ.id);
    try {
      await axios.delete(`${API}/api/clara-custom/integrations/${integ.id}`, { headers });
      toast.success('Removed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Remove failed');
    } finally { setBusyId(null); setConfirmTarget(null); }
  };

  const check = async (integ) => {
    setBusyId(integ.id);
    try {
      await axios.post(`${API}/api/clara-custom/integrations/${integ.id}/check`, null, { headers });
      toast.success('Health checked');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Check failed');
    } finally { setBusyId(null); }
  };

  const promote = async (integ) => {
    setBusyId(integ.id);
    try {
      const r = await axios.post(`${API}/api/clara-custom/integrations/${integ.id}/promote`, null, { headers });
      toast.success(`Promoted to ${r.data.target_url} (${r.data.status})`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Promote failed');
    } finally { setBusyId(null); }
  };

  const importRemote = async (integ) => {
    setBusyId(integ.id);
    try {
      const r = await axios.post(`${API}/api/clara-custom/integrations/${integ.id}/import-remote`, null, { headers });
      const { imported = 0, skipped = 0, failed = 0, total_remote = 0 } = r.data || {};
      if (total_remote === 0) {
        toast.warning('External site returned 0 items — click "Diagnose" to see why');
      } else {
        toast.success(`Import done — ${imported} new, ${skipped} skipped, ${failed} failed (of ${total_remote})`);
      }
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Import failed');
    } finally { setBusyId(null); }
  };

  const diagnose = async (integ) => {
    setBusyId(integ.id);
    try {
      const r = await axios.post(`${API}/api/clara-custom/integrations/${integ.id}/diagnose`, null, { headers });
      setDiagnoseResult({ integ, ...r.data });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Diagnose failed');
    } finally { setBusyId(null); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" /></div>;
  }

  return (
    <div data-testid="integrations-tab">
      {/* Add button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900">Feature Integrations</h2>
          <p className="text-xs text-zinc-500">Plug specific Clara features (like news/blog) into the external site.</p>
        </div>
        <Button
          onClick={() => setPickTemplateOpen(true)}
          className="gap-2 bg-[#7c1ac8] hover:bg-[#6b14b0] !text-white [&_svg]:!text-white"
          data-testid="add-integration-btn"
        >
          <Plus className="w-4 h-4" /> Add integration
        </Button>
      </div>

      {/* Empty state */}
      {integrations.length === 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7c1ac8]/15 to-[#dd0c51]/15 mx-auto mb-3 flex items-center justify-center">
            <Plug className="w-7 h-7 text-[#7c1ac8]" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 mb-1">No integrations yet</h3>
          <p className="text-sm text-zinc-500 mb-4">Generate a prompt for a feature (like News/Blog) and have the other Emergent project implement it.</p>
          <Button onClick={() => setPickTemplateOpen(true)} className="gap-2 bg-[#7c1ac8] hover:bg-[#6b14b0] !text-white [&_svg]:!text-white">
            <Plus className="w-4 h-4" /> Generate first prompt
          </Button>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {integrations.map((it) => {
          const tpl = templates.find((t) => t.id === it.template) || { name: it.template, icon: 'plug' };
          const Icon = TEMPLATE_ICONS[it.template] || Plug;
          const meta = STATUS_META[it.status] || STATUS_META.error;
          const StatusIcon = meta.icon;
          return (
            <div key={it.id} className="bg-white rounded-2xl border border-zinc-200 p-4" data-testid={`integration-row-${it.id}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#7c1ac8]/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-[#7c1ac8]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{tpl.name}</p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}>
                      <StatusIcon className="w-3 h-3" /> {meta.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {it.base_url ? <code className="text-zinc-700">{displayBaseUrl(it.base_url)}</code> : <span>Awaiting external project registration…</span>}
                  </p>
                  {it.last_synced_at && (
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Last full sync: {new Date(it.last_synced_at).toLocaleString()}
                      {it.last_sync_result && <> · {it.last_sync_result.synced}/{it.last_sync_result.total} items</>}
                    </p>
                  )}
                  {it.last_import_at && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      Last import: {new Date(it.last_import_at).toLocaleString()}
                      {it.last_import_result && <> · {it.last_import_result.imported} new, {it.last_import_result.skipped} skipped</>}
                    </p>
                  )}
                  {it.last_health_check && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      Last health: {it.last_health_check.status} · {it.last_health_check.elapsed_ms ?? 0}ms · {new Date(it.last_health_check.checked_at).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {promoteConfig.enabled && it.status !== 'pending_registration' && (
                    <Button size="sm" variant="outline" onClick={() => promote(it)} disabled={busyId === it.id} className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50" data-testid={`promote-${it.id}`} title={`Copy to ${promoteConfig.target_url}`}>
                      {busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Promote
                    </Button>
                  )}
                  {it.status === 'pending_approval' && (
                    <Button size="sm" onClick={() => approve(it)} disabled={busyId === it.id} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 !text-white [&_svg]:!text-white" data-testid={`approve-${it.id}`}>
                      {busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve
                    </Button>
                  )}
                  {it.status === 'connected' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => importRemote(it)} disabled={busyId === it.id} className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50" data-testid={`import-${it.id}`} title="Pull existing articles from the external site into Clara">
                        {busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Import
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => diagnose(it)} disabled={busyId === it.id} className="gap-1.5" data-testid={`diagnose-${it.id}`} title="Inspect what the external site is returning">
                        {busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />} Diagnose
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => check(it)} disabled={busyId === it.id} className="gap-1.5" data-testid={`check-${it.id}`}>
                        {busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Check
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmTarget({ action: 'disconnect', integ: it })} className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50" data-testid={`disconnect-${it.id}`}>
                        <Power className="w-3.5 h-3.5" /> Disconnect
                      </Button>
                    </>
                  )}
                  {(it.status === 'pending_registration' || it.status === 'disconnected') && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmTarget({ action: 'delete', integ: it })} className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50" data-testid={`delete-${it.id}`}>
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <SetupStepsCard integrationId={it.id} token={token} onActionDone={load} />
            </div>
          );
        })}
      </div>

      {/* Pick template dialog */}
      <Dialog open={pickTemplateOpen} onOpenChange={setPickTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose feature to integrate</DialogTitle>
            <DialogDescription>Pick what you want to push from Clara to the external site.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            {templates.map((t) => {
              const Icon = TEMPLATE_ICONS[t.id] || Plug;
              return (
                <button
                  key={t.id}
                  onClick={() => generatePrompt(t.id)}
                  className="text-left p-4 rounded-xl border border-zinc-200 hover:border-[#7c1ac8] hover:bg-[#7c1ac8]/5 transition-all"
                  data-testid={`template-${t.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#7c1ac8]/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-[#7c1ac8]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{t.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Prompt reveal dialog */}
      <Dialog open={!!promptDialog} onOpenChange={(v) => !v && setPromptDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-[#7c1ac8]" /> Integration prompt generated
            </DialogTitle>
            <DialogDescription>
              Copy this entire prompt and paste it into the other Emergent project. When that project starts up, this integration will move to "pending approval".
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-3 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              ⚠️ The integration token below is only shown once. The external project needs it in <code>CLARA_INTEGRATION_TOKEN</code>.
            </div>
            <div className="flex justify-end">
              <Button onClick={() => copyToClipboard(promptDialog?.prompt_markdown || '')} className="gap-2" data-testid="copy-prompt-btn">
                <Copy className="w-4 h-4" /> Copy entire prompt
              </Button>
            </div>
            <Textarea
              value={promptDialog?.prompt_markdown || ''}
              readOnly
              className="font-mono text-[11px] leading-relaxed min-h-[400px] bg-zinc-50"
              data-testid="prompt-textarea"
            />
          </div>
          <div className="flex justify-end pt-3 border-t">
            <Button onClick={() => setPromptDialog(null)} data-testid="close-prompt-btn">Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diagnose result dialog */}
      <Dialog open={!!diagnoseResult} onOpenChange={(v) => !v && setDiagnoseResult(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-violet-600" /> External site diagnosis
            </DialogTitle>
            <DialogDescription>What the external site returned when Clara called its list endpoint.</DialogDescription>
          </DialogHeader>
          {diagnoseResult && (
            <div className="space-y-3 py-2 overflow-auto">
              <div className={`rounded-lg p-3 text-sm font-medium ${diagnoseResult.ok && diagnoseResult.item_count > 0 ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
                {diagnoseResult.diagnosis?.split('\n').map((line, i) => <p key={i} className={i > 0 ? 'mt-1.5' : ''}>{line}</p>)}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-zinc-50 p-2"><p className="text-zinc-500">HTTP status</p><p className="font-bold text-zinc-900">{diagnoseResult.http_status}</p></div>
                <div className="rounded-lg bg-zinc-50 p-2"><p className="text-zinc-500">Items returned</p><p className="font-bold text-zinc-900">{diagnoseResult.item_count}</p></div>
                <div className="rounded-lg bg-zinc-50 p-2"><p className="text-zinc-500">Reachable</p><p className="font-bold text-zinc-900">{diagnoseResult.ok ? 'Yes' : 'No'}</p></div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">URL called</p>
                <code className="block text-[11px] bg-zinc-50 p-2 rounded break-all">{diagnoseResult.url}</code>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Response body (first 2KB)</p>
                <pre className="text-[10px] bg-zinc-900 text-zinc-100 p-3 rounded max-h-60 overflow-auto whitespace-pre-wrap">{diagnoseResult.response_body_preview || '(empty)'}</pre>
              </div>
            </div>
          )}
          <div className="flex justify-end pt-2 border-t">
            <Button onClick={() => setDiagnoseResult(null)} data-testid="close-diagnose-btn">Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm disconnect / delete */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(v) => !v && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.action === 'delete' ? 'Remove integration?' : 'Disconnect integration?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.action === 'delete'
                ? 'This will permanently remove the integration. The token will no longer work for re-registration.'
                : 'The external site will no longer receive content updates. You can re-approve later or generate a new prompt.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmTarget?.action === 'delete' ? remove(confirmTarget.integ) : disconnect(confirmTarget.integ)}
              className="bg-rose-600 hover:bg-rose-700 !text-white"
            >
              {confirmTarget?.action === 'delete' ? 'Remove' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
