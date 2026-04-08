import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { useTopLoader } from './TopLoader';
import { PermissionsProvider, usePermissions } from '../context/PermissionsContext';
import { DevToolsProvider } from '../context/DevToolsContext';
import DevToolsPanel from './DevTools/DevToolsPanel';
import usePageTitle from '../hooks/usePageTitle';
import DevToolsInspector from './DevTools/DevToolsInspector';
import HelpButton from './Tickets/HelpButton';
import ClaraCLI from './ClaraCLI';
import ClaraAssistant from './ClaraAssistant';
import VoiceCallWidget from './VoiceCallWidget';
import LicenseBlockedOverlay from './LicenseBlockedOverlay';
import UserTicketsPanel from './UserTicketsPanel';
import TicketUpdatePopup from './TicketUpdatePopup';
import { useClaraAssistant } from '../context/ClaraAssistantContext';
// ClaraAssistantProvider is now at the App root level
import { 
  LayoutList, LogOut, User, Calendar, Settings, Crown, Pencil, Eye, 
  FileText, Globe, MessageSquare, File, Mic, Menu, X, Sliders, Home, 
  ScrollText, ClipboardCheck, Trash2, Users, ChevronDown, ChevronRight,
  UserCog, ArrowLeftRight, FileCheck, Radio, Headphones, Wand2, Play,
  ArrowLeft, Send, Palette, Network, Activity, LifeBuoy, Shield, Phone, Monitor,
  KeyRound, FileCode, Video, Ban, Lock, Check, Search, Image, Loader2, Sparkles, Terminal
} from 'lucide-react';
import { Button } from './ui/button';
import RadioplayerIcon from './icons/RadioplayerIcon';
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
import { getAvatarUrl } from '../utils/avatar';
import { BrandLogo } from './BrandLogo';
import { useBranding } from '../context/BrandingContext';
import { WorkspaceCanvas } from './workspace/WorkspaceCanvas';
import { CanvasPanel } from './workspace/CanvasPanel';
import { LayoutDashboard } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* Site-type background images (same as CreateMainSiteWizard) */
const SITE_TYPE_BACKGROUNDS = {
  radio: '/images/env_radio.jpg',
  server: '/images/env_server.jpg',
  external_host: '/images/env_external_host.jpg',
  task_scheduler: '/images/env_task_scheduler.jpg',
  technical: '/images/env_technical.jpg',
  wp_security: '/images/env_wp_security.jpg',
};

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
  rds_monitor: { to: 'rds-monitor', icon: Activity, label: 'RDS Monitor', adminOnly: true },
  stream_monitor: { to: 'streams', icon: Headphones, label: 'Stream Monitor', adminOnly: true },
  sites: { to: 'sites', icon: Globe, label: 'Sites', adminOnly: true, hasSitesList: true },
  team_settings: { to: 'team', icon: Users, label: 'Team Settings', adminOnly: true },
  wordpress: { to: 'wordpress', icon: Globe, label: 'WordPress', adminOnly: true },
  activity_logs: { to: 'logs', icon: ScrollText, label: 'Activity Logs', adminOnly: true },
  firewall: { to: 'firewall', icon: Shield, label: 'Firewall', adminOnly: true },
  call_studio: { to: 'call-studio', icon: Phone, label: 'Call Studio' },
  support_tickets: { to: 'tickets', icon: LifeBuoy, label: 'Support Tickets' },
  zerotier: { to: 'zerotier', icon: Monitor, label: 'ZeroTier', adminOnly: true },
  radioplayer: { to: 'radioplayer', icon: RadioplayerIcon, label: 'Radioplayer', adminOnly: true },
  xml_imports: { to: 'xml-imports', icon: FileCode, label: 'XML Imports' },
  server_api_keys: { to: 'api-keys', icon: KeyRound, label: 'API Keys', adminOnly: true },
  vmix_director: { to: 'vmix-director', icon: Video, label: 'vMix Director' },
  canva_director: { to: 'canva', icon: Palette, label: 'Canva Director' },
  task_boards: { to: 'task-boards', icon: LayoutList, label: 'Task Boards' },
  wp_security_dashboard: { to: 'wp-security', icon: Shield, label: 'Security Dashboard', adminOnly: true },
  wp_waf_rules: { to: 'wp-waf', icon: Shield, label: 'WAF Rules', adminOnly: true },
  wp_ip_blocklist: { to: 'wp-blocklist', icon: Ban, label: 'IP Blocklist', adminOnly: true },
  wp_login_protection: { to: 'wp-login-protect', icon: Lock, label: 'Login Protection', adminOnly: true },
  enterprise_assistant: { to: 'enterprise-assistant', icon: Sparkles, label: 'Enterprise Assistant' },
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
    features: ['rds_settings', 'rds_builder', 'rds_monitor', 'stream_monitor', 'call_studio']
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
    features: ['team_settings', 'wordpress', 'activity_logs', 'firewall', 'zerotier']
  },
  {
    id: 'server',
    label: 'Virtual Datacenter',
    icon: Monitor,
    features: ['xml_imports', 'server_api_keys', 'vmix_director', 'canva_director', 'radioplayer']
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: LayoutList,
    features: ['task_boards']
  },
  {
    id: 'support',
    label: 'Support',
    icon: LifeBuoy,
    features: ['support_tickets']
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

const MainSiteDashboardContent = () => {
  const { user, logout, impersonating, exitImpersonation } = useAuth();
  const { branding: brandingData } = useBranding();
  const brandName = brandingData.platform_name || 'Clara';
  const { mainSite, mainSiteSlug, userRole, loading, error, hasFeature, isAdmin } = useMainSite();
  const { canView, canCreate, canEdit, canDelete, roleInfo } = usePermissions();
  const { startLoading, stopLoading } = useTopLoader();
  const navigate = useNavigate();
  const location = useLocation();
  const { siteId } = useParams();

  // Route guard: redirect to dashboard if current path is invalid for this site type
  useEffect(() => {
    if (loading || !mainSite || !mainSiteSlug) return;
    const currentPath = location.pathname;
    const basePath = `/${mainSiteSlug}`;
    // Only check subpaths, not the root
    if (currentPath === basePath || currentPath === `${basePath}/` || currentPath === `${basePath}/dashboard`) return;
    
    const subPath = currentPath.replace(basePath, '').replace(/^\//, '').split('/')[0];
    if (!subPath || subPath === 'settings') return; // settings is always valid
    
    const enabledFeatures = mainSite.enabled_features || [];
    const validRoutes = new Set(['dashboard', 'settings']);
    enabledFeatures.forEach(f => {
      const nav = FEATURE_NAV_ITEMS[f];
      if (nav) validRoutes.add(nav.to);
    });
    if (mainSite.clara_enterprise) {
      validRoutes.add('enterprise-assistant');
    }
    
    if (!validRoutes.has(subPath)) {
      navigate(`/${mainSiteSlug}`, { replace: true });
    }
  }, [mainSite, mainSiteSlug, location.pathname, loading, navigate]);

  // Show top loader during main site loading
  useEffect(() => {
    if (loading) startLoading();
    else stopLoading();
  }, [loading]);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(['shows', 'content', 'site']);
  const [menuCounts, setMenuCounts] = useState({});
  const [sites, setSites] = useState([]);
  const [currentSite, setCurrentSite] = useState(null);
  const [siteTab, setSiteTab] = useState('general');
  const [submissionCounts, setSubmissionCounts] = useState({});
  const [myMainSites, setMyMainSites] = useState([]);
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const cliTriggerRef = useRef(null);
  const pillNavRef = useRef(null);
  const [visibleNavCount, setVisibleNavCount] = useState(4);
  const searchInputRef = useCallback(node => { if (node) node.focus(); }, []);
  const [userTicketCount, setUserTicketCount] = useState(0);
  const [ticketUpdates, setTicketUpdates] = useState([]);
  const [showTicketPopup, setShowTicketPopup] = useState(false);
  const [showUserTickets, setShowUserTickets] = useState(false);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const { voiceCallRequested, clearVoiceCallRequest } = useClaraAssistant();

  // Handle voice call request from ClaraAssistant
  useEffect(() => {
    if (voiceCallRequested && mainSite?.clara_enterprise) {
      setShowVoiceCall(true);
      clearVoiceCallRequest();
    } else if (voiceCallRequested) {
      clearVoiceCallRequest();
    }
  }, [voiceCallRequested, mainSite?.clara_enterprise, clearVoiceCallRequest]);
  
  // Get user's menu preference (grouped or flat)
  const useGroupedMenu = user?.preferences?.grouped_menu ?? true;

  // Check if we're in a site context
  const siteMatch = location.pathname.match(/\/sites\/([^/]+)/);
  const isInSiteContext = !!siteMatch;
  const currentSiteId = siteMatch ? siteMatch[1] : siteId;

  // Check if user can approve content (admin or news_admin for this site, or network_admin)
  const canApprove = isAdmin() || userRole === 'news_admin';
  
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

  // Search within current main site
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await axios.get(`${API}/search`, { params: { q: searchQuery } });
        setSearchResults(response.data.results || []);
      } catch { setSearchResults([]); }
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search on route change
  useEffect(() => { setSearchOpen(false); setSearchQuery(''); setSearchExpanded(false); }, [location.pathname]);

  // Fetch user ticket counts and updates
  useEffect(() => {
    const fetchTicketData = async () => {
      try {
        const [countsRes, updatesRes] = await Promise.all([
          axios.get(`${API}/api/support-tickets/counts`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API}/api/support-tickets/user-updates`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setUserTicketCount(countsRes.data.open || 0);
        if (updatesRes.data.has_updates && updatesRes.data.tickets?.length > 0) {
          setTicketUpdates(updatesRes.data.tickets);
          setShowTicketPopup(true);
        }
      } catch {}
    };
    fetchTicketData();
    const interval = setInterval(fetchTicketData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Dynamically calculate how many nav items fit in the pill bar
  useEffect(() => {
    const container = pillNavRef.current;
    if (!container) return;
    const ITEM_AVG_WIDTH = 160; // generous average px per pill
    const DASHBOARD_WIDTH = 140; // Dashboard pill + gap
    const MORE_WIDTH = 90; // More button
    const RIGHT_SECTION = 200; // icons on the right side (search, avatar, etc.)
    const calculate = () => {
      const totalWidth = container.offsetWidth;
      const availableWidth = totalWidth - DASHBOARD_WIDTH - RIGHT_SECTION;
      const maxFit = Math.max(1, Math.floor((availableWidth - MORE_WIDTH) / ITEM_AVG_WIDTH));
      setVisibleNavCount(maxFit);
    };
    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    return () => observer.disconnect();
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
      // Check license status
      const checkLicense = async () => {
        try {
          setLicenseLoading(true);
          const res = await axios.get(`${API}/licenses/check/${mainSite.id}`);
          setLicenseInfo(res.data);
        } catch {
          setLicenseInfo(null);
        }
        setLicenseLoading(false);
      };
      checkLicense();
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
  usePageTitle(
    isInSiteContext && currentSite ? currentSite.name
      : mainSite?.name || null,
    'Clara'
  );

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
  const displayRoleName = roleInfo?.name || roleLabels[userRole] || roleLabels[user?.role] || (userRole?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

  // Get badge count for a route
  const getBadgeCount = (route) => {
    if (route === 'content' || route === 'content_library') return menuCounts.content || 0;
    if (route === 'media' || route === 'media_library') return menuCounts.media || 0;
    if (route === 'trash') return menuCounts.trash || 0;
    if (route === 'chat' || route === 'team_chat') return menuCounts.chat || 0;
    if (route === 'approvals' || route === 'content_approval') return menuCounts.approvals || menuCounts.pending_approvals || 0;
    if (route === 'logs' || route === 'activity_logs') return menuCounts.logs || 0;
    return 0;
  };

  // Brand: always "Clara", labels only in page header bar
  const siteTypeLabel = mainSite?.site_type === 'server' ? 'Virtual Datacenter' : mainSite?.site_type === 'technical' ? 'Data Connection' : mainSite?.site_type === 'task_scheduler' ? 'Tasks' : mainSite?.site_type === 'external_host' ? 'External Host' : mainSite?.site_type === 'wp_security' ? 'WP Security' : 'Radio';
  const siteTypeLabelColor = mainSite?.site_type === 'server' ? 'bg-red-500/15 text-red-400 border-red-500/25' : mainSite?.site_type === 'technical' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : mainSite?.site_type === 'task_scheduler' ? 'bg-violet-500/15 text-violet-400 border-violet-500/25' : mainSite?.site_type === 'wp_security' ? 'bg-red-500/15 text-red-400 border-red-500/25' : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25';
  // Display name: for server sites, show linked main site name
  const displayName = mainSite?.site_type === 'server' && mainSite?.linked_main_site_name
    ? mainSite.linked_main_site_name
    : mainSite?.name;

  // Build navigation groups based on enabled features
  const buildNavGroups = () => {
    if (!mainSite) return [];
    
    // Technical sites only show team_settings and zerotier
    if (mainSite.site_type === 'technical') {
      const technicalFeatures = ['team_settings', 'zerotier'];
      const items = technicalFeatures
        .map(featureId => {
          const navItem = FEATURE_NAV_ITEMS[featureId];
          if (!navItem) return null;
          if (navItem.adminOnly && !userIsAdmin) return null;
          return { ...navItem, to: `/${mainSiteSlug}/${navItem.to}`, featureId };
        })
        .filter(Boolean);
      
      return [{
        id: 'technical',
        label: 'Data Connection',
        icon: Monitor,
        items
      }];
    }

    // External Host sites: content + wordpress + admin
    if (mainSite.site_type === 'external_host') {
      const enabledFeatures = mainSite.enabled_features || [];
      const contentItems = ['content_library', 'media_library', 'content_approval', 'trash']
        .filter(f => enabledFeatures.includes(f))
        .map(featureId => {
          const navItem = FEATURE_NAV_ITEMS[featureId];
          if (!navItem) return null;
          if (!userIsAdmin && !canView(featureId)) return null;
          return { ...navItem, to: `/${mainSiteSlug}/${navItem.to}`, featureId };
        }).filter(Boolean);
      const adminItems = ['team_settings', 'firewall', 'wordpress', 'activity_logs']
        .filter(f => enabledFeatures.includes(f))
        .map(featureId => {
          const navItem = FEATURE_NAV_ITEMS[featureId];
          if (!navItem) return null;
          if (navItem.adminOnly && !userIsAdmin) return null;
          return { ...navItem, to: `/${mainSiteSlug}/${navItem.to}`, featureId };
        }).filter(Boolean);
      const groups = [];
      if (contentItems.length > 0) groups.push({ id: 'content', label: 'Content', icon: FileText, items: contentItems });
      if (adminItems.length > 0) groups.push({ id: 'admin', label: 'Administration', icon: Settings, items: adminItems });
      const supportItem = FEATURE_NAV_ITEMS['support_tickets'];
      if (supportItem) groups.push({ id: 'support', label: 'Support', icon: LifeBuoy, items: [{ ...supportItem, to: `/${mainSiteSlug}/${supportItem.to}`, featureId: 'support_tickets' }] });
      return groups;
    }

    // Clara Tasks sites show task_boards + optional admin features
    if (mainSite.site_type === 'task_scheduler') {
      const enabledFeatures = mainSite.enabled_features || [];
      const coreItems = ['task_boards']
        .map(featureId => {
          const navItem = FEATURE_NAV_ITEMS[featureId];
          if (!navItem) return null;
          return { ...navItem, to: `/${mainSiteSlug}/${navItem.to}`, featureId };
        })
        .filter(Boolean);
      const adminItems = ['team_settings', 'firewall', 'activity_logs']
        .filter(f => enabledFeatures.includes(f))
        .map(featureId => {
          const navItem = FEATURE_NAV_ITEMS[featureId];
          if (!navItem) return null;
          if (navItem.adminOnly && !userIsAdmin) return null;
          return { ...navItem, to: `/${mainSiteSlug}/${navItem.to}`, featureId };
        })
        .filter(Boolean);
      const groups = [{
        id: 'tasks',
        label: 'Tasks',
        icon: LayoutList,
        items: coreItems
      }];
      if (adminItems.length > 0) {
        groups.push({
          id: 'admin',
          label: 'Administration',
          icon: Settings,
          items: adminItems
        });
      }
      // Always add support tickets
      const supportItem = FEATURE_NAV_ITEMS['support_tickets'];
      if (supportItem) {
        groups.push({
          id: 'support',
          label: 'Support',
          icon: LifeBuoy,
          items: [{ ...supportItem, to: `/${mainSiteSlug}/${supportItem.to}`, featureId: 'support_tickets' }]
        });
      }
      return groups;
    }

    // WP Security sites show security dashboard
    if (mainSite.site_type === 'wp_security') {
      const securityItem = FEATURE_NAV_ITEMS['wp_security_dashboard'];
      const items = [];
      if (securityItem) {
        items.push({ ...securityItem, to: `/${mainSiteSlug}/${securityItem.to}`, featureId: 'wp_security_dashboard' });
      }
      return [{
        id: 'security',
        label: 'Security',
        icon: Shield,
        items
      }];
    }

    
    const enabledFeatures = mainSite.enabled_features || [];
    
    // Features that are always available for admins (not dependent on enabled_features)
    const alwaysAvailableForAdmin = ['firewall'];
    
    // Features always available for everyone (not dependent on enabled_features)
    const alwaysAvailable = ['support_tickets'];
    
    const groups = NAV_GROUPS.map(group => {
      // Server group is only for server site types
      if (group.id === 'server' && mainSite.site_type !== 'server') return null;
      
      const items = group.features
        .filter(featureId => {
          // Always show support tickets for everyone
          if (alwaysAvailable.includes(featureId)) return true;
          // Always show certain features for admins
          if (alwaysAvailableForAdmin.includes(featureId) && userIsAdmin) return true;
          // Otherwise check enabled features
          return enabledFeatures.includes(featureId);
        })
        .map(featureId => {
          const navItem = FEATURE_NAV_ITEMS[featureId];
          if (!navItem) return null;
          
          // Check role-based permissions: user needs "view" permission for this feature
          if (!userIsAdmin && !canView(featureId)) return null;
          
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

    // Add Enterprise Assistant if clara_enterprise is enabled
    if (mainSite.clara_enterprise) {
      const eaItem = FEATURE_NAV_ITEMS['enterprise_assistant'];
      if (eaItem) {
        groups.push({
          id: 'enterprise',
          label: 'Enterprise',
          icon: Sparkles,
          items: [{ ...eaItem, to: `/${mainSiteSlug}/${eaItem.to}`, featureId: 'enterprise_assistant' }],
        });
      }
    }

    return groups;
  };

  const navGroups = buildNavGroups();

  // Loading state
  if (loading) {
    return null;
  }

  // Error state
  if (error || !mainSite) {
    return (
      <div className="min-h-screen bg-[#F0F0F2] flex items-center justify-center text-zinc-900">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">{error || 'Site not found'}</h1>
          <p className="text-zinc-500 mb-2">The requested main site could not be loaded.</p>
          {mainSiteSlug && <p className="text-zinc-400 text-sm mb-4 font-mono">Slug: {mainSiteSlug}</p>}
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate('/')}>Go Back</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </div>
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
              : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700'
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
              : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700'
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
            className="flex items-center gap-2 px-3 py-2 mb-4 text-zinc-400 hover:text-zinc-700 transition-colors w-full"
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
          <div className="mt-4 pt-4 border-t border-zinc-200 space-y-1">
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
                      : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700'
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
            className="flex items-center gap-2 px-3 py-2 mb-4 text-zinc-400 hover:text-zinc-700 transition-colors w-full"
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
            <CollapsibleTrigger className="flex items-center gap-2 px-3 py-2.5 w-full text-left text-zinc-500 hover:text-zinc-600 transition-colors">
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
                <div className="ml-4 mt-2 space-y-1 border-l border-zinc-200 pl-3">
                  {sites.map(site => (
                    <NavLink
                      key={site.id}
                      to={`/${mainSiteSlug}/sites/${site.id}`}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2 py-2 rounded text-xs transition-colors ${
                          isActive
                            ? 'bg-orange-500/10 text-orange-500'
                            : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-600'
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

  // Check if site access is blocked (no license and not demo) - System admins always bypass
  const isSystemAdmin = user?.is_system_admin === true;
  const isLicenseBlocked = !isSystemAdmin && !licenseLoading && licenseInfo && !licenseInfo.has_license && !licenseInfo.is_demo;

  // Render icon-only sidebar navigation
  const renderIconNavigation = () => {
    return (
      <nav className="flex-1 flex flex-col items-center gap-1.5 py-2 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {/* Back button when in site context */}
        {isInSiteContext && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate(`/${mainSiteSlug}/sites`)}
                className="w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-200 text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.06] mb-1"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-white/95 border-zinc-200 text-zinc-900 text-xs backdrop-blur-lg">
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
                    w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-200 relative
                    ${isActive 
                      ? 'bg-orange-500/15 text-orange-500 shadow-[0_2px_12px_rgba(249,115,22,0.15)]' 
                      : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.06]'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-[3px] h-5 rounded-r-full bg-orange-500" />}
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full bg-orange-500 text-white ring-2 ring-white">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-white border-black/10 text-zinc-800 text-xs shadow-lg backdrop-blur-lg">
                {item.label} {badgeCount > 0 && `(${badgeCount})`}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Normal navigation icons when not in site context */}
        {!isInSiteContext && flatNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = !isLicenseBlocked && (location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
          const pathSegment = item.to.split('/').pop();
          const badgeCount = getBadgeCount(pathSegment);
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                {isLicenseBlocked ? (
                  <div
                    className="w-11 h-11 flex items-center justify-center rounded-2xl opacity-20 cursor-not-allowed"
                    data-testid={`nav-disabled-${pathSegment}`}
                  >
                    <Icon className="w-5 h-5 text-zinc-600" />
                  </div>
                ) : (
                <NavLink
                  to={item.to}
                  onClick={closeSidebar}
                  data-testid={`nav-${pathSegment}`}
                  className={`
                    w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-200 relative
                    ${isActive 
                      ? 'bg-orange-500/15 text-orange-500 shadow-[0_2px_12px_rgba(249,115,22,0.15)]' 
                      : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.06]'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-[3px] h-5 rounded-r-full bg-orange-500" />}
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full bg-orange-500 text-white ring-2 ring-white">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
                )}
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-white border-black/10 text-zinc-800 text-xs shadow-lg backdrop-blur-lg">
                {isLicenseBlocked ? `${item.label} (No license)` : item.label} {!isLicenseBlocked && badgeCount > 0 && `(${badgeCount})`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    );
  };

  const isClone = !!mainSite?.cloned_from;

  // Check if we're on the dashboard home (for floating panel layout)
  const isDashboardHome = !isInSiteContext && (
    location.pathname === `/${mainSiteSlug}` ||
    location.pathname === `/${mainSiteSlug}/` ||
    location.pathname === `/${mainSiteSlug}/dashboard`
  );
  const isEnterpriseAssistant = location.pathname === `/${mainSiteSlug}/enterprise-assistant`;

  // Build topbar title
  const topBarTitle = isInSiteContext && currentSite
    ? currentSite.name
    : displayName || mainSite?.name || '';

  const topBarTitleBadge = !isInSiteContext ? (
    <div className="flex items-center gap-1.5">
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${siteTypeLabelColor}`}>{siteTypeLabel}</span>
      {mainSite?.environment_name && mainSite.environment_name !== 'Production' && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
          style={{
            color: mainSite.environment_color || '#3b82f6',
            borderColor: `${mainSite.environment_color || '#3b82f6'}33`,
            backgroundColor: `${mainSite.environment_color || '#3b82f6'}15`,
          }}
          data-testid="environment-badge"
        >
          {mainSite.environment_name}
        </span>
      )}
      {!licenseLoading && licenseInfo?.is_demo && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-amber-500/15 text-amber-400 border-amber-500/25" data-testid="demo-badge">Demo</span>
      )}
    </div>
  ) : null;

  /* ── Loading guard: show minimal UI while site context loads ── */
  if (loading && !mainSite) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F0F0F2]" style={{ height: '100dvh' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <DevToolsProvider enabled={isClone}>
    <TooltipProvider delayDuration={0}>
      {/* Outer shell: banners + workspace */}
      <div className="h-screen flex flex-col overflow-hidden bg-[#F0F0F2]" style={{ height: '100dvh' }}>
        {/* Banners */}
        {isClone && (
          <div className="flex-shrink-0 bg-cyan-600 text-white px-4 py-1.5 z-[60]" data-testid="clone-banner">
            <div className="flex items-center justify-between max-w-screen-xl mx-auto">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Activity className="w-3.5 h-3.5" />
                <span>CLONE MODE — DevTools active</span>
              </div>
              <span className="text-[10px] opacity-70">{mainSite?.name}</span>
            </div>
          </div>
        )}
        {impersonating && (
          <div className="flex-shrink-0 bg-orange-500 text-white px-4 py-2 z-[60]">
            <div className="flex items-center justify-between max-w-screen-xl mx-auto">
              <div className="flex items-center gap-2 text-sm">
                <ArrowLeftRight className="w-4 h-4" />
                <span>Viewing as <strong>{user?.name}</strong> ({user?.email})</span>
              </div>
              <Button size="sm" variant="ghost" onClick={handleExitImpersonation} className="text-white hover:bg-orange-600 gap-2">
                <LogOut className="w-4 h-4" />
                Return to {impersonating.name}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Horizontal Top Navigation ─── */}
        <nav className="h-[64px] flex-shrink-0 flex items-center px-5 gap-4 bg-transparent z-50" data-testid="workspace-topbar">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} data-testid="mobile-menu-btn" className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/5 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <button onClick={() => navigate(`/${mainSiteSlug}`)} className="bg-zinc-900 text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold hover:bg-zinc-800 transition-colors flex-shrink-0" data-testid="logo-pill">
            <Radio className="w-4 h-4" />
            <span className="hidden sm:inline">Clara</span>
          </button>

          {/* Status Icons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Clara Global Protect */}
            <div className="relative group" data-testid="global-protect-icon">
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center cursor-default">
                <Shield className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 bg-zinc-900 text-white text-[10px] font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                Clara Global Protect is active
              </div>
            </div>
            {/* Clara Enterprise */}
            {mainSite?.clara_enterprise && (
              <div className="relative group" data-testid="enterprise-icon">
                <div className="w-7 h-7 rounded-full bg-violet-500/15 flex items-center justify-center cursor-default">
                  <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 bg-zinc-900 text-white text-[10px] font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                  Clara Enterprise
                </div>
              </div>
            )}
          </div>

          {/* Support Ticket Icon */}
          <button
            onClick={() => setShowUserTickets(true)}
            className="relative w-9 h-9 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
            data-testid="user-ticket-icon"
          >
            <span className="absolute inset-0 rounded-full bg-orange-400 animate-[glow-ring_3s_ease-out_infinite]" style={{ filter: 'blur(8px)' }} />
            <span className="absolute inset-1 rounded-full bg-orange-500" />
            <LifeBuoy className="w-4 h-4 text-white relative z-10" />
            {userTicketCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-white text-orange-600 rounded-full px-0.5 z-20 shadow-sm">{userTicketCount}</span>
            )}
          </button>
          {/* CLI Button */}
          {(user?.role === 'admin' || user?.is_network_admin || user?.is_system_admin) && (
            <button
              onClick={() => cliTriggerRef.current?.()}
              className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center transition-colors flex-shrink-0"
              data-testid="cli-toggle-btn"
              title="Clara CLI"
            >
              <Terminal className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          )}
          {/* Main Site Switcher Dropdown */}
          {myMainSites.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 flex items-center gap-2 px-3 rounded-full border border-white/40 bg-white/20 backdrop-blur-xl hover:bg-white/35 text-sm font-medium text-zinc-700 transition-all duration-200 flex-shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.04)]" data-testid="main-site-switcher">
                  {mainSite?.logo_url ? (
                    <img src={`${process.env.REACT_APP_BACKEND_URL}${mainSite.logo_url}`} alt="" className="w-5 h-5 rounded object-contain" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  <span className="max-w-[140px] truncate hidden sm:inline">{displayName || mainSite?.name}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 bg-white/30 backdrop-blur-2xl border-white/40 shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.6)] rounded-2xl">
                {(() => {
                  const envGroups = {};
                  myMainSites.forEach(site => {
                    const envId = site.environment_id || 'default';
                    if (!envGroups[envId]) envGroups[envId] = { name: site.environment_name || 'Production', color: site.environment_color, sites: [] };
                    envGroups[envId].sites.push(site);
                  });
                  const currentEnvId = mainSite?.environment_id;
                  const sortedEnvIds = Object.keys(envGroups).sort((a, b) => {
                    if (a === currentEnvId) return -1;
                    if (b === currentEnvId) return 1;
                    return (envGroups[a].name || '').localeCompare(envGroups[b].name || '');
                  });
                  return sortedEnvIds.map(envId => (
                    <div key={envId}>
                      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: envGroups[envId].color || '#71717a' }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: envGroups[envId].color || '#f97316' }} />
                        {envGroups[envId].name}
                      </div>
                      {envGroups[envId].sites.map(site => (
                        <DropdownMenuItem
                          key={site.id}
                          onClick={() => navigate(`/${site.slug}`)}
                          className={`cursor-pointer ${site.slug === mainSiteSlug ? 'bg-orange-50 text-orange-600 font-medium' : 'text-zinc-600 focus:text-zinc-900 focus:bg-black/5'}`}
                          data-testid={`switch-site-${site.slug}`}
                        >
                          {site.logo_url ? (
                            <img src={`${process.env.REACT_APP_BACKEND_URL}${site.logo_url}`} alt="" className="w-6 h-6 rounded object-contain mr-2 flex-shrink-0" />
                          ) : (
                            <Globe className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className="truncate">{site.name}</span>
                          {site.slug === mainSiteSlug && <Check className="w-3.5 h-3.5 ml-auto text-orange-500 flex-shrink-0" />}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ));
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div ref={pillNavRef} className="hidden lg:flex items-center gap-1 mx-auto rounded-[28px] p-1.5 bg-transparent flex-1 min-w-0 justify-center overflow-hidden" data-testid="pill-nav">
            {[{ label: 'Dashboard', to: `/${mainSiteSlug}` }, ...flatNavItems.slice(0, visibleNavCount).map(i => ({ label: i.label, to: i.to }))].map(tab => {
              const isTabActive = !isLicenseBlocked && (tab.to === `/${mainSiteSlug}` ? isDashboardHome : (location.pathname === tab.to || location.pathname.startsWith(tab.to + '/')));
              const pathSegment = tab.to.split('/').pop();
              const pillBadge = getBadgeCount(pathSegment);
              return isLicenseBlocked ? (
                <span key={tab.to}
                  className="relative px-5 py-2.5 rounded-[20px] text-sm font-medium text-zinc-300 cursor-not-allowed select-none whitespace-nowrap flex-shrink-0"
                  data-testid={`pill-disabled-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {tab.label}
                </span>
              ) : (
                <NavLink key={tab.to} to={tab.to} end={tab.to === `/${mainSiteSlug}`}
                  className={`relative px-5 py-2.5 rounded-[20px] text-sm font-medium transition-colors duration-200 flex items-center gap-1.5 z-[1] whitespace-nowrap flex-shrink-0 ${isTabActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-700'}`}
                  data-testid={`pill-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {isTabActive && (
                    <div
                      className="absolute inset-0 bg-zinc-900 rounded-full shadow-sm"
                      style={{ zIndex: -1 }}
                    />
                  )}
                  {tab.label}
                  {pillBadge > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-semibold rounded-full transition-colors duration-200 ${
                      isTabActive ? 'bg-white/20 text-white' : 'bg-zinc-900/10 text-zinc-600'
                    }`} data-testid={`pill-badge-${pathSegment}`}>
                      {pillBadge > 99 ? '99+' : pillBadge}
                    </span>
                  )}
                </NavLink>
              );
            })}
            {!isLicenseBlocked && flatNavItems.length > visibleNavCount && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2 rounded-full text-sm font-medium text-zinc-400 hover:text-zinc-700 hover:bg-white/60 transition-colors flex items-center whitespace-nowrap flex-shrink-0">More<ChevronDown className="w-3.5 h-3.5 ml-1 inline" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="bg-white/30 backdrop-blur-2xl border-white/40 shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.6)] rounded-2xl">
                  {flatNavItems.slice(visibleNavCount).map(item => {
                    const Icon = item.icon;
                    const dropBadge = getBadgeCount(item.to.split('/').pop());
                    return (
                      <DropdownMenuItem key={item.to} onClick={() => navigate(item.to)} className="text-zinc-600 focus:text-zinc-900 focus:bg-black/5 cursor-pointer">
                        <Icon className="w-4 h-4 mr-2" />
                        <span className="flex-1">{item.label}</span>
                        {dropBadge > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-semibold rounded-full bg-zinc-900/10 text-zinc-600">
                            {dropBadge > 99 ? '99+' : dropBadge}
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {/* Search - Icon button that opens a centered popup */}
          <div className="flex-shrink-0 ml-auto lg:ml-0">
            <button
              onClick={() => { if (!isLicenseBlocked) setSearchExpanded(true); }}
              className={`w-9 h-9 flex items-center justify-center rounded-full border border-white/40 bg-white/20 backdrop-blur-xl hover:bg-white/40 transition-all ${isLicenseBlocked ? 'opacity-30 cursor-not-allowed' : ''}`}
              data-testid="search-icon-btn"
            >
              <Search className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Search Popup Overlay */}
          {searchExpanded && (
            <>
              <div className="fixed inset-0 z-[200]" onClick={() => { setSearchExpanded(false); setSearchOpen(false); setSearchQuery(''); }} />
              <div className="fixed inset-0 z-[201] flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
                <div className="w-full max-w-md pointer-events-auto" data-testid="search-popup">
                  <div className="bg-white rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.15)] border border-zinc-200/60 overflow-hidden">
                    {/* Search input */}
                    <div className="relative p-3">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                        placeholder="Search..."
                        autoFocus
                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-transparent border-0 text-zinc-900 placeholder:text-zinc-300 focus:outline-none transition-all"
                        data-testid="global-search-input"
                      />
                      {searchLoading && <Loader2 className="absolute right-16 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 animate-spin" />}
                      <button
                        onClick={() => { setSearchExpanded(false); setSearchOpen(false); setSearchQuery(''); }}
                        className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500 transition-colors"
                        data-testid="search-close-btn"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Results */}
                    {searchQuery.length >= 2 && (
                      <div className="max-h-[50vh] overflow-y-auto" data-testid="search-results-dropdown">
                        {searchResults.length === 0 && !searchLoading && (
                          <div className="px-4 py-8 text-center text-sm text-zinc-400">No results found</div>
                        )}
                        {searchResults.map((result, idx) => {
                          const typeIcon = result.type === 'content' ? FileText : result.type === 'show' ? Radio : Image;
                          const TypeIcon = typeIcon;
                          const typeLabel = result.type === 'content' ? 'Content' : result.type === 'show' ? 'Show' : 'Media';
                          const route = result.type === 'content' ? `/${mainSiteSlug}/content/${result.id}` : result.type === 'show' ? `/${mainSiteSlug}/shows` : `/${mainSiteSlug}/media`;
                          return (
                            <button
                              key={`${result.type}-${result.id}-${idx}`}
                              onClick={() => { navigate(route); setSearchExpanded(false); setSearchOpen(false); setSearchQuery(''); }}
                              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-50 transition-colors text-left border-b border-zinc-100 last:border-b-0"
                              data-testid={`search-result-${result.id}`}
                            >
                              <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
                                <TypeIcon className="w-4 h-4 text-zinc-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-800 truncate">{result.title}</p>
                                <p className="text-[11px] text-zinc-400 truncate">{typeLabel} - {result.subtitle}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {searchQuery.length < 2 && (
                      <div className="px-4 py-5 text-center text-xs text-zinc-300">Type at least 2 characters to search</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="flex items-center gap-3 flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 hover:bg-black/[0.03] rounded-xl px-2 py-1.5 transition-colors" data-testid="user-menu-trigger">
                  {getAvatarUrl(user) ? (
                    <img src={getAvatarUrl(user)} alt={user?.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold text-sm">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-zinc-800 leading-tight">{user?.name}</p>
                    <p className="text-[11px] text-zinc-400">{displayRoleName}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white/30 backdrop-blur-2xl border-white/40 shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.6)] rounded-2xl">
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
                {user?.is_network_admin && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/network')} className="text-zinc-600 focus:text-zinc-900 focus:bg-black/5 cursor-pointer">
                      <Network className="w-4 h-4 mr-2" />
                      Network Management
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-black/[0.06]" />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate(`/${mainSiteSlug}/settings`)} className="text-zinc-600 focus:text-zinc-900 focus:bg-black/5">
                  <UserCog className="w-4 h-4 mr-2" />
                  Personal Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-black/[0.06]" />
                <DropdownMenuItem onClick={handleLogout} className="text-orange-500 focus:text-orange-500 focus:bg-orange-50">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={closeSidebar} />
        )}

        {/* Mobile Sidebar */}
        <aside className={`lg:hidden fixed top-0 left-0 h-full z-50 w-72 bg-white/95 backdrop-blur-2xl border-r border-black/[0.06] transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-5 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className="bg-zinc-900 text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold">
                <Radio className="w-4 h-4" />Clara
              </div>
              <Button variant="ghost" size="icon" onClick={closeSidebar} className="text-zinc-400 hover:text-zinc-700"><X className="w-5 h-5" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <nav className="space-y-1">
                <NavLink to={`/${mainSiteSlug}`} end onClick={closeSidebar} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-orange-50 text-orange-600' : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/5'}`}>
                  <LayoutDashboard className="w-5 h-5" /><span className="font-medium">Dashboard</span>
                </NavLink>
                {flatNavItems.map((item) => { const Icon = item.icon; return isLicenseBlocked ? (
                  <span key={item.to} className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-300 cursor-not-allowed">
                    <Icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
                  </span>
                ) : (
                  <NavLink key={item.to} to={item.to} onClick={closeSidebar} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-orange-50 text-orange-600' : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/5'}`}>
                    <Icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
                  </NavLink>
                ); })}
              </nav>
            </div>
            <div className="pt-4 border-t border-black/[0.06] mt-4">
              <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2 text-orange-500 hover:text-orange-600 hover:bg-orange-50">
                <LogOut className="w-4 h-4" />Sign out
              </Button>
            </div>
          </div>
        </aside>

        {/* ─── Workspace Canvas ─── */}
        <WorkspaceCanvas backgroundImage={isDashboardHome ? (SITE_TYPE_BACKGROUNDS[mainSite?.site_type] || SITE_TYPE_BACKGROUNDS.radio) : 'none'}>
          {isLicenseBlocked ? (
            <CanvasPanel position="main" testId="no-license-block">
              <LicenseBlockedOverlay siteName={mainSite?.name} />
            </CanvasPanel>
          ) : isDashboardHome ? (
            <Outlet />
          ) : isEnterpriseAssistant ? (
            <div className="absolute inset-3 rounded-[20px] overflow-hidden">
              <Outlet />
            </div>
          ) : (
            <CanvasPanel position="main" scrollable testId="main-content-panel">
              {isInSiteContext && currentSite ? (
                <Outlet context={{ siteTab, setSiteTab, currentSite, fetchCurrentSite }} />
              ) : (
                <Outlet />
              )}
            </CanvasPanel>
          )}
        </WorkspaceCanvas>
      </div>
    </TooltipProvider>
    {isClone && <DevToolsPanel />}
    {isClone && <DevToolsInspector />}
    {(user?.role === 'admin' || user?.is_network_admin || user?.is_system_admin) && <ClaraCLI triggerRef={cliTriggerRef} />}
    <UserTicketsPanel open={showUserTickets} onClose={() => setShowUserTickets(false)} />
    <TicketUpdatePopup
      tickets={showTicketPopup ? ticketUpdates : []}
      onClose={() => setShowTicketPopup(false)}
      onOpenTicket={() => setShowUserTickets(true)}
    />
    <ClaraAssistant />
    {mainSite?.clara_enterprise && (
      <VoiceCallWidget
        open={showVoiceCall}
        onClose={() => setShowVoiceCall(false)}
      />
    )}
    </DevToolsProvider>
  );
};

// Wrapper that provides PermissionsProvider context
const MainSiteDashboardLayout = () => (
  <PermissionsProvider>
    <MainSiteDashboardContent />
  </PermissionsProvider>
);

export default MainSiteDashboardLayout;
