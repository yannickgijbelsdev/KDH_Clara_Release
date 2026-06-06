/* eslint-disable */
import { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, Loader2, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PendingSetupBanner({ mainSite, token, apis, onRefresh }) {
  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  const [name, setName] = useState(mainSite?.name || '');
  const [envId, setEnvId] = useState(mainSite?.environment_id || '');
  const [environments, setEnvironments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!headers) return;
    axios.get(`${API}/api/environments`, { headers })
      .then((r) => setEnvironments(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [token]); // eslint-disable-line

  const isPlaceholderName = !name || name.trim().toLowerCase() === 'untitled clara custom site';
  const apisConnected = apis.length > 0 && apis.every((a) => a.last_health_check?.status === 'connected');

  const stepName = !isPlaceholderName;
  const stepEnv = !!envId;
  const stepEndpoints = apisConnected;
  const allDone = stepName && stepEnv && stepEndpoints;

  const saveChanges = async () => {
    if (!headers) return;
    setSaving(true);
    try {
      const patch = {};
      if (name && name !== mainSite.name) patch.name = name.trim();
      if (envId && envId !== mainSite.environment_id) patch.environment_id = envId;
      if (Object.keys(patch).length === 0) {
        toast.info('Nothing to save');
        setSaving(false);
        return;
      }
      await axios.put(`${API}/api/main-sites/${mainSite.id}`, patch, { headers });
      toast.success('Setup updated');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const verifyEndpoints = async () => {
    if (!headers) return;
    setChecking(true);
    try {
      await axios.post(`${API}/api/clara-custom/check-all`, null, {
        params: { main_site_id: mainSite.id }, headers,
      });
      toast.success('Endpoints verified');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Verification failed');
    } finally {
      setChecking(false);
    }
  };

  const dismissPending = async () => {
    if (!headers) return;
    setDismissing(true);
    try {
      await axios.put(`${API}/api/main-sites/${mainSite.id}`, {
        pending_setup: false,
        pending_setup_steps: [],
      }, { headers });
      toast.success('Setup complete — site is now active');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to finalize');
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden" data-testid="pending-setup-banner">
      <div className="px-5 py-4 border-b border-amber-200 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-amber-900">Auto-discovered site — setup incomplete</h3>
          <p className="text-xs text-amber-800/80 mt-0.5">
            This Clara Custom site was registered automatically from <code className="px-1 py-0.5 bg-white/60 rounded text-[11px]">{mainSite.discovered_url || 'an external project'}</code>.
            Complete the steps below to activate it.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Step 1 — Name */}
        <div className="flex items-start gap-3">
          <StepDot done={stepName} />
          <div className="flex-1">
            <p className="text-xs font-semibold text-zinc-700 mb-1">Give the site a clear name</p>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Koodh Media Group — Marketing Site"
                className="bg-white"
                data-testid="setup-name-input"
              />
            </div>
          </div>
        </div>

        {/* Step 2 — Environment */}
        <div className="flex items-start gap-3">
          <StepDot done={stepEnv} />
          <div className="flex-1">
            <p className="text-xs font-semibold text-zinc-700 mb-1">Assign to environment / rack</p>
            <Select value={envId || ''} onValueChange={setEnvId}>
              <SelectTrigger className="bg-white" data-testid="setup-env-select">
                <SelectValue placeholder="Select environment…" />
              </SelectTrigger>
              <SelectContent>
                {environments.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Step 3 — Verify endpoints */}
        <div className="flex items-start gap-3">
          <StepDot done={stepEndpoints} />
          <div className="flex-1">
            <p className="text-xs font-semibold text-zinc-700 mb-1">Verify endpoints respond correctly</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-600">
                {apis.length === 0
                  ? 'No endpoints imported yet — they will appear here after auto-import completes.'
                  : `${apis.filter((a) => a.last_health_check?.status === 'connected').length} / ${apis.length} connected`}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={verifyEndpoints}
                disabled={checking || apis.length === 0}
                className="ml-auto"
                data-testid="setup-verify-btn"
              >
                {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify now'}
              </Button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-amber-200/60">
          <p className="text-[11px] text-amber-800/80">
            {allDone ? 'All steps complete — finalize to remove this banner.' : 'Complete the checklist, then click Finalize.'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={saveChanges}
              disabled={saving}
              className="gap-1.5"
              data-testid="setup-save-btn"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
            <Button
              size="sm"
              onClick={dismissPending}
              disabled={!allDone || dismissing}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 !text-white [&_svg]:!text-white"
              data-testid="setup-finalize-btn"
            >
              {dismissing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Finalize setup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDot({ done }) {
  return (
    <div className={`mt-1 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500' : 'bg-amber-300/60 border-2 border-amber-500'}`}>
      {done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
    </div>
  );
}
