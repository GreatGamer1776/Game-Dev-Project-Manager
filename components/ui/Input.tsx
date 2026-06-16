import React from 'react';
import { cn } from './cn';

const fieldBase =
  'w-full rounded-lg bg-surface-raised text-content placeholder:text-faint ' +
  'border border-border-strong px-3 py-[var(--field-py)] text-sm outline-none ' +
  'transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent/40 ' +
  'disabled:opacity-50';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, className)} {...props} />
  )
);
Input.displayName = 'Input';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'resize-none', className)} {...props} />
  )
);
Textarea.displayName = 'Textarea';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export interface FieldProps {
  label?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

/** Label + control + optional hint, stacked. */
export const Field: React.FC<FieldProps> = ({ label, hint, htmlFor, children, className }) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    {label && (
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
    )}
    {children}
    {hint && <p className="text-xs text-faint">{hint}</p>}
  </div>
);
