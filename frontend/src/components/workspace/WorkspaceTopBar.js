import { useState, useEffect } from 'react';
import { Search, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';

export const WorkspaceTopBar = ({
  title,
  subtitle,
  titleBadge,
  centerContent,
  rightContent,
  onMobileMenuToggle,
  className,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = currentTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = currentTime.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <header
      data-testid="workspace-topbar"
      className={cn(
        'h-[64px] w-full flex items-center justify-between px-6 flex-shrink-0',
        'bg-white/60 backdrop-blur-2xl border-b border-black/[0.06]',
        'z-40',
        className
      )}
    >
      {/* Left: Page title */}
      <div className="flex items-center gap-3 min-w-0">
        {onMobileMenuToggle && (
          <button
            onClick={onMobileMenuToggle}
            data-testid="mobile-menu-btn"
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/5 transition-colors mr-1"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1
              data-testid="topbar-title"
              className="text-sm font-semibold text-zinc-800 truncate tracking-tight"
              style={{ fontFamily: 'Outfit, Chivo, sans-serif' }}
            >
              {title}
            </h1>
            {titleBadge}
          </div>
          {subtitle && (
            <p className="text-[11px] text-zinc-400 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Center: Search / filters (dynamic) */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
        {centerContent || (
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search..."
              data-testid="topbar-search"
              className="w-full h-9 pl-10 pr-4 rounded-full bg-black/[0.04] border border-black/[0.06] text-sm text-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30 transition-all"
            />
          </div>
        )}
      </div>

      {/* Right: Date/time + user controls */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {rightContent}
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-xs font-medium text-zinc-700 tabular-nums">
            {timeStr}
          </span>
          <span className="text-[10px] text-zinc-400">{dateStr}</span>
        </div>
      </div>
    </header>
  );
};

export default WorkspaceTopBar;
