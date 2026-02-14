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
  
  // Get user's menu preference (grouped or flat)
  const useGroupedMenu = user?.preferences?.grouped_menu ?? true;

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
          onClick={() => {
            setSiteTab(item.tab);
            window.dispatchEvent(new CustomEvent('siteTabChange', { detail: item.tab }));
          }}
          data-testid={`site-nav-${item.tab}`}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-left ${
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
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
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

  // Render flat navigation (no groups)
  const renderFlatNavigation = () => {
    // Flatten all nav items from all groups
    const allItems = navGroups.flatMap(group => group.items || []);
    
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

        {/* Site context navigation */}
        {isInSiteContext && currentSite && (
          <div className="mb-4 space-y-1">
            {getSiteNavGroup(currentSite).items.map(item => renderGroupedNavItem(item, false))}
          </div>
        )}

        {/* All navigation items flat */}
        <div className="space-y-1">
          {allItems.map(item => renderGroupedNavItem(item, false))}
        </div>
        
        {/* Sites submenu */}
        {sites.length > 0 && !isInSiteContext && (
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-1">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Sites</div>
            {sites.map(site => (
              <NavLink
                key={site.id}
                to={`/${mainSiteSlug}/sites/${site.id}`}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-500'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`
                }
              >
                <Globe className="h-4 w-4" />
                <span className="truncate">{site.name}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>
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
            className="mb-3"
          >
            <CollapsibleTrigger className="flex items-center gap-2 px-3 py-2.5 w-full text-left text-zinc-500 hover:text-zinc-300 transition-colors">
              <group.icon className="h-4 w-4" />
              <span className="flex-1 text-xs font-semibold uppercase tracking-wider">{group.label}</span>
              {expandedGroups.includes(group.id) ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-2 space-y-1 mt-1">
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
                        `flex items-center gap-2 px-2 py-2 rounded text-xs transition-colors ${
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

  // Build flat nav items array for icon sidebar
  const flatNavItems = navGroups.flatMap(group => group.items || []);

  // Render icon-only sidebar navigation
  const renderIconNavigation = () => {
    return (
      <nav className="flex-1 flex flex-col items-center gap-2 py-4 overflow-y-auto">
        {/* Back button when in site context */}
        {isInSiteContext && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate(`/${mainSiteSlug}/sites`)}
                className="w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10 mb-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-white">
              Back to Sites
            </TooltipContent>
          </Tooltip>
        )}

        {/* Site-specific icons when in site context */}
        {isInSiteContext && currentSite && getSiteNavGroup(currentSite).items.map((item) => {
          const Icon = item.icon;
          const isActive = siteTab === item.tab;
          const badgeCount = item.tab === 'submissions' ? submissionCounts[currentSiteId] : 0;
          return (
            <Tooltip key={item.tab}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setSiteTab(item.tab);
                    window.dispatchEvent(new CustomEvent('siteTabChange', { detail: item.tab }));
                  }}
                  data-testid={`site-nav-${item.tab}`}
                  className={`
                    w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 relative
                    ${isActive 
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' 
                      : 'text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full bg-orange-500 text-white">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-white">
                {item.label} {badgeCount > 0 && `(${badgeCount})`}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Normal navigation icons when not in site context */}
        {!isInSiteContext && flatNavItems.map((item) => {
          const Icon = item.icon;
          // item.to already contains the full path like /radiogroep/shows
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          const pathSegment = item.to.split('/').pop(); // Get last segment for badge lookup
          const badgeCount = getBadgeCount(pathSegment);
          const isHighlight = ['chat', 'approvals'].includes(pathSegment);
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  onClick={closeSidebar}
                  className={`
                    w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 relative
                    ${isActive 
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' 
                      : 'text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {badgeCount > 0 && (
                    <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full ${isHighlight ? 'bg-orange-500 text-white' : 'bg-zinc-600 text-white'}`}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-white">
                {item.label} {badgeCount > 0 && `(${badgeCount})`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="min-h-screen bg-[#09090b]">
        {/* Impersonation Banner */}
        {impersonating && (
          <div className="fixed top-0 left-0 right-0 z-[60] bg-orange-500 text-white px-4 py-2">
            <div className="flex items-center justify-between max-w-screen-xl mx-auto">
              <div className="flex items-center gap-2 text-sm">
                <ArrowLeftRight className="w-4 h-4" />
                <span>
                  Viewing as <strong>{user?.name}</strong> ({user?.email})
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExitImpersonation}
                className="text-white hover:bg-orange-600 gap-2"
              >
                <LogOut className="w-4 h-4" />
                Return to {impersonating.name}
              </Button>
            </div>
          </div>
        )}

        {/* Mobile Header */}
        <header className={`lg:hidden fixed ${impersonating ? 'top-10' : 'top-0'} left-0 right-0 z-50 glass border-b border-white/10`}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-500 rounded-lg">
                <span className="text-white font-black text-sm">C</span>
              </div>
              <span className="text-lg font-bold text-white">Clara</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-zinc-400 hover:text-white"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40"
            onClick={closeSidebar}
          />
        )}

        {/* Desktop Sidebar */}
        <aside className={`hidden lg:flex fixed ${impersonating ? 'top-10' : 'top-0'} left-0 h-full z-50 ${useGroupedMenu ? 'w-56' : 'w-[72px]'} flex-col py-6 glass border-r border-white/10 transition-all duration-300`}>
          {/* Logo */}
          <div className={`mb-6 ${useGroupedMenu ? 'px-4' : 'text-center'}`}>
            <span className="text-white font-black text-base">Clara</span>
          </div>

          {/* Navigation */}
          {useGroupedMenu ? renderGroupedNavigation() : renderIconNavigation()}

          {/* User Avatar at Bottom */}
          <div className={`mt-auto pt-4 ${useGroupedMenu ? 'px-3' : 'flex justify-center'}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`${useGroupedMenu ? 'w-full justify-start gap-3 px-3 h-12' : 'w-11 h-11'} rounded-xl hover:bg-orange-500/10`}
                >
                  {user?.avatar?.url || user?.avatar?.file_key ? (
                    <img 
                      src={user?.avatar?.url || `${API}/uploads/avatars/${user.avatar.file_key}`}
                      alt={user?.name}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {useGroupedMenu && (
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{roleLabels[userRole] || roleLabels[user?.role]}</p>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={useGroupedMenu ? "end" : "start"} side={useGroupedMenu ? "top" : "right"} className="w-56 bg-[#18181b] border-zinc-800 ml-2">
                <div className="px-3 py-2 flex items-center gap-3">
                  {user?.avatar?.url || user?.avatar?.file_key ? (
                    <img 
                      src={user?.avatar?.url || `${API}/uploads/avatars/${user.avatar.file_key}`}
                      alt={user?.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{user?.name}</p>
                    <p className="text-xs text-zinc-500">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem className="text-zinc-400 cursor-default">
                  <RoleIcon className="w-4 h-4 mr-2" />
                  {roleLabels[userRole] || roleLabels[user?.role]}
                </DropdownMenuItem>
                {/* Main Sites Switcher - always show if there are sites */}
                {myMainSites.length > 0 && (
                  <>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <div className="px-2 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                      Mijn Sites
                    </div>
                    {myMainSites.map(site => (
                      <DropdownMenuItem
                        key={site.id}
                        onClick={() => navigate(`/${site.slug}`)}
                        className={`text-zinc-400 focus:text-white focus:bg-zinc-800 cursor-pointer ${site.slug === mainSiteSlug ? 'bg-zinc-800/50 text-orange-500' : ''}`}
                      >
                        <Globe className="w-4 h-4 mr-2" />
                        {site.name}
                        {site.slug === mainSiteSlug && (
                          <span className="ml-auto text-xs text-zinc-500">actief</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {user?.is_network_admin && (
                  <>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <DropdownMenuItem onClick={() => navigate('/network')} className="text-zinc-400 focus:text-white focus:bg-zinc-800 cursor-pointer">
                      <Network className="w-4 h-4 mr-2" />
                      Network Management
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem
                  onClick={() => navigate(`/${mainSiteSlug}/settings`)}
                  className="text-zinc-400 focus:text-white focus:bg-zinc-800"
                >
                  <UserCog className="w-4 h-4 mr-2" />
                  Personal Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-orange-500 focus:text-orange-500 focus:bg-orange-500/10"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Mobile Sidebar */}
        <aside
          className={`
            lg:hidden fixed ${impersonating ? 'top-10' : 'top-0'} left-0 h-full z-50 glass
            w-64 transform transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="p-6 pt-4 h-full flex flex-col">
            {/* Mobile: Close button area */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-500 rounded-lg">
                  <span className="text-white font-black text-sm">C</span>
                </div>
                <span className="text-lg font-bold text-white">Clara</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeSidebar}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Mobile Navigation */}
            <div className="flex-1 overflow-y-auto">
              <nav className="space-y-1">
                {flatNavItems.map((item) => {
                  const Icon = item.icon;
                  // item.to already contains the full path from buildNavGroups
                  const fullPath = item.to;
                  const isActive = location.pathname === fullPath || location.pathname.startsWith(fullPath + '/');
                  const badgeCount = getBadgeCount(item.featureId || item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={fullPath}
                      onClick={closeSidebar}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                        ${isActive
                          ? 'bg-orange-500/20 text-orange-500'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="ml-auto px-1.5 py-0.5 text-xs font-medium rounded-full min-w-[20px] text-center bg-orange-500 text-white">
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            {/* User section at bottom */}
            <div className="pt-4 border-t border-white/10 mt-4">
              <div className="flex items-center gap-3 p-3">
                {user?.avatar?.url || user?.avatar?.file_key ? (
                  <img 
                    src={user?.avatar?.url || `${API}/uploads/avatars/${user.avatar.file_key}`}
                    alt={user?.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full justify-start gap-2 text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 mt-2"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </Button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className={`${useGroupedMenu ? 'lg:ml-56' : 'lg:ml-[72px]'} min-h-screen ${impersonating ? 'pt-26 lg:pt-10' : 'pt-16 lg:pt-0'} transition-all duration-300`}>
          {/* Page Header */}
          <div className="hidden lg:block border-b border-white/5 bg-[#09090b]/80 backdrop-blur-sm sticky top-0 z-30">
            <div className="px-8 py-4">
              <div className="flex items-center justify-between">
                <div>
                  {isInSiteContext && currentSite ? (
                    <p className="text-sm font-medium text-white">{currentSite.name}</p>
                  ) : mainSite?.name && (
                    <p className="text-sm font-medium text-white">{mainSite.name}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs text-zinc-500 flex items-center gap-1 justify-end">
                    <RoleIcon className="w-3 h-3" />
                    {roleLabels[userRole] || roleLabels[user?.role]}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 sm:p-6 lg:p-8">
            {isInSiteContext && currentSite ? (
              <Outlet context={{ siteTab, setSiteTab, currentSite, fetchCurrentSite }} />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default MainSiteDashboardLayout;
