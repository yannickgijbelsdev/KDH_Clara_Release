import { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Loader2, Wifi, ExternalLink } from 'lucide-react';

/**
 * ConnectionStatus - Auto-checks and displays API connection health.
 * Props:
 *  - testUrl: string - API endpoint to call for connection test
 *  - headers: object - Auth headers
 *  - autoCheck: boolean - Check on mount (default true)
 *  - label: string - Optional label like "Radioplayer API"
 *  - className: string - Extra classes
 */
export function ConnectionStatus({ testUrl, headers, autoCheck = true, label, className = '', method = 'GET' }) {
  const [status, setStatus] = useState(null); // null | {status, message, suggestion, steps, link, link_label}
  const [loading, setLoading] = useState(false);

  const runTest = useCallback(async () => {
    if (!testUrl) return;
    setLoading(true);
    try {
      const res = await fetch(testUrl, { method, headers });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus({ status: 'error', message: `HTTP ${res.status}`, steps: ['Server returned an error. Check your configuration and try again.'] });
      }
    } catch {
      setStatus({ status: 'error', message: 'Network error', steps: ['Could not reach the server.', 'Check your internet connection and try again.'] });
    } finally {
      setLoading(false);
    }
  }, [testUrl, headers]);

  useEffect(() => {
    if (autoCheck && testUrl) runTest();
  }, [autoCheck, testUrl, runTest]);

  if (!testUrl) return null;

  const icon = loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" /> :
    status?.status === 'ok' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> :
    status?.status === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> :
    status?.status === 'error' ? <XCircle className="w-3.5 h-3.5 text-red-400" /> :
    <Wifi className="w-3.5 h-3.5 text-zinc-500" />;

  const bgColor = loading ? 'bg-zinc-800/50 border-zinc-300' :
    status?.status === 'ok' ? 'bg-emerald-500/5 border-emerald-500/20' :
    status?.status === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
    status?.status === 'error' ? 'bg-red-500/5 border-red-500/20' :
    'bg-zinc-800/50 border-zinc-300';

  const statusColor = status?.status === 'ok' ? 'text-emerald-400' :
    status?.status === 'warning' ? 'text-amber-400' :
    status?.status === 'error' ? 'text-red-400' : 'text-zinc-400';

  // Determine if we have structured steps or a legacy suggestion string
  const hasSteps = Array.isArray(status?.steps) && status.steps.length > 0;
  const hasSuggestion = status?.suggestion && !hasSteps;

  return (
    <div className={`rounded-lg border p-3 ${bgColor} ${className}`} data-testid="connection-status">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {label && <span className="text-xs font-medium text-zinc-600">{label}</span>}
              {status?.message && <span className={`text-xs ${loading ? 'text-zinc-400' : statusColor}`}>{loading ? 'Testing connection...' : status.message}</span>}
              {!status && !loading && <span className="text-xs text-zinc-500">Click to test connection</span>}
            </div>
            {/* Render structured steps as a numbered list */}
            {hasSteps && status.status !== 'ok' && !loading && (
              <div className="mt-2 rounded-md bg-zinc-900/60 border border-zinc-300/50 p-2.5" data-testid="connection-steps">
                <p className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold mb-1.5">How to fix this:</p>
                <ol className="space-y-1 list-none">
                  {status.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-600">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {status.link && (
                  <a href={status.link} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    {status.link_label || 'Open link'}
                  </a>
                )}
              </div>
            )}
            {/* Show indicators on success (e.g. WordPress detection details) */}
            {status?.indicators?.length > 0 && status.status === 'ok' && !loading && (
              <div className="mt-1.5 flex flex-wrap gap-1" data-testid="connection-indicators">
                {status.indicators.map((ind, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{ind}</span>
                ))}
              </div>
            )}
            {/* Fallback: render legacy suggestion string */}
            {hasSuggestion && status.status !== 'ok' && !loading && (
              <div className="mt-1.5 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-zinc-400">{status.suggestion}</p>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={runTest}
          disabled={loading}
          className="flex-shrink-0 p-1.5 rounded-md hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-600 transition-colors ml-2"
          data-testid="connection-retest-btn"
          title="Test connection"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}

/**
 * useConnectionTest - Hook for programmatic connection testing
 */
export function useConnectionTest(testUrl, headers, method = 'GET') {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const runTest = useCallback(async () => {
    if (!testUrl) return;
    setLoading(true);
    try {
      const res = await fetch(testUrl, { method, headers });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus({ status: 'error', message: `HTTP ${res.status}` });
      }
    } catch {
      setStatus({ status: 'error', message: 'Network error' });
    } finally {
      setLoading(false);
    }
  }, [testUrl, headers]);

  return { status, loading, runTest };
}
