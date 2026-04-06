import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, HardDrive, Network, LayoutGrid, ExternalLink, Shield,
  Check, ChevronRight, ChevronLeft, User, Lock, Zap, Loader2,
  Upload, X
} from 'lucide-react';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const API = process.env.REACT_APP_BACKEND_URL;

/* ── Background images per type ── */
const SITE_TYPE_BACKGROUNDS = {
  radio: 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/9c133714c33f42124837a555a90289699f0f5190e464c69e21122133740a9121.png',
  server: 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/890e7b1a8c829f2400a99ab38a6f95cc67ee2cf484d5e0f7284db9d387dccdaa.png',
  external_host: 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/974c8600aaf4d15df32a2491c01ce966d2d607504c5a0619c1db614cca5ff5ca.png',
  task_scheduler: 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/e6a4902f196cab3b9a12773493effed4474315bc29c5d5c246b50ce146e1d3c7.png',
  technical: 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/878df6d5ae5f3917a4b63ad13a9eba7bf2f1059d7367a0c89e4259434341d8a2.png',
  wp_security: 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/05460f0ccc010b9601746d7bed0df2dc30ee39dfaff61dafed6dee539f1cbe91.png',
};

const SITE_TYPES = [
  { id: 'radio',          icon: Radio,       label: 'Radio Station',     desc: 'Shows, calendar, content library, RDS',    color: '#f97316', features: ['shows', 'calendar', 'content_library', 'media_library', 'team_chat', 'rds_settings'] },
  { id: 'server',         icon: HardDrive,   label: 'Virtual Datacenter', desc: 'XML imports, server management',           color: '#3b82f6', features: ['xml_imports', 'team_settings'] },
  { id: 'external_host',  icon: ExternalLink, label: 'External Host',    desc: 'External site hosting & monitoring',        color: '#06b6d4', features: ['sites', 'team_settings'] },
  { id: 'task_scheduler', icon: LayoutGrid,  label: 'Task Manager',      desc: 'Task boards, project management',          color: '#8b5cf6', features: ['task_boards', 'team_settings'] },
  { id: 'technical',      icon: Network,     label: 'Data Connection',   desc: 'ZeroTier networking, data connections',     color: '#10b981', features: ['zerotier', 'team_settings'] },
  { id: 'wp_security',    icon: Shield,      label: 'WP Security',       desc: 'WordPress firewall & security scanning',    color: '#ef4444', features: ['wp_security', 'team_settings'] },
];

const STEP_LABELS = ['Environment', 'Details', 'Admin', 'Security', 'Deploying'];

