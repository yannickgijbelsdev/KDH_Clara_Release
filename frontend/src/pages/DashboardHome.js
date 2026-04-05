import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio, Users, FileText, Calendar, ArrowRight, Search, Mic, Clock,
  Globe, HardDrive, Network, LayoutGrid, Shield, ExternalLink,
  Layers, Server, Activity, CheckCircle, Zap, BarChart3
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useMainSite } from '../context/MainSiteContext';
import { useAuth } from '../context/AuthContext';
import { getAvatarUrl } from '../utils/avatar';

const API = process.env.REACT_APP_BACKEND_URL;

const STUDIO_IMG = 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/9c133714c33f42124837a555a90289699f0f5190e464c69e21122133740a9121.png';
const DATACENTER_IMG = 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/890e7b1a8c829f2400a99ab38a6f95cc67ee2cf484d5e0f7284db9d387dccdaa.png';

/* ── Site type configuration ── */
const SITE_TYPE_THEMES = {
  radio:          { img: STUDIO_IMG, accent: '#f97316', label: 'Radio Station',    icon: Radio },
  external_host:  { img: null,       accent: '#06b6d4', label: 'External Host',    icon: ExternalLink },
  server:         { img: DATACENTER_IMG, accent: '#3b82f6', label: 'Virtual Datacenter', icon: HardDrive },
  technical:      { img: null,       accent: '#10b981', label: 'Data Connection',  icon: Network },
  task_scheduler: { img: null,       accent: '#8b5cf6', label: 'Task Manager',     icon: LayoutGrid },
  wp_security:    { img: null,       accent: '#ef4444', label: 'WP Security',      icon: Shield },
};

