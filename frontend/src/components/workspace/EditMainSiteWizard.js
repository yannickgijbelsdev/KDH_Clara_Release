import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
  Upload, Check, ChevronRight, Globe, Users, CreditCard,
  Shield, UserPlus, Trash2, Crown, Pencil, Eye, Mic, Sparkles,
  Plus, Music, ExternalLink, Zap, Loader2, X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const BASE_STEPS = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'stations', label: 'Stations', icon: Music },
  { id: 'wordpress', label: 'WordPress', icon: ExternalLink },
  { id: 'license', label: 'License', icon: CreditCard },
  { id: 'admin', label: 'Admin', icon: Users },
];

const STATION_COLORS = ['#dd0c51', '#8b5cf6', '#3b82f6', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#eab308'];
const STREAM_TYPES = [
  { value: 'shoutcast_v1', label: 'Shoutcast v1' },
  { value: 'shoutcast_v2', label: 'Shoutcast v2' },
  { value: 'icecast', label: 'Icecast' },
];

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', icon: Crown, color: 'text-orange-500 bg-orange-50', desc: 'Full access to all features' },
  { value: 'editor', label: 'Editor', icon: Pencil, color: 'text-blue-500 bg-blue-50', desc: 'Can edit content and shows' },
  { value: 'presenter', label: 'Presenter', icon: Mic, color: 'text-violet-500 bg-violet-50', desc: 'Can manage their own shows' },
  { value: 'viewer', label: 'Viewer', icon: Eye, color: 'text-zinc-500 bg-zinc-100', desc: 'Read-only access' },
];

