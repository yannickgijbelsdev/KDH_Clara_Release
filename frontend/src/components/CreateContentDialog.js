import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FileText, Link, BookOpen, Loader2, Folder } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import RichTextEditor from './RichTextEditor';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const contentTypes = [
  { value: 'text', label: 'Text', icon: FileText, description: 'Rich text content' },
  { value: 'link', label: 'Link', icon: Link, description: 'External URL reference' },
  { value: 'reference', label: 'Reference', icon: BookOpen, description: 'Reference material' },
];

const CreateContentDialog = ({ open, onOpenChange, onContentCreated }) => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const dialogRef = useRef(null);
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

  // Watch for TinyMCE dialogs opening and disable focus trap
  useEffect(() => {
    if (!open) return;

    const observer = new MutationObserver((mutations) => {
      const tinyDialog = document.querySelector('.tox-dialog-wrap');
      setTinyMCEDialogOpen(!!tinyDialog);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [open]);

  // When TinyMCE dialog opens, set the main dialog as inert
  useEffect(() => {
    const dialogElement = document.querySelector('[role="dialog"][data-state="open"]');
    if (dialogElement && tinyMCEDialogOpen) {
      // Don't set inert on the TinyMCE dialog
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        category_id: formData.category_id || null,
      };
      
      const response = await axios.post(`${API}/content`, submitData);
      
      onContentCreated(response.data);
      
      // Reset form
      setFormData({
        title: '',
        type: 'text',
        body: '',
        excerpt: '',
        external_url: '',
        category_id: '',
        status: 'draft',
      });
      
    } catch (error) {
      toast.error('Failed to create content');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[800px] max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => {
          // Prevent dialog from closing when clicking TinyMCE elements
          const target = e.target;
          if (target.closest('.tox-tinymce-aux') || target.closest('.tox-menu') || target.closest('.tox-dialog') || target.closest('.tox')) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          // Prevent dialog from closing when clicking TinyMCE elements
          const target = e.target;
          if (target.closest('.tox-tinymce-aux') || target.closest('.tox-menu') || target.closest('.tox-dialog') || target.closest('.tox')) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => {
          // Prevent focus from being stolen back from TinyMCE dialogs
          const target = e.target;
          if (target.closest('.tox-tinymce-aux') || target.closest('.tox-dialog') || target.closest('.tox')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create Content</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Title</Label>
            <Input
              data-testid="content-title-input"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Content title"
              required
              className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger
                  data-testid="content-type-select"
                  className="bg-[#27272a] border-zinc-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  {contentTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <SelectItem
                        key={type.value}
                        value={type.value}
                        className="text-zinc-300 focus:text-white focus:bg-zinc-800"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Category</Label>
              <Select
                value={formData.category_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, category_id: value === "none" ? "" : value })}
              >
                <SelectTrigger
                  data-testid="content-category-select"
                  className="bg-[#27272a] border-zinc-700 text-white"
                >
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="none" className="text-zinc-500 focus:text-white focus:bg-zinc-800">
                    No category
                  </SelectItem>
                  {categories.map((cat) => (
                    <SelectItem
                      key={cat.id}
                      value={cat.id}
                      className="text-zinc-300 focus:text-white focus:bg-zinc-800"
                    >
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

          {formData.type === 'link' && (
            <div className="space-y-2">
              <Label className="text-zinc-300">External URL</Label>
              <Input
                data-testid="content-url-input"
                type="url"
                value={formData.external_url}
                onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                placeholder="https://example.com"
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-zinc-300">Body</Label>
            <RichTextEditor
              id="create-content-body"
              value={formData.body}
              onChange={(content) => setFormData({ ...formData, body: content })}
              placeholder="Write your content here..."
              height={300}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Excerpt (optional)</Label>
            <Textarea
              data-testid="content-excerpt-input"
              value={formData.excerpt}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              placeholder="Brief summary..."
              className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger
                data-testid="content-status-select"
                className="bg-[#27272a] border-zinc-700 text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#18181b] border-zinc-800">
                <SelectItem value="draft" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                  Draft
                </SelectItem>
                <SelectItem value="ready" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                  Ready
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="submit-content-btn"
              disabled={loading}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white btn-primary"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Content'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateContentDialog;
