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
        void: '#050810',
        neon: '#22d3ee',
        deepblue: '#3b82f6',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        mega: '0.45em',
      },
    },
  },
  plugins: [],
};
