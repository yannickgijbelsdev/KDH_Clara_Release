import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import {
  Mail, Shield, Flame, FileText, Tv, Users, Globe, Server,
  ChevronDown, Loader2, Check, Send, AlertCircle, Bell, BellRing,
  Clock, Zap, History, Play, Monitor,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORY_ICONS = {
  security: Shield, firewall: Flame, content: FileText, shows: Tv,
  users: Users, wordpress: Globe, system: Server,
};

const MODE_OPTIONS = [
  { id: 'realtime', label: 'Real-time', icon: Zap, desc: 'Instant per event' },
  { id: 'daily', label: 'Daily', icon: Clock, desc: 'Summary per day' },
  { id: 'both', label: 'Both', icon: BellRing, desc: 'Real-time + summary' },
];

export default function NotificationSettings({ open, onClose, inline = false, mainSites = [] }) {
  const { token } = useAuth();
  const [tab, setTab] = useState('smtp');
  const [providers, setProviders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [smtpConfig, setSmtpConfig] = useState(null);
  const [smtpForm, setSmtpForm] = useState({ provider: 'microsoft365', host: '', port: 587, use_tls: true, username: '', password: '', from_email: '', from_name: 'Clara Radio Dashboard' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [roleSettings, setRoleSettings] = useState({});
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [notifLog, setNotifLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const [systemAlert, setSystemAlert] = useState({ email: '', enabled: false, mode: 'both' });
  const [savingAlert, setSavingAlert] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!open) return;
    fetchAll();
    if (tab === 'history') fetchLog();
  }, [open, tab]);

  // When selected site changes, re-fetch roles and role-settings for that site
  useEffect(() => {
    if (!open || tab !== 'roles') return;
    fetchSiteRoles(selectedSiteId);
    fetchRoleSettings(selectedSiteId);
  }, [open, tab, selectedSiteId]);

  const fetchAll = async () => {
    try {
      const [provRes, catRes, cfgRes] = await Promise.all([
        fetch(`${API}/api/notifications/smtp-providers`, { headers }),
        fetch(`${API}/api/notifications/categories`, { headers }),
        fetch(`${API}/api/notifications/smtp-config`, { headers }),
      ]);
      if (provRes.ok) setProviders(await provRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setSmtpConfig(cfg);
        if (cfg.configured) {
          setSmtpForm(prev => ({ ...prev, provider: cfg.provider || 'custom', host: cfg.host || '', port: cfg.port || 587, use_tls: cfg.use_tls !== false, username: cfg.username || '', password: cfg.password || '', from_email: cfg.from_email || '', from_name: cfg.from_name || 'Clara Radio Dashboard' }));
        }
      }
      // Fetch system alert settings
      const alertRes = await fetch(`${API}/api/notifications/system-alert`, { headers });
      if (alertRes.ok) setSystemAlert(await alertRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSiteRoles = async (siteId) => {
    setLoadingRoles(true);
    try {
      if (siteId) {
        // Fetch roles for specific site
        const res = await fetch(`${API}/api/notifications/site-roles/${siteId}`, { headers });
        if (res.ok) setRoles(await res.json());
      } else {
        // Fetch default roles
        setRoles([
          { slug: 'admin', name: 'Admin' },
          { slug: 'presenter', name: 'Presenter' },
          { slug: 'editor', name: 'Editor' },
          { slug: 'viewer', name: 'Viewer' },
        ]);
      }
    } catch {} finally { setLoadingRoles(false); }
  };

  const fetchRoleSettings = async (siteId) => {
    try {
      const qs = siteId ? `?main_site_id=${siteId}` : '';
      const res = await fetch(`${API}/api/notifications/role-settings${qs}`, { headers });
      if (res.ok) setRoleSettings(await res.json());
      else setRoleSettings({});
    } catch { setRoleSettings({}); }
  };

  const saveSystemAlert = async () => {
    setSavingAlert(true);
    try {
      const res = await fetch(`${API}/api/notifications/system-alert`, { method: 'PUT', headers, body: JSON.stringify(systemAlert) });
      if (res.ok) toast.success('System alert settings saved');
      else toast.error('Save failed');
    } catch { toast.error('Save failed'); }
    finally { setSavingAlert(false); }
  };


  const fetchLog = async () => {
    setLoadingLog(true);
    try {
      const res = await fetch(`${API}/api/notifications/log?limit=30`, { headers });
      if (res.ok) setNotifLog(await res.json());
    } catch {} finally { setLoadingLog(false); }
  };

  const sendDailyDigest = async () => {
    setSendingDigest(true);
    try {
      const res = await fetch(`${API}/api/notifications/send-daily-digest`, { method: 'POST', headers });
      if (res.ok) toast.success('Daily digest sent');
      else toast.error('Failed to send digest');
    } catch { toast.error('Failed'); }
    finally { setSendingDigest(false); }
  };


  const selectProvider = (provId) => {
    const prov = providers.find(p => p.id === provId);
    if (prov) {
      setSmtpForm(prev => ({ ...prev, provider: provId, host: prov.host || prev.host, port: prov.port || prev.port, use_tls: prov.use_tls !== false }));
    }
    setProviderOpen(false);
  };

  const saveSMTP = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/notifications/smtp-config`, { method: 'PUT', headers, body: JSON.stringify(smtpForm) });
      if (res.ok) {
        const data = await res.json();
        setSmtpConfig(data);
        toast.success('SMTP configuration saved');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Save failed');
      }
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API}/api/notifications/smtp-test`, { method: 'POST', headers, body: JSON.stringify(smtpForm) });
      const data = await res.json();
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    } catch { toast.error('Test failed'); }
    finally { setTesting(false); }
  };

  const sendTestEmail = async () => {
    if (!testEmailAddr) { toast.error('Please enter an email address'); return; }
    setSendingTest(true);
    try {
      const res = await fetch(`${API}/api/notifications/smtp-test-email`, { method: 'POST', headers, body: JSON.stringify({ to_email: testEmailAddr }) });
      if (res.ok) toast.success('Test email sent!');
      else { const d = await res.json(); toast.error(d.detail || 'Send failed'); }
    } catch { toast.error('Send failed'); }
    finally { setSendingTest(false); }
  };

  const toggleRoleCategory = (roleSlug, catId) => {
    setRoleSettings(prev => {
      const role = prev[roleSlug] || { categories: [], mode: 'daily' };
      const cats = role.categories || [];
      const newCats = cats.includes(catId) ? cats.filter(c => c !== catId) : [...cats, catId];
      return { ...prev, [roleSlug]: { ...role, categories: newCats } };
    });
  };

  const setRoleMode = (roleSlug, mode) => {
    setRoleSettings(prev => {
      const role = prev[roleSlug] || { categories: [], mode: 'daily' };
      return { ...prev, [roleSlug]: { ...role, mode } };
    });
  };

  const saveRoleSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/notifications/role-settings`, { method: 'PUT', headers, body: JSON.stringify({ roles: roleSettings, main_site_id: selectedSiteId || '' }) });
      if (res.ok) toast.success('Role notification settings saved');
      else toast.error('Save failed');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const selectedProvider = providers.find(p => p.id === smtpForm.provider);

  if (!open) return null;

  const selectedSiteName = mainSites.find(s => s.id === selectedSiteId)?.name || 'Global (all sites)';

  const content = (
    <>
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100/70 rounded-lg p-1 mb-4">
        {[
          { id: 'smtp', label: 'SMTP Config', icon: Mail },
          { id: 'alert', label: 'System Alert', icon: AlertCircle },
          { id: 'roles', label: 'Role Notifications', icon: Users },
          { id: 'history', label: 'History', icon: History },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-zinc-200 text-zinc-700' : 'text-zinc-400 hover:text-zinc-600'}`}
            data-testid={`notif-tab-${t.id}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

        {/* SMTP Config Tab */}
        {tab === 'smtp' && (
          <div className="space-y-4">
            {/* Provider Selector */}
            <div className="space-y-2">
              <Label>Email Provider</Label>
              <div className="relative">
                <button
                  onClick={() => setProviderOpen(!providerOpen)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200 hover:border-zinc-300 text-left"
                  data-testid="smtp-provider-select"
                >
                  <div>
                    <span className="text-sm font-medium text-zinc-900">{selectedProvider?.name || 'Select provider'}</span>
                    {selectedProvider?.help_text && (
                      <p className="text-xs text-zinc-500 mt-0.5">{selectedProvider.help_text}</p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${providerOpen ? 'rotate-180' : ''}`} />
                </button>
                {providerOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-lg shadow-xl overflow-hidden">
                    {providers.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectProvider(p.id)}
                        className={`w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-200 transition-colors ${smtpForm.provider === p.id ? 'bg-zinc-100' : ''}`}
                        data-testid={`smtp-provider-${p.id}`}
                      >
                        <Mail className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-zinc-900 block">{p.name}</span>
                          <span className="text-xs text-zinc-500">{p.host}:{p.port}</span>
                        </div>
                        {smtpForm.provider === p.id && <Check className="w-4 h-4 text-orange-400 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* SMTP Fields */}
            {smtpForm.provider === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SMTP Host</Label>
                  <Input value={smtpForm.host} onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))} className="bg-zinc-50 border-zinc-200" placeholder="smtp.example.com" data-testid="smtp-host" />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input type="number" value={smtpForm.port} onChange={e => setSmtpForm(p => ({ ...p, port: parseInt(e.target.value) || 587 }))} className="bg-zinc-50 border-zinc-200" data-testid="smtp-port" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Username / Email</Label>
                <Input value={smtpForm.username} onChange={e => setSmtpForm(p => ({ ...p, username: e.target.value }))} className="bg-zinc-50 border-zinc-200" placeholder="user@example.com" data-testid="smtp-username" />
              </div>
              <div>
                <Label>Password / App Password</Label>
                <Input type="password" value={smtpForm.password} onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))} className="bg-zinc-50 border-zinc-200" placeholder="••••••••" data-testid="smtp-password" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sender Email</Label>
                <Input value={smtpForm.from_email} onChange={e => setSmtpForm(p => ({ ...p, from_email: e.target.value }))} className="bg-zinc-50 border-zinc-200" placeholder="noreply@example.com" data-testid="smtp-from-email" />
              </div>
              <div>
                <Label>Sender Name</Label>
                <Input value={smtpForm.from_name} onChange={e => setSmtpForm(p => ({ ...p, from_name: e.target.value }))} className="bg-zinc-50 border-zinc-200" placeholder="Clara Radio Dashboard" data-testid="smtp-from-name" />
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-2 pt-2">
              {smtpConfig?.configured && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <Check className="w-3 h-3" /> Configured
                </span>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={testConnection} disabled={testing} className="gap-2" data-testid="smtp-test-btn">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                Test Connection
              </Button>
              <Button onClick={saveSMTP} disabled={saving} className="gap-2" data-testid="smtp-save-btn">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </Button>
            </div>

            {/* Test Email */}
            {smtpConfig?.configured && (
              <Card className="bg-zinc-100/70 border-zinc-300">
                <CardContent className="flex items-center gap-3 p-4">
                  <Send className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  <Input
                    value={testEmailAddr}
                    onChange={e => setTestEmailAddr(e.target.value)}
                    className="bg-zinc-50 border-zinc-200 flex-1"
                    placeholder="test@example.com"
                    data-testid="test-email-input"
                  />
                  <Button variant="outline" onClick={sendTestEmail} disabled={sendingTest} className="gap-2 flex-shrink-0" data-testid="send-test-email-btn">
                    {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Test Email
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* System Alert Tab */}
        {tab === 'alert' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Configure a system-wide alert email that receives <strong className="text-zinc-900">all</strong> notifications from all sites — ideal for global administrators.
            </p>

            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-100/70 border border-zinc-300">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${systemAlert.enabled ? 'bg-emerald-500/10' : 'bg-zinc-700'}`}>
                  <Bell className={`w-5 h-5 ${systemAlert.enabled ? 'text-emerald-400' : 'text-zinc-500'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">System Alert Email</p>
                  <p className="text-xs text-zinc-500">{systemAlert.enabled ? 'Active — receiving all notifications' : 'Disabled'}</p>
                </div>
              </div>
              <button
                onClick={() => setSystemAlert(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${systemAlert.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                data-testid="system-alert-toggle"
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${systemAlert.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Email Address</Label>
                <Input
                  type="email"
                  value={systemAlert.email}
                  onChange={(e) => setSystemAlert(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="clara.global@koodh.com"
                  className="bg-zinc-50 border-zinc-200 mt-1"
                  data-testid="system-alert-email"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-400">Notification Mode</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[
                    { id: 'realtime', label: 'Real-time', icon: Zap, desc: 'Instant alerts' },
                    { id: 'daily', label: 'Daily Summary', icon: Clock, desc: 'Once per day' },
                    { id: 'both', label: 'Both', icon: BellRing, desc: 'Real-time + daily' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSystemAlert(prev => ({ ...prev, mode: m.id }))}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        systemAlert.mode === m.id
                          ? 'border-orange-500/50 bg-orange-500/10'
                          : 'border-zinc-300 bg-zinc-100/70 hover:border-zinc-300'
                      }`}
                      data-testid={`system-alert-mode-${m.id}`}
                    >
                      <m.icon className={`w-4 h-4 mb-1 ${systemAlert.mode === m.id ? 'text-orange-400' : 'text-zinc-500'}`} />
                      <p className={`text-xs font-medium ${systemAlert.mode === m.id ? 'text-orange-400' : 'text-white'}`}>{m.label}</p>
                      <p className="text-[10px] text-zinc-500">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={saveSystemAlert} disabled={savingAlert || !systemAlert.email} className="w-full gap-2" data-testid="save-system-alert-btn">
              {savingAlert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save System Alert Settings
            </Button>
          </div>
        )}

        {/* Role Notification Settings Tab */}
        {tab === 'roles' && (
          <div className="space-y-4">
            {/* Site Selector */}
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Select Site</Label>
              <div className="relative">
                <button
                  onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200 hover:border-zinc-300 text-left"
                  data-testid="site-selector"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900">{selectedSiteName}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {siteDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedSiteId(''); setSiteDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-200 transition-colors ${!selectedSiteId ? 'bg-zinc-100' : ''}`}
                      data-testid="site-option-global"
                    >
                      <Globe className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-zinc-900 block">Global (all sites)</span>
                        <span className="text-xs text-zinc-500">Default fallback settings</span>
                      </div>
                      {!selectedSiteId && <Check className="w-4 h-4 text-orange-400 ml-auto" />}
                    </button>
                    {mainSites.map(site => (
                      <button
                        key={site.id}
                        onClick={() => { setSelectedSiteId(site.id); setSiteDropdownOpen(false); }}
                        className={`w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-200 transition-colors ${selectedSiteId === site.id ? 'bg-zinc-100' : ''}`}
                        data-testid={`site-option-${site.slug}`}
                      >
                        <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${site.cloned_from ? 'bg-blue-500/10' : site.site_type === 'technical' ? 'bg-emerald-500/10' : 'bg-zinc-700'}`}>
                          {site.site_type === 'technical' ? <Monitor className="w-3.5 h-3.5 text-emerald-400" /> : <Globe className="w-3.5 h-3.5 text-zinc-400" />}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-zinc-900 block">{site.name}</span>
                          <span className="text-xs text-zinc-500">/{site.slug}</span>
                        </div>
                        {selectedSiteId === site.id && <Check className="w-4 h-4 text-orange-400 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-sm text-zinc-400">Choose per role which notifications they receive and whether real-time or as a daily summary.</p>

            {loadingRoles ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
            ) : (
              <div className="space-y-3">
                {roles.map(role => {
                  const roleCfg = roleSettings[role.slug] || { categories: [], mode: 'daily' };
                  const isExpanded = selectedRole === role.slug;
                  const activeCount = (roleCfg.categories || []).length;

                  return (
                    <Card key={role.slug} className={`bg-zinc-100/70 border-zinc-300 ${isExpanded ? 'border-orange-500/30' : ''}`}>
                      <button
                        className="w-full flex items-center justify-between p-4 text-left"
                        onClick={() => setSelectedRole(isExpanded ? null : role.slug)}
                        data-testid={`role-notif-${role.slug}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600">
                            {role.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-zinc-900">{role.name}</span>
                            <span className="text-xs text-zinc-500 ml-2">{activeCount} {activeCount !== 1 ? 'categories' : 'category'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeCount > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                              {roleCfg.mode === 'realtime' ? 'Real-time' : roleCfg.mode === 'both' ? 'Both' : 'Daily'}
                            </span>
                          )}
                          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t border-zinc-300/50">
                          {/* Mode selector */}
                          <div className="pt-3">
                            <Label className="text-xs text-zinc-400 mb-2 block">Notification Type</Label>
                            <div className="grid grid-cols-3 gap-2">
                              {MODE_OPTIONS.map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => setRoleMode(role.slug, m.id)}
                                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                                    roleCfg.mode === m.id
                                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                      : 'bg-zinc-50 border-zinc-200 text-zinc-400 hover:border-zinc-300'
                                  }`}
                                  data-testid={`role-mode-${role.slug}-${m.id}`}
                                >
                                  <m.icon className="w-4 h-4" />
                                  <span className="text-xs font-medium">{m.label}</span>
                                  <span className="text-[10px] text-zinc-500">{m.desc}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Category toggles */}
                          <div>
                            <Label className="text-xs text-zinc-400 mb-2 block">Categories</Label>
                            <div className="space-y-1">
                              {categories.map(cat => {
                                const Icon = CATEGORY_ICONS[cat.id] || Bell;
                                const active = (roleCfg.categories || []).includes(cat.id);
                                return (
                                  <div key={cat.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-100/70">
                                    <div className="flex items-center gap-2.5">
                                      <Icon className={`w-4 h-4 ${active ? 'text-orange-400' : 'text-zinc-500'}`} />
                                      <div>
                                        <span className="text-sm text-zinc-700">{cat.name}</span>
                                        <p className="text-xs text-zinc-500">{cat.description}</p>
                                      </div>
                                    </div>
                                    <Switch
                                      checked={active}
                                      onCheckedChange={() => toggleRoleCategory(role.slug, cat.id)}
                                      data-testid={`role-cat-${role.slug}-${cat.id}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={saveRoleSettings} disabled={saving} className="gap-2" data-testid="save-role-settings-btn">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Settings
              </Button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">Recent notification events and delivery status.</p>
              <Button variant="outline" onClick={sendDailyDigest} disabled={sendingDigest} className="gap-2 text-xs" data-testid="send-digest-btn">
                {sendingDigest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Send Daily Digest Now
              </Button>
            </div>

            {loadingLog ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
            ) : notifLog.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">No notification events yet</div>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {notifLog.map((evt, i) => {
                  const Icon = CATEGORY_ICONS[evt.category] || Bell;
                  const sentCount = (evt.emails_sent || []).length;
                  const failedCount = (evt.emails_failed || []).length;
                  const attemptedCount = (evt.emails_attempted || []).length;
                  return (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-zinc-50/30 hover:bg-zinc-100/70" data-testid={`notif-log-${i}`}>
                      <Icon className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-zinc-900 truncate">{evt.event_type}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-400">{evt.category}</span>
                          {sentCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {sentCount} sent
                            </span>
                          )}
                          {failedCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20" data-testid={`notif-log-${i}-failed`}>
                              {failedCount} failed
                            </span>
                          )}
                          {attemptedCount === 0 && sentCount === 0 && failedCount === 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
                              no recipients
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{evt.details}</p>
                        {(evt.emails_sent?.length > 0 || evt.emails_failed?.length > 0) && (
                          <div className="mt-1 space-y-0.5">
                            {evt.emails_sent?.map((em, j) => (
                              <span key={`s-${j}`} className="text-[10px] text-emerald-500/70 mr-2">{em}</span>
                            ))}
                            {evt.emails_failed?.map((em, j) => (
                              <span key={`f-${j}`} className="text-[10px] text-red-400/70 mr-2 line-through">{em}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-zinc-600">{new Date(evt.timestamp).toLocaleString()}</span>
                          {evt.actor_name && <span className="text-[10px] text-zinc-600">by {evt.actor_name}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </>
    );

  // Inline mode: render content directly without dialog wrapper
  if (inline) {
    return <div data-testid="notification-settings">{content}</div>;
  }

  // Dialog mode
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-zinc-200 max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="notification-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bell className="w-5 h-5 text-orange-400" />
            Email Notifications
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
