import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutList, LogOut, User, Calendar, Settings, Crown, Pencil, Eye, 
  FileText, Globe, MessageSquare, File, Mic, Menu, X, Sliders, Home, 
  ScrollText, ClipboardCheck, Trash2, Users, ChevronDown, ChevronRight,
  UserCog, ArrowLeftRight
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
  editor: Pencil,
  presenter: Mic,
  viewer: Eye,
};

const roleLabels = {
  admin: 'Admin',
  editor: 'Editor',
  presenter: 'Presenter',
  viewer: 'Viewer',
};

// Grouped navigation structure
const navGroups = [
  {
    id: 'shows',
    label: 'Shows',
    icon: LayoutList,
    items: [
      { to: '/shows', icon: LayoutList, label: 'Shows', adminOnly: false },
      { to: '/calendar', icon: Calendar, label: 'Calendar', adminOnly: false },
      { to: '/show-management', icon: Sliders, label: 'Show Management', adminOnly: true },
    ]
  },
  {
    id: 'content',
    label: 'Content',
    icon: FileText,
    items: [
      { to: '/content', icon: FileText, label: 'Content Library', adminOnly: false },
      { to: '/media', icon: File, label: 'Media Library', adminOnly: false },
      { to: '/approvals', icon: ClipboardCheck, label: 'Content Approval', adminOnly: false, approverOnly: true },
      { to: '/trash', icon: Trash2, label: 'Trash', adminOnly: true },
    ]
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: MessageSquare,
    items: [
      { to: '/chat', icon: MessageSquare, label: 'Team Chat', adminOnly: false },
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Settings,
    adminOnly: true,
    items: [
      { to: '/team', icon: Users, label: 'Team Settings', adminOnly: true },
      { to: '/wordpress', icon: Globe, label: 'WordPress', adminOnly: true },
      { to: '/logs', icon: ScrollText, label: 'Activity Logs', adminOnly: true },
    ]
  },
];

// Flat navigation (original structure)
const flatNavItems = [
  { to: '/shows', icon: LayoutList, label: 'Shows', adminOnly: false },
  { to: '/calendar', icon: Calendar, label: 'Calendar', adminOnly: false },
  { to: '/content', icon: FileText, label: 'Content Library', adminOnly: false },
  { to: '/media', icon: File, label: 'Media Library', adminOnly: false },
  { to: '/chat', icon: MessageSquare, label: 'Team Chat', adminOnly: false },
  { to: '/approvals', icon: ClipboardCheck, label: 'Content Approval', adminOnly: false, approverOnly: true },
  { to: '/trash', icon: Trash2, label: 'Trash', adminOnly: true },
  { to: '/show-management', icon: Sliders, label: 'Show Management', adminOnly: true },
  { to: '/team', icon: Users, label: 'Team Settings', adminOnly: true },
  { to: '/logs', icon: ScrollText, label: 'Activity Logs', adminOnly: true },
  { to: '/wordpress', icon: Globe, label: 'WordPress', adminOnly: true },
];

const DashboardLayout = () => {
  const { user, logout, isAdmin, impersonating, exitImpersonation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(['shows', 'content']);
  const [menuCounts, setMenuCounts] = useState({});

  // Check if user can approve content (admin or news_admin)
  const canApprove = user?.role === 'admin' || user?.role === 'news_admin';

  // Get menu preference (default to grouped)
  const useGroupedMenu = user?.preferences?.grouped_menu ?? true;

  // Fetch menu counts
  const fetchMenuCounts = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/menu/counts`);
      setMenuCounts(response.data);
    } catch (error) {
      console.error('Failed to fetch menu counts:', error);
    }
  }, []);

  // Fetch counts on mount and periodically
  useEffect(() => {
    if (user) {
      fetchMenuCounts();
      const interval = setInterval(fetchMenuCounts, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [user, fetchMenuCounts]);

  // Mark chat as read when visiting chat page
  useEffect(() => {
    if (location.pathname === '/chat' && menuCounts.chat > 0) {
      axios.post(`${API}/chat/mark-read`).then(() => {
        setMenuCounts(prev => ({ ...prev, chat: 0 }));
      });
    }
  }, [location.pathname, menuCounts.chat]);

  // Mark logs as viewed when visiting logs page
  useEffect(() => {
    if (location.pathname === '/logs' && menuCounts.logs > 0) {
      axios.post(`${API}/logs/mark-viewed`).then(() => {
        setMenuCounts(prev => ({ ...prev, logs: 0 }));
      });
    }
  }, [location.pathname, menuCounts.logs]);

  // Set browser tab title dynamically
  useEffect(() => {
    if (user?.team_name) {
      document.title = `Clara | ${user.team_name}`;
    } else {
      document.title = 'Clara';
    }
  }, [user?.team_name]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleExitImpersonation = async () => {
    try {
      await exitImpersonation();
      navigate('/team');
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

  const RoleIcon = roleIcons[user?.role] || User;

  // Get badge count for a route
  const getBadgeCount = (route) => {
    const countMap = {
      '/content': menuCounts.content,
      '/trash': menuCounts.trash,
      '/approvals': menuCounts.approvals,
      '/chat': menuCounts.chat,
      '/logs': menuCounts.logs,
    };
    return countMap[route] || 0;
  };

  // Badge component
  const Badge = ({ count, isActive, highlight = false }) => {
    if (!count || count === 0) return null;
    const displayCount = count > 99 ? '99+' : count;
    return (
      <span className={`
        ml-auto px-1.5 py-0.5 text-xs font-medium rounded-full min-w-[20px] text-center
        ${highlight 
          ? 'bg-orange-500 text-white' 
          : isActive 
            ? 'bg-orange-500/30 text-orange-300' 
            : 'bg-zinc-700 text-zinc-300'
        }
      `}>
        {displayCount}
      </span>
    );
  };

  // Filter items based on role
  const getFilteredItems = (items) => items.filter(item => !item.adminOnly || isAdmin);
  const filteredFlatItems = flatNavItems.filter(item => !item.adminOnly || isAdmin);
  const filteredGroups = navGroups
    .filter(group => !group.adminOnly || isAdmin)
    .map(group => ({
      ...group,
      items: getFilteredItems(group.items)
    }))
    .filter(group => group.items.length > 0);

  // Check if any item in a group is active
  const isGroupActive = (group) => group.items.some(item => location.pathname === item.to);

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
              data-testid="mobile-menu-btn"
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
          <nav className={`flex-1 overflow-y-auto ${useGroupedMenu ? 'px-3' : 'flex flex-col items-center gap-2'}`}>
            {useGroupedMenu ? (
              // Grouped Navigation
              <div className="space-y-4">
                {filteredGroups.map((group) => {
                  const GroupIcon = group.icon;
                  const isExpanded = expandedGroups.includes(group.id);
                  const groupActive = isGroupActive(group);

                  return (
                    <Collapsible
                      key={group.id}
                      open={isExpanded}
                      onOpenChange={() => toggleGroup(group.id)}
                    >
                      <CollapsibleTrigger className="w-full">
                        <div className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${groupActive ? 'text-orange-400' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                          <div className="flex items-center gap-2">
                            <GroupIcon className="w-4 h-4" />
                            <span className="text-sm font-medium">{group.label}</span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-2 mt-1 space-y-1 border-l border-zinc-800 pl-3">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.to;
                            const badgeCount = getBadgeCount(item.to);
                            const isHighlight = ['/chat', '/approvals'].includes(item.to);
                            return (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                data-testid={`nav-${item.to.slice(1)}-link`}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                                  isActive
                                    ? 'bg-orange-500/20 text-orange-400'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                                <Badge count={badgeCount} isActive={isActive} highlight={isHighlight && badgeCount > 0} />
                              </NavLink>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            ) : (
              // Flat Icon Navigation (original)
              filteredFlatItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.to;
                const badgeCount = getBadgeCount(item.to);
                const isHighlight = ['/chat', '/approvals'].includes(item.to);
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.to}
                        data-testid={`nav-${item.to.slice(1)}-link`}
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
              })
            )}
          </nav>

          {/* User Avatar at Bottom */}
          <div className={`mt-auto pt-4 ${useGroupedMenu ? 'px-3' : 'flex justify-center'}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="user-menu-btn"
                  className={`${useGroupedMenu ? 'w-full justify-start gap-3 px-3 h-12' : 'w-11 h-11'} rounded-xl hover:bg-orange-500/10`}
                >
                  {user?.avatar?.file_key ? (
                    <img 
                      src={`${API}/uploads/avatars/${user.avatar.file_key}`}
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
                      <p className="text-xs text-zinc-500 truncate">{roleLabels[user?.role]}</p>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={useGroupedMenu ? "end" : "start"} side={useGroupedMenu ? "top" : "right"} className="w-56 bg-[#18181b] border-zinc-800 ml-2">
                <div className="px-3 py-2 flex items-center gap-3">
                  {user?.avatar?.file_key ? (
                    <img 
                      src={`${API}/uploads/avatars/${user.avatar.file_key}`}
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
                <DropdownMenuItem className="text-zinc-400">
                  <RoleIcon className="w-4 h-4 mr-2" />
                  {roleLabels[user?.role]}
                </DropdownMenuItem>
                {user?.team_name && (
                  <DropdownMenuItem className="text-zinc-400">
                    <Home className="w-4 h-4 mr-2" />
                    {user.team_name}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem
                  onClick={() => navigate('/settings')}
                  className="text-zinc-400 focus:text-white focus:bg-zinc-800"
                >
                  <UserCog className="w-4 h-4 mr-2" />
                  Personal Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem
                  data-testid="logout-btn"
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
            
            {/* Team Name */}
            {user?.team_name && (
              <div className="mb-6 px-1">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Team</p>
                <p className="text-sm text-zinc-300 font-medium truncate">{user.team_name}</p>
              </div>
            )}

            {/* Mobile Navigation */}
            <div className="flex-1 overflow-y-auto">
              {useGroupedMenu ? (
                // Grouped Mobile Navigation
                <div className="space-y-4">
                  {filteredGroups.map((group) => {
                    const GroupIcon = group.icon;
                    return (
                      <div key={group.id}>
                        <div className="flex items-center gap-2 px-2 py-1 text-zinc-500 text-xs uppercase tracking-wider">
                          <GroupIcon className="w-3 h-3" />
                          {group.label}
                        </div>
                        <nav className="space-y-1 mt-1">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            const badgeCount = getBadgeCount(item.to);
                            const isHighlight = ['/chat', '/approvals'].includes(item.to);
                            return (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                data-testid={`mobile-nav-${item.to.slice(1)}-link`}
                                onClick={closeSidebar}
                                className={({ isActive }) =>
                                  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                                    isActive
                                      ? 'bg-orange-500/20 text-orange-500'
                                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                  }`
                                }
                              >
                                {({ isActive }) => (
                                  <>
                                    <Icon className="w-5 h-5" />
                                    <span className="font-medium">{item.label}</span>
                                    <Badge count={badgeCount} isActive={isActive} highlight={isHighlight && badgeCount > 0} />
                                  </>
                                )}
                              </NavLink>
                            );
                          })}
                        </nav>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Flat Mobile Navigation
                <nav className="space-y-1">
                  {filteredFlatItems.map((item) => {
                    const Icon = item.icon;
                    const badgeCount = getBadgeCount(item.to);
                    const isHighlight = ['/chat', '/approvals'].includes(item.to);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        data-testid={`mobile-nav-${item.to.slice(1)}-link`}
                        onClick={closeSidebar}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                            isActive
                              ? 'bg-orange-500/20 text-orange-500'
                              : 'text-zinc-400 hover:text-white hover:bg-white/5'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                            <Badge count={badgeCount} isActive={isActive} highlight={isHighlight && badgeCount > 0} />
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </nav>
              )}
            </div>

            {/* User section at bottom */}
            <div className="pt-4 border-t border-white/10 mt-4">
              <div className="flex items-center gap-3 p-3">
                {user?.avatar?.file_key ? (
                  <img 
                    src={`${API}/uploads/avatars/${user.avatar.file_key}`}
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
                  {user?.team_name && (
                    <p className="text-sm font-medium text-white">{user.team_name}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs text-zinc-500 flex items-center gap-1 justify-end">
                    <RoleIcon className="w-3 h-3" />
                    {roleLabels[user?.role]}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default DashboardLayout;
