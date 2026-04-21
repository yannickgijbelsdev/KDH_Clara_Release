import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  Plus, Globe, Code2, Trash2, X, Type, Image, CreditCard, MessageCircle,
  Mail, Layout, Menu as MenuIcon, Minus, MoveVertical, Play,
  Megaphone, Grid3X3, Loader2, Copy, Award, Columns,
  Pencil, ArrowUp, ArrowDown, Save,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const SECTION_ICONS = {
  navbar: MenuIcon, hero: Layout, features: Grid3X3, pricing: CreditCard,
  testimonials: MessageCircle, gallery: Image, contact: Mail,
  cta: Megaphone, footer: Minus, text: Type, image: Image,
  video: Play, divider: Minus, spacer: MoveVertical, html: Code2,
  logos: Award, image_text: Columns,
};

// ── Section Preview Renderer ──
function SectionPreview({ section }) {
  const p = section.props || {};
  switch (section.type) {
    case 'navbar':
      return (
        <div className={`flex items-center justify-between px-8 py-4 ${p.style === 'dark' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900 border-b border-zinc-100'}`}>
          <span className="font-bold text-sm">{p.brand || 'Brand'}</span>
          <div className="flex items-center gap-5 text-xs">
            {(p.links || []).map((l, i) => <span key={i} className="opacity-60 hover:opacity-100 cursor-pointer">{l.label}</span>)}
            {p.cta_text && <span className={`px-4 py-1.5 rounded-full font-semibold text-xs ${p.style === 'dark' ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}`}>{p.cta_text}</span>}
          </div>
        </div>
      );
    case 'hero':
      return (
        <div className={`relative px-10 ${p.layout === 'left' ? 'py-16' : 'py-20 text-center'} bg-gradient-to-br ${p.bg_gradient || 'from-zinc-900 to-zinc-800'} text-white overflow-hidden`}>
          {p.badge && <div className="inline-block bg-white/10 border border-white/20 rounded-full px-3 py-1 text-[10px] font-medium mb-4">{p.badge}</div>}
          <div className={p.layout === 'left' ? 'max-w-[55%]' : ''}>
            <h1 className="text-4xl font-bold mb-3 leading-tight">{p.headline || 'Headline'}</h1>
            <p className="text-sm text-white/60 mb-6 max-w-md">{p.subheadline || ''}</p>
            {p.cta_text && <span className="inline-block bg-lime-400 text-zinc-900 px-5 py-2.5 rounded-full font-semibold text-sm">{p.cta_text}</span>}
          </div>
          {p.hero_image && p.layout === 'left' && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 w-[35%] h-[80%] rounded-2xl overflow-hidden opacity-80">
              <img src={p.hero_image} alt="" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      );
    case 'logos':
      return (
        <div className="px-10 py-8 bg-white border-t border-zinc-100">
          {p.headline && <p className="text-xs text-zinc-400 text-center mb-4 font-medium">{p.headline}</p>}
          <div className="flex items-center justify-center gap-8">
            {(p.logos || []).map((logo, i) => (
              <span key={i} className="text-sm font-bold text-zinc-300 tracking-wide">{logo}</span>
            ))}
          </div>
        </div>
      );
    case 'image_text':
      return (
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
    case 'features':
      return (
        <div className="px-10 py-14 bg-white">
          <h2 className="text-2xl font-bold text-zinc-900 text-center mb-2">{p.headline || 'Features'}</h2>
          <p className="text-sm text-zinc-500 text-center mb-10">{p.subheadline || ''}</p>
          <div className="grid grid-cols-3 gap-5">
            {(p.features || []).map((f, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-zinc-50">
                {f.image_url && <img src={f.image_url} alt="" className="w-full h-36 object-cover" />}
                <div className="p-4">
                  <h3 className="text-sm font-bold text-zinc-800">{f.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'pricing':
      return (
        <div className="px-10 py-14 bg-zinc-50">
          <h2 className="text-2xl font-bold text-zinc-900 text-center mb-2">{p.headline || 'Pricing'}</h2>
          <p className="text-sm text-zinc-500 text-center mb-10">{p.subheadline || ''}</p>
          <div className="flex gap-5 justify-center">
            {(p.plans || []).map((plan, i) => (
              <div key={i} className={`p-5 rounded-2xl border flex-1 max-w-[200px] ${plan.highlighted ? 'border-[#dd0c51] bg-white shadow-xl' : 'border-zinc-200 bg-white'}`}>
                <h3 className="text-sm font-bold text-zinc-800">{plan.name}</h3>
                <p className="text-3xl font-bold text-zinc-900 my-3">${plan.price}<span className="text-xs text-zinc-400 font-normal">/{plan.period}</span></p>
                <div className="space-y-1.5 mb-4">{(plan.features || []).map((f, j) => <p key={j} className="text-xs text-zinc-500 flex items-center gap-1.5"><span className="w-1 h-1 bg-emerald-400 rounded-full" />{f}</p>)}</div>
                <span className={`block text-center text-xs font-semibold py-2 rounded-full ${plan.highlighted ? 'bg-[#dd0c51] text-white' : 'bg-zinc-100 text-zinc-700'}`}>{plan.cta}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'testimonials':
      return (
        <div className="px-10 py-14 bg-zinc-900 text-white">
          <h2 className="text-2xl font-bold text-center mb-10">{p.headline || 'Testimonials'}</h2>
          <div className="flex gap-5 justify-center">
            {(p.items || []).map((t, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-zinc-800 flex-1 max-w-[260px]">
                {t.avatar && <img src={t.avatar} alt="" className="w-full h-48 object-cover" />}
                <div className="p-5">
                  <p className="text-sm font-bold">{t.name}</p>
                  <p className="text-xs text-zinc-400 mt-1">"{t.quote}"</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'gallery':
      return (
        <div className="px-10 py-14 bg-white">
          <h2 className="text-2xl font-bold text-zinc-900 text-center mb-8">{p.headline || 'Gallery'}</h2>
          <div className="grid grid-cols-3 gap-4">{(p.images || []).map((img, i) => <div key={i} className="aspect-video rounded-xl bg-zinc-200 overflow-hidden"><img src={img.url} alt={img.alt} className="w-full h-full object-cover" /></div>)}</div>
        </div>
      );
    case 'cta':
      return (
        <div className={`px-10 py-14 text-center bg-gradient-to-r ${p.bg_gradient || 'from-[#dd0c51] to-[#7c1ac8]'} text-white`}>
          <h2 className="text-2xl font-bold mb-2">{p.headline || 'CTA'}</h2>
          <p className="text-sm text-white/60 mb-5">{p.subheadline || ''}</p>
          {p.cta_text && <span className="inline-block bg-lime-400 text-zinc-900 px-6 py-2.5 rounded-full font-semibold text-sm">{p.cta_text}</span>}
        </div>
      );
    case 'contact':
      return (
        <div className="px-10 py-14 bg-zinc-50">
          <h2 className="text-2xl font-bold text-zinc-900 text-center mb-2">{p.headline || 'Contact'}</h2>
          <p className="text-sm text-zinc-500 text-center mb-8">{p.subheadline || ''}</p>
          <div className="max-w-sm mx-auto space-y-2.5">
            {(p.fields || []).map((f, i) => <div key={i} className={`bg-white border border-zinc-200 rounded-xl px-4 ${f === 'message' ? 'py-8' : 'py-2.5'} text-xs text-zinc-400`}>{f}</div>)}
            <div className="bg-zinc-900 text-white text-center text-sm font-semibold py-2.5 rounded-xl">{p.submit_text || 'Submit'}</div>
          </div>
        </div>
      );
    case 'footer':
      return (
        <div className="px-10 py-8 bg-zinc-950 text-white">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">{p.company_name || 'Company'}</span>
            <div className="flex gap-4 text-zinc-400">{(p.links || []).map((l, i) => <span key={i} className="hover:text-white cursor-pointer">{l.label}</span>)}</div>
          </div>
          <p className="text-[10px] text-zinc-600 mt-3">{p.copyright || ''}</p>
        </div>
      );
    default:
      return <div className="px-8 py-10 bg-zinc-100 text-center text-sm text-zinc-400 rounded-lg">{section.type} section</div>;
  }
}

// ── Properties Sidebar ──
function PropertiesSidebar({ section, onChange }) {
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
      {p.headline !== undefined && <Field label="Headline" value={p.headline} onChange={v => update('headline', v)} />}
      {p.subheadline !== undefined && <Field label="Subheadline" value={p.subheadline} onChange={v => update('subheadline', v)} multiline />}
      {p.badge !== undefined && <Field label="Badge" value={p.badge} onChange={v => update('badge', v)} />}
      {p.cta_text !== undefined && <Field label="Button Text" value={p.cta_text} onChange={v => update('cta_text', v)} />}
      {p.cta_url !== undefined && <Field label="Button URL" value={p.cta_url} onChange={v => update('cta_url', v)} />}
      {p.hero_image !== undefined && <Field label="Hero Image URL" value={p.hero_image} onChange={v => update('hero_image', v)} />}
      {p.image_url !== undefined && <Field label="Image URL" value={p.image_url} onChange={v => update('image_url', v)} />}
      {p.company_name !== undefined && <Field label="Company Name" value={p.company_name} onChange={v => update('company_name', v)} />}
      {p.copyright !== undefined && <Field label="Copyright" value={p.copyright} onChange={v => update('copyright', v)} />}

      {/* Background */}
      {p.bg_gradient !== undefined && <Field label="Background Gradient" value={p.bg_gradient} onChange={v => update('bg_gradient', v)} />}
      {p.bg_color !== undefined && <Field label="Background Class" value={p.bg_color} onChange={v => update('bg_color', v)} />}

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

      {/* Features */}
      {p.features !== undefined && (
        <div>
          <Label className="text-[10px] font-semibold text-zinc-400 uppercase mb-2 block">Features</Label>
          {(p.features || []).map((f, i) => (
            <div key={i} className="border border-zinc-200 rounded-lg p-2 mb-2 space-y-1">
              <Input value={f.title} onChange={e => updateFeature(i, 'title', e.target.value)} className="h-7 text-xs" placeholder="Title" />
              <Input value={f.description} onChange={e => updateFeature(i, 'description', e.target.value)} className="h-7 text-xs" placeholder="Description" />
              {f.image_url !== undefined && <Input value={f.image_url} onChange={e => updateFeature(i, 'image_url', e.target.value)} className="h-7 text-xs font-mono" placeholder="Image URL" />}
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
  const [sections, setSections] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDns, setShowDns] = useState(null);
  const [dnsInfo, setDnsInfo] = useState(null);
  const [showComponentLib, setShowComponentLib] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    try {
      const [s, t, c] = await Promise.all([
        fetch(`${API}/api/code-studio/sites`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/code-studio/templates`),
        fetch(`${API}/api/code-studio/components`),
      ]);
      if (s.ok) setSites(await s.json());
      if (t.ok) setTemplates(await t.json());
      if (c.ok) setComponents(await c.json());
    } catch (e) { console.error(e); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!createName || !createSlug) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/code-studio/sites`, { method: 'POST', headers, body: JSON.stringify({ name: createName, slug: createSlug, template_id: createTemplate }) });
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
      const [sR, pR] = await Promise.all([
        fetch(`${API}/api/code-studio/sites/${siteId}`, { headers: { Authorization: `Bearer ${token}` } }),
        pageId ? fetch(`${API}/api/code-studio/sites/${siteId}/pages/${pageId}`, { headers: { Authorization: `Bearer ${token}` } })
               : fetch(`${API}/api/code-studio/sites/${siteId}/pages`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (sR.ok) setEditingSite(await sR.json());
      if (pR.ok) {
        const d = await pR.json();
        const page = Array.isArray(d) ? d[0] : d;
        if (page) { setEditingPage(page); setSections(page.sections || []); }
      }
    } catch (e) { console.error(e); }
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
            <Button variant="outline" size="sm" onClick={() => setShowComponentLib(true)} className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> Add Section</Button>
            <Button variant="outline" size="sm" onClick={savePage} disabled={saving} className="gap-1.5 text-xs"><Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}</Button>
            <Button size="sm" onClick={publishSite} className="gap-1.5 text-xs bg-[#dd0c51] hover:bg-[#c40a47] !text-white [&>svg]:text-white"><Globe className="w-3.5 h-3.5" /> Publish</Button>
          </div>
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
              <PropertiesSidebar section={selectedSection} onChange={updated => updateSection(selectedIdx, updated)} />
            </div>
          )}
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
        <Button onClick={() => setShowCreate(true)} className="bg-[#dd0c51] hover:bg-[#c40a47] !text-white rounded-full gap-2 [&>svg]:text-white" data-testid="create-studio-site"><Plus className="w-4 h-4" /> New Site</Button>
      </div>

      {sites.length === 0 ? (
        <div className="text-center py-20 bg-zinc-50 rounded-2xl border border-zinc-200">
          <Code2 className="w-14 h-14 text-zinc-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-zinc-600 mb-1">No sites yet</h3>
          <p className="text-sm text-zinc-400 mb-6">Create your first website with a template or start from scratch.</p>
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white"><Plus className="w-4 h-4" /> Create Your First Site</Button>
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
                    <div className="p-2"><p className="text-xs font-semibold text-zinc-800">{tmpl.name}</p><p className="text-[10px] text-zinc-400">{tmpl.description}</p></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !createName || !createSlug} className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5">{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Site</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DNS Dialog */}
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
