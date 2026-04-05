import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, HardDrive, Network, LayoutGrid, ExternalLink, Shield,
  Layers, Users, Plus, Server, ChevronLeft, ChevronRight, Zap, X
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

const SERVERS_PER_RACK = 5;

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

/* ── Single Isometric Rack ── */
const IsometricRack = ({ rackIndex, sites, isSelected, onClick, totalRacks, rackPosition }) => {
  const hasServers = sites.length > 0;
  const fillPct = sites.length / SERVERS_PER_RACK;

  // Determine dominant color from sites
  const dominantColor = useMemo(() => {
    if (sites.length === 0) return '#71717a';
    const counts = {};
    sites.forEach(s => {
      const c = SITE_TYPE_CONFIG[s.site_type || 'radio']?.color || '#f97316';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }, [sites]);

  return (
    <motion.div
      data-testid={`rack-visual-${rackIndex}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rackIndex * 0.1 + 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="cursor-pointer group relative"
      style={{
        width: 110,
        marginLeft: rackPosition === 0 ? 0 : -8,
      }}
    >
      {/* Rack selection ring */}
      {isSelected && (
        <motion.div
          layoutId="rack-ring"
          className="absolute -inset-3 rounded-2xl border-2 border-orange-500/60 z-0"
          style={{ boxShadow: '0 0 20px rgba(249,115,22,0.25)' }}
        />
      )}

      {/* Rack body — CSS 3D */}
      <div className="relative z-10">
        {/* Top face */}
        <div
          className="h-3 rounded-t-lg transition-colors duration-300"
          style={{
            background: isSelected
              ? `linear-gradient(135deg, ${dominantColor}90, ${dominantColor}60)`
              : 'linear-gradient(135deg, #52525b, #3f3f46)',
          }}
        />

        {/* Front face */}
        <div
          className="rounded-b-lg overflow-hidden transition-all duration-300 relative"
          style={{
            background: isSelected
              ? 'linear-gradient(180deg, #1c1c1e, #0a0a0b)'
              : 'linear-gradient(180deg, #27272a, #18181b)',
            boxShadow: isSelected
              ? `0 8px 32px ${dominantColor}30, 0 0 60px ${dominantColor}10`
              : '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {/* Server slots */}
          <div className="p-1.5 space-y-[3px]">
            {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => {
              const site = sites[i];
              const cfg = site ? (SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio) : null;
              return (
                <div
                  key={i}
                  className="h-[18px] rounded-[4px] flex items-center px-1.5 gap-1 transition-all duration-200"
                  style={{
                    background: site
                      ? `linear-gradient(90deg, ${cfg.color}20, ${cfg.color}08)`
                      : 'rgba(255,255,255,0.03)',
                    border: site ? `1px solid ${cfg.color}30` : '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {site ? (
                    <>
                      <div className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }} />
                      <div className="text-[7px] text-zinc-400 truncate flex-1">{site.name}</div>
                      <div className="w-[4px] h-[4px] rounded-full bg-emerald-500 flex-shrink-0" style={{ boxShadow: '0 0 3px #22c55e' }} />
                    </>
                  ) : (
                    <div className="text-[6px] text-zinc-700 italic">empty</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom panel with LEDs */}
          <div className="px-1.5 pb-1.5 pt-0.5 flex items-center justify-between">
            <div className="flex gap-[3px]">
              {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => (
                <div
                  key={i}
                  className="w-[5px] h-[5px] rounded-full transition-colors"
                  style={{
                    backgroundColor: i < sites.length ? '#22c55e' : '#27272a',
                    boxShadow: i < sites.length ? '0 0 4px #22c55e80' : 'none',
                  }}
                />
              ))}
            </div>
            <div className="text-[7px] text-zinc-600 font-mono">R{String(rackIndex + 1).padStart(2, '0')}</div>
          </div>
        </div>

        {/* Rack label */}
        <div className="mt-2 text-center">
          <div className={`text-[10px] font-semibold transition-colors ${isSelected ? 'text-orange-600' : 'text-zinc-400 group-hover:text-zinc-600'}`}>
            Rack {String(rackIndex + 1).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-zinc-400">{sites.length}/{SERVERS_PER_RACK}</div>
        </div>
      </div>

      {/* Hover glow */}
      {!isSelected && (
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-0"
          style={{ boxShadow: `0 0 30px ${dominantColor}15` }}
        />
      )}
    </motion.div>
  );
};

export default function ServerRackView({ sites, onCreateSite, environments, selectedEnvId, user }) {
  const [selectedRack, setSelectedRack] = useState(null);

  const envName = environments?.find(e => e.id === selectedEnvId)?.name || 'Production';

  // Build racks
  const racks = useMemo(() => {
    const result = [];
    for (let i = 0; i < sites.length; i += SERVERS_PER_RACK) {
      result.push(sites.slice(i, i + SERVERS_PER_RACK));
    }
    if (result.length === 0) result.push([]);
    return result;
  }, [sites]);

  const totalUsers = sites.reduce((sum, s) => sum + (s.user_count || 0), 0);
  const selectedRackSites = selectedRack !== null ? (racks[selectedRack] || []) : [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const navigateRack = (dir) => {
    if (selectedRack === null) return;
    const next = selectedRack + dir;
    if (next >= 0 && next < racks.length) setSelectedRack(next);
  };

  return (
    <div className="relative w-full h-full overflow-hidden" data-testid="server-rack-view">
      {/* Subtle datacenter atmosphere */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="w-full h-full bg-cover bg-center opacity-[0.08]"
          style={{ backgroundImage: `url(${DATACENTER_IMG})` }}
        />
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 60%, transparent 30%, #F0F0F2 75%)' }} />

      {/* ═══ Floating panels + interactive racks ═══ */}
      <div className="absolute inset-0 z-10 p-4 sm:p-5 flex flex-col">

        {/* ── Top Row ── */}
        <div className="flex items-start justify-between flex-shrink-0">
          <Panel className="p-4 pr-6 flex items-center gap-4" delay={0} testId="panel-server-count">
            <div className="text-3xl font-bold text-zinc-900">{sites.length}</div>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">{envName}</div>
              <div className="text-sm font-semibold text-zinc-700">Servers online</div>
            </div>
            <Button onClick={onCreateSite} className="ml-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full px-4 gap-1.5 text-sm shadow-lg shadow-orange-500/20" data-testid="create-site-btn">
              <Plus className="w-3.5 h-3.5" /> New Server
            </Button>
          </Panel>

          <Panel className="p-4 max-w-[300px]" delay={0.05} testId="panel-welcome">
            <p className="text-lg font-bold text-zinc-900">{greeting}, {user?.name?.split(' ')[0] || 'Admin'}!</p>
            <p className="text-sm text-zinc-500">Let's manage the <span className="font-semibold text-zinc-700">Clara Datacenter</span>.</p>
          </Panel>
        </div>

        {/* ── Center: Interactive Rack Scene ── */}
        <div className="flex-1 flex items-center justify-center relative my-3">
          {/* Floor / platform */}
          <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 w-[80%] max-w-[900px] h-[6px] rounded-full bg-gradient-to-r from-transparent via-zinc-300/50 to-transparent" />
          <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 w-[60%] max-w-[700px] h-[2px] rounded-full bg-gradient-to-r from-transparent via-orange-400/20 to-transparent" />

          {/* Racks row */}
          <div className="flex items-end gap-3 relative z-10">
            {racks.map((rackSites, i) => (
              <IsometricRack
                key={i}
                rackIndex={i}
                sites={rackSites}
                isSelected={selectedRack === i}
                onClick={() => setSelectedRack(selectedRack === i ? null : i)}
                totalRacks={racks.length}
                rackPosition={i}
              />
            ))}
          </div>

          {/* Rack detail popup */}
          <AnimatePresence>
            {selectedRack !== null && (
              <motion.div
                key="rack-detail"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-2 left-1/2 -translate-x-1/2 w-[380px] bg-white/90 backdrop-blur-2xl rounded-[20px] border border-black/[0.06] shadow-[0_12px_48px_rgba(0,0,0,0.12)] z-30 overflow-hidden"
                data-testid="rack-detail-panel"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.05]">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigateRack(-1); }}
                      disabled={selectedRack === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] disabled:opacity-20 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-zinc-500" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-zinc-500" />
                        <span className="text-sm font-bold text-zinc-900">Rack {String(selectedRack + 1).padStart(2, '0')}</span>
                      </div>
                      <span className="text-[11px] text-zinc-400">{selectedRackSites.length} of {SERVERS_PER_RACK} slots used</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigateRack(1); }}
                      disabled={selectedRack >= racks.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] disabled:opacity-20 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedRack(null); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] transition-colors"
                  >
                    <X className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>

                {/* Server list */}
                <div className="px-3 py-2 space-y-1 max-h-[260px] overflow-y-auto">
                  {selectedRackSites.map((site) => {
                    const cfg = SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio;
                    const Icon = site.cloned_from ? Layers : cfg.icon;
                    return (
                      <Link key={site.id} to={`/${site.slug}`} data-testid={`server-blade-${site.slug}`}>
                        <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/[0.04] transition-colors cursor-pointer">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color, boxShadow: `0 0 6px ${cfg.color}60` }} />
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${cfg.color}12` }}>
                            <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-zinc-800 group-hover:text-zinc-950 truncate">{site.name}</div>
                            <div className="text-[11px] text-zinc-400">/{site.slug} &middot; {site.user_count || 0} users</div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${cfg.color}12`, color: cfg.color }}>{cfg.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {/* Empty slots */}
                  {Array.from({ length: SERVERS_PER_RACK - selectedRackSites.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-40">
                      <div className="w-2 h-2 rounded-full bg-zinc-300 flex-shrink-0" />
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 flex-shrink-0" />
                      <span className="text-xs text-zinc-400 italic">Empty slot</span>
                    </div>
                  ))}
                </div>

                {/* Rack nav footer */}
                <div className="px-5 py-2.5 border-t border-black/[0.05] flex justify-center">
                  <div className="flex gap-1.5">
                    {racks.map((_, i) => (
                      <button
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setSelectedRack(i); }}
                        className={`w-2 h-2 rounded-full transition-all ${selectedRack === i ? 'bg-orange-500 w-5' : 'bg-zinc-300 hover:bg-zinc-400'}`}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Bottom Row ── */}
        <div className="flex items-end justify-between flex-shrink-0">
          <Panel className="p-3.5 flex items-center gap-4" delay={0.15} testId="panel-team">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">Users</span>
              <span className="text-lg font-bold text-zinc-900">{totalUsers}</span>
            </div>
            <div className="w-px h-6 bg-black/[0.06]" />
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">Racks</span>
              <span className="text-lg font-bold text-zinc-900">{racks.length}</span>
            </div>
          </Panel>

          {/* Click hint */}
          {selectedRack === null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="text-xs text-zinc-400 bg-white/60 backdrop-blur-xl rounded-full px-4 py-2 border border-black/[0.05]"
            >
              Click a rack to view servers
            </motion.div>
          )}

          <Panel className="p-3.5 flex items-center gap-3" delay={0.2} testId="panel-status">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
            <span className="text-sm font-medium text-zinc-700">All systems operational</span>
            <div className="w-px h-5 bg-black/[0.06]" />
            <Zap className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-zinc-900">{sites.length}/{sites.length}</span>
          </Panel>
        </div>
      </div>
    </div>
  );
}
