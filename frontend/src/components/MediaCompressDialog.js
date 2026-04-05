import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { AlertTriangle, Loader2, CheckCircle, XCircle, Music, Film } from 'lucide-react';
import {
  compressAudio,
  compressVideo,
  isAudioFile,
  formatFileSize,
  MAX_MEDIA_SIZE,
} from '../utils/mediaCompress';

const MediaCompressDialog = ({ file, open, onClose, onCompressed, onSkip }) => {
  const [compressing, setCompressing] = useState(false);
  const [loadingEngine, setLoadingEngine] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const isAudio = file ? isAudioFile(file) : false;
  const mediaType = isAudio ? 'audio' : 'video';

  const handleCompress = useCallback(async () => {
    if (!file) return;
    setCompressing(true);
    setLoadingEngine(true);
    setProgress(0);
    setError(null);

    try {
      const progressHandler = (pct) => {
        if (pct > 0) setLoadingEngine(false);
        setProgress(pct);
      };

      const res = isAudio
        ? await compressAudio(file, progressHandler)
        : await compressVideo(file, progressHandler);

      setLoadingEngine(false);
      setResult(res);
      setTimeout(() => {
        onCompressed(res.file);
      }, 600);
    } catch (err) {
      setError(err.message || 'Compression failed');
      setCompressing(false);
      setLoadingEngine(false);
    }
  }, [file, isAudio, onCompressed]);

  const handleClose = () => {
    if (compressing && !result) return;
    setCompressing(false);
    setLoadingEngine(false);
    setProgress(0);
    setResult(null);
    setError(null);
    onClose();
  };

  const handleSkip = () => {
    setCompressing(false);
    setLoadingEngine(false);
    setProgress(0);
    setResult(null);
    setError(null);
    onSkip?.(file);
  };

  if (!file) return null;

  const Icon = isAudio ? Music : Film;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-200 max-w-md" data-testid="media-compress-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Large {mediaType} file
          </DialogTitle>
          <DialogDescription>
            This file exceeds {formatFileSize(MAX_MEDIA_SIZE)}. Compressing it will make upload faster and more reliable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File info */}
          <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${isAudio ? 'bg-amber-500/20' : 'bg-purple-500/20'}`}>
                <Icon className={`w-5 h-5 ${isAudio ? 'text-amber-500' : 'text-purple-500'}`} />
              </div>
              <span className="text-white font-medium truncate">{file.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Current size</span>
              <span className="text-red-400 font-medium">{formatFileSize(file.size)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Recommended max</span>
              <span className="text-zinc-600">{formatFileSize(MAX_MEDIA_SIZE)}</span>
            </div>
            {isAudio && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Output format</span>
                <span className="text-zinc-600">MP3 128kbps stereo</span>
              </div>
            )}
            {!isAudio && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Output format</span>
                <span className="text-zinc-600">MP4 720p</span>
              </div>
            )}
            {result && (
              <div className="flex justify-between text-sm pt-1 border-t border-zinc-300">
                <span className="text-zinc-400">New size</span>
                <span className="text-emerald-400 font-medium">{formatFileSize(result.newSize)}</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {compressing && (
            <div className="space-y-2" data-testid="compress-progress">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400 flex items-center gap-2">
                  {result ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                  )}
                  {result
                    ? 'Done!'
                    : loadingEngine
                    ? 'Loading compression engine...'
                    : 'Compressing...'}
                </span>
                <span className="text-white font-mono">{progress}%</span>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    result ? 'bg-emerald-500' : 'bg-orange-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {result && (
                <p className="text-xs text-zinc-500">
                  Saved {formatFileSize(result.originalSize - result.newSize)} ({Math.round((1 - result.newSize / result.originalSize) * 100)}% smaller)
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3" data-testid="compress-error">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!compressing && !result && (
            <>
              <Button
                variant="ghost"
                onClick={handleSkip}
                data-testid="compress-skip-btn"
                className="text-zinc-400"
              >
                Upload without compressing
              </Button>
              <Button
                onClick={handleCompress}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                data-testid="compress-confirm-btn"
              >
                <Icon className="w-4 h-4" />
                Compress & Upload
              </Button>
            </>
          )}
          {error && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="text-zinc-400"
              >
                Upload without compressing
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MediaCompressDialog;
