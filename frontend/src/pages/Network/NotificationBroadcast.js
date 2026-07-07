/* eslint-disable */
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Send, ArrowLeft, Eye, Loader2, AlertTriangle, Wrench, Info, CheckCircle2, Users, Globe,
  Palette, Image as ImageIcon, RefreshCw, Mail, Bell,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const SEVERITIES = [
  { id: 'info',        label: 'Info',        color: '#0ea5e9', icon: Info },
  { id: 'success',     label: 'Success',     color: '#10b981', icon: CheckCircle2 },
  { id: 'warning',     label: 'Warning',     color: '#f59e0b', icon: AlertTriangle },
  { id: 'maintenance', label: 'Maintenance', color: '#dc2626', icon: Wrench },
];

const AUDIENCES = [
  { id: 'system_admins',     label: 'System administrators', desc: 'All Clara network admins',           needsSite: false },
  { id: 'site_admins',       label: 'Site admins / owners',  desc: 'Admins of the selected environment', needsSite: true  },
  { id: 'site_editors',      label: 'Editors + admins',      desc: 'Editor-level and above',             needsSite: true  },
  { id: 'site_all_users',    label: 'All site users',        desc: 'Every user in the environment',      needsSite: true  },
  { id: 'global_all_users',  label: 'All Clara users',       desc: 'Every user across the platform',     needsSite: false },
];

