/* eslint-disable */
/**
 * Radioplayer brand icon — circle with play triangle, matching lucide-react style.
 * 24x24, stroke-based, inherits currentColor for white sidebar use.
 */
const RadioplayerIcon = ({ className = '', size = 24, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Outer circle */}
    <circle cx="12" cy="12" r="10" />
    {/* Play triangle */}
    <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
    {/* Signal waves (right side) */}
    <path d="M18.5 8.5a6 6 0 0 1 0 7" strokeWidth="1.5" />
    <path d="M20.5 6.5a9 9 0 0 1 0 11" strokeWidth="1.5" />
  </svg>
);

export default RadioplayerIcon;
