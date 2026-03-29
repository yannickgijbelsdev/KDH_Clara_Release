import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MainSiteProvider, useMainSite } from './context/MainSiteContext';
import { Toaster } from './components/ui/sonner';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import { TopLoaderProvider } from './components/TopLoader';
import SessionWarningModal from './components/SessionWarningModal';
import TwoFactorEnforcement from './components/TwoFactorEnforcement';
import LoginWizard from './components/LoginWizard';
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
import { fetchSubdomainConfig, buildLoginRedirectUrl } from './services/subdomainAuth';
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
import BackupManagementPage from './pages/Network/BackupManagementPage';
import FirewallPage from './pages/Network/FirewallPage';
import TicketsPage from './pages/Tickets/TicketsPage';
import CallPage from './pages/CallPage';
import PublicCallPage from './pages/PublicCallPage';
import { JourneyProvider } from './context/JourneyContext';
import { CallProvider } from './context/CallContext';
import ZeroTierPage from './pages/ZeroTierPage';
import RadioplayerPage from './pages/RadioplayerPage';
import XmlDashboard from './pages/Server/XmlDashboard';
import XmlUpload from './pages/Server/XmlUpload';
import XmlDetails from './pages/Server/XmlDetails';
import ApiKeysPage from './pages/Server/ApiKeysPage';
import VmixDirector from './pages/Server/VmixDirector';
import WpSecurityPage from './pages/Security/WpSecurityPage';
import TaskBoardsPage from './pages/Tasks/TaskBoardsPage';
import CanvaDirectorPage from './pages/CanvaDirectorPage';
import CallWidget from './components/Call/CallWidget';
import ForcePasswordChangeModal from './components/Auth/ForcePasswordChangeModal';
import { useSubdomainRouter } from './hooks/useSubdomainRouter';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const [subdomainConfig, setSubdomainConfig] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  
  useEffect(() => {
    fetchSubdomainConfig().then(config => {
      setSubdomainConfig(config);
      setConfigLoaded(true);
    });
  }, []);
  
  if (loading || !configLoaded) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    // If subdomain routing is enabled and we're on a configured subdomain,
    // redirect to the login subdomain instead of local /login
    if (subdomainConfig?.enabled && subdomainConfig?.login_url) {
      const hostname = window.location.hostname;
      const baseDomain = subdomainConfig.base_domain;
      // Only redirect if we're actually on one of the configured subdomains
      if (baseDomain && hostname.endsWith(`.${baseDomain}`)) {
        const loginRedirectUrl = buildLoginRedirectUrl(subdomainConfig);
        window.location.href = loginRedirectUrl;
        return (
          <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
            <div className="animate-pulse text-zinc-400">Redirecting to login...</div>
          </div>
        );
      }
    }
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
  const { resolved } = useSubdomainRouter();
  
  if (loading || !resolved) {
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

      {/* Statistics - Network Admin only */}
      <Route
        path="/statistics/:mainSiteId"
        element={
          <ProtectedRoute>
            <StatisticsPage />
          </ProtectedRoute>
        }
      />

      {/* Backups - Network Admin only */}
      <Route
        path="/backups"
        element={
          <ProtectedRoute>
            <BackupManagementPage />
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
        <Route path="dashboard" element={<MainSiteIndex />} />
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
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/:ticketId" element={<TicketsPage />} />
        <Route path="firewall" element={<FirewallPage />} />
        <Route path="call-studio" element={<CallPage />} />
        <Route path="zerotier" element={<ZeroTierPage />} />
        <Route path="radioplayer" element={<RadioplayerPage />} />
        <Route path="xml-imports" element={<XmlDashboard />} />
        <Route path="xml-upload" element={<XmlUpload />} />
        <Route path="xml-imports/:importId" element={<XmlDetails />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="canva" element={<CanvaDirectorPage />} />
        <Route path="vmix-director" element={<VmixDirector />} />
        <Route path="wp-security" element={<WpSecurityPage />} />
        <Route path="wp-waf" element={<WpSecurityPage />} />
        <Route path="wp-blocklist" element={<WpSecurityPage />} />
        <Route path="wp-login-protect" element={<WpSecurityPage />} />
        <Route path="task-boards" element={<TaskBoardsPage />} />
        <Route path="task-boards/:boardId" element={<TaskBoardsPage />} />
      </Route>

      {/* Public Call Page - /call/:callToken (no auth required) */}
      <Route path="/call/:callToken" element={<PublicCallPage />} />

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
      // Technical sites always go to zerotier
      if (mainSite.site_type === 'technical') {
        navigate(`/${mainSiteSlug}/zerotier`, { replace: true });
        return;
      }

      // Task scheduler sites always go to task-boards
      if (mainSite.site_type === 'task_scheduler') {
        navigate(`/${mainSiteSlug}/task-boards`, { replace: true });
        return;
      }

      // Server sites always go to xml-imports
      if (mainSite.site_type === 'server') {
        navigate(`/${mainSiteSlug}/xml-imports`, { replace: true });
        return;
      }
      
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

import { BrandingProvider } from './context/BrandingContext';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TopLoaderProvider>
        <BrandingProvider>
          <JourneyProvider>
            <CallProvider>
              <TwoFactorEnforcementWrapper />
              <ForcePasswordChangeModal />
              <LoginWizardWrapper />
              <AppRoutes />
              <CallWidget />
              <SessionWarningModal />
              <PwaInstallPrompt />
              <Toaster position="bottom-right" richColors />
            </CallProvider>
          </JourneyProvider>
        </BrandingProvider>
        </TopLoaderProvider>
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

const LoginWizardWrapper = () => {
  const [showWizard, setShowWizard] = useState(false);
  const [siteName, setSiteName] = useState('');
  const { user, token } = useAuth();

  useEffect(() => {
    // Only show if the flag is set AND we haven't shown it already this session
    const flag = sessionStorage.getItem('show_login_wizard');
    const alreadyShown = sessionStorage.getItem('login_wizard_shown');
    if (flag === 'true' && alreadyShown !== 'true') {
      sessionStorage.removeItem('show_login_wizard');
      sessionStorage.setItem('login_wizard_shown', 'true');
      setShowWizard(true);
    } else if (flag === 'true') {
      sessionStorage.removeItem('show_login_wizard');
    }
  }, []);

  // Listen for login wizard trigger
  useEffect(() => {
    const handler = () => {
      const alreadyShown = sessionStorage.getItem('login_wizard_shown');
      if (alreadyShown !== 'true') {
        sessionStorage.setItem('login_wizard_shown', 'true');
        setShowWizard(true);
      }
    };
    window.addEventListener('show-login-wizard', handler);
    return () => window.removeEventListener('show-login-wizard', handler);
  }, []);

  // Fetch user's main sites to determine button label
  useEffect(() => {
    if (!showWizard || !token) return;
    const API = process.env.REACT_APP_BACKEND_URL;
    fetch(`${API}/api/main-sites`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(sites => {
        if (sites.length === 1) setSiteName(sites[0].name);
        else setSiteName('');
      })
      .catch(() => setSiteName(''));
  }, [showWizard, token]);

  return (
    <LoginWizard
      open={showWizard}
      onClose={() => setShowWizard(false)}
      siteName={siteName}
    />
  );
};

export default App;
