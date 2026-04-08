import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import {
  Package, Plus, Edit, Trash2, Shield, Globe, Check, X, CreditCard,
  Infinity, AlertTriangle, Loader2, ChevronDown, Clock, CheckCircle, XCircle, FileText
} from 'lucide-react';

const SITE_TYPE_IMAGES = { radio: '/images/env_license.jpg', technical: '/images/env_license.jpg', server: '/images/env_license.jpg', task_scheduler: '/images/env_license.jpg', external_host: '/images/env_license.jpg', wp_security: '/images/env_license.jpg' };
const CYCLING_IMAGES = ['/images/env_license.jpg'];
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
  // License requests
  const [licenseRequests, setLicenseRequests] = useState([]);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    setLoading(true);
    let hasError = false;

    // Fetch each endpoint independently so one failure doesn't break everything
    try {
      const pkgRes = await fetch(`${API}/api/licenses/packages`, { headers });
      if (pkgRes.ok) {
        const data = await pkgRes.json();
        setPackages(Array.isArray(data) ? data : []);
      } else { hasError = true; }
    } catch { hasError = true; }

    try {
      const overRes = await fetch(`${API}/api/licenses/overview`, { headers });
      if (overRes.ok) {
        const data = await overRes.json();
        setOverview(Array.isArray(data) ? data : []);
      } else { hasError = true; }
    } catch { hasError = true; }

    try {
      const featRes = await fetch(`${API}/api/main-sites/features`, { headers });
      if (featRes.ok) {
        const featData = await featRes.json();
        setAvailableFeatures(featData.features || []);
      } else { hasError = true; }
    } catch { hasError = true; }

    try {
      const reqRes = await fetch(`${API}/api/licenses/requests`, { headers });
      if (reqRes.ok) {
        const data = await reqRes.json();
        setLicenseRequests(Array.isArray(data) ? data : []);
      }
    } catch { /* requests tab is non-critical */ }

    if (hasError) toast.error('Some license data could not be loaded');
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

  const toggleDemo = async (siteId, currentDemo) => {
    try {
      const res = await fetch(`${API}/api/main-sites/${siteId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ is_demo: !currentDemo }),
      });
      if (!res.ok) {
        toast.error('Failed to toggle demo mode');
        return;
      }
      toast.success(!currentDemo ? 'Demo mode enabled' : 'Demo mode disabled');
      fetchData();
    } catch {
      toast.error('Failed to toggle demo mode');
    }
  };

  const handleRequestAction = async (requestId, status) => {
    try {
      const res = await fetch(`${API}/api/licenses/requests/${requestId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error('Failed to update request');
        return;
      }
      toast.success(status === 'approved' ? 'Request approved' : 'Request denied');
      fetchData();
    } catch {
      toast.error('Failed to update request');
    }
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
      <div className="flex gap-2 border-b border-zinc-200 pb-2">
        {[
          { id: 'overview', label: 'License Overview', icon: Globe },
          { id: 'requests', label: 'Requests', icon: FileText, badge: licenseRequests.filter(r => r.status === 'pending').length },
          { id: 'packages', label: 'Packages', icon: Package },
        ].map(tab => (
          <button
            key={tab.id}
            data-testid={`license-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-white border-b-2 border-orange-500'
                : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-orange-500 text-white">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats as isometric image cards */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {[
              { label: 'TOTAL SITES', value: overview.length, icon: Globe, color: '#3b82f6', img: '/images/env_license.jpg' },
              { label: 'LICENSED', value: assignedSites.length, icon: Check, color: '#22c55e', img: '/images/env_license.jpg' },
              { label: 'NO LICENSE', value: unassignedSites.filter(s => !s.is_demo).length, icon: AlertTriangle, color: '#ef4444', img: '/images/env_license.jpg' },
              { label: 'DEMO', value: overview.filter(s => s.is_demo).length, icon: Globe, color: '#f59e0b', img: '/images/env_license.jpg' },
              { label: 'LIFETIME', value: assignedSites.filter(s => s.is_lifetime).length, icon: Infinity, color: '#a855f7', img: '/images/env_license.jpg' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="group w-[260px] flex-shrink-0"
              >
                <div className="rounded-2xl overflow-hidden border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02] transition-all duration-300" style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}>
                  <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
                    <img src={stat.img} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" style={{ WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)', maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)' }} />
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <stat.icon className="w-3 h-3" style={{ color: stat.color }} />
                        <span className="text-[10px] font-bold tracking-wider" style={{ color: stat.color }}>{stat.label}</span>
                      </div>
                    </div>
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-1 border border-black/[0.06] shadow-sm">
                      <span className="text-sm font-bold text-zinc-700">{stat.value}</span>
                    </div>
                  </div>
                  <div className="px-3.5 py-3">
                    <h3 className="text-sm font-bold text-zinc-800">{stat.label.charAt(0) + stat.label.slice(1).toLowerCase()}</h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{stat.value} site{stat.value !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${stat.color}, ${stat.color}60)` }} />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Unassigned sites as 260px cards */}
          {unassignedSites.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-500">Sites Without License ({unassignedSites.length})</span>
              </div>
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
                {unassignedSites.map((site, i) => {
                  const siteImg = SITE_TYPE_IMAGES[site.site_type] || CYCLING_IMAGES[i % CYCLING_IMAGES.length];
                  return (
                  <motion.div
                    key={site.site_id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="group w-[260px] flex-shrink-0"
                  >
                    <div className="rounded-2xl overflow-hidden border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02] transition-all duration-300" style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}>
                      <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
                        <img src={siteImg} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" style={{ WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)', maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)' }} />
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            <span className="text-[10px] font-bold tracking-wider text-red-500">
                              {(SITE_TYPE_LABELS[site.site_type] || site.site_type).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        {site.is_demo && (
                          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                            <span className="text-[10px] font-bold tracking-wider text-amber-600">DEMO</span>
                          </div>
                        )}
                      </div>
                      <div className="px-3.5 py-3">
                        <h3 className="text-sm font-bold text-zinc-800 truncate">{site.site_name}</h3>
                        <p className="text-[11px] text-red-400 mt-0.5">No license assigned</p>
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => toggleDemo(site.site_id, site.is_demo)}
                            className={`flex-1 h-6 text-[10px] font-medium rounded-lg border transition-colors ${
                              site.is_demo
                                ? 'bg-amber-500/15 border-amber-400/40 text-amber-600'
                                : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'
                            }`}
                            data-testid={`toggle-demo-${site.site_slug}`}
                          >
                            {site.is_demo ? 'Demo On' : 'Demo Off'}
                          </button>
                          <Button size="sm" onClick={() => openAssign(site.site_id)} className="flex-1 h-6 text-[10px] rounded-lg" data-testid={`assign-license-${site.site_slug}`}>
                            <CreditCard className="w-3 h-3 mr-0.5" /> Assign
                          </Button>
                        </div>
                      </div>
                      <div className="h-1" style={{ background: 'linear-gradient(90deg, #ef4444, #ef444460)' }} />
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assigned sites as 260px cards */}
          {assignedSites.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-600">Licensed Sites ({assignedSites.length})</span>
              </div>
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
                {assignedSites.map((site, i) => {
                  const siteImg = SITE_TYPE_IMAGES[site.site_type] || CYCLING_IMAGES[i % CYCLING_IMAGES.length];
                  return (
                  <motion.div
                    key={site.site_id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="group w-[260px] flex-shrink-0"
                  >
                    <div className="rounded-2xl overflow-hidden border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02] transition-all duration-300" style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}>
                      <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
                        <img src={siteImg} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" style={{ WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)', maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)' }} />
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] font-bold tracking-wider text-emerald-600">
                              {(SITE_TYPE_LABELS[site.site_type] || site.site_type).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                          <span className="text-[10px] font-bold text-emerald-600">{site.license_package}</span>
                        </div>
                        {site.is_lifetime && (
                          <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-0.5 border border-black/[0.06] shadow-sm flex items-center gap-1">
                            <Infinity className="w-2.5 h-2.5 text-purple-600" />
                            <span className="text-[9px] font-bold text-purple-600">LIFETIME</span>
                          </div>
                        )}
                        {site.is_demo && (
                          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-0.5 border border-black/[0.06] shadow-sm">
                            <span className="text-[9px] font-bold text-amber-600">DEMO</span>
                          </div>
                        )}
                      </div>
                      <div className="px-3.5 py-3">
                        <h3 className="text-sm font-bold text-zinc-800 truncate">{site.site_name}</h3>
                        {!site.is_lifetime && (
                          <p className="text-[11px] text-zinc-400 mt-0.5 capitalize">{site.billing_cycle}</p>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => setDeleteDialog({ open: true, type: 'assignment', id: site.assignment_id, name: site.site_name })}
                          className="w-full h-6 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-50 mt-2 rounded-lg"
                          data-testid={`remove-license-${site.site_slug}`}
                        >
                          <X className="w-3 h-3 mr-0.5" /> Remove License
                        </Button>
                      </div>
                      <div className="h-1" style={{ background: 'linear-gradient(90deg, #22c55e, #22c55e60)' }} />
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4" data-testid="license-requests-tab">
          <p className="text-sm text-zinc-400">
            License requests are automatically created when a new site is created. Review and approve or deny them below.
          </p>

          {licenseRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="w-12 h-12 text-zinc-300 mb-3" />
              <p className="text-zinc-400 text-sm">No license requests yet</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
              {licenseRequests.map((req, i) => {
                const isPending = req.status === 'pending';
                const isApproved = req.status === 'approved';
                const color = isPending ? '#f59e0b' : isApproved ? '#22c55e' : '#ef4444';
                const StatusIcon = isPending ? Clock : isApproved ? CheckCircle : XCircle;
                return (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="group w-[260px] flex-shrink-0"
                    data-testid={`license-request-${req.id}`}
                  >
                    <div className="rounded-2xl overflow-hidden border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02] transition-all duration-300" style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}>
                      <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
                        <img src={SITE_TYPE_IMAGES[req.site_type] || CYCLING_IMAGES[i % CYCLING_IMAGES.length]} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" style={{ WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)', maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)' }} />
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className="w-3 h-3" style={{ color }} />
                            <span className="text-[10px] font-bold tracking-wider" style={{ color }}>{req.status.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                          <span className="text-[10px] font-bold tracking-wider text-zinc-500">
                            {(SITE_TYPE_LABELS[req.site_type] || req.site_type).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="px-3.5 py-3">
                        <h3 className="text-sm font-bold text-zinc-800 truncate">{req.site_name}</h3>
                        <p className="text-[11px] text-zinc-400 font-mono truncate">/{req.site_slug}</p>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                          <span className="text-[10px] text-zinc-400">Environment</span>
                          <span className="text-[10px] text-zinc-600 truncate">{req.environment_name}</span>
                          <span className="text-[10px] text-zinc-400">Requested by</span>
                          <span className="text-[10px] text-zinc-600 truncate">{req.requester_name}</span>
                          <span className="text-[10px] text-zinc-400">Date</span>
                          <span className="text-[10px] text-zinc-600">{new Date(req.created_at).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        </div>
                        {req.reviewed_by && (
                          <p className="text-[10px] text-zinc-400 mt-2 border-t border-zinc-100 pt-1.5">
                            Reviewed by {req.reviewed_by}
                          </p>
                        )}
                        {isPending && (
                          <div className="flex gap-1.5 mt-2">
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                              onClick={() => handleRequestAction(req.id, 'approved')}
                              data-testid={`approve-request-${req.id}`}
                            >
                              <Check className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-[10px] border-red-300 text-red-500 hover:bg-red-50 rounded-lg"
                              onClick={() => handleRequestAction(req.id, 'denied')}
                              data-testid={`deny-request-${req.id}`}
                            >
                              <X className="w-3 h-3 mr-1" /> Deny
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}60)` }} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
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

          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {packages.map((pkg, i) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="group w-[260px] flex-shrink-0"
                data-testid={`package-card-${pkg.slug}`}
              >
                <div className="rounded-2xl overflow-hidden border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02] transition-all duration-300" style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}>
                  <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
                    <img src={CYCLING_IMAGES[i % CYCLING_IMAGES.length]} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" style={{ WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)', maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)' }} />
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-orange-500" />
                        <span className="text-[10px] font-bold tracking-wider text-orange-600">PACKAGE</span>
                      </div>
                    </div>
                    {pkg.is_default && (
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                        <span className="text-[10px] font-bold tracking-wider text-zinc-500">DEFAULT</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-0.5 border border-black/[0.06] shadow-sm">
                      <span className="text-[9px] font-bold text-zinc-500">{pkg.features?.length || 0} features</span>
                    </div>
                  </div>
                  <div className="px-3.5 py-3">
                    <h3 className="text-sm font-bold text-zinc-800 truncate">{pkg.name}</h3>
                    {pkg.description && <p className="text-[11px] text-zinc-400 truncate mt-0.5">{pkg.description}</p>}
                    {/* Pricing */}
                    <div className="flex gap-2 mt-2">
                      <div className="bg-zinc-50 rounded-lg px-2 py-1 text-center flex-1">
                        <p className="text-[9px] text-zinc-400 uppercase">Monthly</p>
                        <p className="text-xs font-semibold text-zinc-700">{pkg.monthly_price > 0 ? `${pkg.currency} ${pkg.monthly_price.toFixed(2)}` : 'Free'}</p>
                      </div>
                      <div className="bg-zinc-50 rounded-lg px-2 py-1 text-center flex-1">
                        <p className="text-[9px] text-zinc-400 uppercase">Yearly</p>
                        <p className="text-xs font-semibold text-zinc-700">{pkg.yearly_price > 0 ? `${pkg.currency} ${pkg.yearly_price.toFixed(2)}` : 'Free'}</p>
                      </div>
                    </div>
                    {/* Feature tags */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(pkg.features || []).slice(0, 4).map(fId => {
                        const feat = availableFeatures.find(f => f.id === fId);
                        return <span key={fId} className="px-1.5 py-0.5 rounded text-[9px] bg-orange-50 text-orange-600 border border-orange-100">{feat?.name || fId}</span>;
                      })}
                      {(pkg.features || []).length > 4 && <span className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-100 text-zinc-500">+{pkg.features.length - 4}</span>}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1.5 mt-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditPkg(pkg)} className="flex-1 h-7 text-[10px] rounded-lg" data-testid={`edit-pkg-${pkg.slug}`}>
                        <Edit className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      {!pkg.is_default && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'package', id: pkg.id, name: pkg.name })} className="h-7 text-[10px] text-red-400 hover:text-red-300 rounded-lg" data-testid={`delete-pkg-${pkg.slug}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="h-1" style={{ background: 'linear-gradient(90deg, #f97316, #f9731660)' }} />
                </div>
              </motion.div>
            ))}
            {/* Add new package card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: packages.length * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-[260px] flex-shrink-0"
            >
              <button onClick={openCreatePkg} className="w-full rounded-2xl overflow-hidden border-2 border-dashed border-zinc-200 hover:border-orange-300 transition-colors h-full min-h-[260px] flex flex-col items-center justify-center gap-3 group" data-testid="create-package-card">
                <div className="w-12 h-12 rounded-full bg-zinc-100 group-hover:bg-orange-100 flex items-center justify-center transition-colors">
                  <Plus className="w-6 h-6 text-zinc-400 group-hover:text-orange-500 transition-colors" />
                </div>
                <span className="text-sm text-zinc-400 group-hover:text-orange-500 font-medium transition-colors">New Package</span>
              </button>
            </motion.div>
          </div>
        </div>
      )}

      {/* Package Create/Edit Dialog */}
      <Dialog open={pkgDialog} onOpenChange={setPkgDialog}>
        <DialogContent className="bg-white border-zinc-300 max-w-lg max-h-[90vh] overflow-y-auto">
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
                        <label key={f.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-100 cursor-pointer">
                          <Checkbox
                            checked={pkgForm.features.includes(f.id)}
                            onCheckedChange={() => toggleFeature(f.id)}
                            data-testid={`feature-checkbox-${f.id}`}
                          />
                          <span className="text-sm text-zinc-600">{f.name}</span>
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
        <DialogContent className="bg-white border-zinc-300 max-w-md">
          <DialogHeader>
            <DialogTitle>Assign License</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Site</Label>
              <select
                className="w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
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
                className="w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
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
                        : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
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
        <AlertDialogContent className="bg-white border-zinc-300">
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
    <div className="bg-white border border-zinc-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}