function SectionCard({ icon: Icon, title, action, children, testId }) {
  return (
    <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5" data-testid={testId}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-zinc-500" />}
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function NotificationBroadcast() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [mainSites, setMainSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('Scheduled maintenance');
  const [body, setBody] = useState('<p>Dear users,</p>\n<p>We are performing scheduled maintenance. During this window the service may be temporarily unavailable.</p>\n<p><strong>When:</strong> tonight between 02:00 and 04:00 (CET)</p>');
  const [severity, setSeverity] = useState('maintenance');
  const [audience, setAudience] = useState('system_admins');
  const [mainSiteId, setMainSiteId] = useState('');
  const [showInAppBanner, setShowInAppBanner] = useState(true);
  const [bannerEndsAt, setBannerEndsAt] = useState('');

  const [layout, setLayout] = useState({
    show_main_site_logo: true,
    show_clara_logo: true,
    banner_gradient_from: '#7c1ac8',
    banner_gradient_to: '#dd0c51',
    footer_text: 'You are receiving this because you belong to this environment.',
  });
  const [savingLayout, setSavingLayout] = useState(false);

  const [previewHtml, setPreviewHtml] = useState('');
  const [audienceCount, setAudienceCount] = useState(null);
  const [renderingPreview, setRenderingPreview] = useState(false);
  const previewIframeRef = useRef(null);
  const previewTimerRef = useRef(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const audienceDef = AUDIENCES.find((a) => a.id === audience) || AUDIENCES[0];
  const severityDef = SEVERITIES.find((s) => s.id === severity) || SEVERITIES[0];

  useEffect(() => {
    const init = async () => {
      try {
        const ms = await axios.get(`${API}/api/main-sites`, { headers });
        setMainSites(ms.data || []);
      } catch (e) { /* ignore */ }
      try {
        const lr = await axios.get(`${API}/api/notifications/layout`, { headers });
        setLayout((l) => ({ ...l, ...(lr.data || {}) }));
      } catch (e) { /* ignore */ }
      setLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    const loadLayout = async () => {
      try {
        const lr = await axios.get(`${API}/api/notifications/layout`, {
          headers, params: { main_site_id: mainSiteId || '' },
        });
        setLayout((l) => ({ ...l, ...(lr.data || {}) }));
      } catch (e) { /* ignore */ }
    };
    loadLayout();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSiteId]);

  const renderPreview = useCallback(async () => {
    setRenderingPreview(true);
    try {
      const r = await axios.post(`${API}/api/notifications/broadcast/preview`, {
        title, body, severity, main_site_id: mainSiteId, layout_override: layout,
      }, { headers });
      setPreviewHtml(r.data?.html || '');
    } catch (e) { /* silent */ } finally {
      setRenderingPreview(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, severity, mainSiteId, layout]);

  useEffect(() => {
    if (loading) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(renderPreview, 350);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [renderPreview, loading]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(async () => {
      try {
        const r = await axios.post(`${API}/api/notifications/broadcast/audience-count`, {
          audience, main_site_id: mainSiteId,
        }, { headers });
        setAudienceCount(r.data);
      } catch (e) { setAudienceCount(null); }
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, mainSiteId, loading]);

  useEffect(() => {
    if (!previewIframeRef.current || !previewHtml) return;
    const doc = previewIframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;}</style></head><body>${previewHtml}</body></html>`);
    doc.close();
  }, [previewHtml]);

  const saveLayout = async () => {
    setSavingLayout(true);
    try {
      await axios.put(`${API}/api/notifications/layout`, {
        ...layout, main_site_id: mainSiteId || 'global',
      }, { headers });
      toast.success(`Layout saved for ${mainSiteId ? mainSites.find((m) => m.id === mainSiteId)?.name : 'Global'}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save layout');
    } finally {
      setSavingLayout(false);
    }
  };

  const sendTest = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSendingTest(true);
    try {
      await axios.post(`${API}/api/notifications/broadcast`, {
        title, body, severity, audience, main_site_id: mainSiteId,
        show_in_app_banner: false, test_to_self: true,
      }, { headers });
      toast.success(`Test sent to ${user?.email}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Test send failed');
    } finally {
      setSendingTest(false);
    }
  };

  const sendBroadcast = async () => {
    setSending(true);
    try {
      const r = await axios.post(`${API}/api/notifications/broadcast`, {
        title, body, severity, audience, main_site_id: mainSiteId,
        show_in_app_banner: showInAppBanner,
        banner_ends_at: bannerEndsAt ? new Date(bannerEndsAt).toISOString() : null,
      }, { headers });
      toast.success(`Broadcast queued — ${r.data?.queued || 0} recipient(s)`);
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F0F2] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0F2]">
      {/* Header — same pattern as StatisticsPage */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#F0F0F2]/80 backdrop-blur-xl border-b border-zinc-200">
        <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              data-testid="broadcast-back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Send broadcast & preview</h1>
              <p className="text-xs text-zinc-500">Compose announcements, alerts, and maintenance messages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={sendTest}
              disabled={sendingTest}
              className="gap-2"
              data-testid="broadcast-test-btn"
            >
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Test to me
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              className="gap-2 bg-orange-600 hover:bg-orange-700"
              data-testid="broadcast-send-btn"
            >
              <Send className="w-4 h-4" /> Send broadcast
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="pt-20 pb-12 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Compose column */}
          <div className="space-y-6">
            <SectionCard icon={Bell} title="Severity" testId="severity-section">
              <div className="grid grid-cols-4 gap-2">
                {SEVERITIES.map((s) => {
                  const Icon = s.icon;
                  const active = severity === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSeverity(s.id)}
                      data-testid={`severity-${s.id}-btn`}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-all ${
                        active
                          ? 'border-transparent text-white'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-700'
                      }`}
                      style={active ? { backgroundColor: s.color, color: '#ffffff' } : {}}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-semibold">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard icon={Send} title="Message" testId="message-section">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="bcast-title" className="text-xs text-zinc-500 mb-1 block">Title</Label>
                  <Input
                    id="bcast-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Planned maintenance tonight"
                    data-testid="broadcast-title-input"
                  />
                </div>
                <div>
                  <Label htmlFor="bcast-body" className="text-xs text-zinc-500 mb-1 block">
                    Body <span className="text-zinc-400">(HTML allowed)</span>
                  </Label>
                  <Textarea
                    id="bcast-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={9}
                    className="font-mono text-xs"
                    placeholder="<p>Write your announcement here...</p>"
                    data-testid="broadcast-body-input"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={Users}
              title="Audience"
              testId="audience-section"
              action={audienceCount && (
                <span className="text-xs font-semibold text-zinc-700 bg-zinc-100 px-2 py-1 rounded-full">
                  {audienceCount.count} recipient{audienceCount.count === 1 ? '' : 's'}
                </span>
              )}
            >
              <div className="space-y-2">
                {AUDIENCES.map((a) => {
                  const active = audience === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAudience(a.id)}
                      data-testid={`audience-${a.id}-btn`}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                        active ? 'border-orange-400 bg-orange-50/50' : 'border-zinc-200 hover:border-zinc-300 bg-white'
                      }`}
                    >
                      <p className="text-sm font-medium text-zinc-900">{a.label}</p>
                      <p className="text-xs text-zinc-500">{a.desc}</p>
                    </button>
                  );
                })}
              </div>
              {audienceDef.needsSite && (
                <div className="mt-3 pt-3 border-t border-zinc-100">
                  <Label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1.5">
                    <Globe className="w-3 h-3" /> Environment
                  </Label>
                  <select
                    value={mainSiteId}
                    onChange={(e) => setMainSiteId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white"
                    data-testid="broadcast-site-select"
                  >
                    <option value="">— Select site —</option>
                    {mainSites.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {!mainSiteId && (
                    <p className="text-[11px] text-amber-600 mt-1.5">⚠ This audience requires a site.</p>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Bell} title="In-app banner" testId="banner-section">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-700">Pin banner at the top of the dashboard</p>
                  <p className="text-xs text-zinc-500">Visible to the same audience until dismissed or expired.</p>
                </div>
                <Switch
                  checked={showInAppBanner}
                  onCheckedChange={setShowInAppBanner}
                  data-testid="broadcast-banner-toggle"
                />
              </div>
              {showInAppBanner && (
                <div className="mt-3 pt-3 border-t border-zinc-100">
                  <Label className="text-xs text-zinc-500 mb-1 block">Banner expires (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={bannerEndsAt}
                    onChange={(e) => setBannerEndsAt(e.target.value)}
                    data-testid="broadcast-expires-input"
                  />
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={Palette}
              title="Email layout"
              testId="layout-section"
              action={(
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveLayout}
                  disabled={savingLayout}
                  className="gap-2"
                  data-testid="layout-save-btn"
                >
                  {savingLayout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save layout'}
                </Button>
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-zinc-500" /> Show site logo
                  </span>
                  <Switch
                    checked={!!layout.show_main_site_logo}
                    onCheckedChange={(v) => setLayout((l) => ({ ...l, show_main_site_logo: v }))}
                    data-testid="layout-site-logo-toggle"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-zinc-500" /> Show Koodh Clara logo
                  </span>
                  <Switch
                    checked={!!layout.show_clara_logo}
                    onCheckedChange={(v) => setLayout((l) => ({ ...l, show_clara_logo: v }))}
                    data-testid="layout-clara-logo-toggle"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100">
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">Banner from</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={layout.banner_gradient_from}
                        onChange={(e) => setLayout((l) => ({ ...l, banner_gradient_from: e.target.value }))}
                        className="w-9 h-9 rounded-lg border border-zinc-200 cursor-pointer"
                        data-testid="layout-color-from"
                      />
                      <Input
                        value={layout.banner_gradient_from}
                        onChange={(e) => setLayout((l) => ({ ...l, banner_gradient_from: e.target.value }))}
                        className="flex-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">Banner to</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={layout.banner_gradient_to}
                        onChange={(e) => setLayout((l) => ({ ...l, banner_gradient_to: e.target.value }))}
                        className="w-9 h-9 rounded-lg border border-zinc-200 cursor-pointer"
                        data-testid="layout-color-to"
                      />
                      <Input
                        value={layout.banner_gradient_to}
                        onChange={(e) => setLayout((l) => ({ ...l, banner_gradient_to: e.target.value }))}
                        className="flex-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">Footer text</Label>
                  <Input
                    value={layout.footer_text}
                    onChange={(e) => setLayout((l) => ({ ...l, footer_text: e.target.value }))}
                    data-testid="layout-footer-input"
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Saved for <strong className="text-zinc-700">{mainSiteId ? mainSites.find((m) => m.id === mainSiteId)?.name : 'Global'}</strong>.
                </p>
              </div>
            </SectionCard>
          </div>

          {/* Preview column */}
          <div className="lg:sticky lg:top-[88px] h-fit">
            <SectionCard
              icon={Eye}
              title="Live preview"
              testId="preview-section"
              action={(
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider text-white"
                    style={{ backgroundColor: severityDef.color }}
                  >
                    {severityDef.label}
                  </span>
                  <button
                    onClick={renderPreview}
                    disabled={renderingPreview}
                    className="text-[11px] text-zinc-500 hover:text-zinc-900 flex items-center gap-1"
                    data-testid="preview-refresh-btn"
                  >
                    {renderingPreview
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <><RefreshCw className="w-3 h-3" /> Refresh</>}
                  </button>
                </div>
              )}
            >
              <iframe
                ref={previewIframeRef}
                title="email-preview"
                className="w-full h-[760px] border border-zinc-200 rounded-lg bg-zinc-50"
                data-testid="broadcast-preview-iframe"
              />
            </SectionCard>
          </div>
        </div>
      </main>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-orange-500" /> Confirm broadcast
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send <strong>"{title}"</strong> as <strong>{severityDef.label}</strong> to {' '}
              <strong>{audienceCount?.count || '?'}</strong> recipient(s) in the audience{' '}
              <strong>"{audienceDef.label}"</strong>
              {audienceDef.needsSite && mainSiteId && (
                <> for <strong>{mainSites.find((m) => m.id === mainSiteId)?.name}</strong></>
              )}.
              {showInAppBanner && (
                <span className="block mt-2 text-amber-700">
                  ⚠ An in-app banner will also appear for these users.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending} data-testid="broadcast-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={sendBroadcast}
              disabled={sending || !audienceCount?.count}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="broadcast-confirm-btn"
            >
              {sending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending...</> : 'Confirm & send'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
