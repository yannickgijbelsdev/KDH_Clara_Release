import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Globe, Radio, HardDrive, Network, LayoutGrid, ExternalLink, Shield,
  Layers, Users, Plus, Server, Search, ChevronLeft, ChevronRight, Activity, Zap
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const DATACENTER_IMG = 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/890e7b1a8c829f2400a99ab38a6f95cc67ee2cf484d5e0f7284db9d387dccdaa.png';

const SITE_TYPE_CONFIG = {
  radio:          { icon: Radio,        color: '#f97316', label: 'Radio' },
  server:         { icon: HardDrive,    color: '#3b82f6', label: 'Datacenter' },
  technical:      { icon: Network,      color: '#10b981', label: 'Data Conn.' },
  task_scheduler: { icon: LayoutGrid,   color: '#8b5cf6', label: 'Tasks' },
  external_host:  { icon: ExternalLink, color: '#06b6d4', label: 'Ext. Host' },
  wp_security:    { icon: Shield,       color: '#ef4444', label: 'WP Security' },
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

export default function ServerRackView({ sites, onCreateSite, environments, selectedEnvId, user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [rackPage, setRackPage] = useState(0);

  const envName = environments?.find(e => e.id === selectedEnvId)?.name || 'Production';
  const filteredSites = searchQuery
    ? sites.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.slug.toLowerCase().includes(searchQuery.toLowerCase()))
    : sites;

  const RACKS_PER_PAGE = 2;
  const SERVERS_PER_RACK = 5;
  const totalRacks = Math.ceil(filteredSites.length / SERVERS_PER_RACK) || 1;
  const totalPages = Math.ceil(totalRacks / RACKS_PER_PAGE);
  const pageRackStart = rackPage * RACKS_PER_PAGE;

  // Build racks for current page
  const currentRacks = [];
  for (let r = pageRackStart; r < Math.min(pageRackStart + RACKS_PER_PAGE, totalRacks); r++) {
    const start = r * SERVERS_PER_RACK;
    currentRacks.push({ index: r, sites: filteredSites.slice(start, start + SERVERS_PER_RACK) });
  }

  // Stats
  const typeCounts = {};
  sites.forEach(s => {
    const t = s.site_type || 'radio';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const totalUsers = sites.reduce((sum, s) => sum + (s.user_count || 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative w-full h-full overflow-hidden" data-testid="server-rack-view">
      {/* Central datacenter illustration — prominent */}
      <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
        <div
          className="w-[85%] max-w-[1100px] h-[85%] bg-contain bg-bottom bg-no-repeat opacity-[0.55]"
          style={{ backgroundImage: `url(${DATACENTER_IMG})` }}
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 80%, transparent 20%, #F0F0F2 70%)' }}
      />

      {/* ═══ Floating Panels ═══ */}
      <div className="absolute inset-0 z-10 p-4 sm:p-5 overflow-hidden">
        <div className="relative w-full h-full">

          {/* ── Top-Left: Server Count ── */}
          <Panel className="absolute top-0 left-0 p-5 pr-6 flex items-center gap-5" delay={0} testId="panel-server-count">
            <div className="text-4xl font-bold text-zinc-900">{sites.length}</div>
            <div>
              <div className="text-xs text-zinc-400 uppercase tracking-wider font-medium">{envName}</div>
              <div className="text-sm font-semibold text-zinc-700">Servers online</div>
            </div>
            <Button onClick={onCreateSite} className="ml-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full px-5 gap-2 shadow-lg shadow-orange-500/20" data-testid="create-site-btn">
              New Server
            </Button>
          </Panel>

          {/* ── Top-Right: Welcome ── */}
          <Panel className="absolute top-0 right-0 p-5 max-w-[340px]" delay={0.05} testId="panel-welcome">
            <p className="text-xl font-bold text-zinc-900">
              {greeting}, {user?.name?.split(' ')[0] || 'Admin'}!
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Let's manage the <span className="font-semibold text-zinc-700">Clara Datacenter</span>.
            </p>
          </Panel>

          {/* ── Left: Server List (Rack View) ── */}
          <Panel className="absolute top-[90px] left-0 w-[320px] max-h-[calc(100%-100px)] flex flex-col" delay={0.1} testId="panel-server-list">
            {/* Search */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1 bg-black/[0.04] rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Find server..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setRackPage(0); }}
                  className="bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 outline-none w-full"
                  data-testid="server-search"
                />
              </div>
            </div>

            {/* Rack pages */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {currentRacks.map(rack => (
                <div key={rack.index} className="mb-3">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Server className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Rack {String(rack.index + 1).padStart(2, '0')}</span>
                    <div className="flex gap-0.5 ml-auto">
                      {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i < rack.sites.length ? '#22c55e' : '#d4d4d8' }} />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {rack.sites.map((site) => {
                      const cfg = SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio;
                      const Icon = site.cloned_from ? Layers : cfg.icon;
                      return (
                        <Link key={site.id} to={`/${site.slug}`} data-testid={`server-blade-${site.slug}`}>
                          <div className="group flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-black/[0.05] transition-colors cursor-pointer">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color, boxShadow: `0 0 6px ${cfg.color}50` }} />
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${cfg.color}15` }}>
                              <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-zinc-800 truncate group-hover:text-zinc-950">{site.name}</div>
                              <div className="text-[10px] text-zinc-400 truncate">/{site.slug}</div>
                            </div>
                            <ExternalLink className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 flex-shrink-0" />
                          </div>
                        </Link>
                      );
                    })}
                    {rack.sites.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-zinc-400 italic">No servers in this rack</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-2.5 border-t border-black/[0.05] flex items-center justify-between">
                <button onClick={() => setRackPage(Math.max(0, rackPage - 1))} disabled={rackPage === 0} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-4 h-4 text-zinc-500" />
                </button>
                <span className="text-[11px] text-zinc-400 font-medium">
                  Rack {pageRackStart + 1}–{Math.min(pageRackStart + RACKS_PER_PAGE, totalRacks)} of {totalRacks}
                </span>
                <button onClick={() => setRackPage(Math.min(totalPages - 1, rackPage + 1))} disabled={rackPage >= totalPages - 1} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </button>
              </div>
            )}
          </Panel>

          {/* ── Right: Rack Overview / Stats ── */}
          <Panel className="absolute top-[90px] right-0 w-[280px] p-5" delay={0.15} testId="panel-rack-overview">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Infrastructure</span>
            </div>
            <div className="space-y-4">
              {Object.entries(typeCounts).map(([type, count]) => {
                const cfg = SITE_TYPE_CONFIG[type] || SITE_TYPE_CONFIG.radio;
                const Icon = cfg.icon;
                const pct = Math.round((count / sites.length) * 100);
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cfg.color}12` }}>
                      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-700">{cfg.label}</span>
                        <span className="text-xs text-zinc-400">{count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: 0.3 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: cfg.color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* ── Bottom-Left: Team ── */}
          <Panel className="absolute bottom-0 left-0 p-4 flex items-center gap-4" delay={0.2} testId="panel-team">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700">Total Users</span>
            </div>
            <div className="text-2xl font-bold text-zinc-900">{totalUsers}</div>
            <div className="w-px h-8 bg-black/[0.06]" />
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700">Racks</span>
            </div>
            <div className="text-2xl font-bold text-zinc-900">{totalRacks}</div>
          </Panel>

          {/* ── Bottom-Right: Status ── */}
          <Panel className="absolute bottom-0 right-0 p-4" delay={0.25} testId="panel-status">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
                <span className="text-sm font-medium text-zinc-700">All systems operational</span>
              </div>
              <div className="w-px h-6 bg-black/[0.06]" />
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-bold text-zinc-900">{sites.length}/{sites.length}</span>
                <span className="text-xs text-zinc-400">online</span>
              </div>
            </div>
          </Panel>

        </div>
      </div>
    </div>
  );
}
