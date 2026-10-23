/**
 * Shared focus-trap hook, extracted from the (identical) Tab-wrap logic that
 * lived in FullscreenMenu and CommandPalette.
 *
 * While `active`, Tab / Shift+Tab wraps inside `ref` so the page behind an
 * overlay stays unreachable. Escape handling stays with the callers.
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';

const DEFAULT_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  selector: string = DEFAULT_SELECTOR,
): void {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const panel = ref.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(selector));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      // Wrap at both ends so the page behind the overlay stays unreachable.
      if (event.shiftKey && (current === first || current === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref, active, selector]);
}

export default useFocusTrap;
