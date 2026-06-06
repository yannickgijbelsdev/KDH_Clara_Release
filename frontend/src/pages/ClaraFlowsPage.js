/* eslint-disable */
/**
 * Clara Flows — admin workflow builder dashboard.
 *
 * Layout
 * ──────
 *   ┌──────────────────┬────────────────────────────────────────────┐
 *   │ Flows sidebar    │ Editor / Empty state / Runs viewer         │
 *   │ (list + new btn) │                                            │
 *   └──────────────────┴────────────────────────────────────────────┘
 *
 * MVP-1 scope (per design discussion):
 *   • Lijst-based UI — no canvas drag-drop.
 *   • Triggers: manual, event, schedule, webhook.
 *   • Actions: email, http, in_app_notify, ai_llm, slack, telegram.
 *   • Templating `{{ trigger.x }}` & `{{ steps.step_N.y }}`.
 *   • Scoped per main site, admin-only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Bell,
  Bolt,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Play,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Card } from '../components/ui/card';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ACTION_ICONS = {
  email: Mail,
  http: Globe,
  in_app_notify: Bell,
  ai_llm: Sparkles,
  slack: MessageSquare,
  telegram: Send,
};

const TRIGGER_ICONS = {
  manual: Play,
  event: Bolt,
  schedule: Clock,
  webhook: Webhook,
};

function statusPill(status) {
  if (!status) return null;
  const map = {
    success: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    error: 'bg-red-500/15 text-red-600 border-red-500/30',
    skipped: 'bg-zinc-200 text-zinc-600 border-zinc-300',
    pending: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${map[status] || map.pending}`}>
      {status}
    </span>
  );
}

const ClaraFlowsPage = () => {
  const { mainSite: mainSiteSlug } = useParams();
  const navigate = useNavigate();
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [catalog, setCatalog] = useState({ triggers: [], actions: [] });
  const [creating, setCreating] = useState(false);

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    try {
      const [flowsRes, trgRes, actRes] = await Promise.all([
        axios.get(`${API}/clara-flows`),
        axios.get(`${API}/clara-flows/catalog/triggers`),
        axios.get(`${API}/clara-flows/catalog/actions`),
      ]);
      setFlows(flowsRes.data.flows || []);
      setCatalog({
        triggers: trgRes.data.triggers || [],
        actions: actRes.data.actions || [],
      });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not load Clara Flows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await axios.post(`${API}/clara-flows`, {
        name: 'New flow',
        trigger: { type: 'manual', config: {} },
        steps: [],
      });
      setFlows((prev) => [res.data, ...prev]);
      setSelectedId(res.data.id);
      toast.success('Flow created');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not create flow');
    } finally {
      setCreating(false);
    }
  };

  const selected = useMemo(
    () => flows.find((f) => f.id === selectedId) || null,
    [flows, selectedId],
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
              <button onClick={() => navigate(`/${mainSiteSlug}/dashboard`)} className="hover:text-zinc-900">
                {mainSiteSlug}
              </button>
              <ChevronRight className="w-3 h-3" />
              <span>Clara Flows</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 flex items-center gap-3">
              <Sparkles className="w-7 h-7 text-violet-500" />
              Clara Flows
            </h1>
            <p className="text-zinc-500 text-sm mt-1 max-w-xl">
              Visuele workflow-builder voor notificaties &amp; API flows. Verbind triggers (events, schedule, webhook) met acties (email, HTTP, AI, in-app, Slack, Telegram).
            </p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="bg-violet-600 hover:bg-violet-700 text-white"
            data-testid="create-flow-btn"
          >
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            New flow
          </Button>
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar — flow list */}
          <aside className="col-span-4 lg:col-span-3">
            <Card className="p-2 bg-white border-zinc-200">
              {loading ? (
                <div className="p-6 text-center text-zinc-400 text-sm">Loading…</div>
              ) : flows.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 text-sm">
                  No flows yet — click <strong className="text-zinc-700">New flow</strong> to start.
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {flows.map((f) => {
                    const TrgIcon = TRIGGER_ICONS[f.trigger?.type] || Bolt;
                    return (
                      <li key={f.id}>
                        <button
                          onClick={() => setSelectedId(f.id)}
                          className={`w-full text-left rounded-md px-3 py-2 flex items-start gap-2 transition-colors ${
                            selectedId === f.id ? 'bg-violet-50 border border-violet-200' : 'hover:bg-zinc-50 border border-transparent'
                          }`}
                          data-testid={`flow-item-${f.id}`}
                        >
                          <TrgIcon className={`w-4 h-4 mt-0.5 ${f.enabled ? 'text-violet-500' : 'text-zinc-300'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-zinc-900 truncate">{f.name || '(untitled)'}</div>
                            <div className="text-[11px] text-zinc-500 truncate">
                              {(f.steps || []).length} step{(f.steps || []).length === 1 ? '' : 's'}
                              {f.last_run_status && (
                                <>
                                  {' '}· {statusPill(f.last_run_status)}
                                </>
                              )}
                            </div>
                          </div>
                          {!f.enabled && (
                            <span className="text-[9px] uppercase tracking-wide bg-zinc-200 text-zinc-500 px-1.5 rounded">off</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </aside>

          {/* Main editor */}
          <section className="col-span-8 lg:col-span-9">
            {selected ? (
              <FlowEditor
                key={selected.id}
                flow={selected}
                catalog={catalog}
                onChange={(updated) =>
                  setFlows((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
                }
                onDelete={() => {
                  setFlows((prev) => prev.filter((f) => f.id !== selected.id));
                  setSelectedId(null);
                }}
              />
            ) : (
              <Card className="p-10 bg-white border-zinc-200 text-center">
                <Sparkles className="w-10 h-10 text-violet-300 mx-auto mb-2" />
                <h2 className="text-zinc-700 font-medium">Selecteer een flow links of maak een nieuwe</h2>
                <p className="text-zinc-500 text-sm mt-1">Een Clara Flow combineert één trigger met een reeks acties.</p>
              </Card>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

// ─── Flow editor ─────────────────────────────────────────────────────────

const FlowEditor = ({ flow, catalog, onChange, onDelete }) => {
  const [draft, setDraft] = useState(flow);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState([]);
  const [tab, setTab] = useState('editor');
  const dirty = JSON.stringify(draft) !== JSON.stringify(flow);

  useEffect(() => {
    setDraft(flow);
  }, [flow]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  const fetchRuns = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/clara-flows/${flow.id}/runs`);
      setRuns(res.data.runs || []);
    } catch (e) {
      // Silent — empty history is fine.
    }
  }, [flow.id]);

  useEffect(() => {
    if (tab === 'runs') fetchRuns();
  }, [tab, fetchRuns]);

  const updateDraft = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const updateTrigger = (patch) =>
    setDraft((d) => ({ ...d, trigger: { ...(d.trigger || {}), ...patch } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/clara-flows/${flow.id}`, {
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
        trigger: draft.trigger,
        steps: draft.steps,
      });
      onChange(res.data);
      toast.success('Flow saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    if (dirty) {
      toast.error('Save first before running');
      return;
    }
    setRunning(true);
    try {
      const res = await axios.post(`${API}/clara-flows/${flow.id}/execute`, {
        payload: { manual: true, ts: new Date().toISOString() },
      });
      onChange({ ...flow, last_run_at: res.data.finished_at, last_run_status: res.data.status });
      if (res.data.status === 'success') {
        toast.success(`Flow executed in ${res.data.duration_ms}ms`);
      } else {
        toast.error(res.data.error || 'Flow execution failed');
      }
      setTab('runs');
      fetchRuns();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete flow "${flow.name}"? This also removes its run history.`)) return;
    try {
      await axios.delete(`${API}/clara-flows/${flow.id}`);
      toast.success('Flow deleted');
      onDelete();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  const addStep = (actionType) => {
    setDraft((d) => ({
      ...d,
      steps: [
        ...(d.steps || []),
        {
          id: `tmp-${Date.now()}`,
          type: actionType,
          name: catalog.actions.find((a) => a.type === actionType)?.label || actionType,
          enabled: true,
          stop_on_error: true,
          config: {},
        },
      ],
    }));
  };

  const updateStep = (idx, patch) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));

  const updateStepConfig = (idx, key, value) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) =>
        i === idx ? { ...s, config: { ...(s.config || {}), [key]: value } } : s,
      ),
    }));

  const removeStep = (idx) =>
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== idx) }));

  const triggerSchema = useMemo(
    () => catalog.triggers.find((t) => t.type === draft.trigger?.type),
    [catalog.triggers, draft.trigger?.type],
  );

  return (
    <Card className="bg-white border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-zinc-100 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <input
            value={draft.name || ''}
            onChange={(e) => updateDraft({ name: e.target.value })}
            placeholder="Flow name"
            className="text-xl font-semibold text-zinc-900 bg-transparent outline-none border-none w-full"
            data-testid="flow-name-input"
          />
          <Textarea
            value={draft.description || ''}
            onChange={(e) => updateDraft({ description: e.target.value })}
            placeholder="What does this flow do?"
            className="mt-1 text-sm text-zinc-500 bg-transparent border-none focus-visible:ring-0 resize-none p-0 min-h-0"
            rows={2}
            data-testid="flow-description-input"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.enabled !== false}
              onCheckedChange={(v) => updateDraft({ enabled: v })}
              data-testid="flow-enabled-toggle"
            />
            <span className="text-xs text-zinc-600">{draft.enabled !== false ? 'Enabled' : 'Disabled'}</span>
          </div>
          <Button onClick={handleRunNow} disabled={running || dirty} variant="outline" className="border-zinc-300 text-zinc-700" data-testid="run-flow-btn">
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run now
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving} className="bg-violet-600 hover:bg-violet-700 text-white" data-testid="save-flow-btn">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
          <Button onClick={handleDelete} variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" data-testid="delete-flow-btn">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-100 px-5 flex gap-1">
        {[
          { id: 'editor', label: 'Editor', icon: Bolt },
          { id: 'runs', label: 'Executions', icon: Activity },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-violet-500 text-violet-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
            data-testid={`tab-${id}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Editor body */}
      {tab === 'editor' && (
        <div className="p-5 space-y-6">
          {/* Trigger */}
          <section>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Trigger</div>
            <div className="border border-zinc-200 rounded-lg p-4 bg-zinc-50">
              <div className="flex flex-wrap gap-2 mb-3">
                {catalog.triggers.map((t) => {
                  const Icon = TRIGGER_ICONS[t.type] || Bolt;
                  const active = draft.trigger?.type === t.type;
                  return (
                    <button
                      key={t.type}
                      onClick={() => updateTrigger({ type: t.type, config: {} })}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                        active
                          ? 'bg-violet-50 border-violet-300 text-violet-700'
                          : 'bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-50'
                      }`}
                      data-testid={`trigger-type-${t.type}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {triggerSchema?.description && (
                <p className="text-xs text-zinc-500 mb-3">{triggerSchema.description}</p>
              )}
              {triggerSchema?.config_schema?.map((field) => (
                <FieldRenderer
                  key={field.key}
                  field={field}
                  value={draft.trigger?.config?.[field.key]}
                  onChange={(v) => updateTrigger({ config: { ...(draft.trigger?.config || {}), [field.key]: v } })}
                />
              ))}
              {draft.trigger?.type === 'webhook' && flow.webhook_token && (
                <div className="bg-white border border-zinc-200 rounded-md p-3 mt-2">
                  <Label className="text-[11px] text-zinc-500">Webhook URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs font-mono text-zinc-800 break-all flex-1">
                      {API}/clara-flows/webhooks/{flow.webhook_token}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`${API}/clara-flows/webhooks/${flow.webhook_token}`);
                        toast.success('URL copied');
                      }}
                      data-testid="copy-webhook-btn"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    POST any JSON body to this URL — the payload is available as <code>{'{{ trigger.* }}'}</code> in your steps.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Steps */}
          <section>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
              Steps ({(draft.steps || []).length})
            </div>
            <div className="space-y-3">
              {(draft.steps || []).map((step, idx) => (
                <StepCard
                  key={step.id || idx}
                  step={step}
                  index={idx}
                  catalog={catalog}
                  onChange={(patch) => updateStep(idx, patch)}
                  onConfigChange={(k, v) => updateStepConfig(idx, k, v)}
                  onRemove={() => removeStep(idx)}
                />
              ))}
            </div>

            {/* Add step picker */}
            <div className="mt-3 border border-dashed border-zinc-300 rounded-lg p-3 bg-zinc-50">
              <div className="text-[11px] text-zinc-500 mb-2">Add an action</div>
              <div className="flex flex-wrap gap-2">
                {catalog.actions.map((a) => {
                  const Icon = ACTION_ICONS[a.type] || Bolt;
                  return (
                    <button
                      key={a.type}
                      onClick={() => addStep(a.type)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                      data-testid={`add-step-${a.type}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === 'runs' && <RunsList runs={runs} />}
    </Card>
  );
};

