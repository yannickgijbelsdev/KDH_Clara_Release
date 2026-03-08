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
  Link2, RefreshCw, Loader2, ExternalLink
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BASE = process.env.REACT_APP_BACKEND_URL;

const ELEMENT_TYPES = {
  logo: { label: 'Logo', icon: Image, color: '#f59e0b' },
  clock: { label: 'Clock', icon: Clock, color: '#3b82f6' },
  ticker: { label: 'Ticker', icon: Type, color: '#10b981' },
  now_playing_show: { label: 'Now Playing (Show)', icon: Radio, color: '#8b5cf6' },
  now_playing_track: { label: 'Now Playing (Track)', icon: Music, color: '#ec4899' },
};

const SEPARATORS = [
  { id: 'bullet', label: 'Bullet', preview: '\u2022' },
  { id: 'dash', label: 'Dash', preview: '\u2014' },
  { id: 'pipe', label: 'Pipe', preview: '|' },
  { id: 'star', label: 'Star', preview: '\u2605' },
  { id: 'custom', label: 'Custom', preview: '...' },
];

// Strip alpha from hex colors for HTML5 color input (only supports 6-char hex)
const toHex6 = (c) => c && c.startsWith('#') ? '#' + c.replace('#','').slice(0,6) : c || '#000000';

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
    const url = `${BASE}/api/vmix/overlay/${mainSite.id}/${type}`;
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Canvas Preview */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Monitor className="w-4 h-4" /> Live Canvas Preview
              </h2>
              <span className="text-[10px] text-zinc-500">16:9 — Drag elements to reposition</span>
            </div>
            <div
              ref={canvasRef}
              data-testid="vmix-canvas"
              className="relative w-full rounded-lg overflow-hidden border border-white/10"
              style={{ aspectRatio: '16/9', background: config.canvas_bg }}
            >
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
                      background: el.type === 'ticker' ? (config.ticker_bg_color || '#000c') :
                                  el.type === 'clock' ? (config.clock_bg_color || 'transparent') :
                                  el.type === 'now_playing_show' ? (config.now_playing_show_bg || '#000c') :
                                  el.type === 'now_playing_track' ? (config.now_playing_track_bg || '#000c') :
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
          <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4" /> vMix Overlay URLs
            </h2>
            <p className="text-xs text-zinc-500 mb-3">Copy these URLs into vMix as Web Browser Input sources</p>
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
                    <a href={`${BASE}/api/vmix/overlay/${mainSite?.id}/${urlType}`} target="_blank" rel="noreferrer">
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
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 uppercase">Text Color</label>
                        <Input type="color" value={config.clock_text_color} onChange={e => setConfig(p => ({ ...p, clock_text_color: e.target.value }))}
                          className="h-8 bg-zinc-800 border-zinc-700" />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 uppercase">BG Color</label>
                        <Input type="color" value={config.clock_bg_color === 'transparent' ? '#000000' : config.clock_bg_color}
                          onChange={e => setConfig(p => ({ ...p, clock_bg_color: e.target.value }))}
                          className="h-8 bg-zinc-800 border-zinc-700" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Font Size (px)</label>
                      <Input type="number" min={12} max={120} value={config.clock_font_size}
                        onChange={e => setConfig(p => ({ ...p, clock_font_size: parseInt(e.target.value) || 48 }))}
                        className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                    </div>
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
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 uppercase">Text Color</label>
                        <Input type="color" value={toHex6(config.ticker_text_color)} onChange={e => setConfig(p => ({ ...p, ticker_text_color: e.target.value }))}
                          className="h-8 bg-zinc-800 border-zinc-700" />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 uppercase">BG Color</label>
                        <Input type="color" value={toHex6(config.ticker_bg_color)} onChange={e => setConfig(p => ({ ...p, ticker_bg_color: e.target.value }))}
                          className="h-8 bg-zinc-800 border-zinc-700" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase">Font Size (px)</label>
                      <Input type="number" min={10} max={60} value={config.ticker_font_size}
                        onChange={e => setConfig(p => ({ ...p, ticker_font_size: parseInt(e.target.value) || 24 }))}
                        className="h-8 text-xs bg-zinc-800 border-zinc-700" />
                    </div>
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
                    <div className="grid grid-cols-2 gap-2">
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
                      <div>
                        <label className="text-[10px] text-zinc-500 uppercase">BG Color</label>
                        <Input type="color"
                          value={toHex6(activeEl.type === 'now_playing_show' ? config.now_playing_show_bg : config.now_playing_track_bg)}
                          onChange={e => setConfig(p => ({
                            ...p,
                            [activeEl.type === 'now_playing_show' ? 'now_playing_show_bg' : 'now_playing_track_bg']: e.target.value
                          }))}
                          className="h-8 bg-zinc-800 border-zinc-700" />
                      </div>
                    </div>
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
