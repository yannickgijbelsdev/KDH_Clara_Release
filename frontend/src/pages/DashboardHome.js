import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio, Users, FileText, Calendar, ArrowRight, Search, Mic,
  HardDrive, Network, LayoutGrid, Shield, ExternalLink, Code2,
  Layers, Server, CheckCircle, Monitor, Wifi, WifiOff
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useMainSite } from '../context/MainSiteContext';
import { useAuth } from '../context/AuthContext';
import { getAvatarUrl } from '../utils/avatar';

const API = process.env.REACT_APP_BACKEND_URL;

const SITE_TYPE_THEMES = {
  radio:          { img: '/images/env_radio.jpg', accent: '#dd0c51', label: 'Radio Station',    icon: Radio },
  external_host:  { img: '/images/env_external_host.jpg', accent: '#06b6d4', label: 'External Host',    icon: ExternalLink },
  server:         { img: '/images/env_server.jpg', accent: '#3b82f6', label: 'Virtual Datacenter', icon: HardDrive },
  technical:      { img: '/images/env_technical.jpg', accent: '#10b981', label: 'Data Connection',  icon: Network },
  task_scheduler: { img: '/images/env_task_scheduler.jpg', accent: '#8b5cf6', label: 'Task Manager',     icon: LayoutGrid },
  wp_security:    { img: '/images/env_wp_security.jpg', accent: '#ef4444', label: 'WP Security',      icon: Shield },
  code_studio:    { img: '/images/env_code_studio.jpg', accent: '#7c1ac8', label: 'Code Studio',      icon: Code2 },
};

