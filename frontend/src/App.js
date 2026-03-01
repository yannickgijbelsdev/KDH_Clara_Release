import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MainSiteProvider, useMainSite } from './context/MainSiteContext';
import { Toaster } from './components/ui/sonner';
import SessionWarningModal from './components/SessionWarningModal';
import TwoFactorEnforcement from './components/TwoFactorEnforcement';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import MainSiteDashboardLayout from './components/MainSiteDashboardLayout';
import NetworkDashboard from './pages/Network/NetworkDashboard';
import MainSiteSelector from './pages/Network/MainSiteSelector';
import ApiExplorerPage from './pages/Network/ApiExplorerPage';
import ShowsPage from './pages/ShowsPage';
import ShowDetailPage from './pages/ShowDetailPage';
import CalendarPage from './pages/CalendarPage';
import TeamSettingsPage from './pages/TeamSettingsPage';
import ContentLibraryPage from './pages/ContentLibraryPage';
import ContentDetailPage from './pages/ContentDetailPage';
import ContentCalendarPage from './pages/ContentCalendarPage';
import WordPressSettingsPage from './pages/WordPressSettingsPage';
import ChatPage from './pages/ChatPage';
import MediaLibraryPage from './pages/MediaLibraryPage';
import ShowManagementPage from './pages/ShowManagementPage';
import LogsPage from './pages/LogsPage';
import AdminApprovalPage from './pages/AdminApprovalPage';
import TrashPage from './pages/TrashPage';
import PersonalSettingsPage from './pages/PersonalSettingsPage';
import RDSSettingsPage from './pages/RDSSettingsPage';
import RDSBuilderPage from './pages/RDSBuilderPage';
import RDSSchedulerPage from './pages/RDSSchedulerPage';
import RDSMonitorPage from './pages/RDSMonitorPage';
import StreamMonitorPage from './pages/StreamMonitorPage';
import AudioTriggersPage from './pages/AudioTriggersPage';
import SitesListPage from './pages/Sites/SitesListPage';
import SiteDashboard from './pages/Sites/SiteDashboard';
import PublicSitePage from './pages/Sites/PublicSitePage';
import StatisticsPage from './pages/Network/StatisticsPage';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }
  
  return (
    <Routes>
      <Route 
        path="/login" 
        element={user ? <Navigate to="/" replace /> : <LoginPage />} 
      />
      
      {/* Root route - shows site selector or network admin */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            {user?.is_network_admin ? <NetworkDashboard /> : <MainSiteSelector />}
          </ProtectedRoute>
        } 
      />
      
      {/* Network Admin Dashboard */}
      <Route 
        path="/network" 
        element={
          <ProtectedRoute>
            <NetworkDashboard />
          </ProtectedRoute>
        } 
      />
      
      {/* Clara Global / Network Admin */}
      <Route 
        path="/clara-global" 
        element={
          <ProtectedRoute>
            <NetworkDashboard />
          </ProtectedRoute>
        } 
      />
      
      {/* API Explorer - Network Admin only */}
      <Route 
        path="/explorer" 
        element={
          <ProtectedRoute>
            <ApiExplorerPage />
          </ProtectedRoute>
        } 
      />
      
      {/* RDS Monitor - Standalone public-ish page */}
      <Route 
        path="/rds-monitor" 
        element={<RDSMonitorPage />} 
      />
      
      {/* Legacy routes (for backward compatibility) */}
      <Route
        path="/legacy"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/legacy/shows" replace />} />
        <Route path="shows" element={<ShowsPage />} />
        <Route path="shows/:showId" element={<ShowDetailPage />} />
        <Route path="show-management" element={<ShowManagementPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="content" element={<ContentLibraryPage />} />
        <Route path="content/calendar" element={<ContentCalendarPage />} />
        <Route path="content/:contentId" element={<ContentDetailPage />} />
        <Route path="approvals" element={<AdminApprovalPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="settings" element={<PersonalSettingsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="media" element={<MediaLibraryPage />} />
        <Route path="team" element={<TeamSettingsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="wordpress" element={<WordPressSettingsPage />} />
        <Route path="rds" element={<RDSSettingsPage />} />
        <Route path="rds-builder" element={<RDSBuilderPage />} />
        <Route path="rds-scheduler" element={<RDSSchedulerPage />} />
        <Route path="rds-monitor" element={<RDSMonitorPage />} />
        <Route path="audio-triggers" element={<AudioTriggersPage />} />
        <Route path="streams" element={<StreamMonitorPage />} />
        <Route path="sites" element={<SitesListPage />} />
        <Route path="sites/:siteId" element={<SiteDashboard />} />
      </Route>
      
      {/* Main Site Routes - /:mainSiteSlug/... */}
      <Route
        path="/:mainSiteSlug"
        element={
          <ProtectedRoute>
            <MainSiteProvider>
              <MainSiteDashboardLayout />
            </MainSiteProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<MainSiteIndex />} />
        <Route path="shows" element={<ShowsPage />} />
        <Route path="shows/:showId" element={<ShowDetailPage />} />
        <Route path="show-management" element={<ShowManagementPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="content" element={<ContentLibraryPage />} />
        <Route path="content/calendar" element={<ContentCalendarPage />} />
        <Route path="content/:contentId" element={<ContentDetailPage />} />
        <Route path="approvals" element={<AdminApprovalPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="settings" element={<PersonalSettingsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="media" element={<MediaLibraryPage />} />
        <Route path="team" element={<TeamSettingsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="wordpress" element={<WordPressSettingsPage />} />
        <Route path="rds" element={<RDSSettingsPage />} />
        <Route path="rds-builder" element={<RDSBuilderPage />} />
        <Route path="rds-scheduler" element={<RDSSchedulerPage />} />
        <Route path="rds-monitor" element={<RDSMonitorPage />} />
        <Route path="audio-triggers" element={<AudioTriggersPage />} />
        <Route path="streams" element={<StreamMonitorPage />} />
        <Route path="sites" element={<SitesListPage />} />
        <Route path="sites/:siteId" element={<SiteDashboard />} />
      </Route>

      {/* Public mini site pages - /:mainSiteSlug/:siteSlug */}
      <Route path="/:mainSiteSlug/:siteSlug" element={<PublicSitePage />} />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// Component to redirect to first available feature
const MainSiteIndex = () => {
  return <MainSiteIndexInner />;
};

// Separate inner component to use hooks properly
const MainSiteIndexInner = () => {
  const { mainSite, mainSiteSlug, loading } = useMainSite();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!loading && mainSite) {
      const features = mainSite.enabled_features || [];
      // Redirect to first enabled feature
      const featureRoutes = {
        shows: 'shows',
        calendar: 'calendar',
        content_library: 'content',
        media_library: 'media',
        team_chat: 'chat',
        sites: 'sites',
        rds_settings: 'rds'
      };
      
      for (const [feature, route] of Object.entries(featureRoutes)) {
        if (features.includes(feature)) {
          navigate(`/${mainSiteSlug}/${route}`, { replace: true });
          return;
        }
      }
      // Fallback to sites if nothing else
      navigate(`/${mainSiteSlug}/sites`, { replace: true });
    }
  }, [loading, mainSite, mainSiteSlug, navigate]);
  
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="animate-pulse text-zinc-400">Loading...</div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TwoFactorEnforcementWrapper />
        <AppRoutes />
        <SessionWarningModal />
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

const TwoFactorEnforcementWrapper = () => {
  const { user, refreshUser } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when user changes (new login)
  useEffect(() => {
    setDismissed(false);
  }, [user?.id]);

  // Don't show if: no user, already enabled, or dismissed this session
  if (!user || user.totp_enabled || dismissed) return null;

  return (
    <TwoFactorEnforcement
      user={user}
      onComplete={() => {
        refreshUser();
        setDismissed(true);
      }}
      onSkipped={() => {
        refreshUser();
        setDismissed(true);
      }}
    />
  );
};

export default App;
