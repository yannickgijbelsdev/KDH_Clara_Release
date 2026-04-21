import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import {
  Radio, HardDrive, Network, LayoutGrid, ExternalLink, Shield,
  Check, ChevronRight, ChevronLeft, User, Lock, Zap, Loader2,
  Upload, X, Disc3, Video, Palette, FileCode, Key, Podcast,
  Plus, Trash2, GripVertical, Music, Globe, Eye, EyeOff,
  CheckCircle2, XCircle, Code2
} from 'lucide-react';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

import WizardStepIndicator from './WizardStepIndicator';
import ClaraErrorButton from '../ClaraErrorButton';
import { claraToast } from '../../utils/claraToast';

const API = process.env.REACT_APP_BACKEND_URL;

/* ── Background images per type ── */
const SITE_TYPE_BACKGROUNDS = {
  radio: '/images/env_radio.jpg',
  server: '/images/env_server.jpg',
  external_host: '/images/env_external_host.jpg',
  task_scheduler: '/images/env_task_scheduler.jpg',
  technical: '/images/env_technical.jpg',
  wp_security: '/images/env_wp_security.jpg',
  code_studio: '/images/env_code_studio.jpg',
};
const WIZARD_THUMBNAILS = {
  radio: '/images/wiz_radio.jpg',
  server: '/images/wiz_server.jpg',
  external_host: '/images/wiz_external_host.jpg',
  task_scheduler: '/images/wiz_task_scheduler.jpg',
  technical: '/images/wiz_technical.jpg',
  wp_security: '/images/wiz_wp_security.jpg',
  code_studio: '/images/wiz_code_studio.jpg',
};

const SITE_TYPES = [
  { id: 'radio',          icon: Radio,       label: 'Radio Station',     desc: 'Shows, calendar, content library, RDS',    color: '#dd0c51', features: ['shows', 'calendar', 'content_library', 'media_library', 'team_chat', 'rds_settings'], optionalFeatures: [] },
  { id: 'server',         icon: HardDrive,   label: 'Virtual Datacenter', desc: 'XML imports, VMix, Radio Automation',      color: '#3b82f6', features: ['team_settings'], optionalFeatures: ['xml_imports', 'server_api_keys', 'vmix_director', 'canva_director', 'radioplayer', 'radio_automation'] },
  { id: 'external_host',  icon: ExternalLink, label: 'External Host',    desc: 'External site hosting & monitoring',        color: '#06b6d4', features: ['sites', 'team_settings'], optionalFeatures: [] },
  { id: 'task_scheduler', icon: LayoutGrid,  label: 'Task Manager',      desc: 'Task boards, project management',          color: '#8b5cf6', features: ['task_boards', 'team_settings'], optionalFeatures: [] },
  { id: 'technical',      icon: Network,     label: 'Data Connection',   desc: 'ZeroTier networking, data connections',     color: '#10b981', features: ['zerotier', 'team_settings'], optionalFeatures: [] },
  { id: 'wp_security',    icon: Shield,      label: 'WP Security',       desc: 'WordPress firewall & security scanning',    color: '#ef4444', features: ['wp_security', 'team_settings'], optionalFeatures: [] },
  { id: 'code_studio',    icon: Code2,       label: 'Code Studio',       desc: 'Low-code web builder with drag & drop',     color: '#7c1ac8', features: ['code_studio', 'team_settings'], optionalFeatures: [] },
];

/* ── Optional feature details for the server type ── */
const OPTIONAL_FEATURE_INFO = {
  xml_imports:      { icon: FileCode,  label: 'XML Imports',        desc: 'Import and process XML data feeds',     color: '#3b82f6' },
  server_api_keys:  { icon: Key,       label: 'API Keys',           desc: 'Manage server API keys and tokens',     color: '#6b7280' },
  vmix_director:    { icon: Video,     label: 'VMix Director',      desc: 'Video mixing and live production',      color: '#8b5cf6' },
  canva_director:   { icon: Palette,   label: 'Canva Director',     desc: 'Visual design and graphics control',    color: '#ec4899' },
  radioplayer:      { icon: Podcast,   label: 'Radioplayer',        desc: 'Radioplayer API integration',           color: '#06b6d4' },
  radio_automation: { icon: Disc3,     label: 'Radio Automation',   desc: 'A/B player, playlists, cloud playout',  color: '#dd0c51' },
};

const MAIN_SITE_STEPS = ['Choosing a server', 'Features', 'Details', 'Admin', 'Security', 'Deploying'];

