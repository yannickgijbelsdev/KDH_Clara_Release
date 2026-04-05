import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, HardDrive, Network, LayoutGrid, ExternalLink, Shield,
  Layers, Users, Plus, Server, ChevronLeft, ChevronRight, X, Zap
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const SITE_TYPE_CONFIG = {
  radio:          { icon: Radio,        color: '#f97316', label: 'Radio' },
  server:         { icon: HardDrive,    color: '#3b82f6', label: 'Datacenter' },
  technical:      { icon: Network,      color: '#10b981', label: 'Data Conn.' },
  task_scheduler: { icon: LayoutGrid,   color: '#8b5cf6', label: 'Tasks' },
  external_host:  { icon: ExternalLink, color: '#06b6d4', label: 'Ext. Host' },
  wp_security:    { icon: Shield,       color: '#ef4444', label: 'WP Security' },
};

const SERVERS_PER_RACK = 5;

/* ════════════════════════════════════════════════════
   CSS-DRAWN 3D SERVER RACK
   Each rack is a tall cabinet rendered entirely with CSS.
   ════════════════════════════════════════════════════ */
const ServerRack3D = ({ rackIndex, sites, isSelected, onClick }) => {
  const cfg0 = sites[0] ? (SITE_TYPE_CONFIG[sites[0].site_type] || SITE_TYPE_CONFIG.radio) : null;
  const accentColor = cfg0?.color || '#71717a';

  return (
    <motion.div
      data-testid={`rack-visual-${rackIndex}`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rackIndex * 0.12 + 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="cursor-pointer group relative flex-shrink-0"
      style={{ perspective: '600px' }}
    >
      {/* Selection glow on the floor */}
      {isSelected && (
        <motion.div
          layoutId="floor-glow"
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[130%] h-6 rounded-full"
          style={{ background: `radial-gradient(ellipse, ${accentColor}40, transparent)`, filter: 'blur(6px)' }}
        />
      )}

      {/* The 3D rack cabinet */}
      <div
        className={`relative transition-transform duration-300 ${isSelected ? 'scale-105' : 'group-hover:scale-[1.03]'}`}
        style={{ transformStyle: 'preserve-3d', width: 200 }}
      >
        {/* ── Rack top ── */}
        <div
          className="h-4 rounded-t-md relative z-10"
          style={{
            background: isSelected
              ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`
              : 'linear-gradient(135deg, #52525b, #3f3f46)',
            boxShadow: isSelected ? `0 -4px 20px ${accentColor}40` : 'none',
          }}
        >
          {/* Ventilation grille */}
          <div className="flex justify-center gap-[2px] pt-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="w-[4px] h-[2px] rounded-full bg-black/20" />
            ))}
          </div>
        </div>

        {/* ── Rack body ── */}
        <div
          className="rounded-b-md overflow-hidden relative"
          style={{
            background: 'linear-gradient(180deg, #1a1a1e 0%, #111113 100%)',
            boxShadow: isSelected
              ? `0 12px 40px ${accentColor}25, inset 0 1px 0 rgba(255,255,255,0.06)`
              : '0 8px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
            border: isSelected ? `1px solid ${accentColor}50` : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Rack rails (left + right) */}
          <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-gradient-to-b from-zinc-600/30 to-zinc-700/20 border-r border-white/[0.03]" />
          <div className="absolute right-0 top-0 bottom-0 w-[6px] bg-gradient-to-b from-zinc-600/30 to-zinc-700/20 border-l border-white/[0.03]" />

          {/* Server blades */}
          <div className="px-[10px] py-2 space-y-[5px]">
            {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => {
              const site = sites[i];
              const cfg = site ? (SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio) : null;
              const Icon = site ? (site.cloned_from ? Layers : cfg.icon) : null;

              if (!site) {
                // Empty slot
                return (
                  <div key={i} className="relative h-[48px] rounded-[3px] border border-dashed border-white/[0.04] bg-white/[0.01] flex items-center justify-center">
                    <span className="text-[9px] text-zinc-700 tracking-wide">EMPTY SLOT</span>
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  className="relative h-[48px] rounded-[4px] flex items-center gap-2.5 px-3 transition-all duration-200 group/blade"
                  style={{
                    background: `linear-gradient(90deg, ${cfg.color}18 0%, ${cfg.color}06 60%, transparent 100%)`,
                    border: `1px solid ${cfg.color}25`,
                    boxShadow: isSelected ? `inset 0 0 12px ${cfg.color}10` : 'none',
                  }}
                >
                  {/* Status LED */}
                  <div className="flex flex-col gap-[2px] flex-shrink-0">
                    <div
                      className="w-[6px] h-[6px] rounded-full"
                      style={{ backgroundColor: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
                    />
                    <div
                      className="w-[6px] h-[6px] rounded-full bg-emerald-500"
                      style={{ boxShadow: '0 0 4px #22c55e80' }}
                    />
                  </div>

                  {/* Icon */}
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${cfg.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-zinc-300 truncate leading-tight">{site.name}</div>
                    <div className="text-[8px] text-zinc-600 truncate">/{site.slug}</div>
                  </div>

                  {/* Activity indicator */}
                  <div className="flex gap-[2px] flex-shrink-0">
                    {[0.3, 0.6, 1, 0.7, 0.4].map((h, j) => (
                      <motion.div
                        key={j}
                        animate={{ height: [h * 8, h * 14, h * 8] }}
                        transition={{ duration: 1.5 + j * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-[2px] rounded-full"
                        style={{ backgroundColor: `${cfg.color}60` }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom panel — power + indicators */}
          <div className="px-3 py-2 border-t border-white/[0.04] flex items-center justify-between">
            <div className="flex gap-[4px]">
              {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => (
                <div
                  key={i}
                  className="w-[6px] h-[6px] rounded-full"
                  style={{
                    backgroundColor: i < sites.length ? '#22c55e' : '#27272a',
                    boxShadow: i < sites.length ? '0 0 6px #22c55e80' : 'none',
                  }}
                />
              ))}
            </div>
            <div className="text-[8px] text-zinc-600 font-mono tracking-wider">
              RACK-{String(rackIndex + 1).padStart(2, '0')}
            </div>
          </div>
        </div>

        {/* ── Rack feet ── */}
        <div className="flex justify-between px-2 -mt-[1px]">
          <div className="w-3 h-2 bg-zinc-700 rounded-b-sm" />
          <div className="w-3 h-2 bg-zinc-700 rounded-b-sm" />
        </div>
      </div>

      {/* Rack label */}
      <div className="mt-3 text-center">
        <div className={`text-xs font-bold transition-colors ${isSelected ? 'text-orange-600' : 'text-zinc-500 group-hover:text-zinc-700'}`}>
          Rack {String(rackIndex + 1).padStart(2, '0')}
        </div>
        <div className="text-[10px] text-zinc-400">{sites.length}/{SERVERS_PER_RACK} servers</div>
      </div>
    </motion.div>
  );
};

/* ════════════════════════════════════════════════════
   MAIN VIEW
   ════════════════════════════════════════════════════ */
export default function ServerRackView({ sites, onCreateSite, environments, selectedEnvId, user }) {
  const [selectedRack, setSelectedRack] = useState(null);

  const envName = environments?.find(e => e.id === selectedEnvId)?.name || 'Production';

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

  const navigateRack = (dir) => {
    if (selectedRack === null) return;
    const next = selectedRack + dir;
    if (next >= 0 && next < racks.length) setSelectedRack(next);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#F0F0F2]" data-testid="server-rack-view">
      {/* Subtle grid floor */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `
          linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      {/* Floor gradient */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'linear-gradient(180deg, #F0F0F2 0%, #e8e8ec 60%, #dddde2 100%)',
      }} />

      <div className="absolute inset-0 z-10 flex flex-col p-4 sm:p-5">

        {/* ── Top bar panels ── */}
        <div className="flex items-start justify-between flex-shrink-0 mb-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4"
            data-testid="panel-server-count"
          >
            <div className="text-3xl font-bold text-zinc-900">{sites.length}</div>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">{envName}</div>
              <div className="text-sm font-semibold text-zinc-700">Servers online</div>
            </div>
            <Button onClick={onCreateSite} className="ml-1 bg-orange-500 hover:bg-orange-600 text-white rounded-full px-4 gap-1.5 text-sm shadow-lg shadow-orange-500/20" data-testid="create-site-btn">
              <Plus className="w-3.5 h-3.5" /> New Server
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-3"
            data-testid="panel-stats"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" /><span className="text-sm text-zinc-600">Users</span>
              <span className="text-lg font-bold text-zinc-900">{totalUsers}</span>
            </div>
            <div className="w-px h-6 bg-black/[0.06]" />
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-zinc-400" /><span className="text-sm text-zinc-600">Racks</span>
              <span className="text-lg font-bold text-zinc-900">{racks.length}</span>
            </div>
          </motion.div>
        </div>

        {/* ── Center: THE RACK SCENE ── */}
        <div className="flex-1 flex items-end justify-center relative pb-6">

          {/* Floor shadow / platform */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[85%] max-w-[1000px] h-3 rounded-full bg-black/[0.06] blur-sm" />

          {/* Racks */}
          <div className="flex items-end gap-5 sm:gap-8 relative z-10">
            {racks.map((rackSites, i) => (
              <ServerRack3D
                key={i}
                rackIndex={i}
                sites={rackSites}
                isSelected={selectedRack === i}
                onClick={() => setSelectedRack(selectedRack === i ? null : i)}
              />
            ))}
          </div>

          {/* Rack detail panel — anchored to the side */}
          <AnimatePresence>
            {selectedRack !== null && (
              <motion.div
                key="rack-detail"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-0 bottom-0 w-[340px] flex items-center z-30"
                data-testid="rack-detail-panel"
              >
                <div className="bg-white/90 backdrop-blur-2xl rounded-[20px] border border-black/[0.06] shadow-[0_12px_48px_rgba(0,0,0,0.1)] w-full max-h-[90%] flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.05] flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); navigateRack(-1); }} disabled={selectedRack === 0} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] disabled:opacity-20 transition-colors">
                        <ChevronLeft className="w-4 h-4 text-zinc-500" />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-zinc-500" />
                          <span className="text-sm font-bold text-zinc-900">Rack {String(selectedRack + 1).padStart(2, '0')}</span>
                        </div>
                        <span className="text-[11px] text-zinc-400">{selectedRackSites.length} of {SERVERS_PER_RACK} slots</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); navigateRack(1); }} disabled={selectedRack >= racks.length - 1} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] disabled:opacity-20 transition-colors">
                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                      </button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedRack(null); }} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] transition-colors">
                      <X className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>

                  {/* Server list */}
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                    {selectedRackSites.map((site) => {
                      const cfg = SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio;
                      const Icon = site.cloned_from ? Layers : cfg.icon;
                      return (
                        <Link key={site.id} to={`/${site.slug}`} data-testid={`server-blade-${site.slug}`}>
                          <div className="group flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-black/[0.04] transition-colors">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color, boxShadow: `0 0 8px ${cfg.color}60` }} />
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${cfg.color}12` }}>
                              <Icon className="w-4.5 h-4.5" style={{ color: cfg.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-zinc-800 group-hover:text-zinc-950 truncate">{site.name}</div>
                              <div className="text-[11px] text-zinc-400">/{site.slug} &middot; {site.user_count || 0} users &middot; {site.site_count || 0} sites</div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ backgroundColor: `${cfg.color}12`, color: cfg.color }}>{cfg.label}</span>
                          </div>
                        </Link>
                      );
                    })}
                    {Array.from({ length: SERVERS_PER_RACK - selectedRackSites.length }).map((_, i) => (
                      <div key={`empty-${i}`} className="flex items-center gap-3 px-3 py-3 rounded-xl opacity-30">
                        <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                        <div className="w-9 h-9 rounded-xl bg-zinc-100" />
                        <span className="text-xs text-zinc-400 italic">Empty slot</span>
                      </div>
                    ))}
                  </div>

                  {/* Rack dots */}
                  <div className="px-5 py-2.5 border-t border-black/[0.05] flex justify-center flex-shrink-0">
                    <div className="flex gap-1.5">
                      {racks.map((_, i) => (
                        <button key={i} onClick={(e) => { e.stopPropagation(); setSelectedRack(i); }} className={`h-2 rounded-full transition-all ${selectedRack === i ? 'bg-orange-500 w-6' : 'bg-zinc-300 hover:bg-zinc-400 w-2'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Bottom bar ── */}
        <div className="flex items-end justify-between flex-shrink-0">
          {selectedRack === null && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.5 }}
              className="text-xs text-zinc-400 bg-white/60 backdrop-blur-xl rounded-full px-4 py-2 border border-black/[0.05]"
            >
              Click a server rack to inspect its servers
            </motion.div>
          )}
          <div className="flex-1" />
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-3.5 flex items-center gap-3"
            data-testid="panel-status"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
            <span className="text-sm font-medium text-zinc-700">All systems operational</span>
            <div className="w-px h-5 bg-black/[0.06]" />
            <Zap className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-zinc-900">{sites.length}/{sites.length}</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
