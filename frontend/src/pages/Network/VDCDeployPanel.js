import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import {
  Loader2, CheckCircle2, XCircle, Shield, Upload,
  Server, Database, Lock, RotateCcw, Cloud, Terminal,
  ChevronDown, ChevronUp, Zap, Clock,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const PHASE_LABELS = {
  idle: 'Ready to deploy',
  starting: 'Starting...',
  handshake: 'Connecting to Koodh VDC',
  keys: 'Fetching encryption keys',
  preparing: 'Preparing data',
  encrypting: 'Encrypting data',
  init_session: 'Initializing upload session',
  uploading: 'Uploading encrypted data',
  finalizing: 'Finalizing deployment',
  complete: 'Deployment complete',
  error: 'Deployment failed',
};

const LOG_COLORS = {
  info: 'text-zinc-400',
  success: 'text-emerald-400',
  error: 'text-red-400',
  debug: 'text-zinc-500',
};

export default function VDCDeployPanel() {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [logExpanded, setLogExpanded] = useState(true);
  const pollRef = useRef(null);
  const logEndRef = useRef(null);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/vdc-deploy/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.done || data.error) {
          setDeploying(false);
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {}
  }, [token]);

  const startDeploy = async () => {
    setDeploying(true);
    setLogExpanded(true);
    setStatus({ phase: 'starting', progress: 0, detail: 'Initiating deployment...', log: [], stats: {} });
    try {
      const res = await fetch(`${API}/api/vdc-deploy/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setStatus({ phase: 'error', progress: 0, error: d.detail || 'Failed to start', log: [], stats: {} });
        setDeploying(false);
        return;
      }
      pollRef.current = setInterval(pollStatus, 800);
    } catch {
      setStatus({ phase: 'error', progress: 0, error: 'Connection error', log: [], stats: {} });
      setDeploying(false);
    }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [status?.log?.length]);

  const phase = status?.phase || 'idle';
  const progress = status?.progress || 0;
  const isComplete = status?.done === true;
  const hasError = !!status?.error;
  const log = status?.log || [];
  const stats = status?.stats || {};

  const phases = ['handshake', 'keys', 'preparing', 'encrypting', 'uploading', 'finalizing'];

  return (
    <div className="space-y-5" data-testid="vdc-deploy-panel">
      {/* Info card */}
      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center flex-shrink-0">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-zinc-800 mb-1">Encrypted Deployment</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Deploy source code + database to Koodh VDC with end-to-end encryption.
            </p>
            <div className="flex items-center gap-2.5 mt-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[10px] font-semibold tracking-wide">
                <Lock className="w-3 h-3" /> RSA-4096
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[10px] font-semibold tracking-wide">
                <Shield className="w-3 h-3" /> AES-256-GCM
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[10px] font-semibold tracking-wide">
                <Server className="w-3 h-3" /> CHUNKED
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress + Log */}
      {status && phase !== 'idle' && (
        <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-zinc-100">
            <motion.div
              className={`h-full ${hasError ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-zinc-900'}`}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="p-4">
            {/* Status header */}
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                hasError ? 'bg-red-50' : isComplete ? 'bg-emerald-50' : 'bg-zinc-100'
              }`}>
                {deploying && !hasError ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                ) : hasError ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : isComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Cloud className="w-4 h-4 text-zinc-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-800 truncate">{PHASE_LABELS[phase] || phase}</p>
                <p className="text-xs text-zinc-400 truncate">{status.detail || ''}</p>
              </div>
              <span className="text-sm font-bold text-zinc-400 tabular-nums">{progress}%</span>
            </div>

            {/* Phase steps */}
            <div className="flex items-center gap-1 mb-3">
              {phases.map((p) => {
                const pIdx = phases.indexOf(phase);
                const isDone = phases.indexOf(p) < pIdx || isComplete;
                const isCurrent = p === phase;
                return (
                  <div key={p} className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    isDone ? 'bg-emerald-400' : isCurrent ? 'bg-zinc-800' : 'bg-zinc-200'
                  }`} />
                );
              })}
            </div>

            {/* Stats bar */}
            {Object.keys(stats).length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[10px] font-mono text-zinc-400">
                {stats.source_size_fmt && <span><Database className="w-3 h-3 inline mr-1" />Source: {stats.source_size_fmt}</span>}
                {stats.db_size_fmt && <span><Database className="w-3 h-3 inline mr-1" />DB: {stats.db_size_fmt}</span>}
                {stats.collections && <span>{stats.collections} collections</span>}
                {stats.total_chunks && <span>{stats.total_chunks} chunks</span>}
                {stats.avg_speed && <span><Zap className="w-3 h-3 inline mr-1" />{stats.avg_speed}</span>}
                {stats.total_time && <span><Clock className="w-3 h-3 inline mr-1" />{stats.total_time}</span>}
              </div>
            )}

            {/* Live log */}
            {log.length > 0 && (
              <div>
                <button
                  onClick={() => setLogExpanded(!logExpanded)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 mb-2"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Live Log ({log.length})
                  {logExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {logExpanded && (
                  <div className="bg-zinc-950 rounded-lg p-3 max-h-[280px] overflow-y-auto font-mono text-[11px] leading-relaxed" data-testid="deploy-log">
                    {log.map((entry, i) => {
                      const time = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-GB', { hour12: false }) : '';
                      const color = LOG_COLORS[entry.level] || LOG_COLORS.info;
                      return (
                        <div key={i} className="flex gap-2">
                          <span className="text-zinc-600 select-none flex-shrink-0">{time}</span>
                          <span className={`text-zinc-500 flex-shrink-0 w-16 text-right ${entry.level === 'error' ? 'text-red-500' : ''}`}>
                            [{entry.phase}]
                          </span>
                          <span className={color}>{entry.message}</span>
                        </div>
                      );
                    })}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {hasError && (
              <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 leading-relaxed">{status.error}</p>
              </div>
            )}

            {/* Success */}
            {isComplete && (
              <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-emerald-700 font-medium">Upload complete — awaiting admin approval.</p>
                  {status.deployment_id && (
                    <p className="text-[10px] text-emerald-500 mt-1 font-mono">ID: {status.deployment_id}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={startDeploy}
          disabled={deploying}
          className="bg-[#dd0c51] hover:bg-[#c40a47] !text-white rounded-full px-5 h-10 gap-2 font-semibold text-sm shadow-lg shadow-[#dd0c51]/20 [&>svg]:text-white"
          data-testid="vdc-deploy-btn"
        >
          {deploying ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Deploying...</>
          ) : (
            <><Upload className="w-4 h-4" /> Deploy to Koodh VDC</>
          )}
        </Button>

        {(isComplete || hasError) && (
          <Button
            variant="outline"
            onClick={startDeploy}
            className="rounded-xl gap-1.5 text-zinc-600 h-10"
            data-testid="vdc-deploy-retry"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}
