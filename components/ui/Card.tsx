import React from 'react';
import { cn } from './cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation + accent border; use for clickable cards. */
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-border bg-surface shadow-soft',
        interactive &&
          'cursor-pointer transition-all duration-150 hover:border-accent/60 hover:shadow-raised hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';
