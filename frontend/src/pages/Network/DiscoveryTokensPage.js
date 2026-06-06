/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../../components/ui/alert-dialog';
import {
  Key, Plus, Copy, Trash2, CheckCircle2, AlertCircle, Loader2, Radar,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function DiscoveryTokensPage() {
  const { token } = useAuth();
  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;

  const [tokens, setTokens] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [envId, setEnvId] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

  // Token-just-created reveal
  const [revealedToken, setRevealedToken] = useState(null);
  const [revealedMeta, setRevealedMeta] = useState(null);

  // Revoke
  const [revokeTarget, setRevokeTarget] = useState(null);

  const load = useCallback(async () => {
    if (!headers) return;
    setLoading(true);
    try {
      const [t, e] = await Promise.all([
        axios.get(`${API}/api/clara-custom/discovery-tokens`, { headers }),
        axios.get(`${API}/api/environments`, { headers }),
      ]);
      setTokens(Array.isArray(t.data) ? t.data : []);
      setEnvironments(Array.isArray(e.data) ? e.data : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!envId) {
      toast.error('Select an environment');
      return;
    }
    setCreating(true);
    try {
      const r = await axios.post(`${API}/api/clara-custom/discovery-tokens`, {
        environment_id: envId, label,
      }, { headers });
      setRevealedToken(r.data.token);
      setRevealedMeta({
        environment_name: r.data.environment_name,
        label: r.data.label,
        discovery_url: `${API}/api/clara-custom/discover`,
      });
      setCreateOpen(false);
      setEnvId('');
      setLabel('');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    try {
      await axios.delete(`${API}/api/clara-custom/discovery-tokens/${revokeTarget.id}`, { headers });
      toast.success('Token revoked');
      setRevokeTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to revoke');
    }
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="min-h-full bg-[#F0F0F2] p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c1ac8] to-[#dd0c51] flex items-center justify-center text-white shadow-sm">
              <Radar className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Clara Custom — Discovery Tokens</h1>
              <p className="text-xs text-zinc-500">Auto-register external Emergent projects as Clara Custom sites</p>
            </div>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-[#7c1ac8] hover:bg-[#6b14b0] !text-white [&_svg]:!text-white"
            data-testid="create-token-btn"
          >
            <Plus className="w-4 h-4" /> Generate token
          </Button>
        </div>

        {/* How it works */}
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-2">How auto-discovery works</h3>
          <ol className="text-xs text-zinc-600 space-y-1.5 list-decimal pl-5">
            <li>Generate a token for the environment where new sites should land.</li>
            <li>Copy the token + discovery URL into the external Emergent project's <code>.env</code>.</li>
            <li>The external site posts to <code>/api/clara-custom/discover</code> on startup.</li>
            <li>Clara auto-creates a pending Clara Custom site with an <span className="text-amber-600 font-semibold">!</span> badge.</li>
            <li>Complete the setup checklist (name, endpoints) to activate it.</li>
          </ol>
        </div>

        {/* Tokens list */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>
        ) : tokens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center">
            <Key className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-zinc-900 mb-1">No discovery tokens yet</h3>
            <p className="text-sm text-zinc-500 mb-4">Generate one to start auto-discovering external projects.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
            {tokens.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-4" data-testid={`token-row-${t.id}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${t.revoked ? 'bg-zinc-100' : 'bg-emerald-50'}`}>
                  {t.revoked ? <AlertCircle className="w-4 h-4 text-zinc-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{t.label}</p>
                    {t.revoked && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 uppercase font-semibold">Revoked</span>}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    <code className="text-zinc-700">{t.token_masked}</code> · {t.environment_name} · used {t.use_count || 0}×
                    {t.last_used_at && <> · last used {new Date(t.last_used_at).toLocaleString()}</>}
                  </p>
                </div>
                {!t.revoked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevokeTarget(t)}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
                    data-testid={`revoke-token-${t.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate discovery token</DialogTitle>
              <DialogDescription>External projects using this token will auto-register in the selected environment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Environment</Label>
                <Select value={envId} onValueChange={setEnvId}>
                  <SelectTrigger data-testid="env-select"><SelectValue placeholder="Select environment…" /></SelectTrigger>
                  <SelectContent>
                    {environments.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Koodh Production websites" data-testid="label-input" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button onClick={create} disabled={creating || !envId} className="gap-2 bg-[#7c1ac8] hover:bg-[#6b14b0] !text-white [&_svg]:!text-white" data-testid="confirm-create-btn">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Revealed token (one-shot) */}
        <Dialog open={!!revealedToken} onOpenChange={(v) => !v && setRevealedToken(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Token generated
              </DialogTitle>
              <DialogDescription>Copy this now — it will not be shown again.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                ⚠️ This is your only chance to copy the raw token. Clara stores it hashed.
              </div>
              <CopyableField label="Discovery URL" value={revealedMeta?.discovery_url || ''} onCopy={copy} />
              <CopyableField label="Discovery token" value={revealedToken || ''} onCopy={copy} mono />
              <div className="rounded-lg bg-zinc-900 text-zinc-100 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto">
                <p className="text-zinc-400 mb-1"># Add to your external project's backend/.env:</p>
                <p>CLARA_DISCOVERY_URL={revealedMeta?.discovery_url}</p>
                <p>CLARA_DISCOVERY_TOKEN={revealedToken}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setRevealedToken(null)} data-testid="dismiss-token-btn">Done</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Revoke confirm */}
        <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
              <AlertDialogDescription>
                External projects still using <strong>{revokeTarget?.label}</strong> will no longer be able to register or update themselves.
                Existing Clara Custom sites are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={revoke} className="bg-rose-600 hover:bg-rose-700 !text-white">Revoke</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function CopyableField({ label, value, onCopy, mono }) {
  return (
    <div>
      <Label className="text-xs text-zinc-500">{label}</Label>
      <div className="flex gap-2 mt-1">
        <Input value={value} readOnly className={mono ? 'font-mono text-xs' : ''} />
        <Button variant="outline" size="icon" onClick={() => onCopy(value)} className="flex-shrink-0">
          <Copy className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
