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

  // Update favicon dynamically
  useEffect(() => {
    if (branding.favicon_url) {
      const url = branding.favicon_url.startsWith('/') ? `${API}${branding.favicon_url}` : branding.favicon_url;
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = url;
    }
  }, [branding.favicon_url]);

  return (
    <BrandingContext.Provider value={{ branding, refreshBranding: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext) || { branding: DEFAULT_BRANDING, refreshBranding: () => {} };
}
