import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, Trash2, FileText, Clock, CheckCircle2, XCircle,
  Code, User, Calendar, Layers, Tag, AlertTriangle, Loader2
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CONFIG = {
  processing: { icon: Clock, label: 'Processing', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20' },
  success: { icon: CheckCircle2, label: 'Success', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20' },
  failed: { icon: XCircle, label: 'Failed', cls: 'text-red-400 bg-red-400/10 border-red-500/20' },
};

export default function XmlDetails() {
  const { importId } = useParams();
  const navigate = useNavigate();
  const [imp, setImp] = useState(null);
  const [xmlContent, setXmlContent] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await axios.get(`${API}/xml-imports/${importId}`);
        setImp(data);
      } catch { toast.error('Import not found'); navigate(-1); }
      setLoading(false);
    };
    fetch();
  }, [importId, navigate]);

  const loadPreview = async () => {
    if (xmlContent) { setShowPreview(true); return; }
    setPreviewLoading(true);
    try {
      const { data } = await axios.get(`${API}/xml-imports/${importId}/preview`);
      setXmlContent(data.xml_content);
      setShowPreview(true);
    } catch { toast.error('Could not load XML preview'); }
    setPreviewLoading(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this import and its XML file?')) return;
    try {
      await axios.delete(`${API}/xml-imports/${importId}`);
      toast.success('Import deleted');
      navigate(-1);
    } catch { toast.error('Failed to delete'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
  if (!imp) return null;

  const st = STATUS_CONFIG[imp.status] || STATUS_CONFIG.processing;
  const StIcon = st.icon;
  const meta = imp.metadata || {};

  const fields = [
    { icon: FileText, label: 'File name', value: imp.file_name },
    { icon: Calendar, label: 'Upload date', value: new Date(imp.upload_date).toLocaleString() },
    { icon: User, label: 'Source', value: imp.source === 'agent' ? 'Sync Agent' : 'Manual Upload' },
    { icon: Tag, label: 'Project name', value: imp.project_name || '-' },
    { icon: User, label: 'Uploaded by', value: imp.uploaded_by || '-' },
    { icon: Layers, label: 'File size', value: imp.file_size ? `${(imp.file_size / 1024).toFixed(1)} KB` : '-' },
  ];

  const metaFields = [
    meta.version && { label: 'Version', value: meta.version },
    meta.date && { label: 'Date', value: meta.date },
    meta.root_tag && { label: 'Root element', value: `<${meta.root_tag}>` },
    meta.element_count && { label: 'Elements', value: meta.element_count.toString() },
  ].filter(Boolean);

  return (
    <div className="space-y-6 max-w-3xl" data-testid="xml-details-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Import Details</h1>
            <p className="text-sm text-zinc-400 mt-0.5">{imp.file_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`${API}/xml-imports/${importId}/download`, '_blank')} className="border-zinc-300 text-zinc-600">
            <Download className="w-4 h-4 mr-1.5" />Download
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="border-red-500/30 text-red-400 hover:bg-red-500/10" data-testid="delete-import-btn">
            <Trash2 className="w-4 h-4 mr-1.5" />Delete
          </Button>
        </div>
      </div>

      {/* Status badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${st.cls}`}>
        <StIcon className="w-4 h-4" />
        <span className="text-sm font-medium">{st.label}</span>
      </div>

      {/* Error message */}
      {imp.error_message && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-start gap-3" data-testid="error-message">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Error</p>
            <p className="text-sm text-red-400/80 mt-1">{imp.error_message}</p>
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="bg-white/60 border border-zinc-200 rounded-xl divide-y divide-zinc-800">
        {fields.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center px-4 py-3 gap-3">
            <Icon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <span className="text-xs text-zinc-500 w-28 flex-shrink-0">{label}</span>
            <span className="text-sm text-zinc-700">{value}</span>
          </div>
        ))}
      </div>

      {/* Metadata */}
      {metaFields.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Parsed Metadata</h3>
          <div className="bg-white/60 border border-zinc-200 rounded-xl divide-y divide-zinc-800">
            {metaFields.map(({ label, value }) => (
              <div key={label} className="flex items-center px-4 py-2.5 gap-3">
                <span className="text-xs text-zinc-500 w-28 flex-shrink-0">{label}</span>
                <span className="text-sm text-zinc-600 font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* XML Preview */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadPreview}
          disabled={previewLoading}
          className="border-zinc-300 text-zinc-600 mb-3"
          data-testid="preview-xml-btn"
        >
          {previewLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Code className="w-4 h-4 mr-1.5" />}
          {showPreview ? 'Hide XML Preview' : 'Show XML Preview'}
        </Button>
        {showPreview && xmlContent && (
          <div className="bg-[#0d1117] border border-zinc-200 rounded-xl overflow-hidden" data-testid="xml-preview">
            <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-200 flex items-center gap-2">
              <Code className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-500">{imp.file_name}</span>
            </div>
            <pre className="p-4 text-xs text-zinc-600 overflow-auto max-h-[500px] font-mono leading-relaxed whitespace-pre-wrap">
              {xmlContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
