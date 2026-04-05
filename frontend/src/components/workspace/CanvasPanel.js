import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const POSITION_CLASSES = {
  topLeft: 'top-4 left-4',
  topRight: 'top-4 right-4',
  bottomLeft: 'bottom-4 left-4',
  bottomRight: 'bottom-4 right-4',
  centerRight: 'top-1/2 right-4 -translate-y-1/2',
  main: 'inset-3',
};

const POSITION_WIDTHS = {
  topLeft: 'w-[320px]',
  topRight: 'w-[320px]',
  bottomLeft: 'w-[360px]',
  bottomRight: 'w-[360px]',
  centerRight: 'w-[340px]',
  main: '',
};

const STAGGER_DELAY = {
  topLeft: 0,
  topRight: 0.06,
  bottomLeft: 0.12,
  bottomRight: 0.18,
  centerRight: 0.24,
  main: 0,
};

export const CanvasPanel = ({
  position = 'main',
  title,
  actions,
  children,
  className,
  width,
  height,
  maxHeight,
  scrollable = true,
  testId,
}) => {
  const posClass = POSITION_CLASSES[position] || POSITION_CLASSES.main;
  const widthClass = width ? '' : (POSITION_WIDTHS[position] || '');
  const delay = STAGGER_DELAY[position] || 0;

  return (
    <motion.div
      data-testid={testId || `panel-${position}`}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'absolute z-10',
        'bg-white/75 backdrop-blur-2xl',
        'border border-black/[0.06]',
        'shadow-[0_8px_40px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]',
        'rounded-[20px] flex flex-col',
        posClass,
        widthClass,
        className
      )}
      style={{
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(maxHeight ? { maxHeight } : {}),
      }}
    >
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
            {title}
          </h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div
        className={cn(
          'flex-1 min-h-0',
          title ? 'px-5 pb-4' : 'p-5',
          scrollable && 'overflow-y-auto overflow-x-hidden panel-scroll'
        )}
      >
        {children}
      </div>
    </motion.div>
  );
};

export default CanvasPanel;
