/* eslint-disable */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const BrandingContext = createContext(null);

const DEFAULT_BRANDING = {
  platform_name: 'Clara',
  logo_type: 'text',
  logo_url: null,
  favicon_url: null,
  login_layout: 'left',
  login_image_type: 'static',
  login_images: [],
};

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  const fetchBranding = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/branding`);
      setBranding({ ...DEFAULT_BRANDING, ...res.data });
    } catch {
      // Use defaults on error
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Favicon is intentionally kept FIXED to the periwinkle chevron
  // (public/favicon.ico + favicon.png). The branding.favicon_url is NOT applied
  // dynamically so that every tab shows the Clara brand icon consistently.

  return (
    <BrandingContext.Provider value={{ branding, refreshBranding: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext) || { branding: DEFAULT_BRANDING, refreshBranding: () => {} };
}
