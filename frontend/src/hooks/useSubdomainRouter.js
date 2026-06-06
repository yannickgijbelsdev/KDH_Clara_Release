/* eslint-disable */
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * useSubdomainRouter — handles bidirectional subdomain routing:
 * 
 * Direction 1 (Subdomain → Path):
 *   login.koodh.com → automatically navigates to /login
 *   global.koodh.com → automatically navigates to /network
 * 
 * Direction 2 (Path → Subdomain):
 *   clara.koodh.com/login → redirects browser to login.koodh.com
 *   clara.koodh.com/network → redirects browser to global.koodh.com
 * 
 * Uses relative API URL (/api/...) to avoid CORS issues when loading
 * through the Cloudflare Worker proxy.
 */
export function useSubdomainRouter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [resolved, setResolved] = useState(false);
  const [activeSubdomain, setActiveSubdomain] = useState(null);
  const routesRef = useRef(null);
  const hasRedirected = useRef(false);

  useEffect(() => {
    const hostname = window.location.hostname;

    // Skip on localhost and preview environments
    if (hostname === 'localhost' || hostname.includes('preview.emergentagent.com') || hostname.includes('127.0.0.1')) {
      setResolved(true);
      return;
    }

    if (hasRedirected.current) {
      setResolved(true);
      return;
    }

    (async () => {
      try {
        // Use RELATIVE URL — so it goes through the Cloudflare Worker
        // login.koodh.com/api/... → Worker → clara.koodh.com/api/...
        const res = await fetch('/api/domains/routes/public');
        if (!res.ok) { setResolved(true); return; }
        const data = await res.json();
        routesRef.current = data;
        const baseDomain = data.base_domain;

        if (!baseDomain || !hostname.endsWith(`.${baseDomain}`)) {
          setResolved(true);
          return;
        }

        const subdomain = hostname.replace(`.${baseDomain}`, '');
        const routes = data.routes || [];

        // Find the main app subdomain (the one with target_path "/")
        const appRoute = routes.find(r => r.target_path === '/');
        const appSubdomain = appRoute?.subdomain || 'clara';
        const isMainApp = subdomain === appSubdomain;

        // ─── Direction 1: Subdomain → Path ───────────────────
        // We're on a custom subdomain (login, global, etc.)
        if (!isMainApp) {
          const route = routes.find(r => r.subdomain === subdomain);
          if (route && route.target_path !== '/') {
            setActiveSubdomain(subdomain);
            hasRedirected.current = true;
            // Navigate to the target path
            if (location.pathname === '/' || location.pathname === '') {
              navigate(route.target_path, { replace: true });
            }
            setResolved(true);
            return;
          }
        }

        // ─── Direction 2: Path → Subdomain ───────────────────
        // We're on the main app (clara.koodh.com) and visiting a path
        // that has its own subdomain — redirect the browser
        if (isMainApp && location.pathname !== '/') {
          const matchingRoute = routes.find(r => 
            r.subdomain !== appSubdomain && 
            r.target_path !== '/' &&
            location.pathname.startsWith(r.target_path)
          );
          if (matchingRoute) {
            const subdomainUrl = `https://${matchingRoute.subdomain}.${baseDomain}${location.pathname.replace(matchingRoute.target_path, '') || '/'}`;
            hasRedirected.current = true;
            window.location.href = subdomainUrl;
            return; // Don't resolve — browser is navigating away
          }
        }
      } catch {
        // Silently fail — subdomain routing is optional enhancement
      }
      setResolved(true);
    })();
  }, [location.pathname]);

  return { resolved, activeSubdomain };
}
