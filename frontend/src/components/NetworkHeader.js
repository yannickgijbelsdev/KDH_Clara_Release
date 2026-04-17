import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import usePageTitle from '../hooks/usePageTitle';
import {
  Globe, Crown, Network, Shield, Bell, Paintbrush,
  Server, ChevronDown, LogOut, ShieldAlert, UserCog,
  HardDrive, Code, Menu, X, LifeBuoy, Upload,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  TooltipProvider,
} from './ui/tooltip';
import { getAvatarUrl } from '../utils/avatar';
import { useBranding } from '../context/BrandingContext';

const API = process.env.REACT_APP_BACKEND_URL;

const roleLabels = {
  admin: 'Admin',
  network_admin: 'Network Admin',
  news_admin: 'News Admin',
  editor: 'Editor',
  presenter: 'Presenter',
  viewer: 'Viewer',
};

/**
 * Reusable Network-level top navigation header.
 *
 * Props:
 *  - activePage: 'network' | 'backups' | 'explorer'
 *  - activeSection: string (e.g. 'sites', 'admins') — used by NetworkDashboard for tab switching
 *  - onSectionChange: (sectionId) => void — callback for tab switching within NetworkDashboard
 *  - environments: array — pre-fetched environments (optional, avoids double-fetch)
 *  - selectedEnvId / onEnvChange — environment switcher state (optional)
 */
