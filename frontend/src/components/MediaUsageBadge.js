import { FileText, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const articleHref = (slug, id) => (slug ? `/${slug}/content/${id}` : `/content/${id}`);

// "Used in N articles" pill with a list of links, or "Not used".
export const MediaUsageBadge = ({ asset, mainSiteSlug }) => {
  const used = asset.used_in || [];
  if (!used.length) {
    return (
      <span className="mt-1 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500" data-testid={`media-usage-${asset.id}`}>
        Not used
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#7380b6]/10 px-2 py-0.5 text-[11px] font-medium text-[#5f6ba3] hover:bg-[#7380b6]/20"
          data-testid={`media-usage-${asset.id}`}
        >
          <FileText className="w-3 h-3" /> Used in {used.length} article{used.length === 1 ? '' : 's'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2" onClick={(e) => e.stopPropagation()} data-testid={`media-usage-list-${asset.id}`}>
        <p className="px-2 pb-1.5 text-[11px] uppercase tracking-wide text-zinc-400">Used in</p>
        <ul className="max-h-64 overflow-y-auto">
          {used.map((u) => (
            <li key={u.content_id}>
              <a href={articleHref(mainSiteSlug, u.content_id)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50" data-testid={`media-usage-article-${u.content_id}`}>
                {u.in_trash ? <Trash2 className="w-3.5 h-3.5 shrink-0 text-zinc-400" /> : <FileText className="w-3.5 h-3.5 shrink-0 text-[#7380b6]" />}
                <span className="truncate flex-1">{u.title}</span>
                {u.in_trash && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">in trash</span>}
              </a>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
};
