import { Loader2 } from 'lucide-react';
import { phaseLabel } from '../utils/videoUpload';

export const VideoUploadProgress = ({ progress, testId = 'video-upload-progress' }) => {
  if (!progress) return null;
  return (
    <div className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2" data-testid={testId}>
      <div className="flex items-center justify-between text-xs text-zinc-600 mb-1.5">
        <span className="inline-flex items-center gap-1.5" data-testid={`${testId}-phase`}>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7380b6]" />
          {phaseLabel(progress)}
          {progress.phase === 'compressing' && <span className="text-zinc-400">(max 1080p)</span>}
        </span>
        <span className="font-medium tabular-nums" data-testid={`${testId}-percent`}>{progress.percent}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${progress.phase === 'compressing' ? 'bg-amber-500' : 'bg-[#7380b6]'}`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
};
