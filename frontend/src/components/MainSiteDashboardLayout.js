/* eslint-disable */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { useTopLoader } from './TopLoader';
import { PermissionsProvider, usePermissions } from '../context/PermissionsContext';
import { DevToolsProvider } from '../context/DevToolsContext';
import DevToolsPanel from './DevTools/DevToolsPanel';
import usePageTitle from '../hooks/usePageTitle';
import DevToolsInspector from './DevTools/DevToolsInspector';
import ClaraCLI from './ClaraCLI';
import ClaraAssistant from './ClaraAssistant';
import VoiceCallWidget from './VoiceCallWidget';
import LicenseBlockedOverlay from './LicenseBlockedOverlay';
import MaintenanceBanner from './MaintenanceBanner';
import { useClaraAssistant } from '../context/ClaraAssistantContext';
// ClaraAssistantProvider is now at the App root level
import { 
  LayoutList, LogOut, User, Calendar, Settings, Crown, Pencil, Eye, 
  FileText, Globe, MessageSquare, File, Mic, Menu, X, Sliders, Home, 
  ScrollText, ClipboardCheck, Trash2, Users, ChevronDown, ChevronRight, ChevronLeft,
  UserCog, ArrowLeftRight, FileCheck, Radio, Headphones, Wand2, Play,
  ArrowLeft, Send, Palette, Network, Activity, Shield, Phone, Monitor,
  KeyRound, FileCode, Video, Ban, Lock, Check, Search, Image, Loader2, Sparkles, Terminal, Plug, Zap, DoorOpen, HelpCircle, CornerDownLeft
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
import { LayoutDashboard, Disc3 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Resolve a main site logo URL.
 *   - Absolute https:// URL (S3) → use as-is
 *   - Relative /api/uploads path  → prefix with backend URL (legacy)
 *   - Anything else               → return as-is so onError can fall through
 */
function resolveLogoUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${process.env.REACT_APP_BACKEND_URL}${url}`;
  return url;
}

/* Site-type background images (same as CreateMainSiteWizard) */
const SITE_TYPE_BACKGROUNDS = {
  radio: '/images/env_radio.jpg',
  server: '/images/env_server.jpg',
  external_host: '/images/env_external_host.jpg',
  task_scheduler: '/images/env_task_scheduler.jpg',
  technical: '/images/env_technical.jpg',
  wp_security: '/images/env_wp_security.jpg',
  code_studio: '/images/env_code_studio.jpg', // legacy mapping kept for back-compat; will not render
  // Custom sites get the neutral "clara_custom_room" scene — a single generic
  // workspace room distinct from the radio studio used by radio sites.
  custom: '/images/clara_custom_room.jpg',
  clara_custom: '/images/clara_custom_room.jpg',
};

/* Auto-include implicit features that should always show alongside their parent.
   Rule: if Content Library is enabled, Approval + Trash are always available.
   Rule: Clara Custom sites always get content_library + media_library so admins
   can manage feature-integrations (news/blog, pages, etc.) from day one. */
function withImplicitFeatures(enabledFeatures, siteType) {
  const set = new Set(enabledFeatures || []);
  // Auto-include implicit base features only — explicit features (RDS, news, etc.)
  // are now ALWAYS opt-in via enabled_features so admins fully control the menu.
  if (set.has('content_library')) {
    set.add('content_approval');
    set.add('trash');
  }
  // API Endpoints page is available when the site exposes anything publicly
  // (radio/news/content). For 'custom' sites the feature is only on when the
  // admin explicitly enables at least one publicly-facing feature.
  const hasPublicSurface =
    set.has('rds') || set.has('rds_settings') ||
    set.has('content_library') || set.has('shows') || set.has('clara_publish') ||
    set.has('sites');
  if (hasPublicSurface) {
    set.add('api_endpoints');
  }
  // Room Bookings — surface next to Shows/Calendar whenever they are on so
  // the calendar and booking flows stay linked.
  if (set.has('shows') || set.has('calendar')) {
    set.add('room_bookings');
  }
  return Array.from(set);
}

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
  rds: { to: 'rds', icon: Radio, label: 'RDS', adminOnly: true },
  stream_monitor: { to: 'streams', icon: Headphones, label: 'Stream Monitor', adminOnly: true },
  sites: { to: 'sites', icon: Globe, label: 'Sites', adminOnly: true, hasSitesList: true },
  team_settings: { to: 'team', icon: Users, label: 'Team Settings', adminOnly: true },
  wordpress: { to: 'wordpress', icon: Globe, label: 'WordPress', adminOnly: true },
  activity_logs: { to: 'logs', icon: ScrollText, label: 'Activity Logs', adminOnly: true },
  call_studio: { to: 'call-studio', icon: Phone, label: 'Call Studio' },
  zerotier: { to: 'zerotier', icon: Monitor, label: 'ZeroTier', adminOnly: true },
  radioplayer: { to: 'radioplayer', icon: RadioplayerIcon, label: 'Radioplayer', adminOnly: true },
  xml_imports: { to: 'xml-imports', icon: FileCode, label: 'XML Imports' },
  server_api_keys: { to: 'api-keys', icon: KeyRound, label: 'API Keys', adminOnly: true },
  vmix_director: { to: 'vmix-director', icon: Video, label: 'vMix Director' },
  canva_director: { to: 'canva', icon: Palette, label: 'Canva Director' },
  task_boards: { to: 'task-boards', icon: LayoutList, label: 'Task Boards' },
  enterprise_assistant: { to: 'enterprise-assistant', icon: Sparkles, label: 'Enterprise Assistant' },
  radio_automation: { to: 'radio-automation', icon: Disc3, label: 'Radio Automation', adminOnly: true },
  api_endpoints: { to: 'api-endpoints', icon: Zap, label: 'API Endpoints', adminOnly: true },
  video_endpoints: { to: 'video-endpoints', icon: Video, label: 'Video Endpoints' },
  room_bookings: { to: 'room-bookings', icon: DoorOpen, label: 'Room Bookings' },
  clara_flows: { to: 'clara-flows', icon: Sparkles, label: 'Clara Flows', adminOnly: true },
};

// Navigation groups with feature mapping
const NAV_GROUPS = [
  {
    id: 'shows',
    label: 'Shows',
    icon: LayoutList,
    features: ['shows', 'calendar', 'show_management', 'room_bookings']
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
    features: ['rds', 'stream_monitor', 'call_studio']
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
    features: ['team_settings', 'wordpress', 'activity_logs', 'zerotier', 'api_endpoints', 'clara_flows']
  },
  {
    id: 'server',
    label: 'Virtual Datacenter',
    icon: Monitor,
    features: ['xml_imports', 'server_api_keys', 'vmix_director', 'canva_director', 'radioplayer', 'radio_automation']
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: LayoutList,
    features: ['task_boards']
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
    if (!subPath || subPath === 'settings' || subPath === 'radio-automation') return; // always valid routes
    
    const enabledFeatures = withImplicitFeatures(mainSite.enabled_features, mainSite.site_type);
    const validRoutes = new Set(['dashboard', 'settings']);
    enabledFeatures.forEach(f => {
      const nav = FEATURE_NAV_ITEMS[f];
      if (nav) validRoutes.add(nav.to);
    });
    if (mainSite.clara_enterprise) {
      validRoutes.add('enterprise-assistant');
    }
    // Clara Flows is always available for admins (admin-only route)
    validRoutes.add('clara-flows');
    // Video Endpoints is always available for editors and admins
    validRoutes.add('video-endpoints');
    // Room Bookings is available for every tenant — non-admins book, admins manage rooms
    validRoutes.add('room-bookings');
    // Technical sites always have zerotier + team access
    if (mainSite.site_type === 'technical') {
      validRoutes.add('zerotier');
      validRoutes.add('team');
    }
    // Task Scheduler sites always have task-boards
    if (mainSite.site_type === 'task_scheduler') {
      validRoutes.add('task-boards');
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
  const [searchActiveIdx, setSearchActiveIdx] = useState(0);
  const cliTriggerRef = useRef(null);
  const pillNavRef = useRef(null);
  const flatNavItemsRef = useRef([]);
  const [visibleNavCount, setVisibleNavCount] = useState(4);
  const searchInputRef = useCallback(node => { if (node) node.focus(); }, []);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const [firewallActive, setFirewallActive] = useState(false);
  const [hasStations, setHasStations] = useState(false);
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

  // Check if RDS stations exist for this site
  const fetchHasStations = useCallback(async () => {
    if (!mainSite?.id) return;
    try {
      const response = await axios.get(`${API}/rds-stations/${mainSite.id}`);
      const stations = response.data?.stations || [];
      setHasStations(stations.length > 0);
    } catch {
      setHasStations(false);
    }
  }, [mainSite?.id]);

  // Search within current main site
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setSearchActiveIdx(0);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await axios.get(`${API}/search`, { params: { q: searchQuery } });
        setSearchResults(response.data.results || []);
        setSearchActiveIdx(0);
      } catch { setSearchResults([]); }
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search on route change
  useEffect(() => { setSearchOpen(false); setSearchQuery(''); setSearchExpanded(false); }, [location.pathname]);

  // Fetch firewall status for this site
  useEffect(() => {
    if (!mainSite?.id) return;
    const fetchFw = async () => {
      try {
        const res = await axios.get(`${API}/firewall/status/bulk`);
        setFirewallActive(res.data?.status?.[mainSite.id] === true);
      } catch {
        setFirewallActive(false);
      }
    };
    fetchFw();
  }, [mainSite?.id]);


  // Dynamically calculate how many nav items fit in the pill bar.
  // Strategy: estimate width per item from its label length (px per character),
  // recompute on resize. Falls back to a conservative average.
  // Recalculate visible nav pill count whenever the active main site OR its
  // feature set changes. We trigger on `mainSite?.id` *and* a length signature
  // of the available features so a site switch never leaves the nav stuck at
  // the previous (smaller) calculation — which used to collapse the menu to
  // "Dashboard · More".
  const featuresSignature = (mainSite?.enabled_features || []).join('|') + ':' + (mainSite?.site_type || '');
  useEffect(() => {
    const container = pillNavRef.current;
    if (!container) return;
    const DASHBOARD_WIDTH = 130;
    const MORE_WIDTH = 90;
    const PILL_PADDING = 52; // px-5 (=40) + gap + margin
    const PX_PER_CHAR = 8.4; // text-sm font-medium is ~14px, chars avg ~8-9px

    const calculate = () => {
      const totalWidth = container.offsetWidth;
      // Leave a safety margin so labels never touch the ellipsis threshold.
      const available = Math.max(0, totalWidth - DASHBOARD_WIDTH - MORE_WIDTH - 16);
      let used = 0;
      let count = 0;
      for (const item of flatNavItemsRef.current) {
        const w = (item.label?.length || 6) * PX_PER_CHAR + PILL_PADDING;
        if (used + w > available) break;
        used += w;
        count += 1;
      }
      setVisibleNavCount(count);
    };
    // Run twice: once synchronously, once after the next paint so the new
    // flatNavItems ref has been written by the render that follows this
    // effect. Without the rAF we measure the *previous* list after switching.
    calculate();
    const raf1 = requestAnimationFrame(calculate);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(calculate));
    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSiteSlug, mainSite?.id, featuresSignature]);


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
      fetchHasStations();
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
  const SITE_TYPE_LABEL_MAP = {
    radio: 'Radio',
    server: 'Virtual Datacenter',
    technical: 'Data Connection',
    task_scheduler: 'Tasks',
    external_host: 'External Host',
    wp_security: 'WP Security',
    code_studio: 'Code Studio',
    clara_custom: 'Clara Custom',
    custom: 'Custom',
  };
  const SITE_TYPE_COLOR_MAP = {
    radio: 'bg-[#7380b6]/15 text-[#7380b6] border-[#7380b6]/25',
    server: 'bg-[#7380b6]/100/15 text-[#7380b6] border-[#7380b6]/25',
    technical: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
    task_scheduler: 'bg-violet-500/15 text-violet-500 border-violet-500/25',
    external_host: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/25',
    wp_security: 'bg-[#7380b6]/100/15 text-[#7380b6]0 border-[#7380b6]/25',
    code_studio: 'bg-purple-500/15 text-purple-500 border-purple-500/25',
    clara_custom: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/25',
    custom: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/25',
  };
  const siteTypeKey = mainSite?.site_type || 'radio';
  const siteTypeLabel = SITE_TYPE_LABEL_MAP[siteTypeKey] || 'Site';
  const siteTypeLabelColor = SITE_TYPE_COLOR_MAP[siteTypeKey] || 'bg-zinc-500/15 text-zinc-500 border-zinc-500/25';
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
      const adminItems = ['team_settings', 'activity_logs']
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
      return groups;
    }

    // Custom sites + Radio sites + Server sites + Technical sites — share the
    // generic feature-flag-driven menu below.
    
    const enabledFeatures = withImplicitFeatures(mainSite.enabled_features, mainSite.site_type);

    // Hide RDS features if no stations configured
    const rdsFeatures = ['rds', 'stream_monitor'];

    const groups = NAV_GROUPS.map(group => {
      // Server group is only for server site types
      if (group.id === 'server' && mainSite.site_type !== 'server') return null;
      
      const items = group.features
        .filter(featureId => {
          if (!hasStations && rdsFeatures.includes(featureId)) return false;
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

    // Clara Flows is admin-only and always available — append to the
    // Administration group (or create one) without needing per-site opt-in.
    if (userIsAdmin) {
      const flowsItem = FEATURE_NAV_ITEMS.clara_flows;
      if (flowsItem) {
        const navEntry = { ...flowsItem, to: `/${mainSiteSlug}/${flowsItem.to}`, featureId: 'clara_flows' };
        const adminGroup = groups.find((g) => g.id === 'admin');
        if (adminGroup) {
          // Avoid duplicates if it's already present via enabled_features
          if (!adminGroup.items.some((it) => it.featureId === 'clara_flows')) {
            adminGroup.items.push(navEntry);
          }
        } else {
          groups.push({
            id: 'admin',
            label: 'Administration',
            icon: Settings,
            items: [navEntry],
          });
        }
      }
    }

    // Video Endpoints — own top-level group, visible for editors + admins
    // (matches the "all editors/admins can manage" UX choice).
    const videoItem = FEATURE_NAV_ITEMS.video_endpoints;
    if (videoItem) {
      const videoEntry = {
        ...videoItem,
        to: `/${mainSiteSlug}/${videoItem.to}`,
        featureId: 'video_endpoints',
      };
      const existing = groups.find((g) => g.id === 'video');
      if (!existing) {
        groups.push({
          id: 'video',
          label: 'Video',
          icon: Video,
          items: [videoEntry],
        });
      } else if (!existing.items.some((it) => it.featureId === 'video_endpoints')) {
        existing.items.push(videoEntry);
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
              ? 'bg-[#7380b6]/10 text-[#7380b6]'
              : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700'
          }`}
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1">{item.label}</span>
          {item.tab === 'submissions' && submissionCounts[currentSiteId] > 0 && (
            <span className="bg-[#7380b6] !text-white [&_svg]:!text-white text-xs px-2 py-0.5 rounded-full">
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
              ? 'bg-[#7380b6]/10 text-[#7380b6]'
              : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700'
          }`
        }
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{item.label}</span>
        {badgeCount > 0 && (
          <span className="bg-[#7380b6] !text-white [&_svg]:!text-white text-xs px-2 py-0.5 rounded-full">
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
                      ? 'bg-[#7380b6]/10 text-[#7380b6]'
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
                            ? 'bg-[#7380b6]/10 text-[#7380b6]'
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
  flatNavItemsRef.current = flatNavItems;

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
                      ? 'bg-[#7380b6]/15 text-[#7380b6] shadow-[0_2px_12px_rgba(221,12,81,0.15)]' 
                      : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.06]'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-[3px] h-5 rounded-r-full bg-[#7380b6]" />}
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full bg-[#7380b6] !text-white [&_svg]:!text-white ring-2 ring-white">
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
                      ? 'bg-[#7380b6]/15 text-[#7380b6] shadow-[0_2px_12px_rgba(221,12,81,0.15)]' 
                      : 'text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.06]'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-[3px] h-5 rounded-r-full bg-[#7380b6]" />}
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full bg-[#7380b6] !text-white [&_svg]:!text-white ring-2 ring-white">
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
          <div className="w-8 h-8 border-2 border-[#7380b6] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <DevToolsProvider enabled={isClone}>
    <TooltipProvider delayDuration={0}>
      {/* Outer shell: banners + workspace */}
      <div className="h-screen flex flex-col overflow-hidden bg-[#F5F6F8]" style={{ height: '100dvh' }}>
        {/* Maintenance/announcement banners (active broadcasts) */}
        <MaintenanceBanner mainSiteId={mainSite?.id || ''} />
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
          <div className="flex-shrink-0 bg-[#7380b6] !text-white [&_svg]:!text-white px-4 py-2 z-[60]">
            <div className="flex items-center justify-between max-w-screen-xl mx-auto">
              <div className="flex items-center gap-2 text-sm">
                <ArrowLeftRight className="w-4 h-4" />
                <span>Viewing as <strong>{user?.name}</strong> ({user?.email})</span>
              </div>
              <Button size="sm" variant="ghost" onClick={handleExitImpersonation} className="text-white hover:bg-[#7380b6] gap-2">
                <LogOut className="w-4 h-4" />
                Return to {impersonating.name}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Horizontal Top Navigation (Clara Campaigns layout) ─── */}
        <nav className="h-16 flex-shrink-0 sticky top-0 z-50 bg-[#F5F6F8]" data-testid="workspace-topbar">
         <div className="max-w-[1400px] mx-auto px-6 h-full flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} data-testid="mobile-menu-btn" className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          {/* Logo lockup — periwinkle chevron + divider + "Clara" wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate(`/${mainSiteSlug}`)}
              className="hover:opacity-80 transition-opacity flex items-center justify-center"
              data-testid="logo-pill"
              aria-label="Clara"
            >
              <img src="/clara-chevron.png" alt="Clara" className="h-7 w-auto object-contain" />
            </button>
            <div className="h-7 w-px bg-zinc-200" />
            <span className="font-display font-bold text-zinc-900 text-[20px] leading-none whitespace-nowrap tracking-tight">
              Clara
            </span>
            {mainSite?.clara_enterprise && (
              <span
                className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 whitespace-nowrap border"
                style={{ color: '#b45309', backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}
                data-testid="enterprise-tag"
                title="Clara Enterprise"
              >
                Enterprise
              </span>
            )}
          </div>

          {/* Status Icons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Clara Global Protect — only show when firewall is active (icon-only, like Clara Enterprise) */}
            {firewallActive && (
              <div className="relative group" data-testid="global-protect-icon">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center cursor-default">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 bg-zinc-900 text-white text-[10px] font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                  Clara Global Protect
                </div>
              </div>
            )}
          </div>

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
          {/* Main Site Switcher Dropdown — always visible so user can switch to another site they have access to */}
          {myMainSites.length >= 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 flex items-center gap-2 px-2.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-800 transition-colors flex-shrink-0 max-w-[220px]" data-testid="main-site-switcher">
                  {mainSite?.logo_url ? (
                    <img
                      src={resolveLogoUrl(mainSite.logo_url)}
                      alt=""
                      className="w-4 h-4 rounded object-contain shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate hidden sm:inline">{displayName || mainSite?.name}</span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 bg-white border border-slate-200 shadow-lg rounded-2xl">
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
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: envGroups[envId].color || '#7380b6' }} />
                        {envGroups[envId].name}
                      </div>
                      {envGroups[envId].sites.map(site => (
                        <DropdownMenuItem
                          key={site.id}
                          onClick={() => navigate(`/${site.slug}`)}
                          className={`cursor-pointer ${site.slug === mainSiteSlug ? 'bg-[#7380b6]/10 text-[#5f6ca3] font-medium' : 'text-zinc-600 focus:text-zinc-900 focus:bg-black/5'}`}
                          data-testid={`switch-site-${site.slug}`}
                        >
                          {site.logo_url ? (
                            <img
                              src={resolveLogoUrl(site.logo_url)}
                              alt=""
                              className="w-6 h-6 rounded object-contain mr-2 flex-shrink-0"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <Globe className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className="truncate">{site.name}</span>
                          {site.slug === mainSiteSlug && <Check className="w-3.5 h-3.5 ml-auto text-[#7380b6] flex-shrink-0" />}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ));
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div ref={pillNavRef} className="hidden lg:flex items-center gap-0.5 ml-3 flex-1 min-w-0" data-testid="pill-nav">
            <LayoutGroup>
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
                  className={`relative px-3.5 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 z-[1] whitespace-nowrap flex-shrink-0 ${isTabActive ? 'text-white' : 'text-slate-500'}`}
                  data-testid={`pill-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {isTabActive && (
                    <motion.div
                      layoutId="pill-active"
                      className="absolute inset-0 bg-slate-900 rounded-full shadow-lg shadow-slate-900/25"
                      style={{ zIndex: -1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
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
                  <button className="px-4 py-2 rounded-full text-sm font-medium text-zinc-500 transition-colors flex items-center whitespace-nowrap flex-shrink-0">More<ChevronDown className="w-3.5 h-3.5 ml-1 inline" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="bg-white border border-slate-200 shadow-lg rounded-2xl">
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
            </LayoutGroup>
          </div>
          {/* Search - Icon button that opens a centered popup */}
          <div className="flex-shrink-0 ml-auto lg:ml-0">
            <button
              onClick={() => { if (!isLicenseBlocked) setSearchExpanded(true); }}
              className={`w-9 h-9 flex items-center justify-center transition-all ${isLicenseBlocked ? 'opacity-30 cursor-not-allowed' : ''}`}
              data-testid="search-icon-btn"
            >
              <Search className="w-4 h-4 text-zinc-500" />
            </button>
          </div>

          {/* Search Popup Overlay — command-palette style, scoped to current site */}
          {searchExpanded && (() => {
            const closeSearch = () => { setSearchExpanded(false); setSearchOpen(false); setSearchQuery(''); setSearchActiveIdx(0); };
            // Group results by type and build a flat list that mirrors the rendering order
            const typeMeta = {
              content: { label: 'Content', icon: FileText, route: (r) => `/${mainSiteSlug}/content/${r.id}` },
              show:    { label: 'Shows',   icon: Radio,    route: () => `/${mainSiteSlug}/shows` },
              media:   { label: 'Media',   icon: Image,    route: () => `/${mainSiteSlug}/media` },
            };
            const groups = {};
            searchResults.forEach((r) => { const t = r.type || 'content'; (groups[t] ||= []).push(r); });
            const groupOrder = Object.keys(groups);
            const flat = [];
            groupOrder.forEach((t) => groups[t].forEach((r) => flat.push({ ...r, _type: t })));
            const openAt = (idx) => {
              const item = flat[idx];
              if (!item) return;
              const meta = typeMeta[item._type] || typeMeta.content;
              navigate(meta.route(item));
              closeSearch();
            };
            const onKey = (e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSearchActiveIdx((i) => Math.min(flat.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchActiveIdx((i) => Math.max(0, i - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); openAt(searchActiveIdx); }
              else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
            };
            let runningIdx = -1;
            return (
              <>
                <div className="fixed inset-0 z-[200] bg-zinc-900/10 backdrop-blur-[2px]" onClick={closeSearch} />
                <div className="fixed inset-0 z-[201] flex items-start justify-center pt-[12vh] px-4 pointer-events-none">
                  <div className="w-full max-w-xl pointer-events-auto" data-testid="search-popup" onKeyDown={onKey}>
                    <div className="bg-white rounded-2xl shadow-[0_30px_90px_rgba(16,24,40,0.18)] border border-zinc-200/70 overflow-hidden">
                      {/* Search input row */}
                      <div className="relative flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
                        <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                          placeholder={`Search ${mainSite?.name || 'this site'}...`}
                          autoFocus
                          className="flex-1 bg-transparent border-0 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                          data-testid="global-search-input"
                        />
                        {searchLoading && <Loader2 className="w-4 h-4 text-zinc-300 animate-spin flex-shrink-0" />}
                        <button
                          onClick={closeSearch}
                          className="px-2 py-0.5 text-[11px] font-medium text-zinc-500 bg-zinc-100 rounded-md border border-zinc-200 flex-shrink-0"
                          data-testid="search-close-btn"
                        >esc</button>
                      </div>
                      {/* Results */}
                      <div className="max-h-[55vh] overflow-y-auto" data-testid="search-results-dropdown">
                        {searchQuery.length < 2 && (
                          <div className="px-5 py-10 text-center text-sm text-zinc-400">Type at least 2 characters to search</div>
                        )}
                        {searchQuery.length >= 2 && flat.length === 0 && !searchLoading && (
                          <div className="px-5 py-10 text-center text-sm text-zinc-400">No results found</div>
                        )}
                        {groupOrder.map((t) => {
                          const meta = typeMeta[t] || { label: t, icon: FileText };
                          const Icon = meta.icon;
                          return (
                            <div key={t} className="py-2">
                              <div className="px-5 pt-1 pb-1.5 text-[11px] font-semibold text-zinc-400 tracking-wider">
                                {meta.label.toUpperCase()}
                              </div>
                              {groups[t].map((r) => {
                                runningIdx += 1;
                                const idx = runningIdx;
                                const active = idx === searchActiveIdx;
                                return (
                                  <button
                                    key={`${t}-${r.id}-${idx}`}
                                    onMouseEnter={() => setSearchActiveIdx(idx)}
                                    onClick={() => openAt(idx)}
                                    className={`group w-full px-4 mx-1 rounded-lg py-2.5 flex items-center gap-3 text-left transition-colors ${
                                      active ? 'bg-[#7380b6]/8' : 'hover:bg-zinc-50'
                                    }`}
                                    style={active ? { backgroundColor: 'rgba(115,128,182,0.08)' } : undefined}
                                    data-testid={`search-result-${r.id}`}
                                  >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-white border border-[#7380b6]/20' : 'bg-zinc-100'}`}>
                                      <Icon className={`w-4 h-4 ${active ? 'text-[#5f6ca3]' : 'text-zinc-500'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[14px] font-semibold text-zinc-900 truncate">{r.title}</p>
                                      {r.subtitle && (
                                        <p className="text-[12px] text-zinc-400 truncate">{r.subtitle}</p>
                                      )}
                                    </div>
                                    {r.status && (
                                      <span className="text-[11px] font-medium text-zinc-500 capitalize flex-shrink-0">{r.status}</span>
                                    )}
                                    <span className={`flex-shrink-0 text-zinc-300 transition-opacity ${active ? 'opacity-100 text-[#5f6ca3]' : 'opacity-0 group-hover:opacity-60'}`}>
                                      <CornerDownLeft className="w-3.5 h-3.5" />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                      {/* Footer hints */}
                      {searchQuery.length >= 2 && flat.length > 0 && (
                        <div className="border-t border-zinc-100 px-5 py-2.5 flex items-center gap-4 text-[11px] text-zinc-400">
                          <span className="inline-flex items-center gap-1.5"><CornerDownLeft className="w-3 h-3" /> to open</span>
                          <span className="inline-flex items-center gap-1.5"><span className="font-mono">↑↓</span> to navigate</span>
                          <span className="ml-auto">in <span className="font-medium text-zinc-500">{mainSite?.name || 'this site'}</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
          <div className="flex items-center gap-2 flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 hover:bg-slate-50 rounded-full pl-0.5 pr-2 py-0.5 transition-colors" data-testid="user-menu-trigger">
                  {getAvatarUrl(user) ? (
                    <img src={getAvatarUrl(user)} alt={user?.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7380b6] to-[#5f6ca3] flex items-center justify-center text-white font-semibold text-sm">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 shadow-lg rounded-2xl">
                <div className="px-3 py-2 flex items-center gap-3">
                  {getAvatarUrl(user) ? (
                    <img src={getAvatarUrl(user)} alt={user?.name} className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7380b6] to-[#5f6ca3] flex items-center justify-center text-white font-semibold">
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
                <DropdownMenuItem onClick={handleLogout} className="text-[#7380b6] focus:text-[#5f6ca3] focus:bg-[#7380b6]/10">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
         </div>
        </nav>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={closeSidebar} />
        )}

        {/* Mobile Sidebar */}
        <aside className={`lg:hidden fixed top-0 left-0 h-full z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-5 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className={brandingData.logo_type === 'image' && brandingData.logo_url
                ? "flex items-center"
                : "bg-zinc-900 text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold"}>
                {brandingData.logo_type === 'image' && brandingData.logo_url ? (
                  <img src={brandingData.logo_url.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${brandingData.logo_url}` : brandingData.logo_url} alt={brandName} className="h-7 object-contain" />
                ) : (
                  <><Radio className="w-4 h-4" />{brandName}</>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={closeSidebar} className="text-zinc-400 hover:text-zinc-700"><X className="w-5 h-5" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <nav className="space-y-1">
                <NavLink to={`/${mainSiteSlug}`} end onClick={closeSidebar} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-[#7380b6]/10 text-[#5f6ca3]' : 'text-zinc-500 hover:text-zinc-800 hover:bg-slate-50'}`}>
                  <LayoutDashboard className="w-5 h-5" /><span className="font-medium">Dashboard</span>
                </NavLink>
                {flatNavItems.map((item) => { const Icon = item.icon; return isLicenseBlocked ? (
                  <span key={item.to} className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-300 cursor-not-allowed">
                    <Icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
                  </span>
                ) : (
                  <NavLink key={item.to} to={item.to} onClick={closeSidebar} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'bg-[#7380b6]/10 text-[#5f6ca3]' : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/5'}`}>
                    <Icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
                  </NavLink>
                ); })}
              </nav>
            </div>
            <div className="pt-4 border-t border-black/[0.06] mt-4">
              <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2 text-[#7380b6] hover:text-[#5f6ca3] hover:bg-[#7380b6]/10">
                <LogOut className="w-4 h-4" />Sign out
              </Button>
            </div>
          </div>
        </aside>

        {/* ─── Workspace Canvas ─── */}
        <WorkspaceCanvas backgroundImage={isDashboardHome ? (SITE_TYPE_BACKGROUNDS[mainSite?.site_type] || SITE_TYPE_BACKGROUNDS.custom || SITE_TYPE_BACKGROUNDS.radio) : 'none'}>
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
