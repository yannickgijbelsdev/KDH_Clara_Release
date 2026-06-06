/* eslint-disable */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Wrench, Info, CheckCircle2, X } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const SEVERITY_STYLES = {
  info:        { bg: 'from-sky-500 to-blue-600',     icon: Info },
  success:     { bg: 'from-emerald-500 to-green-600', icon: CheckCircle2 },
  warning:     { bg: 'from-amber-500 to-orange-600',  icon: AlertTriangle },
  maintenance: { bg: 'from-red-500 to-rose-700',      icon: Wrench },
};

/**
 * MaintenanceBanner — fetches active broadcast banners and shows them stacked at the top.
 * Each banner can be dismissed locally (per-tab via sessionStorage).
 */
export default function MaintenanceBanner({ mainSiteId = '' }) {
  const { token } = useAuth();
  const [banners, setBanners] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('clara_dismissed_banners') || '[]')); }
    catch { return new Set(); }
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await axios.get(`${API}/api/notifications/active-banner`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { main_site_id: mainSiteId || '' },
        });
        if (!cancelled) setBanners(Array.isArray(r.data) ? r.data : []);
      } catch (e) {
        if (!cancelled) setBanners([]);
      }
    };
    load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => { cancelled = true; clearInterval(id); };
  }, [token, mainSiteId]);

  const handleDismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { sessionStorage.setItem('clara_dismissed_banners', JSON.stringify(Array.from(next))); }
    catch { /* ignore */ }
  };

  const visible = banners.filter((b) => !dismissed.has(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="sticky top-0 z-[60] flex flex-col" data-testid="maintenance-banner-stack">
      <AnimatePresence>
        {visible.map((b) => {
          const cfg = SEVERITY_STYLES[b.severity] || SEVERITY_STYLES.info;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={b.id}
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`bg-gradient-to-r ${cfg.bg} text-white shadow-lg`}
              data-testid={`maintenance-banner-${b.severity}`}
            >
              <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} />
                  <div className="flex flex-wrap items-center gap-x-3 min-w-0">
                    <span className="text-sm font-bold truncate">{b.title}</span>
                    <span className="text-xs text-white/90 truncate hidden md:inline" dangerouslySetInnerHTML={{
                      __html: (b.body || '').replace(/<[^>]+>/g, ' ').slice(0, 180),
                    }} />
                  </div>
                </div>
                <button
                  onClick={() => handleDismiss(b.id)}
                  className="flex-shrink-0 p-1 rounded hover:bg-white/15 transition-colors"
                  aria-label="Dismiss"
                  data-testid={`banner-dismiss-${b.id}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
