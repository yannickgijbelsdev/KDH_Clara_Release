import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, Loader2, X, Sparkles,
  Shield, Activity, Minimize2, AlertTriangle, ChevronRight,
  Wrench, ArrowRight, ArrowLeft, RotateCcw, Play
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

/* ══════════════════════════════════════════════════
   FIX GUIDE STEP DEFINITIONS
   ══════════════════════════════════════════════════ */
const FIX_GUIDES = {
  enable_firewall: {
    title: 'Enable Firewall',
    steps: [
      {
        instruction: 'Open the Sites Overview where you can see your server racks.',
        navigate: '/',
        highlightDelay: 1200,
      },
      {
        instruction: 'Click on the rack that contains this site to open the rack detail panel.',
        highlightElement: 'server-rack',
        highlightText: 'Click on this rack to see firewall options',
      },
      {
        instruction: 'In the rack detail, click the firewall toggle to enable Clara Global Protect for all sites.',
        highlightElement: 'rack-firewall-toggle',
        highlightText: 'Toggle this to enable the firewall',
      },
    ],
  },
  configure_wordpress: {
    title: 'Configure WordPress',
    steps: [
      {
        instruction: 'Opening the WordPress settings page for this site...',
        navigate: '/{slug}/wordpress',
        highlightDelay: 1500,
      },
      {
        instruction: 'Click "Add WordPress Connection" and enter your WordPress URL, username, and application password.',
        highlightElement: 'add-wordpress',
        highlightText: 'Click here to add a WordPress connection',
      },
    ],
  },
  configure_zerotier: {
    title: 'Configure ZeroTier',
    steps: [
      {
        instruction: 'Opening the ZeroTier settings page for this site...',
        navigate: '/{slug}/zerotier',
        highlightDelay: 1500,
      },
      {
        instruction: 'Enter your ZeroTier API Token and Network ID, then save the configuration.',
        highlightElement: 'zerotier-config',
        highlightText: 'Enter your ZeroTier credentials here',
      },
    ],
  },
  configure_rds: {
    title: 'Configure RDS Stations',
    steps: [
      {
        instruction: 'Opening the RDS settings page for this site...',
        navigate: '/{slug}/rds',
        highlightDelay: 1500,
      },
      {
        instruction: 'Add a new station by entering the station name, code, stream URL, and stream type.',
        highlightElement: 'add-station',
        highlightText: 'Add your first RDS station here',
      },
    ],
  },
  enable_2fa: {
    title: 'Enable Two-Factor Authentication',
    steps: [
      {
        instruction: 'Opening the team settings for this site...',
        navigate: '/{slug}/team',
        highlightDelay: 1500,
      },
      {
        instruction: 'Find the security section and enable "Require 2FA" to enforce two-factor authentication for all team members.',
        highlightElement: 'require-2fa',
        highlightText: 'Enable this setting to require 2FA',
      },
    ],
  },
  configure_geo: {
    title: 'Review Geo-Blocking',
    steps: [
      {
        instruction: 'Open the Sites Overview to access rack firewall settings.',
        navigate: '/',
        highlightDelay: 1200,
      },
      {
        instruction: 'Click on the rack, then open the Firewall panel to review and customize the geo-blocking rules.',
        highlightElement: 'server-rack',
        highlightText: 'Click on this rack to manage geo-blocking',
      },
    ],
  },
  fix_wordpress: {
    title: 'Fix WordPress Connection',
    steps: [
      {
        instruction: 'Opening the WordPress settings to check the connection...',
        navigate: '/{slug}/wordpress',
        highlightDelay: 1500,
      },
      {
        instruction: 'Verify your WordPress URL, username, and application password are correct. Update credentials if needed.',
        highlightElement: 'wordpress-connection',
        highlightText: 'Check and update your credentials here',
      },
    ],
  },
  fix_rds_stream: {
    title: 'Fix RDS Stream',
    steps: [
      {
        instruction: 'Opening the RDS settings to check the stream...',
        navigate: '/{slug}/rds',
        highlightDelay: 1500,
      },
      {
        instruction: 'Verify the stream URL is correct and the stream server is online. Test the connection.',
        highlightElement: 'rds-stream-url',
        highlightText: 'Check and update your stream URL',
      },
    ],
  },
};

