import React from 'react';
import { cn } from './cn';

/** DevArchitect mark: three staggered plan bars, flat, in the text color. */
export const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 20, className }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={cn('shrink-0 text-content', className)}
  >
    <rect x="2" y="4" width="12" height="4" rx="1" />
    <rect x="7" y="10" width="15" height="4" rx="1" />
    <rect x="4" y="16" width="9" height="4" rx="1" opacity="0.5" />
  </svg>
);

/** Logo plus the product name. */
export const Wordmark: React.FC<{ size?: number; className?: string }> = ({ size = 20, className }) => (
  <span className={cn('inline-flex items-center gap-2', className)}>
    <Logo size={size} />
    <span className="font-display text-[0.9375rem] font-semibold text-content">DevArchitect</span>
  </span>
);