const Panel = ({ children, className = '', delay = 0, testId }) => (
  <motion.div
    data-testid={testId}
    initial={{ opacity: 0, y: 12, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    className={`bg-white/85 backdrop-blur-xl rounded-[20px] border border-zinc-200/40 shadow-[0_8px_40px_rgba(0,0,0,0.06)] ${className}`}
  >
    {children}
  </motion.div>
);

export default function DashboardHome() {
  const { mainSite, mainSiteSlug } = useMainSite();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [contentCount, setContentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ztMembers, setZtMembers] = useState(null);

  const siteType = mainSite?.site_type || 'radio';
  const isRadio = siteType === 'radio';
  const isSinglePurpose = ['task_scheduler', 'code_studio', 'wp_security'].includes(siteType);
  const showFeaturesPanel = !isRadio && !isSinglePurpose; // only relevant for network/sites/external_host/technical
  const theme = SITE_TYPE_THEMES[siteType] || SITE_TYPE_THEMES.radio;
  const Icon = theme.icon;
  const features = mainSite?.enabled_features || [];

  const fetchData = useCallback(async () => {
    if (!mainSite?.id || !token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, 'X-Main-Site-Id': mainSite.id };
    const promises = [
      fetch(`${API}/api/main-sites/${mainSite.id}/users`, { headers }),
    ];
    if (isRadio) {
      promises.push(fetch(`${API}/api/shows?main_site_id=${mainSite.id}`, { headers }));
      promises.push(fetch(`${API}/api/content?main_site_id=${mainSite.id}&limit=1`, { headers }));
    }
    if (features.includes('zerotier')) {
      promises.push(fetch(`${API}/api/zerotier/${mainSite.id}/members`, { headers }));
    }
    try {
      const results = await Promise.allSettled(promises);
      if (results[0].status === 'fulfilled' && results[0].value.ok) {
        const d = await results[0].value.json();
        setTeamMembers(Array.isArray(d) ? d : []);
      }
      if (isRadio && results[1]?.status === 'fulfilled' && results[1].value.ok) {
        const d = await results[1].value.json();
        setShows(Array.isArray(d) ? d : d.shows || []);
      }
      if (isRadio && results[2]?.status === 'fulfilled' && results[2].value.ok) {
        const d = await results[2].value.json();
        setContentCount(d.total || (Array.isArray(d) ? d.length : 0));
      }
      // ZeroTier members: index depends on whether radio promises were added
      const ztIdx = isRadio ? 3 : 1;
      if (features.includes('zerotier') && results[ztIdx]?.status === 'fulfilled' && results[ztIdx].value.ok) {
        const d = await results[ztIdx].value.json();
        setZtMembers(Array.isArray(d) ? d : d.members || []);
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    }
    setLoading(false);
  }, [mainSite?.id, token, isRadio, features]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const firstName = user?.name?.split(' ')[0] || 'User';
  const activeShows = shows.filter(s => s.status === 'active' || !s.status);

  // Live clock that ticks every second
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const brusselsHours = Number(now.toLocaleString('en-US', { timeZone: 'Europe/Brussels', hour: 'numeric', hour12: false }));
  const greeting = brusselsHours < 4 ? 'Good night' : brusselsHours < 12 ? 'Good morning' : brusselsHours < 18 ? 'Good afternoon' : 'Good evening';

  // Build Quick Nav: mirror the sidebar logic — only show what's actually accessible.
  // Same implicit rule as sidebar: content_library implies approvals + trash.
  const effectiveFeatures = new Set(features);
  if (effectiveFeatures.has('content_library')) {
    effectiveFeatures.add('content_approval');
    effectiveFeatures.add('trash');
  }
  // Single-purpose site types always have their core route
  if (mainSite?.site_type === 'task_scheduler') effectiveFeatures.add('task_boards');
  if (mainSite?.site_type === 'code_studio') effectiveFeatures.add('code_studio');
  if (mainSite?.site_type === 'wp_security') effectiveFeatures.add('wp_security_dashboard');
  if (mainSite?.site_type === 'technical') { effectiveFeatures.add('zerotier'); effectiveFeatures.add('team_settings'); }

  // Feature → nav-item mapping (kept in sync with MainSiteDashboardLayout sidebar).
  // We pick the most-used/top-level features to avoid a huge list.
  const QUICK_NAV_MAP = {
    shows:             { label: 'Shows',          icon: Radio,      to: 'shows',          color: 'text-orange-500 bg-orange-50' },
    calendar:          { label: 'Calendar',       icon: Calendar,   to: 'calendar',       color: 'text-blue-500 bg-blue-50' },
    content_library:   { label: 'Content',        icon: FileText,   to: 'content',        color: 'text-violet-500 bg-violet-50' },
    content_approval:  { label: 'Approvals',      icon: CheckCircle,to: 'approvals',      color: 'text-amber-500 bg-amber-50' },
    media_library:     { label: 'Media',          icon: Layers,     to: 'media',          color: 'text-cyan-500 bg-cyan-50' },
    team_chat:         { label: 'Team Chat',      icon: Users,      to: 'chat',           color: 'text-emerald-500 bg-emerald-50' },
    team_settings:     { label: 'Team',           icon: Users,      to: 'team',           color: 'text-emerald-500 bg-emerald-50' },
    task_boards:       { label: 'Task Boards',    icon: LayoutGrid, to: 'task-boards',    color: 'text-violet-500 bg-violet-50' },
    code_studio:       { label: 'Code Studio',    icon: Layers,     to: 'code-studio',    color: 'text-fuchsia-500 bg-fuchsia-50' },
    zerotier:          { label: 'ZeroTier',       icon: Network,    to: 'zerotier',       color: 'text-emerald-500 bg-emerald-50' },
    sites:             { label: 'Sites',          icon: Layers,     to: 'sites',          color: 'text-blue-500 bg-blue-50' },
    wordpress:         { label: 'WordPress',      icon: Server,     to: 'wordpress',      color: 'text-blue-500 bg-blue-50' },
    xml_imports:       { label: 'XML Imports',    icon: Server,     to: 'xml-imports',    color: 'text-blue-500 bg-blue-50' },
    wp_security_dashboard: { label: 'Security',   icon: Shield,     to: 'wp-security',    color: 'text-red-500 bg-red-50' },
    rds:               { label: 'RDS',            icon: Radio,      to: 'rds',            color: 'text-orange-500 bg-orange-50' },
    activity_logs:     { label: 'Activity Logs',  icon: FileText,   to: 'logs',           color: 'text-zinc-500 bg-zinc-100' },
  };

  // Order items by sidebar priority
  const QUICK_NAV_ORDER = ['shows', 'calendar', 'content_library', 'content_approval', 'media_library', 'task_boards', 'code_studio', 'wp_security_dashboard', 'rds', 'zerotier', 'sites', 'wordpress', 'xml_imports', 'team_chat', 'team_settings', 'activity_logs'];

  const quickNav = QUICK_NAV_ORDER
    .filter(f => effectiveFeatures.has(f) && QUICK_NAV_MAP[f])
    .slice(0, 8) // dashboard panel stays compact
    .map(f => QUICK_NAV_MAP[f]);

  return (
    <>
      {/* ── Canvas layout ── */}
      <div className="absolute inset-0 z-10 p-4 lg:p-5 pointer-events-none overflow-y-auto">

        {/* ─── MOBILE / TABLET: stacked layout ─── */}
        <div className="lg:hidden flex flex-col gap-3 pointer-events-auto">
          <WelcomePanel greeting={greeting} firstName={firstName} mainSite={mainSite} loading={loading} teamMembers={teamMembers} activeShows={activeShows} contentCount={contentCount} isRadio={isRadio} />
          {isRadio ? (
            <OnAirPanel activeShows={activeShows} shows={shows} navigate={navigate} mainSiteSlug={mainSiteSlug} />
          ) : (
            <StatusPanel theme={theme} Icon={Icon} teamMembers={teamMembers} features={features} loading={loading} />
          )}
          <NavPanel items={quickNav} navigate={navigate} mainSiteSlug={mainSiteSlug} />
          {isRadio ? (
            <MetricsPanel shows={shows} contentCount={contentCount} teamMembers={teamMembers} />
          ) : showFeaturesPanel ? (
            <FeaturesPanel features={features} theme={theme} ztMembers={ztMembers} />
          ) : null}
          <TeamPanel teamMembers={teamMembers} loading={loading} navigate={navigate} mainSiteSlug={mainSiteSlug} />
          <TimePanel now={now} />
        </div>

        {/* ─── DESKTOP: canvas with floating panels ─── */}
        <div className="hidden lg:flex flex-col h-full gap-4 pointer-events-auto">

          {/* Row 1: Welcome (full width) */}
          <div className="flex-shrink-0">
            <WelcomePanel greeting={greeting} firstName={firstName} mainSite={mainSite} loading={loading} teamMembers={teamMembers} activeShows={activeShows} contentCount={contentCount} isRadio={isRadio} />
          </div>

          {/* Row 2: Left panel + [canvas center] + Right panel */}
          <div className="flex gap-4 flex-1 min-h-0">
            <div className="w-[280px] flex-shrink-0 flex flex-col gap-4">
              {isRadio ? (
                <OnAirPanel activeShows={activeShows} shows={shows} navigate={navigate} mainSiteSlug={mainSiteSlug} />
              ) : (
                <StatusPanel theme={theme} Icon={Icon} teamMembers={teamMembers} features={features} loading={loading} />
              )}
              <TeamPanel teamMembers={teamMembers} loading={loading} navigate={navigate} mainSiteSlug={mainSiteSlug} />
            </div>

            {/* Center: empty canvas area for background image */}
            <div className="flex-1 pointer-events-none" />

            <div className="w-[260px] flex-shrink-0 flex flex-col gap-4">
              <NavPanel items={quickNav} navigate={navigate} mainSiteSlug={mainSiteSlug} />
              {isRadio ? (
                <MetricsPanel shows={shows} contentCount={contentCount} teamMembers={teamMembers} />
              ) : showFeaturesPanel ? (
                <FeaturesPanel features={features} theme={theme} ztMembers={ztMembers} />
              ) : null}
            </div>
          </div>

          {/* Row 3: Time centered at bottom */}
          <div className="flex-shrink-0 flex justify-center">
            <TimePanel now={now} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════
   Individual panel components
   ════════════════════════════════════════════ */

function WelcomePanel({ greeting, firstName, mainSite, loading, teamMembers, activeShows, contentCount, isRadio }) {
  return (
    <Panel testId="panel-welcome" className="px-6 py-5" delay={0.06}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">{greeting}, {firstName}!</h2>
          <p className="text-sm text-zinc-400 mt-1">Let's manage <strong className="text-zinc-600">{mainSite?.name || 'your site'}</strong> today.</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center"><span className="text-2xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : teamMembers.length}</span><p className="text-[10px] text-zinc-400">Team</p></div>
          {isRadio && <div className="text-center"><span className="text-2xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : activeShows.length}</span><p className="text-[10px] text-zinc-400">Shows</p></div>}
          {isRadio && <div className="text-center"><span className="text-2xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : contentCount}</span><p className="text-[10px] text-zinc-400">Content</p></div>}
        </div>
      </div>
    </Panel>
  );
}

function TimePanel({ now }) {
  return (
    <Panel testId="panel-time" delay={0.3} className="inline-flex items-center gap-4 px-6 py-3">
      <span className="text-2xl font-bold text-zinc-900 tabular-nums">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <span className="w-px h-5 bg-zinc-200" />
      <span className="text-sm text-zinc-500">{now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </Panel>
  );
}

function OnAirPanel({ activeShows, shows, navigate, mainSiteSlug }) {
  return (
    <Panel testId="panel-live-show" className="overflow-hidden" delay={0.12}>
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-5 py-4 text-white">
        <div className="flex items-center gap-2 mb-1"><Mic className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">On Air</span></div>
        <p className="text-base font-bold leading-tight">{activeShows.length > 0 ? activeShows[0].name : 'No live show'}</p>
      </div>
      <div className="px-5 py-3 flex items-center justify-between">
        <div><span className="text-xl font-bold text-zinc-900">{shows.length}</span><span className="text-xs text-zinc-400 ml-1">shows</span></div>
        <button onClick={() => navigate(`/${mainSiteSlug}/shows`)} className="bg-zinc-900 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-zinc-800 transition-colors flex items-center gap-1.5" data-testid="open-shows-btn">
          Open Shows <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </Panel>
  );
}

function StatusPanel({ theme, Icon, teamMembers, features, loading }) {
  return (
    <Panel testId="panel-site-status" className="px-5 py-4" delay={0.12}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.accent}15` }}>
          <Icon className="w-5 h-5" style={{ color: theme.accent }} />
        </div>
        <div>
          <span className="text-sm font-bold text-zinc-900">{theme.label}</span>
          <div className="flex items-center gap-1.5 mt-0.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[11px] text-zinc-500">Online</span></div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-center">
        <div><span className="text-lg font-bold text-zinc-900">{loading ? '—' : teamMembers.length}</span><p className="text-[10px] text-zinc-400">Team</p></div>
        <div><span className="text-lg font-bold text-zinc-900">{features.length}</span><p className="text-[10px] text-zinc-400">Features</p></div>
      </div>
    </Panel>
  );
}

function NavPanel({ items, navigate, mainSiteSlug }) {
  if (!items.length) return null;
  return (
    <Panel testId="panel-navigation" className="overflow-hidden" delay={0.15}>
      <div className="px-4 py-3">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quick Navigation</span>
        <div className="mt-2 space-y-0.5">
          {items.map(item => (
            <button key={item.to} onClick={() => navigate(`/${mainSiteSlug}/${item.to}`)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-50 transition-colors group" data-testid={`nav-${item.to}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.color}`}><item.icon className="w-3.5 h-3.5" /></div>
              <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">{item.label}</span>
              <ArrowRight className="w-3 h-3 text-zinc-300 ml-auto group-hover:text-zinc-500" />
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function MetricsPanel({ shows, contentCount, teamMembers }) {
  return (
    <Panel testId="panel-metrics" delay={0.2}>
      <div className="px-5 py-4">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Station Metrics</span>
        <div className="mt-3 space-y-3">
          {[
            { label: 'Shows', value: shows.length, unit: 'total', color: 'bg-orange-500', pct: Math.min(shows.length * 10, 100) },
            { label: 'Content', value: contentCount, unit: 'items', color: 'bg-violet-500', pct: Math.min(contentCount * 5, 100) },
            { label: 'Team', value: teamMembers.length, unit: 'members', color: 'bg-emerald-500', pct: Math.min(teamMembers.length * 15, 100) },
          ].map(stat => (
            <div key={stat.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-500">{stat.label}</span>
                <span className="text-sm font-bold text-zinc-800">{stat.value} <span className="text-xs font-normal text-zinc-400">{stat.unit}</span></span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${stat.pct}%` }} transition={{ duration: 0.8, delay: 0.4 }} className={`h-full rounded-full ${stat.color}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function FeaturesPanel({ features, theme, ztMembers }) {
  const onlineCount = ztMembers ? ztMembers.filter(m => m.online).length : 0;
  const totalCount = ztMembers ? ztMembers.length : 0;

  return (
    <Panel testId="panel-features" delay={0.2}>
      <div className="px-5 py-4">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Enabled Features</span>
        <div className="mt-3 space-y-2">
          {features.map(f => (
            <div key={f} className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: theme.accent }} />
              <span className="text-sm text-zinc-700 capitalize">{f.replace(/_/g, ' ')}</span>
            </div>
          ))}
          {features.length === 0 && <p className="text-xs text-zinc-400 italic">No features enabled</p>}
        </div>

        {ztMembers && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">ZeroTier Network</span>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="text-lg font-bold text-emerald-600">{onlineCount}</div>
                <div className="text-[10px] text-emerald-500 uppercase tracking-wider">Online</div>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="text-lg font-bold text-zinc-600">{totalCount}</div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Total</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function TeamPanel({ teamMembers, loading, navigate, mainSiteSlug }) {
  return (
    <Panel testId="panel-team" delay={0.24}>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-zinc-800">Team Members</span>
          <button onClick={() => navigate(`/${mainSiteSlug}/team`)} className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors" data-testid="team-search-btn">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {teamMembers.slice(0, 6).map((member, i) => (
            <div key={member.id || i} className="relative group">
              {getAvatarUrl(member) ? (
                <img src={getAvatarUrl(member)} alt={member.name} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-semibold text-xs border-2 border-white shadow-sm">
                  {member.name?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          ))}
          {teamMembers.length > 6 && <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 text-xs font-bold border-2 border-white">+{teamMembers.length - 6}</div>}
          {teamMembers.length === 0 && !loading && <p className="text-xs text-zinc-400">No team members yet</p>}
        </div>
      </div>
    </Panel>
  );
}
