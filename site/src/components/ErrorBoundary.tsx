/**
 * Route-level error boundary — branded fallback with a reload action.
 * Wraps `<Routes>` in App so a crashing page never blanks the whole shell.
 */

import { Component } from 'react';
import type { ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // eslint-disable-next-line no-console
    console.error('[nsdc] route error:', error);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="wrap py-16 md:py-24" role="alert">
        <p className="mono text-seal">Error / Something broke</p>
        <h1 className="mt-10 max-w-3xl font-display text-4xl font-normal tracking-tight text-ink sm:text-5xl">
          Something went wrong
        </h1>
        <p className="mt-4 max-w-xl text-sm text-ink/80">
          This page hit an unexpected error. Nothing was lost — try reloading.
        </p>
        <div className="mt-10">
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">
            Reload the page
          </button>
        </div>
      </section>
    );
  }
}
