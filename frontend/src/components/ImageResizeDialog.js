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
import { AlertTriangle, ImageDown, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { resizeImage, formatFileSize, MAX_FILE_SIZE } from '../utils/imageResize';

const ImageResizeDialog = ({ file, open, onClose, onResized }) => {
  const [resizing, setResizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleResize = useCallback(async () => {
    setResizing(true);
    setProgress(0);
    setError(null);

    try {
      const res = await resizeImage(file, setProgress);
      setResult(res);
      // Auto-proceed after brief delay to show completion
      setTimeout(() => {
        onResized(res.file);
      }, 600);
    } catch (err) {
      setError(err.message);
      setResizing(false);
    }
  }, [file, onResized]);

  const handleClose = () => {
    if (resizing && !result) return; // Don't close while resizing
    setResizing(false);
    setProgress(0);
    setResult(null);
    setError(null);
    onClose();
  };

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md" data-testid="image-resize-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Image too large
          </DialogTitle>
          <DialogDescription>
            Maximum upload size is {formatFileSize(MAX_FILE_SIZE)}. Resize the image to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File info */}
          <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">File</span>
              <span className="text-white font-medium truncate ml-4 max-w-[250px]">{file.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Current size</span>
              <span className="text-red-400 font-medium">{formatFileSize(file.size)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Max allowed</span>
              <span className="text-zinc-300">{formatFileSize(MAX_FILE_SIZE)}</span>
            </div>
            {result && (
              <div className="flex justify-between text-sm pt-1 border-t border-zinc-700">
                <span className="text-zinc-400">New size</span>
                <span className="text-emerald-400 font-medium">{formatFileSize(result.newSize)}</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {resizing && (
            <div className="space-y-2" data-testid="resize-progress">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400 flex items-center gap-2">
                  {result ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                  )}
                  {result ? 'Done!' : 'Resizing...'}
                </span>
                <span className="text-white font-mono">{progress}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    result ? 'bg-emerald-500' : 'bg-orange-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {result && (
                <p className="text-xs text-zinc-500">
                  {result.originalDimensions} → {result.newDimensions} | saved {formatFileSize(result.originalSize - result.newSize)}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3" data-testid="resize-error">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!resizing && !result && (
            <>
              <Button variant="ghost" onClick={handleClose} data-testid="resize-cancel-btn">
                Cancel
              </Button>
              <Button
                onClick={handleResize}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                data-testid="resize-confirm-btn"
              >
                <ImageDown className="w-4 h-4" />
                Resize to under 5MB
              </Button>
            </>
          )}
          {error && (
            <Button variant="ghost" onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageResizeDialog;
