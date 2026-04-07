import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText, Mic, Loader2, Folder,
  ChevronLeft, ChevronRight, X, Zap
} from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import RichTextEditor from './RichTextEditor';
import WizardStepIndicator from './workspace/WizardStepIndicator';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const contentTypes = [
  { value: 'text', label: 'Text', icon: FileText, description: 'Rich text article' },
  { value: 'audio', label: 'Audio', icon: Mic, description: 'Audio content / podcast' },
];

const CONTENT_STEPS = ['Type & Title', 'Content', 'Settings'];

const CreateContentDialog = ({ open, onOpenChange, onContentCreated }) => {
  const [loading, setLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [tinyMCEDialogOpen, setTinyMCEDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    type: 'text',
    body: '',
    excerpt: '',
    external_url: '',
    category_id: '',
    status: 'draft',
  });

  // Watch for TinyMCE dialogs opening
  useEffect(() => {
    if (!open) return;
    const observer = new MutationObserver(() => {
      const tinyDialog = document.querySelector('.tox-dialog-wrap');
      setTinyMCEDialogOpen(!!tinyDialog);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    const dialogElement = document.querySelector('[role="dialog"][data-state="open"]');
    if (dialogElement && tinyMCEDialogOpen) {
      if (!dialogElement.closest('.tox-dialog-wrap')) {
        dialogElement.setAttribute('inert', '');
      }
    } else if (dialogElement) {
      dialogElement.removeAttribute('inert');
    }
  }, [tinyMCEDialogOpen]);

  useEffect(() => {
    if (open) {
      fetchCategories();
      setWizardStep(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFormData({ title: '', type: 'text', body: '', excerpt: '', external_url: '', category_id: '', status: 'draft' });
    }
  }, [open]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/content/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const submitData = { ...formData, category_id: formData.category_id || null };
      const response = await axios.post(`${API}/content`, submitData);
      onContentCreated(response.data);
      setFormData({ title: '', type: 'text', body: '', excerpt: '', external_url: '', category_id: '', status: 'draft' });
    } catch (error) {
      toast.error('Failed to create content');
    } finally {
      setLoading(false);
    }
  };

  const canNext = () => {
    if (wizardStep === 0) return formData.title.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (wizardStep === 2) {
      handleSubmit();
    } else {
      setWizardStep(s => s + 1);
    }
  };

  const handleClose = () => {
    setWizardStep(0);
    onOpenChange(false);
  };

  const preventTinyMCEClose = (e) => {
    const target = e.target;
    if (target.closest('.tox-tinymce-aux') || target.closest('.tox-menu') || target.closest('.tox-dialog') || target.closest('.tox')) {
      e.preventDefault();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        hideClose
        className="bg-white border-zinc-200 max-w-3xl max-h-[92vh] overflow-hidden p-0 rounded-[24px] flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.1)]"
        data-testid="create-content-wizard"
        onInteractOutside={preventTinyMCEClose}
        onPointerDownOutside={preventTinyMCEClose}
        onFocusOutside={preventTinyMCEClose}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
          <WizardStepIndicator currentStep={wizardStep} steps={CONTENT_STEPS} />
          <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 pt-4 pb-2 overflow-y-auto flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={wizardStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Step 0: Type & Title */}
              {wizardStep === 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">Content type & title</h2>
                  <p className="text-sm text-zinc-500 mb-6">Choose the type of content and give it a name.</p>

                  <div className="space-y-5">
                    {/* Type cards */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Type</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {contentTypes.map(type => {
                          const Icon = type.icon;
                          const isActive = formData.type === type.value;
                          return (
                            <button key={type.value} type="button"
                              onClick={() => setFormData({ ...formData, type: type.value })}
                              data-testid={`content-type-${type.value}`}
                              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                isActive ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'
                              }`}>
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isActive ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                              </div>
                              <span className={`text-sm font-semibold ${isActive ? 'text-zinc-900' : 'text-zinc-600'}`}>{type.label}</span>
                              <p className="text-xs text-zinc-400 mt-0.5">{type.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Title */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Title</Label>
                      <Input
                        data-testid="content-title-input"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Content title"
                        className="h-12 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 rounded-xl"
                        autoFocus
                      />
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Category</Label>
                      <Select value={formData.category_id || "none"}
                        onValueChange={(v) => setFormData({ ...formData, category_id: v === "none" ? "" : v })}>
                        <SelectTrigger data-testid="content-category-select" className="bg-zinc-50 border-zinc-200 text-zinc-900 h-12 rounded-xl">
                          <SelectValue placeholder="Select category..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-zinc-200">
                          <SelectItem value="none" className="text-zinc-500">No category</SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id} className="text-zinc-700 focus:text-zinc-900 focus:bg-zinc-50">
                              <div className="flex items-center gap-2">
                                <Folder className="w-4 h-4 text-orange-400" />
                                <span>{cat.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Content body */}
              {wizardStep === 1 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">Content</h2>
                  <p className="text-sm text-zinc-500 mb-6">
                    {formData.type === 'audio' ? 'Add audio details or a URL to the audio file.' : 'Write the content body.'}
                  </p>

                  <div className="space-y-5">
                    {formData.type === 'audio' ? (
                      <div className="space-y-2">
                        <Label className="text-zinc-700 font-medium">Description (optional)</Label>
                        <RichTextEditor
                          id="create-content-body"
                          value={formData.body}
                          onChange={(content) => setFormData({ ...formData, body: content })}
                          placeholder="Add a description for this audio content..."
                          height={300}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-zinc-700 font-medium">Body</Label>
                        <RichTextEditor
                          id="create-content-body"
                          value={formData.body}
                          onChange={(content) => setFormData({ ...formData, body: content })}
                          placeholder="Write your content here..."
                          height={350}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Settings */}
              {wizardStep === 2 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">Settings</h2>
                  <p className="text-sm text-zinc-500 mb-6">Review and finalize your content settings.</p>

                  <div className="space-y-5">
                    {/* Status */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Status</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: 'draft', label: 'Draft', desc: 'Not yet published' },
                          { value: 'ready', label: 'Ready', desc: 'Ready for publishing' },
                        ].map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => setFormData({ ...formData, status: opt.value })}
                            data-testid={`content-status-${opt.value}`}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                              formData.status === opt.value
                                ? 'border-zinc-900 bg-zinc-50'
                                : 'border-zinc-200 hover:border-zinc-300'
                            }`}>
                            <span className="text-sm font-semibold text-zinc-900">{opt.label}</span>
                            <p className="text-xs text-zinc-400 mt-0.5">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Preview card */}
                    <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                      <h3 className="text-sm font-semibold text-zinc-700 mb-2">Summary</h3>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Title</span>
                          <span className="text-zinc-900 font-medium">{formData.title || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Type</span>
                          <span className="text-zinc-900 font-medium capitalize">{formData.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Category</span>
                          <span className="text-zinc-900 font-medium">
                            {categories.find(c => c.id === formData.category_id)?.name || 'None'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Status</span>
                          <span className="text-zinc-900 font-medium capitalize">{formData.status}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-zinc-100 flex-shrink-0">
          <Button variant="ghost" onClick={() => wizardStep === 0 ? handleClose() : setWizardStep(s => s - 1)}
            className="gap-2 text-zinc-500">
            <ChevronLeft className="w-4 h-4" />
            {wizardStep === 0 ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={handleNext} disabled={!canNext() || loading}
            data-testid="content-wizard-next-btn"
            className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-6 rounded-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
            ) : wizardStep === 2 ? (
              <><Zap className="w-4 h-4" /> Create Content</>
            ) : (
              <>Continue <ChevronRight className="w-4 h-4" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateContentDialog;
