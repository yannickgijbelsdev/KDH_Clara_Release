import { cn } from '../../lib/utils';

export const WorkspaceCanvas = ({ children, className, backgroundImage }) => {
  const bgUrl = backgroundImage === 'none' ? null : (backgroundImage || null);

  return (
    <div
      data-testid="workspace-canvas"
      className={cn('relative w-full h-full overflow-hidden bg-[#F0F0F2]', className)}
    >
      {/* Layer 1: Subtle pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, #999 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Layer 2: Background image (clean transparent room) */}
      {bgUrl && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          <img
            src={bgUrl}
            alt=""
            className="max-w-[65%] max-h-[75%] object-contain opacity-[0.18] select-none"
            draggable={false}
          />
        </div>
      )}

      {/* Layer 4: Interactive content (panels) */}
      <div className="absolute inset-0 z-10">{children}</div>
    </div>
  );
};

export default WorkspaceCanvas;
