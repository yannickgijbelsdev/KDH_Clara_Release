import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  ChevronLeft, ChevronRight, X, Zap, Server, Check, Loader2,
  Crown
} from 'lucide-react';
import { toast } from 'sonner';
import WizardStepIndicator from './WizardStepIndicator';

const API = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
const ENV_STEPS = ['General', 'Settings', 'Admin', 'Deploying'];
const ENV_BG_IMAGE = '/images/env_server.jpg';

/* ── Deploy Step (matching MainSite wizard style) ── */
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

/* ════════════════════════════════════════
   Step 0: General Info
   ════════════════════════════════════════ */
function StepGeneral({ name, slug, description, onNameChange, onSlugChange, onDescChange }) {
  const autoSlug = (val) => {
    onNameChange(val);
    onSlugChange(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-900 mb-1">Create Environment</h2>
      <p className="text-sm text-zinc-500 mb-6">Give your new environment a name and identifier.</p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-zinc-700">Name</Label>
            <Input
              value={name}
              onChange={e => autoSlug(e.target.value)}
              placeholder="e.g. Staging"
              className="mt-1 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
              data-testid="env-wizard-name"
            />
          </div>
          <div>
            <Label className="text-zinc-700">Slug</Label>
            <Input
              value={slug}
              onChange={e => onSlugChange(e.target.value)}
              placeholder="staging"
              className="mt-1 bg-white border-zinc-300 text-zinc-900 font-mono placeholder:text-zinc-400"
              data-testid="env-wizard-slug"
            />
          </div>
        </div>
        <div>
          <Label className="text-zinc-700">Description (optional)</Label>
          <Input
            value={description}
            onChange={e => onDescChange(e.target.value)}
            placeholder="Testing & development environment"
            className="mt-1 bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
          />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Step 1: Settings (Color + Max Racks)
   ════════════════════════════════════════ */
function StepSettings({ color, maxRacks, onColorChange, onMaxRacksChange }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-900 mb-1">Environment Settings</h2>
      <p className="text-sm text-zinc-500 mb-6">Configure the look and capacity of this environment.</p>
      <div className="space-y-6">
        <div>
          <Label className="text-zinc-700">Color</Label>
          <p className="text-xs text-zinc-400 mt-0.5 mb-2">Choose a color to identify this environment.</p>
          <div className="flex gap-3">
            {DEFAULT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => onColorChange(c)}
                className={`w-9 h-9 rounded-full border-2 transition-all ${
                  color === c ? 'border-zinc-900 scale-110 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
                data-testid={`color-${c}`}
              />
            ))}
          </div>
        </div>
        <div>
          <Label className="text-zinc-700">Maximum Racks</Label>
          <p className="text-xs text-zinc-400 mt-0.5 mb-2">How many server racks are allowed in this environment?</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-0 bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <button
                onClick={() => onMaxRacksChange(Math.max(1, maxRacks - 1))}
                className="px-3 py-2 text-zinc-500 hover:bg-zinc-50 transition-colors font-bold text-lg"
              >
                -
              </button>
              <span className="px-5 py-2 text-lg font-bold text-zinc-900 tabular-nums min-w-[48px] text-center" data-testid="max-racks-value">
                {maxRacks}
              </span>
              <button
                onClick={() => onMaxRacksChange(Math.min(50, maxRacks + 1))}
                className="px-3 py-2 text-zinc-500 hover:bg-zinc-50 transition-colors font-bold text-lg"
              >
                +
              </button>
            </div>
            <span className="text-sm text-zinc-500">rack{maxRacks !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-2 mt-3">
            {[1, 3, 5, 10, 20].map(v => (
              <button
                key={v}
                onClick={() => onMaxRacksChange(v)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  maxRacks === v ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Step 2: Admin Assignment
   ════════════════════════════════════════ */
function StepAdmin({ adminId, onAdminChange, users, token }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-900 mb-1">Assign Admin</h2>
      <p className="text-sm text-zinc-500 mb-6">Choose who will manage this environment (optional).</p>
      <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
        <button
          onClick={() => onAdminChange('')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
            !adminId ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${!adminId ? 'bg-blue-500 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
            <Crown className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-medium text-zinc-900">No specific admin</span>
            <p className="text-xs text-zinc-400">System admins will manage</p>
          </div>
        </button>
        {users.map(u => (
          <button
            key={u.id}
            onClick={() => onAdminChange(u.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              adminId === u.id ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-semibold text-xs">
              {u.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="text-sm font-medium text-zinc-900">{u.name}</span>
              <p className="text-xs text-zinc-400">{u.email}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Step 3: Deploy Animation
   ════════════════════════════════════════ */
function StepDeploying({ envName, color, maxRacks, deployStatus }) {
  const scrollRef = useRef(null);

  const deploySteps = [
    { id: 'init', label: `Initializing environment "${envName}"...` },
    { id: 'network', label: 'Configuring network isolation...' },
    { id: 'racks', label: `Provisioning ${maxRacks} rack slot${maxRacks !== 1 ? 's' : ''}...` },
    { id: 'security', label: 'Setting up security policies...' },
    { id: 'permissions', label: 'Configuring admin permissions...' },
    { id: 'final', label: 'Finalizing environment...' },
  ];

  useEffect(() => {
    if (scrollRef.current) {
      const active = scrollRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [deployStatus]);

  const allDone = deployStatus >= deploySteps.length;

  return (
    <div className="text-center">
      {/* Hero background image */}
      <div className="relative h-32 rounded-2xl overflow-hidden mb-6">
        <img src={ENV_BG_IMAGE} alt="" className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          <Server className="w-5 h-5" style={{ color }} />
          <span className="text-lg font-bold text-zinc-900">{envName}</span>
        </div>
      </div>

      <h2 className="text-xl font-bold text-zinc-900 mb-1">
        {allDone ? 'Environment is ready!' : 'Clara is deploying your environment'}
      </h2>
      <p className="text-sm text-zinc-500 mb-6">
        {allDone ? 'Your environment is live and ready to use.' : 'This will only take a moment...'}
      </p>

      <div ref={scrollRef} className="text-left max-h-[280px] overflow-y-auto px-2">
        {deploySteps.map((step, i) => {
          const isActive = deployStatus === i;
          return (
            <div key={step.id} data-active={isActive ? 'true' : undefined}>
              <DeployStep
                label={step.label}
                status={allDone ? 'done' : isActive ? 'loading' : deployStatus > i ? 'done' : 'pending'}
                delay={i * 0.1}
              />
            </div>
          );
        })}
      </div>

      {allDone && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200"
        >
          <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold">
            <Zap className="w-5 h-5" />
            Your environment is ready!
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   Main Wizard
   ════════════════════════════════════════ */
export default function CreateEnvironmentWizard({ open, onClose, onCreated, token }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [maxRacks, setMaxRacks] = useState(5);
  const [adminId, setAdminId] = useState('');
  const [users, setUsers] = useState([]);

  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState(0);
  const [deployDone, setDeployDone] = useState(false);

  const totalDeploySteps = 5; // 6 steps, 0-indexed last = 5

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setUsers(await res.json());
    } catch {}
  }, [token]);

  useEffect(() => { if (open) fetchUsers(); }, [open, fetchUsers]);

  const handleClose = () => {
    if (deploying && !deployDone) return;
    setStep(0); setName(''); setSlug(''); setDescription(''); setColor('#3b82f6'); setMaxRacks(5); setAdminId('');
    setDeploying(false); setDeployStatus(0); setDeployDone(false);
    onClose();
  };

  const canNext = () => {
    if (step === 0) return name.trim() && slug.trim();
    return true;
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(s => s + 1);
      if (step === 2) setTimeout(() => startDeploy(), 100);
    }
  };

  const startDeploy = async () => {
    setDeploying(true);
    setDeployStatus(0);

    // Start API call in background
    const apiPromise = fetch(`${API}/api/environments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, slug, description, color, max_racks: maxRacks }),
    });

    // Run animation
    const stepDelays = [1800, 2500, 2000, 1500, 1200, 1800];
    for (let i = 0; i <= totalDeploySteps; i++) {
      const delay = stepDelays[i] || 1500;
      await new Promise(r => setTimeout(r, delay));
      if (i < totalDeploySteps) setDeployStatus(i + 1);
    }

    // Wait for API
    try {
      const res = await apiPromise;
      if (res.ok) {
        const envData = await res.json();
        // If admin selected, add them
        if (adminId) {
          await fetch(`${API}/api/environments/${envData.id}/admins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ user_id: adminId }),
          }).catch(() => {});
        }
        setDeployStatus(totalDeploySteps + 1);
        setDeployDone(true);
        setTimeout(() => { onCreated?.(); handleClose(); }, 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed to create environment');
        setDeploying(false);
        setStep(0);
      }
    } catch {
      toast.error('Network error');
      setDeploying(false);
      setStep(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent hideClose className="bg-white border-zinc-200 max-w-xl max-h-[92vh] overflow-hidden p-0 rounded-[24px] flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.1)]" data-testid="create-env-wizard">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
          <WizardStepIndicator currentStep={step} steps={ENV_STEPS} />
          {!deploying && (
            <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-8 pt-2 overflow-y-auto flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && <StepGeneral name={name} slug={slug} description={description} onNameChange={setName} onSlugChange={setSlug} onDescChange={setDescription} />}
              {step === 1 && <StepSettings color={color} maxRacks={maxRacks} onColorChange={setColor} onMaxRacksChange={setMaxRacks} />}
              {step === 2 && <StepAdmin adminId={adminId} onAdminChange={setAdminId} users={users} token={token} />}
              {step === 3 && <StepDeploying envName={name} color={color} maxRacks={maxRacks} deployStatus={deployStatus} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        {step < 3 && (
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
              className="gap-2 bg-zinc-900 hover:bg-zinc-900 text-white px-6 rounded-full"
              data-testid="env-wizard-next-btn"
            >
              {step === 2 ? (
                <><Zap className="w-4 h-4" /> Deploy Environment</>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
