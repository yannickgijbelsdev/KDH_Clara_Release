import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle2, XCircle, ArrowLeft, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function XmlUpload() {
  const { mainSite } = useMainSite();
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const uploadFile = useCallback(async (file) => {
    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast.error('Only XML files are allowed');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large (max 50MB)');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await axios.post(`${API}/xml-imports/upload`, form, {
        headers: { 'X-Main-Site-ID': mainSite.id },
      });
      setResult({ success: true, import_id: data.import_id });
      toast.success('XML uploaded successfully');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed';
      setResult({ success: false, error: msg });
      toast.error(msg);
    }
    setUploading(false);
  }, [mainSite]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div className="space-y-6" data-testid="xml-upload-page">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Upload XML</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Upload an XML file for processing</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-orange-500 bg-orange-500/5'
            : 'border-zinc-300 bg-white/60 hover:border-zinc-600 hover:bg-zinc-100/30'
        }`}
        data-testid="xml-dropzone"
      >
        <input
          type="file"
          accept=".xml"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          data-testid="xml-file-input"
        />
        <div className="flex flex-col items-center gap-4">
          {uploading ? (
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
          ) : (
            <div className="p-4 rounded-full bg-zinc-200 border border-zinc-300">
              <Upload className={`w-8 h-8 ${isDragging ? 'text-orange-500' : 'text-zinc-500'}`} />
            </div>
          )}
          <div>
            <p className="text-zinc-700 font-medium">
              {uploading ? 'Uploading...' : isDragging ? 'Drop XML file here' : 'Drag & drop XML file here'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              or click to browse. Only .xml files, max 50MB
            </p>
          </div>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-6 ${
          result.success
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : 'border-red-500/20 bg-red-500/5'
        }`} data-testid="upload-result">
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>
                {result.success ? 'Upload successful' : 'Upload failed'}
              </p>
              {result.success ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => navigate(`xml-imports/${result.import_id}`)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="view-import-btn"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    View Import
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResult(null)}
                    className="border-zinc-300 text-zinc-600"
                  >
                    Upload Another
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-red-400/80 mt-1">{result.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
