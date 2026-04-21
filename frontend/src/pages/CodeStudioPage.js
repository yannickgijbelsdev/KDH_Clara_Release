import { useState, useEffect, useCallback, useContext } from 'react';
import { useAuth } from '../context/AuthContext';
import MainSiteContext from '../context/MainSiteContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  Plus, Globe, Code2, Trash2, X, Type, Image, CreditCard, MessageCircle,
  Mail, Layout, Menu as MenuIcon, Minus, MoveVertical, Play,
  Megaphone, Grid3X3, Loader2, Copy, Award, Columns,
  Pencil, ArrowUp, ArrowDown, Save, Settings, Link2,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const SECTION_ICONS = {
  navbar: MenuIcon, hero: Layout, features: Grid3X3, pricing: CreditCard,
  testimonials: MessageCircle, gallery: Image, contact: Mail,
  cta: Megaphone, footer: Minus, text: Type, image: Image,
  video: Play, divider: Minus, spacer: MoveVertical, html: Code2,
  logos: Award, image_text: Columns, news_feed: Grid3X3,
};

// ── Color Picker Field ──
function ColorField({ label, value, onChange }) {
  const [mode, setMode] = useState('hex');
  const hexVal = value || '#000000';

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
  const rgb = hexToRgb(hexVal);

  return (
    <div>
      <Label className="text-[10px] font-semibold text-zinc-400 uppercase">{label}</Label>
      <div className="mt-1 flex items-center gap-1.5">
        <input type="color" value={hexVal} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded-lg border border-zinc-200 cursor-pointer p-0.5" />
        <div className="flex-1">
          <div className="flex gap-0.5 mb-1">
            {['hex', 'rgb'].map(m => (
              <button key={m} onClick={() => setMode(m)} className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${mode === m ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{m}</button>
            ))}
          </div>
          {mode === 'hex' ? (
            <Input value={hexVal} onChange={e => { const v = e.target.value; if (/^#?[0-9a-fA-F]{0,6}$/.test(v.replace('#', ''))) onChange(v.startsWith('#') ? v : '#' + v); }} className="h-7 text-xs font-mono" />
          ) : (
            <div className="flex gap-1">
              <Input type="number" min={0} max={255} value={rgb.r} onChange={e => onChange(rgbToHex(+e.target.value, rgb.g, rgb.b))} className="h-7 text-xs w-14 text-center" placeholder="R" />
              <Input type="number" min={0} max={255} value={rgb.g} onChange={e => onChange(rgbToHex(rgb.r, +e.target.value, rgb.b))} className="h-7 text-xs w-14 text-center" placeholder="G" />
              <Input type="number" min={0} max={255} value={rgb.b} onChange={e => onChange(rgbToHex(rgb.r, rgb.g, +e.target.value))} className="h-7 text-xs w-14 text-center" placeholder="B" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Size Field (px) ──
function SizeField({ label, value, onChange, min = 0, max = 200, unit = 'px' }) {
  const numVal = parseInt(value) || min;
  return (
    <div>
      <Label className="text-[10px] font-semibold text-zinc-400 uppercase">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input type="range" min={min} max={max} value={numVal} onChange={e => onChange(`${e.target.value}${unit}`)} className="flex-1 h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-900 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none" />
        <Input value={value || ''} onChange={e => onChange(e.target.value)} className="h-7 text-xs w-16 text-center font-mono" />
      </div>
    </div>
  );
}

// ── Helpers: decide default bg_mode + gradient defaults per section type ──
function defaultBgMode(type) {
  return type === 'hero' || type === 'cta' ? 'gradient' : 'solid';
}
function defaultGradient(type) {
  if (type === 'cta') return { from: '#dd0c51', to: '#7c1ac8', direction: 'to right' };
  if (type === 'hero') return { from: '#18181b', to: '#27272a', direction: 'to bottom right' };
  return { from: '#ffffff', to: '#f4f4f5', direction: 'to bottom' };
}
function resolveBgMode(section) {
  const p = section.props || {};
  return p.bg_mode || defaultBgMode(section.type);
}

// ── Section wrapper for background image/color + sizing ──
function SectionWrapper({ section, children }) {
  const p = section.props || {};
  const style = {};
  const bgMode = resolveBgMode(section);
  const g = defaultGradient(section.type);

  if (p.bg_image) {
    // Background image wins over everything
    style.backgroundImage = `url(${p.bg_image})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  } else if (bgMode === 'gradient') {
    const from = p.gradient_from || g.from;
    const to = p.gradient_to || g.to;
    const dir = p.gradient_direction || g.direction;
    style.backgroundImage = `linear-gradient(${dir}, ${from}, ${to})`;
  } else if (p.section_bg_color) {
    style.backgroundColor = p.section_bg_color;
  }

  if (p.padding_top) style.paddingTop = p.padding_top;
  if (p.padding_bottom) style.paddingBottom = p.padding_bottom;
  if (p.border_radius) style.borderRadius = p.border_radius;
  const overlayClass = p.bg_image && p.bg_overlay ? 'relative' : '';
  return (
    <div style={style} className={overlayClass}>
      {p.bg_image && p.bg_overlay && <div className="absolute inset-0 bg-black/50" style={{ borderRadius: p.border_radius || 0 }} />}
      <div className={p.bg_image ? 'relative z-10' : ''}>{children}</div>
    </div>
  );
}

// ── Extract inline styles from section props ──
function sectionStyles(p) {
  return {
    heading: { color: p.heading_color || undefined, fontSize: p.heading_size || undefined },
    text: { color: p.text_color || undefined, fontSize: p.text_size || undefined },
    accent: p.accent_color || '#dd0c51',
  };
}

// ── Section Preview Renderer ──
function SectionPreview({ section }) {
  const p = section.props || {};
  let content;
  switch (section.type) {
    case 'navbar':
      content = (
        <div className={`flex items-center justify-between px-8 py-4 ${p.style === 'dark' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900 border-b border-zinc-100'}`}>
          <div className="flex items-center gap-2">
            {p.logo_url && <img src={p.logo_url} alt="" className="h-6 object-contain" />}
            <span className="font-bold text-sm">{p.brand || 'Brand'}</span>
          </div>
          <div className="flex items-center gap-5 text-xs">
            {(p.links || []).map((l, i) => <span key={i} className="opacity-60 hover:opacity-100 cursor-pointer">{l.label}</span>)}
            {p.cta_text && <span className={`px-4 py-1.5 rounded-full font-semibold text-xs ${p.style === 'dark' ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}`}>{p.cta_text}</span>}
          </div>
        </div>
      );
      return content; // navbar doesn't get wrapper
    case 'hero':
      content = (
        <div className={`relative px-10 ${p.layout === 'left' ? 'py-16' : 'py-20 text-center'} text-white overflow-hidden`}>
          {p.badge && <div className="inline-block bg-white/10 border border-white/20 rounded-full px-3 py-1 text-[10px] font-medium mb-4">{p.badge}</div>}
          <div className={p.layout === 'left' ? 'max-w-[55%]' : ''}>
            <h1 className="font-bold mb-3 leading-tight" style={{ fontSize: p.heading_size || '36px', color: p.heading_color || 'white' }}>{p.headline || 'Headline'}</h1>
            <p className="mb-6 max-w-md" style={{ fontSize: p.text_size || '14px', color: p.text_color || 'rgba(255,255,255,0.6)' }}>{p.subheadline || ''}</p>
            {p.cta_text && <span className="inline-block px-5 py-2.5 rounded-full font-semibold text-sm" style={{ backgroundColor: p.accent_color || '#a3e635', color: '#18181b' }}>{p.cta_text}</span>}
          </div>
          {p.hero_image && p.layout === 'left' && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 w-[35%] h-[80%] rounded-2xl overflow-hidden opacity-80">
              <img src={p.hero_image} alt="" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      );
      break;
    case 'logos':
      content = (
        <div className="px-10 py-8 bg-white border-t border-zinc-100">
          {p.headline && <p className="text-xs text-zinc-400 text-center mb-4 font-medium">{p.headline}</p>}
          <div className="flex items-center justify-center gap-8">
            {(p.logos || []).map((logo, i) => (
              <span key={i} className="text-sm font-bold text-zinc-300 tracking-wide">{logo}</span>
            ))}
          </div>
        </div>
      );
      break;
    case 'image_text':
      content = (
        <div className={`flex items-stretch ${p.image_position === 'left' ? 'flex-row-reverse' : ''} ${p.bg_color || 'bg-lime-300'} overflow-hidden`}>
          <div className="flex-1 p-10 flex flex-col justify-center">
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">{p.headline || 'Headline'}</h2>
            <p className="text-sm text-zinc-600 mb-3">{p.subheadline || ''}</p>
            {(p.bullets || []).length > 0 && (
              <ul className="space-y-1.5 mb-4">
                {p.bullets.map((b, i) => <li key={i} className="text-sm text-zinc-700 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-zinc-900 rounded-full" />{b}</li>)}
              </ul>
            )}
            {p.cta_text && <span className="inline-block bg-zinc-900 text-white px-5 py-2 rounded-full font-semibold text-sm self-start">{p.cta_text}</span>}
          </div>
          <div className="flex-1 min-h-[200px]">
            {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
          </div>
        </div>
      );
      break;
    case 'features':
      content = (
        <div className="px-10 py-14 bg-white">
          <h2 className="font-bold text-center mb-2" style={{ fontSize: p.heading_size || '24px', color: p.heading_color || '#18181b' }}>{p.headline || 'Features'}</h2>
          <p className="text-center mb-10" style={{ fontSize: p.text_size || '14px', color: p.text_color || '#71717a' }}>{p.subheadline || ''}</p>
          <div className="grid grid-cols-3 gap-5">
            {(p.features || []).map((f, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-zinc-50">
                {f.image_url && <img src={f.image_url} alt="" className="w-full h-36 object-cover" />}
                <div className="p-4">
                  <h3 className="text-sm font-bold" style={{ color: p.heading_color || '#18181b' }}>{f.title}</h3>
                  <p className="text-xs mt-1" style={{ color: p.text_color || '#71717a' }}>{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case 'pricing':
      content = (
        <div className="px-10 py-14 bg-zinc-50">
          <h2 className="font-bold text-center mb-2" style={{ fontSize: p.heading_size || '24px', color: p.heading_color || '#18181b' }}>{p.headline || 'Pricing'}</h2>
          <p className="text-center mb-10" style={{ fontSize: p.text_size || '14px', color: p.text_color || '#71717a' }}>{p.subheadline || ''}</p>
          <div className="flex gap-5 justify-center">
            {(p.plans || []).map((plan, i) => (
              <div key={i} className={`p-5 rounded-2xl border flex-1 max-w-[200px] ${plan.highlighted ? 'border-2 bg-white shadow-xl' : 'border-zinc-200 bg-white'}`} style={plan.highlighted ? { borderColor: p.accent_color || '#dd0c51' } : {}}>
                <h3 className="text-sm font-bold" style={{ color: p.heading_color || '#18181b' }}>{plan.name}</h3>
                <p className="text-3xl font-bold my-3" style={{ color: p.heading_color || '#18181b' }}>${plan.price}<span className="text-xs font-normal" style={{ color: p.text_color || '#a1a1aa' }}>/{plan.period}</span></p>
                <div className="space-y-1.5 mb-4">{(plan.features || []).map((f, j) => <p key={j} className="text-xs flex items-center gap-1.5" style={{ color: p.text_color || '#71717a' }}><span className="w-1 h-1 rounded-full" style={{ backgroundColor: p.accent_color || '#34d399' }} />{f}</p>)}</div>
                <span className="block text-center text-xs font-semibold py-2 rounded-full" style={plan.highlighted ? { backgroundColor: p.accent_color || '#dd0c51', color: 'white' } : { backgroundColor: '#f4f4f5', color: '#3f3f46' }}>{plan.cta}</span>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case 'testimonials':
      content = (
        <div className="px-10 py-14 bg-zinc-900 text-white">
          <h2 className="font-bold text-center mb-10" style={{ fontSize: p.heading_size || '24px', color: p.heading_color || 'white' }}>{p.headline || 'Testimonials'}</h2>
          <div className="flex gap-5 justify-center">
            {(p.items || []).map((t, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-zinc-800 flex-1 max-w-[260px]">
                {t.avatar && <img src={t.avatar} alt="" className="w-full h-48 object-cover" />}
                <div className="p-5">
                  <p className="text-sm font-bold">{t.name}</p>
                  <p className="text-xs mt-1" style={{ color: p.text_color || '#a1a1aa' }}>"{t.quote}"</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case 'gallery':
      content = (
        <div className="px-10 py-14 bg-white">
          <h2 className="font-bold text-center mb-8" style={{ fontSize: p.heading_size || '24px', color: p.heading_color || '#18181b' }}>{p.headline || 'Gallery'}</h2>
          <div className="grid grid-cols-3 gap-4">{(p.images || []).map((img, i) => <div key={i} className="aspect-video rounded-xl bg-zinc-200 overflow-hidden"><img src={img.url} alt={img.alt} className="w-full h-full object-cover" /></div>)}</div>
        </div>
      );
      break;
    case 'cta':
      content = (
        <div className="px-10 py-14 text-center text-white">
          <h2 className="font-bold mb-2" style={{ fontSize: p.heading_size || '24px', color: p.heading_color || 'white' }}>{p.headline || 'CTA'}</h2>
          <p className="mb-5" style={{ fontSize: p.text_size || '14px', color: p.text_color || 'rgba(255,255,255,0.6)' }}>{p.subheadline || ''}</p>
          {p.cta_text && <span className="inline-block px-6 py-2.5 rounded-full font-semibold text-sm" style={{ backgroundColor: p.accent_color || '#a3e635', color: '#18181b' }}>{p.cta_text}</span>}
        </div>
      );
      break;
    case 'contact':
      content = (
        <div className="px-10 py-14 bg-zinc-50">
          <h2 className="font-bold text-center mb-2" style={{ fontSize: p.heading_size || '24px', color: p.heading_color || '#18181b' }}>{p.headline || 'Contact'}</h2>
          <p className="text-center mb-8" style={{ fontSize: p.text_size || '14px', color: p.text_color || '#71717a' }}>{p.subheadline || ''}</p>
          <div className="max-w-sm mx-auto space-y-2.5">
            {(p.fields || []).map((f, i) => <div key={i} className={`bg-white border border-zinc-200 rounded-xl px-4 ${f === 'message' ? 'py-8' : 'py-2.5'} text-xs text-zinc-400`}>{f}</div>)}
            <div className="text-center text-sm font-semibold py-2.5 rounded-xl text-white" style={{ backgroundColor: p.accent_color || '#18181b' }}>{p.submit_text || 'Submit'}</div>
          </div>
        </div>
      );
      break;
    case 'footer':
      content = (
        <div className="px-10 py-8 bg-zinc-950 text-white">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">{p.company_name || 'Company'}</span>
            <div className="flex gap-4 text-zinc-400">{(p.links || []).map((l, i) => <span key={i} className="hover:text-white cursor-pointer">{l.label}</span>)}</div>
          </div>
          <p className="text-[10px] text-zinc-600 mt-3">{p.copyright || ''}</p>
        </div>
      );
      break;
    case 'news_feed':
      content = (
        <div className="px-10 py-14">
          <h2 className="text-2xl font-bold text-center mb-2" style={{ color: p.heading_color || '#18181b', fontSize: p.heading_size || '24px' }}>{p.headline || 'Latest News'}</h2>
          <p className="text-sm text-center mb-10" style={{ color: p.text_color || '#71717a' }}>{p.subheadline || 'Stay up to date with our latest articles'}</p>
          <div className={`grid gap-5`} style={{ gridTemplateColumns: `repeat(${p.columns || 3}, 1fr)` }}>
            {(p._preview_items || [{ title: 'Article Title', excerpt: 'Preview of your content library articles will appear here...', category: 'News' }, { title: 'Another Article', excerpt: 'All published content items will be shown automatically.', category: 'Updates' }, { title: 'Latest Update', excerpt: 'Connect this section to your content library.', category: 'Blog' }]).slice(0, p.max_items || 6).map((item, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-zinc-100 bg-white shadow-sm">
                {item.featured_image_url ? (
                  <img src={item.featured_image_url} alt="" className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center"><Grid3X3 className="w-8 h-8 text-zinc-300" /></div>
                )}
                <div className="p-4">
                  {item.category && <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: p.accent_color || '#dd0c51' }}>{item.category}</span>}
                  <h3 className="text-sm font-bold mt-1" style={{ color: p.heading_color || '#18181b' }}>{item.title}</h3>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: p.text_color || '#71717a' }}>{item.excerpt || ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    default:
      content = <div className="px-8 py-10 bg-zinc-100 text-center text-sm text-zinc-400 rounded-lg">{section.type} section</div>;
      break;
  }
  return <SectionWrapper section={section}>{content}</SectionWrapper>;
}

// ── Image Upload Field ──
function ImageField({ label, value, onChange, token }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/api/code-studio/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        onChange(`${API}${data.url}`);
        toast.success('Image uploaded');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Upload failed');
      }
    } catch { toast.error('Upload error'); }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div>
      <Label className="text-[10px] font-semibold text-zinc-400 uppercase">{label}</Label>
      <div className="mt-1 space-y-1.5">
        <Input value={value || ''} onChange={e => onChange(e.target.value)} className="h-8 text-xs font-mono" placeholder="https://..." />
        <label className={`flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-zinc-300 text-xs font-medium cursor-pointer hover:bg-zinc-50 transition-colors ${uploading ? 'text-zinc-400' : 'text-zinc-500'}`}>
          {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</> : <><Image className="w-3 h-3" /> Upload Image</>}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
        {value && (
          <div className="rounded-lg overflow-hidden border border-zinc-200 h-16">
            <img src={value} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Properties Sidebar ──
function PropertiesSidebar({ section, onChange, token, linkedMainSiteId }) {
  const p = section.props || {};
  const update = (key, val) => onChange({ ...section, props: { ...p, [key]: val } });

  const updateLink = (idx, key, val) => {
    const links = [...(p.links || [])];
    links[idx] = { ...links[idx], [key]: val };
    update('links', links);
  };
  const addLink = () => update('links', [...(p.links || []), { label: 'New Link', url: '#' }]);
  const removeLink = (idx) => update('links', (p.links || []).filter((_, i) => i !== idx));

  const updateFeature = (idx, key, val) => {
    const features = [...(p.features || [])];
    features[idx] = { ...features[idx], [key]: val };
    update('features', features);
  };

  const updatePlan = (idx, key, val) => {
    const plans = [...(p.plans || [])];
    plans[idx] = { ...plans[idx], [key]: val };
    update('plans', plans);
  };

  const updateTestimonial = (idx, key, val) => {
    const items = [...(p.items || [])];
    items[idx] = { ...items[idx], [key]: val };
    update('items', items);
  };

  const updateImage = (idx, key, val) => {
    const images = [...(p.images || [])];
    images[idx] = { ...images[idx], [key]: val };
    update('images', images);
  };
  const addImage = () => update('images', [...(p.images || []), { url: '', alt: '', caption: '' }]);
  const removeImage = (idx) => update('images', (p.images || []).filter((_, i) => i !== idx));
  const moveImage = (idx, dir) => {
    const images = [...(p.images || [])];
    const j = idx + dir;
    if (j < 0 || j >= images.length) return;
    [images[idx], images[j]] = [images[j], images[idx]];
    update('images', images);
  };

  const updateBullet = (idx, val) => {
    const bullets = [...(p.bullets || [])];
    bullets[idx] = val;
    update('bullets', bullets);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{section.type} Properties</h3>

      {/* Common text fields */}
      {p.brand !== undefined && <Field label="Brand Name" value={p.brand} onChange={v => update('brand', v)} />}
      {p.brand !== undefined && <ImageField label="Logo" value={p.logo_url || ''} onChange={v => update('logo_url', v)} token={token} />}
      {p.headline !== undefined && <Field label="Headline" value={p.headline} onChange={v => update('headline', v)} />}
      {p.subheadline !== undefined && <Field label="Subheadline" value={p.subheadline} onChange={v => update('subheadline', v)} multiline />}
      {p.badge !== undefined && <Field label="Badge" value={p.badge} onChange={v => update('badge', v)} />}
      {p.cta_text !== undefined && <Field label="Button Text" value={p.cta_text} onChange={v => update('cta_text', v)} />}
      {p.cta_url !== undefined && <Field label="Button URL" value={p.cta_url} onChange={v => update('cta_url', v)} />}
      {p.hero_image !== undefined && <ImageField label="Hero Image" value={p.hero_image} onChange={v => update('hero_image', v)} token={token} />}
      {p.image_url !== undefined && <ImageField label="Image" value={p.image_url} onChange={v => update('image_url', v)} token={token} />}
      {p.company_name !== undefined && <Field label="Company Name" value={p.company_name} onChange={v => update('company_name', v)} />}
      {p.copyright !== undefined && <Field label="Copyright" value={p.copyright} onChange={v => update('copyright', v)} />}

      {/* Background: Solid vs Gradient toggle */}
      {section.type !== 'navbar' && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Background Type</Label>
          <div className="flex gap-1 mt-1">
            {['solid', 'gradient'].map(m => {
              const active = (p.bg_mode || defaultBgMode(section.type)) === m;
              return (
                <button
                  key={m}
                  data-testid={`bg-mode-${m}-btn`}
                  onClick={() => update('bg_mode', m)}
                  className={`flex-1 text-xs py-1.5 rounded-lg font-medium capitalize ${active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}
                >{m}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Universal background image (for all sections) */}
      {section.type !== 'navbar' && (
        <>
          <ImageField label="Background Image" value={p.bg_image || ''} onChange={v => update('bg_image', v)} token={token} />
          {p.bg_image && (
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Dark Overlay</Label>
              <button onClick={() => update('bg_overlay', !p.bg_overlay)} className={`w-8 h-5 rounded-full transition-colors ${p.bg_overlay ? 'bg-zinc-900' : 'bg-zinc-200'}`}>
                <div className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${p.bg_overlay ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Layout */}
      {p.layout !== undefined && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Layout</Label>
          <div className="flex gap-1 mt-1">
            {['left', 'center', 'right'].map(l => (
              <button key={l} onClick={() => update('layout', l)} className={`flex-1 text-xs py-1.5 rounded-lg font-medium ${p.layout === l ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {/* Navbar style */}
      {p.style !== undefined && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Style</Label>
          <div className="flex gap-1 mt-1">
            {['transparent', 'dark', 'light'].map(s => (
              <button key={s} onClick={() => update('style', s)} className={`flex-1 text-xs py-1.5 rounded-lg font-medium ${p.style === s ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Links / Menu items */}
      {p.links !== undefined && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Menu Items</Label>
            <button onClick={addLink} className="text-[10px] font-semibold text-[#dd0c51] hover:underline">+ Add</button>
          </div>
          <div className="space-y-2">
            {(p.links || []).map((link, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input value={link.label} onChange={e => updateLink(i, 'label', e.target.value)} className="h-7 text-xs flex-1" placeholder="Label" />
                <Input value={link.url} onChange={e => updateLink(i, 'url', e.target.value)} className="h-7 text-xs flex-1 font-mono" placeholder="URL" />
                <button onClick={() => removeLink(i)} className="text-red-400 hover:text-red-600 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logos */}
      {p.logos !== undefined && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Logos (comma separated)</Label>
          <Input value={(p.logos || []).join(', ')} onChange={e => update('logos', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="h-8 text-xs mt-1" />
        </div>
      )}

      {/* Bullets */}
      {p.bullets !== undefined && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Bullet Points</Label>
            <button onClick={() => update('bullets', [...(p.bullets || []), 'New item'])} className="text-[10px] font-semibold text-[#dd0c51] hover:underline">+ Add</button>
          </div>
          {(p.bullets || []).map((b, i) => (
            <div key={i} className="flex gap-1.5 mb-1">
              <Input value={b} onChange={e => updateBullet(i, e.target.value)} className="h-7 text-xs flex-1" />
              <button onClick={() => update('bullets', p.bullets.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Gallery Images */}
      {p.images !== undefined && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Gallery Images ({(p.images || []).length})</Label>
            <button onClick={addImage} data-testid="gallery-add-image-btn" className="text-[10px] font-semibold text-[#dd0c51] hover:underline">+ Add Image</button>
          </div>
          <div className="space-y-2">
            {(p.images || []).map((img, i) => (
              <div key={i} className="border border-zinc-200 rounded-lg p-2 space-y-1.5 bg-zinc-50/50">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-zinc-400 w-6">#{i + 1}</span>
                  {img.url && (
                    <div className="w-10 h-10 rounded-md bg-zinc-100 overflow-hidden flex-shrink-0 border border-zinc-200">
                      <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex gap-0.5 ml-auto">
                    <button onClick={() => moveImage(i, -1)} disabled={i === 0} className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => moveImage(i, 1)} disabled={i === (p.images || []).length - 1} className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" title="Move down"><ArrowDown className="w-3 h-3" /></button>
                    <button onClick={() => removeImage(i)} className="p-1 text-red-400 hover:text-red-600" title="Remove"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <ImageField label="Image URL" value={img.url || ''} onChange={v => updateImage(i, 'url', v)} token={token} />
                <Input value={img.caption || ''} onChange={e => updateImage(i, 'caption', e.target.value)} className="h-7 text-xs" placeholder="Caption (optional)" />
                <Input value={img.alt || ''} onChange={e => updateImage(i, 'alt', e.target.value)} className="h-7 text-xs" placeholder="Alt text (SEO)" />
              </div>
            ))}
            {(p.images || []).length === 0 && (
              <p className="text-[11px] text-zinc-400 text-center py-2 italic">No images yet — click "+ Add Image"</p>
            )}
          </div>
        </div>
      )}

      {/* Features */}
      {p.features !== undefined && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase mb-2 block">Features</Label>
          {(p.features || []).map((f, i) => (
            <div key={i} className="border border-zinc-200 rounded-lg p-2 mb-2 space-y-1">
              <Input value={f.title} onChange={e => updateFeature(i, 'title', e.target.value)} className="h-7 text-xs" placeholder="Title" />
              <Input value={f.description} onChange={e => updateFeature(i, 'description', e.target.value)} className="h-7 text-xs" placeholder="Description" />
              {f.image_url !== undefined && <ImageField label="Image" value={f.image_url} onChange={v => updateFeature(i, 'image_url', v)} token={token} />}
            </div>
          ))}
        </div>
      )}

      {/* Plans */}
      {p.plans !== undefined && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase mb-2 block">Pricing Plans</Label>
          {(p.plans || []).map((plan, i) => (
            <div key={i} className="border border-zinc-200 rounded-lg p-2 mb-2 space-y-1">
              <Input value={plan.name} onChange={e => updatePlan(i, 'name', e.target.value)} className="h-7 text-xs" placeholder="Plan name" />
              <div className="flex gap-1">
                <Input value={plan.price} onChange={e => updatePlan(i, 'price', e.target.value)} className="h-7 text-xs flex-1" placeholder="Price" />
                <Input value={plan.cta} onChange={e => updatePlan(i, 'cta', e.target.value)} className="h-7 text-xs flex-1" placeholder="CTA" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Testimonials */}
      {p.items !== undefined && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase mb-2 block">Testimonials</Label>
          {(p.items || []).map((t, i) => (
            <div key={i} className="border border-zinc-200 rounded-lg p-2 mb-2 space-y-1">
              <Input value={t.name} onChange={e => updateTestimonial(i, 'name', e.target.value)} className="h-7 text-xs" placeholder="Name" />
              <Input value={t.quote} onChange={e => updateTestimonial(i, 'quote', e.target.value)} className="h-7 text-xs" placeholder="Quote" />
            </div>
          ))}
        </div>
      )}

      {/* ── Styling: Colors & Sizes (universal) ── */}
      <div className="border-t border-zinc-100 pt-3 mt-3">
        <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Styling</h4>
        <ColorField label="Text Color" value={p.text_color || ''} onChange={v => update('text_color', v)} />
        <ColorField label="Heading Color" value={p.heading_color || ''} onChange={v => update('heading_color', v)} />
        {section.type !== 'navbar' && (() => {
          const mode = p.bg_mode || defaultBgMode(section.type);
          const g = defaultGradient(section.type);
          if (mode === 'gradient') {
            return (
              <>
                <ColorField label="Gradient Color 1" value={p.gradient_from || g.from} onChange={v => update('gradient_from', v)} />
                <ColorField label="Gradient Color 2" value={p.gradient_to || g.to} onChange={v => update('gradient_to', v)} />
                <div>
                  <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Gradient Direction</Label>
                  <select
                    data-testid="gradient-direction-select"
                    value={p.gradient_direction || g.direction}
                    onChange={e => update('gradient_direction', e.target.value)}
                    className="w-full h-8 text-xs mt-1 border border-zinc-200 rounded-lg px-2 bg-white focus:outline-none focus:border-zinc-400"
                  >
                    <option value="to right">→ Left to Right</option>
                    <option value="to left">← Right to Left</option>
                    <option value="to bottom">↓ Top to Bottom</option>
                    <option value="to top">↑ Bottom to Top</option>
                    <option value="to bottom right">↘ Diagonal ↘</option>
                    <option value="to bottom left">↙ Diagonal ↙</option>
                    <option value="to top right">↗ Diagonal ↗</option>
                    <option value="to top left">↖ Diagonal ↖</option>
                  </select>
                </div>
              </>
            );
          }
          return <ColorField label="Background Color" value={p.section_bg_color || ''} onChange={v => update('section_bg_color', v)} />;
        })()}
        <ColorField label="Accent / Button Color" value={p.accent_color || ''} onChange={v => update('accent_color', v)} />
        <SizeField label="Heading Size" value={p.heading_size || '24px'} onChange={v => update('heading_size', v)} min={12} max={72} />
        <SizeField label="Text Size" value={p.text_size || '14px'} onChange={v => update('text_size', v)} min={10} max={32} />
        <SizeField label="Padding Top" value={p.padding_top || '48px'} onChange={v => update('padding_top', v)} min={0} max={200} />
        <SizeField label="Padding Bottom" value={p.padding_bottom || '48px'} onChange={v => update('padding_bottom', v)} min={0} max={200} />
        <SizeField label="Border Radius" value={p.border_radius || '0px'} onChange={v => update('border_radius', v)} min={0} max={48} />
      </div>

      {/* ── News Feed Config ── */}
      {section.type === 'news_feed' && (
        <div className="border-t border-zinc-100 pt-3 mt-3">
          <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Content Library</h4>
          {linkedMainSiteId ? (
            <div className="flex items-center gap-2 text-[11px] text-emerald-600 mb-2"><Link2 className="w-3 h-3" /> Linked to content library</div>
          ) : (
            <p className="text-[11px] text-amber-600 mb-2">No content library linked. Go to Settings to connect one.</p>
          )}
          <SizeField label="Max Articles" value={String(p.max_items || 6)} onChange={v => update('max_items', parseInt(v) || 6)} min={1} max={24} unit="" />
          <div>
            <Label className="text-[10px] font-semibold text-zinc-400 uppercase">Columns</Label>
            <div className="flex gap-1 mt-1">
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => update('columns', n)} className={`flex-1 text-xs py-1.5 rounded-lg font-medium ${(p.columns || 3) === n ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{n}</button>
              ))}
            </div>
          </div>
          <button onClick={async () => {
            const siteId = linkedMainSiteId;
            if (!siteId) { toast.error('No content library linked'); return; }
            try {
              const res = await fetch(`${API}/api/code-studio/content-feed/${siteId}?limit=${p.max_items || 6}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const items = await res.json();
                update('_preview_items', items);
                update('main_site_id', siteId);
                toast.success(`Loaded ${items.length} articles`);
              } else { toast.error('Failed to load content'); }
            } catch { toast.error('Error'); }
          }} className="w-full mt-2 text-xs py-2 rounded-lg bg-zinc-900 text-white font-semibold hover:bg-zinc-800 transition-colors">
            Load Content Preview
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, multiline }) {
  return (
    <div>
      <Label className="text-[10px] font-semibold text-zinc-400 uppercase">{label}</Label>
      {multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} className="w-full mt-1 text-xs bg-zinc-50 border border-zinc-200 rounded-lg p-2 h-16 resize-none" />
      ) : (
        <Input value={value || ''} onChange={e => onChange(e.target.value)} className="h-8 text-xs mt-1" />
      )}
    </div>
  );
}


// ── Main Component ──
export default function CodeStudioPage() {
  const { token } = useAuth();
  const mainSiteCtx = useContext(MainSiteContext);
  const parentMainSite = mainSiteCtx?.mainSite || null;
  const [sites, setSites] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createTemplate, setCreateTemplate] = useState('fintech');
  const [creating, setCreating] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [editingPage, setEditingPage] = useState(null);
  const [pages, setPages] = useState([]);
  const [sections, setSections] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDns, setShowDns] = useState(null);
  const [dnsInfo, setDnsInfo] = useState(null);
  const [showComponentLib, setShowComponentLib] = useState(false);
  const [showNewPage, setShowNewPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [mainSites, setMainSites] = useState([]);
  const [linkedSiteId, setLinkedSiteId] = useState('');
  const [showSiteSettings, setShowSiteSettings] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    try {
      const [s, t, c, ms] = await Promise.all([
        fetch(`${API}/api/code-studio/sites`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/code-studio/templates`),
        fetch(`${API}/api/code-studio/components`),
        fetch(`${API}/api/main-sites`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (s.ok) setSites(await s.json());
      if (t.ok) setTemplates(await t.json());
      if (c.ok) setComponents(await c.json());
      if (ms.ok) {
        const msData = await ms.json();
        setMainSites(Array.isArray(msData) ? msData : msData.sites || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!createName || !createSlug) return;
    setCreating(true);
    // Prefer explicitly chosen link; fall back to the parent main_site's configured library
    const effectiveLink = linkedSiteId || parentMainSite?.linked_main_site_id || null;
    try {
      const res = await fetch(`${API}/api/code-studio/sites`, { method: 'POST', headers, body: JSON.stringify({ name: createName, slug: createSlug, template_id: createTemplate, linked_main_site_id: effectiveLink }) });
      if (res.ok) {
        const data = await res.json();
        toast.success('Site created');
        setShowCreate(false);
        setCreateName(''); setCreateSlug('');
        await fetchData();
        openEditor(data.id, data.page_id);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed');
      }
    } catch { toast.error('Error'); }
    setCreating(false);
  };

  const openEditor = async (siteId, pageId) => {
    try {
      const [sR, pagesR] = await Promise.all([
        fetch(`${API}/api/code-studio/sites/${siteId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/code-studio/sites/${siteId}/pages`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (sR.ok) {
        const siteData = await sR.json();
        setEditingSite(siteData);
        setLinkedSiteId(siteData.linked_main_site_id || '');
      }
      if (pagesR.ok) {
        const allPages = await pagesR.json();
        setPages(allPages);
        const target = pageId ? allPages.find(p => p.id === pageId) : allPages[0];
        if (target) { setEditingPage(target); setSections(target.sections || []); }
      }
    } catch (e) { console.error(e); }
  };

  const saveSiteSettings = async () => {
    if (!editingSite) return;
    try {
      const res = await fetch(`${API}/api/code-studio/sites/${editingSite.id}`, {
        method: 'PUT', headers, body: JSON.stringify({ linked_main_site_id: linkedSiteId }),
      });
      if (res.ok) {
        setEditingSite(prev => ({ ...prev, linked_main_site_id: linkedSiteId }));
        toast.success('Settings saved');
        setShowSiteSettings(false);
      } else toast.error('Failed to save');
    } catch { toast.error('Error'); }
  };

  const switchPage = async (page) => {
    // Save current page first
    if (editingSite && editingPage) {
      await fetch(`${API}/api/code-studio/sites/${editingSite.id}/pages/${editingPage.id}`, { method: 'PUT', headers, body: JSON.stringify({ sections }) });
    }
    setEditingPage(page);
    setSections(page.sections || []);
    setSelectedIdx(null);
  };

  const createPage = async () => {
    if (!newPageTitle || !editingSite) return;
    const slug = newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const res = await fetch(`${API}/api/code-studio/sites/${editingSite.id}/pages`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: newPageTitle, slug, sections: [], is_published: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const newPage = { id: data.id, title: newPageTitle, slug, sections: [], is_published: true };

        // Add the new page as a link to every navbar section on the current page
        const pageUrl = `/${slug}`;
        const updatedSections = sections.map(s => {
          if (s.type === 'navbar' && s.props?.links) {
            return { ...s, props: { ...s.props, links: [...s.props.links, { label: newPageTitle, url: pageUrl }] } };
          }
          return s;
        });
        setSections(updatedSections);

        // Save current page with updated navbar
        if (editingPage) {
          await fetch(`${API}/api/code-studio/sites/${editingSite.id}/pages/${editingPage.id}`, {
            method: 'PUT', headers, body: JSON.stringify({ sections: updatedSections }),
          });
        }

        // Also update navbar on all other existing pages
        for (const page of pages) {
          if (page.id === editingPage?.id) continue;
          const pageSections = page.sections || [];
          const updated = pageSections.map(s => {
            if (s.type === 'navbar' && s.props?.links) {
              return { ...s, props: { ...s.props, links: [...s.props.links, { label: newPageTitle, url: pageUrl }] } };
            }
            return s;
          });
          if (JSON.stringify(updated) !== JSON.stringify(pageSections)) {
            await fetch(`${API}/api/code-studio/sites/${editingSite.id}/pages/${page.id}`, {
              method: 'PUT', headers, body: JSON.stringify({ sections: updated }),
            });
          }
        }

        setPages(prev => [...prev, newPage]);
        switchPage(newPage);
        setShowNewPage(false);
        setNewPageTitle('');
        toast.success('Page created & added to menu');
      }
    } catch { toast.error('Error creating page'); }
  };

  const deletePage = async (pageId) => {
    if (!editingSite) return;
    if (pages.length <= 1) { toast.error('Cannot delete the last page'); return; }
    const pageToDelete = pages.find(p => p.id === pageId);
    const pageUrl = pageToDelete ? `/${pageToDelete.slug}` : null;
    try {
      await fetch(`${API}/api/code-studio/sites/${editingSite.id}/pages/${pageId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const remaining = pages.filter(p => p.id !== pageId);
      setPages(remaining);

      // Remove the link from the current page's navbar
      if (pageUrl) {
        const updatedSections = sections.map(s => {
          if (s.type === 'navbar' && s.props?.links) {
            return { ...s, props: { ...s.props, links: s.props.links.filter(l => l.url !== pageUrl) } };
          }
          return s;
        });
        setSections(updatedSections);
      }

      if (editingPage?.id === pageId) {
        setEditingPage(remaining[0]);
        setSections(remaining[0]?.sections || []);
      }
      toast.success('Page deleted');
    } catch { toast.error('Error'); }
  };

  const savePage = async () => {
    if (!editingSite || !editingPage) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/code-studio/sites/${editingSite.id}/pages/${editingPage.id}`, { method: 'PUT', headers, body: JSON.stringify({ sections }) });
      if (res.ok) toast.success('Saved');
      else toast.error('Failed');
    } catch { toast.error('Error'); }
    setSaving(false);
  };

  const publishSite = async () => {
    if (!editingSite) return;
    await savePage();
    try {
      const res = await fetch(`${API}/api/code-studio/sites/${editingSite.id}/publish`, { method: 'POST', headers });
      if (res.ok) { toast.success('Published'); setEditingSite(prev => ({ ...prev, published: true })); }
    } catch { toast.error('Error'); }
  };

  const deleteSite = async (siteId) => {
    try { await fetch(`${API}/api/code-studio/sites/${siteId}`, { method: 'DELETE', headers }); toast.success('Deleted'); fetchData(); } catch {}
  };

  const moveSection = (i, dir) => {
    const t = i + dir;
    if (t < 0 || t >= sections.length) return;
    const s = [...sections];
    [s[i], s[t]] = [s[t], s[i]];
    setSections(s);
    setSelectedIdx(t);
  };

  const removeSection = (i) => { setSections(prev => prev.filter((_, j) => j !== i)); setSelectedIdx(null); };

  const addComponent = (type) => {
    setSections(prev => [...prev, { id: `${type}_${Date.now()}`, type, order: prev.length, props: {} }]);
    setShowComponentLib(false);
  };

  const updateSection = (idx, updated) => {
    setSections(prev => prev.map((s, i) => i === idx ? updated : s));
  };

  const fetchDns = async (siteId) => {
    try { const r = await fetch(`${API}/api/code-studio/sites/${siteId}/dns`, { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) setDnsInfo(await r.json()); } catch {}
    setShowDns(siteId);
  };

  // ── EDITOR VIEW ──
  if (editingSite) {
    const selectedSection = selectedIdx !== null ? sections[selectedIdx] : null;
    return (
      <div className="h-[calc(100vh-120px)] flex flex-col" data-testid="code-studio-editor">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-zinc-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { setEditingSite(null); setEditingPage(null); setSections([]); setSelectedIdx(null); }} className="text-zinc-400 hover:text-zinc-700"><X className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-zinc-800">{editingSite.name}</span>
            <span className="text-xs text-zinc-400 font-mono">/{editingSite.slug}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSiteSettings(true)} className="gap-1.5 text-xs"><Settings className="w-3.5 h-3.5" /> Settings</Button>
            <Button variant="outline" size="sm" onClick={() => setShowComponentLib(true)} className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> Add Section</Button>
            <Button variant="outline" size="sm" onClick={savePage} disabled={saving} className="gap-1.5 text-xs"><Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}</Button>
            <Button size="sm" onClick={publishSite} className="gap-1.5 text-xs bg-[#dd0c51] hover:bg-[#c40a47] !text-white [&>svg]:text-white"><Globe className="w-3.5 h-3.5" /> Publish</Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Page tabs */}
          <div className="flex items-center gap-1 px-4 py-1.5 bg-zinc-50 border-b border-zinc-200 flex-shrink-0">
            {pages.map(page => (
              <div key={page.id} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors group ${editingPage?.id === page.id ? 'bg-white shadow-sm text-zinc-800 border border-zinc-200' : 'text-zinc-500 hover:text-zinc-700 hover:bg-white/60'}`}>
                <span onClick={() => switchPage(page)}>{page.title || page.slug}</span>
                {pages.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); deletePage(page.id); }} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                )}
              </div>
            ))}
            <button onClick={() => setShowNewPage(true)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-600 hover:bg-white/60" data-testid="add-page-btn">
              <Plus className="w-3 h-3" /> Page
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 overflow-y-auto bg-zinc-100 p-6">
            <div className="max-w-4xl mx-auto">
              {sections.map((section, index) => {
                const isSelected = selectedIdx === index;
                return (
                  <div key={section.id || index}
                    className={`relative group cursor-pointer transition-all ${isSelected ? 'ring-2 ring-[#dd0c51] ring-offset-2 rounded-lg' : 'hover:ring-1 hover:ring-zinc-300 hover:ring-offset-1 rounded-lg'}`}
                    onClick={() => setSelectedIdx(index)}
                    data-testid={`section-${section.type}-${index}`}
                  >
                    <div className={`absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button onClick={e => { e.stopPropagation(); moveSection(index, -1); }} disabled={index === 0} className="w-7 h-7 rounded bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50"><ArrowUp className="w-3 h-3 text-zinc-500" /></button>
                      <button onClick={e => { e.stopPropagation(); moveSection(index, 1); }} disabled={index === sections.length - 1} className="w-7 h-7 rounded bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50"><ArrowDown className="w-3 h-3 text-zinc-500" /></button>
                      <button onClick={e => { e.stopPropagation(); removeSection(index); }} className="w-7 h-7 rounded bg-white border border-red-200 flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3 h-3 text-red-400" /></button>
                    </div>
                    <div className={`absolute -right-2 top-2 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider z-10 ${isSelected ? 'opacity-100 bg-[#dd0c51] text-white' : 'opacity-0 group-hover:opacity-100 bg-zinc-700 text-white'}`}>{section.type}</div>
                    <div className="overflow-hidden rounded-lg"><SectionPreview section={section} /></div>
                  </div>
                );
              })}
              {sections.length === 0 && (
                <div className="text-center py-20">
                  <Code2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                  <p className="text-zinc-400 mb-4">Start building your page</p>
                  <Button onClick={() => setShowComponentLib(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Section</Button>
                </div>
              )}
            </div>
          </div>

          {/* Properties Sidebar */}
          {selectedSection && (
            <div className="w-[320px] bg-white border-l border-zinc-200 overflow-y-auto p-4 flex-shrink-0" data-testid="properties-sidebar">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-zinc-800 capitalize">{selectedSection.type}</h4>
                <button onClick={() => setSelectedIdx(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
              </div>
              <PropertiesSidebar section={selectedSection} onChange={updated => updateSection(selectedIdx, updated)} token={token} linkedMainSiteId={editingSite?.linked_main_site_id || linkedSiteId} />
            </div>
          )}
        </div>
        </div>

        {/* Component Library */}
        <Dialog open={showComponentLib} onOpenChange={setShowComponentLib}>
          <DialogContent className="bg-white max-w-md">
            <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
            <div className="grid grid-cols-3 gap-2 py-2">
              {components.map(comp => {
                const Icon = SECTION_ICONS[comp.type] || Layout;
                return (
                  <button key={comp.type} onClick={() => addComponent(comp.type)} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-colors" data-testid={`add-component-${comp.type}`}>
                    <Icon className="w-5 h-5 text-zinc-500" /><span className="text-xs font-medium text-zinc-700">{comp.label}</span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {/* New Page Dialog */}
        <Dialog open={showNewPage} onOpenChange={setShowNewPage}>
          <DialogContent className="bg-white max-w-sm">
            <DialogHeader><DialogTitle>New Page</DialogTitle></DialogHeader>
            <div className="py-2">
              <Label className="text-xs font-semibold text-zinc-500 uppercase">Page Title</Label>
              <Input value={newPageTitle} onChange={e => setNewPageTitle(e.target.value)} placeholder="e.g. About, Contact, Blog" className="mt-1" data-testid="new-page-title" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewPage(false)}>Cancel</Button>
              <Button onClick={createPage} disabled={!newPageTitle} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="create-page-btn">Create Page</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Site Settings Dialog */}
        <Dialog open={showSiteSettings} onOpenChange={setShowSiteSettings}>
          <DialogContent className="bg-white max-w-md">
            <DialogHeader><DialogTitle>Site Settings</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold text-zinc-500 uppercase">Linked Content Library</Label>
                <p className="text-[11px] text-zinc-400 mt-0.5 mb-2">Connect a main site to pull articles into news feed sections.</p>
                <select value={linkedSiteId} onChange={e => setLinkedSiteId(e.target.value)} className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50 text-sm px-3 text-zinc-700" data-testid="linked-cl-select">
                  <option value="">No content library</option>
                  {parentMainSite && (parentMainSite.enabled_features || []).includes('content_library') && (
                    <option value={parentMainSite.id}>
                      {parentMainSite.name} · this site (built-in)
                    </option>
                  )}
                  {mainSites
                    .filter(s => (s.enabled_features || []).includes('content_library') && s.id !== parentMainSite?.id)
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                {linkedSiteId && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-600">
                    <Link2 className="w-3 h-3" /> Linked to: {linkedSiteId === parentMainSite?.id ? `${parentMainSite.name} (built-in)` : (mainSites.find(s => s.id === linkedSiteId)?.name || linkedSiteId)}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSiteSettings(false)}>Cancel</Button>
              <Button onClick={saveSiteSettings} className="bg-zinc-900 hover:bg-zinc-800 text-white">Save Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── SITES LIST VIEW ──
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;

  return (
    <div data-testid="code-studio-page">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#7c1ac8]/10 rounded-xl"><Code2 className="w-6 h-6 text-[#7c1ac8]" /></div>
          <div><h1 className="text-2xl font-bold text-zinc-900">Code Studio</h1><p className="text-sm text-zinc-500">Build modern websites with drag & drop</p></div>
        </div>
        <Button onClick={() => {
          // Auto-preselect parent main site's content library if it has one enabled
          if (parentMainSite && (parentMainSite.enabled_features || []).includes('content_library')) {
            setLinkedSiteId(parentMainSite.id);
          } else if (parentMainSite?.linked_main_site_id) {
            setLinkedSiteId(parentMainSite.linked_main_site_id);
          } else {
            setLinkedSiteId('');
          }
          setShowCreate(true);
        }} className="bg-[#dd0c51] hover:bg-[#c40a47] !text-white rounded-full gap-2 [&>svg]:text-white" data-testid="create-studio-site"><Plus className="w-4 h-4" /> New Site</Button>
      </div>

      {sites.length === 0 ? (
        <div className="text-center py-20 bg-zinc-50 rounded-2xl border border-zinc-200">
          <Code2 className="w-14 h-14 text-zinc-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-zinc-600 mb-1">No sites yet</h3>
          <p className="text-sm text-zinc-400 mb-6">Create your first website with a template or start from scratch.</p>
          <Button onClick={() => {
            if (parentMainSite && (parentMainSite.enabled_features || []).includes('content_library')) {
              setLinkedSiteId(parentMainSite.id);
            } else if (parentMainSite?.linked_main_site_id) {
              setLinkedSiteId(parentMainSite.linked_main_site_id);
            } else {
              setLinkedSiteId('');
            }
            setShowCreate(true);
          }} className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white"><Plus className="w-4 h-4" /> Create Your First Site</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map(site => (
            <div key={site.id} className="rounded-xl border border-zinc-200 bg-white overflow-hidden hover:shadow-lg transition-shadow" data-testid={`studio-site-${site.slug}`}>
              <div className="h-32 bg-gradient-to-br from-[#7c1ac8]/10 to-[#dd0c51]/10 flex items-center justify-center"><Code2 className="w-10 h-10 text-[#7c1ac8]/30" /></div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-zinc-800">{site.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${site.published ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'}`}>{site.published ? 'Live' : 'Draft'}</span>
                </div>
                <p className="text-xs text-zinc-400 mb-3">/{site.slug}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openEditor(site.id)}><Pencil className="w-3 h-3 mr-1" /> Edit</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => fetchDns(site.id)}><Globe className="w-3 h-3" /></Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 hover:bg-red-50" onClick={() => deleteSite(site.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Site</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Site Name</label><Input value={createName} onChange={e => { setCreateName(e.target.value); setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} placeholder="My Website" className="mt-1" /></div>
              <div><label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Slug</label><Input value={createSlug} onChange={e => setCreateSlug(e.target.value)} placeholder="my-website" className="mt-1 font-mono" /></div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Choose Template</label>
              <div className="grid grid-cols-3 gap-3">
                {templates.map(tmpl => (
                  <button key={tmpl.id} onClick={() => setCreateTemplate(tmpl.id)} className={`rounded-xl border-2 overflow-hidden transition-all text-left ${createTemplate === tmpl.id ? 'border-[#7c1ac8] shadow-lg' : 'border-zinc-200 hover:border-zinc-400'}`} data-testid={`template-${tmpl.id}`}>
                    {tmpl.thumbnail ? <img src={tmpl.thumbnail} alt={tmpl.name} className="w-full h-20 object-cover" /> : <div className="w-full h-20 bg-zinc-100 flex items-center justify-center"><Code2 className="w-6 h-6 text-zinc-300" /></div>}
                    <div className="p-2">
                      <p className="text-xs font-semibold text-zinc-800">{tmpl.name}</p>
                      <p className="text-[10px] text-zinc-400 leading-tight">{tmpl.description}</p>
                      {tmpl.page_count > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-[#7c1ac8]">{tmpl.page_count} page{tmpl.page_count > 1 ? 's' : ''}</span>
                          {tmpl.page_titles && tmpl.page_titles.length > 1 && (
                            <span className="text-[9px] text-zinc-400 truncate" title={tmpl.page_titles.join(' · ')}>· {tmpl.page_titles.slice(0, 3).join(' · ')}{tmpl.page_titles.length > 3 ? '...' : ''}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Content Library Link */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Link Content Library (optional)</label>
              <p className="text-[11px] text-zinc-400 mb-2">Connect a main site's content library to show articles on your website.</p>
              <select value={linkedSiteId} onChange={e => setLinkedSiteId(e.target.value)} className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50 text-sm px-3 text-zinc-700" data-testid="create-linked-cl-select">
                <option value="">No content library</option>
                {parentMainSite && (parentMainSite.enabled_features || []).includes('content_library') && (
                  <option value={parentMainSite.id}>
                    {parentMainSite.name} · this site (built-in)
                  </option>
                )}
                {mainSites
                  .filter(s => (s.enabled_features || []).includes('content_library') && s.id !== parentMainSite?.id)
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !createName || !createSlug} className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5">{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Site</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDns} onOpenChange={() => { setShowDns(null); setDnsInfo(null); }}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>Domain & DNS</DialogTitle></DialogHeader>
          {dnsInfo && (
            <div className="space-y-4 py-2">
              <div><label className="text-xs font-semibold text-zinc-500 uppercase">Clara URL</label><div className="flex items-center gap-2 mt-1 bg-zinc-50 rounded-lg px-3 py-2"><code className="text-xs text-zinc-700 flex-1">{dnsInfo.clara_url}</code><button onClick={() => { navigator.clipboard.writeText(dnsInfo.clara_url); toast.success('Copied'); }}><Copy className="w-3.5 h-3.5 text-zinc-400" /></button></div></div>
              <div><label className="text-xs font-semibold text-zinc-500 uppercase">DNS Records</label><p className="text-[11px] text-zinc-400 mt-0.5 mb-2">Add these at your DNS provider.</p>
                {(dnsInfo.dns_records || []).map((r, i) => (
                  <div key={i} className="bg-zinc-50 rounded-lg p-3 text-xs font-mono mb-2">
                    <span className="bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded text-[10px] font-bold mr-2">{r.type}</span>
                    <span className="text-zinc-400">Name:</span> {r.name || '(domain)'} &middot; <span className="text-zinc-400">Value:</span> {r.value}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
