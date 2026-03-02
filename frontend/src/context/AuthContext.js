import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Session warning time - 5 minutes before expiry
const SESSION_WARNING_MINUTES = 5;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(null); // Original user when impersonating
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(null);
  const sessionTimerRef = useRef(null);
  const warningTimerRef = useRef(null);

  // Clear all session timers
  const clearSessionTimers = useCallback(() => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearInterval(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  // Setup session expiration timers
  const setupSessionTimers = useCallback((expiresAt) => {
    clearSessionTimers();
    
    if (!expiresAt) return;
    
    const now = Date.now();
    const expiryTime = expiresAt * 1000; // Convert to milliseconds
    const timeUntilExpiry = expiryTime - now;
    const warningTime = SESSION_WARNING_MINUTES * 60 * 1000;
    
    if (timeUntilExpiry <= 0) {
      // Already expired
      logout();
      return;
    }
    
    // Set up warning timer (5 minutes before expiry)
    const timeUntilWarning = timeUntilExpiry - warningTime;
    if (timeUntilWarning > 0) {
      sessionTimerRef.current = setTimeout(() => {
        setShowSessionWarning(true);
        // Start countdown
        warningTimerRef.current = setInterval(() => {
          const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
          setSessionTimeLeft(remaining);
          if (remaining <= 0) {
            clearSessionTimers();
            logout();
          }
        }, 1000);
      }, timeUntilWarning);
    } else if (timeUntilExpiry > 0) {
      // Less than 5 minutes left, show warning immediately
      setShowSessionWarning(true);
      warningTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
        setSessionTimeLeft(remaining);
        if (remaining <= 0) {
          clearSessionTimers();
          logout();
        }
      }, 1000);
    }
    
    // Set up auto-logout timer
    sessionTimerRef.current = setTimeout(() => {
      logout();
    }, timeUntilExpiry);
    
  }, [clearSessionTimers]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
      
      // Restore session expiration from localStorage
      const storedExpiry = localStorage.getItem('session_expires_at');
      if (storedExpiry) {
        const expiresAt = parseFloat(storedExpiry);
        setSessionExpiresAt(expiresAt);
        setupSessionTimers(expiresAt);
      }
    } else {
      setLoading(false);
    }
    
    return () => clearSessionTimers();
  }, [token, setupSessionTimers, clearSessionTimers]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
      
      // Check if we're impersonating (stored in localStorage)
      const impersonatingData = localStorage.getItem('impersonating');
      if (impersonatingData) {
        setImpersonating(JSON.parse(impersonatingData));
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, totpCode = null, backupCode = null) => {
    const response = await axios.post(`${API}/auth/login`, { 
      email, 
      password,
      totp_code: totpCode,
      backup_code: backupCode
    });
    
    const { requires_2fa, token: newToken, user: userData, expires_at, temp_token, force_password_change } = response.data;
    
    // If 2FA is required and no code was provided, return the flag
    if (requires_2fa && !newToken) {
      return { requires_2fa: true, temp_token };
    }
    
    // Full login successful
    localStorage.setItem('token', newToken);
    localStorage.removeItem('impersonating'); // Clear any impersonation
    if (expires_at) {
      localStorage.setItem('session_expires_at', expires_at.toString());
      setSessionExpiresAt(expires_at);
      setupSessionTimers(expires_at);
    }
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser({ ...userData, force_password_change: force_password_change || false });
    setImpersonating(null);
    setShowSessionWarning(false);
    return { ...userData, force_password_change: force_password_change || false };
  };

  const register = async (email, password, name, teamName) => {
    const response = await axios.post(`${API}/auth/register`, { 
      email, 
      password, 
      name,
      team_name: teamName 
    });
    const { token: newToken, user: userData, expires_at } = response.data;
    localStorage.setItem('token', newToken);
    if (expires_at) {
      localStorage.setItem('session_expires_at', expires_at.toString());
      setSessionExpiresAt(expires_at);
      setupSessionTimers(expires_at);
    }
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    setShowSessionWarning(false);
    return userData;
  };

  const logout = useCallback(() => {
    clearSessionTimers();
    localStorage.removeItem('token');
    localStorage.removeItem('impersonating');
    localStorage.removeItem('session_expires_at');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setImpersonating(null);
    setSessionExpiresAt(null);
    setShowSessionWarning(false);
    setSessionTimeLeft(null);
  }, [clearSessionTimers]);

  // Dismiss session warning (user acknowledges but doesn't extend)
  const dismissSessionWarning = () => {
    setShowSessionWarning(false);
  };

  // Refresh user data from API
  const refreshUser = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  // Admin: Switch to another user's account
  const switchToUser = async (userId) => {
    try {
      const response = await axios.post(`${API}/admin/switch-user/${userId}`);
      const { token: newToken, user: targetUser, original_user, expires_at } = response.data;
      
      // Store original user info for returning later
      localStorage.setItem('impersonating', JSON.stringify(original_user));
      localStorage.setItem('token', newToken);
      if (expires_at) {
        localStorage.setItem('session_expires_at', expires_at.toString());
        setSessionExpiresAt(expires_at);
        setupSessionTimers(expires_at);
      }
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      setImpersonating(original_user);
      setToken(newToken);
      setUser(targetUser);
      setShowSessionWarning(false);
      
      return targetUser;
    } catch (error) {
      throw error;
    }
  };

  // Return to original admin account
  const exitImpersonation = async () => {
    try {
      const response = await axios.post(`${API}/admin/exit-impersonation`);
      const { token: newToken, user: originalUser, expires_at } = response.data;
      
      localStorage.removeItem('impersonating');
      localStorage.setItem('token', newToken);
      if (expires_at) {
        localStorage.setItem('session_expires_at', expires_at.toString());
        setSessionExpiresAt(expires_at);
        setupSessionTimers(expires_at);
      }
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      setImpersonating(null);
      setToken(newToken);
      setUser(originalUser);
      setShowSessionWarning(false);
      
      return originalUser;
    } catch (error) {
      throw error;
    }
  };

  // Update user preferences locally
  const updateUserPreferences = (preferences) => {
    setUser(prev => ({
      ...prev,
      preferences: { ...prev?.preferences, ...preferences }
    }));
  };

  const isAdmin = user?.role === 'admin';
  const isNewsAdmin = user?.role === 'news_admin';
  const isEditor = user?.role === 'editor' || user?.role === 'admin' || user?.role === 'news_admin';
  const isPresenter = user?.role === 'presenter';
  const isViewer = user?.role === 'viewer';
  const canEditContent = isAdmin || isNewsAdmin || isEditor || isPresenter;
  const canApproveContent = isAdmin || isNewsAdmin;

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      login, 
      register, 
      logout,
      isAdmin,
      isNewsAdmin,
      isEditor,
      isPresenter,
      isViewer,
      canEditContent,
      canApproveContent,
      switchToUser,
      exitImpersonation,
      impersonating,
      updateUserPreferences,
      sessionExpiresAt,
      showSessionWarning,
      sessionTimeLeft,
      dismissSessionWarning,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
