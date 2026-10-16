import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../ui';

interface InlineRenameProps {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
}

/** Inline text field used for Obsidian-style in-place renames. */
const InlineRename: React.FC<InlineRenameProps> = ({ initialValue, onCommit, onCancel, className }) => {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);
  // Enter and blur both fire; only the first should count.
  const settledRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const settle = (commit: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    const trimmed = value.trim();
    if (commit && trimmed && trimmed !== initialValue) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={value}
      aria-label="New name"
      onChange={e => setValue(e.target.value)}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          settle(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          settle(false);
        }
      }}
      onBlur={() => settle(true)}
      className={cn(
        'min-w-0 flex-1 rounded-sm border border-accent bg-bg px-1 text-[0.8125rem] text-content outline-none',
        className,
      )}
    />
  );
};

export default InlineRename;
