/* eslint-disable */
import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useTopLoader } from '../../components/TopLoader';
import NetworkHeader from '../../components/NetworkHeader';
import MaintenanceBanner from '../../components/MaintenanceBanner';
import SetupWizard from '../../components/SetupWizard';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Plus, Globe, Users, Layers, Settings, Trash2, Edit, ExternalLink,
  Tv, FileText, MessageSquare, Radio, Cog, Activity, Bug, CheckCircle,
  AlertTriangle, Info, X, Clock, Loader2, ChevronDown, ChevronUp, LogOut, 
  Crown, Network, Pencil, Mic, Eye, FileCheck, UserCog, Code, Shield, ShieldAlert, BarChart3,
  HardDrive, Monitor, LayoutGrid, List, Wrench, Bell, Menu, ChevronRight, User, Paintbrush, Server, Palette, Check, Upload, LifeBuoy
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import MigrationTool from './MigrationTool';
import RolesManager from './RolesManager';
import PermissionAuditPanel from './PermissionAuditPanel';
import NetworkAdminManager from './NetworkAdminManager';
import NotificationSettings from './NotificationSettings';
import TwoFactorSetup from '../../components/TwoFactorSetup';
import BrandingSettings from './BrandingSettings';
import VDCDeployPanel from './VDCDeployPanel';
import SupportTicketsPage from './SupportTicketsPage';
import LicenseManager from './LicenseManager';
import DomainManager from './DomainManager';
import ZeroTrustPanel from '../../components/ZeroTrustPanel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { WorkspaceCanvas } from '../../components/workspace/WorkspaceCanvas';
import { CanvasPanel } from '../../components/workspace/CanvasPanel';
import ServerRackView from '../../components/workspace/ServerRackView';
import CreateMainSiteWizard from '../../components/workspace/CreateMainSiteWizard';
import EditMainSiteWizard from '../../components/workspace/EditMainSiteWizard';
import EnvironmentManager from './EnvironmentManager';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from '../../utils/avatar';

const API = process.env.REACT_APP_BACKEND_URL;
const DATACENTER_BG = 'https://images.pexels.com/photos/4508751/pexels-photo-4508751.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

// Role icons and labels for user dropdown
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

// Feature groups for display with Lucide icons
const FEATURE_GROUPS = {
  shows: { name: 'Shows', Icon: Tv },
  content: { name: 'Content', Icon: FileText },
  communication: { name: 'Communication', Icon: MessageSquare },
  streaming: { name: 'Streaming & RDS', Icon: Radio },
  sites: { name: 'Sites', Icon: Globe },
  admin: { name: 'Administration', Icon: Cog },
  technical: { name: 'Data Connection', Icon: Monitor },
  server: { name: 'Virtual Datacenter', Icon: Monitor },
  tasks: { name: 'Tasks', Icon: LayoutGrid }
};

