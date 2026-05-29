import { useBranding } from '../context/BrandingContext';

const API = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_LOGO = '/koodh_clara_logo.png';

export function BrandLogo({ className = 'text-lg font-bold text-zinc-900', imgClass = 'h-9 object-contain rounded' }) {
  const { branding } = useBranding();
  const name = branding.platform_name || 'Koodh Clara';

  if (branding.logo_type === 'image' && branding.logo_url) {
    const url = branding.logo_url.startsWith('/') ? `${API}${branding.logo_url}` : branding.logo_url;
    return <img src={url} alt={name} className={imgClass} />;
  }

  // Default fallback: Koodh Clara logo
  return <img src={DEFAULT_LOGO} alt={name} className={imgClass} />;
}

export function BrandName() {
  const { branding } = useBranding();
  return branding.platform_name || 'Koodh Clara';
}
