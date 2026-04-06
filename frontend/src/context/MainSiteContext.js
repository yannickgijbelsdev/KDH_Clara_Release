import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const MainSiteContext = createContext(null);

// Global ref to track the current main site ID (avoids stale closures in interceptor)
let _currentMainSiteId = null;
export const getCurrentMainSiteId = () => _currentMainSiteId;

export const useMainSite = () => {
  const context = useContext(MainSiteContext);
  if (!context) {
    throw new Error('useMainSite must be used within a MainSiteProvider');
  }
  return context;
};

export const MainSiteProvider = ({ children }) => {
  const { user, token } = useAuth();
  const { mainSiteSlug } = useParams();
  const navigate = useNavigate();
  
  const [mainSite, setMainSite] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const interceptorRef = useRef(null);

  // Cleanup interceptor on unmount
  // Setup interceptor once on mount, it reads from _currentMainSiteId
  useEffect(() => {
    interceptorRef.current = axios.interceptors.request.use(
      (config) => {
        if (_currentMainSiteId) {
          config.headers['X-Main-Site-ID'] = _currentMainSiteId;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    return () => {
      if (interceptorRef.current !== null) {
        axios.interceptors.request.eject(interceptorRef.current);
        interceptorRef.current = null;
      }
      _currentMainSiteId = null;
    };
  }, []);

  const fetchMainSite = useCallback(async () => {
    if (!mainSiteSlug || !token) {
      setLoading(false);
      return;
    }

    try {
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Fetch site data and user access in parallel for speed
      const [res, accessRes] = await Promise.all([
        fetch(`${API}/api/main-sites/by-slug/${mainSiteSlug}`, { method: 'GET', headers }),
        fetch(`${API}/api/main-sites/my/access`, { method: 'GET', headers }),
      ]);

      if (res.ok) {
        const data = await res.json();
        _currentMainSiteId = data.id;
        setMainSite(data);
        setError(null);

        if (accessRes.ok) {
          const accessData = await accessRes.json();
          const siteAccess = accessData.main_sites?.find(s => s.slug === mainSiteSlug);
          setUserRole(siteAccess?.role || (accessData.is_network_admin ? 'network_admin' : null));
        }
      } else if (res.status === 404) {
        setError('Main site not found');
        _currentMainSiteId = null;
        setMainSite(null);
      } else if (res.status === 401) {
        setError('Session expired');
        _currentMainSiteId = null;
        setMainSite(null);
      } else if (res.status === 403) {
        try {
          const errData = await res.json();
          setError(errData.detail || 'Access denied');
        } catch {
          setError('Access denied');
        }
        _currentMainSiteId = null;
        setMainSite(null);
      } else {
        setError('Failed to load main site');
        _currentMainSiteId = null;
        setMainSite(null);
      }
    } catch (err) {
      console.error('Failed to fetch main site:', err);
      setError('Failed to load main site');
      _currentMainSiteId = null;
      setMainSite(null);
    } finally {
      setLoading(false);
    }
  }, [mainSiteSlug, token]);

  // Clear interceptor and state when mainSiteSlug changes (before fetching new site)
  useEffect(() => {
    // Clear the interceptor immediately when slug changes
    // This prevents the old site's ID from being sent during the transition
    _currentMainSiteId = null;
    setMainSite(null);
    setLoading(true);
    setError(null);
    
    // Fetch the new main site
    fetchMainSite();
  }, [mainSiteSlug]); // Only depend on mainSiteSlug, not fetchMainSite

  // Also fetch when token changes (but don't reset state)
  useEffect(() => {
    if (token && mainSiteSlug && !mainSite) {
      fetchMainSite();
    }
  }, [token]);

  // Check if a feature is enabled
  const hasFeature = useCallback((featureId) => {
    if (!mainSite) return false;
    return mainSite.enabled_features?.includes(featureId) || false;
  }, [mainSite]);

  // Check if user has specific permission level
  const hasPermission = useCallback((requiredRole) => {
    if (user?.is_network_admin) return true;
    
    const roleHierarchy = ['viewer', 'presenter', 'editor', 'admin', 'network_admin'];
    const userRoleIndex = roleHierarchy.indexOf(userRole);
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    
    return userRoleIndex >= requiredRoleIndex;
  }, [userRole, user?.is_network_admin]);

  // Check if user is admin (main site admin or network admin)
  const isAdmin = useCallback(() => {
    return user?.is_network_admin || userRole === 'admin';
  }, [userRole, user?.is_network_admin]);

  const value = {
    mainSite,
    mainSiteSlug,
    userRole,
    loading,
    error,
    hasFeature,
    hasPermission,
    isAdmin,
    refreshMainSite: fetchMainSite
  };

  return (
    <MainSiteContext.Provider value={value}>
      {children}
    </MainSiteContext.Provider>
  );
};

export default MainSiteContext;
