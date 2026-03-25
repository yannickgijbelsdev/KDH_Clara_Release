import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * useSubdomainRouter — detects if the app is loaded on a configured subdomain
 * (e.g., login.koodh.com) and automatically navigates to the correct path.
 * 
 * How it works:
 * 1. Checks window.location.hostname for a subdomain
 * 2. Fetches the public routes from the API
 * 3. If the subdomain matches a route, navigates to target_path
 * 
 * Only activates on real subdomain setups (not localhost, not preview.emergentagent.com)
 */
export function useSubdomainRouter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [resolved, setResolved] = useState(false);
  const [activeSubdomain, setActiveSubdomain] = useState(null);

  useEffect(() => {
    const hostname = window.location.hostname;

    // Skip on localhost and preview environments
    if (hostname === 'localhost' || hostname.includes('preview.emergentagent.com') || hostname.includes('127.0.0.1')) {
      setResolved(true);
      return;
    }

    // Fetch routes and detect subdomain
    (async () => {
      try {
        const res = await fetch(`${API}/api/domains/routes/public`);
        if (!res.ok) { setResolved(true); return; }
        const data = await res.json();
        const baseDomain = data.base_domain;

        if (!baseDomain || !hostname.endsWith(`.${baseDomain}`)) {
          setResolved(true);
          return;
        }

        const subdomain = hostname.replace(`.${baseDomain}`, '');
        const route = data.routes?.find(r => r.subdomain === subdomain);

        if (route) {
          setActiveSubdomain(subdomain);
          // Only navigate if we're on root and the target is different
          if (location.pathname === '/' && route.target_path !== '/') {
            navigate(route.target_path, { replace: true });
          }
        }
      } catch {
        // Silently fail — subdomain routing is optional
      }
      setResolved(true);
    })();
  }, []);

  return { resolved, activeSubdomain };
}
