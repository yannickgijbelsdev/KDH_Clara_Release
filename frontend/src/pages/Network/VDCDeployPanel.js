import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import {
  Loader2, CheckCircle2, XCircle, Shield, Upload,
  Server, Database, Lock, ArrowRight, RotateCcw,
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

const PHASE_ICONS = {
  handshake: Server,
  keys: Lock,
  preparing: Database,
  encrypting: Shield,
  init_session: Upload,
  uploading: Upload,
  finalizing: CheckCircle2,
  complete: CheckCircle2,
  error: XCircle,
};

export default function VDCDeployPanel() {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const pollRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

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
      const res = await fetch(`${API}/api/vdc-deploy/start`, { method: 'POST', headers });
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
  const PhaseIcon = PHASE_ICONS[phase] || Server;

  const phases = ['handshake', 'keys', 'preparing', 'encrypting', 'uploading', 'finalizing'];

  return (
    <div className="space-y-6" data-testid="vdc-deploy-panel">
      {/* Info */}
      <div className="bg-gradient-to-br from-[#7c1ac8]/5 to-[#dd0c51]/5 rounded-2xl border border-[#7c1ac8]/10 p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c1ac8] to-[#dd0c51] flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-800 mb-1">Encrypted Deployment</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Deploy your complete application (source code + database) to Clara Host VDC with end-to-end AES-256-GCM encryption.
              Data is encrypted before it leaves your machine and can only be decrypted by Clara Host.
            </p>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> RSA-4096</span>
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> AES-256-GCM</span>
              <span className="flex items-center gap-1"><Server className="w-3 h-3" /> Chunked Upload</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      {status && phase !== 'idle' && (
        <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
          {/* Progress bar */}
          <div className="h-1.5 bg-zinc-100">
            <motion.div
              className={`h-full ${hasError ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#dd0c51] to-[#7c1ac8]'}`}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <div className="p-5">
            {/* Current phase */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                hasError ? 'bg-red-50' : isComplete ? 'bg-emerald-50' : 'bg-gradient-to-br from-[#7c1ac8]/10 to-[#dd0c51]/10'
              }`}>
                {deploying && !hasError ? (
                  <Loader2 className="w-4.5 h-4.5 animate-spin text-[#dd0c51]" />
                ) : (
                  <PhaseIcon className={`w-4.5 h-4.5 ${hasError ? 'text-red-500' : isComplete ? 'text-emerald-500' : 'text-[#7c1ac8]'}`} />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-zinc-800">{PHASE_LABELS[phase] || phase}</p>
                <p className="text-xs text-zinc-400">{status.detail || ''}</p>
              </div>
              <span className="text-sm font-bold text-zinc-500">{progress}%</span>
            </div>

            {/* Phase steps */}
            <div className="flex items-center gap-1 mb-4">
              {phases.map((p, i) => {
                const pIdx = phases.indexOf(phase);
                const isDone = phases.indexOf(p) < pIdx || isComplete;
                const isCurrent = p === phase;
                return (
                  <div key={p} className="flex items-center gap-1 flex-1">
                    <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                      isDone ? 'bg-emerald-400' : isCurrent ? 'bg-[#dd0c51]' : 'bg-zinc-200'
                    }`} />
                  </div>
                );
              })}
            </div>

            {/* Error */}
            {hasError && (
              <div className="bg-red-50 border border-red-200/50 rounded-xl p-3 flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 leading-relaxed">{status.error}</p>
              </div>
            )}

            {/* Success */}
            {isComplete && (
              <div className="bg-emerald-50 border border-emerald-200/50 rounded-xl p-3 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-emerald-700 font-medium">Upload complete — awaiting admin approval in Clara Host dashboard.</p>
                  {status.deployment_id && (
                    <p className="text-[10px] text-emerald-500 mt-1 font-mono">Deployment ID: {status.deployment_id}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deploy button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={startDeploy}
          disabled={deploying}
          className="bg-gradient-to-r from-[#dd0c51] to-[#7c1ac8] hover:from-[#c40a47] hover:to-[#6b13b0] text-white rounded-xl px-6 py-2.5 gap-2 shadow-lg shadow-[#dd0c51]/15 font-semibold"
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
            className="rounded-xl gap-1.5 text-zinc-600"
            data-testid="vdc-deploy-retry"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}
