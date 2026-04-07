import { cn } from '../../lib/utils';

export const WorkspaceCanvas = ({ children, className, backgroundImage }) => {
  const bgUrl = backgroundImage === 'none' ? null : (backgroundImage || null);

  return (
    <div
      data-testid="workspace-canvas"
      className={cn('relative w-full h-full overflow-hidden bg-[#F0F0F2]', className)}
    >
      {/* Layer 1: Background image with center-only mask */}
      {bgUrl && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          <img
            src={bgUrl}
            alt=""
            className="max-w-[70%] max-h-[80%] object-contain opacity-[0.30] select-none"
            draggable={false}
            style={{
              WebkitMaskImage: 'radial-gradient(ellipse 48% 48% at center, black 40%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 48% 48% at center, black 40%, transparent 100%)',
            }}
          />
        </div>
      )}

      {/* Layer 2: Subtle dot pattern (on top of room so texture is uniform everywhere) */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, #999 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Layer 3: Interactive content (panels) */}
      <div className="absolute inset-0 z-10">{children}</div>
    </div>
  );
};

export default WorkspaceCanvas;
