import { fileURLToPath } from 'node:url';

// Tailwind discovers `tailwind.config.js` relative to process.cwd(). Since this
// app is built from the repo root, point it at this app's config explicitly so
// it never falls back to the teaser's root config.
const config = fileURLToPath(new URL('./tailwind.config.js', import.meta.url));

export default {
  plugins: {
    tailwindcss: { config },
    autoprefixer: {},
  },
};
