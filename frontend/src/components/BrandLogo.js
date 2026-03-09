import { useBranding } from '../context/BrandingContext';

const API = process.env.REACT_APP_BACKEND_URL;

export function BrandLogo({ className = 'text-lg font-bold text-white', imgClass = 'h-7 object-contain' }) {
  const { branding } = useBranding();
  const name = branding.platform_name || 'Clara';

  if (branding.logo_type === 'image' && branding.logo_url) {
    const url = branding.logo_url.startsWith('/') ? `${API}${branding.logo_url}` : branding.logo_url;
    return <img src={url} alt={name} className={imgClass} />;
  }

  return <span className={className}>{name}</span>;
}

export function BrandName() {
  const { branding } = useBranding();
  return branding.platform_name || 'Clara';
}
