/* eslint-disable */
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
        stroke="#dd0c51" strokeWidth={stroke}
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

  /* ── Start scans — wait for login wizard to finish ── */
  useEffect(() => {
    if (!token || !isAdmin) return;
    if (userPreferences?.show_login_scan === false) return;
    if (sessionStorage.getItem(sessionKey)) return;

    const headers = { Authorization: `Bearer ${token}` };

    const launchScans = () => {
      if (sessionStorage.getItem(sessionKey)) return; // guard against double-fire
      setView('popup');
      autoMinRef.current = setTimeout(() => {
        setView(prev => (prev === 'popup' ? 'minimized' : prev));
      }, 5000);

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
    };

    // Detect if a login wizard session was triggered
    const wizardWasTriggered = sessionStorage.getItem('login_wizard_shown') === 'true';

    if (!wizardWasTriggered && !document.querySelector('[data-testid="login-wizard"]')) {
      // No wizard was shown this session and none in DOM — safe to start immediately
      const t = setTimeout(launchScans, 1500);
      return () => { clearTimeout(t); if (autoMinRef.current) clearTimeout(autoMinRef.current); };
    }

    // Wizard was triggered — always wait for it to close
    const onWizardDone = () => {
      setTimeout(launchScans, 800);
    };
    window.addEventListener('clara-login-complete', onWizardDone, { once: true });

    // Fallback: if wizard never closes, start after 25s
    const fallback = setTimeout(launchScans, 25000);

    return () => {
      window.removeEventListener('clara-login-complete', onWizardDone);
      clearTimeout(fallback);
      if (autoMinRef.current) clearTimeout(autoMinRef.current);
    };
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

  /* ── Re-run scans ── */
  const rerunScans = useCallback(() => {
    const headers = { Authorization: `Bearer ${token}` };
    setHealthScan({ status: 'scanning', checks: [], hasIssues: false });
    setRackScan({ status: 'scanning', issues: [], summary: null });
    setVisibleChecks([]);
    setAutoFixMode(false);
    setAutoFixQueue([]);
    setAutoFixIdx(0);
    setAutoFixStatuses({});
    setAutoFixNeedsInput(false);
    setAutoFixNeedsConfirm(false);

    (async () => {
      try {
        const res = await fetch(`${API}/api/clara-test/health-scan`, { headers });
        if (res.ok) {
          const data = await res.json();
          setHealthScan({ status: 'done', checks: data.checks || [], hasIssues: data.has_issues, diagnosis: data.diagnosis });
        } else setHealthScan(prev => ({ ...prev, status: 'done' }));
      } catch { setHealthScan(prev => ({ ...prev, status: 'done' })); }
    })();

    (async () => {
      try {
        const res = await fetch(`${API}/api/clara-test/rack-scan`, { headers });
        if (res.ok) {
          const data = await res.json();
          setRackScan({ status: 'done', issues: data.issues || [], summary: data.summary });
        } else setRackScan(prev => ({ ...prev, status: 'done' }));
      } catch { setRackScan(prev => ({ ...prev, status: 'done' })); }
    })();
  }, [token]);

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
      // Guide complete — return to minimized so widget stays visible
      if (window.__claraGuide) window.__claraGuide.clear();
      setView('minimized');
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

  /* ══════════════════════════════════════════
     AUTO-FIX STATE & LOGIC (must be before early returns)
     ══════════════════════════════════════════ */
  const [autoFixMode, setAutoFixMode] = useState(false);
  const [autoFixQueue, setAutoFixQueue] = useState([]);
  const [autoFixIdx, setAutoFixIdx] = useState(0);
  const [autoFixStatuses, setAutoFixStatuses] = useState({});
  const [autoFixInput, setAutoFixInput] = useState({});
  const [autoFixNeedsInput, setAutoFixNeedsInput] = useState(false);

  const AUTO_FIXABLE = ['enable_firewall'];
  const CONFIRM_FIXABLE = ['enable_2fa'];
  const NEEDS_INPUT = ['configure_wordpress', 'configure_zerotier', 'configure_rds'];

  const INPUT_FIELDS = {
    configure_wordpress: [
      { key: 'wp_base_url', label: 'WordPress URL', placeholder: 'https://example.com' },
      { key: 'username', label: 'Username', placeholder: 'admin' },
      { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx' },
    ],
    configure_zerotier: [
      { key: 'api_token', label: 'ZeroTier API Token', placeholder: 'your-api-token' },
      { key: 'network_id', label: 'Network ID', placeholder: 'e.g. 8056c2e21c000001' },
    ],
    configure_rds: [
      { key: 'station_name', label: 'Station Name', placeholder: 'My Radio Station' },
      { key: 'stream_url', label: 'Stream URL', placeholder: 'https://stream.example.com/live' },
    ],
  };

  const [autoFixNeedsConfirm, setAutoFixNeedsConfirm] = useState(false);

  const startAutoFix = useCallback(() => {
    const queue = rackScan.issues.filter(i => AUTO_FIXABLE.includes(i.action) || CONFIRM_FIXABLE.includes(i.action) || NEEDS_INPUT.includes(i.action));
    if (queue.length === 0) return;
    setAutoFixQueue(queue);
    setAutoFixIdx(0);
    setAutoFixStatuses({});
    setAutoFixMode(true);
    setAutoFixNeedsInput(false);
    setAutoFixNeedsConfirm(false);
  }, [rackScan.issues]);

  const runAutoFix = useCallback(async (issue, idx) => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    setAutoFixStatuses(prev => ({ ...prev, [idx]: 'fixing' }));
    try {
      if (issue.action === 'enable_firewall') {
        const res = await fetch(`${API}/api/firewall/enable-rack`, {
          method: 'POST', headers,
          body: JSON.stringify({ site_ids: [issue.site_id], enabled: true }),
        });
        if (!res.ok) throw new Error('API error');
      } else if (issue.action === 'enable_2fa') {
        const res = await fetch(`${API}/api/main-sites/${issue.site_id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ require_2fa: true }),
        });
        if (!res.ok) throw new Error('API error');
      }
      setAutoFixStatuses(prev => ({ ...prev, [idx]: 'done' }));
    } catch {
      setAutoFixStatuses(prev => ({ ...prev, [idx]: 'error' }));
    }
  }, [token]);

  useEffect(() => {
    if (!autoFixMode || autoFixQueue.length === 0) return;
    if (autoFixIdx >= autoFixQueue.length) return;
    if (autoFixNeedsInput) return;
    if (autoFixNeedsConfirm) return;
    const issue = autoFixQueue[autoFixIdx];
    if (AUTO_FIXABLE.includes(issue.action)) {
      runAutoFix(issue, autoFixIdx).then(() => {
        setTimeout(() => setAutoFixIdx(prev => prev + 1), 600);
      });
    } else if (CONFIRM_FIXABLE.includes(issue.action)) {
      setAutoFixNeedsConfirm(true);
      setAutoFixStatuses(prev => ({ ...prev, [autoFixIdx]: 'confirm' }));
    } else if (NEEDS_INPUT.includes(issue.action)) {
      setAutoFixNeedsInput(true);
      setAutoFixStatuses(prev => ({ ...prev, [autoFixIdx]: 'input' }));
      setAutoFixInput({});
    } else {
      setAutoFixStatuses(prev => ({ ...prev, [autoFixIdx]: 'skipped' }));
      setTimeout(() => setAutoFixIdx(prev => prev + 1), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFixMode, autoFixIdx, autoFixNeedsInput, autoFixNeedsConfirm]);

  const submitAutoFixInput = useCallback(() => {
    setAutoFixStatuses(prev => ({ ...prev, [autoFixIdx]: 'done' }));
    setAutoFixNeedsInput(false);
    setAutoFixInput({});
    setTimeout(() => setAutoFixIdx(prev => prev + 1), 400);
  }, [autoFixIdx]);

  const skipAutoFixInput = useCallback(() => {
    setAutoFixStatuses(prev => ({ ...prev, [autoFixIdx]: 'skipped' }));
    setAutoFixNeedsInput(false);
    setAutoFixInput({});
    setTimeout(() => setAutoFixIdx(prev => prev + 1), 300);
  }, [autoFixIdx]);

  const confirmAutoFix = useCallback(() => {
    const issue = autoFixQueue[autoFixIdx];
    setAutoFixNeedsConfirm(false);
    runAutoFix(issue, autoFixIdx).then(() => {
      setTimeout(() => setAutoFixIdx(prev => prev + 1), 600);
    });
  }, [autoFixIdx, autoFixQueue, runAutoFix]);

  const skipAutoFixConfirm = useCallback(() => {
    setAutoFixStatuses(prev => ({ ...prev, [autoFixIdx]: 'skipped' }));
    setAutoFixNeedsConfirm(false);
    setTimeout(() => setAutoFixIdx(prev => prev + 1), 300);
  }, [autoFixIdx]);

  const autoFixDone = autoFixMode && autoFixIdx >= autoFixQueue.length;
  const autoFixCount = Object.values(autoFixStatuses).filter(s => s === 'done').length;

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
        className="fixed bottom-20 right-6 z-[100] cursor-pointer group"
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
        className="fixed bottom-20 right-6 z-[100] w-[380px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.16)] border border-zinc-200/70 flex flex-col overflow-hidden"
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
     EXPANDED VIEW — with fix buttons and Fix All
     ══════════════════════════════════════════ */

  /* ── Auto-fix overlay ── */
  if (autoFixMode) {
    const currentIssue = autoFixQueue[autoFixIdx];
    const fields = currentIssue ? INPUT_FIELDS[currentIssue.action] : null;

    return (
      <motion.div key="autofix"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
        className="fixed bottom-20 right-6 z-[100] w-[400px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.16)] border border-zinc-200/70 flex flex-col"
        style={{ maxHeight: 'min(560px, 72vh)' }}
        data-testid="clara-autofix"
      >
        {/* Progress bar */}
        <div className="h-1.5 bg-zinc-100 rounded-t-2xl overflow-hidden">
          <motion.div className="h-full bg-gradient-to-r from-orange-400 to-amber-400"
            animate={{ width: `${autoFixQueue.length > 0 ? ((autoFixIdx) / autoFixQueue.length) * 100 : 0}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Clara Auto-Fix</h3>
              <p className="text-xs text-zinc-400">
                {autoFixDone
                  ? `${autoFixCount} of ${autoFixQueue.length} fixed`
                  : `Fixing ${autoFixIdx + 1} of ${autoFixQueue.length}...`}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setAutoFixMode(false); setView('expanded'); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>

        {/* Action needed banner */}
        {!autoFixDone && (autoFixNeedsConfirm || autoFixNeedsInput) && currentIssue && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <Sparkles size={14} className="text-amber-500 flex-shrink-0" />
            <p className="text-[11px] font-semibold text-amber-700 flex-1 truncate">
              {autoFixNeedsConfirm ? 'Waiting for your confirmation' : 'Clara needs input'} — {currentIssue.site_name}
            </p>
            <button
              onClick={() => {
                document.getElementById('clara-autofix-action-panel')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
              }}
              className="text-[10px] font-bold text-amber-700 underline underline-offset-2 hover:text-amber-900"
            >
              Jump ↓
            </button>
          </div>
        )}

        {/* Issue list with statuses */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0" id="clara-autofix-list">
          {autoFixQueue.map((issue, i) => {
            const status = autoFixStatuses[i];
            return (
              <div
                key={i}
                ref={el => { if (el && i === autoFixIdx && !autoFixDone) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  i === autoFixIdx && !autoFixDone ? 'bg-orange-50 border border-orange-300 ring-2 ring-orange-200 shadow-sm' : 'bg-zinc-50 border border-transparent'
              }`}>
                {status === 'done' && <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />}
                {status === 'fixing' && <Loader2 size={16} className="animate-spin text-orange-500 flex-shrink-0" />}
                {status === 'error' && <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                {status === 'input' && <Sparkles size={16} className="text-orange-500 flex-shrink-0" />}
                {status === 'confirm' && <Shield size={16} className="text-orange-500 flex-shrink-0" />}
                {status === 'skipped' && <ArrowRight size={16} className="text-zinc-300 flex-shrink-0" />}
                {!status && <div className="w-4 h-4 rounded-full bg-zinc-200 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-700 truncate">{issue.title}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{issue.site_name}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input form when Clara needs credentials */}
        {autoFixNeedsInput && currentIssue && fields && (
          <div id="clara-autofix-action-panel" className="px-5 py-4 border-t border-orange-100 bg-orange-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-orange-500" />
              <p className="text-xs font-semibold text-zinc-700">
                Clara needs your input for {currentIssue.site_name}
              </p>
            </div>
            <div className="space-y-2">
              {fields.map(f => (
                <input
                  key={f.key}
                  type="text"
                  placeholder={f.placeholder}
                  value={autoFixInput[f.key] || ''}
                  onChange={e => setAutoFixInput(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-200 bg-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
                  data-testid={`autofix-input-${f.key}`}
                />
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={skipAutoFixInput}
                className="flex-1 text-xs py-2 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                Skip
              </button>
              <button onClick={submitAutoFixInput}
                className="flex-1 text-xs py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors shadow-sm"
              >
                Save & Continue
              </button>
            </div>
          </div>
        )}

        {/* Confirmation prompt (e.g. 2FA) */}
        {autoFixNeedsConfirm && currentIssue && (
          <div id="clara-autofix-action-panel" className="px-5 py-4 border-t border-orange-100 bg-orange-50/50">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={14} className="text-orange-500" />
              <p className="text-xs font-semibold text-zinc-700">
                {currentIssue.title}
              </p>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">
              Enable two-factor authentication for <strong>{currentIssue.site_name}</strong>? You can skip this if you don't want to enforce 2FA.
            </p>
            <div className="flex gap-2">
              <button onClick={skipAutoFixConfirm}
                className="flex-1 text-xs py-2 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 transition-colors"
                data-testid="autofix-skip-2fa"
              >
                Skip
              </button>
              <button onClick={confirmAutoFix}
                className="flex-1 text-xs py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors shadow-sm"
                data-testid="autofix-confirm-2fa"
              >
                Enable 2FA
              </button>
            </div>
          </div>
        )}

        {/* Done footer */}
        {autoFixDone && (
          <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
            <p className="text-xs text-zinc-500">{autoFixCount} issues resolved</p>
            <button
              onClick={() => { setAutoFixMode(false); setView('minimized'); }}
              className="text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div key="expanded"
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="fixed bottom-20 right-6 z-[100] w-[400px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.16)] border border-zinc-200/70 flex flex-col"
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
            <h3 className="text-sm font-bold text-zinc-900">Clara Scan</h3>
            <p className="text-[11px] text-zinc-400">
              {allDone ? totalIssues === 0 ? 'All systems healthy' : `${totalIssues} items found` : 'Running...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {allDone && (
            <button onClick={rerunScans}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
              data-testid="clara-scan-rerun"
              title="Re-run scans"
            >
              <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          )}
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
            <SIcon status={healthStatus} size={16} />
            <span className="text-xs font-semibold text-zinc-700">Health Scan</span>
            {hDone && (
              <span className="text-[11px] text-zinc-400 ml-auto">
                {healthScan.checks.filter(c => c.success).length}/{healthScan.checks.length} OK
              </span>
            )}
          </div>

          {healthScan.status === 'scanning' && (
            <div className="pl-7 flex items-center gap-2 text-xs text-zinc-400 py-1">
              <Loader2 size={13} className="animate-spin text-orange-400" />
              Testing connections...
            </div>
          )}

          <div className="space-y-1">
            {visibleChecks.map((check, i) => (
              <motion.div key={`hc-${i}`}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2.5 pl-7 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                {check.success
                  ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                  : <XCircle size={14} className="text-red-500 flex-shrink-0" />
                }
                <span className="text-xs text-zinc-700 truncate flex-1">{check.site}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                  check.type === 'wordpress' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                }`}>
                  {check.type === 'wordpress' ? 'WP' : 'RDS'}
                </span>
                {!check.success && check.site_slug && (
                  <button
                    onClick={() => startFixGuide({ ...check, action: check.type === 'wordpress' ? 'fix_wordpress' : 'fix_rds_stream' })}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 text-[10px] font-semibold hover:bg-orange-100 transition-all flex-shrink-0 border border-orange-200/50"
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
            <SIcon status={rackStatus} size={16} />
            <span className="text-xs font-semibold text-zinc-700">System Scan</span>
            {rDone && (
              <span className="text-[11px] text-zinc-400 ml-auto">
                {rackScan.summary?.total_sites || 0} sites
              </span>
            )}
          </div>

          {rackScan.status === 'scanning' && (
            <div className="pl-7 flex items-center gap-2 text-xs text-zinc-400 py-1">
              <Loader2 size={13} className="animate-spin text-orange-400" />
              Auditing configurations...
            </div>
          )}

          {rDone && rackIssueCount > 0 && (
            <div className="pl-7 space-y-1.5">
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
              {/* Issue items — always visible fix buttons, better readable */}
              {rackScan.issues.slice(0, 12).map((issue, i) => (
                <motion.div key={`ri-${i}`}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className="flex items-center gap-2.5 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  {issue.severity === 'critical' && <XCircle size={14} className="text-red-500 flex-shrink-0" />}
                  {issue.severity === 'warning' && <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />}
                  {issue.severity === 'info' && <CheckCircle2 size={14} className="text-blue-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-700 font-medium truncate">{issue.title}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{issue.site_name}</p>
                  </div>
                  {issue.action && FIX_GUIDES[issue.action] && (
                    <button
                      onClick={() => startFixGuide(issue)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 text-[10px] font-semibold hover:bg-orange-100 transition-all flex-shrink-0 border border-orange-200/50"
                      data-testid={`fix-issue-${i}`}
                    >
                      <Wrench size={10} />
                      Fix
                    </button>
                  )}
                </motion.div>
              ))}
              {rackScan.issues.length > 12 && (
                <p className="text-[10px] text-zinc-400 pt-1">+{rackScan.issues.length - 12} more...</p>
              )}
            </div>
          )}

          {rDone && rackIssueCount === 0 && (
            <div className="pl-7 flex items-center gap-2 py-1">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-xs text-zinc-500">All configurations OK</span>
            </div>
          )}
        </section>
      </div>

      {/* Footer with Fix All + Re-run */}
      <div className="px-4 py-3 border-t border-zinc-100 flex items-center gap-2 flex-shrink-0">
        {allDone && (
          <button
            onClick={rerunScans}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-semibold hover:bg-zinc-50 transition-colors"
            data-testid="clara-scan-rerun-footer"
          >
            <RotateCcw size={13} />
            Re-run
          </button>
        )}
        {rDone && rackIssueCount > 0 && (
          <button
            onClick={startAutoFix}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/20"
            data-testid="clara-fix-all"
          >
            <Sparkles size={14} />
            Fix all with Clara Assistant
          </button>
        )}
        <button onClick={handleDismiss}
          className="text-[11px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors px-2"
          data-testid="clara-scan-dismiss"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
