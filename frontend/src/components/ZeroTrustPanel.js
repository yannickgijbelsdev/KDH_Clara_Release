/* eslint-disable */
/**
 * ZeroTrustPanel
 * --------------
 * Compact Zero Trust posture dashboard for network/system admins.
 * Shows: encryption status, open anomalies, active brute-force locks,
 * known devices, and a feed of recent anomalies with acknowledge action.
 *
 * Endpoints used:
 *   GET  /api/security/overview
 *   GET  /api/security/anomalies?limit=25
 *   POST /api/security/anomalies/:id/acknowledge
 *   GET  /api/security/lockouts
 *   POST /api/security/lockouts/:id/clear
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  Shield, ShieldCheck, ShieldAlert, Lock, MonitorSmartphone,
  AlertTriangle, CheckCircle2, RefreshCw, Unlock,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEVERITY_STYLE = {
  high:   { ring: 'ring-red-200',    bg: 'bg-red-50/70',    text: 'text-red-600',    label: 'High'   },
  medium: { ring: 'ring-amber-200',  bg: 'bg-amber-50/70',  text: 'text-amber-600',  label: 'Medium' },
  low:    { ring: 'ring-zinc-200',   bg: 'bg-zinc-50/70',   text: 'text-zinc-600',   label: 'Low'    },
};

function StatTile({ icon: Icon, label, value, accent, testid }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      data-testid={testid}
      className="bg-white/85 backdrop-blur-xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-3"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">{label}</div>
        <div className="text-lg font-semibold text-zinc-800 tabular-nums">{value}</div>
      </div>
    </motion.div>
  );
}

export default function ZeroTrustPanel({ token }) {
  const [overview, setOverview] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [lockouts, setLockouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, ano, lk] = await Promise.all([
        axios.get(`${API}/security/overview`, { headers }),
        axios.get(`${API}/security/anomalies?limit=25`, { headers }),
        axios.get(`${API}/security/lockouts`, { headers }),
      ]);
      setOverview(ov.data);
      setAnomalies(ano.data.items || []);
      setLockouts(lk.data.items || []);
    } catch (err) {
      console.error('Failed to load Zero Trust telemetry', err);
      toast.error('Kon Zero Trust telemetrie niet laden');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const acknowledge = async (id) => {
    try {
      await axios.post(`${API}/security/anomalies/${id}/acknowledge`, {}, { headers });
      setAnomalies((cur) => cur.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
      toast.success('Anomalie bevestigd');
    } catch (err) {
      toast.error('Kon anomalie niet bevestigen');
    }
  };

  const clearLock = async (identifier) => {
    try {
      await axios.post(`${API}/security/lockouts/${encodeURIComponent(identifier)}/clear`, {}, { headers });
      setLockouts((cur) => cur.filter((l) => l.identifier !== identifier));
      toast.success('Lockout vrijgegeven');
    } catch (err) {
      toast.error('Kon lockout niet vrijgeven');
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Zero Trust telemetrie laden…
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="zero-trust-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-700 text-white flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Zero Trust</div>
            <h2 className="text-base font-semibold text-zinc-800">Beveiligingstelemetrie</h2>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          data-testid="zt-refresh-btn"
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Vernieuwen
        </Button>
      </div>

      {/* Overview tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          testid="zt-tile-encryption"
          icon={overview?.encryption_enabled ? ShieldCheck : ShieldAlert}
          label="Veld-encryptie"
          value={overview?.encryption_enabled ? 'Actief' : 'Inactief'}
          accent={overview?.encryption_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}
        />
        <StatTile
          testid="zt-tile-anomalies"
          icon={AlertTriangle}
          label="Open anomalieën"
          value={`${overview?.open_anomalies ?? 0}${overview?.high_severity_anomalies ? ` (${overview.high_severity_anomalies} hoog)` : ''}`}
          accent={overview?.high_severity_anomalies ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}
        />
        <StatTile
          testid="zt-tile-lockouts"
          icon={Lock}
          label="Actieve lockouts"
          value={overview?.active_lockouts ?? 0}
          accent="bg-orange-50 text-orange-600"
        />
        <StatTile
          testid="zt-tile-devices"
          icon={MonitorSmartphone}
          label="Bekende apparaten"
          value={overview?.known_devices ?? 0}
          accent="bg-sky-50 text-sky-600"
        />
      </div>

      {/* Anomalies */}
      <Card className="bg-white/85 backdrop-blur-xl border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Recente anomalieën
            </h3>
            <span className="text-xs text-zinc-400">Laatste 25</span>
          </div>
          {anomalies.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500 py-6 justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Geen anomalieën gedetecteerd
            </div>
          ) : (
            <ul className="space-y-2" data-testid="zt-anomalies-list">
              {anomalies.map((a) => {
                const st = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.low;
                return (
                  <li
                    key={a.id}
                    data-testid={`zt-anomaly-${a.id}`}
                    className={`flex items-start justify-between gap-3 rounded-xl border ${st.bg} ring-1 ${st.ring} p-3`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`font-semibold ${st.text}`}>{st.label}</span>
                        <span className="text-zinc-400">·</span>
                        <span className="text-zinc-500">{a.kind}</span>
                        <span className="text-zinc-400">·</span>
                        <span className="text-zinc-400">{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-sm text-zinc-700 mt-0.5 break-words">{a.description}</div>
                    </div>
                    {!a.acknowledged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acknowledge(a.id)}
                        data-testid={`zt-ack-btn-${a.id}`}
                        className="gap-1.5 shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Bevestig
                      </Button>
                    )}
                    {a.acknowledged && (
                      <span className="text-xs text-zinc-400 self-center shrink-0">Bevestigd</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Lockouts */}
      <Card className="bg-white/85 backdrop-blur-xl border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
              <Lock className="w-4 h-4 text-orange-500" /> Brute-force lockouts
            </h3>
            <span className="text-xs text-zinc-400">{lockouts.length} totaal</span>
          </div>
          {lockouts.length === 0 ? (
            <div className="text-sm text-zinc-500 py-4 text-center">Geen actieve of recente lockouts.</div>
          ) : (
            <ul className="space-y-1.5" data-testid="zt-lockouts-list">
              {lockouts.slice(0, 20).map((l) => (
                <li
                  key={l.identifier}
                  data-testid={`zt-lockout-${l.identifier}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white border border-zinc-100 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-zinc-700 truncate font-mono text-xs">{l.identifier}</div>
                    <div className="text-[11px] text-zinc-400">
                      {l.failure_count} fouten · {l.last_failure_ip || 'onbekend IP'}
                      {l.locked_until && ` · vergrendeld tot ${new Date(l.locked_until).toLocaleString()}`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearLock(l.identifier)}
                    data-testid={`zt-unlock-btn-${l.identifier}`}
                    className="gap-1.5 shrink-0 text-zinc-500 hover:text-zinc-800"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Vrijgeven
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
