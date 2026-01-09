import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import {
  Plus,
  Search,
  Filter,
  FileText,
  Link,
  BookOpen,
  ChevronRight,
  Globe,
  Tag,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import CreateContentDialog from '../components/CreateContentDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = {
  text: FileText,
  link: Link,
  reference: BookOpen,
};

const typeLabels = {
  text: 'Text',
  link: 'Link',
  reference: 'Reference',
};

const statusColors = {
  draft: 'bg-zinc-500/20 text-zinc-400',
  ready: 'bg-violet-500/20 text-violet-400',
  published: 'bg-green-500/20 text-green-400',
};

const statusLabels = {
  draft: 'Draft',
  ready: 'Ready',
  published: 'Published',
};

const syncStatusIcons = {
  not_synced: Clock,
  synced: CheckCircle,
  failed: AlertCircle,
};

const syncStatusColors = {
  not_synced: 'text-zinc-500',
  synced: 'text-green-500',
  failed: 'text-rose-500',
};

const ContentLibraryPage = () => {
  const { isEditor } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const fetchContent = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (typeFilter) params.append('type', typeFilter);
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await axios.get(`${API}/content?${params.toString()}`);
      setContent(response.data);
    } catch (error) {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchContent();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleContentCreated = (newContent) => {
    setContent([newContent, ...content]);
    setIsCreateOpen(false);
    toast.success('Content created');
  };

  return (
    <div data-testid="content-library-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white mb-2">Content Library</h1>
          <p className="text-zinc-400">Manage reusable content for your shows</p>
        </div>
        {isEditor && (
          <Button
            data-testid="create-content-btn"
            onClick={() => setIsCreateOpen(true)}
            className="bg-rose-500 hover:bg-rose-600 text-white gap-2 h-11 px-5 btn-primary"
          >
            <Plus className="w-5 h-5" />
            New Content
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            data-testid="content-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search content..."
            className="pl-10 bg-[#18181b] border-zinc-800 text-white placeholder:text-zinc-500"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid="type-filter-btn"
              className="bg-[#18181b] border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white gap-2"
            >
              <Filter className="w-4 h-4" />
              {typeFilter ? typeLabels[typeFilter] : 'All Types'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#18181b] border-zinc-800">
            <DropdownMenuItem
              onClick={() => setTypeFilter('')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              All Types
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypeFilter('text')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              <FileText className="w-4 h-4 mr-2" /> Text
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypeFilter('link')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              <Link className="w-4 h-4 mr-2" /> Link
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypeFilter('reference')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              <BookOpen className="w-4 h-4 mr-2" /> Reference
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid="status-filter-btn"
              className="bg-[#18181b] border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white gap-2"
            >
              {statusFilter ? statusLabels[statusFilter] : 'All Status'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#18181b] border-zinc-800">
            <DropdownMenuItem
              onClick={() => setStatusFilter('')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              All Status
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('draft')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              Draft
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('ready')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              Ready
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('published')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              Published
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(typeFilter || statusFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypeFilter('');
              setStatusFilter('');
            }}
            className="text-zinc-400 hover:text-white"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Content List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 animate-pulse"
            >
              <div className="h-6 bg-zinc-800 rounded w-1/3 mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : content.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No content yet</h3>
          <p className="text-zinc-400 mb-6">Start building your content library</p>
          {isEditor && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Content
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {content.map((item, index) => {
            const TypeIcon = typeIcons[item.type] || FileText;
            const SyncIcon = syncStatusIcons[item.sync_status] || Clock;

            return (
              <div
                key={item.id}
                data-testid={`content-item-${index}`}
                onClick={() => navigate(`/content/${item.id}`)}
                className="bg-[#18181b] border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-zinc-800 rounded-lg">
                      <TypeIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-white group-hover:text-rose-400 transition-colors">
                          {item.title}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[item.status]}`}>
                          {statusLabels[item.status]}
                        </span>
                      </div>
                      
                      {item.excerpt && (
                        <p className="text-zinc-400 text-sm line-clamp-1 mb-2">
                          {item.excerpt}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <TypeIcon className="w-3 h-3" />
                          {typeLabels[item.type]}
                        </span>
                        
                        {item.external_url && (
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            External link
                          </span>
                        )}
                        
                        {item.tags && item.tags.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {item.tags.slice(0, 2).join(', ')}
                            {item.tags.length > 2 && ` +${item.tags.length - 2}`}
                          </span>
                        )}
                        
                        <span>
                          Updated {format(parseISO(item.updated_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {item.wp_post_id && (
                      <div className={`flex items-center gap-1 ${syncStatusColors[item.sync_status]}`}>
                        <SyncIcon className="w-4 h-4" />
                        <span className="text-xs">WP</span>
                      </div>
                    )}
                    <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-rose-400 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateContentDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onContentCreated={handleContentCreated}
      />
    </div>
  );
};

export default ContentLibraryPage;
