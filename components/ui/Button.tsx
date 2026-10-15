import React from 'react';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon component (e.g. a lucide icon). */
  icon?: React.ComponentType<{ className?: string }>;
}

const base =
  'inline-flex items-center justify-center gap-1.5 font-medium rounded-md select-none whitespace-nowrap ' +
  'transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-content shadow-soft hover:bg-accent-hover',
  secondary:
    'bg-surface-raised text-content border border-border shadow-soft hover:bg-surface-hover hover:border-border-strong',
  subtle:
    'bg-surface-hover text-muted hover:text-content',
  ghost:
    'text-muted hover:text-content hover:bg-surface-hover',
  danger:
    'bg-danger/10 text-danger border border-danger/30 hover:bg-danger hover:text-white',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-[var(--ctl-h-sm)] px-2.5 text-xs',
  md: 'h-[var(--ctl-h)] px-3.5 text-[0.8125rem]',
  lg: 'h-10 px-5 text-sm',
  icon: 'h-[var(--ctl-h)] w-[var(--ctl-h)]',
};

const iconSize: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  icon: 'h-4 w-4',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon: Icon, className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {Icon && <Icon className={iconSize[size]} />}
      {children}
    </button>
  )
);

Button.displayName = 'Button';
