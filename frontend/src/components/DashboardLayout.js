import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Radio, LayoutList, LogOut, User, Calendar, Settings, Crown, Pencil, Eye, FileText, Globe, MessageSquare, File, CalendarClock, Mic } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const roleIcons = {
  admin: Crown,
  editor: Pencil,
  presenter: Mic,
  viewer: Eye,
};

const roleLabels = {
  admin: 'Admin',
  editor: 'Editor',
  presenter: 'Presenter',
  viewer: 'Viewer',
};

const DashboardLayout = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const RoleIcon = roleIcons[user?.role] || User;

  return (
    <div className="min-h-screen bg-[#09090b] flex">
      {/* Sidebar */}
      <aside className="w-64 fixed left-0 top-0 h-full glass-sidebar z-50">
        <div className="p-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-rose-500/20 rounded-xl">
              <Radio className="w-6 h-6 text-rose-500" />
            </div>
            <span className="text-xl font-bold text-white">ShowPrep</span>
          </div>
          
          {/* Team Name */}
          {user?.team_name && (
            <div className="mb-8 px-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Team</p>
              <p className="text-sm text-zinc-300 font-medium truncate">{user.team_name}</p>
            </div>
          )}

          {/* Navigation */}
          <nav className="space-y-2">
            <NavLink
              to="/shows"
              data-testid="nav-shows-link"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <LayoutList className="w-5 h-5" />
              <span className="font-medium">Shows</span>
            </NavLink>
            <NavLink
              to="/calendar"
              data-testid="nav-calendar-link"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Calendar className="w-5 h-5" />
              <span className="font-medium">Calendar</span>
            </NavLink>
            
            {/* Show Series (Admin) */}
            {isAdmin && (
              <NavLink
                to="/series"
                data-testid="nav-series-link"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-rose-500/20 text-rose-500'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                <CalendarClock className="w-5 h-5" />
                <span className="font-medium">Show Series</span>
              </NavLink>
            )}
            
            {/* Occurrences */}
            <NavLink
              to="/occurrences"
              data-testid="nav-occurrences-link"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Radio className="w-5 h-5" />
              <span className="font-medium">Occurrences</span>
            </NavLink>
            
            {/* Content Library */}
            <NavLink
              to="/content"
              data-testid="nav-content-link"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <FileText className="w-5 h-5" />
              <span className="font-medium">Content Library</span>
            </NavLink>
            
            {/* Media Library */}
            <NavLink
              to="/media"
              data-testid="nav-media-link"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <File className="w-5 h-5" />
              <span className="font-medium">Media Library</span>
            </NavLink>
            
            {/* Team Chat */}
            <NavLink
              to="/chat"
              data-testid="nav-chat-link"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <MessageSquare className="w-5 h-5" />
              <span className="font-medium">Team Chat</span>
            </NavLink>
            
            {/* Admin only: Team Settings */}
            {isAdmin && (
              <>
                <NavLink
                  to="/team"
                  data-testid="nav-team-link"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-rose-500/20 text-rose-500'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-medium">Team Settings</span>
                </NavLink>
                <NavLink
                  to="/wordpress"
                  data-testid="nav-wordpress-link"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-rose-500/20 text-rose-500'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <Globe className="w-5 h-5" />
                  <span className="font-medium">WordPress</span>
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* User section at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                data-testid="user-menu-btn"
                className="w-full justify-start gap-3 h-auto p-3 hover:bg-white/5"
              >
                <div className="w-9 h-9 rounded-full bg-rose-500/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.name}
                    </p>
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      <RoleIcon className="w-3 h-3" />
                      {roleLabels[user?.role]}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">
                    {user?.email}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-[#18181b] border-zinc-800">
              <DropdownMenuItem className="text-zinc-400">
                <User className="w-4 h-4 mr-2" />
                {user?.email}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-zinc-400">
                <RoleIcon className="w-4 h-4 mr-2" />
                {roleLabels[user?.role]}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                data-testid="logout-btn"
                onClick={handleLogout}
                className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8 lg:p-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