const StepCard = ({ step, index, catalog, onChange, onConfigChange, onRemove }) => {
  const schema = catalog.actions.find((a) => a.type === step.type);
  const Icon = ACTION_ICONS[step.type] || Bolt;
  return (
    <div className="border border-zinc-200 rounded-lg bg-white" data-testid={`step-${index}`}>
      <div className="flex items-center justify-between gap-3 p-3 border-b border-zinc-100">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[11px] font-medium">
            {index + 1}
          </span>
          <Icon className="w-4 h-4 text-zinc-500" />
          <Input
            value={step.name || ''}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={schema?.label || step.type}
            className="border-none p-0 text-sm focus-visible:ring-0 bg-transparent flex-1"
            data-testid={`step-name-${index}`}
          />
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">{schema?.label || step.type}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={step.enabled !== false}
            onCheckedChange={(v) => onChange({ enabled: v })}
            data-testid={`step-enabled-${index}`}
          />
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0" onClick={onRemove} data-testid={`step-remove-${index}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {schema?.config_schema?.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={step.config?.[field.key]}
            onChange={(v) => onConfigChange(field.key, v)}
            templatingHint
          />
        ))}
      </div>
    </div>
  );
};

const FieldRenderer = ({ field, value, onChange, templatingHint = false }) => {
  const id = `field-${field.key}`;
  const hint = field.templating && templatingHint
    ? 'Templates: {{ trigger.x }}, {{ steps.step_1.y }}'
    : '';

  if (field.type === 'select') {
    return (
      <div>
        <Label htmlFor={id} className="text-[11px] text-zinc-600">{field.label}{field.required && ' *'}</Label>
        <select
          id={id}
          value={value ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full bg-white border border-zinc-300 rounded-md text-sm px-3 py-2"
        >
          <option value="">— select —</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {hint && <p className="text-[10px] text-zinc-400 mt-0.5">{hint}</p>}
      </div>
    );
  }
  if (field.type === 'multi-select') {
    const arr = Array.isArray(value) ? value : (field.default || []);
    return (
      <div>
        <Label className="text-[11px] text-zinc-600">{field.label}</Label>
        <div className="flex flex-wrap gap-1 mt-1">
          {field.options.map((opt) => {
            const active = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onChange(active ? arr.filter((x) => x !== opt) : [...arr, opt])
                }
                className={`text-[11px] px-2 py-1 rounded border ${
                  active
                    ? 'bg-violet-50 border-violet-300 text-violet-700'
                    : 'bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-xs text-zinc-700">
        <input
          type="checkbox"
          checked={value ?? field.default ?? false}
          onChange={(e) => onChange(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        {field.label}
      </label>
    );
  }
  if (field.type === 'textarea') {
    return (
      <div>
        <Label htmlFor={id} className="text-[11px] text-zinc-600">{field.label}{field.required && ' *'}</Label>
        <Textarea
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={5}
          className="mt-1 bg-white border-zinc-300 text-sm font-mono"
        />
        {hint && <p className="text-[10px] text-zinc-400 mt-0.5">{hint}</p>}
      </div>
    );
  }
  if (field.type === 'json') {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
    return (
      <div>
        <Label className="text-[11px] text-zinc-600">{field.label}</Label>
        <Textarea
          value={text}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value || '{}'));
            } catch {
              onChange(e.target.value);
            }
          }}
          rows={3}
          className="mt-1 bg-white border-zinc-300 text-sm font-mono"
        />
      </div>
    );
  }
  return (
    <div>
      <Label htmlFor={id} className="text-[11px] text-zinc-600">{field.label}{field.required && ' *'}</Label>
      <Input
        id={id}
        value={value ?? field.default ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="mt-1 bg-white border-zinc-300 text-sm"
      />
      {hint && <p className="text-[10px] text-zinc-400 mt-0.5">{hint}</p>}
    </div>
  );
};

const RunsList = ({ runs }) => {
  if (!runs || runs.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-400 text-sm">
        No executions yet — run the flow manually or wait for a trigger.
      </div>
    );
  }
  return (
    <div className="divide-y divide-zinc-100">
      {runs.map((r) => (
        <RunRow key={r.id} run={r} />
      ))}
    </div>
  );
};

const RunRow = ({ run }) => {
  const [open, setOpen] = useState(false);
  const dt = run.started_at ? new Date(run.started_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' }) : '';
  return (
    <div className="px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
        data-testid={`run-row-${run.id}`}
      >
        {run.status === 'success' ? (
          <Check className="w-4 h-4 text-emerald-500" />
        ) : (
          <X className="w-4 h-4 text-red-500" />
        )}
        <span className="text-sm text-zinc-700 flex-1">{dt}</span>
        <span className="text-xs text-zinc-500">{run.duration_ms}ms</span>
        {statusPill(run.status)}
        <ChevronRight className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 ml-7 space-y-1.5">
          {(run.steps || []).map((s) => (
            <div key={s.id || s.label} className="flex items-start gap-2 text-xs">
              {s.status === 'success' && <Check className="w-3 h-3 mt-0.5 text-emerald-500" />}
              {s.status === 'error' && <X className="w-3 h-3 mt-0.5 text-red-500" />}
              {s.status === 'skipped' && <span className="w-3 h-3 mt-0.5 inline-block rounded-full bg-zinc-300" />}
              <span className="font-medium text-zinc-700">{s.label}</span>
              <span className="text-zinc-500">· {s.type}</span>
              {s.error && <span className="text-red-600 break-all">— {s.error}</span>}
              <span className="ml-auto text-zinc-400">{s.duration_ms}ms</span>
            </div>
          ))}
          {run.error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-2">
              {run.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClaraFlowsPage;