// Debug Content Component
function DebugContent({ data }) {
  const [expandedSections, setExpandedSections] = useState({});
  
  const toggle = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const Section = ({ id, title, icon: Icon, color, count, children }) => (
    <div className="bg-zinc-50/60 rounded-lg overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center gap-3 p-3 hover:bg-zinc-100/80 transition"
      >
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-medium text-zinc-800 flex-1 text-left">{title}</span>
        {count !== undefined && <span className="text-xs text-zinc-500 font-mono">{count}</span>}
        {expandedSections[id] ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {expandedSections[id] && <div className="px-3 pb-3">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header info */}
      <div className="flex items-center gap-4 p-3 bg-zinc-50/40 rounded-lg text-xs text-zinc-400">
        <span><Clock className="w-3 h-3 inline mr-1" />{data.brussels_time}</span>
        <span>Team IDs: {data.team_ids_resolved?.length || 0}</span>
        <span>Sites: {data.child_sites?.length || 0}</span>
      </div>

      {/* Today's Shows */}
      <Section id="shows" title="Shows Today" icon={Tv} color="text-orange-400" count={data.todays_shows?.length || 0}>
        {data.todays_shows?.length > 0 ? (
          <div className="space-y-1">
            {data.todays_shows.map((show, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${show.is_live ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-100/50'}`}>
                {show.is_live && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                <span className="text-zinc-800 font-medium">{show.title}</span>
                <span className="text-zinc-500">{show.start_time}–{show.end_time}</span>
                <span className="text-zinc-600">{show.rds_station || 'no rds'}</span>
                <span className={`ml-auto text-xs ${show.status === 'scheduled' ? 'text-emerald-400' : 'text-zinc-500'}`}>{show.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">No shows today</p>
        )}
      </Section>

      {/* Traffic last hour */}
      <Section id="traffic" title="Traffic (last hour)" icon={Activity} color="text-blue-400" count={data.traffic_last_hour?.reduce((s, t) => s + t.count, 0) || 0}>
        {data.traffic_last_hour?.length > 0 ? (
          <div className="space-y-1">
            {data.traffic_last_hour.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-1.5">
                <span className="text-zinc-600">{t.action}</span>
                <span className="text-zinc-500 font-mono">{t.count}x</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">No traffic</p>
        )}
      </Section>

      {/* RDS Cache Logs */}
      <Section id="rds" title="RDS Cache Logs" icon={Radio} color="text-violet-400" count={data.rds_cache_logs?.length || 0}>
        {data.rds_cache_logs?.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.rds_cache_logs.map((log, i) => (
              <div key={i} className={`text-xs p-2 rounded ${log.status === 'success' ? 'bg-emerald-500/10' : log.status === 'no_show' ? 'bg-zinc-100/50' : 'bg-red-500/10'}`}>
                <div className="flex justify-between">
                  <span className={`font-medium ${log.status === 'success' ? 'text-emerald-400' : log.status === 'no_show' ? 'text-amber-400' : 'text-red-400'}`}>
                    {log.status}
                  </span>
                  <span className="text-zinc-500">{log.timestamp?.slice(11, 19)}</span>
                </div>
                <p className="text-zinc-400 mt-0.5">{log.message}</p>
                {log.show_title && <p className="text-zinc-600 mt-0.5">{log.show_title}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">No cache logs</p>
        )}
      </Section>

      {/* Active Rundowns */}
      <Section id="rundowns" title="Active Rundowns" icon={FileText} color="text-emerald-400" count={data.active_rundowns?.length || 0}>
        {data.active_rundowns?.length > 0 ? (
          <div className="space-y-1">
            {data.active_rundowns.map((r, i) => (
              <div key={i} className="text-xs p-2 bg-zinc-50/60 rounded">
                <span className="text-zinc-800">{r.show_title}</span>
                <span className="text-zinc-500 ml-2">{r.show_start_time}–{r.show_end_time}</span>
                <span className="text-zinc-600 ml-2">{r.rds_station}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">No active rundowns</p>
        )}
      </Section>

      {/* Shoutcast Logs */}
      <Section id="shoutcast" title="Shoutcast Logs" icon={Radio} color="text-pink-400" count={data.shoutcast_logs?.length || 0}>
        {data.shoutcast_logs?.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.shoutcast_logs.map((log, i) => (
              <div key={i} className="text-xs p-1.5 flex items-center gap-2">
                <span className="text-zinc-500">{log.timestamp?.slice(11, 19)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${log.station === 'grk' ? 'bg-violet-500/20 text-violet-300' : 'bg-orange-500/20 text-orange-300'}`}>
                  {log.station?.toUpperCase()}
                </span>
                <span className="text-zinc-600 truncate">{log.title || log.current_song}</span>
                <span className="text-zinc-600 ml-auto">{log.listeners} listeners</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">No shoutcast logs</p>
        )}
      </Section>

      {/* Recent Audit Logs */}
      <Section id="audit" title="Recent Activity" icon={Clock} color="text-amber-400" count={data.recent_logs?.length || 0}>
        {data.recent_logs?.length > 0 ? (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {data.recent_logs.slice(0, 20).map((log, i) => (
              <div key={i} className="text-xs p-1.5 flex items-center gap-2 border-b border-zinc-200/50 last:border-0">
                <span className="text-zinc-500 w-14 flex-shrink-0">{log.timestamp?.slice(11, 19)}</span>
                <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-400 text-[10px]">{log.category}</span>
                <span className="text-zinc-600">{log.action}</span>
                <span className="text-zinc-500 truncate ml-auto">{log.user_name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">No activity</p>
        )}
      </Section>

      {/* Child Sites */}
      <Section id="sites" title="Child Sites & Team IDs" icon={Globe} color="text-cyan-400" count={data.child_sites?.length || 0}>
        <div className="space-y-1">
          {data.child_sites?.map((s, i) => (
            <div key={i} className="text-xs p-1.5 flex justify-between">
              <span className="text-zinc-600">{s.name}</span>
              <span className="text-zinc-600 font-mono text-[10px]">{s.team_id}</span>
            </div>
          ))}
          <div className="text-[10px] text-zinc-600 pt-2">
            All IDs: {data.team_ids_resolved?.join(', ')}
          </div>
        </div>
      </Section>
    </div>
  );
}

// User Access Section (inline, replaces dialog)
function UserAccessSection({ token, API }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/main-sites/debug/all-user-access`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setData(await res.json());
      } catch { /* noop */ } finally { setLoading(false); }
    })();
  }, [token, API]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>;
  if (!data) return <p className="text-zinc-500 text-center py-8">Failed to load data</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">User Access</h1>
          <p className="text-sm text-zinc-400">View user access records across all main sites</p>
        </div>
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-white border-zinc-200"><CardContent className="p-4"><div className="text-2xl font-bold text-zinc-900">{data.total_users}</div><div className="text-xs text-zinc-400">Total Users</div></CardContent></Card>
          <Card className="bg-white border-zinc-200"><CardContent className="p-4"><div className="text-2xl font-bold text-zinc-900">{data.total_main_sites}</div><div className="text-xs text-zinc-400">Main Sites</div></CardContent></Card>
          <Card className="bg-white border-zinc-200"><CardContent className="p-4"><div className="text-2xl font-bold text-zinc-900">{data.total_access_records}</div><div className="text-xs text-zinc-400">Access Records</div></CardContent></Card>
        </div>
        {data.users_without_site_access?.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <h3 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Users WITHOUT site access ({data.users_without_site_access.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.users_without_site_access.map((u, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm bg-zinc-50/60 rounded p-2">
                  <span className="text-zinc-800 font-medium">{u.user_name}</span>
                  <span className="text-zinc-500">{u.user_email}</span>
                  <span className="text-xs bg-zinc-200 px-2 py-0.5 rounded">{u.user_global_role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h3 className="text-zinc-800 font-semibold mb-3">Access per Main Site</h3>
          <div className="space-y-4">
            {Object.entries(data.access_by_site || {}).map(([siteName, users]) => (
              <Card key={siteName} className="bg-white border-zinc-200">
                <CardContent className="p-4">
                  <h4 className="text-zinc-800 font-medium mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" />
                    {siteName}
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{users.length} users</span>
                  </h4>
                  <div className="space-y-2">
                    {users.map((access, idx) => {
                      const RIcon = roleIcons[access.site_role] || Eye;
                      return (
                        <div key={idx} className="flex items-center gap-3 text-sm bg-zinc-50/40 rounded p-2">
                          <RIcon className="w-4 h-4 text-zinc-400" />
                          <span className="text-zinc-700 font-medium min-w-[150px]">{access.user_name}</span>
                          <span className="text-zinc-500 min-w-[200px]">{access.user_email}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            access.site_role === 'admin' ? 'bg-orange-500/20 text-orange-400' :
                            access.site_role === 'news_admin' ? 'bg-emerald-500/20 text-emerald-400' :
                            access.site_role === 'editor' ? 'bg-violet-500/20 text-violet-400' :
                            'bg-zinc-200 text-zinc-400'
                          }`}>
                            {roleLabels[access.site_role] || access.site_role}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function NetworkDashboard() {
  const { user, token, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [mainSites, setMainSites] = useState([]);
  const [availableFeatures, setAvailableFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showNewWizard, setShowNewWizard] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [editingSite, setEditingSite] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    enabled_features: [],
    site_type: 'radio',
    linked_main_site_id: ''
  });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, siteId: null, siteName: '' });
  const [healthCheck, setHealthCheck] = useState({ open: false, siteId: null, siteName: '', loading: false, result: null, history: [] });
  const [debugPanel, setDebugPanel] = useState({ open: false, siteId: null, siteName: '', loading: false, data: null });
  const [userAccessPanel, setUserAccessPanel] = useState({ open: false, loading: false, data: null });
  const [securityPanelOpen, setSecurityPanelOpen] = useState(false);
  const [rolesPanel, setRolesPanel] = useState({ open: false, siteId: null, siteName: '' });
  const [auditOpen, setAuditOpen] = useState(false);
  const [adminManagerOpen, setAdminManagerOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [activeSection, setActiveSection] = useState('sites'); // sidebar active section
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile sidebar
  const [expandedGroups, setExpandedGroups] = useState(['overview', 'management']);
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvId, setSelectedEnvId] = useState(null);
  const [setupWizard, setSetupWizard] = useState({ open: false, siteType: 'radio', siteName: '' });
  const [ztGuard, setZtGuard] = useState({ enabled: false, network_id: '', network_name: '', api_token_masked: '', loading: false });
  const [ztGuardForm, setZtGuardForm] = useState({ network_id: '', api_token: '' });
  const { startLoading, stopLoading } = useTopLoader();

  // Navigation groups matching MainSiteDashboardLayout pattern
  // System admins see all, environment admins see limited sections
  const isSystemAdmin = user?.is_system_admin === true;
  
  const NAV_GROUPS = [
    {
      id: 'overview',
      label: 'Overview',
      icon: Globe,
      items: [
        { id: 'sites', icon: Globe, label: 'Sites Overview' },
      ]
    },
    {
      id: 'management',
      label: 'Management',
      icon: Settings,
      items: [
        ...(isSystemAdmin ? [{ id: 'admins', icon: Crown, label: 'Network Admins' }] : []),
        { id: 'environments', icon: Server, label: 'Environments' },
        ...(isSystemAdmin ? [{ id: 'domains', icon: Globe, label: 'Domain Manager' }] : []),
        ...(isSystemAdmin ? [{ id: 'licenses', icon: Shield, label: 'License Manager' }] : []),
        ...(isSystemAdmin ? [{ id: 'notifications', icon: Bell, label: 'Notifications' }] : []),
        ...(isSystemAdmin ? [{ id: 'branding', icon: Paintbrush, label: 'Branding' }] : []),
        ...(isSystemAdmin ? [{ id: 'vdc-deploy', icon: Upload, label: 'Deploy to VDC' }] : []),
      ]
    },
    ...(isSystemAdmin ? [{
      id: 'debug',
      label: 'Debug & Audit',
      icon: Bug,
      items: [
        { id: 'audit', icon: ShieldAlert, label: 'Permission Audit' },
        { id: 'user-access', icon: UserCog, label: 'User Access' },
      ]
    }] : []),
    {
      id: 'support',
      label: 'Support',
      icon: LifeBuoy,
      items: [
        { id: 'support-tickets', icon: LifeBuoy, label: 'Support Tickets' },
      ]
    },
    {
      id: 'security',
      label: 'Security',
      icon: Shield,
      items: [
        { id: 'security', icon: Shield, label: 'Account Security' },
      ]
    },
    ...(isSystemAdmin ? [{
      id: 'external',
      label: 'External',
      icon: ExternalLink,
      items: [
        { id: 'backups', icon: HardDrive, label: 'Backups', link: '/backups' },
        { id: 'explorer', icon: Code, label: 'API Explorer', link: '/explorer' },
      ]
    }] : []),
  ];

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // Package definitions for the creation wizard
  const PACKAGES = [
    { type: 'radio', name: 'Radio', icon: Radio, color: 'orange', desc: 'Shows, Content, Streaming & RDS',
      features: ['shows', 'calendar', 'show_management', 'content_library', 'media_library', 'content_approval', 'trash', 'team_chat', 'rds_settings', 'rds_builder', 'rds_monitor', 'stream_monitor', 'call_studio', 'rundown', 'support_tickets', 'team_settings', 'firewall', 'activity_logs', 'wordpress'] },
    { type: 'task_scheduler', name: 'Tasks', icon: LayoutGrid, color: 'violet', desc: 'Kanban boards & task management',
      features: ['task_boards', 'team_settings', 'firewall', 'activity_logs'] },
    { type: 'server', name: 'Virtual Datacenter', icon: HardDrive, color: 'blue', desc: 'XML imports, vMix, Canva & Radioplayer',
      features: ['xml_imports', 'server_api_keys', 'vmix_director', 'canva_director', 'radioplayer', 'team_settings', 'firewall', 'activity_logs'] },
    { type: 'technical', name: 'Data Connection', icon: Network, color: 'emerald', desc: 'ZeroTier network integration',
      features: ['zerotier', 'team_settings', 'firewall', 'activity_logs'] },
    { type: 'external_host', name: 'External Host', icon: ExternalLink, color: 'cyan', desc: 'WordPress & content management',
      features: ['content_library', 'media_library', 'content_approval', 'trash', 'team_settings', 'firewall', 'wordpress', 'activity_logs'] },
    { type: 'wp_security', name: 'WP Security', icon: Shield, color: 'red', desc: 'WordPress firewall, WAF & brute force protection',
      features: ['wp_security_dashboard', 'wp_waf_rules', 'wp_ip_blocklist', 'wp_login_protection', 'team_settings', 'firewall', 'activity_logs'] },
  ];
  const PACKAGE_COLORS = { orange: 'bg-orange-500/20 border-orange-500/50 text-orange-400', violet: 'bg-violet-500/20 border-violet-500/50 text-violet-400', blue: 'bg-blue-500/20 border-blue-500/50 text-blue-400', emerald: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400', cyan: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400', red: 'bg-red-500/20 border-red-500/50 text-red-400' };
  const PACKAGE_ICON_COLORS = { orange: 'text-orange-400', violet: 'text-violet-400', blue: 'text-blue-400', emerald: 'text-emerald-400', cyan: 'text-cyan-400', red: 'text-red-400' };
  const SITE_TYPE_LABELS = { radio: 'Radio', task_scheduler: 'Tasks', server: 'Virtual Datacenter', technical: 'Data Connection', external_host: 'External Host', wp_security: 'WP Security' };
  const SITE_TYPE_BADGE = { radio: 'bg-orange-500/10 text-orange-400 border-orange-500/20', task_scheduler: 'bg-violet-500/10 text-violet-400 border-violet-500/20', server: 'bg-blue-500/10 text-blue-400 border-blue-500/20', technical: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', external_host: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', wp_security: 'bg-red-500/10 text-red-400 border-red-500/20' };

  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50);
  const slugExists = (slug) => mainSites.some(s => s.slug === slug);
  const openCreateWizard = () => {
    setShowNewWizard(true);
  };

  const RoleIcon = roleIcons[user?.role] || Network;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleViewMode = (mode) => {
    setViewMode(mode);
    fetch(`${API}/api/users/me/preferences`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ network_view_mode: mode })
    }).catch(() => {});
  };

  useEffect(() => {
    fetchMainSites();
    fetchFeatures();
    fetchEnvironments();
    fetchZtGuard();
    // Load view mode from preferences
    fetch(`${API}/api/users/me/preferences`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : {}).then(p => {
      if (p.network_view_mode) setViewMode(p.network_view_mode);
    }).catch(() => {});
  }, []);

  const fetchMainSites = async () => {
    startLoading();
    try {
      const res = await fetch(`${API}/api/main-sites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMainSites(data);
      }
    } catch (err) {
      console.error('Failed to fetch main sites:', err);
    } finally {
      setLoading(false);
      stopLoading();
    }
  };

  const fetchFeatures = async () => {
    try {
      const res = await fetch(`${API}/api/main-sites/features`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableFeatures(data.features);
      }
    } catch (err) {
      console.error('Failed to fetch features:', err);
    }
  };

  const fetchEnvironments = async () => {
    try {
      const res = await fetch(`${API}/api/environments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEnvironments(data);
        if (data.length > 0 && !selectedEnvId) {
          // Default to first environment (usually Production)
          const defaultEnv = data.find(e => e.is_default) || data[0];
          setSelectedEnvId(defaultEnv.id);
        }
      }
    } catch { /* noop */ }
  };

  const fetchZtGuard = async () => {
    if (!isSystemAdmin) return;
    try {
      const res = await fetch(`${API}/api/auth/zt-guard/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setZtGuard(prev => ({ ...prev, ...data }));
        setZtGuardForm({ network_id: data.network_id || '', api_token: '' });
      }
    } catch { /* noop */ }
  };

  const saveZtGuard = async (updates) => {
    setZtGuard(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`${API}/api/auth/zt-guard/config`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setZtGuard(prev => ({ ...prev, ...data, loading: false }));
        setZtGuardForm(prev => ({ ...prev, network_id: data.network_id || '', api_token: '' }));
        toast.success(updates.enabled !== undefined ? (updates.enabled ? 'ZeroTier Guard enabled' : 'ZeroTier Guard disabled') : 'ZeroTier Guard updated');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed to update ZeroTier Guard');
        setZtGuard(prev => ({ ...prev, loading: false }));
      }
    } catch {
      toast.error('Connection error');
      setZtGuard(prev => ({ ...prev, loading: false }));
    }
  };

  // Filter sites by selected environment
  const filteredSites = !selectedEnvId
    ? mainSites 
    : mainSites.filter(s => s.environment_id === selectedEnvId);


  const handleCreateSite = async () => {
    if (!formData.name || !formData.slug) {
      toast.error('Name and URL are required');
      return;
    }

    try {
      const pkg = PACKAGES.find(p => p.type === formData.site_type);
      const submitData = {
        ...formData,
        enabled_features: pkg ? pkg.features : formData.enabled_features,
      };
      if (!submitData.linked_main_site_id) delete submitData.linked_main_site_id;
      if (selectedEnvId) submitData.environment_id = selectedEnvId;

      const res = await fetch(`${API}/api/main-sites`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      });

      if (res.ok) {
        setShowCreateDialog(false);
        setSetupWizard({ open: true, siteType: formData.site_type || 'radio', siteName: formData.name });
        setFormData({ name: '', slug: '', enabled_features: [], site_type: 'radio', linked_main_site_id: '' });
        fetchMainSites();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to create main site');
      }
    } catch (err) {
      toast.error('Failed to create main site');
    }
  };

  const handleUpdateSite = async () => {
    if (!editingSite) return;

    try {
      const res = await fetch(`${API}/api/main-sites/${editingSite.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Main site updated successfully');
        setEditingSite(null);
        setFormData({ name: '', slug: '', enabled_features: [], site_type: 'radio', linked_main_site_id: '' });
        fetchMainSites();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to update main site');
      }
    } catch (err) {
      toast.error('Failed to update main site');
    }
  };

  const handleDeleteSite = async (siteId) => {
    try {
      const res = await fetch(`${API}/api/main-sites/${siteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Main site deleted');
        setDeleteDialog({ open: false, siteId: null, siteName: '' });
        fetchMainSites();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete main site');
      }
    } catch (err) {
      toast.error('Failed to delete main site');
    }
  };

  const handleDeleteClick = (siteId, siteName) => {
    setDeleteDialog({ open: true, siteId, siteName });
  };

  const openEditDialog = (site) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      slug: site.slug,
      description: site.description || '',
      enabled_features: site.enabled_features || [],
      logo_url: site.logo_url || '',
    });
  };

  const toggleFeature = (featureId) => {
    setFormData(prev => ({
      ...prev,
      enabled_features: prev.enabled_features.includes(featureId)
        ? prev.enabled_features.filter(f => f !== featureId)
        : [...prev.enabled_features, featureId]
    }));
  };

  const runHealthCheck = async (siteId, siteName) => {
    setHealthCheck({ open: true, siteId, siteName, loading: true, result: null, history: [] });
    try {
      const [checkRes, historyRes] = await Promise.all([
        fetch(`${API}/api/main-sites/${siteId}/health-check`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/api/main-sites/${siteId}/health-history?limit=10`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      const result = checkRes.ok ? await checkRes.json() : null;
      const history = historyRes.ok ? await historyRes.json() : [];
      setHealthCheck(prev => ({ ...prev, loading: false, result, history }));
    } catch (err) {
      toast.error('Health check failed');
      setHealthCheck(prev => ({ ...prev, loading: false }));
    }
  };

  const openDebugPanel = async (siteId, siteName) => {
    setDebugPanel({ open: true, siteId, siteName, loading: true, data: null });
    try {
      const res = await fetch(`${API}/api/main-sites/${siteId}/debug`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.ok ? await res.json() : null;
      setDebugPanel(prev => ({ ...prev, loading: false, data }));
    } catch (err) {
      toast.error('Failed to load debug info');
      setDebugPanel(prev => ({ ...prev, loading: false }));
    }
  };

  const refreshDebug = () => {
    if (debugPanel.siteId) openDebugPanel(debugPanel.siteId, debugPanel.siteName);
  };

  // Fetch all user access records
  const openUserAccessPanel = async () => {
    setUserAccessPanel({ open: true, loading: true, data: null });
    try {
      const res = await fetch(`${API}/api/main-sites/debug/all-user-access`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.ok ? await res.json() : null;
      setUserAccessPanel(prev => ({ ...prev, loading: false, data }));
    } catch (err) {
      toast.error('Failed to load user access info');
      setUserAccessPanel(prev => ({ ...prev, loading: false }));
    }
  };

  const groupedFeatures = availableFeatures.reduce((acc, feature) => {
    const group = feature.group || 'other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(feature);
    return acc;
  }, {});

  if (loading) {
    return null;
  }

  const flatNavItems = NAV_GROUPS.flatMap(g => g.items);

  return (
    <TooltipProvider delayDuration={0}>
    <div className="h-screen flex flex-col overflow-hidden bg-[#F0F0F2]" style={{ height: '100dvh' }}>

        <MaintenanceBanner />

        <NetworkHeader
          activePage="network"
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          environments={environments}
          selectedEnvId={selectedEnvId}
          onEnvChange={setSelectedEnvId}
        />

        {/* ─── Workspace Canvas ─── */}
        <WorkspaceCanvas>
          {activeSection === 'sites' ? (
            <>
              {/* Security Warning Banner */}
              {!user?.totp_enabled && (
                <div className="absolute top-3 left-3 right-3 z-20">
                  <div className="bg-amber-500/15 backdrop-blur-xl border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-amber-500/20 rounded-lg"><Shield className="w-4 h-4 text-amber-400" /></div>
                      <div>
                        <p className="text-amber-200 font-medium text-sm">Secure your account with 2FA</p>
                        <p className="text-amber-200/60 text-xs">Two-factor authentication is not yet set up.</p>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setActiveSection('security')} className="bg-amber-500 hover:bg-amber-600 text-black gap-1.5 text-xs">
                      <Shield className="w-3.5 h-3.5" />Setup 2FA
                    </Button>
                  </div>
                </div>
              )}
              <ServerRackView
                sites={filteredSites}
                onCreateSite={openCreateWizard}
                onEditSite={openEditDialog}
                onDeleteSite={handleDeleteClick}
                environments={environments}
                selectedEnvId={selectedEnvId}
                user={user}
              />
            </>
          ) : (
          <CanvasPanel position="main" scrollable testId="main-content-panel">
            <div className="p-2 sm:p-4">


          {/* ═══════════ NETWORK ADMINS ═══════════ */}
          {activeSection === 'admins' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <Crown className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Network Admins</div>
                  <div className="text-sm font-semibold text-zinc-700">Manage network administrator access and permissions</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <NetworkAdminManager open={true} onClose={() => setActiveSection('sites')} inline />
              </div>
            </div>
          )}

          {/* ═══════════ NOTIFICATIONS ═══════════ */}
          {activeSection === 'notifications' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <Bell className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Notifications</div>
                  <div className="text-sm font-semibold text-zinc-700">Configure email notifications per site and role</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <NotificationSettings open={true} onClose={() => setActiveSection('sites')} inline mainSites={mainSites} />
              </div>
            </div>
          )}

          {/* ═══════════ BRANDING ═══════════ */}
          {activeSection === 'branding' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <Paintbrush className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Branding</div>
                  <div className="text-sm font-semibold text-zinc-700">Customize platform name, logo, favicon, and login page</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <BrandingSettings />
              </div>
            </div>
          )}

          {/* ═══════════ VDC DEPLOY ═══════════ */}
          {activeSection === 'vdc-deploy' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <Upload className="w-5 h-5 text-zinc-700" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Deploy to VDC</div>
                  <div className="text-sm font-semibold text-zinc-700">Encrypted deployment to Koodh VDC</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <VDCDeployPanel />
              </div>
            </div>
          )}

          {/* ═══════════ LICENSE MANAGER ═══════════ */}
          {activeSection === 'licenses' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <Shield className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">License Manager</div>
                  <div className="text-sm font-semibold text-zinc-700">Manage license packages and site assignments</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <LicenseManager />
              </div>
            </div>
          )}

          {/* ═══════════ DOMAIN MANAGER ═══════════ */}
          {activeSection === 'domains' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <Globe className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Domain Manager</div>
                  <div className="text-sm font-semibold text-zinc-700">Manage domains, subdomain routing, and Cloudflare integration</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <DomainManager />
              </div>
            </div>
          )}

          {/* ═══════════ ENVIRONMENTS ═══════════ */}
          {activeSection === 'environments' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <Server className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Environments</div>
                  <div className="text-sm font-semibold text-zinc-700">Manage Clara environments, admins, and site assignments</div>
                </div>
                <div className="w-px h-8 bg-black/[0.06] mx-1" />
                <div className="text-3xl font-bold text-zinc-900">{environments.length}</div>
                <div className="text-sm text-zinc-500">Environments</div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <EnvironmentManager />
              </div>
            </div>
          )}


          {/* ═══════════ PERMISSION AUDIT ═══════════ */}
          {activeSection === 'audit' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Permission Audit</div>
                  <div className="text-sm font-semibold text-zinc-700">Audit and verify role permissions across all sites</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <PermissionAuditPanel token={token} onClose={() => setActiveSection('sites')} inline />
              </div>
            </div>
          )}

          {/* ═══════════ USER ACCESS DEBUG ═══════════ */}
          {activeSection === 'user-access' && (
            <div className="flex flex-col h-full gap-4">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4 flex-shrink-0">
                <UserCog className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">User Access</div>
                  <div className="text-sm font-semibold text-zinc-700">Debug and manage user access across all sites</div>
                </div>
              </motion.div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <UserAccessSection token={token} API={API} openUserAccessPanel={openUserAccessPanel} userAccessPanel={userAccessPanel} mainSites={mainSites} roleIcons={roleIcons} roleLabels={roleLabels} />
              </div>
            </div>
          )}

          {/* ═══════════ SUPPORT TICKETS ═══════════ */}
          {activeSection === 'support-tickets' && (
            <SupportTicketsPage inline token={token} onClose={() => setActiveSection('sites')} />
          )}

          {/* ═══════════ ACCOUNT SECURITY ═══════════ */}
          {activeSection === 'security' && (
            <div className="flex flex-col h-full gap-4">
              <div className="flex items-start justify-between flex-shrink-0">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                  className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4">
                  <Shield className="w-5 h-5 text-orange-500" />
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Account Security</div>
                    <div className="text-sm font-semibold text-zinc-700">Manage your two-factor authentication settings</div>
                  </div>
                  {user?.totp_enabled && (
                    <>
                      <div className="w-px h-8 bg-black/[0.06] mx-1" />
                      <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5" /> 2FA Active
                      </span>
                    </>
                  )}
                </motion.div>
              </div>
              <div className="flex-1 overflow-y-auto bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5">
                <Card className="bg-white border-zinc-200 max-w-lg">
                  <CardContent className="p-6">
                    <TwoFactorSetup user={user} onUpdate={refreshUser} />
                  </CardContent>
                </Card>

                {/* Zero Trust Posture — visible to network/system admins */}
                {(user?.is_network_admin || isSystemAdmin) && (
                  <div className="mt-8">
                    <ZeroTrustPanel token={token} />
                  </div>
                )}

                {/* ZeroTier Network Guard - System Admins Only */}
                {isSystemAdmin && (
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-base font-semibold flex items-center gap-2 text-zinc-800">
                          <Shield className="w-5 h-5 text-blue-500" />
                          ZeroTier Network Guard
                        </h2>
                        <p className="text-sm text-zinc-500 mt-0.5">Require network admins to be connected to a ZeroTier network before login</p>
                      </div>
                      <button
                        data-testid="zt-guard-toggle"
                        onClick={() => saveZtGuard({ enabled: !ztGuard.enabled })}
                        disabled={ztGuard.loading || (!ztGuard.network_id && !ztGuard.enabled)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${ztGuard.enabled ? 'bg-blue-600' : 'bg-zinc-300'} ${(!ztGuard.network_id && !ztGuard.enabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${ztGuard.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    <Card className="bg-white border-zinc-200 max-w-lg" data-testid="zt-guard-config">
                      <CardContent className="p-5 space-y-4">
                        {ztGuard.enabled && (
                          <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                            <Shield className="w-3.5 h-3.5" />
                            Guard is active. Network admins must be on the ZeroTier network to log in.
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-xs text-zinc-500 font-medium">Network ID</label>
                          <div className="flex gap-2">
                            <Input
                              data-testid="zt-guard-network-id"
                              placeholder="e.g. a8b4c2d6e1f09876"
                              value={ztGuardForm.network_id}
                              onChange={(e) => setZtGuardForm(prev => ({ ...prev, network_id: e.target.value }))}
                              className="bg-zinc-50 border-zinc-200 font-mono text-sm"
                            />
                          </div>
                          {ztGuard.network_name && (
                            <p className="text-xs text-zinc-500">Network: {ztGuard.network_name}</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs text-zinc-500 font-medium">API Token</label>
                          <Input
                            data-testid="zt-guard-api-token"
                            type="password"
                            placeholder={ztGuard.api_token_masked || "ZeroTier Central API token"}
                            value={ztGuardForm.api_token}
                            onChange={(e) => setZtGuardForm(prev => ({ ...prev, api_token: e.target.value }))}
                            className="bg-zinc-50 border-zinc-200 font-mono text-sm"
                          />
                          {ztGuard.api_token_masked && !ztGuardForm.api_token && (
                            <p className="text-xs text-zinc-500">Current: {ztGuard.api_token_masked}</p>
                          )}
                        </div>

                        <Button
                          data-testid="zt-guard-save"
                          onClick={() => {
                            const updates = {};
                            if (ztGuardForm.network_id) updates.network_id = ztGuardForm.network_id;
                            if (ztGuardForm.api_token) updates.api_token = ztGuardForm.api_token;
                            if (Object.keys(updates).length === 0) {
                              toast.info('No changes to save');
                              return;
                            }
                            saveZtGuard(updates);
                          }}
                          disabled={ztGuard.loading}
                          variant="outline"
                          className="w-full bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                        >
                          Save Configuration
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
          </CanvasPanel>
          )}
          </WorkspaceCanvas>

      {/* Edit Site Wizard */}
      <EditMainSiteWizard
        open={!!editingSite}
        onClose={() => setEditingSite(null)}
        site={editingSite}
        onUpdated={fetchMainSites}
      />

      {/* Create Dialog (old fallback - kept for non-wizard create) */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setCreateStep(0);
          setFormData({ name: '', slug: '', enabled_features: [], site_type: 'radio' });
        }
      }}>
        <DialogContent className="bg-white border-zinc-200 max-w-lg max-h-[90vh] overflow-y-auto shadow-[0_8px_40px_rgba(0,0,0,0.1)]">
          <DialogHeader>
            <DialogTitle>Create Main Site</DialogTitle>
          </DialogHeader>

            /* Create wizard */
            <div className="space-y-4 py-2">
              {/* Step indicator */}
              <div className="flex items-center gap-1">
                {['Name', 'Package', 'Confirm'].map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      i < createStep ? 'bg-emerald-500/20 text-emerald-400' :
                      i === createStep ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' :
                      'bg-zinc-100 text-zinc-500'
                    }`}>
                      {i < createStep ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                      <span>{s}</span>
                    </div>
                    {i < 2 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
                  </div>
                ))}
              </div>

              {/* Step 0: Name */}
              {createStep === 0 && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">Choose a name for your new main site. The URL slug is generated automatically.</p>
                  <div className="space-y-2">
                    <Label>Site Name</Label>
                    <Input value={formData.name} onChange={(e) => { const name = e.target.value; setFormData(p => ({ ...p, name, slug: autoSlug(name) })); }}
                      placeholder="e.g. Radiogroup MFY/GRK" className="bg-zinc-50 border-zinc-200" autoFocus data-testid="create-site-name-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>URL Slug</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500 text-sm">/</span>
                      <Input value={formData.slug} onChange={(e) => setFormData(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                        className="bg-zinc-50 border-zinc-200 font-mono" data-testid="create-site-slug-input" />
                    </div>
                    {formData.slug && slugExists(formData.slug) && (
                      <p className="text-xs text-red-400">This slug is already in use</p>
                    )}
                  </div>
                  <Button onClick={() => setCreateStep(1)} disabled={!formData.name || !formData.slug || slugExists(formData.slug)} className="w-full" data-testid="create-step-next">
                    Next — Choose Package
                  </Button>
                </div>
              )}

              {/* Step 1: Package selection */}
              {createStep === 1 && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">Select the Clara package for this site. Each package includes a pre-configured set of features.</p>
                  <div className="space-y-2">
                    {PACKAGES.map(pkg => (
                      <button key={pkg.type} data-testid={`package-${pkg.type}`}
                        onClick={() => setFormData(p => ({ ...p, site_type: pkg.type, enabled_features: pkg.features }))}
                        className={`w-full flex items-center gap-4 p-3 rounded-lg border text-left transition-all ${
                          formData.site_type === pkg.type ? `${PACKAGE_COLORS[pkg.color]} border-2` : 'bg-zinc-100/50 border-zinc-300 hover:border-zinc-600'
                        }`}>
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${formData.site_type === pkg.type ? 'bg-white/10' : 'bg-zinc-700/50'}`}>
                          <pkg.icon className={`w-5 h-5 ${formData.site_type === pkg.type ? PACKAGE_ICON_COLORS[pkg.color] : 'text-zinc-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-100">Clara {pkg.name}</div>
                          <div className="text-[10px] text-zinc-500">{pkg.desc}</div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          formData.site_type === pkg.type ? 'border-current' : 'border-zinc-600'
                        }`}>
                          {formData.site_type === pkg.type && <div className="w-2 h-2 rounded-full bg-current" />}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Linked Main Site for Virtual Datacenter */}
                  {formData.site_type === 'server' && (
                    <div className="space-y-2">
                      <Label>Linked Main Site</Label>
                      <p className="text-[10px] text-zinc-500">Select the main site this Virtual Datacenter belongs to</p>
                      <select value={formData.linked_main_site_id || ''} onChange={e => setFormData(p => ({ ...p, linked_main_site_id: e.target.value }))}
                        className="w-full h-10 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 px-3 text-sm" data-testid="linked-main-site-select">
                        <option value="">-- Select main site --</option>
                        {mainSites.filter(s => s.site_type === 'radio').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCreateStep(0)} className="flex-1">Back</Button>
                    <Button onClick={() => setCreateStep(2)} className="flex-1" data-testid="create-step-confirm">Next — Confirm</Button>
                  </div>
                </div>
              )}

              {/* Step 2: Confirm */}
              {createStep === 2 && (
                <div className="space-y-4">
                  {(() => { const pkg = PACKAGES.find(p => p.type === formData.site_type); return (
                    <div className="bg-zinc-50/60 rounded-lg p-4 border border-zinc-300 space-y-3">
                      <div className="flex items-center gap-3">
                        {pkg && <pkg.icon className={`w-6 h-6 ${PACKAGE_ICON_COLORS[pkg.color]}`} />}
                        <div>
                          <p className="text-sm font-medium text-zinc-100">{formData.name}</p>
                          <p className="text-xs font-mono text-zinc-500">/{formData.slug}</p>
                        </div>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${SITE_TYPE_BADGE[formData.site_type] || 'bg-zinc-100 text-zinc-400 border-zinc-300'}`}>
                          {SITE_TYPE_LABELS[formData.site_type] || formData.site_type}
                        </span>
                      </div>
                      <div className="border-t border-zinc-300 pt-3">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Included Features</p>
                        <div className="flex flex-wrap gap-1">
                          {(pkg?.features || []).map(f => (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400">{f.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-600">Features can be customized later via CLI: /disconnect configuration</p>
                    </div>
                  ); })()}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCreateStep(1)} className="flex-1">Back</Button>
                    <Button onClick={handleCreateSite} className="flex-1" data-testid="create-site-confirm-btn">Create Main Site</Button>
                  </div>
                </div>
              )}
            </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, siteId: null, siteName: '' })}>
        <AlertDialogContent className="bg-white border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Main Site</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{deleteDialog.siteName}"? This will also delete all associated mini-sites and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleDeleteSite(deleteDialog.siteId)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Health Check Panel */}
      <Dialog open={healthCheck.open} onOpenChange={(open) => !open && setHealthCheck({ open: false, siteId: null, siteName: '', loading: false, result: null, history: [] })}>
        <DialogContent className="bg-white border-zinc-200 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-500" />
              Health Check — {healthCheck.siteName}
            </DialogTitle>
          </DialogHeader>
          
          {healthCheck.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              <span className="ml-3 text-zinc-400">Running tests...</span>
            </div>
          ) : healthCheck.result ? (
            <div className="space-y-4">
              {/* Overall Status */}
              <div className={`flex items-center gap-3 p-4 rounded-lg ${
                healthCheck.result.overall_status === 'ok' ? 'bg-emerald-500/10' :
                healthCheck.result.overall_status === 'error' ? 'bg-red-500/10' : 'bg-amber-500/10'
              }`}>
                {healthCheck.result.overall_status === 'ok' ? (
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                ) : healthCheck.result.overall_status === 'error' ? (
                  <X className="w-6 h-6 text-red-500" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                )}
                <div>
                  <p className="font-semibold text-zinc-900">
                    {healthCheck.result.overall_status === 'ok' ? 'All OK' :
                     healthCheck.result.overall_status === 'error' ? 'Errors Found' : 'Warnings'}
                  </p>
                  <p className="text-xs text-zinc-400">{healthCheck.result.timestamp?.slice(0, 19)}</p>
                </div>
              </div>
              
              {/* Individual Checks */}
              <div className="space-y-2">
                {healthCheck.result.checks?.map((check, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50/60 rounded-lg">
                    {check.status === 'ok' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : check.status === 'error' ? (
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                    ) : check.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{check.name}</p>
                      <p className="text-xs text-zinc-400">{check.message}</p>
                    </div>
                    {check.count !== undefined && (
                      <span className="text-sm font-mono text-zinc-600">{check.count}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Team IDs resolved */}
              <div className="text-xs text-zinc-500 p-2 bg-zinc-50/40 rounded">
                Team IDs searched: {healthCheck.result.team_ids_resolved?.length || 0}
              </div>

              {/* History */}
              {healthCheck.history?.length > 1 && (
                <div className="pt-2">
                  <p className="text-xs text-zinc-500 mb-2">Previous checks</p>
                  <div className="space-y-1">
                    {healthCheck.history.slice(1, 6).map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                        {h.overall_status === 'ok' ? (
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                        <span>{h.timestamp?.slice(0, 19)}</span>
                        <span className="text-zinc-600">—</span>
                        <span>{h.checks?.filter(c => c.status === 'ok').length}/{h.checks?.length} OK</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-8">No results</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Debug Panel */}
      <Dialog open={debugPanel.open} onOpenChange={(open) => !open && setDebugPanel({ open: false, siteId: null, siteName: '', loading: false, data: null })}>
        <DialogContent className="bg-white border-zinc-200 max-w-4xl max-h-[90vh] overflow-y-auto shadow-[0_8px_40px_rgba(0,0,0,0.1)]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-violet-400" />
                Debug — {debugPanel.siteName}
              </DialogTitle>
              <Button variant="ghost" size="sm" onClick={refreshDebug} className="gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Refresh
              </Button>
            </div>
          </DialogHeader>
          
          {debugPanel.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              <span className="ml-3 text-zinc-400">Loading debug info...</span>
            </div>
          ) : debugPanel.data ? (
            <DebugContent data={debugPanel.data} />
          ) : (
            <p className="text-zinc-500 text-center py-8">No data</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Roles Manager Panel - remains as dialog (per-site action) */}
      {rolesPanel.open && (
        <RolesManager
          mainSiteId={rolesPanel.siteId}
          mainSiteName={rolesPanel.siteName}
          token={token}
          onClose={() => setRolesPanel({ open: false, siteId: null, siteName: '' })}
        />
      )}

      {/* Setup Wizard - shown after creating a new site */}
      <SetupWizard
        open={setupWizard.open}
        onClose={() => setSetupWizard({ open: false, siteType: 'radio', siteName: '' })}
        siteType={setupWizard.siteType}
        siteName={setupWizard.siteName}
      />

      {/* New Create Main Site Wizard */}
      <CreateMainSiteWizard
        open={showNewWizard}
        onClose={() => setShowNewWizard(false)}
        onCreated={fetchMainSites}
        token={token}
        environments={environments}
        selectedEnvId={selectedEnvId}
      />

      </div>
    </TooltipProvider>
  );
}
