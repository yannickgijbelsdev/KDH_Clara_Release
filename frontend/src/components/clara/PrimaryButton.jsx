/**
 * Clara Campaigns primary + secondary buttons.
 *
 * Design-system contract:
 *   • Primary = solid rose-600 pill, periwinkle hover state, white text.
 *   • Secondary = outlined slate pill, used for destructive-adjacent or
 *     tertiary actions.
 *   • Both animate on hover/press via Framer Motion so the whole app
 *     feels tactile; this matches the "scale(1.03) / scale(0.97)" rule
 *     from the design brief.
 *
 * Usage:
 *   <PrimaryButton icon={Plus}>New campaign</PrimaryButton>
 *   <SecondaryButton>Cancel</SecondaryButton>
 */
import React from 'react';
import { motion } from 'framer-motion';

export function PrimaryButton({ children, onClick, icon: Icon, className = '', disabled, ...props }) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 bg-[#7380b6] hover:bg-[#5f6ca3] !text-white [&_svg]:!text-white text-sm font-medium px-4 py-2 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  );
}

export function SecondaryButton({ children, onClick, icon: Icon, className = '', disabled, ...props }) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-full hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  );
}

export default PrimaryButton;
