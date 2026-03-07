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
  Clock, Zap,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORY_ICONS = {
  security: Shield, firewall: Flame, content: FileText, shows: Tv,
  users: Users, wordpress: Globe, system: Server,
};

const MODE_OPTIONS = [
  { id: 'realtime', label: 'Real-time', icon: Zap, desc: 'Direct bij elke event' },
  { id: 'daily', label: 'Dagelijks', icon: Clock, desc: 'Samenvatting per dag' },
  { id: 'both', label: 'Beide', icon: BellRing, desc: 'Real-time + samenvatting' },
];

export default function NotificationSettings({ open, onClose }) {
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

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!open) return;
    fetchAll();
  }, [open]);

  const fetchAll = async () => {
    try {
      const [provRes, catRes, cfgRes, roleRes, rolesListRes] = await Promise.all([
        fetch(`${API}/api/notifications/smtp-providers`, { headers }),
        fetch(`${API}/api/notifications/categories`, { headers }),
        fetch(`${API}/api/notifications/smtp-config`, { headers }),
        fetch(`${API}/api/notifications/role-settings`, { headers }),
        fetchRoles(),
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
      if (roleRes.ok) setRoleSettings(await roleRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      const msRes = await fetch(`${API}/api/main-sites`, { headers });
      if (!msRes.ok) return;
      const sites = await msRes.json();
      const allRoles = new Map();
      allRoles.set('admin', { slug: 'admin', name: 'Admin' });
      allRoles.set('presenter', { slug: 'presenter', name: 'Presenter' });
      allRoles.set('editor', { slug: 'editor', name: 'Editor' });
      allRoles.set('viewer', { slug: 'viewer', name: 'Viewer' });
      for (const site of sites.slice(0, 5)) {
        try {
          const rRes = await fetch(`${API}/api/roles/${site.id}/list`, { headers });
          if (rRes.ok) {
            const rolesList = await rRes.json();
            for (const r of rolesList) {
              if (!allRoles.has(r.slug)) allRoles.set(r.slug, r);
            }
          }
        } catch {}
      }
      setRoles(Array.from(allRoles.values()));
    } catch {} finally {
      setLoadingRoles(false);
    }
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
        toast.success('SMTP configuratie opgeslagen');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Opslaan mislukt');
      }
    } catch { toast.error('Opslaan mislukt'); }
    finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API}/api/notifications/smtp-test`, { method: 'POST', headers, body: JSON.stringify(smtpForm) });
      const data = await res.json();
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    } catch { toast.error('Test mislukt'); }
    finally { setTesting(false); }
  };

  const sendTestEmail = async () => {
    if (!testEmailAddr) { toast.error('Vul een e-mailadres in'); return; }
    setSendingTest(true);
    try {
      const res = await fetch(`${API}/api/notifications/smtp-test-email`, { method: 'POST', headers, body: JSON.stringify({ to_email: testEmailAddr }) });
      if (res.ok) toast.success('Test e-mail verstuurd!');
      else { const d = await res.json(); toast.error(d.detail || 'Versturen mislukt'); }
    } catch { toast.error('Versturen mislukt'); }
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
      const res = await fetch(`${API}/api/notifications/role-settings`, { method: 'PUT', headers, body: JSON.stringify({ roles: roleSettings }) });
      if (res.ok) toast.success('Rol meldingen opgeslagen');
      else toast.error('Opslaan mislukt');
    } catch { toast.error('Opslaan mislukt'); }
    finally { setSaving(false); }
  };

  const selectedProvider = providers.find(p => p.id === smtpForm.provider);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="notification-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bell className="w-5 h-5 text-orange-400" />
            E-mail Meldingen
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 mb-4">
          {[
            { id: 'smtp', label: 'SMTP Config', icon: Mail },
            { id: 'roles', label: 'Rol Meldingen', icon: Users },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
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
              <Label>E-mail Provider</Label>
              <div className="relative">
                <button
                  onClick={() => setProviderOpen(!providerOpen)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-left"
                  data-testid="smtp-provider-select"
                >
                  <div>
                    <span className="text-sm font-medium text-white">{selectedProvider?.name || 'Kies provider'}</span>
                    {selectedProvider?.help_text && (
                      <p className="text-xs text-zinc-500 mt-0.5">{selectedProvider.help_text}</p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${providerOpen ? 'rotate-180' : ''}`} />
                </button>
                {providerOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                    {providers.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectProvider(p.id)}
                        className={`w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-700 transition-colors ${smtpForm.provider === p.id ? 'bg-zinc-700/50' : ''}`}
                        data-testid={`smtp-provider-${p.id}`}
                      >
                        <Mail className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-white block">{p.name}</span>
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
                  <Input value={smtpForm.host} onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))} className="bg-zinc-800 border-zinc-700" placeholder="smtp.example.com" data-testid="smtp-host" />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input type="number" value={smtpForm.port} onChange={e => setSmtpForm(p => ({ ...p, port: parseInt(e.target.value) || 587 }))} className="bg-zinc-800 border-zinc-700" data-testid="smtp-port" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gebruikersnaam / E-mail</Label>
                <Input value={smtpForm.username} onChange={e => setSmtpForm(p => ({ ...p, username: e.target.value }))} className="bg-zinc-800 border-zinc-700" placeholder="user@example.com" data-testid="smtp-username" />
              </div>
              <div>
                <Label>Wachtwoord / App Password</Label>
                <Input type="password" value={smtpForm.password} onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))} className="bg-zinc-800 border-zinc-700" placeholder="••••••••" data-testid="smtp-password" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Afzender E-mail</Label>
                <Input value={smtpForm.from_email} onChange={e => setSmtpForm(p => ({ ...p, from_email: e.target.value }))} className="bg-zinc-800 border-zinc-700" placeholder="noreply@example.com" data-testid="smtp-from-email" />
              </div>
              <div>
                <Label>Afzender Naam</Label>
                <Input value={smtpForm.from_name} onChange={e => setSmtpForm(p => ({ ...p, from_name: e.target.value }))} className="bg-zinc-800 border-zinc-700" placeholder="Clara Radio Dashboard" data-testid="smtp-from-name" />
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-2 pt-2">
              {smtpConfig?.configured && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <Check className="w-3 h-3" /> Geconfigureerd
                </span>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={testConnection} disabled={testing} className="gap-2" data-testid="smtp-test-btn">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                Test Verbinding
              </Button>
              <Button onClick={saveSMTP} disabled={saving} className="gap-2" data-testid="smtp-save-btn">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Opslaan
              </Button>
            </div>

            {/* Test Email */}
            {smtpConfig?.configured && (
              <Card className="bg-zinc-800/50 border-zinc-700">
                <CardContent className="flex items-center gap-3 p-4">
                  <Send className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  <Input
                    value={testEmailAddr}
                    onChange={e => setTestEmailAddr(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 flex-1"
                    placeholder="test@example.com"
                    data-testid="test-email-input"
                  />
                  <Button variant="outline" onClick={sendTestEmail} disabled={sendingTest} className="gap-2 flex-shrink-0" data-testid="send-test-email-btn">
                    {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Test E-mail
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Role Notification Settings Tab */}
        {tab === 'roles' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Kies per rol welke meldingen ze ontvangen en of dat real-time of als dagelijkse samenvatting is.</p>

            {loadingRoles ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
            ) : (
              <div className="space-y-3">
                {roles.map(role => {
                  const roleCfg = roleSettings[role.slug] || { categories: [], mode: 'daily' };
                  const isExpanded = selectedRole === role.slug;
                  const activeCount = (roleCfg.categories || []).length;

                  return (
                    <Card key={role.slug} className={`bg-zinc-800/50 border-zinc-700 ${isExpanded ? 'border-orange-500/30' : ''}`}>
                      <button
                        className="w-full flex items-center justify-between p-4 text-left"
                        onClick={() => setSelectedRole(isExpanded ? null : role.slug)}
                        data-testid={`role-notif-${role.slug}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                            {role.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-white">{role.name}</span>
                            <span className="text-xs text-zinc-500 ml-2">{activeCount} categorie{activeCount !== 1 ? 'ën' : ''}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeCount > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                              {roleCfg.mode === 'realtime' ? 'Real-time' : roleCfg.mode === 'both' ? 'Beide' : 'Dagelijks'}
                            </span>
                          )}
                          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t border-zinc-700/50">
                          {/* Mode selector */}
                          <div className="pt-3">
                            <Label className="text-xs text-zinc-400 mb-2 block">Meldingstype</Label>
                            <div className="grid grid-cols-3 gap-2">
                              {MODE_OPTIONS.map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => setRoleMode(role.slug, m.id)}
                                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                                    roleCfg.mode === m.id
                                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
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
                            <Label className="text-xs text-zinc-400 mb-2 block">Categorieën</Label>
                            <div className="space-y-1">
                              {categories.map(cat => {
                                const Icon = CATEGORY_ICONS[cat.id] || Bell;
                                const active = (roleCfg.categories || []).includes(cat.id);
                                return (
                                  <div key={cat.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800/50">
                                    <div className="flex items-center gap-2.5">
                                      <Icon className={`w-4 h-4 ${active ? 'text-orange-400' : 'text-zinc-500'}`} />
                                      <div>
                                        <span className="text-sm text-white">{cat.name}</span>
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
                Instellingen Opslaan
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
