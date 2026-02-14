import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const MainSiteContext = createContext(null);

// Helper function to setup axios interceptor
const setupInterceptor = (interceptorRef, mainSiteId) => {
  // Remove previous interceptor if it exists
  if (interceptorRef.current !== null) {
    axios.interceptors.request.eject(interceptorRef.current);
    interceptorRef.current = null;
  }

  // Add new interceptor when mainSiteId is available
  if (mainSiteId) {
    interceptorRef.current = axios.interceptors.request.use(
      (config) => {
        // Add main site ID header to all API requests
        config.headers['X-Main-Site-ID'] = mainSiteId;
        return config;
      },
      (error) => Promise.reject(error)
    );
  }
};

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
  useEffect(() => {
    return () => {
      if (interceptorRef.current !== null) {
        axios.interceptors.request.eject(interceptorRef.current);
        interceptorRef.current = null;
      }
    };
  }, []);

  const fetchMainSite = useCallback(async () => {
    if (!mainSiteSlug || !token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/api/main-sites/by-slug/${mainSiteSlug}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        
        // IMPORTANT: Setup interceptor BEFORE setting mainSite state
        // This ensures the interceptor is ready before any child components
        // start making API calls after the re-render
        setupInterceptor(interceptorRef, data.id);
        
        setMainSite(data);
        setError(null);

        // Get user's role for this main site
        const accessRes = await fetch(`${API}/api/main-sites/my/access`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (accessRes.ok) {
          const accessData = await accessRes.json();
          const siteAccess = accessData.main_sites?.find(s => s.slug === mainSiteSlug);
          setUserRole(siteAccess?.role || (accessData.is_network_admin ? 'network_admin' : null));
        }
      } else if (res.status === 404) {
        setError('Main site not found');
        setupInterceptor(interceptorRef, null); // Clear interceptor
        setMainSite(null);
      } else if (res.status === 403) {
        setError('Access denied');
        setupInterceptor(interceptorRef, null); // Clear interceptor
        setMainSite(null);
      } else {
        setError('Failed to load main site');
        setupInterceptor(interceptorRef, null); // Clear interceptor
        setMainSite(null);
      }
    } catch (err) {
      console.error('Failed to fetch main site:', err);
      setError('Failed to load main site');
      setupInterceptor(interceptorRef, null); // Clear interceptor
      setMainSite(null);
    } finally {
      setLoading(false);
    }
  }, [mainSiteSlug, token]);

  // Clear interceptor and state when mainSiteSlug changes (before fetching new site)
  useEffect(() => {
    // Clear the interceptor immediately when slug changes
    // This prevents the old site's ID from being sent during the transition
    setupInterceptor(interceptorRef, null);
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
