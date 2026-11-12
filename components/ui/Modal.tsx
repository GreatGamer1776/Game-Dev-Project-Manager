import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Max-width utility class for the panel. `full` is the settings-style sheet. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Render children edge-to-edge with no header/body chrome (custom layouts). */
  bare?: boolean;
  className?: string;
}

const sizeClass = {
  sm: 'max-w-[26rem]',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-5xl h-[min(85vh,760px)]',
};

/** Obsidian-style modal: flat sheet on a dim backdrop, close button top-right. */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  bare = false,
  className,
}) => {
  // Keep the latest onClose without re-binding listeners every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/60 animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full rounded-2xl border border-border bg-bg shadow-pop animate-scale-in',
          bare ? 'flex overflow-hidden' : 'max-h-[90vh] flex flex-col',
          sizeClass[size],
          className
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="icon-btn absolute right-3 top-3 z-10"
        >
          <X className="h-4 w-4" />
        </button>
        {bare ? (
          children
        ) : (
          <>
            {(title || description) && (
              <div className="shrink-0 px-6 pt-5 pb-2 pr-12">
                {title && <h2 className="font-display text-lg font-medium text-content">{title}</h2>}
                {description && <p className="mt-1 text-[0.8125rem] leading-5 text-muted">{description}</p>}
              </div>
            )}
            <div className={cn('min-h-0 overflow-y-auto px-6 pb-6', title || description ? 'pt-4' : 'pt-6')}>{children}</div>
            {footer && (
              <div className="flex shrink-0 justify-end gap-2 rounded-b-2xl border-t border-border bg-chrome/50 px-6 py-4">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
