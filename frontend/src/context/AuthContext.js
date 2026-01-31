import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(null); // Original user when impersonating

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

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

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    localStorage.removeItem('impersonating'); // Clear any impersonation
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    setImpersonating(null);
    return userData;
  };

  const register = async (email, password, name, teamName) => {
    const response = await axios.post(`${API}/auth/register`, { 
      email, 
      password, 
      name,
      team_name: teamName 
    });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('impersonating');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setImpersonating(null);
  };

  // Admin: Switch to another user's account
  const switchToUser = async (userId) => {
    try {
      const response = await axios.post(`${API}/admin/switch-user/${userId}`);
      const { token: newToken, user: targetUser, original_user } = response.data;
      
      // Store original user info for returning later
      localStorage.setItem('impersonating', JSON.stringify(original_user));
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      setImpersonating(original_user);
      setToken(newToken);
      setUser(targetUser);
      
      return targetUser;
    } catch (error) {
      throw error;
    }
  };

  // Return to original admin account
  const exitImpersonation = async () => {
    try {
      const response = await axios.post(`${API}/admin/exit-impersonation`);
      const { token: newToken, user: originalUser } = response.data;
      
      localStorage.removeItem('impersonating');
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      setImpersonating(null);
      setToken(newToken);
      setUser(originalUser);
      
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
  const isEditor = user?.role === 'editor' || user?.role === 'admin';
  const isPresenter = user?.role === 'presenter';
  const isViewer = user?.role === 'viewer';
  const canEditContent = isAdmin || isEditor || isPresenter;

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      login, 
      register, 
      logout,
      isAdmin,
      isEditor,
      isPresenter,
      isViewer,
      canEditContent,
      switchToUser,
      exitImpersonation,
      impersonating,
      updateUserPreferences
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
