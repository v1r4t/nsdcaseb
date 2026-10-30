/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin';

export default {
  // `relative` anchors these globs to this config file rather than the
  // repo root (the app is built from the root, not from `site/`).
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}', '../design/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        // Ink-on-paper kit (design/tokens.css).
        paper: '#f2eee3',
        ink: '#111110',
        faint: '#67635a',
        seal: '#b33c1b',
        quiet: '#5f5b53',
        'footer-muted': '#98968f',
        'footer-accent': '#dd7048',
        // Migration aliases: keep untouched files legible until the sweep lands.
        muted: '#5f5b53',
        line: 'var(--hairline)',
        signal: '#b33c1b',
      },
      fontFamily: {
        display: ['"Bespoke Serif"', '"Iowan Old Style"', 'Georgia', 'serif'],
        serif: ['"Bespoke Serif"', '"Iowan Old Style"', 'Georgia', 'serif'],
        sans: ['Switzer', 'system-ui', '-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tight: '-0.03em',
        wide: '0.2em',
      },
      transitionTimingFunction: {
        ink: 'cubic-bezier(0.16, 1, 0.3, 1)',
        expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      maxWidth: {
        shell: '1440px',
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        '.mono': {
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6875rem',
          lineHeight: '1.45',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        },
        '.mono-sm': {
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          lineHeight: '1.55',
          letterSpacing: '0.01em',
        },
        '.serif': { fontFamily: 'var(--font-serif)' },
        '.sans': { fontFamily: 'var(--font-sans)' },
        '.hairline': { borderColor: 'var(--hairline)' },
        '.rule-top': { borderTop: '1px solid var(--hairline)' },
        '.wrap': {
          width: '100%',
          maxWidth: '1440px',
          marginInline: 'auto',
          paddingInline: 'var(--gutter)',
        },
        '.statement': {
          fontFamily: 'var(--font-serif)',
          fontWeight: '400',
          fontSize: 'clamp(2.75rem, 7.2vw, 6.5rem)',
          lineHeight: '0.98',
          letterSpacing: '-0.02em',
        },
        '.statement-sm': {
          fontFamily: 'var(--font-serif)',
          fontWeight: '400',
          fontSize: 'clamp(1.75rem, 3.4vw, 2.75rem)',
          lineHeight: '1.05',
          letterSpacing: '-0.01em',
        },
      });
    }),
  ],
};
