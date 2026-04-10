import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, HardDrive, Network, LayoutGrid, ExternalLink, Shield, ShieldCheck,
  Layers, Users, Plus, Server, ChevronLeft, ChevronRight, X, Zap, Pencil, Trash2,
  ShieldOff, Loader2
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
const RACK_GAP = 24;
const MIN_RACK_W = 280;
const MAX_RACK_W = 420;
const ARROW_SPACE = 100;

/* ════════════════════════════════════════════════════
   ISOMETRIC 3D SERVER RACK (Clara style)
   Each rack is an isometric room card
   ════════════════════════════════════════════════════ */
const ServerRack3D = ({ rackIndex, sites, isSelected, onClick, width = 320, firewallStatus = {} }) => {
  const cfg0 = sites[0] ? (SITE_TYPE_CONFIG[sites[0].site_type] || SITE_TYPE_CONFIG.radio) : null;
  const accentColor = cfg0?.color || '#71717a';

  // Check if ALL sites in this rack have firewall enabled
  const allProtected = sites.length > 0 && sites.every(s => firewallStatus[s.id] === true);
  const someProtected = sites.some(s => firewallStatus[s.id] === true);

  return (
    <motion.div
      data-testid={`rack-visual-${rackIndex}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rackIndex * 0.1 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="cursor-pointer group relative flex-shrink-0"
      style={{ width }}
    >
      {/* Card */}
      <div
        className={`relative rounded-2xl overflow-hidden transition-all duration-300 border ${
          isSelected
            ? 'border-orange-300 shadow-[0_8px_40px_rgba(249,115,22,0.15)] scale-[1.03]'
            : 'border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02]'
        }`}
        style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}
      >
        {/* Room image area */}
        <div className="relative overflow-hidden bg-[#F0F0F2]" style={{ height: Math.round(width * 0.656) }}>
          <img
            src="/images/env_server.jpg"
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            style={{
              WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
            }}
          />
          {/* Rack number badge */}
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
            <span className="text-[10px] font-bold text-zinc-500 tracking-wider">RACK {String(rackIndex + 1).padStart(2, '0')}</span>
          </div>
          {/* Status indicator */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-1 border border-black/[0.06] shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
            <span className="text-[10px] font-semibold text-emerald-600">Online</span>
          </div>
          {/* Clara Global Protect badge */}
          {allProtected && (
            <div className="absolute bottom-2 left-3 right-3 flex items-center gap-1.5 bg-emerald-500/90 backdrop-blur-lg rounded-lg px-2.5 py-1.5 border border-emerald-400/30 shadow-sm" data-testid={`rack-firewall-${rackIndex}`}>
              <ShieldCheck className="w-3.5 h-3.5 text-white flex-shrink-0" />
              <span className="text-[10px] font-bold text-white tracking-wide">Clara Global Protect</span>
            </div>
          )}
          {someProtected && !allProtected && (
            <div className="absolute bottom-2 left-3 right-3 flex items-center gap-1.5 bg-amber-500/90 backdrop-blur-lg rounded-lg px-2.5 py-1.5 border border-amber-400/30 shadow-sm" data-testid={`rack-firewall-partial-${rackIndex}`}>
              <Shield className="w-3.5 h-3.5 text-white flex-shrink-0" />
              <span className="text-[10px] font-bold text-white tracking-wide">Partial Protection</span>
            </div>
          )}
        </div>

        {/* Server list */}
        <div className="px-3.5 py-3 space-y-[6px]">
          {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => {
            const site = sites[i];
            const cfg = site ? (SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio) : null;
            const Icon = site ? (site.cloned_from ? Layers : cfg.icon) : null;

            if (!site) {
              return (
                <div key={i} className="h-[40px] rounded-lg border border-dashed border-black/[0.06] bg-black/[0.01] flex items-center justify-center">
                  <span className="text-[9px] text-zinc-300 tracking-wide font-medium">EMPTY SLOT</span>
                </div>
              );
            }

            return (
              <div
                key={i}
                className="h-[40px] rounded-lg flex items-center gap-2.5 px-3 transition-all duration-150"
                style={{
                  background: `linear-gradient(90deg, ${cfg.color}08 0%, transparent 100%)`,
                  border: `1px solid ${cfg.color}15`,
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cfg.color, boxShadow: `0 0 4px ${cfg.color}60` }}
                />
                <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: cfg.color }} />
                <span className="text-xs font-semibold text-zinc-700 truncate flex-1">{site.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0" style={{ backgroundColor: `${cfg.color}10`, color: cfg.color }}>{cfg.label}</span>
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div className="px-3 py-2 border-t border-black/[0.04] flex items-center justify-between">
          <div className="flex gap-1">
            {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => (
              <div
                key={i}
                className="w-[5px] h-[5px] rounded-full transition-colors"
                style={{
                  backgroundColor: i < sites.length ? '#22c55e' : '#e4e4e7',
                  boxShadow: i < sites.length ? '0 0 4px #22c55e60' : 'none',
                }}
              />
            ))}
          </div>
          <span className="text-[10px] text-zinc-400 font-medium">{sites.length}/{SERVERS_PER_RACK} servers</span>
        </div>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <motion.div
          layoutId="rack-select-bar"
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 w-12 rounded-full bg-orange-500"
          style={{ boxShadow: '0 0 12px rgba(249,115,22,0.5)' }}
        />
      )}
    </motion.div>
  );
};

/* ════════════════════════════════════════════════════
   MAIN VIEW
   ════════════════════════════════════════════════════ */
export default function ServerRackView({ sites, onCreateSite, onEditSite, onDeleteSite, environments, selectedEnvId, user }) {
  const [selectedRack, setSelectedRack] = useState(null);
  const [carouselPage, setCarouselPage] = useState(0);
  const [firewallStatus, setFirewallStatus] = useState({});
  const [firewallLoading, setFirewallLoading] = useState(false);

  const fetchFirewallStatus = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const API = process.env.REACT_APP_BACKEND_URL;
    fetch(`${API}/api/firewall/status/bulk`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.status) setFirewallStatus(data.status); })
      .catch(() => {});
  };

  /* ── Fetch firewall status for all sites ── */
  useEffect(() => { fetchFirewallStatus(); }, [sites]);

  const handleToggleRackFirewall = async (rackSites, enable) => {
    const token = localStorage.getItem('token');
    if (!token || !rackSites.length) return;
    setFirewallLoading(true);
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${API}/api/firewall/enable-rack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_ids: rackSites.map(s => s.id), enabled: enable }),
      });
      if (res.ok) fetchFirewallStatus();
    } catch (e) { /* silent */ }
    setFirewallLoading(false);
  };

  /* ── Dynamic sizing: measure container & compute visible rack count + width ── */
  const rackAreaRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = rackAreaRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const envName = environments?.find(e => e.id === selectedEnvId)?.name || 'Production';

  const racks = useMemo(() => {
    const result = [];
    for (let i = 0; i < sites.length; i += SERVERS_PER_RACK) {
      result.push(sites.slice(i, i + SERVERS_PER_RACK));
    }
    if (result.length === 0) result.push([]);
    return result;
  }, [sites]);

  const visibleCount = useMemo(() => {
    if (!containerWidth) return 3;
    const usable = containerWidth - ARROW_SPACE;
    const count = Math.floor((usable + RACK_GAP) / (MIN_RACK_W + RACK_GAP));
    return Math.max(1, Math.min(count, racks.length));
  }, [containerWidth, racks.length]);

  const rackWidth = useMemo(() => {
    if (!containerWidth) return 320;
    const usable = containerWidth - ARROW_SPACE;
    const totalGap = (visibleCount - 1) * RACK_GAP;
    const w = Math.floor((usable - totalGap) / visibleCount);
    return Math.min(MAX_RACK_W, Math.max(MIN_RACK_W, w));
  }, [containerWidth, visibleCount]);

  const maxPage = Math.max(0, racks.length - visibleCount);
  const safeCarouselPage = Math.min(carouselPage, maxPage);
  const visibleRacks = racks.slice(safeCarouselPage, safeCarouselPage + visibleCount);

  const totalUsers = sites.reduce((sum, s) => sum + (s.user_count || 0), 0);
  const selectedRackSites = selectedRack !== null ? (racks[selectedRack] || []) : [];

  const navigateRack = (dir) => {
    if (selectedRack === null) return;
    const next = selectedRack + dir;
    if (next >= 0 && next < racks.length) setSelectedRack(next);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#F0F0F2]" data-testid="server-rack-view">
      {/* Subtle dot pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, #999 0.5px, transparent 0.5px)',
        backgroundSize: '24px 24px',
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
        <div ref={rackAreaRef} className="flex-1 flex items-center justify-center relative">

          {/* Carousel prev arrow */}
          {safeCarouselPage > 0 && (
            <button
              onClick={() => setCarouselPage(p => Math.max(0, p - 1))}
              className="absolute left-2 z-20 w-10 h-10 rounded-full bg-white/90 shadow-lg border border-black/[0.06] flex items-center justify-center hover:bg-white transition-colors"
              data-testid="rack-carousel-prev"
            >
              <ChevronLeft className="w-5 h-5 text-zinc-600" />
            </button>
          )}

          {/* Racks - carousel */}
          <div className="flex items-start gap-6 relative z-10">
            <AnimatePresence mode="popLayout">
              {visibleRacks.map((rackSites, vi) => {
                const actualIndex = carouselPage + vi;
                return (
                  <motion.div
                    key={`rack-${actualIndex}`}
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, delay: vi * 0.05 }}
                  >
                    <ServerRack3D
                      rackIndex={actualIndex}
                      sites={rackSites}
                      isSelected={selectedRack === actualIndex}
                      onClick={() => setSelectedRack(selectedRack === actualIndex ? null : actualIndex)}
                      width={rackWidth}
                      firewallStatus={firewallStatus}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Carousel next arrow */}
          {safeCarouselPage < maxPage && (
            <button
              onClick={() => setCarouselPage(p => Math.min(maxPage, p + 1))}
              className="absolute right-2 z-20 w-10 h-10 rounded-full bg-white/90 shadow-lg border border-black/[0.06] flex items-center justify-center hover:bg-white transition-colors"
              data-testid="rack-carousel-next"
            >
              <ChevronRight className="w-5 h-5 text-zinc-600" />
            </button>
          )}

          {/* Carousel dots */}
          {racks.length > visibleCount && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
              {Array.from({ length: maxPage + 1 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCarouselPage(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === carouselPage ? 'bg-orange-500' : 'bg-zinc-300 hover:bg-zinc-400'}`}
                />
              ))}
            </div>
          )}
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

                  {/* Firewall toggle */}
                  {selectedRackSites.length > 0 && (() => {
                    const allOn = selectedRackSites.every(s => firewallStatus[s.id] === true);
                    const someOn = selectedRackSites.some(s => firewallStatus[s.id] === true);
                    return (
                      <div className="px-4 py-3 border-b border-black/[0.05] flex-shrink-0" data-testid="rack-firewall-toggle">
                        <button
                          disabled={firewallLoading}
                          onClick={(e) => { e.stopPropagation(); handleToggleRackFirewall(selectedRackSites, !allOn); }}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                            allOn
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                              : 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600'
                          }`}
                          data-testid="rack-firewall-toggle-btn"
                        >
                          {firewallLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : allOn ? (
                            <><ShieldCheck className="w-4 h-4" /><span>Protected — Disable Firewall</span></>
                          ) : someOn ? (
                            <><Shield className="w-4 h-4" /><span>Enable All Firewalls</span></>
                          ) : (
                            <><ShieldOff className="w-4 h-4" /><span>Enable Firewall</span></>
                          )}
                        </button>
                        {someOn && !allOn && (
                          <p className="text-[10px] text-amber-600 text-center mt-1.5">Some servers are not yet protected</p>
                        )}
                      </div>
                    );
                  })()}

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
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              {onEditSite && (
                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditSite(site); }} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors" data-testid={`edit-site-${site.slug}`}>
                                  <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                              )}
                              {onDeleteSite && (
                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteSite(site.id, site.name); }} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors" data-testid={`delete-site-${site.slug}`}>
                                  <Trash2 className="w-3.5 h-3.5 text-zinc-400 hover:text-red-500" />
                                </button>
                              )}
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