/* ── Step 1: Choose Server ── */
const StepEnvironment = ({ selected, onSelect }) => (
  <div>
    <h2 className="text-xl font-bold text-zinc-900 mb-1">Choose your Clara server</h2>
    <p className="text-sm text-zinc-500 mb-4">Select the type of server rack you want to deploy.</p>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
      {SITE_TYPES.map(type => {
        const Icon = type.icon;
        const isActive = selected === type.id;
        return (
          <button
            key={type.id}
            onClick={() => onSelect(type.id)}
            data-testid={`type-card-${type.id}`}
            className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-300 text-left group ${
              isActive ? 'border-zinc-900 shadow-xl scale-[1.02]' : 'border-zinc-200 hover:border-zinc-400 hover:shadow-md'
            }`}
          >
            {/* Background preview */}
            <div className="h-28 relative overflow-hidden bg-white">
              <img
                src={WIZARD_THUMBNAILS[type.id]}
                alt=""
                className={`w-full h-full object-cover transition-all duration-500 ${isActive ? 'scale-110 opacity-90' : 'scale-100 opacity-60 group-hover:opacity-80 group-hover:scale-105'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute top-2 right-2 w-7 h-7 bg-zinc-900 rounded-full flex items-center justify-center"
                >
                  <Check className="w-4 h-4 text-white" />
                </motion.div>
              )}
            </div>
            {/* Label */}
            <div className="px-3 py-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${type.color}15` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: type.color }} />
                </div>
                <span className={`text-sm font-semibold ${isActive ? 'text-zinc-900' : 'text-zinc-700'}`}>{type.label}</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{type.desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

/* ── Step 2: Feature Selection (for types with optional features) ── */
const StepFeatures = ({ siteType, selectedFeatures, onToggleFeature }) => {
  const typeConfig = SITE_TYPES.find(t => t.id === siteType);
  const optionalFeatures = typeConfig?.optionalFeatures || [];

  if (optionalFeatures.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900 mb-1">Choose your features</h2>
      <p className="text-sm text-zinc-500 mb-4">Select which tools you want to activate for this {typeConfig?.label}.</p>
      <div className="grid grid-cols-2 gap-2.5">
        {optionalFeatures.map(featureId => {
          const info = OPTIONAL_FEATURE_INFO[featureId];
          if (!info) return null;
          const Icon = info.icon;
          const isActive = selectedFeatures.includes(featureId);
          return (
            <button
              key={featureId}
              onClick={() => onToggleFeature(featureId)}
              data-testid={`feature-toggle-${featureId}`}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left group ${
                isActive
                  ? 'border-zinc-900 bg-zinc-50 shadow-md'
                  : 'border-zinc-200 hover:border-zinc-400 hover:shadow-sm'
              }`}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                style={{ backgroundColor: isActive ? `${info.color}20` : '#f4f4f5' }}
              >
                <Icon className="w-5 h-5 transition-colors" style={{ color: isActive ? info.color : '#a1a1aa' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold transition-colors ${isActive ? 'text-zinc-900' : 'text-zinc-600'}`}>
                  {info.label}
                </div>
                <div className="text-[11px] text-zinc-400 leading-snug">{info.desc}</div>
              </div>
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <Check className="w-3.5 h-3.5 text-white" />
                </motion.div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ── Step: Content Library (Code Studio only) ── */
const StepContentLibrary = ({ mode, linkedMainSiteId, onModeChange, onLinkChange, token }) => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const res = await fetch(`${API}/api/main-sites`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          // Only show sites that actually have content_library enabled (radio sites typically)
          const withCL = (Array.isArray(data) ? data : []).filter(s =>
            (s.enabled_features || []).includes('content_library')
          );
          setSites(withCL);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    if (token) fetchSites();
  }, [token]);

  const selectMode = (m) => {
    onModeChange(m);
    if (m !== 'linked') onLinkChange('');
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900 mb-1">Content Library (optional)</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Choose how your Code Studio gets news articles for the News Feed block.
      </p>

      <div className="space-y-2">
        {/* Option 1: Skip */}
        <button
          onClick={() => selectMode('none')}
          data-testid="cl-skip-btn"
          className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
            mode === 'none' ? 'border-zinc-900 bg-zinc-50 shadow-md' : 'border-zinc-200 hover:border-zinc-400'
          }`}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: mode === 'none' ? '#18181b15' : '#f4f4f5' }}>
            <XCircle className="w-5 h-5" style={{ color: mode === 'none' ? '#18181b' : '#a1a1aa' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${mode === 'none' ? 'text-zinc-900' : 'text-zinc-600'}`}>No content library</div>
            <div className="text-[11px] text-zinc-400 leading-snug">Skip — you can add one later from settings</div>
          </div>
          {mode === 'none' && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" />
            </motion.div>
          )}
        </button>

        {/* Option 2: Built-in content library */}
        <button
          onClick={() => selectMode('built_in')}
          data-testid="cl-builtin-btn"
          className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
            mode === 'built_in' ? 'border-[#7c1ac8] bg-[#7c1ac8]/5 shadow-md' : 'border-zinc-200 hover:border-zinc-400'
          }`}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: mode === 'built_in' ? '#7c1ac820' : '#f4f4f5' }}>
            <FileCode className="w-5 h-5" style={{ color: mode === 'built_in' ? '#7c1ac8' : '#a1a1aa' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${mode === 'built_in' ? 'text-zinc-900' : 'text-zinc-600'}`}>Built-in content library</div>
            <div className="text-[11px] text-zinc-400 leading-snug">Create your own articles directly inside this Code Studio — no external site needed</div>
          </div>
          {mode === 'built_in' && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-[#7c1ac8] rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" />
            </motion.div>
          )}
        </button>

        {/* Option 3: Link external radio site */}
        <div className={`rounded-2xl border-2 transition-all overflow-hidden ${mode === 'linked' ? 'border-[#dd0c51] bg-[#dd0c51]/5' : 'border-zinc-200'}`}>
          <button
            onClick={() => selectMode('linked')}
            data-testid="cl-linked-btn"
            className="w-full flex items-center gap-3 p-4 text-left"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: mode === 'linked' ? '#dd0c5120' : '#f4f4f5' }}>
              <Radio className="w-5 h-5" style={{ color: mode === 'linked' ? '#dd0c51' : '#a1a1aa' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${mode === 'linked' ? 'text-zinc-900' : 'text-zinc-600'}`}>Link to another content library</div>
              <div className="text-[11px] text-zinc-400 leading-snug">Pull articles from another main site's content library</div>
            </div>
            {mode === 'linked' && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-[#dd0c51] rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-white" />
              </motion.div>
            )}
          </button>

          {/* Radio site picker — only visible when 'linked' is selected */}
          {mode === 'linked' && (
            <div className="border-t border-zinc-200 bg-white p-3 space-y-2">
              {loading && (
                <div className="flex items-center justify-center py-4 text-zinc-400 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Loading sites...
                </div>
              )}
              {!loading && sites.length === 0 && (
                <div className="text-center py-3 px-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-[11px] text-amber-700">No sites with a content library available yet. Create a Radio Station first.</p>
                </div>
              )}
              {!loading && sites.map(site => {
                const isActive = linkedMainSiteId === site.id;
                return (
                  <button
                    key={site.id}
                    onClick={() => onLinkChange(site.id)}
                    data-testid={`cl-site-${site.id}`}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-left ${
                      isActive ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    <Radio className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#dd0c51' : '#a1a1aa' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-zinc-800">{site.name}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">/{site.slug}</div>
                    </div>
                    {isActive && <Check className="w-3.5 h-3.5 text-zinc-900 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Step 3: Details ── */
const StepDetails = ({ name, slug, onNameChange, onSlugChange, siteType }) => {
  const typeConfig = SITE_TYPES.find(t => t.id === siteType);
  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-900 mb-1">Name your server</h2>
      <p className="text-sm text-zinc-500 mb-6">Give your {typeConfig?.label || 'server'} a name and URL slug.</p>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-zinc-700 font-medium">Server Name</Label>
          <Input
            value={name} onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Radiogroup MFY/GRK"
            className="h-12 bg-zinc-50 border-zinc-200 text-zinc-900 rounded-xl text-base"
            autoFocus
            data-testid="wizard-name-input"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-700 font-medium">URL Slug</Label>
          <div className="flex items-center">
            <span className="text-zinc-400 text-base mr-1">/</span>
            <Input
              value={slug} onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="radiogroup-mfy"
              className="h-12 bg-zinc-50 border-zinc-200 text-zinc-900 rounded-xl font-mono text-base"
              data-testid="wizard-slug-input"
            />
          </div>
        </div>
        {/* Preview card */}
        <div className="mt-4 rounded-xl border border-zinc-200 overflow-hidden">
          <div className="h-20 relative">
            <img src={SITE_TYPE_BACKGROUNDS[siteType]} alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent" />
          </div>
          <div className="px-4 py-3 -mt-6 relative">
            <div className="flex items-center gap-2">
              {typeConfig && <typeConfig.icon className="w-4 h-4" style={{ color: typeConfig.color }} />}
              <span className="font-semibold text-zinc-900">{name || 'Server Name'}</span>
            </div>
            <span className="text-xs text-zinc-400 font-mono">/{slug || 'slug'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Station colors palette ── */
const STATION_COLORS = ['#dd0c51', '#8b5cf6', '#3b82f6', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#eab308'];

const STREAM_TYPES = [
  { value: 'shoutcast_v1', label: 'Shoutcast v1' },
  { value: 'shoutcast_v2', label: 'Shoutcast v2' },
  { value: 'icecast', label: 'Icecast' },
];

/* ── Step: RDS Stations ── */
const StepStations = ({ stations, onStationsChange }) => {
  const addStation = () => {
    const idx = stations.length;
    onStationsChange([
      ...stations,
      {
        name: '',
        code: '',
        stream_url: '',
        stream_type: 'shoutcast_v1',
        default_text: '',
        color: STATION_COLORS[idx % STATION_COLORS.length],
        order: idx,
      },
    ]);
  };

  const updateStation = (index, field, value) => {
    const updated = stations.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    // Auto-generate code from name
    if (field === 'name') {
      updated[index].code = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20);
    }
    onStationsChange(updated);
  };

  const removeStation = (index) => {
    onStationsChange(stations.filter((_, i) => i !== index));
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900 mb-1">Configure RDS Stations</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Add the radio stations you want to manage. You can configure their stream URLs and metadata.
      </p>

      <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
        {stations.map((station, idx) => (
          <div
            key={idx}
            className="border border-zinc-200 rounded-2xl p-4 space-y-3 bg-white"
            data-testid={`station-card-${idx}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: station.color }}
                />
                <span className="text-sm font-semibold text-zinc-700">
                  Station {idx + 1}
                </span>
                {station.code && (
                  <span className="text-[11px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                    {station.code}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeStation(idx)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                data-testid={`remove-station-${idx}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Station Name</Label>
                <Input
                  value={station.name}
                  onChange={(e) => updateStation(idx, 'name', e.target.value)}
                  placeholder="e.g. Radio MFY"
                  className="h-9 bg-zinc-50 border-zinc-200 rounded-lg text-sm"
                  data-testid={`station-name-${idx}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Stream Type</Label>
                <select
                  value={station.stream_type}
                  onChange={(e) => updateStation(idx, 'stream_type', e.target.value)}
                  className="w-full h-9 bg-zinc-50 border border-zinc-200 rounded-lg text-sm px-3 text-zinc-700"
                  data-testid={`station-stream-type-${idx}`}
                >
                  {STREAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Stream URL</Label>
              <Input
                value={station.stream_url}
                onChange={(e) => updateStation(idx, 'stream_url', e.target.value)}
                placeholder="http://stream.example.com:8000/stats"
                className="h-9 bg-zinc-50 border-zinc-200 rounded-lg text-sm font-mono"
                data-testid={`station-stream-url-${idx}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Default Text</Label>
                <Input
                  value={station.default_text}
                  onChange={(e) => updateStation(idx, 'default_text', e.target.value)}
                  placeholder="e.g. your favorite hits"
                  className="h-9 bg-zinc-50 border-zinc-200 rounded-lg text-sm"
                  data-testid={`station-default-text-${idx}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Color</Label>
                <div className="flex items-center gap-1.5 h-9">
                  {STATION_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateStation(idx, 'color', c)}
                      className={`w-6 h-6 rounded-full transition-all ${
                        station.color === c ? 'ring-2 ring-offset-1 ring-zinc-900 scale-110' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addStation}
        className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
        data-testid="add-station-btn"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm font-medium">Add Station</span>
      </button>
    </div>
  );
};


/* ── Step: WordPress Settings ── */
const WP_API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ClaraTestResult = ({ status, diagnosis, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200 animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
        <span className="text-sm text-zinc-500">Clara is testing the connection...</span>
      </div>
    );
  }
  if (!diagnosis) return null;
  const isOk = status === 'ok';
  return (
    <div className={`p-3 rounded-lg border text-sm leading-relaxed ${
      isOk ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
    }`} data-testid="clara-test-result">
      <div className="flex items-start gap-2">
        {isOk ? <Check className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" /> : <X className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />}
        <p>{diagnosis}</p>
      </div>
    </div>
  );
};

const StepWordPress = ({ wpConfig, onWpConfigChange }) => {
  const update = (field, value) => onWpConfigChange({ ...wpConfig, [field]: value });
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleTestWithClara = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${WP_API}/clara-test/test-wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(wpConfig),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      } else {
        setTestResult({ status: 'error', diagnosis: 'Could not reach the test service.' });
      }
    } catch {
      setTestResult({ status: 'error', diagnosis: 'Network error while testing.' });
    }
    setTestLoading(false);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900 mb-1">WordPress Connection</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Connect your WordPress site to publish content directly. You can also configure this later.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Site Name</Label>
          <Input
            value={wpConfig.name || ''}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. My WordPress Site"
            className="h-10 bg-zinc-50 border-zinc-200 rounded-lg"
            data-testid="wp-site-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">WordPress URL</Label>
          <div className="relative">
            <Globe className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <Input
              value={wpConfig.wp_base_url || ''}
              onChange={(e) => update('wp_base_url', e.target.value)}
              placeholder="https://example.com"
              className="h-10 bg-zinc-50 border-zinc-200 rounded-lg pl-10"
              data-testid="wp-base-url"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Username</Label>
            <Input
              value={wpConfig.username || ''}
              onChange={(e) => update('username', e.target.value)}
              placeholder="wp-service-account"
              className="h-10 bg-zinc-50 border-zinc-200 rounded-lg"
              data-testid="wp-username"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Application Password</Label>
            <Input
              type="password"
              value={wpConfig.app_password || ''}
              onChange={(e) => update('app_password', e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
              className="h-10 bg-zinc-50 border-zinc-200 rounded-lg"
              data-testid="wp-app-password"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Default Post Type</Label>
            <select
              value={wpConfig.default_post_type || 'post'}
              onChange={(e) => update('default_post_type', e.target.value)}
              className="w-full h-10 bg-zinc-50 border border-zinc-200 rounded-lg text-sm px-3 text-zinc-700"
              data-testid="wp-post-type"
            >
              <option value="post">Post</option>
              <option value="page">Page</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Default Status</Label>
            <select
              value={wpConfig.default_publish_status || 'draft'}
              onChange={(e) => update('default_publish_status', e.target.value)}
              className="w-full h-10 bg-zinc-50 border border-zinc-200 rounded-lg text-sm px-3 text-zinc-700"
              data-testid="wp-publish-status"
            >
              <option value="draft">Draft</option>
              <option value="publish">Publish</option>
            </select>
          </div>
        </div>

        {/* Clara Test Button */}
        <button
          onClick={handleTestWithClara}
          disabled={testLoading || !wpConfig.wp_base_url || !wpConfig.username || !wpConfig.app_password}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-medium hover:from-violet-600 hover:to-indigo-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="clara-test-wp-btn"
        >
          {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Test Connection with Clara
        </button>

        <ClaraTestResult status={testResult?.status} diagnosis={testResult?.diagnosis} loading={testLoading} />

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
          <p className="text-xs text-amber-700">
            <strong>Tip:</strong> Use a WordPress Application Password (not your login password).
            Go to <em>WordPress &rarr; Users &rarr; Profile &rarr; Application Passwords</em> to generate one.
          </p>
        </div>
      </div>
    </div>
  );
};



/* ── Step 3: Admin ── */
const StepAdmin = ({ adminId, onAdminChange, users, token }) => (
  <div>
    <h2 className="text-2xl font-bold text-zinc-900 mb-1">Assign site admin</h2>
    <p className="text-sm text-zinc-500 mb-6">Choose who will manage this server.</p>
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {users.map(u => (
        <button
          key={u.id}
          onClick={() => onAdminChange(u.id)}
          data-testid={`admin-option-${u.id}`}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
            adminId === u.id ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {u.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-semibold text-zinc-800 truncate">{u.name}</div>
            <div className="text-xs text-zinc-400 truncate">{u.email}</div>
          </div>
          {adminId === u.id && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" />
            </motion.div>
          )}
        </button>
      ))}
      {users.length === 0 && <p className="text-sm text-zinc-400 italic py-8 text-center">No users found</p>}
    </div>
  </div>
);

/* ── Step 4: Security ── */
const StepSecurity = ({ require2FA, onToggle2FA, claraEnterprise, onToggleEnterprise, siteType, isSystemAdmin }) => (
  <div>
    <h2 className="text-xl font-bold text-zinc-900 mb-1">Security & Enterprise</h2>
    <p className="text-sm text-zinc-500 mb-5">Configure security policies and enterprise features.</p>
    <div className="space-y-3">
      {/* 2FA Section */}
      <div className="flex gap-3">
        <button
          onClick={() => onToggle2FA(true)}
          data-testid="2fa-enable"
          className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
            require2FA ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${require2FA ? 'bg-emerald-500/15' : 'bg-zinc-100'}`}>
            <Shield className={`w-5 h-5 ${require2FA ? 'text-emerald-600' : 'text-zinc-400'}`} />
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold text-zinc-900">Enforce 2FA</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">All users must enable 2FA</p>
          </div>
          {require2FA && <Check className="w-5 h-5 text-emerald-600" />}
        </button>
        <button
          onClick={() => onToggle2FA(false)}
          data-testid="2fa-disable"
          className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
            !require2FA ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!require2FA ? 'bg-amber-500/15' : 'bg-zinc-100'}`}>
            <Lock className={`w-5 h-5 ${!require2FA ? 'text-amber-600' : 'text-zinc-400'}`} />
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold text-zinc-900">Optional 2FA</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Users choose on their own</p>
          </div>
          {!require2FA && <Check className="w-5 h-5 text-amber-600" />}
        </button>
      </div>

      {/* Enterprise Section — System Admin only */}
      {isSystemAdmin && (
      <div className="pt-2">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Clara Enterprise</p>
        <div className="flex gap-3">
          <button
            onClick={() => onToggleEnterprise(true)}
            data-testid="enterprise-enable"
            className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
              claraEnterprise ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${claraEnterprise ? 'bg-violet-500/15' : 'bg-zinc-100'}`}>
              <Zap className={`w-5 h-5 ${claraEnterprise ? 'text-violet-600' : 'text-zinc-400'}`} />
            </div>
            <div className="flex-1">
              <span className="text-sm font-semibold text-zinc-900">Enterprise Enabled</span>
              <p className="text-[11px] text-zinc-500 mt-0.5">AI assistant, voice support, code review</p>
            </div>
            {claraEnterprise && <Check className="w-5 h-5 text-violet-600" />}
          </button>
          <button
            onClick={() => onToggleEnterprise(false)}
            data-testid="enterprise-disable"
            className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
              !claraEnterprise ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!claraEnterprise ? 'bg-zinc-100' : 'bg-zinc-100'}`}>
              <Lock className={`w-5 h-5 text-zinc-400`} />
            </div>
            <div className="flex-1">
              <span className="text-sm font-semibold text-zinc-900">Standard</span>
              <p className="text-[11px] text-zinc-500 mt-0.5">No enterprise features</p>
            </div>
            {!claraEnterprise && <Check className="w-5 h-5 text-zinc-600" />}
          </button>
        </div>
      </div>
      )}
    </div>
  </div>
);

/* ── Step 5: Deployment Animation ── */
const DeployStep = ({ label, status, delay }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="flex items-center gap-4 py-3"
    data-testid={`deploy-step-${status}`}
  >
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
      {status === 'done' ? (
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center"
        >
          <Check className="w-5 h-5 text-white" />
        </motion.div>
      ) : status === 'failed' ? (
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center"
          data-testid="deploy-step-failed-icon"
        >
          <X className="w-5 h-5 text-white" />
        </motion.div>
      ) : status === 'loading' ? (
        <div className="w-10 h-10 rounded-full border-[3px] border-zinc-200 border-t-zinc-900 animate-spin" />
      ) : (
        <div className="w-10 h-10 rounded-full border-2 border-zinc-200" />
      )}
    </div>
    <span className={`text-sm font-medium transition-colors ${
      status === 'done' ? 'text-emerald-700' : status === 'failed' ? 'text-red-600' : status === 'loading' ? 'text-zinc-900' : 'text-zinc-400'
    }`}>{label}</span>
  </motion.div>
);

const StepDeploying = ({ siteName, siteType, require2FA, features, deployStatus, deployError }) => {
  const typeConfig = SITE_TYPES.find(t => t.id === siteType);
  const bgImg = SITE_TYPE_BACKGROUNDS[siteType];
  const scrollRef = useRef(null);

  const deploySteps = [
    { id: 'rack', label: `Preparing rack space for ${siteName}...` },
    { id: 'env', label: `Deploying ${typeConfig?.label || 'server'} environment...` },
    { id: 'firewall', label: 'Setting up the firewall to keep it safe...' },
    ...(require2FA ? [{ id: '2fa', label: 'Deploying 2FA security policies...' }] : []),
    ...features.map(f => ({ id: f, label: `Enabling ${f.replace(/_/g, ' ')}...` })),
    { id: 'admin', label: 'Assigning site admin permissions...' },
    { id: 'final', label: 'Finalizing your server...' },
  ];

  // Auto-scroll to the active step
  useEffect(() => {
    if (scrollRef.current) {
      const active = scrollRef.current.querySelector('[data-active="true"]');
      if (active) {
        active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [deployStatus]);

  return (
    <div className="text-center">
      {/* Background preview */}
      <div className="relative h-32 rounded-2xl overflow-hidden mb-6">
        <img src={bgImg} alt="" className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          {typeConfig && <typeConfig.icon className="w-5 h-5" style={{ color: typeConfig.color }} />}
          <span className="text-lg font-bold text-zinc-900">{siteName}</span>
        </div>
      </div>

      <h2 className="text-xl font-bold text-zinc-900 mb-1">
        {deployError ? 'Deployment failed' : 'Clara is deploying your server'}
      </h2>
      <p className="text-sm text-zinc-500 mb-6">
        {deployError ? 'Something went wrong during deployment.' : 'This will only take a moment...'}
      </p>

      <div ref={scrollRef} className="text-left max-h-[280px] overflow-y-auto px-2">
        {deploySteps.map((step, i) => {
          const isActive = deployStatus === i;
          let stepStatus;
          if (deployError) {
            stepStatus = deployStatus > i ? 'done' : deployStatus === i ? 'failed' : 'pending';
          } else {
            stepStatus = deployStatus >= deploySteps.length ? 'done' : isActive ? 'loading' : deployStatus > i ? 'done' : 'pending';
          }
          return (
            <div key={step.id} data-active={isActive ? 'true' : undefined}>
              <DeployStep
                label={deployError && deployStatus === i ? deployError : step.label}
                status={stepStatus}
                delay={i * 0.1}
              />
            </div>
          );
        })}
      </div>

      {deployError && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-red-50 rounded-xl border border-red-200"
          data-testid="deploy-error-banner"
        >
          <div className="flex items-center justify-center gap-2 text-red-600 font-semibold text-sm mb-2">
            <X className="w-4 h-4" />
            {deployError}
          </div>
          <div className="flex justify-center">
            <ClaraErrorButton errorMessage={deployError} errorContext="Server deployment" />
          </div>
        </motion.div>
      )}

      {!deployError && deployStatus >= deploySteps.length && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200"
        >
          <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold">
            <Zap className="w-5 h-5" />
            Your server is ready!
          </div>
        </motion.div>
      )}
    </div>
  );
};

/* ── Step: ZeroTier Connection ── */
const StepZeroTier = ({ ztConfig, onZtConfigChange }) => {
  const [showToken, setShowToken] = useState(false);
  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900 mb-1">ZeroTier Connection</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Connect your ZeroTier network to monitor members and manage access. You can also configure this later.
      </p>
      <div className="space-y-4">
        <div>
          <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">API Token</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type={showToken ? 'text' : 'password'}
              value={ztConfig.api_token}
              onChange={(e) => onZtConfigChange({ ...ztConfig, api_token: e.target.value })}
              placeholder="Enter your ZeroTier API token"
              className="bg-zinc-50 border-zinc-200 text-zinc-900"
              data-testid="wizard-zt-token"
            />
            <Button variant="ghost" size="icon" onClick={() => setShowToken(!showToken)} className="text-zinc-400 flex-shrink-0">
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-zinc-400 mt-1">Get your token from <a href="https://my.zerotier.com/account" target="_blank" rel="noreferrer" className="text-orange-500 hover:underline">my.zerotier.com/account</a></p>
        </div>
        <div>
          <Label className="text-[11px] text-zinc-400 uppercase tracking-wider">Network ID</Label>
          <Input
            value={ztConfig.network_id}
            onChange={(e) => onZtConfigChange({ ...ztConfig, network_id: e.target.value })}
            placeholder="e.g. 8056c2e21c000001"
            className="bg-zinc-50 border-zinc-200 text-zinc-900 mt-1"
            data-testid="wizard-zt-network"
          />
        </div>
      </div>
      <div className="mt-5 p-3 bg-orange-50 border border-orange-100 rounded-xl">
        <p className="text-xs text-orange-600">
          <strong>Tip:</strong> You can skip this step and configure ZeroTier later from the site settings.
        </p>
      </div>
    </div>
  );
};

/* ── Step 0: Choose mode — New or Import ── */
const StepChooseMode = ({ onChooseNew, onChooseImport }) => (
  <div>
    <h2 className="text-xl font-bold text-zinc-900 mb-1">New server</h2>
    <p className="text-sm text-zinc-500 mb-5">Create a new server or import from a Clara dataset export.</p>
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={onChooseNew}
        data-testid="mode-new"
        className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-zinc-200 hover:border-zinc-900 hover:shadow-lg transition-all text-center group"
      >
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 group-hover:bg-zinc-900 flex items-center justify-center transition-colors">
          <Plus className="w-6 h-6 text-zinc-500 group-hover:text-white transition-colors" />
        </div>
        <div>
          <div className="text-sm font-bold text-zinc-800">Create New</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">Start from scratch</div>
        </div>
      </button>
      <button
        onClick={onChooseImport}
        data-testid="mode-import"
        className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-zinc-200 hover:border-zinc-900 hover:shadow-lg transition-all text-center group"
      >
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 group-hover:bg-zinc-900 flex items-center justify-center transition-colors">
          <Upload className="w-6 h-6 text-zinc-500 group-hover:text-white transition-colors" />
        </div>
        <div>
          <div className="text-sm font-bold text-zinc-800">Import Dataset</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">From Clara export file</div>
        </div>
      </button>
    </div>
  </div>
);

/* ── Import Flow: Upload + Site selection + Import ── */
const StepImportDataset = ({ token, onDone, onBack }) => {
  const [phase, setPhase] = useState('upload'); // upload | sites | importing | done
  const [uploading, setUploading] = useState(false);
  const [fileId, setFileId] = useState(null);
  const [sites, setSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState(new Set());
  const [importProgress, setImportProgress] = useState([]);
  const [currentImport, setCurrentImport] = useState('');
  const fileInputRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/api/data-transfer/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setFileId(data.file_id);
        setSites(data.sites || []);
        setPhase('sites');
      } else {
        const err = await res.json().catch(() => ({}));
        claraToast.error(err.detail || 'Upload failed');
      }
    } catch {
      claraToast.error('Connection error');
    }
    setUploading(false);
  };

  const toggleSite = (siteId) => {
    setSelectedSites(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const startImport = async () => {
    setPhase('importing');
    const results = [];
    for (const siteId of selectedSites) {
      const site = sites.find(s => s.id === siteId);
      setCurrentImport(site?.name || siteId);
      try {
        const res = await fetch(`${API}/api/data-transfer/import-site`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: fileId, site_id: siteId }),
        });
        if (res.ok) {
          const data = await res.json();
          results.push({ name: site?.name, status: 'success', imported: data.total_imported, skipped: data.total_skipped });
        } else {
          results.push({ name: site?.name, status: 'error', error: 'Import failed' });
        }
      } catch {
        results.push({ name: site?.name, status: 'error', error: 'Connection error' });
      }
    }
    // Cleanup
    try {
      await fetch(`${API}/api/data-transfer/cleanup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId }),
      });
    } catch {}
    setImportProgress(results);
    setPhase('done');
  };

  if (phase === 'upload') {
    return (
      <div>
        <h2 className="text-xl font-bold text-zinc-900 mb-1">Import dataset</h2>
        <p className="text-sm text-zinc-500 mb-5">Upload a Clara JSON export file to import servers with all their data.</p>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleUpload} className="hidden" data-testid="import-file-input" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center gap-3 p-10 rounded-2xl border-2 border-dashed border-zinc-300 hover:border-zinc-500 transition-colors cursor-pointer"
          data-testid="import-upload-area"
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-zinc-400" />
          )}
          <div className="text-sm font-medium text-zinc-600">
            {uploading ? 'Parsing file...' : 'Click to select .json export file'}
          </div>
        </button>
      </div>
    );
  }

  if (phase === 'sites') {
    return (
      <div>
        <h2 className="text-xl font-bold text-zinc-900 mb-1">Select sites to import</h2>
        <p className="text-sm text-zinc-500 mb-4">{sites.length} site{sites.length !== 1 ? 's' : ''} found in the export. Select which ones to import.</p>
        <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
          {sites.map(site => {
            const isSelected = selectedSites.has(site.id);
            return (
              <button
                key={site.id}
                onClick={() => toggleSite(site.id)}
                data-testid={`import-site-${site.slug}`}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  isSelected ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-100 hover:border-zinc-300'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                  <HardDrive className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-zinc-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-800 truncate">{site.name}</div>
                  <div className="text-[11px] text-zinc-400">{site.user_count} users &middot; {site.total_documents} docs &middot; {site.collection_count} collections</div>
                </div>
                {isSelected && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </motion.div>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
          <button onClick={() => { setSelectedSites(prev => prev.size === sites.length ? new Set() : new Set(sites.map(s => s.id))); }}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            {selectedSites.size === sites.length ? 'Deselect all' : 'Select all'}
          </button>
          <Button
            onClick={startImport}
            disabled={selectedSites.size === 0}
            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full px-5 gap-2"
            data-testid="import-start-btn"
          >
            <Upload className="w-4 h-4" />
            Import {selectedSites.size} site{selectedSites.size !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'importing') {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-10 h-10 text-zinc-400 animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-bold text-zinc-900 mb-1">Importing data...</h2>
        <p className="text-sm text-zinc-500">Importing {currentImport}...</p>
      </div>
    );
  }

  // done
  return (
    <div>
      <h2 className="text-xl font-bold text-zinc-900 mb-1">Import complete</h2>
      <p className="text-sm text-zinc-500 mb-4">{importProgress.filter(r => r.status === 'success').length} of {importProgress.length} sites imported successfully.</p>
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {importProgress.map((result, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-50">
            {result.status === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zinc-800 truncate">{result.name}</div>
              <div className="text-[11px] text-zinc-400">
                {result.status === 'success' ? `${result.imported} imported, ${result.skipped} skipped` : result.error}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-end">
        <Button onClick={onDone} className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full px-5 gap-2" data-testid="import-done-btn">
          <Check className="w-4 h-4" /> Done
        </Button>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════
   MAIN WIZARD COMPONENT
   ════════════════════════════════════════════════════ */
export default function CreateMainSiteWizard({ open, onClose, onCreated, token, environments, selectedEnvId }) {
  const { user } = useAuth();
  const isSystemAdmin = user?.is_system_admin === true;
  const [mode, setMode] = useState(null); // null = choosing, 'new' = normal wizard, 'import' = import flow
  const [step, setStep] = useState(0);
  const [siteType, setSiteType] = useState('radio');
  const [selectedOptionalFeatures, setSelectedOptionalFeatures] = useState([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminId, setAdminId] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [claraEnterprise, setClaraEnterprise] = useState(false);
  const [users, setUsers] = useState([]);
  const [deployStatus, setDeployStatus] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);
  const [deployError, setDeployError] = useState(null);
  const [rdsStations, setRdsStations] = useState([]);
  const [wpConfig, setWpConfig] = useState({
    name: '', wp_base_url: '', username: '', app_password: '',
    default_post_type: 'post', default_publish_status: 'draft',
  });
  const [ztConfig, setZtConfig] = useState({ api_token: '', network_id: '' });
  const [linkedMainSiteId, setLinkedMainSiteId] = useState('');
  const [clMode, setClMode] = useState('none'); // 'none' | 'built_in' | 'linked'

  const typeConfig = SITE_TYPES.find(t => t.id === siteType);
  const hasOptionalFeatures = (typeConfig?.optionalFeatures || []).length > 0;
  const isRadioType = siteType === 'radio';
  const hasWordPress = siteType === 'radio' || siteType === 'external_host';
  const isTechnicalType = siteType === 'technical';
  const isCodeStudioType = siteType === 'code_studio';

  // Build final feature set; inject content_library when Code Studio user chose 'built_in'
  const baseFeatures = [...(typeConfig?.features || []), ...selectedOptionalFeatures];
  const features = isCodeStudioType && clMode === 'built_in' && !baseFeatures.includes('content_library')
    ? [...baseFeatures, 'content_library', 'media_library']
    : baseFeatures;

  // Dynamic step mapping
  const getActualSteps = () => {
    const steps = ['Choosing a server'];
    if (hasOptionalFeatures) steps.push('Features');
    steps.push('Details');
    if (isRadioType) steps.push('Stations');
    if (isTechnicalType) steps.push('ZeroTier');
    if (hasWordPress) steps.push('WordPress');
    if (isCodeStudioType) steps.push('Content Library');
    steps.push('Admin', 'Security', 'Deploying');
    return steps;
  };
  const actualSteps = getActualSteps();
  const deployStepIdx = actualSteps.length - 1;

  const toggleOptionalFeature = (featureId) => {
    setSelectedOptionalFeatures(prev =>
      prev.includes(featureId) ? prev.filter(f => f !== featureId) : [...prev, featureId]
    );
  };

  // Map step index to step name based on current type
  const stepName = actualSteps[step] || '';

  // Auto-generate slug from name
  useEffect(() => {
    if (name && stepName === 'Details') {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  }, [name, stepName]);

  // Fetch users for admin step
  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    if (open && stepName === 'Admin') fetchUsers();
  }, [open, stepName, fetchUsers]);

  // Deploy process
  const totalDeploySteps = 4 + (require2FA ? 1 : 0) + features.length + (rdsStations.length > 0 ? 1 : 0) + (wpConfig.wp_base_url ? 1 : 0) + (ztConfig.api_token ? 1 : 0);

  const startDeploy = async () => {
    setDeploying(true);
    setDeployStatus(0);

    // Start the actual API call immediately in the background
    const envId = selectedEnvId || environments?.[0]?.id;
    const body = {
      name, slug, site_type: siteType,
      environment_id: envId,
      enabled_features: features,
      require_2fa: require2FA,
      clara_enterprise: claraEnterprise,
    };
    if (isCodeStudioType && clMode === 'linked' && linkedMainSiteId) {
      body.linked_main_site_id = linkedMainSiteId;
    }
    const apiPromise = fetch(`${API}/api/main-sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    // Run the animation steps in parallel with the API call
    const stepDelays = [
      1800,  // Preparing rack space
      2500,  // Deploying environment
      2000,  // Setting up firewall
    ];
    const extraCount = (require2FA ? 1 : 0) + features.length + 2 + (rdsStations.length > 0 ? 1 : 0) + (wpConfig.wp_base_url ? 1 : 0) + (ztConfig.api_token ? 1 : 0);
    for (let j = 0; j < extraCount; j++) {
      stepDelays.push(1200 + Math.random() * 1000);
    }

    for (let i = 0; i <= totalDeploySteps; i++) {
      const delay = stepDelays[i] || (1200 + Math.random() * 800);
      await new Promise(r => setTimeout(r, delay));
      if (i < totalDeploySteps) {
        setDeployStatus(i + 1);
      }
    }

    // Animation is done — now wait for the API to actually finish
    try {
      const res = await apiPromise;
      if (res.ok) {
        const siteData = await res.json();

        // Sync RDS stations if any were configured
        if (rdsStations.length > 0 && siteData?.id) {
          try {
            await fetch(`${API}/api/rds-stations/${siteData.id}/bulk-sync`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ stations: rdsStations }),
            });
          } catch (stationErr) {
            console.error('Failed to sync RDS stations:', stationErr);
          }
        }

        // Create WordPress site connection if configured
        if (wpConfig.wp_base_url && wpConfig.username && siteData?.id) {
          try {
            await fetch(`${API}/api/wordpress/sites`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Main-Site-Id': siteData.id,
              },
              body: JSON.stringify({
                name: wpConfig.name || name,
                wp_base_url: wpConfig.wp_base_url,
                username: wpConfig.username,
                app_password: wpConfig.app_password,
                default_post_type: wpConfig.default_post_type || 'post',
                default_publish_status: wpConfig.default_publish_status || 'draft',
                is_active: true,
              }),
            });
          } catch (wpErr) {
            console.error('Failed to create WordPress site:', wpErr);
          }
        }

        // Save ZeroTier config if provided
        if (ztConfig.api_token && ztConfig.network_id && siteData?.id) {
          try {
            await fetch(`${API}/api/zerotier/${siteData.id}/config`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ api_token: ztConfig.api_token, network_id: ztConfig.network_id }),
            });
          } catch (ztErr) {
            console.error('Failed to save ZeroTier config:', ztErr);
          }
        }

        setDeployStatus(totalDeploySteps + 1);
        setDeployDone(true);
        setTimeout(() => { onCreated?.(); handleClose(); }, 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        const errorMsg = err.detail || 'Failed to create site';
        setDeployError(errorMsg);
        claraToast.error(errorMsg, null, 'Server deployment');
      }
    } catch (e) {
      const errorMsg = 'Network error — could not reach server';
      setDeployError(errorMsg);
      claraToast.error(errorMsg, null, 'Server deployment');
    }
  };

  const handleClose = () => {
    setMode(null); setStep(0); setSiteType('radio'); setName(''); setSlug('');
    setAdminId(''); setRequire2FA(false); setClaraEnterprise(false); setDeployStatus(0);
    setDeploying(false); setDeployDone(false); setDeployError(null);
    setSelectedOptionalFeatures([]); setRdsStations([]);
    setLinkedMainSiteId(''); setClMode('none');
    setWpConfig({ name: '', wp_base_url: '', username: '', app_password: '', default_post_type: 'post', default_publish_status: 'draft' });
    onClose();
  };

  const canNext = () => {
    if (stepName === 'Choosing a server') return !!siteType;
    if (stepName === 'Features') return true;
    if (stepName === 'Details') return name.trim().length > 0 && slug.trim().length > 0;
    if (stepName === 'Stations') return true; // stations are optional
    if (stepName === 'WordPress') return true; // wordpress is optional
    if (stepName === 'ZeroTier') return true; // zerotier is optional
    if (stepName === 'Content Library') {
      // If user chose 'linked', require a site selection; otherwise any valid choice passes
      if (clMode === 'linked') return !!linkedMainSiteId;
      return true;
    }
    if (stepName === 'Admin') return true;
    if (stepName === 'Security') return true;
    return false;
  };

  const handleNext = () => {
    if (stepName === 'Security') { setStep(deployStepIdx); startDeploy(); }
    else setStep(s => s + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !deploying) handleClose(); }}>
      <DialogContent hideClose className="bg-white border-zinc-200 max-w-3xl max-h-[92vh] overflow-hidden p-0 rounded-[24px] flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.1)]" data-testid="create-wizard-dialog">

        {/* Mode: Choose between New or Import */}
        {mode === null && (
          <>
            <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
              <div />
              <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="px-8 pt-2 pb-8">
              <StepChooseMode
                onChooseNew={() => setMode('new')}
                onChooseImport={() => setMode('import')}
              />
            </div>
          </>
        )}

        {/* Mode: Import flow */}
        {mode === 'import' && (
          <>
            <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Import Dataset</div>
              <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="px-8 pt-2 pb-8 flex-1 overflow-y-auto min-h-0">
              <StepImportDataset
                token={token}
                onDone={() => { onCreated?.(); handleClose(); }}
                onBack={() => setMode(null)}
              />
            </div>
          </>
        )}

        {/* Mode: Normal create wizard */}
        {mode === 'new' && (
          <>
        {/* Header with close */}
        <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
          <WizardStepIndicator currentStep={step} steps={actualSteps} />
          {!deploying && (
            <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
          {deployError && (
            <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors" data-testid="wizard-close-on-error">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Content - scrollable when needed */}
        <div className="px-8 pt-2 overflow-y-auto flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {stepName === 'Choosing a server' && <StepEnvironment selected={siteType} onSelect={(type) => { setSiteType(type); setSelectedOptionalFeatures([]); setRdsStations([]); setLinkedMainSiteId(''); setClMode('none'); setZtConfig({ api_token: '', network_id: '' }); setWpConfig({ name: '', wp_base_url: '', username: '', app_password: '', default_post_type: 'post', default_publish_status: 'draft' }); }} />}
              {stepName === 'Features' && <StepFeatures siteType={siteType} selectedFeatures={selectedOptionalFeatures} onToggleFeature={toggleOptionalFeature} />}
              {stepName === 'Details' && <StepDetails name={name} slug={slug} onNameChange={setName} onSlugChange={setSlug} siteType={siteType} />}
              {stepName === 'Stations' && <StepStations stations={rdsStations} onStationsChange={setRdsStations} />}
              {stepName === 'ZeroTier' && <StepZeroTier ztConfig={ztConfig} onZtConfigChange={setZtConfig} />}
              {stepName === 'WordPress' && <StepWordPress wpConfig={wpConfig} onWpConfigChange={setWpConfig} />}
              {stepName === 'Content Library' && <StepContentLibrary mode={clMode} linkedMainSiteId={linkedMainSiteId} onModeChange={setClMode} onLinkChange={setLinkedMainSiteId} token={token} />}
              {stepName === 'Admin' && <StepAdmin adminId={adminId} onAdminChange={setAdminId} users={users} token={token} />}
              {stepName === 'Security' && <StepSecurity require2FA={require2FA} onToggle2FA={setRequire2FA} claraEnterprise={claraEnterprise} onToggleEnterprise={setClaraEnterprise} siteType={siteType} isSystemAdmin={isSystemAdmin} />}
              {stepName === 'Deploying' && <StepDeploying siteName={name} siteType={siteType} require2FA={require2FA} features={features} deployStatus={deployStatus} deployError={deployError} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer actions - always visible at bottom */}
        {stepName !== 'Deploying' && (
          <div className="flex items-center justify-between px-8 py-4 border-t border-zinc-100 flex-shrink-0">
            <Button
              variant="ghost"
              onClick={() => step === 0 ? setMode(null) : setStep(s => s - 1)}
              className="gap-2 text-zinc-500"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 0 ? 'Back' : 'Back'}
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canNext()}
              className="gap-2 bg-zinc-900 hover:bg-zinc-900 text-white px-6 rounded-full"
              data-testid="wizard-next-btn"
            >
              {stepName === 'Security' ? (
                <>
                  <Zap className="w-4 h-4" /> Deploy Server
                </>
              ) : (
                <>
                  Continue <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
