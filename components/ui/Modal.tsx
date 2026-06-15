import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Max-width utility class for the panel. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'w-full rounded-2xl border border-border bg-surface shadow-pop animate-scale-in',
          sizeClass[size],
          className
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div>
              {title && <h2 className="text-base font-semibold text-content">{title}</h2>}
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-faint hover:text-content hover:bg-surface-hover transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="px-5 pb-5 pt-1">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