const Panel = ({ children, className = '', delay = 0, testId }) => (
  <motion.div
    data-testid={testId}
    initial={{ opacity: 0, y: 12, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    className={`bg-white/80 backdrop-blur-2xl rounded-[20px] border border-black/[0.05] shadow-[0_8px_40px_rgba(0,0,0,0.08)] ${className}`}
  >
    {children}
  </motion.div>
);

/* ── Panels per type ── */

const RadioPanels = ({ mainSite, mainSiteSlug, navigate, shows, teamMembers, contentCount, loading, activeShows, greeting, firstName }) => (
  <>
    {/* TOP-LEFT: Shows counter */}
    <Panel testId="panel-shows-counter" className="absolute top-0 left-0 px-6 py-5 pointer-events-auto" delay={0}>
      <div className="flex items-center gap-5">
        <div>
          <span className="text-4xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : activeShows.length}</span>
          <p className="text-xs text-zinc-400 mt-0.5 font-medium">Active Shows</p>
        </div>
        <div className="w-px h-10 bg-zinc-200" />
        <div>
          <span className="text-4xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : teamMembers.length}</span>
          <p className="text-xs text-zinc-400 mt-0.5 font-medium">Team Members</p>
        </div>
        <button onClick={() => navigate(`/${mainSiteSlug}/shows`)} className="ml-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2 shadow-lg shadow-orange-500/25">
          Open Shows <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </Panel>

    {/* LEFT: On-Air */}
    <Panel testId="panel-live-show" className="absolute top-[38%] left-0 -translate-y-1/2 w-[260px] overflow-hidden pointer-events-auto" delay={0.12}>
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-5 py-4 text-white">
        <div className="flex items-center gap-2 mb-2"><Mic className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">On Air</span></div>
        <p className="text-lg font-bold leading-tight">{activeShows.length > 0 ? activeShows[0].name : 'No live show'}</p>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div><span className="text-2xl font-bold text-zinc-900">{shows.length}</span><p className="text-xs text-zinc-400">Total shows</p></div>
          <button onClick={() => navigate(`/${mainSiteSlug}/calendar`)} className="bg-zinc-900 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-zinc-800 transition-colors flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />Schedule
          </button>
        </div>
      </div>
    </Panel>
  </>
);

const GenericPanels = ({ mainSite, mainSiteSlug, navigate, teamMembers, loading, theme }) => {
  const features = mainSite?.enabled_features || [];
  const Icon = theme.icon;

  const navItems = [];
  if (features.includes('sites')) navItems.push({ label: 'Sites', icon: Layers, to: 'sites', color: 'text-blue-500 bg-blue-50' });
  if (features.includes('zerotier')) navItems.push({ label: 'ZeroTier', icon: Network, to: 'zerotier', color: 'text-emerald-500 bg-emerald-50' });
  if (features.includes('wp_security')) navItems.push({ label: 'Firewall', icon: Shield, to: 'firewall', color: 'text-red-500 bg-red-50' });
  if (features.includes('task_boards')) navItems.push({ label: 'Task Boards', icon: LayoutGrid, to: 'task-boards', color: 'text-violet-500 bg-violet-50' });
  if (features.includes('xml_imports')) navItems.push({ label: 'XML Imports', icon: Server, to: 'xml-imports', color: 'text-blue-500 bg-blue-50' });
  if (features.includes('team_settings')) navItems.push({ label: 'Team', icon: Users, to: 'team', color: 'text-emerald-500 bg-emerald-50' });
  if (features.includes('content_library')) navItems.push({ label: 'Content', icon: FileText, to: 'content', color: 'text-violet-500 bg-violet-50' });
  if (features.includes('calendar')) navItems.push({ label: 'Calendar', icon: Calendar, to: 'calendar', color: 'text-blue-500 bg-blue-50' });

  return (
    <>
      {/* TOP-LEFT: Status */}
      <Panel testId="panel-site-status" className="absolute top-0 left-0 px-6 py-5 pointer-events-auto" delay={0}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${theme.accent}15` }}>
            <Icon className="w-6 h-6" style={{ color: theme.accent }} />
          </div>
          <div>
            <span className="text-lg font-bold text-zinc-900">{theme.label}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px #22c55e80' }} />
              <span className="text-xs text-zinc-500">Online</span>
            </div>
          </div>
          <div className="ml-4 flex items-center gap-3">
            <div className="text-center"><span className="text-2xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : teamMembers.length}</span><p className="text-[10px] text-zinc-400">Team</p></div>
            <div className="text-center"><span className="text-2xl font-bold text-zinc-900 tabular-nums">{features.length}</span><p className="text-[10px] text-zinc-400">Features</p></div>
          </div>
        </div>
      </Panel>

      {/* CENTER-LEFT: Quick Actions */}
      {navItems.length > 0 && (
        <Panel testId="panel-quick-actions" className="absolute top-[35%] left-0 -translate-y-1/2 w-[240px] pointer-events-auto" delay={0.12}>
          <div className="px-4 py-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quick Actions</span>
            <div className="mt-3 space-y-1">
              {navItems.slice(0, 5).map(item => (
                <button key={item.to} onClick={() => navigate(`/${mainSiteSlug}/${item.to}`)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 transition-colors group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}><item.icon className="w-4 h-4" /></div>
                  <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">{item.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-300 ml-auto group-hover:text-zinc-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {/* RIGHT: Features */}
      <Panel testId="panel-features" className="absolute top-[10%] right-0 w-[250px] pointer-events-auto" delay={0.15}>
        <div className="px-5 py-4">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Enabled Features</span>
          <div className="mt-3 space-y-2.5">
            {features.map(f => (
              <div key={f} className="flex items-center gap-2.5">
                <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: theme.accent }} />
                <span className="text-sm text-zinc-700 capitalize">{f.replace(/_/g, ' ')}</span>
              </div>
            ))}
            {features.length === 0 && <p className="text-xs text-zinc-400 italic">No features enabled</p>}
          </div>
        </div>
      </Panel>
    </>
  );
};

export default function DashboardHome() {
  const { mainSite, mainSiteSlug } = useMainSite();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [contentCount, setContentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const siteType = mainSite?.site_type || 'radio';
  const isRadio = siteType === 'radio';
  const theme = SITE_TYPE_THEMES[siteType] || SITE_TYPE_THEMES.radio;

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
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    }
    setLoading(false);
  }, [mainSite?.id, token, isRadio]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const firstName = user?.name?.split(' ')[0] || 'User';
  const activeShows = shows.filter(s => s.status === 'active' || !s.status);
  const now = new Date();
  const hours = now.getHours();
  const greeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening';

  const bgImg = mainSite?.logo_url ? `${API}${mainSite.logo_url}` : theme.img;

  return (
    <>
      {/* Central Image */}
      {bgImg && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <motion.img
            src={bgImg}
            alt=""
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: mainSite?.logo_url ? 0.25 : 0.45, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={mainSite?.logo_url ? 'w-[30%] max-w-[320px] object-contain select-none' : 'w-[55%] max-w-[780px] object-contain select-none'}
            draggable={false}
          />
        </div>
      )}

      {/* Fade edges */}
      <div className="absolute inset-0 pointer-events-none z-[1]" style={{
        background: bgImg
          ? 'radial-gradient(ellipse at center, transparent 25%, #F0F0F2 68%)'
          : 'none',
      }} />

      {/* ── Panels ── */}
      <div className="absolute inset-0 z-10 p-5 pointer-events-none">
        <div className="relative w-full h-full">

          {/* Type-specific panels */}
          {isRadio ? (
            <RadioPanels
              mainSite={mainSite} mainSiteSlug={mainSiteSlug} navigate={navigate}
              shows={shows} teamMembers={teamMembers} contentCount={contentCount}
              loading={loading} activeShows={activeShows} greeting={greeting} firstName={firstName}
            />
          ) : (
            <GenericPanels
              mainSite={mainSite} mainSiteSlug={mainSiteSlug} navigate={navigate}
              teamMembers={teamMembers} loading={loading} theme={theme}
            />
          )}

          {/* TOP-RIGHT: Welcome (all types) */}
          <Panel testId="panel-welcome" className="absolute top-0 right-0 px-6 py-5 max-w-[380px] pointer-events-auto" delay={0.06}>
            <h2 className="text-xl font-bold text-zinc-900">{greeting}, {firstName}!</h2>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
              Let's manage <strong className="text-zinc-600">{mainSite?.name || 'your site'}</strong> today.
            </p>
          </Panel>

          {/* RIGHT NAV (radio only) */}
          {isRadio && (
            <Panel testId="panel-schedule" className="absolute top-[10%] right-0 w-[240px] pointer-events-auto" delay={0.18}>
              <div className="px-5 pt-4 pb-3">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Navigation</span>
                <div className="mt-3 space-y-1.5">
                  {[
                    { label: 'Shows', icon: Radio, to: 'shows', color: 'text-orange-500 bg-orange-50' },
                    { label: 'Calendar', icon: Calendar, to: 'calendar', color: 'text-blue-500 bg-blue-50' },
                    { label: 'Content', icon: FileText, to: 'content', color: 'text-violet-500 bg-violet-50' },
                    { label: 'Team', icon: Users, to: 'team', color: 'text-emerald-500 bg-emerald-50' },
                  ].map(item => (
                    <button key={item.to} onClick={() => navigate(`/${mainSiteSlug}/${item.to}`)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 transition-colors group">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}><item.icon className="w-4 h-4" /></div>
                      <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">{item.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-300 ml-auto group-hover:text-zinc-500 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-zinc-100 px-5 py-4 space-y-3">
                {[
                  { label: 'Content Items', color: 'bg-green-500', value: contentCount },
                  { label: 'Active Shows', color: 'bg-orange-500', value: activeShows.length },
                  { label: 'Team Size', color: 'bg-blue-500', value: teamMembers.length },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.color}`} /><span className="text-xs text-zinc-500">{s.label}</span></div>
                    <span className="text-sm font-bold text-zinc-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* BOTTOM-LEFT: Team members (all types) */}
          <Panel testId="panel-team" className="absolute bottom-0 left-0 w-[280px] pointer-events-auto" delay={0.24}>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-zinc-800">Team Members</span>
                <button onClick={() => navigate(`/${mainSiteSlug}/team`)} className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors">
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
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">{member.name?.split(' ')[0]}</span>
                  </div>
                ))}
                {teamMembers.length > 6 && <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 text-xs font-bold border-2 border-white">+{teamMembers.length - 6}</div>}
                {teamMembers.length === 0 && !loading && <p className="text-xs text-zinc-400">No team members yet</p>}
              </div>
            </div>
          </Panel>

          {/* BOTTOM-RIGHT: Metrics (radio) or Status (other) */}
          <Panel testId="panel-metrics" className="absolute bottom-0 right-0 w-[260px] pointer-events-auto" delay={0.3}>
            <div className="px-5 py-4">
              {isRadio ? (
                <>
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
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">System Status</span>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px #22c55e80' }} />
                      <span className="text-sm font-medium text-zinc-700">Operational</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Team members</span>
                      <span className="text-sm font-bold text-zinc-800">{teamMembers.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Features active</span>
                      <span className="text-sm font-bold text-zinc-800">{(mainSite?.enabled_features || []).length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Site type</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${theme.accent}12`, color: theme.accent }}>{theme.label}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Panel>

          {/* BOTTOM-CENTER: Time (all types) */}
          <Panel testId="panel-time" className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-auto" delay={0.2}>
            <div className="px-6 py-3 flex items-center gap-4">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-600">{now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span className="text-sm font-bold text-zinc-900 tabular-nums">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </Panel>

        </div>
      </div>
    </>
  );
}