/* ── Step indicator ── */
const StepIndicator = ({ currentStep, totalSteps }) => (
  <div className="flex items-center gap-2 mb-8">
    {STEP_LABELS.map((label, i) => (
      <div key={i} className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
          i < currentStep ? 'bg-emerald-500 text-white' :
          i === currentStep ? 'bg-zinc-900 text-white ring-4 ring-zinc-900/10' :
          'bg-zinc-100 text-zinc-400'
        }`}>
          {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
        </div>
        <span className={`text-xs font-medium hidden sm:inline ${i === currentStep ? 'text-zinc-900' : 'text-zinc-400'}`}>{label}</span>
        {i < totalSteps - 1 && <div className={`w-8 h-px ${i < currentStep ? 'bg-emerald-500' : 'bg-zinc-200'}`} />}
      </div>
    ))}
  </div>
);

/* ── Step 1: Choose Environment ── */
const StepEnvironment = ({ selected, onSelect }) => (
  <div>
    <h2 className="text-xl font-bold text-zinc-900 mb-1">Choose your environment</h2>
    <p className="text-sm text-zinc-500 mb-4">Select the type of server rack you want to deploy.</p>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
      {SITE_TYPES.map(type => {
        const Icon = type.icon;
        const isActive = selected === type.id;
        return (
          <button
            key={type.id}
            onClick={() => onSelect(type.id)}
            data-testid={`type-card-${type.id}`}
            className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-300 text-left group ${
              isActive ? 'border-zinc-900 shadow-xl scale-[1.02]' : 'border-zinc-200 hover:border-zinc-400 hover:shadow-md'
            }`}
          >
            {/* Background preview */}
            <div className="h-28 relative overflow-hidden bg-zinc-100">
              <img
                src={SITE_TYPE_BACKGROUNDS[type.id]}
                alt=""
                className={`w-full h-full object-cover transition-all duration-500 ${isActive ? 'scale-110 opacity-90' : 'scale-100 opacity-60 group-hover:opacity-80 group-hover:scale-105'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute top-2 right-2 w-7 h-7 bg-zinc-900 rounded-full flex items-center justify-center"
                >
                  <Check className="w-4 h-4 text-white" />
                </motion.div>
              )}
            </div>
            {/* Label */}
            <div className="px-3 py-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${type.color}15` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: type.color }} />
                </div>
                <span className={`text-sm font-semibold ${isActive ? 'text-zinc-900' : 'text-zinc-700'}`}>{type.label}</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{type.desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

/* ── Step 2: Details ── */
const StepDetails = ({ name, slug, onNameChange, onSlugChange, siteType }) => {
  const typeConfig = SITE_TYPES.find(t => t.id === siteType);
  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-900 mb-1">Name your server</h2>
      <p className="text-sm text-zinc-500 mb-6">Give your {typeConfig?.label || 'server'} a name and URL slug.</p>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-zinc-700 font-medium">Server Name</Label>
          <Input
            value={name} onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Radiogroup MFY/GRK"
            className="h-12 bg-zinc-50 border-zinc-200 text-zinc-900 rounded-xl text-base"
            autoFocus
            data-testid="wizard-name-input"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-700 font-medium">URL Slug</Label>
          <div className="flex items-center">
            <span className="text-zinc-400 text-base mr-1">/</span>
            <Input
              value={slug} onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="radiogroup-mfy"
              className="h-12 bg-zinc-50 border-zinc-200 text-zinc-900 rounded-xl font-mono text-base"
              data-testid="wizard-slug-input"
            />
          </div>
        </div>
        {/* Preview card */}
        <div className="mt-4 rounded-xl border border-zinc-200 overflow-hidden">
          <div className="h-20 relative">
            <img src={SITE_TYPE_BACKGROUNDS[siteType]} alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent" />
          </div>
          <div className="px-4 py-3 -mt-6 relative">
            <div className="flex items-center gap-2">
              {typeConfig && <typeConfig.icon className="w-4 h-4" style={{ color: typeConfig.color }} />}
              <span className="font-semibold text-zinc-900">{name || 'Server Name'}</span>
            </div>
            <span className="text-xs text-zinc-400 font-mono">/{slug || 'slug'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Step 3: Admin ── */
const StepAdmin = ({ adminId, onAdminChange, users, token }) => (
  <div>
    <h2 className="text-2xl font-bold text-zinc-900 mb-1">Assign site admin</h2>
    <p className="text-sm text-zinc-500 mb-6">Choose who will manage this server.</p>
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {users.map(u => (
        <button
          key={u.id}
          onClick={() => onAdminChange(u.id)}
          data-testid={`admin-option-${u.id}`}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
            adminId === u.id ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {u.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-semibold text-zinc-800 truncate">{u.name}</div>
            <div className="text-xs text-zinc-400 truncate">{u.email}</div>
          </div>
          {adminId === u.id && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" />
            </motion.div>
          )}
        </button>
      ))}
      {users.length === 0 && <p className="text-sm text-zinc-400 italic py-8 text-center">No users found</p>}
    </div>
  </div>
);

/* ── Step 4: Security ── */
const StepSecurity = ({ require2FA, onToggle2FA, siteType }) => (
  <div>
    <h2 className="text-2xl font-bold text-zinc-900 mb-1">Security settings</h2>
    <p className="text-sm text-zinc-500 mb-6">Configure security policies for this environment.</p>
    <div className="space-y-4">
      <button
        onClick={() => onToggle2FA(true)}
        data-testid="2fa-enable"
        className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left ${
          require2FA ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'
        }`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${require2FA ? 'bg-emerald-500/15' : 'bg-zinc-100'}`}>
          <Shield className={`w-6 h-6 ${require2FA ? 'text-emerald-600' : 'text-zinc-400'}`} />
        </div>
        <div className="flex-1">
          <span className="text-base font-semibold text-zinc-900">Enforce 2FA</span>
          <p className="text-xs text-zinc-500 mt-0.5">All users must set up two-factor authentication</p>
        </div>
        {require2FA && <Check className="w-5 h-5 text-emerald-600" />}
      </button>
      <button
        onClick={() => onToggle2FA(false)}
        data-testid="2fa-disable"
        className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left ${
          !require2FA ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'
        }`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${!require2FA ? 'bg-amber-500/15' : 'bg-zinc-100'}`}>
          <Lock className={`w-6 h-6 ${!require2FA ? 'text-amber-600' : 'text-zinc-400'}`} />
        </div>
        <div className="flex-1">
          <span className="text-base font-semibold text-zinc-900">Optional 2FA</span>
          <p className="text-xs text-zinc-500 mt-0.5">Users can optionally enable 2FA on their own</p>
        </div>
        {!require2FA && <Check className="w-5 h-5 text-amber-600" />}
      </button>
    </div>
  </div>
);

/* ── Step 5: Deployment Animation ── */
const DeployStep = ({ label, status, delay }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="flex items-center gap-4 py-3"
  >
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
      {status === 'done' ? (
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center"
        >
          <Check className="w-5 h-5 text-white" />
        </motion.div>
      ) : status === 'loading' ? (
        <div className="w-10 h-10 rounded-full border-[3px] border-zinc-200 border-t-zinc-900 animate-spin" />
      ) : (
        <div className="w-10 h-10 rounded-full border-2 border-zinc-200" />
      )}
    </div>
    <span className={`text-sm font-medium transition-colors ${
      status === 'done' ? 'text-emerald-700' : status === 'loading' ? 'text-zinc-900' : 'text-zinc-400'
    }`}>{label}</span>
  </motion.div>
);

const StepDeploying = ({ siteName, siteType, require2FA, features, deployStatus }) => {
  const typeConfig = SITE_TYPES.find(t => t.id === siteType);
  const bgImg = SITE_TYPE_BACKGROUNDS[siteType];
  const scrollRef = useRef(null);

  const deploySteps = [
    { id: 'rack', label: `Preparing rack space for ${siteName}...` },
    { id: 'env', label: `Deploying ${typeConfig?.label || 'server'} environment...` },
    { id: 'firewall', label: 'Setting up the firewall to keep it safe...' },
    ...(require2FA ? [{ id: '2fa', label: 'Deploying 2FA security policies...' }] : []),
    ...features.map(f => ({ id: f, label: `Enabling ${f.replace(/_/g, ' ')}...` })),
    { id: 'admin', label: 'Assigning site admin permissions...' },
    { id: 'final', label: 'Finalizing your environment...' },
  ];

  // Auto-scroll to the active step
  useEffect(() => {
    if (scrollRef.current) {
      const active = scrollRef.current.querySelector('[data-active="true"]');
      if (active) {
        active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [deployStatus]);

  return (
    <div className="text-center">
      {/* Background preview */}
      <div className="relative h-32 rounded-2xl overflow-hidden mb-6">
        <img src={bgImg} alt="" className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          {typeConfig && <typeConfig.icon className="w-5 h-5" style={{ color: typeConfig.color }} />}
          <span className="text-lg font-bold text-zinc-900">{siteName}</span>
        </div>
      </div>

      <h2 className="text-xl font-bold text-zinc-900 mb-1">Clara is deploying your server</h2>
      <p className="text-sm text-zinc-500 mb-6">This will only take a moment...</p>

      <div ref={scrollRef} className="text-left max-h-[280px] overflow-y-auto px-2">
        {deploySteps.map((step, i) => {
          const isActive = deployStatus === i;
          return (
            <div key={step.id} data-active={isActive ? 'true' : undefined}>
              <DeployStep
                label={step.label}
                status={deployStatus >= deploySteps.length ? 'done' : isActive ? 'loading' : deployStatus > i ? 'done' : 'pending'}
                delay={i * 0.1}
              />
            </div>
          );
        })}
      </div>

      {deployStatus >= deploySteps.length && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200"
        >
          <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold">
            <Zap className="w-5 h-5" />
            Your server is ready!
          </div>
        </motion.div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════
   MAIN WIZARD COMPONENT
   ════════════════════════════════════════════════════ */
export default function CreateMainSiteWizard({ open, onClose, onCreated, token, environments, selectedEnvId }) {
  const [step, setStep] = useState(0);
  const [siteType, setSiteType] = useState('radio');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminId, setAdminId] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [users, setUsers] = useState([]);
  const [deployStatus, setDeployStatus] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);

  const typeConfig = SITE_TYPES.find(t => t.id === siteType);
  const features = typeConfig?.features || [];

  // Auto-generate slug from name
  useEffect(() => {
    if (name && step === 1) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  }, [name, step]);

  // Fetch users for admin step
  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    if (open && step === 2) fetchUsers();
  }, [open, step, fetchUsers]);

  // Deploy process
  const totalDeploySteps = 4 + (require2FA ? 1 : 0) + features.length;

  const startDeploy = async () => {
    setDeploying(true);
    setDeployStatus(0);

    // Start the actual API call immediately in the background
    const envId = selectedEnvId || environments?.[0]?.id;
    const body = {
      name, slug, site_type: siteType,
      environment_id: envId,
      enabled_features: features,
    };
    const apiPromise = fetch(`${API}/api/main-sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    // Run the animation steps in parallel with the API call
    const stepDelays = [
      1800,  // Preparing rack space
      2500,  // Deploying environment
      2000,  // Setting up firewall
    ];
    const extraCount = (require2FA ? 1 : 0) + features.length + 2;
    for (let j = 0; j < extraCount; j++) {
      stepDelays.push(1200 + Math.random() * 1000);
    }

    for (let i = 0; i <= totalDeploySteps; i++) {
      const delay = stepDelays[i] || (1200 + Math.random() * 800);
      await new Promise(r => setTimeout(r, delay));
      // Don't finish the last step yet — wait for the API
      if (i < totalDeploySteps) {
        setDeployStatus(i + 1);
      }
    }

    // Animation is done — now wait for the API to actually finish
    try {
      const res = await apiPromise;
      if (res.ok) {
        // Site is now in the database and rack — mark final step done
        setDeployStatus(totalDeploySteps + 1);
        setDeployDone(true);
        setTimeout(() => { onCreated?.(); handleClose(); }, 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Failed to create site');
        setDeploying(false);
      }
    } catch (e) {
      alert('Network error');
      setDeploying(false);
    }
  };

  const handleClose = () => {
    setStep(0); setSiteType('radio'); setName(''); setSlug('');
    setAdminId(''); setRequire2FA(false); setDeployStatus(0);
    setDeploying(false); setDeployDone(false);
    onClose();
  };

  const canNext = () => {
    if (step === 0) return !!siteType;
    if (step === 1) return name.trim().length > 0 && slug.trim().length > 0;
    if (step === 2) return true; // admin is optional
    if (step === 3) return true;
    return false;
  };

  const handleNext = () => {
    if (step === 3) { setStep(4); startDeploy(); }
    else setStep(s => s + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !deploying) handleClose(); }}>
      <DialogContent hideClose className="bg-white border-zinc-200 max-w-3xl max-h-[92vh] overflow-hidden p-0 rounded-[24px] flex flex-col" data-testid="create-wizard-dialog">
        {/* Header with close */}
        <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
          <StepIndicator currentStep={step} totalSteps={5} />
          {!deploying && (
            <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Content - scrollable when needed */}
        <div className="px-8 pt-2 overflow-y-auto flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && <StepEnvironment selected={siteType} onSelect={setSiteType} />}
              {step === 1 && <StepDetails name={name} slug={slug} onNameChange={setName} onSlugChange={setSlug} siteType={siteType} />}
              {step === 2 && <StepAdmin adminId={adminId} onAdminChange={setAdminId} users={users} token={token} />}
              {step === 3 && <StepSecurity require2FA={require2FA} onToggle2FA={setRequire2FA} siteType={siteType} />}
              {step === 4 && <StepDeploying siteName={name} siteType={siteType} require2FA={require2FA} features={features} deployStatus={deployStatus} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer actions - always visible at bottom */}
        {step < 4 && (
          <div className="flex items-center justify-between px-8 py-4 border-t border-zinc-100 flex-shrink-0">
            <Button
              variant="ghost"
              onClick={() => step === 0 ? handleClose() : setStep(s => s - 1)}
              className="gap-2 text-zinc-500"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canNext()}
              className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-6 rounded-full"
              data-testid="wizard-next-btn"
            >
              {step === 3 ? (
                <>
                  <Zap className="w-4 h-4" /> Deploy Server
                </>
              ) : (
                <>
                  Continue <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
