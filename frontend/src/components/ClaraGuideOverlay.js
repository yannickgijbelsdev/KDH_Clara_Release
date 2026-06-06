/* eslint-disable */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

/**
 * Element mapping: friendly names → CSS selectors.
 * Clara references these by name, the overlay finds them on screen.
 */
const ELEMENT_MAP = {
  // Top bar pill navigation
  'dashboard': '[data-testid="pill-dashboard"]',
  'shows': '[data-testid="pill-shows"]',
  'content': '[data-testid="pill-content-library"]',
  'content library': '[data-testid="pill-content-library"]',
  'media': '[data-testid="pill-media-library"]',
  'media library': '[data-testid="pill-media-library"]',
  'rds builder': '[data-testid="pill-rds-builder"]',
  'rds settings': '[data-testid="pill-rds-settings"]',
  'rds monitor': '[data-testid="pill-rds-monitor"]',
  'stream monitor': '[data-testid="pill-stream-monitor"]',
  'calendar': '[data-testid="pill-calendar"]',
  'team chat': '[data-testid="pill-team-chat"]',
  'wordpress': '[data-testid="pill-wordpress"]',
  'team settings': '[data-testid="pill-team-settings"]',
  'support tickets': '[data-testid="pill-support-tickets"]',
  'enterprise assistant': '[data-testid="pill-enterprise-assistant"]',
  'show management': '[data-testid="pill-show-management"]',
  'activity logs': '[data-testid="pill-activity-logs"]',
  'firewall': '[data-testid="pill-firewall"]',
  'sites': '[data-testid="pill-sites"]',
  'task boards': '[data-testid="pill-task-boards"]',
  'radioplayer': '[data-testid="pill-radioplayer"]',
  'security dashboard': '[data-testid="pill-security-dashboard"]',
  // Topbar elements
  'user menu': '[data-testid="user-menu-trigger"]',
  'top bar': '[data-testid="workspace-topbar"]',
  'navigation': '[data-testid="pill-nav"]',
  // Sidebar nav (mobile / collapsed)
  'sidebar': '[data-testid="mobile-menu-btn"]',
  // Fix guide targets (scan widget)
  'server-rack': '[data-testid^="rack-visual-"]',
  'rack-firewall-toggle': '[data-testid="rack-firewall-toggle-btn"]',
  'add-wordpress': '[data-testid="add-wp-site-btn"]',
  'wordpress-connection': '[data-testid="wordpress-settings-page"]',
  'zerotier-config': '[data-testid="zt-config-btn"]',
  'add-station': '[data-testid="rds-tab-settings"]',
  'rds-stream-url': '[data-testid="rds-unified-page"]',
  'require-2fa': '[data-testid="team-settings-page"]',
};

/**
 * Page route mapping: friendly page names → route suffixes.
 */
export const PAGE_MAP = {
  'dashboard': '',
  'shows': 'shows',
  'calendar': 'calendar',
  'show management': 'show-management',
  'content': 'content',
  'content library': 'content',
  'media': 'media',
  'media library': 'media',
  'team chat': 'chat',
  'rds settings': 'rds',
  'rds builder': 'rds-builder',
  'rds monitor': 'rds-monitor',
  'stream monitor': 'streams',
  'sites': 'sites',
  'team settings': 'team',
  'wordpress': 'wordpress',
  'activity logs': 'logs',
  'firewall': 'firewall',
  'support tickets': 'tickets',
  'enterprise assistant': 'enterprise-assistant',
  'task boards': 'task-boards',
  'radioplayer': 'radioplayer',
  'security dashboard': 'wp-security',
};

