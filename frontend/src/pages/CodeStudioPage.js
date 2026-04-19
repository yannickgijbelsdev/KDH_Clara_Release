import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  Plus, Globe, Code2, Trash2, Eye, Settings, ChevronRight,
  GripVertical, X, Type, Image, CreditCard, MessageCircle,
  Mail, Layout, Menu as MenuIcon, Minus, MoveVertical, Play,
  Megaphone, Grid3X3, Loader2, ExternalLink, Copy, Check,
  Pencil, ArrowUp, ArrowDown, Save,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const SECTION_ICONS = {
  navbar: MenuIcon, hero: Layout, features: Grid3X3, pricing: CreditCard,
  testimonials: MessageCircle, gallery: Image, contact: Mail,
  cta: Megaphone, footer: Minus, text: Type, image: Image,
  video: Play, divider: Minus, spacer: MoveVertical, html: Code2,
};

// ── Section Renderer (generates HTML preview) ──
function renderSectionPreview(section) {
  const p = section.props || {};
  switch (section.type) {
    case 'navbar':
      return (
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-900 text-white rounded-t-lg">
          <span className="font-bold text-sm">{p.brand || 'Brand'}</span>
          <div className="flex items-center gap-4 text-xs text-zinc-300">
            {(p.links || []).map((l, i) => <span key={i} className="hover:text-white cursor-pointer">{l.label}</span>)}
            {p.cta_text && <span className="bg-white text-zinc-900 px-3 py-1 rounded-full font-medium">{p.cta_text}</span>}
          </div>
        </div>
      );
    case 'hero':
      return (
        <div className={`px-8 py-16 text-center bg-gradient-to-br ${p.bg_gradient || 'from-zinc-900 to-zinc-800'} text-white rounded-lg`}>
          <h1 className="text-3xl font-bold mb-3">{p.headline || 'Headline'}</h1>
          <p className="text-sm text-white/70 mb-6 max-w-lg mx-auto">{p.subheadline || 'Subheadline'}</p>
          {p.cta_text && <span className="inline-block bg-white text-zinc-900 px-5 py-2 rounded-full font-semibold text-sm">{p.cta_text}</span>}
        </div>
      );
    case 'features':
      return (
        <div className="px-8 py-12 bg-white">
          <h2 className="text-xl font-bold text-zinc-900 text-center mb-2">{p.headline || 'Features'}</h2>
          <p className="text-sm text-zinc-500 text-center mb-8">{p.subheadline || ''}</p>
          <div className={`grid grid-cols-${p.columns || 3} gap-4`}>
            {(p.features || []).map((f, i) => (
              <div key={i} className="p-4 rounded-xl bg-zinc-50 text-center">
                <div className="w-8 h-8 rounded-lg bg-zinc-200 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-zinc-800">{f.title}</h3>
                <p className="text-xs text-zinc-500 mt-1">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'pricing':
      return (
        <div className="px-8 py-12 bg-zinc-50">
          <h2 className="text-xl font-bold text-zinc-900 text-center mb-2">{p.headline || 'Pricing'}</h2>
          <p className="text-sm text-zinc-500 text-center mb-8">{p.subheadline || ''}</p>
          <div className="flex gap-4 justify-center">
            {(p.plans || []).map((plan, i) => (
              <div key={i} className={`p-4 rounded-xl border flex-1 max-w-[180px] ${plan.highlighted ? 'border-[#dd0c51] bg-white shadow-lg' : 'border-zinc-200 bg-white'}`}>
                <h3 className="text-sm font-bold text-zinc-800">{plan.name}</h3>
                <p className="text-2xl font-bold text-zinc-900 my-2">${plan.price}<span className="text-xs text-zinc-400">/{plan.period}</span></p>
                <div className="space-y-1 mb-3">
                  {(plan.features || []).map((f, j) => <p key={j} className="text-[10px] text-zinc-500">{f}</p>)}
                </div>
                <span className={`block text-center text-xs font-semibold py-1.5 rounded-full ${plan.highlighted ? 'bg-[#dd0c51] text-white' : 'bg-zinc-100 text-zinc-700'}`}>{plan.cta}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'testimonials':
      return (
        <div className="px-8 py-12 bg-white">
          <h2 className="text-xl font-bold text-zinc-900 text-center mb-8">{p.headline || 'Testimonials'}</h2>
          <div className="flex gap-4 justify-center">
            {(p.items || []).slice(0, 3).map((t, i) => (
              <div key={i} className="p-4 rounded-xl bg-zinc-50 flex-1 max-w-[220px]">
                <p className="text-xs text-zinc-600 italic mb-3">"{t.quote}"</p>
                <p className="text-xs font-semibold text-zinc-800">{t.name}</p>
                <p className="text-[10px] text-zinc-400">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'gallery':
      return (
        <div className="px-8 py-12 bg-white">
          <h2 className="text-xl font-bold text-zinc-900 text-center mb-6">{p.headline || 'Gallery'}</h2>
          <div className="grid grid-cols-3 gap-3">
            {(p.images || []).map((img, i) => (
              <div key={i} className="aspect-video rounded-lg bg-zinc-200 overflow-hidden">
                <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      );
    case 'cta':
      return (
        <div className={`px-8 py-12 text-center bg-gradient-to-r ${p.bg_gradient || 'from-[#dd0c51] to-[#7c1ac8]'} text-white rounded-lg`}>
          <h2 className="text-xl font-bold mb-2">{p.headline || 'CTA'}</h2>
          <p className="text-sm text-white/70 mb-4">{p.subheadline || ''}</p>
          {p.cta_text && <span className="inline-block bg-white text-zinc-900 px-5 py-2 rounded-full font-semibold text-sm">{p.cta_text}</span>}
        </div>
      );
    case 'contact':
      return (
        <div className="px-8 py-12 bg-zinc-50">
          <h2 className="text-xl font-bold text-zinc-900 text-center mb-2">{p.headline || 'Contact'}</h2>
          <p className="text-sm text-zinc-500 text-center mb-6">{p.subheadline || ''}</p>
          <div className="max-w-sm mx-auto space-y-2">
            {(p.fields || []).map((f, i) => (
              <div key={i} className={`bg-white border border-zinc-200 rounded-lg px-3 ${f === 'message' ? 'py-6' : 'py-2'} text-xs text-zinc-400`}>{f}</div>
            ))}
            <div className="bg-zinc-900 text-white text-center text-xs font-semibold py-2 rounded-lg">{p.submit_text || 'Submit'}</div>
          </div>
        </div>
      );
    case 'footer':
      return (
        <div className="px-6 py-6 bg-zinc-900 text-white rounded-b-lg">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">{p.company_name || 'Company'}</span>
            <div className="flex gap-3 text-zinc-400">
              {(p.links || []).map((l, i) => <span key={i} className="hover:text-white cursor-pointer">{l.label}</span>)}
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2">{p.copyright || ''}</p>
        </div>
      );
    default:
      return (
        <div className="px-6 py-8 bg-zinc-100 text-center text-sm text-zinc-400 rounded-lg">
          {section.type} section
        </div>
      );
  }
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
  const [createTemplate, setCreateTemplate] = useState('saas_landing');
  const [creating, setCreating] = useState(false);

  // Editor state
  const [editingSite, setEditingSite] = useState(null);
  const [editingPage, setEditingPage] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDns, setShowDns] = useState(null);
  const [dnsInfo, setDnsInfo] = useState(null);
  const [showComponentLib, setShowComponentLib] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    try {
      const [sitesRes, templatesRes, componentsRes] = await Promise.all([
        fetch(`${API}/api/code-studio/sites`, { headers }),
        fetch(`${API}/api/code-studio/templates`, { headers }),
        fetch(`${API}/api/code-studio/components`, { headers }),
      ]);
      if (sitesRes.ok) setSites(await sitesRes.json());
      if (templatesRes.ok) setTemplates(await templatesRes.json());
      if (componentsRes.ok) setComponents(await componentsRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!createName || !createSlug) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/code-studio/sites`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: createName, slug: createSlug, template_id: createTemplate }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Site created');
        setShowCreate(false);
        setCreateName('');
        setCreateSlug('');
        await fetchData();
        // Open the editor
        openEditor(data.id, data.page_id);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed to create site');
      }
    } catch { toast.error('Error creating site'); }
    setCreating(false);
  };

  const openEditor = async (siteId, pageId) => {
    try {
      const [siteRes, pageRes] = await Promise.all([
        fetch(`${API}/api/code-studio/sites/${siteId}`, { headers }),
        pageId
          ? fetch(`${API}/api/code-studio/sites/${siteId}/pages/${pageId}`, { headers })
          : fetch(`${API}/api/code-studio/sites/${siteId}/pages`, { headers }),
      ]);
      if (siteRes.ok) setEditingSite(await siteRes.json());
      if (pageRes.ok) {
        const data = await pageRes.json();
        if (Array.isArray(data)) {
          if (data.length > 0) {
            setEditingPage(data[0]);
            setSections(data[0].sections || []);
          }
        } else {
          setEditingPage(data);
          setSections(data.sections || []);
        }
      }
    } catch (e) { console.error(e); }
  };

  const savePage = async () => {
    if (!editingSite || !editingPage) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/code-studio/sites/${editingSite.id}/pages/${editingPage.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ sections }),
      });
      if (res.ok) toast.success('Page saved');
      else toast.error('Failed to save');
    } catch { toast.error('Error saving'); }
    setSaving(false);
  };

  const publishSite = async () => {
    if (!editingSite) return;
    try {
      const res = await fetch(`${API}/api/code-studio/sites/${editingSite.id}/publish`, { method: 'POST', headers });
      if (res.ok) {
        toast.success('Site published');
        setEditingSite(prev => ({ ...prev, published: true }));
      }
    } catch { toast.error('Error publishing'); }
  };

  const deleteSite = async (siteId) => {
    try {
      await fetch(`${API}/api/code-studio/sites/${siteId}`, { method: 'DELETE', headers });
      toast.success('Site deleted');
      fetchData();
    } catch { toast.error('Error deleting site'); }
  };

  const moveSection = (index, direction) => {
    const newSections = [...sections];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setSections(newSections);
  };

  const removeSection = (index) => {
    setSections(prev => prev.filter((_, i) => i !== index));
    setSelectedSection(null);
  };

  const addComponent = (componentType) => {
    const newSection = {
      id: `${componentType}_${Date.now()}`,
      type: componentType,
      order: sections.length,
      props: {},
    };
    setSections(prev => [...prev, newSection]);
    setShowComponentLib(false);
  };

  const fetchDns = async (siteId) => {
    try {
      const res = await fetch(`${API}/api/code-studio/sites/${siteId}/dns`, { headers });
      if (res.ok) setDnsInfo(await res.json());
    } catch {}
    setShowDns(siteId);
  };

  // ── Editor View ──
  if (editingSite) {
    return (
      <div className="h-[calc(100vh-120px)] flex flex-col" data-testid="code-studio-editor">
        {/* Editor toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-zinc-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { setEditingSite(null); setEditingPage(null); setSections([]); }} className="text-zinc-400 hover:text-zinc-700">
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-zinc-800">{editingSite.name}</span>
            <span className="text-xs text-zinc-400">/{editingSite.slug}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowComponentLib(true)} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Section
            </Button>
            <Button variant="outline" size="sm" onClick={savePage} disabled={saving} className="gap-1.5 text-xs">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button size="sm" onClick={publishSite} className="gap-1.5 text-xs bg-[#dd0c51] hover:bg-[#c40a47] !text-white [&>svg]:text-white">
              <Globe className="w-3.5 h-3.5" /> Publish
            </Button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-y-auto bg-zinc-100 p-6">
          <div className="max-w-4xl mx-auto space-y-1">
            {sections.map((section, index) => {
              const isSelected = selectedSection === index;
              return (
                <div
                  key={section.id || index}
                  className={`relative group cursor-pointer transition-all ${isSelected ? 'ring-2 ring-[#dd0c51] ring-offset-2' : 'hover:ring-1 hover:ring-zinc-300 hover:ring-offset-1'}`}
                  onClick={() => setSelectedSection(index)}
                  data-testid={`section-${section.type}-${index}`}
                >
                  {/* Section controls */}
                  <div className={`absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button onClick={(e) => { e.stopPropagation(); moveSection(index, -1); }} className="w-7 h-7 rounded bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50" disabled={index === 0}>
                      <ArrowUp className="w-3 h-3 text-zinc-500" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveSection(index, 1); }} className="w-7 h-7 rounded bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50" disabled={index === sections.length - 1}>
                      <ArrowDown className="w-3 h-3 text-zinc-500" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); removeSection(index); }} className="w-7 h-7 rounded bg-white border border-red-200 flex items-center justify-center hover:bg-red-50">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>

                  {/* Section type badge */}
                  <div className={`absolute -right-2 top-2 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider transition-opacity ${isSelected ? 'opacity-100 bg-[#dd0c51] text-white' : 'opacity-0 group-hover:opacity-100 bg-zinc-200 text-zinc-600'}`}>
                    {section.type}
                  </div>

                  {renderSectionPreview(section)}
                </div>
              );
            })}

            {sections.length === 0 && (
              <div className="text-center py-20">
                <Code2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                <p className="text-zinc-400 mb-4">No sections yet. Start building!</p>
                <Button onClick={() => setShowComponentLib(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> Add Section
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Component Library Dialog */}
        <Dialog open={showComponentLib} onOpenChange={setShowComponentLib}>
          <DialogContent className="bg-white max-w-md">
            <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
            <div className="grid grid-cols-3 gap-2 py-2">
              {components.map(comp => {
                const Icon = SECTION_ICONS[comp.type] || Layout;
                return (
                  <button
                    key={comp.type}
                    onClick={() => addComponent(comp.type)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
                    data-testid={`add-component-${comp.type}`}
                  >
                    <Icon className="w-5 h-5 text-zinc-500" />
                    <span className="text-xs font-medium text-zinc-700">{comp.label}</span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Sites List View ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div data-testid="code-studio-page">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#7c1ac8]/10 rounded-xl">
            <Code2 className="w-6 h-6 text-[#7c1ac8]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Code Studio</h1>
            <p className="text-sm text-zinc-500">Build modern websites with drag & drop</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-[#dd0c51] hover:bg-[#c40a47] !text-white rounded-full gap-2 [&>svg]:text-white" data-testid="create-studio-site">
          <Plus className="w-4 h-4" /> New Site
        </Button>
      </div>

      {/* Sites grid */}
      {sites.length === 0 ? (
        <div className="text-center py-20 bg-zinc-50 rounded-2xl border border-zinc-200">
          <Code2 className="w-14 h-14 text-zinc-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-zinc-600 mb-1">No sites yet</h3>
          <p className="text-sm text-zinc-400 mb-6">Create your first website with a template or start from scratch.</p>
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white">
            <Plus className="w-4 h-4" /> Create Your First Site
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map(site => (
            <div key={site.id} className="rounded-xl border border-zinc-200 bg-white overflow-hidden group hover:shadow-lg transition-shadow" data-testid={`studio-site-${site.slug}`}>
              <div className="h-32 bg-gradient-to-br from-[#7c1ac8]/10 to-[#dd0c51]/10 flex items-center justify-center">
                <Code2 className="w-10 h-10 text-[#7c1ac8]/30" />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-zinc-800">{site.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${site.published ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'}`}>
                    {site.published ? 'Live' : 'Draft'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-3">/{site.slug}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openEditor(site.id)}>
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => fetchDns(site.id)}>
                    <Globe className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 hover:bg-red-50" onClick={() => deleteSite(site.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
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
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Site Name</label>
                <Input value={createName} onChange={(e) => { setCreateName(e.target.value); setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} placeholder="My Website" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Slug</label>
                <Input value={createSlug} onChange={(e) => setCreateSlug(e.target.value)} placeholder="my-website" className="mt-1 font-mono" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Choose Template</label>
              <div className="grid grid-cols-3 gap-3">
                {templates.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => setCreateTemplate(tmpl.id)}
                    className={`rounded-xl border-2 overflow-hidden transition-all text-left ${createTemplate === tmpl.id ? 'border-[#7c1ac8] shadow-lg' : 'border-zinc-200 hover:border-zinc-400'}`}
                    data-testid={`template-${tmpl.id}`}
                  >
                    {tmpl.thumbnail ? (
                      <img src={tmpl.thumbnail} alt={tmpl.name} className="w-full h-20 object-cover" />
                    ) : (
                      <div className="w-full h-20 bg-zinc-100 flex items-center justify-center">
                        <Code2 className="w-6 h-6 text-zinc-300" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-semibold text-zinc-800">{tmpl.name}</p>
                      <p className="text-[10px] text-zinc-400">{tmpl.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !createName || !createSlug} className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Site
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DNS Dialog */}
      <Dialog open={!!showDns} onOpenChange={() => { setShowDns(null); setDnsInfo(null); }}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>Domain & DNS Settings</DialogTitle></DialogHeader>
          {dnsInfo && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Clara URL</label>
                <div className="flex items-center gap-2 mt-1 bg-zinc-50 rounded-lg px-3 py-2">
                  <code className="text-xs text-zinc-700 flex-1">{dnsInfo.clara_url}</code>
                  <button onClick={() => { navigator.clipboard.writeText(dnsInfo.clara_url); toast.success('Copied'); }} className="text-zinc-400 hover:text-zinc-600">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">DNS Records</label>
                <p className="text-[11px] text-zinc-400 mt-0.5 mb-2">Add these records at your DNS provider to connect your custom domain.</p>
                <div className="space-y-2">
                  {(dnsInfo.dns_records || []).map((record, i) => (
                    <div key={i} className="bg-zinc-50 rounded-lg p-3 text-xs font-mono">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{record.type}</span>
                        <span className="text-zinc-500">TTL: {record.ttl}</span>
                      </div>
                      <p className="text-zinc-600"><span className="text-zinc-400">Name:</span> {record.name || '(your domain)'}</p>
                      <p className="text-zinc-600"><span className="text-zinc-400">Value:</span> {record.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
