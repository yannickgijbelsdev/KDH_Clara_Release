import { useState, useEffect, useRef, useCallback } from 'react';
import { useDevTools } from '../../context/DevToolsContext';
import {
  Activity, X, Trash2, Eye, EyeOff, ChevronDown, ChevronUp,
  Maximize2, Minimize2, Code, Clock, ArrowRight, Camera,
  Layers, FileCode,
} from 'lucide-react';

const METHOD_COLORS = {
  GET: 'text-green-400',
  POST: 'text-blue-400',
  PUT: 'text-amber-400',
  PATCH: 'text-amber-400',
  DELETE: 'text-red-400',
};

const STATUS_COLORS = {
  200: 'text-green-400',
  201: 'text-green-400',
  204: 'text-green-400',
  400: 'text-amber-400',
  401: 'text-red-400',
  403: 'text-red-400',
  404: 'text-amber-400',
  500: 'text-red-400',
  ERR: 'text-red-400',
};

export default function DevToolsPanel() {
  const {
    enabled, apiCalls, inspecting, setInspecting,
    selectedCall, setSelectedCall, panelOpen, setPanelOpen,
    panelTab, setPanelTab, clearCalls,
  } = useDevTools();

  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const listRef = useRef(null);

  if (!enabled) return null;

  const filteredCalls = apiCalls;

  return (
    <>
      {/* Floating Toggle Button */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-4 right-4 z-[9999] w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-2xl hover:bg-orange-500 transition-all"
          data-testid="devtools-toggle"
        >
          <Activity className="w-5 h-5" />
        </button>
      )}

      {/* Main Panel */}
      {panelOpen && (
        <div
          className={`fixed z-[9999] bg-[#0d0d0f] border border-zinc-200 shadow-2xl transition-all ${
            expanded
              ? 'inset-4 rounded-2xl'
              : 'bottom-4 right-4 rounded-2xl w-[480px]'
          }`}
          style={expanded ? {} : { maxHeight: '70vh' }}
          data-testid="devtools-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 bg-white/60 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs font-bold text-orange-400">DevTools</span>
              <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">CLONE</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setInspecting(!inspecting)}
                className={`p-1.5 rounded-lg transition-all ${inspecting ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-white'}`}
                title={inspecting ? 'Stop Inspecting' : 'Start Inspecting'}
                data-testid="devtools-inspect-toggle"
              >
                {inspecting ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={clearCalls}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white"
                title="Clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white"
              >
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-200">
            {[
              { id: 'network', label: 'Network', icon: Activity, count: filteredCalls.length },
              { id: 'inspect', label: 'Inspect', icon: Eye },
              { id: 'snapshots', label: 'Snapshots', icon: Camera },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPanelTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all border-b-2 ${
                  panelTab === tab.id
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-600'
                }`}
                data-testid={`devtools-tab-${tab.id}`}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className="text-[10px] bg-zinc-800 px-1 py-0.5 rounded">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Network Tab */}
          {panelTab === 'network' && (
            <div
              ref={listRef}
              className="overflow-y-auto"
              style={{ maxHeight: expanded ? 'calc(100vh - 160px)' : '50vh' }}
            >
              {filteredCalls.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-xs">
                  No API calls captured yet
                </div>
              ) : (
                filteredCalls.map(call => (
                  <div
                    key={call.id}
                    onClick={() => { setSelectedCall(call); setDetailOpen(true); }}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b border-zinc-900 cursor-pointer hover:bg-zinc-800/50 transition-colors ${
                      selectedCall?.id === call.id ? 'bg-zinc-800/70' : ''
                    }`}
                  >
                    <span className={`font-mono font-bold w-10 ${METHOD_COLORS[call.method] || 'text-zinc-400'}`}>
                      {call.method}
                    </span>
                    <span className={`w-8 text-center font-mono ${
                      call.pending ? 'text-zinc-500 animate-pulse' :
                      STATUS_COLORS[call.status] || 'text-zinc-400'
                    }`}>
                      {call.pending ? '...' : call.status}
                    </span>
                    <span className="flex-1 text-zinc-600 truncate font-mono">{call.url}</span>
                    {call.duration && (
                      <span className="text-zinc-600 whitespace-nowrap">{call.duration}ms</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Inspect Tab */}
          {panelTab === 'inspect' && (
            <div className="p-4" style={{ maxHeight: expanded ? 'calc(100vh - 160px)' : '50vh', overflow: 'auto' }}>
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setInspecting(!inspecting)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    inspecting
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-300 hover:border-zinc-600'
                  }`}
                  data-testid="devtools-inspect-btn"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {inspecting ? 'Inspecting... (click element)' : 'Start Inspect Mode'}
                </button>
              </div>
              <div className="text-xs text-zinc-500 space-y-2">
                <p>When inspect mode is active:</p>
                <ul className="list-disc list-inside space-y-1 text-zinc-600">
                  <li>Hover over elements to see their API endpoints</li>
                  <li>Click to pin the inspection tooltip</li>
                  <li>See component names and file paths</li>
                  <li>View the source code of components</li>
                </ul>
              </div>
            </div>
          )}

          {/* Snapshots Tab — rendered by parent */}
          {panelTab === 'snapshots' && (
            <div className="p-4" style={{ maxHeight: expanded ? 'calc(100vh - 160px)' : '50vh', overflow: 'auto' }}>
              <SnapshotsTabContent />
            </div>
          )}
        </div>
      )}

      {/* API Call Detail Modal */}
      {detailOpen && selectedCall && (
        <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4" onClick={() => setDetailOpen(false)}>
          <div
            className="bg-[#0d0d0f] border border-zinc-200 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
            data-testid="devtools-call-detail"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold text-sm ${METHOD_COLORS[selectedCall.method]}`}>
                  {selectedCall.method}
                </span>
                <span className={`text-sm font-mono ${STATUS_COLORS[selectedCall.status] || 'text-zinc-400'}`}>
                  {selectedCall.status}
                </span>
                {selectedCall.duration && (
                  <span className="text-xs text-zinc-500">{selectedCall.duration}ms</span>
                )}
              </div>
              <button onClick={() => setDetailOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-zinc-200">
              <p className="text-xs text-zinc-500 mb-1">URL</p>
              <p className="text-sm font-mono text-zinc-200 break-all">{selectedCall.url}</p>
            </div>
            {selectedCall.requestBody && (
              <div className="px-4 py-3 border-b border-zinc-200">
                <p className="text-xs text-zinc-500 mb-1">Request Body</p>
                <pre className="text-xs font-mono text-zinc-600 bg-white/80 backdrop-blur rounded-lg p-3 overflow-auto max-h-40">
                  {JSON.stringify(selectedCall.requestBody, null, 2)}
                </pre>
              </div>
            )}
            {selectedCall.responsePreview && (
              <div className="px-4 py-3 overflow-auto" style={{ maxHeight: '40vh' }}>
                <p className="text-xs text-zinc-500 mb-1">Response</p>
                <pre className="text-xs font-mono text-zinc-600 bg-white/80 backdrop-blur rounded-lg p-3 overflow-auto max-h-60">
                  {typeof selectedCall.responsePreview === 'object'
                    ? JSON.stringify(selectedCall.responsePreview, null, 2)
                    : selectedCall.responsePreview}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Snapshots sub-component — communicates with backend
function SnapshotsTabContent() {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);

  const API = process.env.REACT_APP_BACKEND_URL;

  // Get mainSiteId from URL
  const pathParts = window.location.pathname.split('/');
  const mainSiteSlug = pathParts[1];

  const fetchSnapshots = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      // First get main site ID from slug
      const siteRes = await fetch(`${API}/api/main-sites/by-slug/${mainSiteSlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!siteRes.ok) return;
      const siteData = await siteRes.json();
      if (!siteData.cloned_from) return; // Not a clone

      const res = await fetch(`${API}/api/backups/${siteData.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.backups || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [mainSiteSlug]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const createSnapshot = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const siteRes = await fetch(`${API}/api/main-sites/by-slug/${mainSiteSlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const siteData = await siteRes.json();

      const res = await fetch(`${API}/api/backups/${siteData.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        fetchSnapshots();
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  const restoreSnapshot = async (backupId) => {
    setRestoring(backupId);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const siteRes = await fetch(`${API}/api/main-sites/by-slug/${mainSiteSlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const siteData = await siteRes.json();

      await fetch(`${API}/api/backups/${siteData.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_id: backupId }),
      });
      fetchSnapshots();
    } catch { /* ignore */ }
    setRestoring(null);
  };

  return (
    <div>
      <button
        onClick={createSnapshot}
        disabled={creating}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-700 text-white mb-3 disabled:opacity-50"
        data-testid="devtools-create-snapshot"
      >
        <Camera className="w-3.5 h-3.5" />
        {creating ? 'Creating...' : 'Create Snapshot'}
      </button>
      {loading ? (
        <p className="text-xs text-zinc-600">Loading...</p>
      ) : snapshots.length === 0 ? (
        <p className="text-xs text-zinc-600">No snapshots yet. Create one to save the current state.</p>
      ) : (
        <div className="space-y-1.5">
          {snapshots.map(snap => (
            <div key={snap.id} className="flex items-center justify-between bg-white/80 backdrop-blur rounded-lg px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    snap.type === 'pre-restore' ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-700 text-zinc-600'
                  }`}>
                    {snap.type === 'pre-restore' ? 'Pre-Restore' : 'Snapshot'}
                  </span>
                  <span className={`text-[10px] ${snap.status === 'completed' ? 'text-green-400' : 'text-red-400'}`}>
                    {snap.status}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {new Date(snap.created_at).toLocaleString('nl-BE')} — {snap.document_count} docs
                </p>
              </div>
              {snap.status === 'completed' && (
                <button
                  onClick={() => restoreSnapshot(snap.id)}
                  disabled={restoring === snap.id}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 px-2 py-1"
                  data-testid={`restore-snap-${snap.id}`}
                >
                  {restoring === snap.id ? '...' : 'Restore'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
