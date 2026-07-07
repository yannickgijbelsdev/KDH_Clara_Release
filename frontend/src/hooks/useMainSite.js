/**
 * useMainSite — resolve the current main site (tenant) from the URL slug.
 *
 * The app's tenant-scoped routes live under `/:mainSiteSlug/...`, so this
 * hook grabs that param, then fetches the caller's accessible main sites
 * and returns the matching one. Falls back to the first accessible site
 * when no slug is on the URL (e.g. embedded contexts).
 *
 * Returned shape:
 *   { mainSite, loading, error }
 *
 * NOTE: added by testing agent to unblock a compile-time import error in
 * RoomBookingsPage.js — the pattern intentionally mirrors what
 * AdminApprovalPage / TeamSettingsPage already do.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export function useMainSite() {
  const params = useParams();
  const slug = params.mainSiteSlug || params.mainSite || null;
  const [mainSite, setMainSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API}/main-sites/my/access`);
        const list = r.data?.main_sites || [];
        const match = slug ? list.find((s) => s.slug === slug) : list[0];
        if (!cancelled) {
          setMainSite(match || null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          // Fall back to the un-scoped /main-sites list (admins get everything)
          try {
            const r2 = await axios.get(`${API}/main-sites`);
            const list2 = Array.isArray(r2.data) ? r2.data : [];
            const match2 = slug ? list2.find((s) => s.slug === slug) : list2[0];
            setMainSite(match2 || null);
          } catch (e2) {
            setError(e2);
          }
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return { mainSite, loading, error };
}

export default useMainSite;
