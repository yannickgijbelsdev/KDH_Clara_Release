import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import {
  Loader2, CheckCircle2, XCircle, Shield, Upload,
  Server, Database, Lock, RotateCcw, Cloud,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const PHASE_LABELS = {
  idle: 'Ready to deploy',
  starting: 'Starting...',
  handshake: 'Connecting to Clara Host VDC',
  keys: 'Fetching encryption keys',
  preparing: 'Preparing data',
  encrypting: 'Encrypting data',
  init_session: 'Initializing upload session',
  uploading: 'Uploading encrypted data',
  finalizing: 'Finalizing deployment',
  complete: 'Deployment complete',
  error: 'Deployment failed',
};

export default function VDCDeployPanel() {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const pollRef = useRef(null);

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
    setStatus({ phase: 'starting', progress: 0, detail: 'Initiating deployment...' });
    try {
      const res = await fetch(`${API}/api/vdc-deploy/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setStatus({ phase: 'error', progress: 0, error: d.detail || 'Failed to start deployment' });
        setDeploying(false);
        return;
      }
      pollRef.current = setInterval(pollStatus, 1500);
    } catch {
      setStatus({ phase: 'error', progress: 0, error: 'Connection error' });
      setDeploying(false);
    }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const phase = status?.phase || 'idle';
  const progress = status?.progress || 0;
  const isComplete = status?.done === true;
  const hasError = !!status?.error;

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
              Deploy your complete application (source code + database) to Clara Host VDC with end-to-end AES-256-GCM encryption.
              Data is encrypted before it leaves your machine and can only be decrypted by Clara Host.
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

      {/* Progress card */}
      {status && phase !== 'idle' && (
        <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-zinc-100">
            <motion.div
              className={`h-full ${hasError ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-zinc-900'}`}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <div className="p-5">
            {/* Current phase */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
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
              <div className="flex-1">
                <p className="text-sm font-semibold text-zinc-800">{PHASE_LABELS[phase] || phase}</p>
                <p className="text-xs text-zinc-400">{status.detail || ''}</p>
              </div>
              <span className="text-sm font-bold text-zinc-400 tabular-nums">{progress}%</span>
            </div>

            {/* Phase steps */}
            <div className="flex items-center gap-1">
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

            {/* Error */}
            {hasError && (
              <div className="mt-4 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 leading-relaxed">{status.error}</p>
              </div>
            )}

            {/* Success */}
            {isComplete && (
              <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-emerald-700 font-medium">Upload complete — awaiting admin approval in Clara Host dashboard.</p>
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
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl px-5 h-10 gap-2 font-semibold text-sm"
          data-testid="vdc-deploy-btn"
        >
          {deploying ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Deploying...</>
          ) : (
            <><Upload className="w-4 h-4" /> Deploy to Clara Host VDC</>
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
