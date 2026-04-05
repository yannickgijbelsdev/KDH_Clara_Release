import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Globe, Radio, HardDrive, Network, LayoutGrid, ExternalLink, Shield,
  Wrench, Layers, Users, Activity, Plus, Server
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const SITE_TYPE_CONFIG = {
  radio:          { icon: Radio,        color: '#f97316', bg: 'bg-orange-500/15', label: 'Radio' },
  server:         { icon: HardDrive,    color: '#3b82f6', bg: 'bg-blue-500/15',   label: 'Datacenter' },
  technical:      { icon: Network,      color: '#10b981', bg: 'bg-emerald-500/15', label: 'Data Conn.' },
  task_scheduler: { icon: LayoutGrid,   color: '#8b5cf6', bg: 'bg-violet-500/15', label: 'Tasks' },
  external_host:  { icon: ExternalLink, color: '#06b6d4', bg: 'bg-cyan-500/15',   label: 'Ext. Host' },
  wp_security:    { icon: Shield,       color: '#ef4444', bg: 'bg-red-500/15',    label: 'WP Security' },
};

const SERVERS_PER_RACK = 5;

const ServerBlade = ({ site, index }) => {
  const config = SITE_TYPE_CONFIG[site.site_type] || SITE_TYPE_CONFIG.radio;
  const Icon = site.cloned_from ? Layers : config.icon;
  const ledColor = config.color;

  return (
    <Link to={`/${site.slug}`} data-testid={`server-blade-${site.slug}`}>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04, duration: 0.3 }}
        className="group relative flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 hover:border-zinc-500/60 hover:bg-zinc-700/70 transition-all duration-200 cursor-pointer"
      >
        {/* Status LED */}
        <div className="relative flex-shrink-0">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ledColor, boxShadow: `0 0 6px ${ledColor}80` }} />
        </div>

        {/* Server icon */}
        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${config.bg}`}>
          <Icon className="w-3.5 h-3.5" style={{ color: ledColor }} />
        </div>

        {/* Server info */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
            {site.name}
          </div>
          <div className="text-[10px] text-zinc-500 truncate">/{site.slug}</div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2.5 flex-shrink-0 text-[10px] text-zinc-500">
          <span className="flex items-center gap-0.5"><Layers className="w-3 h-3" />{site.site_count || 0}</span>
          <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{site.user_count || 0}</span>
        </div>

        {/* Hover arrow */}
        <ExternalLink className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300 transition-colors flex-shrink-0" />
      </motion.div>
    </Link>
  );
};

const ServerRack = ({ rackIndex, sites, rackNumber, totalRacks }) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay: rackIndex * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    className="flex flex-col"
    data-testid={`server-rack-${rackIndex}`}
  >
    {/* Rack frame */}
    <div className="bg-zinc-900/75 backdrop-blur-2xl rounded-xl border border-zinc-700/40 shadow-[0_8px_40px_rgba(0,0,0,0.25)] overflow-hidden">
      {/* Rack header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/40 bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
            Rack {String(rackNumber).padStart(2, '0')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">{sites.length}/{SERVERS_PER_RACK}</span>
          {/* Rack LED strip */}
          <div className="flex gap-0.5 ml-1">
            {Array.from({ length: SERVERS_PER_RACK }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: i < sites.length ? '#22c55e' : '#27272a',
                  boxShadow: i < sites.length ? '0 0 4px #22c55e60' : 'none'
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Server slots */}
      <div className="p-2.5 space-y-1.5">
        {sites.map((site, i) => (
          <ServerBlade key={site.id} site={site} index={i} />
        ))}
        {/* Empty slots */}
        {Array.from({ length: SERVERS_PER_RACK - sites.length }).map((_, i) => (
          <div key={`empty-${i}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-zinc-800/60 bg-zinc-900/30">
            <div className="w-2 h-2 rounded-full bg-zinc-800" />
            <div className="w-7 h-7 rounded-md bg-zinc-800/30" />
            <span className="text-[11px] text-zinc-700 italic">Empty slot</span>
          </div>
        ))}
      </div>

      {/* Rack footer ventilation */}
      <div className="h-2 bg-zinc-800/40 border-t border-zinc-700/30 flex items-center justify-center gap-1 px-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="w-6 h-[2px] rounded-full bg-zinc-700/50" />
        ))}
      </div>
    </div>
  </motion.div>
);

export default function ServerRackView({ sites, onCreateSite, environments, selectedEnvId }) {
  // Split sites into racks
  const racks = [];
  for (let i = 0; i < sites.length; i += SERVERS_PER_RACK) {
    racks.push(sites.slice(i, i + SERVERS_PER_RACK));
  }

  // Always show at least 1 rack (or the "new rack" prompt)
  if (racks.length === 0) {
    racks.push([]);
  }

  const envName = environments?.find(e => e.id === selectedEnvId)?.name || 'Production';

  return (
    <div className="h-full overflow-auto p-4 sm:p-6" data-testid="server-rack-view">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 backdrop-blur-xl rounded-xl border border-white/10">
            <Server className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Clara Datacenter</h1>
            <p className="text-xs text-zinc-400">
              {sites.length} server{sites.length !== 1 ? 's' : ''} across {racks.length} rack{racks.length !== 1 ? 's' : ''} in {envName}
            </p>
          </div>
        </div>
        <Button
          onClick={onCreateSite}
          className="gap-2 bg-zinc-800/80 hover:bg-zinc-700/80 backdrop-blur-xl border border-zinc-600/30 text-white shadow-lg"
          data-testid="create-site-btn"
        >
          <Plus className="w-4 h-4" />
          New Server
        </Button>
      </motion.div>

      {/* Rack grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {racks.map((rackSites, i) => (
          <ServerRack
            key={i}
            rackIndex={i}
            rackNumber={i + 1}
            sites={rackSites}
            totalRacks={racks.length}
          />
        ))}
      </div>

      {/* Floor reflection */}
      <div className="mt-8 h-px bg-gradient-to-r from-transparent via-zinc-600/20 to-transparent" />
      <div className="text-center mt-3">
        <span className="text-[10px] text-zinc-600 tracking-widest uppercase">Clara Network Infrastructure</span>
      </div>
    </div>
  );
}
