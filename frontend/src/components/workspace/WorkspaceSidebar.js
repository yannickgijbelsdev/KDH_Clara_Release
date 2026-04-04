import { NavLink } from 'react-router-dom';
import { Settings, LogOut } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { getAvatarUrl } from '../../utils/avatar';
import { BrandLogo } from '../BrandLogo';
import { cn } from '../../lib/utils';

export const WorkspaceSidebar = ({
  navItems = [],
  user,
  displayRoleName,
  RoleIcon,
  onLogout,
  onNavigateSettings,
  onItemClick,
  currentPath,
  bottomActions,
  bannerOffset = false,
  isLicenseBlocked = false,
}) => {
  return (
    <aside
      data-testid="workspace-sidebar"
      className={cn(
        'w-[80px] h-full flex-shrink-0 flex flex-col items-center py-5',
        'bg-[#0A0A0A]/85 backdrop-blur-xl border-r border-white/[0.08] z-50',
        bannerOffset && 'pt-12'
      )}
    >
      {/* Logo */}
      <div className="mb-6 w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
        <span className="text-white font-black text-base tracking-tight">C</span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden py-2 scrollbar-hide">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            !isLicenseBlocked &&
            (currentPath === item.to || currentPath.startsWith(item.to + '/'));
          const badgeCount = item.badgeCount || 0;

          if (isLicenseBlocked) {
            return (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <div
                    className="w-11 h-11 flex items-center justify-center rounded-2xl opacity-20 cursor-not-allowed"
                    data-testid={`nav-disabled-${item.id}`}
                  >
                    <Icon className="w-5 h-5 text-zinc-600" />
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="bg-zinc-900 border-zinc-800 text-white text-xs"
                >
                  {item.label} (No license)
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  onClick={() => onItemClick?.()}
                  data-testid={`nav-${item.id}`}
                  className={cn(
                    'w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-200 relative',
                    isActive
                      ? 'bg-orange-500/15 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.15)]'
                      : 'text-zinc-500 hover:text-white hover:bg-white/[0.06]'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full bg-orange-500 text-white ring-2 ring-[#0A0A0A]">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-[3px] h-5 rounded-r-full bg-orange-400" />
                  )}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="bg-zinc-900/95 border-zinc-800 text-white text-xs backdrop-blur-lg"
              >
                {item.label}
                {badgeCount > 0 && ` (${badgeCount})`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto flex flex-col items-center gap-2 pt-3">
        {/* Settings */}
        {onNavigateSettings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onNavigateSettings}
                data-testid="nav-settings"
                className="w-11 h-11 flex items-center justify-center rounded-2xl text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
              >
                <Settings className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-zinc-900/95 border-zinc-800 text-white text-xs backdrop-blur-lg"
            >
              Personal Settings
            </TooltipContent>
          </Tooltip>
        )}

        {/* Additional bottom actions */}
        {bottomActions}

        {/* User Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              data-testid="user-menu-trigger"
              className="w-11 h-11 rounded-2xl overflow-hidden hover:ring-2 hover:ring-orange-500/30 transition-all duration-200 flex-shrink-0"
            >
              {getAvatarUrl(user) ? (
                <img
                  src={getAvatarUrl(user)}
                  alt={user?.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold text-sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            className="w-56 bg-[#141414]/90 backdrop-blur-2xl border-white/10 ml-2"
          >
            <div className="px-3 py-2 flex items-center gap-3">
              {getAvatarUrl(user) ? (
                <img
                  src={getAvatarUrl(user)}
                  alt={user?.name}
                  className="w-10 h-10 rounded-xl object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-semibold">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-white/[0.06]" />
            <DropdownMenuItem className="text-zinc-400 cursor-default">
              {RoleIcon && <RoleIcon className="w-4 h-4 mr-2" />}
              {displayRoleName}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/[0.06]" />
            <DropdownMenuItem
              onClick={onLogout}
              data-testid="logout-btn"
              className="text-orange-500 focus:text-orange-500 focus:bg-orange-500/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
};

export default WorkspaceSidebar;
