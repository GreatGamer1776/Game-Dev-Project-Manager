import React from 'react';
import { cn } from './cn';

/**
 * Mono technical label — the structural voice of the Drafting Studio look.
 * Use for section headers, counts, and metadata (e.g. "PROJECTS", "04 FILES").
 */
export const Eyebrow: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({
  className,
  children,
  ...props
}) => (
  <span className={cn('eyebrow', className)} {...props}>
    {children}
  </span>
);

/**
 * L-shaped corner registration ticks, like a drafting/cut sheet. Wraps content
 * and overlays four marks just outside its corners. Purely decorative.
 */
export const TickFrame: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { tickClassName?: string }
> = ({ className, tickClassName, children, ...props }) => {
  const tick = cn('pointer-events-none absolute h-2.5 w-2.5 border-faint/70', tickClassName);
  return (
    <div className={cn('relative', className)} {...props}>
      <span aria-hidden className={cn(tick, '-left-px -top-px border-l border-t')} />
      <span aria-hidden className={cn(tick, '-right-px -top-px border-r border-t')} />
      <span aria-hidden className={cn(tick, '-bottom-px -left-px border-b border-l')} />
      <span aria-hidden className={cn(tick, '-bottom-px -right-px border-b border-r')} />
      {children}
    </div>
  );
};
