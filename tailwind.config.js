
/** @type {import('tailwindcss').Config} */

// Semantic tokens are driven by CSS variables (see index.css) so a single set of
// class names renders correctly across every theme axis: light/dark, accent
// scheme, surface tint, corner style, density, and typeface. Color variables
// hold space-separated RGB channels so Tailwind's `/<alpha>` modifiers work.
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./stores/**/*.{ts,tsx}",
    "./types.ts",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Typeface axis swaps --font-display; body + mono stay constant.
        display: ['var(--font-display)'],
        sans: ['var(--font-body)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        // App surfaces
        bg: withOpacity('--color-bg'),
        surface: withOpacity('--color-surface'),
        'surface-raised': withOpacity('--color-surface-raised'),
        'surface-hover': withOpacity('--color-surface-hover'),
        overlay: withOpacity('--color-overlay'),
        // Borders
        border: withOpacity('--color-border'),
        'border-strong': withOpacity('--color-border-strong'),
        // Text / content
        content: withOpacity('--color-content'),
        muted: withOpacity('--color-muted'),
        faint: withOpacity('--color-faint'),
        // Brand accent
        accent: withOpacity('--color-accent'),
        'accent-hover': withOpacity('--color-accent-hover'),
        'accent-muted': withOpacity('--color-accent-muted'),
        'accent-content': withOpacity('--color-accent-content'),
        // Status
        success: withOpacity('--color-success'),
        warning: withOpacity('--color-warning'),
        danger: withOpacity('--color-danger'),
        info: withOpacity('--color-info'),
      },
      // Corner-style axis: radii resolve through CSS vars so one toggle reshapes
      // the whole app. `full` stays fixed for pills/avatars.
      borderRadius: {
        none: '0px',
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
        '3xl': 'var(--r-3xl)',
        full: '9999px',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px 0 rgb(0 0 0 / 0.08)',
        raised: '0 4px 12px -2px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.08)',
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.30), 0 6px 12px -6px rgb(0 0 0 / 0.20)',
      },
      backgroundImage: {
        // Subtle same-hue vertical sheen for primary buttons (depth, not a rainbow).
        'accent-soft': 'linear-gradient(180deg, rgb(var(--color-accent)) 0%, rgb(var(--color-accent-hover)) 100%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
