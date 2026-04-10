import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Radio, Settings, Activity, Wand2, Calendar } from 'lucide-react';
import RDSSettingsPage from './RDSSettingsPage';
import RDSMonitorPage from './RDSMonitorPage';
import RDSBuilderPage from './RDSBuilderPage';
import RDSSchedulerPage from './RDSSchedulerPage';

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
  const initialTab = TABS.find(t => t.id === searchParams.get('tab'))?.id || 'settings';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams(tabId === 'settings' ? {} : { tab: tabId }, { replace: true });
  };

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div data-testid="rds-unified-page">
      {/* Header */}
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

      {/* Tab bar */}
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

      {/* Active tab content */}
      <ActiveComponent />
    </div>
  );
}