/* ══════════════════════════════════════════════════
   UI BUILDING BLOCKS
   ══════════════════════════════════════════════════ */

function ProgressRing({ progress, size = 36, stroke = 3, className = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  return (
    <svg width={size} height={size} className={`-rotate-90 ${className}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4e4e7" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#f97316" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

function SIcon({ status, size = 15 }) {
  if (status === 'scanning') return <Loader2 size={size} className="animate-spin text-orange-500" />;
  if (status === 'success') return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (status === 'error') return <XCircle size={size} className="text-red-500" />;
  if (status === 'warning') return <AlertTriangle size={size} className="text-amber-500" />;
  return <div style={{ width: size, height: size }} className="rounded-full bg-zinc-200" />;
}

function ScanRow({ label, sublabel, icon, status, detail }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50/80 border border-zinc-100">
      <SIcon status={status} size={18} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-sm font-medium text-zinc-800">{label}</span>
        </div>
        <p className="text-[10px] text-zinc-400 mt-0.5">{sublabel}</p>
      </div>
      {detail && <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap">{detail}</span>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN WIDGET
   ══════════════════════════════════════════════════ */
export default function ClaraScanWidget({ token, isAdmin, userPreferences }) {
  const [view, setView] = useState('hidden');
  const [healthScan, setHealthScan] = useState({ status: 'idle', checks: [], hasIssues: false });
  const [rackScan, setRackScan] = useState({ status: 'idle', issues: [], summary: null });
  const [visibleChecks, setVisibleChecks] = useState([]);
  const autoMinRef = useRef(null);

  /* ── Fix Guide state ── */
  const [guideIssue, setGuideIssue] = useState(null);
  const [guideSteps, setGuideSteps] = useState([]);
  const [guideStep, setGuideStep] = useState(0);
  const [guideStepStatus, setGuideStepStatus] = useState([]); // 'pending' | 'active' | 'done'

  const sessionKey = 'clara_scan_this_session';

  /* derived */
  const hDone = healthScan.status === 'done';
  const rDone = rackScan.status === 'done';
  const completedScans = [hDone, rDone].filter(Boolean).length;
  const progress = (completedScans / 2) * 100;
  const allDone = completedScans === 2;
  const healthFailed = healthScan.checks.filter(c => !c.success).length;
  const rackIssueCount = rackScan.summary?.total_issues || 0;
  const totalIssues = healthFailed + rackIssueCount;

  const healthStatus = !hDone
    ? (healthScan.status === 'scanning' ? 'scanning' : 'idle')
    : healthScan.hasIssues ? 'error' : 'success';
  const rackStatus = !rDone
    ? (rackScan.status === 'scanning' ? 'scanning' : 'idle')
    : rackIssueCount > 0 ? 'warning' : 'success';

  /* ── Start scans ── */
  useEffect(() => {
    if (!token || !isAdmin) return;
    // Respect user preference (default: enabled)
    if (userPreferences?.show_login_scan === false) return;
    // Don't re-run if already dismissed in this browser session
    if (sessionStorage.getItem(sessionKey)) return;

    setView('popup');
    autoMinRef.current = setTimeout(() => {
      setView(prev => (prev === 'popup' ? 'minimized' : prev));
    }, 5000);

    const headers = { Authorization: `Bearer ${token}` };

    (async () => {
      setHealthScan(prev => ({ ...prev, status: 'scanning' }));
      try {
        const res = await fetch(`${API}/api/clara-test/health-scan`, { headers });
        if (res.ok) {
          const data = await res.json();
          setHealthScan({ status: 'done', checks: data.checks || [], hasIssues: data.has_issues, diagnosis: data.diagnosis });
        } else setHealthScan(prev => ({ ...prev, status: 'done' }));
      } catch { setHealthScan(prev => ({ ...prev, status: 'done' })); }
    })();

    (async () => {
      setRackScan(prev => ({ ...prev, status: 'scanning' }));
      try {
        const res = await fetch(`${API}/api/clara-test/rack-scan`, { headers });
        if (res.ok) {
          const data = await res.json();
          setRackScan({ status: 'done', issues: data.issues || [], summary: data.summary });
        } else setRackScan(prev => ({ ...prev, status: 'done' }));
      } catch { setRackScan(prev => ({ ...prev, status: 'done' })); }
    })();

    return () => { if (autoMinRef.current) clearTimeout(autoMinRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  /* ── Animate health checks ── */
  useEffect(() => {
    if (healthScan.status !== 'done' || healthScan.checks.length === 0) return;
    const timers = healthScan.checks.map((check, i) =>
      setTimeout(() => setVisibleChecks(prev => [...prev, check]), i * 120)
    );
    return () => timers.forEach(clearTimeout);
  }, [healthScan.status, healthScan.checks]);

  /* ── Dismiss ── */
  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(sessionKey, 'done');
    setView('dismissed');
    setGuideIssue(null);
  }, [sessionKey]);

  /* auto-dismiss when all OK */
  useEffect(() => {
    if (allDone && totalIssues === 0 && view !== 'dismissed') {
      const t = setTimeout(handleDismiss, 4000);
      return () => clearTimeout(t);
    }
  }, [allDone, totalIssues, view, handleDismiss]);

  /* ══════════════════════════════════════════
     FIX GUIDE LOGIC
     ══════════════════════════════════════════ */

  const startFixGuide = useCallback((issue) => {
    const actionKey = issue.action || (issue.type === 'wordpress' ? 'fix_wordpress' : 'fix_rds_stream');
    const guide = FIX_GUIDES[actionKey];
    if (!guide) return;

    const slug = issue.site_slug || '';
    const steps = guide.steps.map(step => ({
      ...step,
      navigate: step.navigate ? step.navigate.replace('{slug}', slug) : null,
    }));

    setGuideIssue({ ...issue, guideTitle: guide.title });
    setGuideSteps(steps);
    setGuideStep(0);
    setGuideStepStatus(steps.map((_, i) => (i === 0 ? 'active' : 'pending')));
    setView('guide');
  }, []);

  /* Execute current guide step */
  useEffect(() => {
    if (view !== 'guide' || guideSteps.length === 0) return;
    const step = guideSteps[guideStep];
    if (!step) return;

    // Navigate if step has a route
    if (step.navigate) {
      window.dispatchEvent(new CustomEvent('clara-navigate', { detail: { path: step.navigate } }));
    }

    // Highlight after navigation settles
    const delay = step.highlightDelay || (step.navigate ? 1800 : 400);
    const timer = setTimeout(() => {
      if (step.highlightElement && window.__claraGuide) {
        window.__claraGuide.highlight(
          step.highlightElement,
          step.highlightText || step.instruction
        );
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [view, guideStep, guideSteps]);

  const advanceGuideStep = useCallback(() => {
    // Mark current as done
    setGuideStepStatus(prev => {
      const next = [...prev];
      next[guideStep] = 'done';
      if (guideStep + 1 < next.length) next[guideStep + 1] = 'active';
      return next;
    });

    if (guideStep + 1 < guideSteps.length) {
      setGuideStep(guideStep + 1);
    } else {
      // Guide complete
      if (window.__claraGuide) window.__claraGuide.clear();
      setView('expanded');
      setGuideIssue(null);
    }
  }, [guideStep, guideSteps]);

  const goBackGuideStep = useCallback(() => {
    if (guideStep > 0) {
      if (window.__claraGuide) window.__claraGuide.clear();
      setGuideStepStatus(prev => {
        const next = [...prev];
        next[guideStep] = 'pending';
        next[guideStep - 1] = 'active';
        return next;
      });
      setGuideStep(guideStep - 1);
    }
  }, [guideStep]);

  const cancelGuide = useCallback(() => {
    if (window.__claraGuide) window.__claraGuide.clear();
    setView('expanded');
    setGuideIssue(null);
  }, []);

  if (view === 'hidden' || view === 'dismissed') return null;

  /* ══════════════════════════════════════════
     POPUP VIEW
     ══════════════════════════════════════════ */
  if (view === 'popup') {
    return (
      <AnimatePresence>
        <motion.div
          key="popup"
          initial={{ opacity: 0, y: 40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.92 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          data-testid="clara-scan-popup"
        >
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-zinc-200/60 w-[420px] pointer-events-auto">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  {!allDone && (
                    <div className="absolute -top-1 -right-1">
                      <ProgressRing progress={progress} size={20} stroke={2.5} />
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">Clara System Scan</h2>
                  <p className="text-[11px] text-zinc-400">
                    {allDone
                      ? totalIssues === 0 ? 'All systems healthy' : `${totalIssues} item${totalIssues !== 1 ? 's' : ''} found`
                      : 'Scanning infrastructure...'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { clearTimeout(autoMinRef.current); setView('minimized'); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
                data-testid="clara-scan-popup-minimize"
              >
                <Minimize2 className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <ScanRow label="Health Scan" sublabel="WordPress & RDS connections"
                icon={<Activity size={13} className="text-zinc-400" />} status={healthStatus}
                detail={hDone ? `${healthScan.checks.filter(c => c.success).length}/${healthScan.checks.length} OK` : null}
              />
              <ScanRow label="System Scan" sublabel="Firewalls, configs & security"
                icon={<Shield size={13} className="text-zinc-400" />} status={rackStatus}
                detail={rDone ? `${rackIssueCount} issue${rackIssueCount !== 1 ? 's' : ''}` : null}
              />
            </div>
            <div className="h-1 bg-zinc-100 rounded-b-2xl overflow-hidden">
              <motion.div className="h-full bg-gradient-to-r from-orange-400 to-amber-400"
                initial={{ width: '0%' }} animate={{ width: allDone ? '100%' : `${progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  /* ══════════════════════════════════════════
     MINIMIZED VIEW
     ══════════════════════════════════════════ */
  if (view === 'minimized') {
    return (
      <motion.div key="minimized"
        initial={{ opacity: 0, x: 80, scale: 0.7 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        className="fixed bottom-6 right-6 z-[100] cursor-pointer group"
        onClick={() => setView('expanded')}
        data-testid="clara-scan-minimized"
      >
        <div className="bg-white rounded-2xl shadow-xl border border-zinc-200/70 pl-3 pr-4 py-2.5 flex items-center gap-3 group-hover:shadow-2xl transition-all group-hover:border-orange-200">
          <div className="relative flex-shrink-0">
            {!allDone ? (
              <div className="relative">
                <ProgressRing progress={progress} size={36} stroke={3} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles size={14} className="text-orange-500" />
                </div>
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-800 leading-tight">
              {allDone ? 'Scan Complete' : `Scanning ${completedScans}/2...`}
            </p>
            <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
              {allDone ? totalIssues === 0 ? 'All OK' : `${totalIssues} items` : 'Tap to expand'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 ml-1">
            <SIcon status={healthStatus} size={13} />
            <SIcon status={rackStatus} size={13} />
          </div>
          <ChevronRight size={14} className="text-zinc-300 group-hover:text-orange-400 transition-colors ml-0.5" />
        </div>
      </motion.div>
    );
  }

  /* ══════════════════════════════════════════
     FIX GUIDE VIEW — step-by-step wizard
     ══════════════════════════════════════════ */
  if (view === 'guide' && guideIssue) {
    const step = guideSteps[guideStep];
    const isLastStep = guideStep === guideSteps.length - 1;
    const guideProgress = ((guideStep + 1) / guideSteps.length) * 100;

    return (
      <motion.div key="guide"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        className="fixed bottom-6 right-6 z-[100] w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.16)] border border-zinc-200/70 flex flex-col overflow-hidden"
        data-testid="clara-fix-guide"
      >
        {/* Progress bar */}
        <div className="h-1 bg-zinc-100">
          <motion.div className="h-full bg-gradient-to-r from-orange-400 to-amber-400"
            animate={{ width: `${guideProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow shadow-orange-500/20">
              <Wrench className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-zinc-900">{guideIssue.guideTitle}</h3>
              <p className="text-[10px] text-zinc-400">{guideIssue.site_name || guideIssue.site}</p>
            </div>
          </div>
          <button onClick={cancelGuide}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
            data-testid="clara-guide-cancel"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>

        {/* Step content */}
        <div className="px-4 py-4">
          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-4">
            {guideSteps.map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, borderRadius: '50%' }}
                  className={`flex items-center justify-center text-xs font-bold transition-all ${
                    guideStepStatus[i] === 'done'
                      ? 'bg-emerald-100 text-emerald-600'
                      : guideStepStatus[i] === 'active'
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                        : 'bg-zinc-100 text-zinc-400'
                  }`}
                >
                  {guideStepStatus[i] === 'done'
                    ? <CheckCircle2 size={14} />
                    : i + 1
                  }
                </div>
                {i < guideSteps.length - 1 && (
                  <div className={`rounded-full transition-colors ${
                    guideStepStatus[i] === 'done' ? 'bg-emerald-300' : 'bg-zinc-200'
                  }`} style={{ width: 32, height: 2 }} />
                )}
              </div>
            ))}
          </div>

          {/* Current step instruction */}
          <AnimatePresence mode="wait">
            <motion.div
              key={guideStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="bg-zinc-50 rounded-xl p-4 border border-zinc-100"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={12} className="text-orange-500" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                    Step {guideStep + 1} of {guideSteps.length}
                  </p>
                  <p className="text-sm text-zinc-700 leading-relaxed">
                    {step?.instruction}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 border-t border-zinc-100 flex items-center justify-between">
          <button
            onClick={guideStep > 0 ? goBackGuideStep : cancelGuide}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
            data-testid="clara-guide-back"
          >
            <ArrowLeft size={13} />
            {guideStep > 0 ? 'Back' : 'Cancel'}
          </button>
          <button
            onClick={advanceGuideStep}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/20"
            data-testid="clara-guide-next"
          >
            {isLastStep ? (
              <>
                <CheckCircle2 size={13} />
                Done
              </>
            ) : (
              <>
                Next
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      </motion.div>
    );
  }

  /* ══════════════════════════════════════════
     EXPANDED VIEW — with fix buttons
     ══════════════════════════════════════════ */
  return (
    <motion.div key="expanded"
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="fixed bottom-6 right-6 z-[100] w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.16)] border border-zinc-200/70 flex flex-col"
      style={{ maxHeight: 'min(560px, 72vh)' }}
      data-testid="clara-scan-expanded"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            {!allDone ? (
              <div className="relative">
                <ProgressRing progress={progress} size={32} stroke={2.5} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles size={12} className="text-orange-500" />
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow shadow-orange-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-zinc-900">Clara Scan</h3>
            <p className="text-[10px] text-zinc-400">
              {allDone ? totalIssues === 0 ? 'All systems healthy' : `${totalIssues} items found` : 'Running...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setView('minimized')}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
            data-testid="clara-scan-exp-minimize"
          >
            <Minimize2 className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <button onClick={handleDismiss}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
            data-testid="clara-scan-exp-close"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {/* ── Health Scan ── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <SIcon status={healthStatus} size={15} />
            <span className="text-xs font-semibold text-zinc-700">Health Scan</span>
            {hDone && (
              <span className="text-[10px] text-zinc-400 ml-auto">
                {healthScan.checks.filter(c => c.success).length}/{healthScan.checks.length} OK
              </span>
            )}
          </div>

          {healthScan.status === 'scanning' && (
            <div className="pl-6 flex items-center gap-2 text-xs text-zinc-400 py-1">
              <Loader2 size={12} className="animate-spin text-orange-400" />
              Testing connections...
            </div>
          )}

          <div className="space-y-0.5">
            {visibleChecks.map((check, i) => (
              <motion.div key={`hc-${i}`}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 pl-6 py-1 group/item"
              >
                {check.success
                  ? <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                  : <XCircle size={13} className="text-red-500 flex-shrink-0" />
                }
                <span className="text-xs text-zinc-600 truncate flex-1">{check.site}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                  check.type === 'wordpress' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                }`}>
                  {check.type === 'wordpress' ? 'WP' : 'RDS'}
                </span>
                {/* Fix button for failed checks */}
                {!check.success && check.site_slug && (
                  <button
                    onClick={() => startFixGuide({
                      ...check,
                      action: check.type === 'wordpress' ? 'fix_wordpress' : 'fix_rds_stream',
                    })}
                    className="opacity-0 group-hover/item:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-600 text-[10px] font-medium hover:bg-orange-100 transition-all flex-shrink-0"
                    data-testid={`fix-health-${i}`}
                  >
                    <Wrench size={10} />
                    Fix
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── System / Rack Scan ── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <SIcon status={rackStatus} size={15} />
            <span className="text-xs font-semibold text-zinc-700">System Scan</span>
            {rDone && (
              <span className="text-[10px] text-zinc-400 ml-auto">
                {rackScan.summary?.total_sites || 0} sites
              </span>
            )}
          </div>

          {rackScan.status === 'scanning' && (
            <div className="pl-6 flex items-center gap-2 text-xs text-zinc-400 py-1">
              <Loader2 size={12} className="animate-spin text-orange-400" />
              Auditing configurations...
            </div>
          )}

          {rDone && rackIssueCount > 0 && (
            <div className="pl-6 space-y-1">
              {/* Severity badges */}
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {rackScan.summary?.critical > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                    {rackScan.summary.critical} critical
                  </span>
                )}
                {rackScan.summary?.warnings > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-medium">
                    {rackScan.summary.warnings} warnings
                  </span>
                )}
                {rackScan.summary?.info > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">
                    {rackScan.summary.info} info
                  </span>
                )}
              </div>
              {/* Issue items with fix buttons */}
              {rackScan.issues.slice(0, 10).map((issue, i) => (
                <motion.div key={`ri-${i}`}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.25 }}
                  className="flex items-center gap-2 py-1 group/issue"
                >
                  {issue.severity === 'critical' && <XCircle size={12} className="text-red-500 flex-shrink-0" />}
                  {issue.severity === 'warning' && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
                  {issue.severity === 'info' && <CheckCircle2 size={12} className="text-blue-400 flex-shrink-0" />}
                  <span className="text-[11px] text-zinc-600 truncate flex-1">{issue.title}</span>
                  <span className="text-[10px] text-zinc-400 flex-shrink-0 max-w-[60px] truncate">{issue.site_name}</span>
                  {/* Fix button */}
                  {issue.action && FIX_GUIDES[issue.action] && (
                    <button
                      onClick={() => startFixGuide(issue)}
                      className="opacity-0 group-hover/issue:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-600 text-[10px] font-medium hover:bg-orange-100 transition-all flex-shrink-0"
                      data-testid={`fix-issue-${i}`}
                    >
                      <Wrench size={10} />
                      Fix
                    </button>
                  )}
                </motion.div>
              ))}
              {rackScan.issues.length > 10 && (
                <p className="text-[10px] text-zinc-400 pt-1">+{rackScan.issues.length - 10} more...</p>
              )}
            </div>
          )}

          {rDone && rackIssueCount === 0 && (
            <div className="pl-6 flex items-center gap-2 py-1">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span className="text-xs text-zinc-500">All configurations OK</span>
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-zinc-100 flex items-center justify-between flex-shrink-0">
        <p className="text-[10px] text-zinc-300">
          {allDone ? 'Hover over an item to fix it' : `${completedScans}/2 scans done`}
        </p>
        <button onClick={handleDismiss}
          className="text-[11px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
          data-testid="clara-scan-dismiss"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