export default function NetworkHeader({
  activePage = 'network',
  activeSection,
  onSectionChange,
  environments: externalEnvs,
  selectedEnvId: externalEnvId,
  onEnvChange,
}) {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { branding } = useBranding();
  usePageTitle('Network Management', 'Clara');
  const [internalEnvs, setInternalEnvs] = useState([]);
  const [internalEnvId, setInternalEnvId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [supportCount, setSupportCount] = useState(0);

  const isSystemAdmin = user?.is_system_admin === true;
  const brandLogoUrl = branding.logo_type === 'image' && branding.logo_url
    ? (branding.logo_url.startsWith('/') ? `${API}${branding.logo_url}` : branding.logo_url)
    : null;
  const brandName = branding.platform_name || 'Clara';

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/support-tickets/counts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {})
      .then(d => setSupportCount(d.open || 0))
      .catch(() => {});
    const interval = setInterval(() => {
      fetch(`${API}/api/support-tickets/counts`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : {})
        .then(d => setSupportCount(d.open || 0))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [token]);

  // Use external environments if provided, else fetch internally
  const environments = externalEnvs || internalEnvs;
  const selectedEnvId = externalEnvId ?? internalEnvId;
  const setSelectedEnvId = onEnvChange || setInternalEnvId;

  const NAV_ITEMS = [
    { id: 'sites', icon: Globe, label: 'Sites Overview' },
    ...(isSystemAdmin ? [{ id: 'admins', icon: Crown, label: 'Network Admins' }] : []),
    { id: 'environments', icon: Server, label: 'Environments' },
    ...(isSystemAdmin ? [{ id: 'domains', icon: Globe, label: 'Domain Manager' }] : []),
    ...(isSystemAdmin ? [{ id: 'licenses', icon: Shield, label: 'License Manager' }] : []),
  ];

  const OVERFLOW_ITEMS = [
    { id: 'support-tickets', icon: LifeBuoy, label: 'Support', badge: supportCount },
    ...(isSystemAdmin ? [{ id: 'notifications', icon: Bell, label: 'Notifications' }] : []),
    ...(isSystemAdmin ? [{ id: 'branding', icon: Paintbrush, label: 'Branding' }] : []),
    ...(isSystemAdmin ? [{ id: 'vdc-deploy', icon: Upload, label: 'Deploy to VDC' }] : []),
    ...(isSystemAdmin ? [{ id: 'audit', icon: ShieldAlert, label: 'Permission Audit' }] : []),
    ...(isSystemAdmin ? [{ id: 'user-access', icon: UserCog, label: 'User Access' }] : []),
    { id: 'security', icon: Shield, label: 'Account Security' },
  ];

  const LINK_ITEMS = [
    { id: 'backups', icon: HardDrive, label: 'Backups', path: '/backups' },
    { id: 'explorer', icon: Code, label: 'API Explorer', path: '/explorer' },
  ];

  // Only fetch environments internally if not provided externally
  useEffect(() => {
    if (externalEnvs || !token) return;
    fetch(`${API}/api/environments`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setInternalEnvs(data);
        if (data.length > 0 && !internalEnvId) {
          const def = data.find(e => e.is_default) || data[0];
          setInternalEnvId(def.id);
        }
      })
      .catch(() => {});
  }, [token, externalEnvs]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleNavClick = (item) => {
    if (onSectionChange) {
      onSectionChange(item.id);
    } else {
      navigate('/network');
    }
  };

  const isActive = (item) => {
    // Section-based active state (NetworkDashboard)
    if (activeSection) return activeSection === item.id;
    // Page-based active state (standalone pages)
    if (item.id === 'sites' && activePage === 'network') return true;
    if (item.id === 'backups' && activePage === 'backups') return true;
    if (item.id === 'explorer' && activePage === 'explorer') return true;
    return false;
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* ─── Top Navigation Bar ─── */}
      <nav
        className="h-[64px] flex-shrink-0 flex items-center px-5 gap-4 bg-transparent z-50 overflow-x-hidden"
        data-testid="workspace-topbar"
      >
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          data-testid="mobile-menu-btn"
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/5 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo */}
        <Link
          to="/network"
          className={brandLogoUrl
            ? "flex items-center flex-shrink-0 hover:opacity-80 transition-opacity"
            : "bg-zinc-900 text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold hover:bg-zinc-800 transition-colors flex-shrink-0"}
          data-testid="logo-pill"
        >
          {brandLogoUrl ? (
            <img src={brandLogoUrl} alt={brandName} className="h-7 object-contain" />
          ) : (
            <><Network className="w-4 h-4" /><span className="hidden sm:inline">{brandName}</span></>
          )}
        </Link>
        <span className="hidden sm:inline text-sm text-zinc-400 font-medium flex-shrink-0" data-testid="enterprise-global-label">Enterprise Global</span>

        {/* Environment switcher */}
        {environments.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-1.5 border-white/40 bg-white/20 backdrop-blur-xl text-zinc-700 rounded-full hover:bg-white/35 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                data-testid="env-switcher"
              >
                <Server className="w-3 h-3" />
                <span className="hidden md:inline">
                  {environments.find(e => e.id === selectedEnvId)?.name || 'Environment'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bg-white/30 backdrop-blur-2xl border-white/40 shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.6)] rounded-2xl"
            >
              {environments.map(env => (
                <DropdownMenuItem
                  key={env.id}
                  onClick={() => setSelectedEnvId(env.id)}
                  className={`cursor-pointer ${selectedEnvId === env.id ? 'bg-orange-50 text-orange-600' : 'text-zinc-600 focus:text-zinc-900 focus:bg-black/5'}`}
                >
                  <div className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: env.color || '#3b82f6' }} />
                  {env.name}
                  <span className="ml-auto text-xs text-zinc-500">{env.site_count || 0}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Pill Tabs (desktop) */}
        <div
          className="hidden lg:flex items-center gap-1 mx-auto rounded-[28px] p-1.5 bg-transparent"
          data-testid="pill-nav"
        >
          {NAV_ITEMS.slice(0, 5).map(tab => {
            const active = isActive(tab);
            return (
              <button
                key={tab.id}
                onClick={() => handleNavClick(tab)}
                className={`relative px-5 py-2.5 rounded-[20px] text-sm font-medium transition-colors duration-200 z-[1] ${active ? 'text-white' : 'text-zinc-500 hover:text-zinc-700'}`}
                data-testid={`pill-${tab.id}`}
              >
                {active && (
                  <motion.div
                    layoutId="network-pill-active"
                    className="absolute inset-0 bg-zinc-900/80 backdrop-blur-md rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    style={{ zIndex: -1 }}
                  />
                )}
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">{tab.badge}</span>
                )}
              </button>
            );
          })}

          {/* More dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative px-4 py-2 rounded-full text-sm font-medium text-zinc-400 hover:text-zinc-700 hover:bg-white/60 transition-colors">
                More<ChevronDown className="w-3.5 h-3.5 ml-1 inline" />
                {supportCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5">{supportCount}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              className="bg-white/30 backdrop-blur-2xl border-white/40 shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.6)] rounded-2xl"
            >
              {/* Overflow nav items */}
              {OVERFLOW_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => handleNavClick(item)}
                    className={`cursor-pointer ${active ? 'bg-orange-50 text-orange-600' : 'text-zinc-600 focus:text-zinc-900 focus:bg-black/5'}`}
                  >
                    <Icon className="w-4 h-4 mr-2" />{item.label}
                    {item.badge > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] inline-flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">{item.badge}</span>
                    )}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator className="bg-black/[0.06]" />
              {/* Page links */}
              {LINK_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => navigate(item.path)}
                    className={`cursor-pointer ${active ? 'bg-orange-50 text-orange-600' : 'text-zinc-600 focus:text-zinc-900 focus:bg-black/5'}`}
                  >
                    <Icon className="w-4 h-4 mr-2" />{item.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* User menu */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-auto lg:ml-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2.5 hover:bg-black/[0.03] rounded-xl px-2 py-1.5 transition-colors"
                data-testid="user-menu-trigger"
              >
                {getAvatarUrl(user) ? (
                  <img src={getAvatarUrl(user)} alt={user?.name} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold text-sm">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-zinc-800 leading-tight">{user?.name}</p>
                  <p className="text-[11px] text-zinc-400">
                    {user?.is_network_admin ? 'Network Admin' : roleLabels[user?.role]}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white/90 backdrop-blur-2xl border-black/10 shadow-xl">
              <div className="px-3 py-2 flex items-center gap-3">
                {getAvatarUrl(user) ? (
                  <img src={getAvatarUrl(user)} alt={user?.name} className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-zinc-800">{user?.name}</p>
                  <p className="text-xs text-zinc-400">{user?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="bg-black/[0.06]" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-orange-500 focus:text-orange-500 focus:bg-orange-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full z-50 w-72 bg-white/95 backdrop-blur-2xl border-r border-black/[0.06] transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-5 h-full flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div className="bg-zinc-900 text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold">
              {brandLogoUrl ? (
                <img src={brandLogoUrl} alt={brandName} className="h-5 object-contain" />
              ) : (
                <><Network className="w-4 h-4" />{brandName}</>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="text-zinc-400 hover:text-zinc-700">
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <nav className="space-y-1">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => { handleNavClick(item); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${active ? 'bg-orange-50 text-orange-600' : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/5'}`}
                  >
                    <Icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
              {OVERFLOW_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => { handleNavClick(item); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${active ? 'bg-orange-50 text-orange-600' : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/5'}`}
                  >
                    <Icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
              {LINK_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${active ? 'bg-orange-50 text-orange-600' : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/5'}`}
                  >
                    <Icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="pt-4 border-t border-black/[0.06] mt-4">
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2 text-orange-500 hover:text-orange-600 hover:bg-orange-50">
              <LogOut className="w-4 h-4" />Sign out
            </Button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
