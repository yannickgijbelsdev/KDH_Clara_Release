import { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Radio, Settings, Activity, Wand2, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import RDSSettingsPage from './RDSSettingsPage';
import RDSMonitorPage from './RDSMonitorPage';
import RDSBuilderPage from './RDSBuilderPage';
import RDSSchedulerPage from './RDSSchedulerPage';

const API = process.env.REACT_APP_BACKEND_URL;

const TABS = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'monitor', label: 'Monitor', icon: Activity },
  { id: 'builder', label: 'Builder', icon: Wand2 },
  { id: 'scheduler', label: 'Scheduler', icon: Calendar },
];

const TAB_COMPONENTS = {
  settings: RDSSettingsPage,
  monitor: RDSMonitorPage,
  builder: RDSBuilderPage,
  scheduler: RDSSchedulerPage,
};

export default function RDSPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mainSiteSlug } = useParams();
  const { token } = useAuth();
  const initialTab = TABS.find(t => t.id === searchParams.get('tab'))?.id || 'settings';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [hasStations, setHasStations] = useState(null);

  useEffect(() => {
    if (!mainSiteSlug || !token) return;
    (async () => {
      try {
        const siteRes = await fetch(`${API}/api/main-sites/by-slug/${mainSiteSlug}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!siteRes.ok) { setHasStations(false); return; }
        const siteData = await siteRes.json();
        const res = await fetch(`${API}/api/rds-stations/${siteData.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setHasStations((data.stations || []).length > 0);
        } else {
          setHasStations(false);
        }
      } catch {
        setHasStations(false);
      }
    })();
  }, [mainSiteSlug, token]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams(tabId === 'settings' ? {} : { tab: tabId }, { replace: true });
  };

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  // No stations — show empty state
  if (hasStations === false) {
    return (
      <div data-testid="rds-unified-page">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <Radio className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">RDS</h1>
            <p className="text-sm text-zinc-500">Radio Data System management</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="w-12 h-12 text-zinc-300 mb-4" />
          <p className="text-lg text-zinc-400 mb-2">No stations configured yet.</p>
          <p className="text-sm text-zinc-400">Go to site settings to add RDS stations.</p>
        </div>
      </div>
    );
  }

  // Loading
  if (hasStations === null) {
    return (
      <div data-testid="rds-unified-page" className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="rds-unified-page">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <Radio className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">RDS</h1>
            <p className="text-sm text-zinc-500">Radio Data System management</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-6 border-b border-zinc-200" data-testid="rds-tab-bar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
              data-testid={`rds-tab-${tab.id}`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <ActiveComponent />
    </div>
  );
}
