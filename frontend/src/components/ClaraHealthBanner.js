import { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle, CheckCircle, Loader2, Zap } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * ClaraHealthBanner - Automatically scans all sites after admin login.
 * Shows a dismissable banner if issues are found.
 */
const ClaraHealthBanner = ({ token, isAdmin }) => {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runScan = useCallback(async () => {
    if (!token || !isAdmin || hasRun) return;
    setHasRun(true);

    // Don't re-scan if already dismissed this session
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
      // Silently fail - health scan is non-critical
    }
    setScanning(false);
  }, [token, isAdmin, hasRun]);

  useEffect(() => {
    // Delay the scan by 8 seconds to not interfere with login flow
    const timer = setTimeout(runScan, 8000);
    return () => clearTimeout(timer);
  }, [runScan]);

  const handleDismiss = () => {
    setDismissed(true);
    const sessionKey = `clara_health_scan_${new Date().toISOString().slice(0, 10)}`;
    sessionStorage.setItem(sessionKey, 'dismissed');
  };

  // Don't show anything if dismissed, no result, or no issues
  if (dismissed || (!scanning && !result)) return null;
  if (result && !result.has_issues) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[60] max-w-md animate-in slide-in-from-right-5 fade-in duration-500"
      data-testid="clara-health-banner"
    >
      <div className={`rounded-2xl border shadow-lg backdrop-blur-sm ${
        scanning
          ? 'bg-white/95 border-zinc-200'
          : result?.has_issues
            ? 'bg-amber-50/95 border-amber-300'
            : 'bg-emerald-50/95 border-emerald-300'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            {scanning ? (
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
            ) : result?.has_issues ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            )}
            <span className="text-sm font-semibold text-zinc-800">
              {scanning ? 'Clara Health Scan' : 'Clara found issues'}
            </span>
            <Zap className="w-3 h-3 text-violet-400" />
          </div>
          {!scanning && (
            <button
              onClick={handleDismiss}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              data-testid="dismiss-health-banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3 max-h-60 overflow-y-auto">
          {scanning ? (
            <p className="text-sm text-zinc-500">
              Scanning WordPress and RDS connections across all sites...
            </p>
          ) : result?.diagnosis ? (
            <div
              className="text-sm text-zinc-700 leading-relaxed prose prose-sm prose-zinc max-w-none [&>ul]:mt-1 [&>ul]:mb-1 [&>li]:my-0"
              dangerouslySetInnerHTML={{
                __html: result.diagnosis
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\n- /g, '<br/>&#8226; ')
                  .replace(/\n/g, '<br/>')
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ClaraHealthBanner;
