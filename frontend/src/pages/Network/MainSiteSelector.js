import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Globe, ChevronRight, LogOut, Server } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function MainSiteSelector() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [mainSites, setMainSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyAccess();
  }, []);

  const fetchMyAccess = async () => {
    try {
      const res = await fetch(`${API}/api/main-sites/my/access`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMainSites(data.main_sites || []);
        
        // If only one main site, redirect directly
        if (data.main_sites?.length === 1) {
          navigate(`/${data.main_sites[0].slug}`, { replace: true });
        }
      }
    } catch (err) {
      console.error('Failed to fetch access:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin':
      case 'network_admin':
        return 'bg-orange-500/20 text-orange-400';
      case 'editor':
        return 'bg-blue-500/20 text-blue-400';
      case 'presenter':
        return 'bg-green-500/20 text-green-400';
      default:
        return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  // Group sites by environment
  const grouped = mainSites.reduce((acc, site) => {
    const envName = site.environment_name || 'Unknown';
    const envColor = site.environment_color || '#6b7280';
    if (!acc[envName]) acc[envName] = { color: envColor, sites: [] };
    acc[envName].sites.push(site);
    return acc;
  }, {});
  const envNames = Object.keys(grouped);
  const hasMultipleEnvs = envNames.length > 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (mainSites.length === 0) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-white">
        <Card className="bg-zinc-900 border-zinc-800 max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="w-16 h-16 text-zinc-600 mb-4" />
            <h3 className="text-xl font-semibold text-zinc-300 mb-2">No Access</h3>
            <p className="text-zinc-500 text-center mb-6">
              You don't have access to any main sites yet. Contact your administrator.
            </p>
            <Button variant="outline" onClick={logout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Welcome, {user?.name}</h1>
              <p className="text-sm text-zinc-400">Select a site to continue</p>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-2 text-zinc-400">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Site Selection - grouped by environment */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {envNames.map(envName => {
            const { color, sites } = grouped[envName];
            return (
              <div key={envName} data-testid={`env-group-${envName.toLowerCase().replace(/\s+/g, '-')}`}>
                {hasMultipleEnvs && (
                  <div className="flex items-center gap-2 mb-3">
                    <Server className="w-4 h-4" style={{ color }} />
                    <span className="text-sm font-medium" style={{ color }}>{envName}</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>
                )}
                <div className="space-y-3">
                  {sites.map(site => (
                    <Card
                      key={site.id}
                      className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all hover:bg-zinc-800/50"
                      onClick={() => navigate(`/${site.slug}`)}
                      data-testid={`site-card-${site.slug}`}
                    >
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          {site.logo_url ? (
                            <img src={site.logo_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center" style={{ borderLeft: `3px solid ${color}` }}>
                              <Globe className="w-6 h-6 text-zinc-500" />
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-lg">{site.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-zinc-500">/{site.slug}</span>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${getRoleBadgeColor(site.role)}`}>
                                {site.role}
                              </span>
                              {hasMultipleEnvs && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded-full border font-medium" style={{ color, borderColor: `${color}33`, backgroundColor: `${color}15` }}>
                                  {envName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-500" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
