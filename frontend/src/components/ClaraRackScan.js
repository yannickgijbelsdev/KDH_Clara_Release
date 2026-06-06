/* eslint-disable */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldOff, AlertTriangle, CheckCircle, Info, X,
  ChevronRight, Loader2, Globe, Radio, Key, Lock, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

const SEVERITY_CONFIG = {
  critical: { icon: ShieldOff, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-500' },
};

const CATEGORY_ICONS = {
  security: Shield,
  configuration: Key,
  performance: Globe,
};

export default function ClaraRackScan() {
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [activeIssue, setActiveIssue] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const sessionKey = `clara_rack_scan_${new Date().toISOString().split('T')[0]}`;
    if (sessionStorage.getItem(sessionKey)) {
      setDismissed(true);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    // Wait for health scan to be dismissed first
    const waitForHealthScan = setInterval(() => {
      const healthKey = `clara_health_scan_${new Date().toISOString().split('T')[0]}`;
      const healthDone = sessionStorage.getItem(healthKey);
      if (!healthDone) return; // health scan still running
      clearInterval(waitForHealthScan);

      const doScan = async () => {
        try {
          const res = await fetch(`${API}/api/clara-test/rack-scan`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setResult(data);
          }
        } catch { /* noop */ }
        setScanning(false);
      };
      setTimeout(doScan, 1500);
    }, 1000);

    return () => clearInterval(waitForHealthScan);
  }, []);

  const handleDismiss = () => {
    const sessionKey = `clara_rack_scan_${new Date().toISOString().split('T')[0]}`;
    sessionStorage.setItem(sessionKey, 'done');
    setDismissed(true);
  };

  if (dismissed || (!scanning && !result)) return null;
  if (!scanning && result?.summary?.total_issues === 0) {
    // No issues — show brief success then dismiss
    setTimeout(handleDismiss, 3000);
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 right-6 z-50 bg-white border border-emerald-200 rounded-2xl shadow-xl p-4 flex items-center gap-3 max-w-sm"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">All systems healthy</p>
            <p className="text-xs text-zinc-400">{result.summary.total_sites} sites, {result.summary.total_racks} racks scanned</p>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[75vh] flex flex-col overflow-hidden border border-zinc-200"
          onClick={e => e.stopPropagation()}
          data-testid="clara-rack-scan-modal"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">Clara System Scan</h2>
                <p className="text-xs text-zinc-400">
                  {scanning ? 'Scanning your infrastructure...' : `${result?.summary?.total_issues || 0} items found`}
                </p>
              </div>
            </div>
            {!scanning && (
              <button onClick={handleDismiss} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {scanning ? (
              <div className="flex flex-col items-center py-12 gap-4">
                <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                <div className="text-center">
                  <p className="text-sm text-zinc-600 font-medium">Scanning racks and sites...</p>
                  <p className="text-xs text-zinc-400 mt-1">Checking firewalls, configurations, and security</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Summary bar */}
                <div className="flex gap-2 mb-4">
                  {result?.summary?.critical > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-[11px] font-semibold text-red-600">{result.summary.critical} Critical</span>
                    </div>
                  )}
                  {result?.summary?.warnings > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-[11px] font-semibold text-amber-600">{result.summary.warnings} Warnings</span>
                    </div>
                  )}
                  {result?.summary?.info > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-[11px] font-semibold text-blue-600">{result.summary.info} Info</span>
                    </div>
                  )}
                </div>

                {/* Issues list */}
                {(result?.issues || []).map((issue, idx) => {
                  const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;
                  const SevIcon = sev.icon;
                  const CatIcon = CATEGORY_ICONS[issue.category] || Shield;
                  const isActive = activeIssue === idx;

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border transition-all cursor-pointer ${sev.border} ${isActive ? sev.bg : 'bg-white hover:' + sev.bg}`}
                      onClick={() => setActiveIssue(isActive ? null : idx)}
                      data-testid={`scan-issue-${idx}`}
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        <SevIcon className={`w-4 h-4 flex-shrink-0 ${sev.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-800">{issue.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{issue.site_name}</span>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-zinc-300 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                      </div>

                      {isActive && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="px-4 pb-3 border-t border-zinc-100"
                        >
                          <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{issue.description}</p>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {!scanning && (
            <div className="px-6 py-3 border-t border-zinc-100 flex items-center justify-between flex-shrink-0">
              <p className="text-[10px] text-zinc-300">{result?.summary?.total_sites} sites &middot; {result?.summary?.total_racks} racks</p>
              <button onClick={handleDismiss} className="text-xs font-medium text-zinc-400 hover:text-zinc-600 transition-colors" data-testid="scan-dismiss-btn">
                Dismiss
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
