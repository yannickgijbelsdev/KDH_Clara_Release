import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { 
  LayoutList, LogOut, User, Calendar, Settings, Crown, Pencil, Eye, 
  FileText, Globe, MessageSquare, File, Mic, Menu, X, Sliders, Home, 
  ScrollText, ClipboardCheck, Trash2, Users, ChevronDown, ChevronRight,
  UserCog, ArrowLeftRight, FileCheck, Radio, Headphones, Wand2, Play,
  ArrowLeft, Send, Palette, Network
} from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const roleIcons = {
  admin: Crown,
  network_admin: Network,
  news_admin: FileCheck,
  editor: Pencil,
  presenter: Mic,
  viewer: Eye,
};

const roleLabels = {
  admin: 'Admin',
  network_admin: 'Network Admin',
  news_admin: 'News Admin',
  editor: 'Editor',
  presenter: 'Presenter',
  viewer: 'Viewer',
};

// Feature to navigation mapping
const FEATURE_NAV_ITEMS = {
  shows: { to: 'shows', icon: LayoutList, label: 'Shows' },
  calendar: { to: 'calendar', icon: Calendar, label: 'Calendar' },
  show_management: { to: 'show-management', icon: Sliders, label: 'Show Management', adminOnly: true },
  content_library: { to: 'content', icon: FileText, label: 'Content Library' },
  media_library: { to: 'media', icon: File, label: 'Media Library' },
  content_approval: { to: 'approvals', icon: ClipboardCheck, label: 'Content Approval', approverOnly: true },
  trash: { to: 'trash', icon: Trash2, label: 'Trash', adminOnly: true },
  team_chat: { to: 'chat', icon: MessageSquare, label: 'Team Chat' },
  rds_settings: { to: 'rds', icon: Radio, label: 'RDS Settings', adminOnly: true },
  rds_builder: { to: 'rds-builder', icon: Wand2, label: 'RDS Builder', adminOnly: true },
  stream_monitor: { to: 'streams', icon: Headphones, label: 'Stream Monitor', adminOnly: true },
  sites: { to: 'sites', icon: Globe, label: 'Sites', adminOnly: true, hasSitesList: true },
  team_settings: { to: 'team', icon: Users, label: 'Team Settings', adminOnly: true },
  wordpress: { to: 'wordpress', icon: Globe, label: 'WordPress', adminOnly: true },
  activity_logs: { to: 'logs', icon: ScrollText, label: 'Activity Logs', adminOnly: true },
};

// Navigation groups with feature mapping
const NAV_GROUPS = [
  {
    id: 'shows',
    label: 'Shows',
    icon: LayoutList,
    features: ['shows', 'calendar', 'show_management']
  },
  {
    id: 'content',
    label: 'Content',
    icon: FileText,
    features: ['content_library', 'media_library', 'content_approval', 'trash']
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: MessageSquare,
    features: ['team_chat']
  },
  {
    id: 'streaming',
    label: 'Streaming & RDS',
    icon: Radio,
    features: ['rds_settings', 'rds_builder', 'stream_monitor']
  },
  {
    id: 'sites',
    label: 'Sites',
    icon: Globe,
    features: ['sites']
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Settings,
    features: ['team_settings', 'wordpress', 'activity_logs']
  },
];

// Site-specific navigation group (shown when in site context)
const getSiteNavGroup = (currentSite) => ({
  id: 'site',
  label: currentSite?.name || 'Site',
  icon: Globe,
  items: [
    { to: '#general', icon: Settings, label: 'General', tab: 'general' },
    { to: '#media', icon: Play, label: 'Media', tab: 'media' },
    { to: '#form', icon: MessageSquare, label: 'Form', tab: 'form' },
    { to: '#styling', icon: Palette, label: 'Styling', tab: 'styling' },
    { to: '#submissions', icon: Send, label: 'Submissions', tab: 'submissions' },
    { to: '#users', icon: Users, label: 'Users', tab: 'users' },
  ]
});

