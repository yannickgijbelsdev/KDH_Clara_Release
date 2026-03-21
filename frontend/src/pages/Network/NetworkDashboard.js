import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTopLoader } from '../../components/TopLoader';
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
  HardDrive, Monitor, LayoutGrid, List, Wrench, Bell, Menu, ChevronRight, User, Paintbrush, Server, Palette, Check
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
import LicenseManager from './LicenseManager';
import DomainManager from './DomainManager';
import EnvironmentManager from './EnvironmentManager';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from '../../utils/avatar';
import { BrandLogo } from '../../components/BrandLogo';

const API = process.env.REACT_APP_BACKEND_URL;

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
    <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/80 transition"
      >
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-medium text-white flex-1 text-left">{title}</span>
        {count !== undefined && <span className="text-xs text-zinc-500 font-mono">{count}</span>}
        {expandedSections[id] ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {expandedSections[id] && <div className="px-3 pb-3">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header info */}
      <div className="flex items-center gap-4 p-3 bg-zinc-800/30 rounded-lg text-xs text-zinc-400">
        <span><Clock className="w-3 h-3 inline mr-1" />{data.brussels_time}</span>
        <span>Team IDs: {data.team_ids_resolved?.length || 0}</span>
        <span>Sites: {data.child_sites?.length || 0}</span>
      </div>

      {/* Today's Shows */}
      <Section id="shows" title="Shows Today" icon={Tv} color="text-orange-400" count={data.todays_shows?.length || 0}>
        {data.todays_shows?.length > 0 ? (
          <div className="space-y-1">
            {data.todays_shows.map((show, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${show.is_live ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-800/50'}`}>
                {show.is_live && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                <span className="text-white font-medium">{show.title}</span>
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
                <span className="text-zinc-300">{t.action}</span>
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
              <div key={i} className={`text-xs p-2 rounded ${log.status === 'success' ? 'bg-emerald-500/10' : log.status === 'no_show' ? 'bg-zinc-800/50' : 'bg-red-500/10'}`}>
                <div className="flex justify-between">
                  <span className={`font-medium ${log.status === 'success' ? 'text-emerald-400' : log.status === 'no_show' ? 'text-amber-400' : 'text-red-400'}`}>
                    {log.status}
                  </span>
                  <span className="text-zinc-500">{log.timestamp?.slice(11, 19)}</span>
                </div>
                <p className="text-zinc-400 mt-0.5">{log.message}</p>
                {log.show_title && <p className="text-zinc-300 mt-0.5">{log.show_title}</p>}
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
              <div key={i} className="text-xs p-2 bg-zinc-800/50 rounded">
                <span className="text-white">{r.show_title}</span>
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
                <span className="text-zinc-300 truncate">{log.title || log.current_song}</span>
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
              <div key={i} className="text-xs p-1.5 flex items-center gap-2 border-b border-zinc-800/50 last:border-0">
                <span className="text-zinc-500 w-14 flex-shrink-0">{log.timestamp?.slice(11, 19)}</span>
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">{log.category}</span>
                <span className="text-zinc-300">{log.action}</span>
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
              <span className="text-zinc-300">{s.name}</span>
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
      } catch {} finally { setLoading(false); }
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
          <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4"><div className="text-2xl font-bold text-white">{data.total_users}</div><div className="text-xs text-zinc-400">Total Users</div></CardContent></Card>
          <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4"><div className="text-2xl font-bold text-white">{data.total_main_sites}</div><div className="text-xs text-zinc-400">Main Sites</div></CardContent></Card>
          <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4"><div className="text-2xl font-bold text-white">{data.total_access_records}</div><div className="text-xs text-zinc-400">Access Records</div></CardContent></Card>
        </div>
        {data.users_without_site_access?.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <h3 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Users WITHOUT site access ({data.users_without_site_access.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.users_without_site_access.map((u, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm bg-zinc-800/50 rounded p-2">
                  <span className="text-white font-medium">{u.user_name}</span>
                  <span className="text-zinc-500">{u.user_email}</span>
                  <span className="text-xs bg-zinc-700 px-2 py-0.5 rounded">{u.user_global_role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h3 className="text-white font-semibold mb-3">Access per Main Site</h3>
          <div className="space-y-4">
            {Object.entries(data.access_by_site || {}).map(([siteName, users]) => (
              <Card key={siteName} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4">
                  <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" />
                    {siteName}
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{users.length} users</span>
                  </h4>
                  <div className="space-y-2">
                    {users.map((access, idx) => {
                      const RIcon = roleIcons[access.site_role] || Eye;
                      return (
                        <div key={idx} className="flex items-center gap-3 text-sm bg-zinc-800/30 rounded p-2">
                          <RIcon className="w-4 h-4 text-zinc-400" />
                          <span className="text-white font-medium min-w-[150px]">{access.user_name}</span>
                          <span className="text-zinc-500 min-w-[200px]">{access.user_email}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            access.site_role === 'admin' ? 'bg-orange-500/20 text-orange-400' :
                            access.site_role === 'news_admin' ? 'bg-emerald-500/20 text-emerald-400' :
                            access.site_role === 'editor' ? 'bg-violet-500/20 text-violet-400' :
                            'bg-zinc-700 text-zinc-400'
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
  ];
  const PACKAGE_COLORS = { orange: 'bg-orange-500/20 border-orange-500/50 text-orange-400', violet: 'bg-violet-500/20 border-violet-500/50 text-violet-400', blue: 'bg-blue-500/20 border-blue-500/50 text-blue-400', emerald: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400', cyan: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' };
  const PACKAGE_ICON_COLORS = { orange: 'text-orange-400', violet: 'text-violet-400', blue: 'text-blue-400', emerald: 'text-emerald-400', cyan: 'text-cyan-400' };
  const SITE_TYPE_LABELS = { radio: 'Radio', task_scheduler: 'Tasks', server: 'Virtual Datacenter', technical: 'Data Connection', external_host: 'External Host' };
  const SITE_TYPE_BADGE = { radio: 'bg-orange-500/10 text-orange-400 border-orange-500/20', task_scheduler: 'bg-violet-500/10 text-violet-400 border-violet-500/20', server: 'bg-blue-500/10 text-blue-400 border-blue-500/20', technical: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', external_host: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' };

  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50);
  const slugExists = (slug) => mainSites.some(s => s.slug === slug);
  const openCreateWizard = () => {
    setCreateStep(0);
    setFormData({ name: '', slug: '', enabled_features: [], site_type: 'radio', linked_main_site_id: '' });
    setShowCreateDialog(true);
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
    } catch {}
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
      enabled_features: site.enabled_features || []
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

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-500 rounded-lg">
              <span className="text-white font-black text-sm">C</span>
            </div>
            <BrandLogo className="text-lg font-bold text-white" imgClass="h-6 object-contain" />
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
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-full z-50 w-56 flex-col py-6 glass border-r border-white/10 transition-all duration-300">
        {/* Logo */}
        <div className="mb-6 px-4">
          <BrandLogo className="text-white font-black text-base" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
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
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;

                  // External links
                  if (item.link) {
                    return (
                      <Link
                        key={item.id}
                        to={item.link}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        data-testid={`sidebar-${item.id}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-orange-500/10 text-orange-500'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                      }`}
                      data-testid={`sidebar-${item.id}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </nav>

        {/* User Avatar at Bottom */}
        <div className="mt-auto pt-4 px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                data-testid="user-menu-trigger"
                className="w-full justify-start gap-3 px-3 h-12 rounded-xl hover:bg-orange-500/10"
              >
                {getAvatarUrl(user) ? (
                  <img 
                    src={getAvatarUrl(user)}
                    alt={user?.name}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{user?.is_network_admin ? 'Network Admin' : roleLabels[user?.role]}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56 bg-[#18181b] border-zinc-800 ml-2">
              <div className="px-3 py-2 flex items-center gap-3">
                {getAvatarUrl(user) ? (
                  <img 
                    src={getAvatarUrl(user)}
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
                {user?.is_network_admin ? 'Network Admin' : roleLabels[user?.role]}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem onClick={handleLogout} className="text-orange-500 focus:text-orange-500 focus:bg-orange-500/10">
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
          lg:hidden fixed top-0 left-0 h-full z-50 glass
          w-64 transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-6 pt-4 h-full flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-500 rounded-lg">
                <span className="text-white font-black text-sm">C</span>
              </div>
              <BrandLogo className="text-lg font-bold text-white" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <nav className="space-y-1">
              {NAV_GROUPS.flatMap(g => g.items).filter(i => !i.link).map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                      ${isActive
                        ? 'bg-orange-500/20 text-orange-500'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
              {/* External links in mobile */}
              <Link to="/backups" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5">
                <HardDrive className="w-5 h-5" />
                <span className="font-medium">Backups</span>
              </Link>
              <Link to="/explorer" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5">
                <Code className="w-5 h-5" />
                <span className="font-medium">API Explorer</span>
              </Link>
            </nav>
          </div>

          <div className="pt-4 border-t border-white/10 mt-4">
            <div className="flex items-center gap-3 p-3">
              {getAvatarUrl(user) ? (
                <img src={getAvatarUrl(user)} alt={user?.name} className="w-10 h-10 rounded-full object-cover" />
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
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2 text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 mt-2">
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-56 min-h-screen pt-16 lg:pt-0 transition-all duration-300">
        {/* Page Header - matches MainSiteDashboardLayout exactly */}
        <div className="hidden lg:block border-b border-white/5 bg-[#09090b]/80 backdrop-blur-sm sticky top-0 z-30">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-white">Network Management</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-yellow-500/15 text-yellow-400 border-yellow-500/25">Global</span>
                {environments.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-zinc-700 bg-zinc-800/50" data-testid="env-switcher">
                        <Server className="w-3 h-3" />
                        {environments.find(e => e.id === selectedEnvId)?.name || 'Select Environment'}
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700">
                      {environments.map(env => (
                        <DropdownMenuItem key={env.id} onClick={() => setSelectedEnvId(env.id)} className={selectedEnvId === env.id ? 'bg-zinc-800' : ''}>
                          <div className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: env.color || '#3b82f6' }} />
                          {env.name}
                          <span className="ml-auto text-xs text-zinc-500">{env.site_count || 0}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-zinc-500 flex items-center gap-1 justify-end">
                  <RoleIcon className="w-3 h-3" />
                  {user?.is_network_admin ? 'Network Admin' : roleLabels[user?.role]}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">

          {/* Security Warning Banner */}
          {!user?.totp_enabled && activeSection === 'sites' && (
            <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Shield className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-amber-200 font-medium">Secure your account with 2FA</p>
                  <p className="text-amber-200/70 text-sm">Two-factor authentication is not yet set up.</p>
                </div>
              </div>
              <Button 
                onClick={() => setActiveSection('security')}
                className="bg-amber-500 hover:bg-amber-600 text-black gap-2"
              >
                <Shield className="w-4 h-4" />
                Setup 2FA
              </Button>
            </div>
          )}

          {/* ═══════════ SITES OVERVIEW ═══════════ */}
          {activeSection === 'sites' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-white">Sites Overview</h1>
                  <p className="text-sm text-zinc-400">{filteredSites.length} main sites in {environments.find(e => e.id === selectedEnvId)?.name || 'environment'}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
                    <Button
                      variant="ghost" size="icon"
                      className={`w-8 h-8 rounded-md ${viewMode === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      onClick={() => toggleViewMode('grid')}
                      data-testid="view-mode-grid"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className={`w-8 h-8 rounded-md ${viewMode === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      onClick={() => toggleViewMode('list')}
                      data-testid="view-mode-list"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button onClick={openCreateWizard} className="gap-2" data-testid="create-site-btn">
                    <Plus className="w-4 h-4" />
                    New Main Site
                  </Button>
                </div>
              </div>

              {/* Sites Content */}
              {filteredSites.length === 0 ? (
          <div className="space-y-6">
            {/* Empty State */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Globe className="w-16 h-16 text-zinc-600 mb-4" />
                <h3 className="text-xl font-semibold text-zinc-300 mb-2">No Main Sites Yet</h3>
                <p className="text-zinc-500 mb-6">Use the Migration Tool below to migrate your existing data, or create a new main site</p>
                <Button onClick={openCreateWizard} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Main Site
                </Button>
              </CardContent>
            </Card>
            
            {/* Migration Tool - always visible */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <MigrationTool />
            </div>
          </div>
        ) : (
          <>
          <div className={viewMode === 'grid' ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {filteredSites.map(site => viewMode === 'list' ? (
              <Card key={site.id} className={`transition-colors ${site.cloned_from ? 'bg-blue-950/30 border-blue-500/30 hover:border-blue-500/50' : site.site_type === 'technical' ? 'bg-emerald-950/30 border-emerald-500/30 hover:border-emerald-500/50' : site.site_type === 'server' ? 'bg-blue-950/30 border-blue-500/30 hover:border-blue-500/50' : site.site_type === 'task_scheduler' ? 'bg-violet-950/30 border-violet-500/30 hover:border-violet-500/50' : site.site_type === 'external_host' ? 'bg-cyan-950/30 border-cyan-500/30 hover:border-cyan-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                <CardContent className="flex items-center gap-4 p-4">
                  <Link to={`/${site.slug}`} className="flex items-center gap-3 flex-1 min-w-0">
                    {site.logo_url ? (
                      <img src={site.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${site.cloned_from ? 'bg-blue-500/10' : site.site_type === 'technical' ? 'bg-emerald-500/10' : site.site_type === 'server' ? 'bg-blue-500/10' : site.site_type === 'task_scheduler' ? 'bg-violet-500/10' : site.site_type === 'external_host' ? 'bg-cyan-500/10' : 'bg-zinc-800'}`}>
                        {site.cloned_from ? <Layers className="w-5 h-5 text-blue-400" /> : site.site_type === 'technical' ? <Wrench className="w-5 h-5 text-emerald-400" /> : site.site_type === 'server' ? <HardDrive className="w-5 h-5 text-blue-400" /> : site.site_type === 'task_scheduler' ? <LayoutGrid className="w-5 h-5 text-violet-400" /> : site.site_type === 'external_host' ? <ExternalLink className="w-5 h-5 text-cyan-400" /> : <Globe className="w-5 h-5 text-zinc-500" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{site.name}</span>
                        {site.cloned_from && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20 flex-shrink-0">Clone</span>
                        )}
                        {site.site_type === 'technical' && !site.cloned_from && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">Data Connection</span>
                        )}
                        {site.site_type === 'server' && !site.cloned_from && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">Virtual Datacenter</span>
                        )}
                        {site.site_type === 'task_scheduler' && !site.cloned_from && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 flex-shrink-0">Tasks</span>
                        )}
                        {site.site_type === 'external_host' && !site.cloned_from && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex-shrink-0">External Host</span>
                        )}
                        {(!site.site_type || site.site_type === 'radio') && !site.cloned_from && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 flex-shrink-0">Radio</span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">/{site.slug}</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-4 text-xs text-zinc-500 flex-shrink-0">
                    <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{site.site_count}</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{site.user_count}</span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEditDialog(site)}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className={`w-8 h-8 ${site.site_type === 'technical' ? 'opacity-10 pointer-events-none' : ''}`} disabled={site.site_type === 'technical'} onClick={() => runHealthCheck(site.id, site.name)}><Activity className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className={`w-8 h-8 ${site.site_type === 'technical' ? 'opacity-10 pointer-events-none' : ''}`} disabled={site.site_type === 'technical'} onClick={() => setRolesPanel({ open: true, siteId: site.id, siteName: site.name })}><UserCog className="w-3.5 h-3.5" /></Button>
                    <Link to={`/${site.slug}`}><Button variant="ghost" size="icon" className="w-8 h-8"><ExternalLink className="w-3.5 h-3.5" /></Button></Link>
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => handleDeleteClick(site.id, site.name)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={site.id} className={`transition-colors ${site.cloned_from ? 'bg-blue-950/30 border-blue-500/30 hover:border-blue-500/50' : site.site_type === 'technical' ? 'bg-emerald-950/30 border-emerald-500/30 hover:border-emerald-500/50' : site.site_type === 'server' ? 'bg-blue-950/30 border-blue-500/30 hover:border-blue-500/50' : site.site_type === 'task_scheduler' ? 'bg-violet-950/30 border-violet-500/30 hover:border-violet-500/50' : site.site_type === 'external_host' ? 'bg-cyan-950/30 border-cyan-500/30 hover:border-cyan-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {site.logo_url ? (
                        <img src={site.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${site.cloned_from ? 'bg-blue-500/10' : site.site_type === 'technical' ? 'bg-emerald-500/10' : site.site_type === 'server' ? 'bg-blue-500/10' : site.site_type === 'task_scheduler' ? 'bg-violet-500/10' : site.site_type === 'external_host' ? 'bg-cyan-500/10' : 'bg-zinc-800'}`}>
                          {site.cloned_from ? <Layers className="w-5 h-5 text-blue-400" /> : site.site_type === 'technical' ? <Wrench className="w-5 h-5 text-emerald-400" /> : site.site_type === 'server' ? <HardDrive className="w-5 h-5 text-blue-400" /> : site.site_type === 'task_scheduler' ? <LayoutGrid className="w-5 h-5 text-violet-400" /> : site.site_type === 'external_host' ? <ExternalLink className="w-5 h-5 text-cyan-400" /> : <Globe className="w-5 h-5 text-zinc-500" />}
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {site.name}
                          {site.cloned_from && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20 font-normal">Clone</span>
                          )}
                          {site.site_type === 'technical' && !site.cloned_from && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
                              Data Connection
                            </span>
                          )}
                          {site.site_type === 'server' && !site.cloned_from && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-normal">
                              Virtual Datacenter
                            </span>
                          )}
                          {site.site_type === 'task_scheduler' && !site.cloned_from && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-normal">
                              Tasks
                            </span>
                          )}
                          {site.site_type === 'external_host' && !site.cloned_from && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-normal">
                              External Host
                            </span>
                          )}
                          {(!site.site_type || site.site_type === 'radio') && !site.cloned_from && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-normal">
                              Radio
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-zinc-500">/{site.slug}</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(site)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(site.id, site.name)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {site.description && (
                    <p className="text-sm text-zinc-400 mb-4">{site.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-zinc-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Layers className="w-4 h-4" />
                      {site.site_count} sites
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {site.user_count} users
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {(site.site_type === 'technical'
                      ? (site.enabled_features || []).filter(f => f === 'team_settings' || f === 'zerotier')
                      : (site.enabled_features || []).filter(f => f !== 'zerotier').slice(0, 5)
                    ).map(f => (
                      <span key={f} className="px-2 py-0.5 text-xs bg-zinc-800 rounded-full text-zinc-400">
                        {f}
                      </span>
                    ))}
                    {site.site_type !== 'technical' && site.enabled_features?.filter(f => f !== 'zerotier').length > 5 && (
                      <span className="px-2 py-0.5 text-xs bg-zinc-800 rounded-full text-zinc-400">
                        +{site.enabled_features.filter(f => f !== 'zerotier').length - 5} more
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {site.site_type === 'technical' ? (
                      <>
                        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs opacity-30 cursor-not-allowed" disabled>
                          <Activity className="w-3.5 h-3.5" /> Test
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs opacity-30 cursor-not-allowed" disabled>
                          <Bug className="w-3.5 h-3.5" /> Debug
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs opacity-30 cursor-not-allowed" disabled>
                          <BarChart3 className="w-3.5 h-3.5" /> Stats
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs opacity-30 cursor-not-allowed" disabled>
                          <UserCog className="w-3.5 h-3.5" /> Roles
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5 text-xs"
                          data-testid={`health-check-${site.slug}`}
                          onClick={() => runHealthCheck(site.id, site.name)}
                        >
                          <Activity className="w-3.5 h-3.5" />
                          Test
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5 text-xs"
                          data-testid={`debug-${site.slug}`}
                          onClick={() => openDebugPanel(site.id, site.name)}
                        >
                          <Bug className="w-3.5 h-3.5" />
                          Debug
                        </Button>
                        <Link to={`/statistics/${site.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            data-testid={`statistics-${site.slug}`}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            Stats
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5 text-xs"
                          data-testid={`roles-${site.slug}`}
                          onClick={() => setRolesPanel({ open: true, siteId: site.id, siteName: site.name })}
                        >
                          <UserCog className="w-3.5 h-3.5" />
                          Roles
                        </Button>
                      </>
                    )}
                  </div>
                  <Link to={`/${site.slug}`}>
                    <Button variant="outline" className="w-full gap-2 mt-2">
                      <ExternalLink className="w-4 h-4" />
                      Open Dashboard
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
            
            {/* Migration Tool Card */}
            <MigrationTool />
          </div>

          </>
        )}
            </>
          )}

          {/* ═══════════ NETWORK ADMINS ═══════════ */}
          {activeSection === 'admins' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Network Admins</h1>
                  <p className="text-sm text-zinc-400">Manage network administrator access and permissions</p>
                </div>
              </div>
              <NetworkAdminManager open={true} onClose={() => setActiveSection('sites')} inline />
            </div>
          )}

          {/* ═══════════ NOTIFICATIONS ═══════════ */}
          {activeSection === 'notifications' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Notifications</h1>
                  <p className="text-sm text-zinc-400">Configure email notifications per site and role</p>
                </div>
              </div>
              <NotificationSettings open={true} onClose={() => setActiveSection('sites')} inline mainSites={mainSites} />
            </div>
          )}

          {/* ═══════════ BRANDING ═══════════ */}
          {activeSection === 'branding' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Branding</h1>
                  <p className="text-sm text-zinc-400">Customize platform name, logo, favicon, and login page</p>
                </div>
              </div>
              <BrandingSettings />
            </div>
          )}

          {/* ═══════════ LICENSE MANAGER ═══════════ */}
          {activeSection === 'licenses' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">License Manager</h1>
                  <p className="text-sm text-zinc-400">Manage license packages and site assignments</p>
                </div>
              </div>
              <LicenseManager />
            </div>
          )}

          {/* ═══════════ DOMAIN MANAGER ═══════════ */}
          {activeSection === 'domains' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Domain Manager</h1>
                  <p className="text-sm text-zinc-400">Manage domains, subdomain routing, and Cloudflare integration</p>
                </div>
              </div>
              <DomainManager />
            </div>
          )}

          {/* ═══════════ ENVIRONMENTS ═══════════ */}
          {activeSection === 'environments' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Environments</h1>
                  <p className="text-sm text-zinc-400">Manage Clara environments, admins, and site assignments</p>
                </div>
              </div>
              <EnvironmentManager />
            </div>
          )}


          {/* ═══════════ PERMISSION AUDIT ═══════════ */}
          {activeSection === 'audit' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Permission Audit</h1>
                  <p className="text-sm text-zinc-400">Audit and verify role permissions across all sites</p>
                </div>
              </div>
              <PermissionAuditPanel token={token} onClose={() => setActiveSection('sites')} inline />
            </div>
          )}

          {/* ═══════════ USER ACCESS DEBUG ═══════════ */}
          {activeSection === 'user-access' && (
            <UserAccessSection token={token} API={API} openUserAccessPanel={openUserAccessPanel} userAccessPanel={userAccessPanel} mainSites={mainSites} roleIcons={roleIcons} roleLabels={roleLabels} />
          )}

          {/* ═══════════ ACCOUNT SECURITY ═══════════ */}
          {activeSection === 'security' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Account Security</h1>
                  <p className="text-sm text-zinc-400">Manage your two-factor authentication settings</p>
                </div>
                {user?.totp_enabled && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    <CheckCircle className="w-3.5 h-3.5" /> 2FA Active
                  </span>
                )}
              </div>
              <Card className="bg-zinc-900 border-zinc-800 max-w-lg">
                <CardContent className="p-6">
                  <TwoFactorSetup user={user} onUpdate={refreshUser} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || !!editingSite} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingSite(null);
          setCreateStep(0);
          setFormData({ name: '', slug: '', enabled_features: [], site_type: 'radio' });
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSite ? 'Edit Main Site' : 'Create Main Site'}</DialogTitle>
          </DialogHeader>

          {editingSite ? (
            /* Edit mode: simple name/slug form */
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Site name" className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="space-y-2">
                <Label>URL Slug</Label>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-500 text-sm">/</span>
                  <Input value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="bg-zinc-800 border-zinc-700 font-mono" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditingSite(null); setFormData({ name: '', slug: '', enabled_features: [], site_type: 'radio' }); }}>Cancel</Button>
                <Button onClick={handleUpdateSite}>Save Changes</Button>
              </DialogFooter>
            </div>
          ) : (
            /* Create wizard */
            <div className="space-y-4 py-2">
              {/* Step indicator */}
              <div className="flex items-center gap-1">
                {['Name', 'Package', 'Confirm'].map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      i < createStep ? 'bg-emerald-500/20 text-emerald-400' :
                      i === createStep ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' :
                      'bg-zinc-800 text-zinc-500'
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
                      placeholder="e.g. Radiogroup MFY/GRK" className="bg-zinc-800 border-zinc-700" autoFocus data-testid="create-site-name-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>URL Slug</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500 text-sm">/</span>
                      <Input value={formData.slug} onChange={(e) => setFormData(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                        className="bg-zinc-800 border-zinc-700 font-mono" data-testid="create-site-slug-input" />
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
                          formData.site_type === pkg.type ? `${PACKAGE_COLORS[pkg.color]} border-2` : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
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
                        className="w-full h-10 rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 text-sm" data-testid="linked-main-site-select">
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
                    <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 space-y-3">
                      <div className="flex items-center gap-3">
                        {pkg && <pkg.icon className={`w-6 h-6 ${PACKAGE_ICON_COLORS[pkg.color]}`} />}
                        <div>
                          <p className="text-sm font-medium text-zinc-100">{formData.name}</p>
                          <p className="text-xs font-mono text-zinc-500">/{formData.slug}</p>
                        </div>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${SITE_TYPE_BADGE[formData.site_type] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                          {SITE_TYPE_LABELS[formData.site_type] || formData.site_type}
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-3">
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
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, siteId: null, siteName: '' })}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Main Site</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{deleteDialog.siteName}"? This will also delete all associated mini-sites and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
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
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
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
                  <p className="font-semibold text-white">
                    {healthCheck.result.overall_status === 'ok' ? 'All OK' :
                     healthCheck.result.overall_status === 'error' ? 'Errors Found' : 'Warnings'}
                  </p>
                  <p className="text-xs text-zinc-400">{healthCheck.result.timestamp?.slice(0, 19)}</p>
                </div>
              </div>
              
              {/* Individual Checks */}
              <div className="space-y-2">
                {healthCheck.result.checks?.map((check, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg">
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
                      <p className="text-sm font-medium text-white">{check.name}</p>
                      <p className="text-xs text-zinc-400">{check.message}</p>
                    </div>
                    {check.count !== undefined && (
                      <span className="text-sm font-mono text-zinc-300">{check.count}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Team IDs resolved */}
              <div className="text-xs text-zinc-500 p-2 bg-zinc-800/30 rounded">
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
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[90vh] overflow-y-auto">
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
    </div>
  );
}
