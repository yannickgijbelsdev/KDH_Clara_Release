import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useMainSite } from './MainSiteContext';

const PermissionsContext = createContext(null);

const API = process.env.REACT_APP_BACKEND_URL;

export function PermissionsProvider({ children }) {
  const { token, user } = useAuth();
  const { mainSite } = useMainSite();
  const [permissions, setPermissions] = useState(null);
  const [roleSlug, setRoleSlug] = useState(null);
  const [roleInfo, setRoleInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!token || !mainSite?.id) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/api/auth/me/permissions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Main-Site-ID': mainSite.id,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions || {});
        setRoleSlug(data.role_slug);
        setRoleInfo(data.role_info);
      }
    } catch (e) {
      console.error('Failed to fetch permissions:', e);
    }
    setLoading(false);
  }, [token, mainSite?.id]);

  useEffect(() => {
    setLoading(true);
    fetchPermissions();
  }, [fetchPermissions]);

  /**
   * Check if user has a specific permission.
   * @param {string} feature - e.g. "shows", "content_library"
   * @param {string} action - "view", "create", "edit", "delete"
   * @returns {boolean}
   */
  const can = useCallback((feature, action = 'view') => {
    // Network admin always has access
    if (user?.is_network_admin) return true;
    if (!permissions) return false;
    if (permissions._full_access) return true;
    return permissions[feature]?.[action] === true;
  }, [permissions, user?.is_network_admin]);

  /**
   * Check if user can view a feature (shorthand for can(feature, 'view'))
   */
  const canView = useCallback((feature) => can(feature, 'view'), [can]);
  const canCreate = useCallback((feature) => can(feature, 'create'), [can]);
  const canEdit = useCallback((feature) => can(feature, 'edit'), [can]);
  const canDelete = useCallback((feature) => can(feature, 'delete'), [can]);

  return (
    <PermissionsContext.Provider value={{
      permissions, roleSlug, roleInfo, loading,
      can, canView, canCreate, canEdit, canDelete,
      refreshPermissions: fetchPermissions,
    }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    // Return a permissive fallback when outside provider (e.g. network admin pages)
    return {
      permissions: { _full_access: true },
      can: () => true,
      canView: () => true,
      canCreate: () => true,
      canEdit: () => true,
      canDelete: () => true,
      loading: false,
    };
  }
  return ctx;
}
