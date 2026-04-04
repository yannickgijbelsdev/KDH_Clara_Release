import { cn } from '../../lib/utils';

const CANVAS_BG_URL =
  'https://images.pexels.com/photos/4458210/pexels-photo-4458210.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

export const WorkspaceCanvas = ({ children, className }) => {
  return (
    <div
      data-testid="workspace-canvas"
      className={cn('relative w-full h-full overflow-hidden', className)}
    >
      {/* Layer 1: Floor map background */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.06] mix-blend-luminosity pointer-events-none"
        style={{ backgroundImage: `url(${CANVAS_BG_URL})` }}
      />

      {/* Layer 2: Dark overlay for contrast */}
      <div className="absolute inset-0 bg-[#0A0A0A]/80 pointer-events-none" />

      {/* Layer 3: Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Layer 4: Interactive content (panels) */}
      <div className="absolute inset-0 z-10">{children}</div>
    </div>
  );
};

export default WorkspaceCanvas;
