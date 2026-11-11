import React from 'react';
import { cn } from './cn';

/** DevArchitect mark: three staggered plan bars on the accent tile. */
export const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 28, className }) => (
  <span
    aria-hidden
    className={cn('inline-flex shrink-0 items-center justify-center bg-accent text-accent-content shadow-soft', className)}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
  >
    <svg viewBox="0 0 24 24" width={Math.round(size * 0.64)} height={Math.round(size * 0.64)} fill="currentColor">
      <rect x="3" y="4.5" width="10" height="3.6" rx="1.8" />
      <rect x="7" y="10.2" width="14" height="3.6" rx="1.8" />
      <rect x="5" y="15.9" width="8.5" height="3.6" rx="1.8" opacity="0.65" />
    </svg>
  </span>
);

/** Logo plus the product name. */
export const Wordmark: React.FC<{ size?: number; className?: string }> = ({ size = 26, className }) => (
  <span className={cn('inline-flex items-center gap-2.5', className)}>
    <Logo size={size} />
    <span className="font-display text-[0.9375rem] font-semibold tracking-tight text-content">DevArchitect</span>
  </span>
);
