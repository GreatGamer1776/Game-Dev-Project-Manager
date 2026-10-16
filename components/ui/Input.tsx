import React from 'react';
import { cn } from './cn';

const fieldBase =
  'rounded-md bg-surface-raised text-content placeholder:text-faint ' +
  'border border-border px-2.5 py-[var(--field-py)] text-[0.8125rem] outline-none ' +
  'transition-colors duration-100 hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/25 ' +
  'disabled:opacity-50';

// Full width unless the caller sizes the field itself — `cn` only joins
// classes, so a caller's `w-52` would otherwise lose to a baked-in `w-full`.
const fieldClass = (className?: string, extra?: string) =>
  cn(fieldBase, !/(^|\s)(w-|flex-1)/.test(className || '') && 'w-full', extra, className);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={fieldClass(className)} {...props} />
  )
);
Input.displayName = 'Input';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={fieldClass(className, 'resize-none')} {...props} />
  )
);
Textarea.displayName = 'Textarea';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={fieldClass(className, 'cursor-pointer')} {...props}>
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
