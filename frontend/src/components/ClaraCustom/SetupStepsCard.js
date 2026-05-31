import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, ArrowRight, LifeBuoy, ChevronDown, ChevronUp, Sparkles, RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Step row in the LoginWizard popup style:
 *   - done    → emerald circle with white check
 *   - current → spinning ring (zinc base, dark top)
 *   - todo    → empty bordered circle
 */
const StepRow = ({ step, busy, onAction, supportEmail, delay = 0 }) => {
  const status = busy ? 'loading' : step.status === 'done' ? 'done' : step.status === 'current' ? 'loading' : 'todo';
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex items-start gap-3 py-2"
      data-testid={`step-${step.id}`}
    >
      <div className="pt-0.5 flex-shrink-0">
        {status === 'done' ? (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center"
          >
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </motion.div>
        ) : status === 'loading' ? (
          <div className="w-7 h-7 rounded-full border-[2.5px] border-zinc-200 border-t-[#7c1ac8] animate-spin" />
        ) : (
          <div className="w-7 h-7 rounded-full border-2 border-zinc-200 bg-white" />
        )}
      </div>

      <div className="flex-1 min-w-0 pt-1">
        <p className={`text-sm font-medium leading-tight ${
          status === 'done' ? 'text-emerald-700 line-through decoration-emerald-300/60'
          : status === 'loading' ? 'text-zinc-900' : 'text-zinc-400'
        }`}>
          {step.title}
        </p>
        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{step.description}</p>

        {step.crucial && step.support_topic && (
          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <LifeBuoy className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[11px] text-amber-900">{step.support_topic}</p>
              <a
                href={`mailto:${supportEmail || 'support@koodh.com'}?subject=Clara%20Custom%20Setup%20-%20${encodeURIComponent(step.title)}`}
                className="text-[11px] font-semibold text-amber-700 underline mt-1 inline-block"
                data-testid={`support-link-${step.id}`}
              >
                Contact Clara Support →
              </a>
            </div>
          </div>
        )}
      </div>

      {step.action && step.status !== 'done' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(step)}
          disabled={busy}
          className="gap-1.5 flex-shrink-0 mt-0.5"
          data-testid={`step-action-${step.id}`}
        >
          {busy
            ? <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-300 border-t-zinc-700 animate-spin" />
            : <ArrowRight className="w-3.5 h-3.5" />}
          {step.action.label}
        </Button>
      )}
    </motion.div>
  );
};


/**
 * SetupStepsCard — onboarding checklist for a Clara Custom integration.
 * Popup-wizard style step list with live auto-polling.
 */
export default function SetupStepsCard({ integrationId, token, onActionDone }) {
  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const lastSnapshotRef = useRef('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!headers || !integrationId) return;
    try {
      const r = await axios.get(`${API}/api/clara-custom/integrations/${integrationId}/setup-steps`, { headers });
      // Only re-render if something actually changed (prevents flicker on polling)
      const snapshot = JSON.stringify(r.data?.steps?.map((s) => [s.id, s.status]) || []);
      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setData(r.data);
      }
    } catch (e) {
      // silent — guide is optional
    } finally {
      if (!silent) setLoading(false);
    }
  }, [integrationId, token]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // Auto-poll every 6s for live status updates (cheap GET, no full-page refresh)
  useEffect(() => {
    if (!integrationId) return;
    const i = setInterval(() => load({ silent: true }), 6000);
    return () => clearInterval(i);
  }, [integrationId, load]);

  const runAction = async (step) => {
    if (!step.action) return;
    setBusyAction(step.id);
    try {
      const map = {
        check: 'check', approve: 'approve', import: 'import-remote', promote: 'promote',
      };
      const path = map[step.action.type];
      if (!path) return;
      const r = await axios.post(`${API}/api/clara-custom/integrations/${integrationId}/${path}`, null, { headers });
      toast.success(r.data?.message || `${step.action.label} done`);
      // Reload steps live — DO NOT propagate to parent (avoids full-page list refresh)
      lastSnapshotRef.current = '';
      await load({ silent: true });
      // Let parent know in case it wants to refresh metadata (e.g. status pill).
      // Parent should reload silently — not show its loading spinner.
      onActionDone?.({ silent: true });
    } catch (e) {
      toast.error(e.response?.data?.detail || `${step.action.label} failed`);
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) return null;
  if (!data) return null;

  const done = data.steps.filter((s) => s.status === 'done').length;
  const total = data.steps.length;
  const allDone = done === total;
  const progressPct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/60 overflow-hidden" data-testid={`setup-steps-${integrationId}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/40 transition-colors text-left"
        data-testid={`setup-toggle-${integrationId}`}
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7c1ac8] to-[#dd0c51] flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900">
              Setup guide {allDone && <span className="text-emerald-600">— all done</span>}
            </p>
            {!allDone && (
              <span className="inline-flex items-center gap-1 text-[10px] text-violet-700 bg-violet-100 rounded-full px-1.5 py-0.5 font-semibold">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> live
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
              <motion.div
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-[#7c1ac8] to-[#dd0c51]"
              />
            </div>
            <p className="text-[11px] text-zinc-500 font-medium whitespace-nowrap">{done} / {total}</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t border-violet-100/60 bg-white/60 divide-y divide-violet-100/50">
              {data.steps.map((step, idx) => (
                <StepRow
                  key={step.id}
                  step={step}
                  busy={busyAction === step.id}
                  onAction={runAction}
                  supportEmail={data.support_email}
                  delay={idx * 0.04}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
