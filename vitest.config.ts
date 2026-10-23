import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['site/src/**/*.test.ts', 'site/src/**/*.test.tsx'],
  },
});
