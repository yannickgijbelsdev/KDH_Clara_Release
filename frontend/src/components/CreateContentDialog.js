import { useState } from 'react';
import axios from 'axios';
import { FileText, Link, BookOpen, Loader2 } from 'lucide-react';
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
  
  const [formData, setFormData] = useState({
    title: '',
    type: 'text',
    body: '',
    excerpt: '',
    external_url: '',
    tags: '',
    status: 'draft',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/content`, {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      
      onContentCreated(response.data);
      
      // Reset form
      setFormData({
        title: '',
        type: 'text',
        body: '',
        excerpt: '',
        external_url: '',
        tags: '',
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
      <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
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
                        <span className="text-zinc-500 text-xs">- {type.description}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
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
            <Label className="text-zinc-300">Tags (comma-separated)</Label>
            <Input
              data-testid="content-tags-input"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="news, music, interview"
              className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
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
              disabled={loading || uploadingImage}
              className="flex-1 bg-rose-500 hover:bg-rose-600 text-white btn-primary"
            >
              {loading || uploadingImage ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {uploadingImage ? 'Uploading image...' : 'Creating...'}
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
