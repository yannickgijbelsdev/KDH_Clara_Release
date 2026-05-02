import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent } from '../../components/ui/card';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Send, ArrowLeft, Eye, Loader2, AlertTriangle, Wrench, Info, CheckCircle2, Users, Globe,
  Palette, Image as ImageIcon, RefreshCw, Mail,
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

export default function NotificationBroadcast() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [mainSites, setMainSites] = useState([]);
  const [loading, setLoading] = useState(true);

  // Compose state
  const [title, setTitle] = useState('Geplande onderhoud');
  const [body, setBody] = useState('<p>Beste gebruikers,</p>\n<p>We voeren geplande onderhoud uit. Tijdens dit venster kan de dienst tijdelijk niet beschikbaar zijn.</p>\n<p><strong>Wanneer:</strong> vannacht tussen 02:00 en 04:00 (CET)</p>');
  const [severity, setSeverity] = useState('maintenance');
  const [audience, setAudience] = useState('system_admins');
  const [mainSiteId, setMainSiteId] = useState('');
  const [showInAppBanner, setShowInAppBanner] = useState(true);
  const [bannerEndsAt, setBannerEndsAt] = useState('');

  // Layout state
  const [layout, setLayout] = useState({
    show_main_site_logo: true,
    show_clara_logo: true,
    banner_gradient_from: '#7c1ac8',
    banner_gradient_to: '#dd0c51',
    footer_text: 'Je ontvangt dit omdat je lid bent van deze omgeving.',
  });
  const [savingLayout, setSavingLayout] = useState(false);

  // Preview state
  const [previewHtml, setPreviewHtml] = useState('');
  const [audienceCount, setAudienceCount] = useState(null);
  const [renderingPreview, setRenderingPreview] = useState(false);
  const previewIframeRef = useRef(null);
  const previewTimerRef = useRef(null);

  // Send state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const audienceDef = AUDIENCES.find((a) => a.id === audience) || AUDIENCES[0];
  const severityDef = SEVERITIES.find((s) => s.id === severity) || SEVERITIES[0];

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const ms = await axios.get(`${API}/api/main-sites`, { headers });
        setMainSites(ms.data || []);
      } catch (e) {
        // ignore
      }
      try {
        const lr = await axios.get(`${API}/api/notifications/layout`, { headers });
        setLayout((l) => ({ ...l, ...(lr.data || {}) }));
      } catch (e) {
        // ignore
      }
      setLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load layout when main site changes
  useEffect(() => {
    if (loading) return;
    const loadLayout = async () => {
      try {
        const lr = await axios.get(`${API}/api/notifications/layout`, {
          headers, params: { main_site_id: mainSiteId || '' },
        });
        setLayout((l) => ({ ...l, ...(lr.data || {}) }));
      } catch (e) {
        // ignore
      }
    };
    loadLayout();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSiteId]);

  // Live preview render (debounced)
  const renderPreview = useCallback(async () => {
    setRenderingPreview(true);
    try {
      const r = await axios.post(`${API}/api/notifications/broadcast/preview`, {
        title, body, severity, main_site_id: mainSiteId, layout_override: layout,
      }, { headers });
      setPreviewHtml(r.data?.html || '');
    } catch (e) {
      // silent
    } finally {
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

  // Audience count (debounced)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(async () => {
      try {
        const r = await axios.post(`${API}/api/notifications/broadcast/audience-count`, {
          audience, main_site_id: mainSiteId,
        }, { headers });
        setAudienceCount(r.data);
      } catch (e) {
        setAudienceCount(null);
      }
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, mainSiteId, loading]);

  // Inject preview HTML into iframe
  useEffect(() => {
    if (!previewIframeRef.current || !previewHtml) return;
    const doc = previewIframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#f4f4f5;}</style></head><body>${previewHtml}</body></html>`);
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
      const r = await axios.post(`${API}/api/notifications/broadcast`, {
        title, body, severity, audience, main_site_id: mainSiteId,
        show_in_app_banner: false, test_to_self: true,
      }, { headers });
      toast.success(`Test sent to ${user?.email}`, { description: `Broadcast id ${r.data?.broadcast_id?.slice(0, 8)}...` });
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
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="broadcast-back-btn">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="h-5 w-px bg-zinc-200" />
            <div>
              <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-[#dd0c51]" /> Send broadcast & preview
              </h1>
              <p className="text-xs text-zinc-500">Compose announcements, alerts, and maintenance messages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={sendTest} disabled={sendingTest} data-testid="broadcast-test-btn">
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
              Test to me
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              className="bg-[#dd0c51] hover:bg-[#b50942] text-white"
              data-testid="broadcast-send-btn"
            >
              <Send className="w-4 h-4 mr-2" /> Send broadcast
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose column */}
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 block">Severity</Label>
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
                          active ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm' : 'border-zinc-200 hover:border-zinc-300 bg-white'
                        }`}
                        style={active ? { backgroundColor: s.color, borderColor: s.color } : {}}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs font-semibold">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="bcast-title" className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block">Title</Label>
                <Input
                  id="bcast-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Planned maintenance tonight"
                  data-testid="broadcast-title-input"
                />
              </div>

              <div>
                <Label htmlFor="bcast-body" className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block">
                  Body <span className="text-zinc-400 font-normal normal-case">(HTML allowed)</span>
                </Label>
                <Textarea
                  id="bcast-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  className="font-mono text-sm"
                  placeholder="<p>Write your announcement here...</p>"
                  data-testid="broadcast-body-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Audience */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Audience
                </Label>
                {audienceCount && (
                  <span className="text-xs font-semibold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-full">
                    {audienceCount.count} recipient{audienceCount.count === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2">
                {AUDIENCES.map((a) => {
                  const active = audience === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAudience(a.id)}
                      data-testid={`audience-${a.id}-btn`}
                      className={`text-left px-4 py-3 rounded-lg border transition-all ${
                        active ? 'border-[#dd0c51] bg-rose-50/40' : 'border-zinc-200 hover:border-zinc-300 bg-white'
                      }`}
                    >
                      <p className="text-sm font-semibold text-zinc-900">{a.label}</p>
                      <p className="text-xs text-zinc-500">{a.desc}</p>
                    </button>
                  );
                })}
              </div>

              {audienceDef.needsSite && (
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block flex items-center gap-1.5">
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
                    <p className="text-[11px] text-amber-600 mt-1.5">⚠ This audience requires a site. Select one to compute recipients.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* In-app banner */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Show in-app banner</Label>
                  <p className="text-xs text-zinc-500">Pin a banner at the top of the dashboard for the audience.</p>
                </div>
                <Switch
                  checked={showInAppBanner}
                  onCheckedChange={setShowInAppBanner}
                  data-testid="broadcast-banner-toggle"
                />
              </div>
              {showInAppBanner && (
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block">Banner expires (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={bannerEndsAt}
                    onChange={(e) => setBannerEndsAt(e.target.value)}
                    data-testid="broadcast-expires-input"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Layout customization */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#7c1ac8]" /> Email layout
                </Label>
                <Button size="sm" variant="outline" onClick={saveLayout} disabled={savingLayout} data-testid="layout-save-btn">
                  {savingLayout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save layout'}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Show site logo</Label>
                <Switch
                  checked={!!layout.show_main_site_logo}
                  onCheckedChange={(v) => setLayout((l) => ({ ...l, show_main_site_logo: v }))}
                  data-testid="layout-site-logo-toggle"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Show Koodh Clara logo</Label>
                <Switch
                  checked={!!layout.show_clara_logo}
                  onCheckedChange={(v) => setLayout((l) => ({ ...l, show_clara_logo: v }))}
                  data-testid="layout-clara-logo-toggle"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Banner from</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={layout.banner_gradient_from}
                      onChange={(e) => setLayout((l) => ({ ...l, banner_gradient_from: e.target.value }))}
                      className="w-10 h-9 rounded border border-zinc-200 cursor-pointer"
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
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Banner to</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={layout.banner_gradient_to}
                      onChange={(e) => setLayout((l) => ({ ...l, banner_gradient_to: e.target.value }))}
                      className="w-10 h-9 rounded border border-zinc-200 cursor-pointer"
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
                <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Footer text</Label>
                <Input
                  value={layout.footer_text}
                  onChange={(e) => setLayout((l) => ({ ...l, footer_text: e.target.value }))}
                  data-testid="layout-footer-input"
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                Layout is saved for <strong>{mainSiteId ? mainSites.find((m) => m.id === mainSiteId)?.name : 'Global'}</strong>. It applies to broadcasts and emails sent for this scope.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Live preview column */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="lg:sticky lg:top-[88px] h-fit"
        >
          <Card className="overflow-hidden">
            <div className="bg-zinc-900 text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span className="text-sm font-semibold">Live preview</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ backgroundColor: severityDef.color }}
                >
                  {severityDef.label}
                </span>
              </div>
              {renderingPreview ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : (
                <button
                  onClick={renderPreview}
                  className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
                  data-testid="preview-refresh-btn"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              )}
            </div>
            <iframe
              ref={previewIframeRef}
              title="email-preview"
              className="w-full h-[760px] border-0 bg-zinc-100"
              data-testid="broadcast-preview-iframe"
            />
          </Card>
        </motion.div>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-[#dd0c51]" /> Confirm broadcast
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
              className="bg-[#dd0c51] hover:bg-[#b50942] text-white"
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
