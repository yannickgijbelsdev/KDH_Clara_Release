import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { Send, Loader2, Globe, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Renders a "Publish to external sites" dropdown for a content item.
 * Only shows integrations of template "news_blog" that are status=connected
 * for the given main_site_id.
 *
 * Props: contentId, mainSiteId, token
 */
export default function PublishToButton({ contentId, mainSiteId, token, size = 'sm' }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : null;
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [publishingId, setPublishingId] = useState(null);

  useEffect(() => {
    if (!headers || !mainSiteId) return;
    axios.get(`${API}/api/clara-custom/integrations/connected/by-site/${mainSiteId}?template=news_blog`, { headers })
      .then((r) => setIntegrations(Array.isArray(r.data) ? r.data : []))
      .catch(() => setIntegrations([]));
  }, [mainSiteId, token]); // eslint-disable-line

  if (integrations.length === 0) return null;

  const publish = async (integ) => {
    setPublishingId(integ.id);
    try {
      const r = await axios.post(
        `${API}/api/clara-custom/integrations/${integ.id}/publish/${contentId}`,
        null,
        { headers },
      );
      if (r.data?.status === 'synced') {
        toast.success(`Published to ${integ.base_url || 'external site'}`);
      } else {
        toast.error(`Push failed: ${r.data?.message || r.data?.http_status || 'unknown error'}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Push failed');
    } finally {
      setPublishingId(null);
    }
  };

  // Single integration: render a direct button
  if (integrations.length === 1) {
    const integ = integrations[0];
    return (
      <Button
        size={size}
        variant="outline"
        onClick={() => publish(integ)}
        disabled={publishingId === integ.id}
        className="gap-2"
        data-testid="publish-to-btn"
      >
        {publishingId === integ.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Publish to site
      </Button>
    );
  }

  // Multiple: dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" className="gap-2" data-testid="publish-to-btn">
          {publishingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Publish to… <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>External sites</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {integrations.map((it) => (
          <DropdownMenuItem key={it.id} onClick={() => publish(it)} disabled={publishingId === it.id} data-testid={`publish-target-${it.id}`}>
            <Globe className="w-3.5 h-3.5 mr-2 text-zinc-500" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium truncate">{it.base_url}</span>
              <span className="text-[10px] text-zinc-400">News / Blog integration</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
