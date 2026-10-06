/** @type {import('tailwindcss').Config} */
export default {
  // `relative` anchors these globs to this config file rather than the
  // repo root (the app is built from the root, not from `site/`).
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        ink: '#080808',
        paper: '#f5f5f2',
        muted: '#777777',
        line: '#242424',
        signal: '#ff5a36',
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tight: '-0.03em',
        wide: '0.2em',
      },
      transitionTimingFunction: {
        expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      maxWidth: {
        shell: '1440px',
      },
    },
  },
  plugins: [],
};