const MainSiteDashboardLayout = () => {
  const { user, logout, impersonating, exitImpersonation } = useAuth();
  const { mainSite, mainSiteSlug, userRole, loading, error, hasFeature, isAdmin } = useMainSite();
  const navigate = useNavigate();
  const location = useLocation();
  const { siteId } = useParams();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(['shows', 'content', 'site']);
  const [menuCounts, setMenuCounts] = useState({});
  const [sites, setSites] = useState([]);
  const [currentSite, setCurrentSite] = useState(null);
  const [siteTab, setSiteTab] = useState('general');
  const [submissionCounts, setSubmissionCounts] = useState({});
  const [myMainSites, setMyMainSites] = useState([]);

  // Check if we're in a site context
  const siteMatch = location.pathname.match(/\/sites\/([^/]+)/);
  const isInSiteContext = !!siteMatch;
  const currentSiteId = siteMatch ? siteMatch[1] : siteId;

  // Check if user can approve content (admin or news_admin or network_admin)
  const canApprove = isAdmin() || user?.role === 'news_admin';
  
  // Check if user is admin for this main site
  const userIsAdmin = isAdmin();

  // Fetch my main sites for switcher
  const fetchMyMainSites = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/main-sites/my/access`);
      setMyMainSites(response.data.main_sites || []);
    } catch (error) {
      console.error('Failed to fetch main sites:', error);
    }
  }, []);

  // Fetch menu counts
  const fetchMenuCounts = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/menu/counts`);
      setMenuCounts(response.data);
    } catch (error) {
      console.error('Failed to fetch menu counts:', error);
    }
  }, []);

  // Fetch sites for navigation
  const fetchSites = useCallback(async () => {
    if (!userIsAdmin || !mainSite) return;
    try {
      const response = await axios.get(`${API}/main-sites/${mainSite.id}/sites`);
      setSites(response.data || []);
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    }
  }, [userIsAdmin, mainSite]);

  // Fetch current site details when in site context
  const fetchCurrentSite = useCallback(async () => {
    if (!currentSiteId) {
      setCurrentSite(null);
      return;
    }
    try {
      const response = await axios.get(`${API}/sites/${currentSiteId}`);
      setCurrentSite(response.data);
    } catch (error) {
      console.error('Failed to fetch current site:', error);
      setCurrentSite(null);
    }
  }, [currentSiteId]);

  // Fetch submission counts for current site
  const fetchSubmissionCount = useCallback(async () => {
    if (!currentSiteId) return;
    try {
      const response = await axios.get(`${API}/sites/${currentSiteId}/submissions/count`);
      setSubmissionCounts(prev => ({ ...prev, [currentSiteId]: response.data.count }));
    } catch (error) {
      console.error('Failed to fetch submission count:', error);
    }
  }, [currentSiteId]);

  // Fetch counts on mount and periodically
  useEffect(() => {
    if (user && mainSite) {
      fetchMenuCounts();
      fetchSites();
      fetchMyMainSites();
      const interval = setInterval(fetchMenuCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [user, mainSite, fetchMenuCounts, fetchSites, fetchMyMainSites]);

  // Fetch current site when entering site context
  useEffect(() => {
    fetchCurrentSite();
  }, [fetchCurrentSite]);

  // Fetch submission count when in site context
  useEffect(() => {
    if (isInSiteContext && currentSiteId) {
      fetchSubmissionCount();
      const interval = setInterval(fetchSubmissionCount, 15000);
      return () => clearInterval(interval);
    }
  }, [isInSiteContext, currentSiteId, fetchSubmissionCount]);

  // Listen for submissions viewed event to clear badge
  useEffect(() => {
    const handleSubmissionsViewed = (e) => {
      const siteId = e.detail;
      setSubmissionCounts(prev => ({ ...prev, [siteId]: 0 }));
    };
    window.addEventListener('submissionsViewed', handleSubmissionsViewed);
    return () => window.removeEventListener('submissionsViewed', handleSubmissionsViewed);
  }, []);

  // Update browser tab title dynamically
  useEffect(() => {
    if (isInSiteContext && currentSite) {
      document.title = `Clara | ${currentSite.name}`;
    } else if (mainSite?.name) {
      document.title = `Clara | ${mainSite.name}`;
    } else {
      document.title = 'Clara';
    }
  }, [isInSiteContext, currentSite, mainSite?.name]);

  // Mark chat as read when visiting chat page
  useEffect(() => {
    if (location.pathname.endsWith('/chat') && menuCounts.chat > 0) {
      axios.post(`${API}/chat/mark-read`).then(() => {
        setMenuCounts(prev => ({ ...prev, chat: 0 }));
      });
    }
  }, [location.pathname, menuCounts.chat]);

  // Mark logs as viewed when visiting logs page
  useEffect(() => {
    if (location.pathname.endsWith('/logs') && menuCounts.logs > 0) {
      axios.post(`${API}/logs/mark-viewed`).then(() => {
        setMenuCounts(prev => ({ ...prev, logs: 0 }));
      });
    }
  }, [location.pathname, menuCounts.logs]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleExitImpersonation = async () => {
    try {
      await exitImpersonation();
      navigate(`/${mainSiteSlug}/team`);
    } catch (error) {
      console.error('Failed to exit impersonation:', error);
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const RoleIcon = roleIcons[userRole] || roleIcons[user?.role] || User;

  // Get badge count for a route
  const getBadgeCount = (route) => {
    if (route === 'chat') return menuCounts.chat || 0;
    if (route === 'approvals') return menuCounts.pending_approvals || 0;
    if (route === 'logs') return menuCounts.logs || 0;
    return 0;
  };

  // Build navigation groups based on enabled features
  const buildNavGroups = () => {
    if (!mainSite) return [];
    
    const enabledFeatures = mainSite.enabled_features || [];
    
    return NAV_GROUPS.map(group => {
      const items = group.features
        .filter(featureId => enabledFeatures.includes(featureId))
        .map(featureId => {
          const navItem = FEATURE_NAV_ITEMS[featureId];
          if (!navItem) return null;
          
          // Check permissions
          if (navItem.adminOnly && !userIsAdmin) return null;
          if (navItem.approverOnly && !canApprove) return null;
          
          return {
            ...navItem,
            to: `/${mainSiteSlug}/${navItem.to}`,
            featureId
          };
        })
        .filter(Boolean);
      
      if (items.length === 0) return null;
      
      return { ...group, items };
    }).filter(Boolean);
  };

  const navGroups = buildNavGroups();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  // Error state
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

  // Render grouped navigation item
  const renderGroupedNavItem = (item, isSubItem = false) => {
    const Icon = item.icon;
    const badgeCount = getBadgeCount(item.to.split('/').pop());
    
    // Handle site-specific navigation (tabs)
    if (item.tab) {
      const isActive = siteTab === item.tab;
      return (
        <button
          key={item.tab}
          onClick={() => setSiteTab(item.tab)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left ${
            isActive
              ? 'bg-orange-500/10 text-orange-500'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1">{item.label}</span>
          {item.tab === 'submissions' && submissionCounts[currentSiteId] > 0 && (
            <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
              {submissionCounts[currentSiteId]}
            </span>
          )}
        </button>
      );
    }
    
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={closeSidebar}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isActive
              ? 'bg-orange-500/10 text-orange-500'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`
        }
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{item.label}</span>
        {badgeCount > 0 && (
          <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
            {badgeCount}
          </span>
        )}
      </NavLink>
    );
  };

  // Render grouped navigation
  const renderGroupedNavigation = () => {
    const groupsToRender = isInSiteContext && currentSite
      ? [getSiteNavGroup(currentSite), ...navGroups]
      : navGroups;

    return (
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {/* Back button when in site context */}
        {isInSiteContext && (
          <button
            onClick={() => navigate(`/${mainSiteSlug}/sites`)}
            className="flex items-center gap-2 px-3 py-2 mb-4 text-zinc-400 hover:text-white transition-colors w-full"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to Sites</span>
          </button>
        )}

        {groupsToRender.map((group) => (
          <Collapsible
            key={group.id}
            open={expandedGroups.includes(group.id)}
            onOpenChange={() => toggleGroup(group.id)}
            className="mb-2"
          >
            <CollapsibleTrigger className="flex items-center gap-2 px-3 py-2 w-full text-left text-zinc-500 hover:text-zinc-300 transition-colors">
              <group.icon className="h-4 w-4" />
              <span className="flex-1 text-xs font-semibold uppercase tracking-wider">{group.label}</span>
              {expandedGroups.includes(group.id) ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-2 space-y-1">
              {group.items.map(item => renderGroupedNavItem(item, true))}
              
              {/* Sites submenu */}
              {group.id === 'sites' && sites.length > 0 && !isInSiteContext && (
                <div className="ml-4 mt-2 space-y-1 border-l border-zinc-800 pl-3">
                  {sites.map(site => (
                    <NavLink
                      key={site.id}
                      to={`/${mainSiteSlug}/sites/${site.id}`}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                          isActive
                            ? 'bg-orange-500/10 text-orange-500'
                            : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                        }`
                      }
                    >
                      <Globe className="h-3 w-3" />
                      <span className="truncate">{site.name}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>
    );
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#09090b] text-white flex">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col transform transition-transform lg:transform-none ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Header with main site selector */}
          <div className="p-4 border-b border-zinc-800">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 hover:bg-zinc-800 rounded-lg p-2 transition-colors">
                  {mainSite.logo_url ? (
                    <img src={mainSite.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-orange-500" />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-semibold text-sm truncate">{mainSite.name}</div>
                    <div className="text-xs text-zinc-500">/{mainSiteSlug}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
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
                      <Network className="w-4 h-4 mr-2" />
                      Network Admin
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Navigation */}
          {renderGroupedNavigation()}

          {/* User section */}
          <div className="p-4 border-t border-zinc-800">
            {impersonating && (
              <button
                onClick={handleExitImpersonation}
                className="flex items-center gap-2 px-3 py-2 mb-2 w-full text-yellow-500 bg-yellow-500/10 rounded-lg text-sm hover:bg-yellow-500/20 transition-colors"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>Exit Impersonation</span>
              </button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 hover:bg-zinc-800 rounded-lg p-2 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {user?.avatar?.url ? (
                      <img src={user.avatar.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <RoleIcon className="w-4 h-4 text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium truncate">{user?.name}</div>
                    <div className="text-xs text-zinc-500">{roleLabels[userRole] || roleLabels[user?.role] || 'User'}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800">
                <DropdownMenuItem onClick={() => navigate(`/${mainSiteSlug}/settings`)}>
                  <UserCog className="w-4 h-4 mr-2" />
                  Personal Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem onClick={handleLogout} className="text-red-400">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile header */}
          <header className="lg:hidden flex items-center gap-4 p-4 border-b border-zinc-800 bg-zinc-900">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-semibold truncate">{mainSite.name}</h1>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            {isInSiteContext && currentSite ? (
              <Outlet context={{ siteTab, setSiteTab, currentSite, fetchCurrentSite }} />
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default MainSiteDashboardLayout;
