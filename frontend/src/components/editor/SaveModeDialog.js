import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';

// Asks every time: save as a new file or overwrite the original.
export const SaveModeDialog = ({ open, asset, onPick, onClose }) => {
  const used = asset?.used_in?.length || 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md z-[1400]" data-testid="save-mode-dialog">
        <DialogHeader>
          <DialogTitle>Save changes</DialogTitle>
          <DialogDescription>Keep the original, or replace it with the edited version?</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button className="w-full justify-start bg-[#7380b6] hover:bg-[#5f6ba3]" onClick={() => onPick('new')} data-testid="save-as-new-btn">
            Save as new file
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => onPick('overwrite')} data-testid="save-overwrite-btn">
            Overwrite “{asset?.title}”
          </Button>
          {used > 0 && (
            <p className="text-xs text-amber-700" data-testid="save-overwrite-warning">
              Overwriting also changes the file in {used} article{used === 1 ? '' : 's'} where it is used.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
