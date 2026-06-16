// Minimal classname joiner — filters falsy values so conditional classes read
// cleanly: cn('base', isActive && 'active', disabled ? 'opacity-50' : null)
export type ClassValue = string | number | false | null | undefined;

export const cn = (...classes: ClassValue[]): string =>
  classes.filter(Boolean).join(' ');
