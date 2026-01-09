import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import ShowsPage from './pages/ShowsPage';
import ShowDetailPage from './pages/ShowDetailPage';
import CalendarPage from './pages/CalendarPage';
import TeamSettingsPage from './pages/TeamSettingsPage';
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
        element={user ? <Navigate to="/shows" replace /> : <LoginPage />} 
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/shows" replace />} />
        <Route path="shows" element={<ShowsPage />} />
        <Route path="shows/:showId" element={<ShowDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="team" element={<TeamSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
