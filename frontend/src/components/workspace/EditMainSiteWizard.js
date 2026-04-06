import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
  Upload, Check, ChevronRight, Globe, Users, CreditCard,
  Shield, UserPlus, Trash2, Crown, Pencil, Eye, Mic
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const STEPS = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'license', label: 'License', icon: CreditCard },
  { id: 'admin', label: 'Admin', icon: Users },
];

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', icon: Crown, color: 'text-orange-500 bg-orange-50', desc: 'Full access to all features' },
  { value: 'editor', label: 'Editor', icon: Pencil, color: 'text-blue-500 bg-blue-50', desc: 'Can edit content and shows' },
  { value: 'presenter', label: 'Presenter', icon: Mic, color: 'text-violet-500 bg-violet-50', desc: 'Can manage their own shows' },
  { value: 'viewer', label: 'Viewer', icon: Eye, color: 'text-zinc-500 bg-zinc-100', desc: 'Read-only access' },
];

export default function EditMainSiteWizard({ open, onClose, site, onUpdated }) {
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // General
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

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

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Load site data when opened
  useEffect(() => {
    if (!open || !site) return;
    setStep(0);
    setName(site.name || '');
    setSlug(site.slug || '');
    setLogoUrl(site.logo_url || '');
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

  useEffect(() => {
    if (step === 1 && open) loadLicenseData();
    if (step === 2 && open) loadUserData();
  }, [step, open, loadLicenseData, loadUserData]);

  // Handlers
  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/main-sites/${site.id}`, {
        method: 'PUT', headers, body: JSON.stringify({ name, slug, logo_url: logoUrl }),
      });
      onUpdated?.();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleLogoUpload = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API}/api/main-sites/${site.id}/logo`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url);
      }
    } catch (e) { console.error(e); }
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

  if (!site) return null;

  const logoSrc = logoUrl?.startsWith('/') ? `${API}${logoUrl}` : logoUrl;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-xl bg-white border-zinc-200 p-0 overflow-hidden rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" data-testid="edit-site-wizard">
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
          {step === 0 && (
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
                  <div className="w-16 h-16 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 text-xs">No logo</div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-xl text-sm text-zinc-700 font-medium transition-colors">
                    <Upload className="w-4 h-4" /> Upload logo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                  </label>
                  {logoUrl && <button onClick={() => setLogoUrl('')} className="text-xs text-red-500 hover:underline self-start">Remove</button>}
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

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveGeneral} disabled={saving || !name} className="flex-1" data-testid="save-general-btn">
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 1: License */}
          {step === 1 && (
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
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1">Back</Button>
                <Button onClick={handleAssignLicense} disabled={saving || !selectedPackageId} className="flex-1" data-testid="save-license-btn">
                  {saving ? 'Saving...' : 'Save License'}
                </Button>
                <Button variant="outline" onClick={() => setStep(2)} className="gap-1">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Admin */}
          {step === 2 && (
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
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button onClick={() => onClose?.()} className="flex-1" data-testid="edit-done-btn">Done</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
