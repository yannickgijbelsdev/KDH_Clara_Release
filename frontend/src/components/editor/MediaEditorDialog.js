import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

const TimelineEditor = lazy(() => import('./TimelineEditor'));
const ImageEditor = lazy(() => import('./ImageEditor'));

export const EDITABLE_KINDS = ['audio', 'video', 'image'];

// Full-screen editor for a Media Library asset (audio/video timeline or image editor).
export const MediaEditorDialog = ({ asset, onClose, onSaved }) => (
  <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="z-[1300] h-[94vh] max-w-[96vw] w-[96vw] overflow-hidden p-4 sm:p-5" onInteractOutside={(e) => e.preventDefault()} data-testid="media-editor-dialog">
      <DialogTitle className="sr-only">Edit {asset?.title}</DialogTitle>
      {asset && (
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#7380b6]" /></div>}>
          {asset.kind === 'image'
            ? <ImageEditor asset={asset} onClose={onClose} onSaved={() => { onSaved(); onClose(); }} />
            : <TimelineEditor asset={asset} onClose={onClose} onSaved={() => { onSaved(); onClose(); }} />}
        </Suspense>
      )}
    </DialogContent>
  </Dialog>
);
