import { useState, useEffect, useCallback, useRef } from 'react';
import { useDevTools } from '../../context/DevToolsContext';
import { X, FileCode, Code, Layers, ExternalLink } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Map of data-testid patterns to their API endpoints and component files
const ELEMENT_API_MAP = {
  // Shows
  'shows': { endpoints: ['GET /api/shows'], component: 'ShowsPage.js', path: 'pages/Shows/ShowsPage.js' },
  'show-management': { endpoints: ['GET /api/shows', 'POST /api/shows'], component: 'ShowManagementPage.js', path: 'pages/Shows/ShowManagementPage.js' },
  'show-detail': { endpoints: ['GET /api/shows/:id', 'PUT /api/shows/:id'], component: 'ShowDetailPage.js', path: 'pages/Shows/ShowDetailPage.js' },
  // Content
  'content': { endpoints: ['GET /api/content', 'POST /api/content'], component: 'ContentLibraryPage.js', path: 'pages/Content/ContentLibraryPage.js' },
  'content-calendar': { endpoints: ['GET /api/content', 'GET /api/content/publishes'], component: 'ContentCalendarPage.js', path: 'pages/Content/ContentCalendarPage.js' },
  'content-detail': { endpoints: ['GET /api/content/:id', 'PUT /api/content/:id'], component: 'ContentDetailPage.js', path: 'pages/Content/ContentDetailPage.js' },
  // WordPress
  'wordpress': { endpoints: ['GET /api/wordpress/sites', 'POST /api/wordpress/sync'], component: 'WordPressSettingsPage.js', path: 'pages/Admin/WordPressSettingsPage.js' },
  // Media
  'media': { endpoints: ['GET /api/media', 'POST /api/media/upload'], component: 'MediaLibraryPage.js', path: 'pages/Media/MediaLibraryPage.js' },
  // Team
  'team': { endpoints: ['GET /api/users', 'PUT /api/users/:id/role'], component: 'TeamSettingsPage.js', path: 'pages/Admin/TeamSettingsPage.js' },
  // Approvals
  'approval': { endpoints: ['GET /api/content?approval_status=pending', 'PUT /api/content/:id/approve'], component: 'AdminApprovalPage.js', path: 'pages/Admin/AdminApprovalPage.js' },
  // Settings
  'settings': { endpoints: ['GET /api/auth/me', 'PUT /api/auth/me'], component: 'PersonalSettingsPage.js', path: 'pages/Settings/PersonalSettingsPage.js' },
  // Chat
  'chat': { endpoints: ['GET /api/chat/threads', 'POST /api/chat/messages'], component: 'ChatPage.js', path: 'pages/Chat/ChatPage.js' },
  // Sites
  'site': { endpoints: ['GET /api/sites', 'POST /api/sites'], component: 'SitesListPage.js', path: 'pages/Sites/SitesListPage.js' },
  // Statistics
  'stats': { endpoints: ['GET /api/statistics/:id/overview', 'GET /api/statistics/:id/monthly'], component: 'StatisticsPage.js', path: 'pages/Network/StatisticsPage.js' },
  // Backups
  'backup': { endpoints: ['GET /api/backups/:id', 'POST /api/backups/:id'], component: 'BackupManagementPage.js', path: 'pages/Network/BackupManagementPage.js' },
  // Navigation
  'nav-': { endpoints: [], component: 'MainSiteDashboardLayout.js', path: 'components/MainSiteDashboardLayout.js' },
  // Forms / Buttons
  'login': { endpoints: ['POST /api/auth/login'], component: 'LoginPage.js', path: 'pages/LoginPage.js' },
  'export-pdf': { endpoints: ['GET /api/statistics/:id/export-pdf'], component: 'StatisticsPage.js', path: 'pages/Network/StatisticsPage.js' },
  'create-backup': { endpoints: ['POST /api/backups/:id'], component: 'BackupManagementPage.js', path: 'pages/Network/BackupManagementPage.js' },
  'clone-site': { endpoints: ['POST /api/backups/:id/clone'], component: 'BackupManagementPage.js', path: 'pages/Network/BackupManagementPage.js' },
  'restore': { endpoints: ['POST /api/backups/:id/restore'], component: 'BackupManagementPage.js', path: 'pages/Network/BackupManagementPage.js' },
};

