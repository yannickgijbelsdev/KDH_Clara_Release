import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Radio,
  Calendar,
  FileText,
  Image,
  MessageSquare,
  Settings,
  Users,
  Trash2,
  CheckCircle,
  Activity,
  Globe,
  ChevronDown,
  LogOut,
  User,
  ArrowLeft,
  Layers,
  Sliders,
  Volume2,
  Zap,
  LayoutDashboard
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Feature to icon/route mapping
const FEATURE_CONFIG = {
  shows: { icon: Radio, label: 'Shows', route: 'shows' },
  calendar: { icon: Calendar, label: 'Calendar', route: 'calendar' },
  show_management: { icon: LayoutDashboard, label: 'Show Management', route: 'show-management' },
  content_library: { icon: FileText, label: 'Content Library', route: 'content' },
  media_library: { icon: Image, label: 'Media Library', route: 'media' },
  content_approval: { icon: CheckCircle, label: 'Content Approval', route: 'approvals' },
  trash: { icon: Trash2, label: 'Trash', route: 'trash' },
  team_chat: { icon: MessageSquare, label: 'Team Chat', route: 'chat' },
  rds_settings: { icon: Sliders, label: 'RDS Settings', route: 'rds' },
  rds_builder: { icon: Layers, label: 'RDS Builder', route: 'rds-builder' },
  stream_monitor: { icon: Volume2, label: 'Stream Monitor', route: 'streams' },
  sites: { icon: Globe, label: 'Sites', route: 'sites' },
  team_settings: { icon: Users, label: 'Team Settings', route: 'team' },
  wordpress: { icon: FileText, label: 'WordPress', route: 'wordpress' },
  activity_logs: { icon: Activity, label: 'Activity Logs', route: 'logs' },
};

// Feature groups for sidebar organization
const FEATURE_GROUPS = [
  { id: 'shows', label: 'Shows', features: ['shows', 'calendar', 'show_management'] },
  { id: 'content', label: 'Content', features: ['content_library', 'media_library', 'content_approval', 'trash'] },
  { id: 'communication', label: 'Communication', features: ['team_chat'] },
  { id: 'streaming', label: 'Streaming', features: ['rds_settings', 'rds_builder', 'stream_monitor'] },
  { id: 'sites', label: 'Sites', features: ['sites'] },
  { id: 'admin', label: 'Administration', features: ['team_settings', 'wordpress', 'activity_logs'] },
];

export default function MainSiteDashboardLayout() {
  const { user, token, logout } = useAuth();
  const { mainSite, mainSiteSlug, userRole, loading, error, hasFeature, isAdmin } = useMainSite();
  const location = useLocation();
  const navigate = useNavigate();
  const [myMainSites, setMyMainSites] = useState([]);

  useEffect(() => {
    fetchMyMainSites();
  }, [token]);

  const fetchMyMainSites = async () => {
    try {
      const res = await fetch(`${API}/api/main-sites/my/access`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyMainSites(data.main_sites || []);
      }
    } catch (err) {
      console.error('Failed to fetch main sites:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (error || !mainSite) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{error || 'Site not found'}</h1>
          <p className="text-zinc-400 mb-4">The requested main site could not be loaded.</p>
          <Button onClick={() => navigate('/')}>Go Back</Button>
        </div>
      </div>
    );
  }

  // Filter enabled features
  const enabledFeatures = mainSite.enabled_features || [];

  // Build navigation based on enabled features
  const navigation = FEATURE_GROUPS
    .map(group => ({
      ...group,
      items: group.features
        .filter(featureId => enabledFeatures.includes(featureId))
        .map(featureId => ({
          id: featureId,
          ...FEATURE_CONFIG[featureId],
          href: `/${mainSiteSlug}/${FEATURE_CONFIG[featureId].route}`
        }))
    }))
    .filter(group => group.items.length > 0);

  const isActiveRoute = (href) => location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        {/* Site Header */}
        <div className="p-4 border-b border-zinc-800">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 hover:bg-zinc-800 rounded-lg p-2 transition-colors">
                {mainSite.logo_url ? (
                  <img src={mainSite.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-zinc-500" />
                  </div>
                )}
                <div className="flex-1 text-left">
                  <div className="font-semibold text-sm truncate">{mainSite.name}</div>
                  <div className="text-xs text-zinc-500">/{mainSiteSlug}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-zinc-800">
              {myMainSites.map(site => (
                <DropdownMenuItem
                  key={site.id}
                  onClick={() => navigate(`/${site.slug}`)}
                  className={site.slug === mainSiteSlug ? 'bg-zinc-800' : ''}
                >
                  <Globe className="w-4 h-4 mr-2" />
                  {site.name}
                </DropdownMenuItem>
              ))}
              {user?.is_network_admin && (
                <>
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <DropdownMenuItem onClick={() => navigate('/network')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Network Admin
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          {navigation.map(group => (
            <div key={group.id} className="mb-6">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = isActiveRoute(item.href);
                  return (
                    <Link
                      key={item.id}
                      to={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        active
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-zinc-800">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 hover:bg-zinc-800 rounded-lg p-2 transition-colors">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                  {user?.avatar?.url ? (
                    <img src={user.avatar.url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium truncate">{user?.name}</div>
                  <div className="text-xs text-zinc-500">{userRole}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800">
              <DropdownMenuItem onClick={() => navigate(`/${mainSiteSlug}/settings`)}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem onClick={logout} className="text-red-400">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
