import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import {
  Package, Plus, Edit, Trash2, Shield, Globe, Check, X, CreditCard,
  Infinity, AlertTriangle, Loader2, ChevronDown
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';

const API = process.env.REACT_APP_BACKEND_URL;

const BILLING_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'lifetime', label: 'Lifetime' },
];

const SITE_TYPE_LABELS = {
  radio: 'Main Site',
  technical: 'Technical Site',
  server: 'Server Site',
  task_scheduler: 'Task Site',
};

const SITE_TYPE_COLORS = {
  radio: 'bg-blue-500/20 text-blue-400',
  technical: 'bg-purple-500/20 text-purple-400',
  server: 'bg-emerald-500/20 text-emerald-400',
  task_scheduler: 'bg-amber-500/20 text-amber-400',
};

export default function LicenseManager() {
  const { token } = useAuth();
  const [packages, setPackages] = useState([]);
  const [overview, setOverview] = useState([]);
  const [availableFeatures, setAvailableFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Package dialog
  const [pkgDialog, setPkgDialog] = useState(false);
  const [editingPkg, setEditingPkg] = useState(null);
  const [pkgForm, setPkgForm] = useState({
    name: '', slug: '', description: '', features: [],
    monthly_price: 0, yearly_price: 0, currency: 'EUR', sort_order: 0,
  });

  // Assignment dialog
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({
    main_site_id: '', package_id: '', billing_cycle: 'monthly', notes: '',
  });

  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: '', name: '' });

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, overRes, featRes] = await Promise.all([
        fetch(`${API}/api/licenses/packages`, { headers }),
        fetch(`${API}/api/licenses/overview`, { headers }),
        fetch(`${API}/api/main-sites/features`, { headers }),
      ]);
      setPackages(await pkgRes.json());
      setOverview(await overRes.json());
      const featData = await featRes.json();
      setAvailableFeatures(featData.features || []);
    } catch {
      toast.error('Failed to load license data');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Package CRUD ----
  const openCreatePkg = () => {
    setEditingPkg(null);
    setPkgForm({ name: '', slug: '', description: '', features: [], monthly_price: 0, yearly_price: 0, currency: 'EUR', sort_order: packages.length });
    setPkgDialog(true);
  };

  const openEditPkg = (pkg) => {
    setEditingPkg(pkg);
    setPkgForm({
      name: pkg.name, slug: pkg.slug, description: pkg.description || '',
      features: pkg.features || [], monthly_price: pkg.monthly_price || 0,
      yearly_price: pkg.yearly_price || 0, currency: pkg.currency || 'EUR',
      sort_order: pkg.sort_order || 0,
    });
    setPkgDialog(true);
  };

  const savePkg = async () => {
    try {
      const url = editingPkg
        ? `${API}/api/licenses/packages/${editingPkg.id}`
        : `${API}/api/licenses/packages`;
      const method = editingPkg ? 'PUT' : 'POST';
      const body = editingPkg
        ? { name: pkgForm.name, description: pkgForm.description, features: pkgForm.features, monthly_price: pkgForm.monthly_price, yearly_price: pkgForm.yearly_price, currency: pkgForm.currency, sort_order: pkgForm.sort_order }
        : pkgForm;

      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Failed to save package');
        return;
      }
      toast.success(editingPkg ? 'Package updated' : 'Package created');
      setPkgDialog(false);
      fetchData();
    } catch {
      toast.error('Failed to save package');
    }
  };

  const confirmDelete = async () => {
    const { type, id } = deleteDialog;
    try {
      const url = type === 'package'
        ? `${API}/api/licenses/packages/${id}`
        : `${API}/api/licenses/assignments/${id}`;
      const res = await fetch(url, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Delete failed');
      } else {
        toast.success(`${type === 'package' ? 'Package' : 'License'} deleted`);
        fetchData();
      }
    } catch {
      toast.error('Delete failed');
    }
    setDeleteDialog({ open: false, type: '', id: '', name: '' });
  };

  // ---- Assignment ----
  const openAssign = (siteId) => {
    setAssignForm({ main_site_id: siteId || '', package_id: packages[0]?.id || '', billing_cycle: 'monthly', notes: '' });
    setAssignDialog(true);
  };

  const saveAssign = async () => {
    try {
      const res = await fetch(`${API}/api/licenses/assignments`, {
        method: 'POST', headers, body: JSON.stringify(assignForm),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Failed to assign license');
        return;
      }
      toast.success('License assigned');
      setAssignDialog(false);
      fetchData();
    } catch {
      toast.error('Failed to assign license');
    }
  };

  const toggleFeature = (featureId) => {
    setPkgForm(prev => ({
      ...prev,
      features: prev.features.includes(featureId)
        ? prev.features.filter(f => f !== featureId)
        : [...prev.features, featureId],
    }));
  };

  const featureGroups = availableFeatures.reduce((acc, f) => {
    if (!acc[f.group]) acc[f.group] = [];
    acc[f.group].push(f);
    return acc;
  }, {});

  const unassignedSites = overview.filter(s => !s.has_license);
  const assignedSites = overview.filter(s => s.has_license);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="license-manager">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        {[
          { id: 'overview', label: 'License Overview', icon: Globe },
          { id: 'packages', label: 'Packages', icon: Package },
        ].map(tab => (
          <button
            key={tab.id}
            data-testid={`license-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-zinc-800 text-white border-b-2 border-orange-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Sites" value={overview.length} icon={Globe} color="text-blue-400" />
            <StatCard label="Licensed" value={assignedSites.length} icon={Check} color="text-green-400" />
            <StatCard label="No License" value={unassignedSites.length} icon={AlertTriangle} color="text-red-400" />
            <StatCard label="Lifetime" value={assignedSites.filter(s => s.is_lifetime).length} icon={Infinity} color="text-purple-400" />
          </div>

          {/* Unassigned sites warning */}
          {unassignedSites.length > 0 && (
            <Card className="bg-red-950/30 border-red-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Sites Without License ({unassignedSites.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unassignedSites.map(site => (
                  <div key={site.site_id} className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[site.site_type] || 'bg-zinc-700 text-zinc-300'}`}>
                        {SITE_TYPE_LABELS[site.site_type] || site.site_type}
                      </span>
                      <span className="text-sm text-zinc-200">{site.site_name}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openAssign(site.site_id)} className="h-7 text-xs" data-testid={`assign-license-${site.site_slug}`}>
                      <CreditCard className="w-3 h-3 mr-1" />
                      Assign License
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Assigned sites */}
          {assignedSites.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-green-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Licensed Sites ({assignedSites.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {assignedSites.map(site => (
                    <div key={site.site_id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[site.site_type] || 'bg-zinc-700 text-zinc-300'}`}>
                          {SITE_TYPE_LABELS[site.site_type] || site.site_type}
                        </span>
                        <span className="text-sm text-zinc-200">{site.site_name}</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                          {site.license_package}
                        </span>
                        {site.is_lifetime && (
                          <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 flex items-center gap-1">
                            <Infinity className="w-3 h-3" /> Lifetime
                          </span>
                        )}
                        {!site.is_lifetime && (
                          <span className="text-xs text-zinc-500 capitalize">{site.billing_cycle}</span>
                        )}
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setDeleteDialog({ open: true, type: 'assignment', id: site.assignment_id, name: site.site_name })}
                        className="h-7 text-xs text-red-400 hover:text-red-300"
                        data-testid={`remove-license-${site.site_slug}`}
                      >
                        <X className="w-3 h-3 mr-1" /> Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Packages Tab */}
      {activeTab === 'packages' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-zinc-400">
              Manage license packages and their included features
            </p>
            <Button onClick={openCreatePkg} size="sm" data-testid="create-package-btn">
              <Plus className="w-4 h-4 mr-1" /> New Package
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {packages.map(pkg => (
              <Card key={pkg.id} className="bg-zinc-900 border-zinc-800" data-testid={`package-card-${pkg.slug}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-zinc-100 flex items-center gap-2">
                      <Package className="w-4 h-4 text-orange-400" />
                      {pkg.name}
                      {pkg.is_default && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">Default</span>
                      )}
                    </CardTitle>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEditPkg(pkg)} className="h-7 w-7 p-0" data-testid={`edit-pkg-${pkg.slug}`}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      {!pkg.is_default && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'package', id: pkg.id, name: pkg.name })} className="h-7 w-7 p-0 text-red-400 hover:text-red-300" data-testid={`delete-pkg-${pkg.slug}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {pkg.description && <p className="text-xs text-zinc-500 mt-1">{pkg.description}</p>}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Pricing */}
                    <div className="flex gap-3">
                      <div className="bg-zinc-800 rounded px-2 py-1 text-center flex-1">
                        <p className="text-[10px] text-zinc-500 uppercase">Monthly</p>
                        <p className="text-sm font-semibold text-zinc-200">
                          {pkg.monthly_price > 0 ? `${pkg.currency} ${pkg.monthly_price.toFixed(2)}` : 'Free'}
                        </p>
                      </div>
                      <div className="bg-zinc-800 rounded px-2 py-1 text-center flex-1">
                        <p className="text-[10px] text-zinc-500 uppercase">Yearly</p>
                        <p className="text-sm font-semibold text-zinc-200">
                          {pkg.yearly_price > 0 ? `${pkg.currency} ${pkg.yearly_price.toFixed(2)}` : 'Free'}
                        </p>
                      </div>
                    </div>
                    {/* Features */}
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase mb-1">Features ({pkg.features?.length || 0})</p>
                      <div className="flex flex-wrap gap-1">
                        {(pkg.features || []).map(fId => {
                          const feat = availableFeatures.find(f => f.id === fId);
                          return (
                            <span key={fId} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300">
                              {feat?.name || fId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Package Create/Edit Dialog */}
      <Dialog open={pkgDialog} onOpenChange={setPkgDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPkg ? 'Edit Package' : 'Create Package'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={pkgForm.name} onChange={e => setPkgForm(p => ({ ...p, name: e.target.value }))} placeholder="Premium" data-testid="pkg-name-input" />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={pkgForm.slug} onChange={e => setPkgForm(p => ({ ...p, slug: e.target.value }))} placeholder="premium" disabled={!!editingPkg} data-testid="pkg-slug-input" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={pkgForm.description} onChange={e => setPkgForm(p => ({ ...p, description: e.target.value }))} placeholder="Package description" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Monthly Price</Label>
                <Input type="number" step="0.01" min="0" value={pkgForm.monthly_price} onChange={e => setPkgForm(p => ({ ...p, monthly_price: parseFloat(e.target.value) || 0 }))} data-testid="pkg-monthly-price" />
              </div>
              <div>
                <Label>Yearly Price</Label>
                <Input type="number" step="0.01" min="0" value={pkgForm.yearly_price} onChange={e => setPkgForm(p => ({ ...p, yearly_price: parseFloat(e.target.value) || 0 }))} data-testid="pkg-yearly-price" />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={pkgForm.currency} onChange={e => setPkgForm(p => ({ ...p, currency: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Included Features</Label>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {Object.entries(featureGroups).map(([group, features]) => (
                  <div key={group}>
                    <p className="text-xs text-zinc-500 uppercase mb-1 capitalize">{group}</p>
                    <div className="space-y-1">
                      {features.map(f => (
                        <label key={f.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800 cursor-pointer">
                          <Checkbox
                            checked={pkgForm.features.includes(f.id)}
                            onCheckedChange={() => toggleFeature(f.id)}
                            data-testid={`feature-checkbox-${f.id}`}
                          />
                          <span className="text-sm text-zinc-300">{f.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPkgDialog(false)}>Cancel</Button>
            <Button onClick={savePkg} disabled={!pkgForm.name || !pkgForm.slug} data-testid="save-package-btn">
              {editingPkg ? 'Update' : 'Create'} Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle>Assign License</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Site</Label>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
                value={assignForm.main_site_id}
                onChange={e => setAssignForm(p => ({ ...p, main_site_id: e.target.value }))}
                data-testid="assign-site-select"
              >
                <option value="">Select a site...</option>
                {unassignedSites.map(s => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.site_name} ({SITE_TYPE_LABELS[s.site_type] || s.site_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Package</Label>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
                value={assignForm.package_id}
                onChange={e => setAssignForm(p => ({ ...p, package_id: e.target.value }))}
                data-testid="assign-package-select"
              >
                {packages.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Billing Cycle</Label>
              <div className="flex gap-2 mt-1">
                {BILLING_CYCLES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setAssignForm(p => ({ ...p, billing_cycle: c.value }))}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
                      assignForm.billing_cycle === c.value
                        ? 'bg-orange-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                    data-testid={`billing-cycle-${c.value}`}
                  >
                    {c.value === 'lifetime' && <Infinity className="w-3 h-3 inline mr-1" />}
                    {c.label}
                  </button>
                ))}
              </div>
              {assignForm.billing_cycle === 'lifetime' && (
                <p className="text-xs text-purple-400 mt-1">Lifetime licenses do not require payment.</p>
              )}
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={assignForm.notes}
                onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Internal notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button onClick={saveAssign} disabled={!assignForm.main_site_id || !assignForm.package_id} data-testid="save-assignment-btn">
              Assign License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={open => !open && setDeleteDialog(prev => ({ ...prev, open: false }))}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDialog.type === 'package' ? 'Package' : 'License'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.type === 'package'
                ? `This will permanently delete the "${deleteDialog.name}" package.`
                : `This will remove the license from "${deleteDialog.name}". The site will no longer have access to licensed features.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}
