import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import {
  Monitor, Image, Clock, Type, Music, Radio, Upload, Save, Eye, EyeOff,
  Trash2, Plus, GripVertical, Copy, Settings, Play, ChevronDown, ChevronUp,
  Link2, RefreshCw, Loader2, ExternalLink, Grid, Check, ChevronRight, CheckCircle
} from 'lucide-react';
import { ConnectionStatus } from '../../components/ConnectionStatus';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BASE = process.env.REACT_APP_BACKEND_URL;

const ELEMENT_TYPES = {
  logo: { label: 'Logo', icon: Image, color: '#f59e0b' },
  clock: { label: 'Clock', icon: Clock, color: '#3b82f6' },
  ticker: { label: 'Ticker', icon: Type, color: '#10b981' },
  now_playing_show: { label: 'Now Playing (Show)', icon: Radio, color: '#8b5cf6' },
  now_playing_track: { label: 'Now Playing (Track)', icon: Music, color: '#ec4899' },
};

const PRODUCTION_URL = 'https://clara.koodh.com';

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            i < current ? 'bg-emerald-500/20 text-emerald-400' :
            i === current ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' :
            'bg-zinc-800 text-zinc-500'
          }`}>
            {i < current ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
        </div>
      ))}
    </div>
  );
}

const BG_TYPES = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'solid', label: 'Solid Color' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'image', label: 'Image' },
];

const SEPARATORS = [
  { id: 'bullet', label: 'Bullet', preview: '\u2022' },
  { id: 'dash', label: 'Dash', preview: '\u2014' },
  { id: 'pipe', label: 'Pipe', preview: '|' },
  { id: 'star', label: 'Star', preview: '\u2605' },
  { id: 'custom', label: 'Custom', preview: '...' },
];

// Strip alpha from hex colors for HTML5 color input (only supports 6-char hex)
const toHex6 = (c) => c && c.startsWith('#') ? '#' + c.replace('#','').slice(0,6) : c || '#000000';

// Build CSS background from config fields for a given element prefix
const buildBgCss = (config, prefix) => {
  const bgType = config[`${prefix}_bg_type`] || 'solid';
  if (bgType === 'transparent') return 'transparent';
  if (bgType === 'gradient') {
    const start = config[`${prefix}_bg_gradient_start`] || '#000000';
    const end = config[`${prefix}_bg_gradient_end`] || '#333333';
    const angle = config[`${prefix}_bg_gradient_angle`] || 90;
    return `linear-gradient(${angle}deg, ${start}, ${end})`;
  }
  if (bgType === 'image') {
    const url = config[`${prefix}_bg_image_url`];
    if (url) {
      const fullUrl = url.startsWith('http') ? url : `${BASE}${url}`;
      return `url('${fullUrl}') center/cover no-repeat`;
    }
  }
  return config[`${prefix}_bg_color`] || '#000000cc';
};

// Reusable background editor for overlay elements
function BgEditor({ config, setConfig, prefix, uploadBgImage }) {
  const bgType = config[`${prefix}_bg_type`] || 'solid';
  return (
    <div className="space-y-2">
      <label className="text-[10px] text-zinc-500 uppercase">Background Type</label>
      <div className="flex gap-1">
        {BG_TYPES.map(t => (
          <button key={t.id} onClick={() => setConfig(p => ({ ...p, [`${prefix}_bg_type`]: t.id }))}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${bgType === t.id ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {bgType === 'solid' && (
        <div>
          <label className="text-[10px] text-zinc-500 uppercase">Color</label>
          <Input type="color" value={toHex6(config[`${prefix}_bg_color`])}
            onChange={e => setConfig(p => ({ ...p, [`${prefix}_bg_color`]: e.target.value }))}
            className="h-8 bg-zinc-800 border-zinc-700" />
        </div>
      )}

      {bgType === 'gradient' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase">Start</label>
              <Input type="color" value={config[`${prefix}_bg_gradient_start`] || '#000000'}
                onChange={e => setConfig(p => ({ ...p, [`${prefix}_bg_gradient_start`]: e.target.value }))}
                className="h-8 bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase">End</label>
              <Input type="color" value={config[`${prefix}_bg_gradient_end`] || '#333333'}
                onChange={e => setConfig(p => ({ ...p, [`${prefix}_bg_gradient_end`]: e.target.value }))}
                className="h-8 bg-zinc-800 border-zinc-700" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase">Angle ({config[`${prefix}_bg_gradient_angle`] || 90}°)</label>
            <input type="range" min={0} max={360} value={config[`${prefix}_bg_gradient_angle`] || 90}
              onChange={e => setConfig(p => ({ ...p, [`${prefix}_bg_gradient_angle`]: parseInt(e.target.value) }))}
              className="w-full accent-orange-500" />
          </div>
          <div className="h-6 rounded" style={{ background: `linear-gradient(${config[`${prefix}_bg_gradient_angle`] || 90}deg, ${config[`${prefix}_bg_gradient_start`] || '#000'}, ${config[`${prefix}_bg_gradient_end`] || '#333'})` }} />
        </div>
      )}

      {bgType === 'image' && (
        <div className="space-y-2">
          {config[`${prefix}_bg_image_url`] && (
            <div className="h-12 rounded bg-zinc-800 overflow-hidden">
              <img src={config[`${prefix}_bg_image_url`]?.startsWith('http') ? config[`${prefix}_bg_image_url`] : `${BASE}${config[`${prefix}_bg_image_url`]}`}
                alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <Input type="file" accept="image/*" className="h-8 text-xs bg-zinc-800 border-zinc-700"
            onChange={e => { if (e.target.files[0]) uploadBgImage(e.target.files[0], prefix); }} />
          <p className="text-[10px] text-zinc-500">Max 10MB. Use high-res for best quality.</p>
        </div>
      )}
    </div>
  );
}

export default function VmixDirector() {
  const { mainSite } = useMainSite();
  const [config, setConfig] = useState(null);
  const [messages, setMessages] = useState([]);
  const [xmlServers, setXmlServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeElement, setActiveElement] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [dragging, setDragging] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [setupStep, setSetupStep] = useState(0);
  const canvasRef = useRef(null);

  const fetchAll = useCallback(async () => {
    if (!mainSite) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite.id };
      const [cfgRes, msgRes, srvRes] = await Promise.all([
        axios.get(`${API}/vmix/config`, { headers }),
        axios.get(`${API}/vmix/ticker-messages`, { headers }),
        axios.get(`${API}/vmix/xml-servers`, { headers }),
      ]);
      setConfig(cfgRes.data);
      setMessages(msgRes.data);
      setXmlServers(srvRes.data);
    } catch (err) {
      toast.error('Failed to load vMix configuration');
    }
    setLoading(false);
  }, [mainSite]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Determine setup step
  useEffect(() => {
    if (!config) return;
    const hasXmlServers = xmlServers.length > 0;
    const hasEnabledElements = config.elements?.some(el => el.enabled);
    const hasMessages = messages.length > 0;

    if (!hasXmlServers) setSetupStep(0);
    else if (!hasEnabledElements) setSetupStep(1);
    else if (!hasMessages && config.elements?.find(el => el.type === 'ticker')?.enabled) setSetupStep(2);
    else setSetupStep(3);
  }, [config, xmlServers, messages]);

  const saveConfig = async () => {
    if (!config || !mainSite) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite.id };
      const { data } = await axios.put(`${API}/vmix/config`, config, { headers });
      setConfig(data);
      toast.success('Configuration saved');
    } catch (err) {
      toast.error('Failed to save configuration');
    }
    setSaving(false);
  };

  const uploadLogo = async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${API}/vmix/logo/upload`, form, {
        headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite.id },
      });
      setConfig(prev => ({ ...prev, logo_url: data.logo_url }));
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error('Failed to upload logo');
    }
  };

  const uploadBgImage = async (file, elementKey) => {
    const form = new FormData();
    form.append('file', file);
    form.append('element', elementKey);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${API}/vmix/background/upload`, form, {
        headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite.id },
      });
      setConfig(prev => ({ ...prev, [`${elementKey}_bg_image_url`]: data.bg_url, [`${elementKey}_bg_type`]: 'image' }));
      toast.success('Background image uploaded');
    } catch (err) {
      toast.error('Failed to upload background image');
    }
  };

  const addMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${API}/vmix/ticker-messages`, {
        text: newMessage.trim(), order: messages.length, active: true
      }, { headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite.id } });
      setMessages(prev => [...prev, data]);
      setNewMessage('');
      toast.success('Message added');
    } catch (err) {
      toast.error('Failed to add message');
    }
  };

  const deleteMessage = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/vmix/ticker-messages/${id}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite.id },
      });
      setMessages(prev => prev.filter(m => m.id !== id));
      toast.success('Message deleted');
    } catch (err) {
      toast.error('Failed to delete message');
    }
  };

  const toggleMessage = async (msg) => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.put(`${API}/vmix/ticker-messages/${msg.id}`, {
        active: !msg.active
      }, { headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite.id } });
      setMessages(prev => prev.map(m => m.id === msg.id ? data : m));
    } catch (err) {
      toast.error('Failed to toggle message');
    }
  };

  const updateElement = (elementId, updates) => {
    setConfig(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.id === elementId ? { ...el, ...updates } : el),
    }));
  };

  const toggleElement = (elementId) => {
    const el = config.elements.find(e => e.id === elementId);
    if (el) updateElement(elementId, { enabled: !el.enabled });
  };

  // Canvas dragging
  const handleCanvasMouseDown = (e, elementId) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const el = config.elements.find(e => e.id === elementId);
    if (!el) return;
    setDragging({
      id: elementId,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      canvasW: rect.width,
      canvasH: rect.height,
    });
    setActiveElement(elementId);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const dx = ((e.clientX - dragging.startX) / dragging.canvasW) * 100;
      const dy = ((e.clientY - dragging.startY) / dragging.canvasH) * 100;
      const el = config.elements.find(el => el.id === dragging.id);
      if (!el) return;
      updateElement(dragging.id, {
        x: Math.max(0, Math.min(100 - el.width, dragging.origX + dx)),
        y: Math.max(0, Math.min(100 - el.height, dragging.origY + dy)),
      });
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, config]);

  const copyOverlayUrl = (type) => {
    const url = `${PRODUCTION_URL}/api/vmix/overlay/${mainSite.id}/${type}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
    </div>
  );

  if (!config) return null;

  const activeEl = config.elements.find(e => e.id === activeElement);

  return (
    <div data-testid="vmix-director" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">vMix Director</h1>
          <p className="text-sm text-zinc-400 mt-1">Design and configure your vMix overlay elements</p>
        </div>
        <Button data-testid="vmix-save-btn" onClick={saveConfig} disabled={saving} className="bg-orange-500 hover:bg-orange-600">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Configuration
        </Button>
      </div>

      {/* Step Indicator */}
      <StepIndicator steps={['XML Servers', 'Overlay Elements', 'Ticker Messages', 'Overlay URLs']} current={setupStep} />

      {/* Connection Status - Auto-check */}
      <ConnectionStatus
        testUrl={`${API}/vmix/test-connection`}
        headers={{ Authorization: `Bearer ${localStorage.getItem('token')}`, 'X-Main-Site-ID': mainSite?.id }}
        label="VMix Overlay"
        autoCheck={true}
      />

      {/* Step 1: XML Servers Status */}
      <div className={`bg-zinc-900/50 border rounded-xl transition-all ${setupStep === 0 ? 'border-orange-500/30 ring-1 ring-orange-500/20' : xmlServers.length > 0 ? 'border-emerald-500/20' : 'border-zinc-800'}`}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${xmlServers.length > 0 ? 'bg-emerald-500/20' : setupStep === 0 ? 'bg-orange-500/20' : 'bg-zinc-800'}`}>
              {xmlServers.length > 0 ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Monitor className="w-4 h-4 text-orange-400" />}
            </div>
            <div>
              <h3 className="text-white font-medium text-sm">XML Server Connection</h3>
              <p className="text-xs text-zinc-500">{xmlServers.length > 0 ? `${xmlServers.length} XML server(s) available for Now Playing data` : 'No XML servers found. Configure one in the XML Dashboard first.'}</p>
            </div>
          </div>
          {xmlServers.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {xmlServers.map(s => (
                <span key={s.id} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">{s.name}</span>
              ))}
            </div>
          )}
        </div>
        {setupStep === 0 && xmlServers.length === 0 && (
          <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
            <div className="flex items-start gap-2 p-3 bg-orange-500/5 rounded-lg border border-orange-500/10">
              <Settings className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-zinc-400">
                <p className="text-orange-300 font-medium mb-1">How to connect XML servers</p>
                <p>XML servers provide now-playing metadata for your overlay elements. Go to the <strong>Network Management</strong> dashboard and create a <strong>Virtual Datacenter</strong> (server) site. Once created, the XML server will appear here automatically and feed data to your vMix overlays.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Canvas Preview */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Monitor className="w-4 h-4" /> Live Canvas Preview
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowGrid(g => !g)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${showGrid ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}
                  data-testid="vmix-grid-toggle">
                  <Grid className="w-3 h-3" /> Grid
                </button>
                <span className="text-[10px] text-zinc-500">16:9 — Drag to reposition</span>
              </div>
            </div>
            <div
              ref={canvasRef}
              data-testid="vmix-canvas"
              className="relative w-full rounded-lg overflow-hidden border border-white/10"
              style={{ aspectRatio: '16/9', background: config.canvas_bg }}
            >
              {/* Alignment Grid */}
              {showGrid && (
                <div className="absolute inset-0 pointer-events-none z-30">
                  {/* Thirds - vertical */}
                  <div className="absolute top-0 bottom-0 left-[33.33%] w-px bg-cyan-500/20" />
                  <div className="absolute top-0 bottom-0 left-[66.66%] w-px bg-cyan-500/20" />
                  {/* Thirds - horizontal */}
                  <div className="absolute left-0 right-0 top-[33.33%] h-px bg-cyan-500/20" />
                  <div className="absolute left-0 right-0 top-[66.66%] h-px bg-cyan-500/20" />
                  {/* Center crosshair */}
                  <div className="absolute top-0 bottom-0 left-[50%] w-px bg-cyan-500/30" />
                  <div className="absolute left-0 right-0 top-[50%] h-px bg-cyan-500/30" />
                  {/* Quarters */}
                  <div className="absolute top-0 bottom-0 left-[25%] w-px bg-cyan-500/10" />
                  <div className="absolute top-0 bottom-0 left-[75%] w-px bg-cyan-500/10" />
                  <div className="absolute left-0 right-0 top-[25%] h-px bg-cyan-500/10" />
                  <div className="absolute left-0 right-0 top-[75%] h-px bg-cyan-500/10" />
                  {/* Safe area (90%) */}
                  <div className="absolute border border-dashed border-yellow-500/15" style={{ left: '5%', top: '5%', right: '5%', bottom: '5%' }} />
                  {/* Corner markers */}
                  <div className="absolute top-2 left-2 text-[8px] text-cyan-500/40 font-mono">0,0</div>
                  <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2">
                    <div className="w-2 h-2 rounded-full bg-cyan-500/20" />
                  </div>
                </div>
              )}
              {config.elements.filter(el => el.enabled).map(el => {
                const meta = ELEMENT_TYPES[el.type];
                const Icon = meta?.icon || Monitor;
                const isActive = activeElement === el.id;
                return (
                  <div
                    key={el.id}
                    data-testid={`vmix-element-${el.id}`}
                    onMouseDown={(e) => handleCanvasMouseDown(e, el.id)}
                    onClick={(e) => { e.stopPropagation(); setActiveElement(el.id); }}
                    className={`absolute cursor-move select-none transition-shadow ${isActive ? 'ring-2 ring-orange-500 z-20' : 'z-10 hover:ring-1 hover:ring-white/30'}`}
                    style={{
                      left: `${el.x}%`, top: `${el.y}%`,
                      width: `${el.width}%`, height: `${el.height}%`,
                      background: el.type === 'ticker' ? buildBgCss(config, 'ticker') :
                                  el.type === 'clock' ? buildBgCss(config, 'clock') :
                                  el.type === 'now_playing_show' ? buildBgCss(config, 'now_playing_show') :
                                  el.type === 'now_playing_track' ? buildBgCss(config, 'now_playing_track') :
                                  'rgba(0,0,0,0.4)',
                      borderRadius: '4px',
                    }}
                  >
                    <div className="flex items-center justify-center h-full gap-1.5 px-2">
                      {el.type === 'logo' && config.logo_url ? (
                        <img src={config.logo_url.startsWith('http') ? config.logo_url : `${BASE}${config.logo_url}`} alt="Logo" className="max-w-full max-h-full object-contain" />
                      ) : el.type === 'clock' ? (
                        <span style={{ color: config.clock_text_color, fontSize: `${Math.min(config.clock_font_size, 28)}px`, fontWeight: 700 }}>
                          {new Date().toLocaleTimeString('nl-BE')}
                        </span>
                      ) : el.type === 'ticker' ? (
                        <span className="text-xs truncate" style={{ color: config.ticker_text_color }}>
                          {messages.filter(m => m.active).map(m => m.text).join(` ${SEPARATORS.find(s => s.id === config.ticker_separator)?.preview || '\u2022'} `) || 'Ticker messages...'}
                        </span>
                      ) : (
                        <>
                          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta?.color }} />
                          <span className="text-[10px] text-white/70 truncate">{meta?.label}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overlay URLs for vMix */}
          <div className={`bg-zinc-900/50 border rounded-xl p-4 transition-all ${setupStep === 3 ? 'border-orange-500/30 ring-1 ring-orange-500/20' : 'border-white/5'}`}>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4" /> vMix Overlay URLs
            </h2>
            <p className="text-xs text-zinc-500 mb-3">Copy these URLs into vMix as Web Browser Input sources &mdash; <span className="text-zinc-400">{PRODUCTION_URL}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(ELEMENT_TYPES).map(([type, meta]) => {
                const urlType = type === 'now_playing_show' ? 'now-playing-show' : type === 'now_playing_track' ? 'now-playing-track' : type;
                return (
                  <div key={type} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
                    <meta.icon className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
                    <span className="text-xs text-zinc-300 flex-1">{meta.label}</span>
                    <Button size="sm" variant="ghost" onClick={() => copyOverlayUrl(urlType)} className="h-7 px-2 text-xs text-zinc-400 hover:text-white">
                      <Copy className="w-3 h-3 mr-1" /> Copy URL
                    </Button>
                    <a href={`${PRODUCTION_URL}/api/vmix/overlay/${mainSite?.id}/${urlType}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 hover:text-white" />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side Panel — Element Config */}
        <div className="space-y-4">
          {/* Element List */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">Overlay Elements</h2>
            <div className="space-y-1.5">
              {config.elements.map(el => {
                const meta = ELEMENT_TYPES[el.type];
                const Icon = meta?.icon || Monitor;
                return (
                  <div
                    key={el.id}
                    data-testid={`vmix-el-toggle-${el.id}`}
                    onClick={() => setActiveElement(el.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${activeElement === el.id ? 'bg-orange-500/15 border border-orange-500/25' : 'bg-zinc-800/30 border border-transparent hover:bg-zinc-800/60'}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta?.color }} />
                    <span className="text-sm text-zinc-200 flex-1">{meta?.label}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleElement(el.id); }}
                      className={`w-8 h-5 rounded-full transition-colors flex items-center ${el.enabled ? 'bg-orange-500 justify-end' : 'bg-zinc-700 justify-start'}`}
                    >
                      <div className="w-3.5 h-3.5 rounded-full bg-white mx-0.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Element Config */}
          {activeEl && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                {ELEMENT_TYPES[activeEl.type]?.label} Settings
              </h2>

              {/* Position & Size */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">X Position (%)</label>
                    <Input type="number" min={0} max={100} value={Math.round(activeEl.x)}
                      onChange={e => updateElement(activeEl.id, { x: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">Y Position (%)</label>
                    <Input type="number" min={0} max={100} value={Math.round(activeEl.y)}
                      onChange={e => updateElement(activeEl.id, { y: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">Width (%)</label>
                    <Input type="number" min={1} max={100} value={Math.round(activeEl.width)}
                      onChange={e => updateElement(activeEl.id, { width: parseFloat(e.target.value) || 1 })}
                      className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">Height (%)</label>
                    <Input type="number" min={1} max={100} value={Math.round(activeEl.height)}
                      onChange={e => updateElement(activeEl.id, { height: parseFloat(e.target.value) || 1 })}
                      className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                  </div>
                </div>

                {/* Type-specific settings */}
                {activeEl.type === 'logo' && (
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <label className="text-[10px] text-zinc-500 uppercase">Upload Logo</label>
                    {config.logo_url && (
                      <div className="w-16 h-16 bg-zinc-800 rounded-lg flex items-center justify-center overflow-hidden">
                        <img src={config.logo_url.startsWith('http') ? config.logo_url : `${BASE}${config.logo_url}`} alt="" className="max-w-full max-h-full object-contain" />
                      </div>
                    )}
                    <Input data-testid="vmix-logo-upload" type="file" accept="image/*" className="h-8 text-xs bg-zinc-800 border-zinc-700"
                      onChange={e => { if (e.target.files[0]) uploadLogo(e.target.files[0]); }} />
                  </div>
                )}

                {activeEl.type === 'clock' && (
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Format</label>
                      <select value={config.clock_format} onChange={e => setConfig(p => ({ ...p, clock_format: e.target.value }))}
                        className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-white px-2">
                        <option value="HH:mm:ss">HH:mm:ss</option>
                        <option value="HH:mm">HH:mm</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Text Color</label>
                      <Input type="color" value={config.clock_text_color} onChange={e => setConfig(p => ({ ...p, clock_text_color: e.target.value }))}
                        className="h-8 bg-zinc-800 border-zinc-700" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Font Size (px)</label>
                      <Input type="number" min={12} max={120} value={config.clock_font_size}
                        onChange={e => setConfig(p => ({ ...p, clock_font_size: parseInt(e.target.value) || 48 }))}
                        className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                    </div>
                    <BgEditor config={config} setConfig={setConfig} prefix="clock" uploadBgImage={uploadBgImage} />
                  </div>
                )}

                {activeEl.type === 'ticker' && (
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-zinc-500 uppercase">Scrolling</label>
                      <button
                        onClick={() => setConfig(p => ({ ...p, ticker_scroll: !p.ticker_scroll }))}
                        className={`w-8 h-5 rounded-full transition-colors flex items-center ${config.ticker_scroll ? 'bg-orange-500 justify-end' : 'bg-zinc-700 justify-start'}`}
                      >
                        <div className="w-3.5 h-3.5 rounded-full bg-white mx-0.5" />
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Separator</label>
                      <div className="flex gap-1 mt-1">
                        {SEPARATORS.map(s => (
                          <button key={s.id} onClick={() => setConfig(p => ({ ...p, ticker_separator: s.id }))}
                            className={`px-2 py-1 rounded text-xs ${config.ticker_separator === s.id ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                            {s.preview}
                          </button>
                        ))}
                      </div>
                      {config.ticker_separator === 'custom' && (
                        <Input value={config.ticker_custom_separator} placeholder="Custom separator"
                          onChange={e => setConfig(p => ({ ...p, ticker_custom_separator: e.target.value }))}
                          className="h-8 text-xs bg-zinc-800 border-zinc-700 mt-1" />
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Text Color</label>
                      <Input type="color" value={toHex6(config.ticker_text_color)} onChange={e => setConfig(p => ({ ...p, ticker_text_color: e.target.value }))}
                        className="h-8 bg-zinc-800 border-zinc-700" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Font Size (px)</label>
                      <Input type="number" min={10} max={60} value={config.ticker_font_size}
                        onChange={e => setConfig(p => ({ ...p, ticker_font_size: parseInt(e.target.value) || 24 }))}
                        className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                    </div>
                    <BgEditor config={config} setConfig={setConfig} prefix="ticker" uploadBgImage={uploadBgImage} />
                  </div>
                )}

                {(activeEl.type === 'now_playing_show' || activeEl.type === 'now_playing_track') && (
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">XML Server Source</label>
                      <select value={config.now_playing_xml_server_id || ''}
                        onChange={e => setConfig(p => ({ ...p, now_playing_xml_server_id: e.target.value || null }))}
                        className="w-full h-8 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-white px-2">
                        <option value="">Select XML Server...</option>
                        {xmlServers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    {activeEl.type === 'now_playing_show' && (
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-zinc-500 uppercase">Show Presenter Photo</label>
                        <button
                          onClick={() => setConfig(p => ({ ...p, now_playing_show_photo: !p.now_playing_show_photo }))}
                          className={`w-8 h-5 rounded-full transition-colors flex items-center ${config.now_playing_show_photo ? 'bg-orange-500 justify-end' : 'bg-zinc-700 justify-start'}`}
                        >
                          <div className="w-3.5 h-3.5 rounded-full bg-white mx-0.5" />
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Text Color</label>
                      <Input type="color"
                        value={toHex6(activeEl.type === 'now_playing_show' ? config.now_playing_show_text_color : config.now_playing_track_text_color)}
                        onChange={e => setConfig(p => ({
                          ...p,
                          [activeEl.type === 'now_playing_show' ? 'now_playing_show_text_color' : 'now_playing_track_text_color']: e.target.value
                        }))}
                        className="h-8 bg-zinc-800 border-zinc-700" />
                    </div>
                    <BgEditor config={config} setConfig={setConfig} prefix={activeEl.type} uploadBgImage={uploadBgImage} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ticker Messages */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Type className="w-4 h-4" /> Ticker Messages
            </h2>
            <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-3">No messages yet</p>
              )}
              {messages.map(msg => (
                <div key={msg.id} className="flex items-center gap-2 bg-zinc-800/40 rounded-lg px-3 py-2">
                  <button onClick={() => toggleMessage(msg)} className={`w-2 h-2 rounded-full flex-shrink-0 ${msg.active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <span className={`text-xs flex-1 truncate ${msg.active ? 'text-zinc-200' : 'text-zinc-500 line-through'}`}>{msg.text}</span>
                  <button onClick={() => deleteMessage(msg.id)} className="text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input data-testid="vmix-new-message" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                placeholder="New ticker message..." className="h-8 text-xs bg-zinc-800 border-zinc-700 flex-1"
                onKeyDown={e => { if (e.key === 'Enter') addMessage(); }} />
              <Button data-testid="vmix-add-message" size="sm" onClick={addMessage} className="h-8 bg-orange-500 hover:bg-orange-600">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