export default function EditMainSiteWizard({ open, onClose, site, onUpdated }) {
  const { token, user } = useAuth();
  const isSystemAdmin = user?.is_system_admin === true;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [uploadError, setUploadError] = useState('');

  // General
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [require2fa, setRequire2fa] = useState(false);
  const [claraEnterprise, setClaraEnterprise] = useState(false);

  // License
  const [packages, setPackages] = useState([]);
  const [currentLicense, setCurrentLicense] = useState(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');

  // Admin
  const [siteUsers, setSiteUsers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('editor');

  // RDS Stations
  const [rdsStations, setRdsStations] = useState([]);
  const [stationsSaving, setStationsSaving] = useState(false);

  // WordPress
  const [wpSites, setWpSites] = useState([]);
  const [wpEditing, setWpEditing] = useState(null); // index or 'new'
  const [wpForm, setWpForm] = useState({ name: '', wp_base_url: '', username: '', app_password: '', default_post_type: 'post', default_publish_status: 'draft' });
  const [wpSaving, setWpSaving] = useState(false);
  const [wpTestLoading, setWpTestLoading] = useState(null); // index being tested
  const [wpTestResult, setWpTestResult] = useState(null);
  const [rdsTestLoading, setRdsTestLoading] = useState(null); // station index
  const [rdsTestResult, setRdsTestResult] = useState(null);

  const isRadioType = site?.site_type === 'radio';
  const hasWordPress = site?.site_type === 'radio' || site?.site_type === 'external_host';
  const STEPS = BASE_STEPS.filter(s =>
    (s.id !== 'stations' || isRadioType) &&
    (s.id !== 'wordpress' || hasWordPress)
  );

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Load site data when opened
  useEffect(() => {
    if (!open || !site) return;
    setStep(0);
    setName(site.name || '');
    setSlug(site.slug || '');
    setLogoUrl(site.logo_url || '');
    setRequire2fa(site.require_2fa || false);
    setClaraEnterprise(site.clara_enterprise || false);
  }, [open, site]);

  // Load license + users when step changes
  const loadLicenseData = useCallback(async () => {
    if (!site?.id) return;
    try {
      const [pkgRes, licRes] = await Promise.all([
        fetch(`${API}/api/licenses/packages`, { headers }),
        fetch(`${API}/api/licenses/check/${site.id}`, { headers }),
      ]);
      if (pkgRes.ok) setPackages(await pkgRes.json());
      if (licRes.ok) {
        const data = await licRes.json();
        setCurrentLicense(data);
        if (data.assignment?.package_id) setSelectedPackageId(data.assignment.package_id);
        if (data.assignment?.billing_cycle) setBillingCycle(data.assignment.billing_cycle);
      }
    } catch (e) { console.error(e); }
  }, [site?.id, token]);

  const loadUserData = useCallback(async () => {
    if (!site?.id) return;
    try {
      const [usersRes, availRes] = await Promise.all([
        fetch(`${API}/api/main-sites/${site.id}/users`, { headers }),
        fetch(`${API}/api/main-sites/${site.id}/available-users`, { headers }),
      ]);
      if (usersRes.ok) setSiteUsers(await usersRes.json());
      if (availRes.ok) setAvailableUsers(await availRes.json());
    } catch (e) { console.error(e); }
  }, [site?.id, token]);

  const loadStations = useCallback(async () => {
    if (!site?.id) return;
    try {
      const res = await fetch(`${API}/api/rds-stations/${site.id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setRdsStations(data.stations || []);
      }
    } catch (e) { console.error(e); }
  }, [site?.id, token]);

  const loadWpSites = useCallback(async () => {
    if (!site?.id) return;
    try {
      const res = await fetch(`${API}/api/wordpress/sites`, {
        headers: { ...headers, 'X-Main-Site-Id': site.id },
      });
      if (res.ok) {
        const data = await res.json();
        setWpSites(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error(e); }
  }, [site?.id, token]);

  useEffect(() => {
    const stepId = STEPS[step]?.id;
    if (stepId === 'license' && open) loadLicenseData();
    if (stepId === 'admin' && open) loadUserData();
    if (stepId === 'stations' && open) loadStations();
    if (stepId === 'wordpress' && open) loadWpSites();
  }, [step, open, loadLicenseData, loadUserData, loadStations, loadWpSites, STEPS]);

  // Handlers
  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/main-sites/${site.id}`, {
        method: 'PUT', headers, body: JSON.stringify({ name, slug, logo_url: logoUrl, require_2fa: require2fa, clara_enterprise: claraEnterprise }),
      });
      onUpdated?.();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleLogoUpload = async (file) => {
    setUploadError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API}/api/main-sites/${site.id}/logo`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url);
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.detail || `Upload failed (${res.status})`);
      }
    } catch (e) {
      setUploadError('Network error - could not upload');
    }
  };

  const handleAssignLicense = async () => {
    if (!selectedPackageId) return;
    setSaving(true);
    try {
      if (currentLicense?.assignment) {
        await fetch(`${API}/api/licenses/assignments/${currentLicense.assignment.id}`, {
          method: 'PUT', headers, body: JSON.stringify({ package_id: selectedPackageId, billing_cycle: billingCycle }),
        });
      } else {
        await fetch(`${API}/api/licenses/assignments`, {
          method: 'POST', headers, body: JSON.stringify({ main_site_id: site.id, package_id: selectedPackageId, billing_cycle: billingCycle }),
        });
      }
      await loadLicenseData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleAddUser = async () => {
    if (!addUserId) return;
    setSaving(true);
    try {
      await fetch(`${API}/api/main-sites/${site.id}/users`, {
        method: 'POST', headers, body: JSON.stringify({ user_id: addUserId, role: addRole }),
      });
      setAddUserId('');
      await loadUserData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleRemoveUser = async (userId) => {
    try {
      await fetch(`${API}/api/main-sites/${site.id}/users/${userId}`, {
        method: 'DELETE', headers,
      });
      await loadUserData();
    } catch (e) { console.error(e); }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await fetch(`${API}/api/main-sites/${site.id}/users/${userId}`, {
        method: 'PUT', headers, body: JSON.stringify({ role: newRole }),
      });
      await loadUserData();
    } catch (e) { console.error(e); }
  };

  const addStation = () => {
    const idx = rdsStations.length;
    setRdsStations(prev => [...prev, {
      name: '', code: '', stream_url: '', stream_type: 'shoutcast_v1',
      default_text: '', color: STATION_COLORS[idx % STATION_COLORS.length], order: idx,
    }]);
  };

  const updateStation = (index, field, value) => {
    setRdsStations(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const updated = { ...s, [field]: value };
      if (field === 'name') {
        updated.code = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
      }
      return updated;
    }));
  };

  const removeStation = (index) => {
    setRdsStations(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveStations = async () => {
    setStationsSaving(true);
    try {
      await fetch(`${API}/api/rds-stations/${site.id}/bulk-sync`, {
        method: 'PUT', headers, body: JSON.stringify({ stations: rdsStations }),
      });
      await loadStations();
    } catch (e) { console.error(e); }
    setStationsSaving(false);
  };

  const handleSaveWpSite = async () => {
    setWpSaving(true);
    try {
      if (wpEditing === 'new') {
        await fetch(`${API}/api/wordpress/sites`, {
          method: 'POST',
          headers: { ...headers, 'X-Main-Site-Id': site.id },
          body: JSON.stringify({ ...wpForm, is_active: true }),
        });
      } else {
        const wpSite = wpSites[wpEditing];
        await fetch(`${API}/api/wordpress/sites/${wpSite.id}`, {
          method: 'PUT',
          headers: { ...headers, 'X-Main-Site-Id': site.id },
          body: JSON.stringify(wpForm),
        });
      }
      setWpEditing(null);
      setWpForm({ name: '', wp_base_url: '', username: '', app_password: '', default_post_type: 'post', default_publish_status: 'draft' });
      await loadWpSites();
    } catch (e) { console.error(e); }
    setWpSaving(false);
  };

  const handleDeleteWpSite = async (wpSiteId) => {
    try {
      await fetch(`${API}/api/wordpress/sites/${wpSiteId}`, {
        method: 'DELETE',
        headers: { ...headers, 'X-Main-Site-Id': site.id },
      });
      await loadWpSites();
    } catch (e) { console.error(e); }
  };

  const startEditWp = (idx) => {
    const s = wpSites[idx];
    setWpForm({ name: s.name, wp_base_url: s.wp_base_url, username: s.username, app_password: '', default_post_type: s.default_post_type, default_publish_status: s.default_publish_status });
    setWpEditing(idx);
  };

  const startNewWp = () => {
    setWpForm({ name: '', wp_base_url: '', username: '', app_password: '', default_post_type: 'post', default_publish_status: 'draft' });
    setWpEditing('new');
    setWpTestResult(null);
  };

  const handleTestWpWithClara = async (idx) => {
    const ws = wpSites[idx];
    setWpTestLoading(idx);
    setWpTestResult(null);
    try {
      const res = await fetch(`${API}/api/clara-test/test-wordpress`, {
        method: 'POST', headers: { ...headers, 'X-Main-Site-Id': site.id },
        body: JSON.stringify({ name: ws.name, wp_base_url: ws.wp_base_url, username: ws.username, app_password: ws.app_password }),
      });
      if (res.ok) { setWpTestResult(await res.json()); }
      else { setWpTestResult({ status: 'error', diagnosis: 'Could not reach the test service.' }); }
    } catch { setWpTestResult({ status: 'error', diagnosis: 'Network error.' }); }
    setWpTestLoading(null);
  };

  const handleTestFormWpWithClara = async () => {
    setWpTestLoading('form');
    setWpTestResult(null);
    try {
      const res = await fetch(`${API}/api/clara-test/test-wordpress`, {
        method: 'POST', headers,
        body: JSON.stringify(wpForm),
      });
      if (res.ok) { setWpTestResult(await res.json()); }
      else { setWpTestResult({ status: 'error', diagnosis: 'Could not reach the test service.' }); }
    } catch { setWpTestResult({ status: 'error', diagnosis: 'Network error.' }); }
    setWpTestLoading(null);
  };

  const handleTestRdsWithClara = async (idx) => {
    const st = rdsStations[idx];
    setRdsTestLoading(idx);
    setRdsTestResult(null);
    try {
      const res = await fetch(`${API}/api/clara-test/test-rds-stream`, {
        method: 'POST', headers,
        body: JSON.stringify({ stream_url: st.stream_url, station_name: st.name, stream_type: st.stream_type }),
      });
      if (res.ok) { setRdsTestResult({ idx, ...(await res.json()) }); }
      else { setRdsTestResult({ idx, status: 'error', diagnosis: 'Could not reach the test service.' }); }
    } catch { setRdsTestResult({ idx, status: 'error', diagnosis: 'Network error.' }); }
    setRdsTestLoading(null);
  };

  if (!site) return null;

  const logoSrc = logoUrl?.startsWith('/') ? `${API}${logoUrl}` : logoUrl;
  const currentStepId = STEPS[step]?.id;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-xl bg-white border-zinc-200 p-0 overflow-hidden rounded-2xl shadow-2xl max-h-[90vh]" data-testid="edit-site-wizard">
        <DialogTitle className="sr-only">Edit {site?.name}</DialogTitle>
        {/* Step indicator */}
        <div className="flex items-center border-b border-zinc-100 px-6 pt-5 pb-4 gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <button key={s.id} onClick={() => setStep(i)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  active ? 'bg-zinc-900 text-white' : done ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                }`} data-testid={`edit-step-${s.id}`}>
                {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
          <div className="flex-1" />
          <span className="text-xs text-zinc-400 font-mono">/{site.slug}</span>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {/* Step 0: General */}
          {currentStepId === 'general' && (
            <motion.div key="general" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 space-y-5">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">General Settings</h3>
                <p className="text-sm text-zinc-500 mt-0.5">Basic information about this main site.</p>
              </div>

              {/* Logo */}
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <img src={logoSrc} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-zinc-200" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 text-xs">No logo</div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-zinc-50 hover:bg-white border border-zinc-200 rounded-xl text-sm text-zinc-700 font-medium transition-colors">
                    <Upload className="w-4 h-4" /> Upload logo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                  </label>
                  {logoUrl && <button onClick={() => setLogoUrl('')} className="text-xs text-red-500 hover:underline self-start">Remove</button>}
                  {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-700">Site Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-50 border-zinc-200" data-testid="edit-site-name" />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-700">URL Slug</Label>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-400 text-sm">/</span>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="bg-zinc-50 border-zinc-200 font-mono" data-testid="edit-site-slug" />
                </div>
              </div>

              {/* 2FA Enforcement Toggle */}
              <div className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Require 2FA</p>
                    <p className="text-xs text-zinc-500">All users of this site must enable two-factor authentication</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={require2fa}
                  onClick={() => setRequire2fa(!require2fa)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${require2fa ? 'bg-orange-500' : 'bg-zinc-300'}`}
                  data-testid="require-2fa-toggle"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${require2fa ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Clara Enterprise toggle — System Admin only */}
              {isSystemAdmin && (
              <div className="flex items-center justify-between p-3 bg-violet-50 rounded-xl border border-violet-100">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Clara Enterprise</p>
                    <p className="text-xs text-zinc-500">Enable Enterprise Code Assistant & Enterprise Support</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={claraEnterprise}
                  onClick={() => setClaraEnterprise(!claraEnterprise)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${claraEnterprise ? 'bg-violet-500' : 'bg-zinc-300'}`}
                  data-testid="clara-enterprise-toggle"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${claraEnterprise ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveGeneral} disabled={saving || !name} className="flex-1" data-testid="save-general-btn">
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setStep(s => s + 1)} className="gap-1">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step: Stations (radio only) */}
          {currentStepId === 'stations' && (
            <motion.div key="stations" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">RDS Stations</h3>
                <p className="text-sm text-zinc-500 mt-0.5">Configure the radio stations and their stream connections.</p>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {rdsStations.map((station, idx) => (
                  <div key={station.id || idx} className="border border-zinc-200 rounded-xl p-3 space-y-2.5 bg-white" data-testid={`edit-station-card-${idx}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: station.color }} />
                        <span className="text-sm font-semibold text-zinc-700">{station.name || `Station ${idx + 1}`}</span>
                        {station.code && <span className="text-[11px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">{station.code}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleTestRdsWithClara(idx)} disabled={rdsTestLoading === idx || !station.stream_url} className="w-7 h-7 rounded-lg flex items-center justify-center text-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-30" data-testid={`test-station-${idx}`} title="Test with Clara">
                          {rdsTestLoading === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => removeStation(idx)} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors" data-testid={`edit-remove-station-${idx}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {rdsTestResult && rdsTestResult.idx === idx && rdsTestLoading === null && (
                      <div className={`p-2.5 rounded-lg border text-xs leading-relaxed ${rdsTestResult.status === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`} data-testid={`rds-test-result-${idx}`}>
                        <div className="flex items-start gap-1.5">
                          {rdsTestResult.status === 'ok' ? <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-600 flex-shrink-0" /> : <X className="w-3.5 h-3.5 mt-0.5 text-red-500 flex-shrink-0" />}
                          <p>{rdsTestResult.diagnosis}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Name</Label>
                        <Input value={station.name} onChange={(e) => updateStation(idx, 'name', e.target.value)} placeholder="e.g. Radio MFY" className="h-8 bg-zinc-50 border-zinc-200 rounded-lg text-sm" data-testid={`edit-station-name-${idx}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Stream Type</Label>
                        <select value={station.stream_type} onChange={(e) => updateStation(idx, 'stream_type', e.target.value)} className="w-full h-8 bg-zinc-50 border border-zinc-200 rounded-lg text-sm px-2 text-zinc-700" data-testid={`edit-station-type-${idx}`}>
                          {STREAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Stream URL</Label>
                      <Input value={station.stream_url} onChange={(e) => updateStation(idx, 'stream_url', e.target.value)} placeholder="http://stream.example.com:9010/stats?sid=1" className="h-8 bg-zinc-50 border-zinc-200 rounded-lg text-sm font-mono" data-testid={`edit-station-url-${idx}`} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Default Text</Label>
                        <Input value={station.default_text} onChange={(e) => updateStation(idx, 'default_text', e.target.value)} placeholder="e.g. altijd dichtbij" className="h-8 bg-zinc-50 border-zinc-200 rounded-lg text-sm" data-testid={`edit-station-default-${idx}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Color</Label>
                        <div className="flex items-center gap-1 h-8">
                          {STATION_COLORS.map(c => (
                            <button key={c} onClick={() => updateStation(idx, 'color', c)}
                              className={`w-5 h-5 rounded-full transition-all ${station.color === c ? 'ring-2 ring-offset-1 ring-zinc-900 scale-110' : 'hover:scale-110'}`}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addStation} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors" data-testid="edit-add-station-btn">
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add Station</span>
              </button>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">Back</Button>
                <Button onClick={handleSaveStations} disabled={stationsSaving} className="flex-1" data-testid="save-stations-btn">
                  {stationsSaving ? 'Saving...' : 'Save Stations'}
                </Button>
                <Button variant="outline" onClick={() => setStep(s => s + 1)} className="gap-1">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step: WordPress */}
          {currentStepId === 'wordpress' && (
            <motion.div key="wordpress" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">WordPress Connections</h3>
                <p className="text-sm text-zinc-500 mt-0.5">Manage WordPress site connections for publishing content.</p>
              </div>

              {wpEditing !== null ? (
                <div className="border border-zinc-200 rounded-xl p-4 space-y-3 bg-white">
                  <h4 className="text-sm font-semibold text-zinc-700">{wpEditing === 'new' ? 'New Connection' : 'Edit Connection'}</h4>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Site Name</Label>
                    <Input value={wpForm.name} onChange={(e) => setWpForm(f => ({...f, name: e.target.value}))} placeholder="e.g. My WordPress Site" className="h-9 bg-zinc-50 border-zinc-200 rounded-lg text-sm" data-testid="edit-wp-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">WordPress URL</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-2 w-4 h-4 text-zinc-400" />
                      <Input value={wpForm.wp_base_url} onChange={(e) => setWpForm(f => ({...f, wp_base_url: e.target.value}))} placeholder="https://example.com" className="h-9 bg-zinc-50 border-zinc-200 rounded-lg text-sm pl-10" data-testid="edit-wp-url" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Username</Label>
                      <Input value={wpForm.username} onChange={(e) => setWpForm(f => ({...f, username: e.target.value}))} placeholder="wp-service-account" className="h-9 bg-zinc-50 border-zinc-200 rounded-lg text-sm" data-testid="edit-wp-user" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Application Password</Label>
                      <Input type="password" value={wpForm.app_password} onChange={(e) => setWpForm(f => ({...f, app_password: e.target.value}))} placeholder={wpEditing === 'new' ? 'xxxx xxxx xxxx' : '(unchanged)'} className="h-9 bg-zinc-50 border-zinc-200 rounded-lg text-sm" data-testid="edit-wp-pass" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Post Type</Label>
                      <select value={wpForm.default_post_type} onChange={(e) => setWpForm(f => ({...f, default_post_type: e.target.value}))} className="w-full h-9 bg-zinc-50 border border-zinc-200 rounded-lg text-sm px-2 text-zinc-700">
                        <option value="post">Post</option>
                        <option value="page">Page</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Default Status</Label>
                      <select value={wpForm.default_publish_status} onChange={(e) => setWpForm(f => ({...f, default_publish_status: e.target.value}))} className="w-full h-9 bg-zinc-50 border border-zinc-200 rounded-lg text-sm px-2 text-zinc-700">
                        <option value="draft">Draft</option>
                        <option value="publish">Publish</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={() => { setWpEditing(null); setWpTestResult(null); }} className="flex-1">Cancel</Button>
                    <button onClick={handleTestFormWpWithClara} disabled={wpTestLoading === 'form' || !wpForm.wp_base_url || !wpForm.username || !wpForm.app_password} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-medium hover:from-violet-600 hover:to-indigo-600 transition-all disabled:opacity-40" data-testid="clara-test-wp-form-btn">
                      {wpTestLoading === 'form' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Test
                    </button>
                    <Button onClick={handleSaveWpSite} disabled={wpSaving || !wpForm.wp_base_url || !wpForm.username} className="flex-1" data-testid="save-wp-btn">
                      {wpSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                  {wpTestResult && wpTestLoading === null && (
                    <div className={`mt-2 p-2.5 rounded-lg border text-xs leading-relaxed ${wpTestResult.status === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`} data-testid="wp-form-test-result">
                      <div className="flex items-start gap-1.5">
                        {wpTestResult.status === 'ok' ? <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-600 flex-shrink-0" /> : <X className="w-3.5 h-3.5 mt-0.5 text-red-500 flex-shrink-0" />}
                        <p>{wpTestResult.diagnosis}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {wpSites.length > 0 ? (
                    <div className="space-y-2">
                      {wpSites.map((ws, idx) => (
                        <div key={ws.id}>
                          <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 bg-white" data-testid={`wp-site-card-${idx}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ws.is_active ? 'bg-green-500' : 'bg-zinc-300'}`} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-800 truncate">{ws.name}</p>
                                <p className="text-xs text-zinc-400 truncate">{ws.wp_base_url}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => handleTestWpWithClara(idx)} disabled={wpTestLoading === idx} className="w-7 h-7 rounded-lg flex items-center justify-center text-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" data-testid={`test-wp-${idx}`} title="Test with Clara">
                                {wpTestLoading === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => startEditWp(idx)} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors" data-testid={`edit-wp-${idx}`}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteWpSite(ws.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors" data-testid={`delete-wp-${idx}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {wpTestResult && wpTestLoading === null && wpTestResult.status && (
                            <div className={`mt-1 p-2.5 rounded-lg border text-xs leading-relaxed ${wpTestResult.status === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`} data-testid={`wp-test-result-${idx}`}>
                              <div className="flex items-start gap-1.5">
                                {wpTestResult.status === 'ok' ? <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-600 flex-shrink-0" /> : <X className="w-3.5 h-3.5 mt-0.5 text-red-500 flex-shrink-0" />}
                                <p>{wpTestResult.diagnosis}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 italic">No WordPress connections configured.</p>
                  )}
                  <button onClick={startNewWp} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors" data-testid="add-wp-connection-btn">
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">Add WordPress Connection</span>
                  </button>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">Back</Button>
                <Button variant="outline" onClick={() => setStep(s => s + 1)} className="gap-1 flex-1">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          )}


          {/* Step: License */}
          {currentStepId === 'license' && (
            <motion.div key="license" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 space-y-5">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">License</h3>
                <p className="text-sm text-zinc-500 mt-0.5">Assign or change the license package for this site.</p>
              </div>

              {/* Current license */}
              {currentLicense?.package && (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-emerald-800">{currentLicense.package.name}</div>
                    <div className="text-xs text-emerald-600">{currentLicense.assignment?.billing_cycle} &middot; {currentLicense.assignment?.status}</div>
                  </div>
                  <Check className="w-4 h-4 text-emerald-500" />
                </div>
              )}

              {/* Package selection */}
              <div className="space-y-2">
                <Label className="text-zinc-700">Select Package</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {packages.filter(p => p.is_active).map(pkg => (
                    <button key={pkg.id} onClick={() => setSelectedPackageId(pkg.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        selectedPackageId === pkg.id ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-300' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300'
                      }`} data-testid={`license-pkg-${pkg.slug || pkg.id}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedPackageId === pkg.id ? 'bg-orange-100' : 'bg-zinc-100'}`}>
                        <CreditCard className={`w-4 h-4 ${selectedPackageId === pkg.id ? 'text-orange-500' : 'text-zinc-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-800">{pkg.name}</div>
                        {pkg.description && <div className="text-[11px] text-zinc-400 truncate">{pkg.description}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-zinc-800">&euro;{pkg.monthly_price}</div>
                        <div className="text-[10px] text-zinc-400">/month</div>
                      </div>
                    </button>
                  ))}
                  {packages.length === 0 && <p className="text-xs text-zinc-400 py-4 text-center">No license packages available</p>}
                </div>
              </div>

              {/* Billing cycle */}
              {selectedPackageId && (
                <div className="space-y-2">
                  <Label className="text-zinc-700">Billing Cycle</Label>
                  <div className="flex gap-2">
                    {['monthly', 'yearly', 'lifetime'].map(c => (
                      <button key={c} onClick={() => setBillingCycle(c)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all capitalize ${
                          billingCycle === c ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}>{c}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">Back</Button>
                <Button onClick={handleAssignLicense} disabled={saving || !selectedPackageId} className="flex-1" data-testid="save-license-btn">
                  {saving ? 'Saving...' : 'Save License'}
                </Button>
                <Button variant="outline" onClick={() => setStep(s => s + 1)} className="gap-1">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step: Admin */}
          {currentStepId === 'admin' && (
            <motion.div key="admin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 space-y-5">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Team & Admin</h3>
                <p className="text-sm text-zinc-500 mt-0.5">Manage who has access to this site and their roles.</p>
              </div>

              {/* Current users */}
              <div className="space-y-2">
                <Label className="text-zinc-700">Current Members ({siteUsers.length})</Label>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {siteUsers.map(u => {
                    const roleOpt = ROLE_OPTIONS.find(r => r.value === u.role) || ROLE_OPTIONS[3];
                    return (
                      <div key={u.user_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 group">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {u.user_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-800 truncate">{u.user_name || u.user_email}</div>
                          <div className="text-[11px] text-zinc-400 truncate">{u.user_email}</div>
                        </div>
                        <select value={u.role} onChange={(e) => handleChangeRole(u.user_id, e.target.value)}
                          className="h-7 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-700 px-2" data-testid={`role-select-${u.user_id}`}>
                          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <button onClick={() => handleRemoveUser(u.user_id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100" data-testid={`remove-user-${u.user_id}`}>
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400 hover:text-red-500" />
                        </button>
                      </div>
                    );
                  })}
                  {siteUsers.length === 0 && <p className="text-xs text-zinc-400 py-4 text-center">No users assigned yet</p>}
                </div>
              </div>

              {/* Add user */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <Label className="text-zinc-700">Add Member</Label>
                <div className="flex gap-2">
                  <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}
                    className="flex-1 h-9 text-sm rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 px-3" data-testid="add-user-select">
                    <option value="">Select user...</option>
                    {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                  <select value={addRole} onChange={(e) => setAddRole(e.target.value)}
                    className="w-28 h-9 text-sm rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 px-2">
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <Button size="sm" onClick={handleAddUser} disabled={!addUserId || saving} className="gap-1 h-9" data-testid="add-user-btn">
                    <UserPlus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              </div>

              {/* Role legend */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                {ROLE_OPTIONS.map(r => (
                  <div key={r.value} className="flex items-center gap-2 text-xs text-zinc-500">
                    <div className={`w-5 h-5 rounded flex items-center justify-center ${r.color}`}>
                      <r.icon className="w-3 h-3" />
                    </div>
                    <span className="font-medium text-zinc-700">{r.label}</span>
                    <span className="hidden sm:inline">&middot; {r.desc}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1">Back</Button>
                <Button onClick={() => onClose?.()} className="flex-1" data-testid="edit-done-btn">Done</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