function findElementInfo(element) {
  let el = element;
  let depth = 0;
  const MAX_DEPTH = 15;

  while (el && depth < MAX_DEPTH) {
    const testId = el.getAttribute?.('data-testid');
    const componentName = el.getAttribute?.('data-component');

    if (testId || componentName) {
      // Find matching API info
      let apiInfo = null;
      if (testId) {
        for (const [pattern, info] of Object.entries(ELEMENT_API_MAP)) {
          if (testId.includes(pattern)) {
            apiInfo = info;
            break;
          }
        }
      }

      return {
        testId,
        componentName: componentName || apiInfo?.component || null,
        filePath: el.getAttribute?.('data-file') || (apiInfo ? `src/${apiInfo.path}` : null),
        endpoints: apiInfo?.endpoints || [],
        tagName: el.tagName?.toLowerCase(),
        className: el.className?.toString()?.slice(0, 100),
      };
    }

    el = el.parentElement;
    depth++;
  }

  return null;
}

export default function DevToolsInspector() {
  const { enabled, inspecting, setInspecting } = useDevTools();
  const [tooltip, setTooltip] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [codeModal, setCodeModal] = useState(null);
  const [codeContent, setCodeContent] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const highlightRef = useRef(null);

  useEffect(() => {
    if (!enabled || !inspecting) {
      setTooltip(null);
      return;
    }

    const handleMouseMove = (e) => {
      if (pinned) return;
      const info = findElementInfo(e.target);
      if (info) {
        setTooltip({
          ...info,
          x: Math.min(e.clientX + 12, window.innerWidth - 320),
          y: Math.min(e.clientY + 12, window.innerHeight - 200),
        });
        // Highlight element
        let el = e.target;
        while (el && !el.getAttribute?.('data-testid') && !el.getAttribute?.('data-component')) {
          el = el.parentElement;
        }
        if (el && highlightRef.current !== el) {
          if (highlightRef.current) highlightRef.current.style.outline = '';
          el.style.outline = '2px solid rgba(6, 182, 212, 0.6)';
          el.style.outlineOffset = '2px';
          highlightRef.current = el;
        }
      } else {
        setTooltip(null);
        if (highlightRef.current) {
          highlightRef.current.style.outline = '';
          highlightRef.current = null;
        }
      }
    };

    const handleClick = (e) => {
      if (e.target.closest('[data-testid="devtools-panel"]') ||
          e.target.closest('[data-testid="code-viewer-modal"]')) return;

      e.preventDefault();
      e.stopPropagation();

      const info = findElementInfo(e.target);
      if (info) {
        setPinned({
          ...info,
          x: Math.min(e.clientX + 12, window.innerWidth - 320),
          y: Math.min(e.clientY + 12, window.innerHeight - 200),
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      if (highlightRef.current) {
        highlightRef.current.style.outline = '';
        highlightRef.current = null;
      }
    };
  }, [enabled, inspecting, pinned]);

  const viewCode = async (filePath) => {
    if (!filePath) return;
    setCodeModal(filePath);
    setCodeLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(`${API}/api/devtools/source?file=${encodeURIComponent(filePath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCodeContent(data.content);
      } else {
        setCodeContent('// Could not load source file');
      }
    } catch {
      setCodeContent('// Error loading source');
    }
    setCodeLoading(false);
  };

  if (!enabled || !inspecting) return null;

  const activeTooltip = pinned || tooltip;

  return (
    <>
      {/* Inspect cursor overlay */}
      <div
        className="fixed inset-0 z-[9998] pointer-events-none"
        style={{ cursor: 'crosshair' }}
      />

      {/* Tooltip */}
      {activeTooltip && (
        <div
          className="fixed z-[10001] bg-[#0d0d0f] border border-cyan-500/30 rounded-xl shadow-2xl p-3 w-[300px]"
          style={{ left: activeTooltip.x, top: activeTooltip.y }}
          data-testid="inspect-tooltip"
        >
          {pinned && (
            <button
              onClick={(e) => { e.stopPropagation(); setPinned(null); }}
              className="absolute top-2 right-2 text-zinc-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Test ID */}
          {activeTooltip.testId && (
            <div className="mb-2">
              <span className="text-[10px] text-zinc-500">data-testid</span>
              <p className="text-xs font-mono text-cyan-400">{activeTooltip.testId}</p>
            </div>
          )}

          {/* Component */}
          {activeTooltip.componentName && (
            <div className="mb-2">
              <span className="text-[10px] text-zinc-500">Component</span>
              <p className="text-xs font-mono text-amber-400">{activeTooltip.componentName}</p>
            </div>
          )}

          {/* File Path */}
          {activeTooltip.filePath && (
            <div className="mb-2">
              <span className="text-[10px] text-zinc-500">File</span>
              <div className="flex items-center gap-1">
                <p className="text-xs font-mono text-zinc-600 flex-1 truncate">{activeTooltip.filePath}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); viewCode(activeTooltip.filePath); }}
                  className="text-cyan-400 hover:text-cyan-300 p-0.5"
                  title="View Source"
                >
                  <FileCode className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* API Endpoints */}
          {activeTooltip.endpoints?.length > 0 && (
            <div>
              <span className="text-[10px] text-zinc-500">API Endpoints</span>
              <div className="mt-0.5 space-y-0.5">
                {activeTooltip.endpoints.map((ep, i) => {
                  const [method, ...pathParts] = ep.split(' ');
                  const path = pathParts.join(' ');
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold font-mono ${
                        method === 'GET' ? 'text-green-400' :
                        method === 'POST' ? 'text-blue-400' :
                        method === 'PUT' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>{method}</span>
                      <span className="text-[10px] font-mono text-zinc-600">{path}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Code Viewer Modal */}
      {codeModal && (
        <div
          className="fixed inset-0 z-[10002] bg-black/70 flex items-center justify-center p-4"
          onClick={() => { setCodeModal(null); setCodeContent(null); }}
          data-testid="code-viewer-modal"
        >
          <div
            className="bg-[#0d0d0f] border border-zinc-300 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-mono text-zinc-600">{codeModal}</span>
              </div>
              <button
                onClick={() => { setCodeModal(null); setCodeContent(null); }}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(85vh - 56px)' }}>
              {codeLoading ? (
                <div className="text-center py-12 text-zinc-600 text-sm">Loading source...</div>
              ) : (
                <pre className="p-4 text-xs font-mono text-zinc-600 leading-5 whitespace-pre">
                  {codeContent?.split('\n').map((line, i) => (
                    <div key={i} className="flex hover:bg-zinc-800/50">
                      <span className="text-zinc-600 w-12 text-right pr-4 select-none flex-shrink-0">{i + 1}</span>
                      <span className="flex-1">{colorize(line)}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Simple syntax highlighting
function colorize(line) {
  return line
    .replace(/(import|from|export|default|const|let|var|function|return|if|else|async|await|try|catch|new)\b/g, '<kw>$1</kw>')
    .replace(/(\/\/.*$)/g, '<cm>$1</cm>')
    .replace(/('[^']*'|"[^"]*"|`[^`]*`)/g, '<str>$1</str>')
    .split(/(<kw>|<\/kw>|<cm>|<\/cm>|<str>|<\/str>)/)
    .reduce((acc, part, i, arr) => {
      if (part === '<kw>') { acc.push(<span key={i} className="text-purple-400">{arr[i+1]}</span>); return acc; }
      if (part === '<cm>') { acc.push(<span key={i} className="text-zinc-600">{arr[i+1]}</span>); return acc; }
      if (part === '<str>') { acc.push(<span key={i} className="text-green-400">{arr[i+1]}</span>); return acc; }
      if (['</kw>', '</cm>', '</str>'].includes(part)) return acc;
      if (i > 0 && ['<kw>', '<cm>', '<str>'].includes(arr[i-1])) return acc;
      acc.push(<span key={i}>{part}</span>);
      return acc;
    }, []);
}
