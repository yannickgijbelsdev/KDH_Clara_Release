import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, AlertTriangle, CheckCircle, Loader2, Zap, ExternalLink,
  Radio, RefreshCw, Settings, ArrowRight, ShieldCheck, Activity,
} from 'lucide-react';
import { Button } from './ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatDiagnosis(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal text-sm">$1. $2</li>')
    .replace(/\n/g, '<br />');
}

const ClaraHealthBanner = ({ token, isAdmin }) => {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [retesting, setRetesting] = useState(null);
  const [checkResults, setCheckResults] = useState({});

  const runScan = useCallback(async () => {
    if (!token || !isAdmin || hasRun) return;
    setHasRun(true);

    const sessionKey = `clara_health_scan_${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(sessionKey) === 'dismissed') return;

    setScanning(true);
    try {
      const res = await fetch(`${API}/clara-test/health-scan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      }
    } catch {
      // Silently fail
    }
    setScanning(false);
  }, [token, isAdmin, hasRun]);

  useEffect(() => {
    const timer = setTimeout(runScan, 8000);
    return () => clearTimeout(timer);
  }, [runScan]);

  const handleDismiss = () => {
    setDismissed(true);
    const sessionKey = `clara_health_scan_${new Date().toISOString().slice(0, 10)}`;
    sessionStorage.setItem(sessionKey, 'dismissed');
  };

  const handleRetest = async (check, idx) => {
    setRetesting(idx);
    try {
      const res = await fetch(`${API}/clara-test/retest-check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(check),
      });
      if (res.ok) {
        const data = await res.json();
        setCheckResults(prev => ({ ...prev, [idx]: data }));
      }
    } catch {
      setCheckResults(prev => ({ ...prev, [idx]: { success: false, diagnosis: 'Re-test failed. Please try again.' } }));
    }
    setRetesting(null);
  };

  const handleReconfigure = (check) => {
    const slug = check.site_slug;
    if (!slug) return;
    handleDismiss();
    if (check.type === 'wordpress') {
      navigate(`/${slug}/wordpress`);
    } else if (check.type === 'rds_stream') {
      navigate(`/${slug}/rds`);
    }
  };

  if (dismissed || (!scanning && !result)) return null;
  if (result && !result.has_issues) return null;

  const failedChecks = result?.checks?.filter(c => !c.success) || [];

  return (
    <AnimatePresence>
      {(scanning || (result?.has_issues)) && (
        <>
          {/* Backdrop */}
          <motion.div
            key="health-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[89] bg-black/30 backdrop-blur-sm"
            onClick={scanning ? undefined : handleDismiss}
          />

          {/* Centered modal */}
          <motion.div
            key="health-modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-xl bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.15)] flex flex-col pointer-events-auto"
              style={{ maxHeight: 'min(720px, 88vh)' }}
              data-testid="clara-health-modal"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 rounded-t-3xl flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                    <span className="text-white font-black text-lg leading-none">&lt;</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-zinc-900 text-base">Clara Health Scan</h2>
                    <p className="text-xs text-zinc-400">
                      {scanning ? 'Scanning connections...' : `${failedChecks.length} issue${failedChecks.length !== 1 ? 's' : ''} found`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!scanning && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setHasRun(false); setResult(null); setCheckResults({}); setTimeout(runScan, 100); }}
                      className="rounded-xl text-zinc-400 hover:text-zinc-700"
                      data-testid="health-rescan-btn"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDismiss}
                    className="rounded-xl text-zinc-400 hover:text-zinc-700"
                    data-testid="health-close-btn"
                    disabled={scanning}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {scanning ? (
                  <ScanningState />
                ) : (
                  <>
                    {/* Clara's overall summary */}
                    {result?.diagnosis && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 mb-1" data-testid="health-summary">
                        <div className="flex items-start gap-2.5">
                          <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <div
                            className="text-sm text-zinc-700 leading-relaxed prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: formatDiagnosis(result.diagnosis) }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Per-issue cards */}
                    {failedChecks.map((check, idx) => (
                      <IssueCard
                        key={idx}
                        check={check}
                        idx={idx}
                        retesting={retesting}
                        retestResult={checkResults[idx]}
                        onRetest={handleRetest}
                        onReconfigure={handleReconfigure}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Footer */}
              {!scanning && (
                <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between flex-shrink-0 rounded-b-3xl">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{result?.checks?.length || 0} connections checked</span>
                  </div>
                  <Button
                    onClick={handleDismiss}
                    variant="ghost"
                    className="text-sm text-zinc-500 hover:text-zinc-700 rounded-xl"
                    data-testid="health-dismiss-btn"
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

function ScanningState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Activity className="w-7 h-7 text-white animate-pulse" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow">
          <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-700">Clara is scanning your connections</p>
        <p className="text-xs text-zinc-400 mt-1">Testing WordPress and RDS streams across all sites...</p>
      </div>
    </div>
  );
}

function IssueCard({ check, idx, retesting, retestResult, onRetest, onReconfigure }) {
  const isWp = check.type === 'wordpress';
  const Icon = isWp ? ExternalLink : Radio;
  const color = isWp ? '#3b82f6' : '#dd0c51';
  const label = isWp ? 'WordPress' : 'RDS Stream';
  const isFixed = retestResult?.success === true;
  const retestDiagnosis = retestResult?.diagnosis;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className={`rounded-2xl border p-4 transition-colors ${
        isFixed
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-zinc-200 bg-white'
      }`}
      data-testid={`health-issue-${idx}`}
    >
      {/* Issue header */}
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: isFixed ? '#dcfce7' : `${color}12` }}
        >
          {isFixed ? (
            <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
          ) : (
            <Icon className="w-4.5 h-4.5" style={{ color }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-800">{check.site}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
              style={{ backgroundColor: `${color}12`, color }}
            >
              {label}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">{check.target}</p>

          {/* Error message */}
          {!isFixed && check.error && (
            <div className="flex items-start gap-1.5 mt-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{check.error}</p>
            </div>
          )}

          {/* Re-test result diagnosis */}
          {retestDiagnosis && (
            <div className={`mt-2.5 rounded-xl p-3 ${isFixed ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-start gap-2">
                <Zap className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isFixed ? 'text-emerald-500' : 'text-amber-500'}`} />
                <div
                  className="text-xs text-zinc-700 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: formatDiagnosis(retestDiagnosis) }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isFixed && (
        <div className="flex items-center gap-2 mt-3 pl-12">
          <button
            onClick={() => onReconfigure(check)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors"
            data-testid={`health-reconfig-${idx}`}
          >
            <Settings className="w-3 h-3" />
            Reconfigure
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => onRetest(check, idx)}
            disabled={retesting === idx}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 text-xs font-medium hover:bg-zinc-50 transition-colors disabled:opacity-40"
            data-testid={`health-retest-${idx}`}
          >
            {retesting === idx ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Re-test
          </button>
        </div>
      )}

      {/* Fixed state */}
      {isFixed && (
        <div className="flex items-center gap-1.5 mt-2.5 pl-12">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600">Connection restored</span>
        </div>
      )}
    </motion.div>
  );
}

export default ClaraHealthBanner;
