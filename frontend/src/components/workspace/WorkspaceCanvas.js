import { cn } from '../../lib/utils';

const CANVAS_BG_URL =
  'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/9c133714c33f42124837a555a90289699f0f5190e464c69e21122133740a9121.png';

export const WorkspaceCanvas = ({ children, className, backgroundImage }) => {
  const bgUrl = backgroundImage === 'none' ? null : (backgroundImage || CANVAS_BG_URL);
  const isCustomBg = !!backgroundImage && backgroundImage !== 'none';

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

      {/* Layer 2: Background image */}
      {bgUrl && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            className={cn(
              'bg-contain bg-center bg-no-repeat',
              isCustomBg
                ? 'w-full h-full opacity-[0.12] bg-cover'
                : 'w-[65%] max-w-[900px] h-[80%] opacity-[0.35]'
            )}
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
        </div>
      )}

      {/* Layer 3: Soft radial gradient for depth */}
      {bgUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isCustomBg
              ? 'radial-gradient(ellipse at center, transparent 10%, #F0F0F2 80%)'
              : 'radial-gradient(ellipse at center, transparent 30%, #F0F0F2 75%)',
          }}
        />
      )}

      {/* Layer 4: Interactive content (panels) */}
      <div className="absolute inset-0 z-10">{children}</div>
    </div>
  );
};

export default WorkspaceCanvas;
