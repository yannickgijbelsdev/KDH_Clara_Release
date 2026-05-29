import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  CheckCircle2, Circle, Loader2, ArrowRight, LifeBuoy, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_ICONS = {
  done: { icon: CheckCircle2, color: 'text-emerald-500' },
  current: { icon: Loader2, color: 'text-amber-500 animate-spin', spinning: true },
  todo: { icon: Circle, color: 'text-zinc-300' },
};

/**
 * SetupStepsCard — onboarding checklist for a Clara Custom integration.
 * Shown inline above each integration; collapsible.
 */
export default function SetupStepsCard({ integrationId, token, onActionDone }) {
  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [busyAction, setBusyAction] = useState(null);

  const load = useCallback(async () => {
    if (!headers || !integrationId) return;
    try {
      const r = await axios.get(`${API}/api/clara-custom/integrations/${integrationId}/setup-steps`, { headers });
      setData(r.data);
    } catch (e) {
      // silent — guide is optional
    } finally {
      setLoading(false);
    }
  }, [integrationId, token]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

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
      onActionDone?.();
      load();
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
          <p className="text-sm font-semibold text-zinc-900">
            Setup guide {allDone && <span className="text-emerald-600">— all done</span>}
          </p>
          <p className="text-[11px] text-zinc-500">{done} of {total} steps complete · concrete actions to get this integration working</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-violet-100/60 space-y-3 bg-white/60">
          {data.steps.map((step) => {
            const meta = STATUS_ICONS[step.status] || STATUS_ICONS.todo;
            const Icon = meta.icon;
            return (
              <div key={step.id} className="flex items-start gap-3" data-testid={`step-${step.id}`}>
                <div className="pt-0.5 flex-shrink-0">
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.status === 'done' ? 'text-zinc-500 line-through' : 'text-zinc-900'}`}>
                    {step.title}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{step.description}</p>

                  {step.crucial && step.support_topic && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                      <LifeBuoy className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] text-amber-900">{step.support_topic}</p>
                        <a
                          href={`mailto:${data.support_email || 'support@koodh.com'}?subject=Clara%20Custom%20Setup%20-%20${encodeURIComponent(step.title)}`}
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
                    onClick={() => runAction(step)}
                    disabled={busyAction === step.id}
                    className="gap-1.5 flex-shrink-0"
                    data-testid={`step-action-${step.id}`}
                  >
                    {busyAction === step.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    {step.action.label}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
