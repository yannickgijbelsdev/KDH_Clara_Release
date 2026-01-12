import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Radio, LayoutList, LogOut, User, Calendar, Settings, Crown, Pencil, Eye, FileText, Globe, MessageSquare, File, CalendarClock, Mic, Menu, X } from 'lucide-react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const RoleIcon = roleIcons[user?.role] || User;

  const NavItems = () => (
    <nav className="space-y-1">
      <NavLink
        to="/shows"
        data-testid="nav-shows-link"
        onClick={closeSidebar}
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
        onClick={closeSidebar}
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
      
      {isAdmin && (
        <NavLink
          to="/series"
          data-testid="nav-series-link"
          onClick={closeSidebar}
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
      
      <NavLink
        to="/occurrences"
        data-testid="nav-occurrences-link"
        onClick={closeSidebar}
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
      
      <NavLink
        to="/content"
        data-testid="nav-content-link"
        onClick={closeSidebar}
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
      
      <NavLink
        to="/media"
        data-testid="nav-media-link"
        onClick={closeSidebar}
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
      
      <NavLink
        to="/chat"
        data-testid="nav-chat-link"
        onClick={closeSidebar}
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
      
      {isAdmin && (
        <>
          <NavLink
            to="/team"
            data-testid="nav-team-link"
            onClick={closeSidebar}
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
            onClick={closeSidebar}
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
  );

  const UserSection = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          data-testid="user-menu-btn"
          className="w-full justify-start gap-3 h-auto p-3 hover:bg-white/5"
        >
          <div className="w-9 h-9 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-white truncate max-w-[100px]">
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
  );

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-500/20 rounded-lg">
              <Radio className="w-5 h-5 text-rose-500" />
            </div>
            <span className="text-lg font-bold text-white">ShowPrep</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            data-testid="mobile-menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-zinc-400 hover:text-white"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: slide-in */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 glass-sidebar
          w-64 transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-6 pt-4 lg:pt-6 h-full flex flex-col">
          {/* Logo - Hidden on mobile (shown in header) */}
          <div className="hidden lg:flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-rose-500/20 rounded-xl">
              <Radio className="w-6 h-6 text-rose-500" />
            </div>
            <span className="text-xl font-bold text-white">ShowPrep</span>
          </div>
          
          {/* Mobile: Close button area */}
          <div className="lg:hidden flex justify-end mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={closeSidebar}
              className="text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Team Name */}
          {user?.team_name && (
            <div className="mb-6 px-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Team</p>
              <p className="text-sm text-zinc-300 font-medium truncate">{user.team_name}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto">
            <NavItems />
          </div>

          {/* User section at bottom */}
          <div className="pt-4 border-t border-white/10 mt-4">
            <UserSection />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 xl:p-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
