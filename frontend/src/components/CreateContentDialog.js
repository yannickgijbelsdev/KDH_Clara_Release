import { useState, useRef } from 'react';
import axios from 'axios';
import { FileText, Link, BookOpen, Image, X, Loader2 } from 'lucide-react';
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    title: '',
    type: 'text',
    body: '',
    excerpt: '',
    external_url: '',
    tags: '',
    status: 'draft',
  });

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please use JPEG, PNG, GIF, or WebP.');
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }
    
    setSelectedFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreviewImage(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setPreviewImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First create the content
      const response = await axios.post(`${API}/content`, {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      
      const contentId = response.data.id;
      let finalContent = response.data;
      
      // If there's a featured image, upload it
      if (selectedFile) {
        setUploadingImage(true);
        const imageFormData = new FormData();
        imageFormData.append('file', selectedFile);
        
        try {
          const imageResponse = await axios.post(
            `${API}/content/${contentId}/featured-image`,
            imageFormData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );
          finalContent.featured_image = imageResponse.data.featured_image;
        } catch (imgError) {
          toast.error('Content created but failed to upload featured image');
        }
        setUploadingImage(false);
      }
      
      onContentCreated(finalContent);
      
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
      setSelectedFile(null);
      setPreviewImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
    } catch (error) {
      toast.error('Failed to create content');
    } finally {
      setLoading(false);
      setUploadingImage(false);
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

          {/* Featured Image Upload */}
          <div className="space-y-2">
            <Label className="text-zinc-300">Featured Image (optional)</Label>
            {previewImage ? (
              <div className="flex items-start gap-4 p-3 bg-[#27272a] rounded-lg border border-zinc-700">
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{selectedFile?.name}</p>
                  <p className="text-xs text-zinc-500">
                    {selectedFile && (selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-transparent border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-xs h-7"
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveImage}
                      className="bg-transparent border-zinc-600 text-rose-400 hover:bg-rose-500/10 text-xs h-7"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center cursor-pointer hover:border-rose-500/50 hover:bg-rose-500/5 transition-colors"
              >
                <div className="flex flex-col items-center">
                  <Image className="w-8 h-8 text-zinc-500 mb-2" />
                  <p className="text-sm text-zinc-400">Click to upload featured image</p>
                  <p className="text-xs text-zinc-500 mt-1">JPEG, PNG, GIF, WebP • Max 5MB</p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

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