export default function ClaraGuideOverlay() {
  const [highlight, setHighlight] = useState(null); // { rect, description }
  const [tour, setTour] = useState(null); // { steps, currentStep }
  const timeoutRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const clearHighlight = useCallback(() => {
    setHighlight(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
  }, []);

  const findAndHighlight = useCallback((elementName, description) => {
    const key = elementName.toLowerCase().trim();
    const selector = ELEMENT_MAP[key];

    // Try mapped selector first, then fallback to data-testid search, then text search
    let el = selector ? document.querySelector(selector) : null;
    if (!el) {
      el = document.querySelector(`[data-testid*="${key.replace(/\s+/g, '-')}"]`);
    }
    if (!el) {
      // Search by visible text
      const allEls = document.querySelectorAll('a, button, [role="tab"], [role="menuitem"]');
      for (const candidate of allEls) {
        if (candidate.textContent.toLowerCase().trim().includes(key)) {
          el = candidate;
          break;
        }
      }
    }

    if (!el) {
      console.warn(`[ClaraGuide] Element not found: "${elementName}"`);
      return 'Element not found on the current page. Try navigating to the correct page first.';
    }

    // Scroll element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    // Get bounding rect after scroll
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setHighlight({ rect, description: description || elementName, elementName: key });

      // Update position on resize/scroll
      const updateRect = () => {
        const newRect = el.getBoundingClientRect();
        setHighlight(prev => prev ? { ...prev, rect: newRect } : null);
      };

      window.addEventListener('scroll', updateRect, true);
      window.addEventListener('resize', updateRect);

      // Auto-dismiss after 8 seconds
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        clearHighlight();
        window.removeEventListener('scroll', updateRect, true);
        window.removeEventListener('resize', updateRect);
      }, 8000);
    }, 300);

    return 'Element highlighted on screen';
  }, [clearHighlight]);

  // Listen for custom events from VoiceCallWidget
  useEffect(() => {
    const handleHighlight = (e) => {
      findAndHighlight(e.detail.element, e.detail.description);
    };
    const handleClear = () => clearHighlight();
    const handleNavigate = (e) => {
      // Navigation is handled by the VoiceCallWidget via window event
      // After navigation, optionally highlight
      if (e.detail.highlightAfter) {
        setTimeout(() => {
          findAndHighlight(e.detail.highlightAfter, e.detail.description);
        }, 800);
      }
    };

    window.addEventListener('clara-highlight', handleHighlight);
    window.addEventListener('clara-clear-highlight', handleClear);
    window.addEventListener('clara-navigate', handleNavigate);
    return () => {
      window.removeEventListener('clara-highlight', handleHighlight);
      window.removeEventListener('clara-clear-highlight', handleClear);
      window.removeEventListener('clara-navigate', handleNavigate);
    };
  }, [findAndHighlight, clearHighlight]);

  // Expose findAndHighlight for external use
  useEffect(() => {
    window.__claraGuide = { highlight: findAndHighlight, clear: clearHighlight };
    return () => { delete window.__claraGuide; };
  }, [findAndHighlight, clearHighlight]);

  if (!highlight) return null;

  const { rect, description } = highlight;
  const padding = 8;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9990] pointer-events-none"
        data-testid="clara-guide-overlay"
      >
        {/* Dark overlay with cutout */}
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <mask id="clara-spotlight">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.left - padding}
                y={rect.top - padding}
                width={rect.width + padding * 2}
                height={rect.height + padding * 2}
                rx="12"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.5)"
            mask="url(#clara-spotlight)"
          />
        </svg>

        {/* Glow ring around element */}
        <motion.div
          className="absolute rounded-xl pointer-events-auto"
          style={{
            left: rect.left - padding,
            top: rect.top - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
          }}
          initial={{ boxShadow: '0 0 0 0 rgba(221,12,81,0)' }}
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(221,12,81,0.6)',
              '0 0 20px 8px rgba(221,12,81,0.3)',
              '0 0 0 0 rgba(221,12,81,0.6)',
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="absolute inset-0 rounded-xl border-2 border-orange-400/80" />
        </motion.div>

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute pointer-events-auto"
          style={{
            left: Math.max(16, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 296)),
            top: rect.bottom + padding + 16,
          }}
        >
          <div className="bg-zinc-900 text-white rounded-2xl px-4 py-3 shadow-2xl max-w-[280px] relative">
            {/* Arrow pointing up */}
            <div
              className="absolute -top-2 w-4 h-4 bg-zinc-900 rotate-45"
              style={{ left: Math.min(Math.max(20, rect.left + rect.width / 2 - Math.max(16, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 296))), 256) }}
            />
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{description}</p>
            </div>
            <button
              onClick={clearHighlight}
              className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-700 hover:bg-zinc-600 rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-3 h-3 text-zinc-300" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
