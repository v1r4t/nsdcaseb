import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Egg 1 — console calling card (Signal Trail entry hint). Text-only, styled
 * with the site palette, never mentions /admin. Once per page load
 * (module guard covers StrictMode/HMR re-execution).
 */
declare global {
  var __nsdcCallingCard: boolean | undefined;
}

if (!globalThis.__nsdcCallingCard) {
  globalThis.__nsdcCallingCard = true;
  // eslint-disable-next-line no-console
  console.log(
    '%cNSDC — National Student Data Corps\n%cBUILD · LEARN · SHIP\n\n%cCurious? Type `nsdc` in the command palette (⌘K).',
    'font-weight: bold; color: #f5f5f2;',
    'font-weight: bold; color: #ff5a36;',
    'color: inherit;',
  );
}