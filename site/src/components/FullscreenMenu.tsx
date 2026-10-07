/**
 * Full-screen MENU overlay — the primary navigation for the whole site.
 *
 * Replaces a classic navbar: a large left-aligned index (`01 ABOUT` ... ) where
 * hover (or keyboard focus) reveals a one-line description. The panel traps
 * focus while open, locks body scroll, closes on Escape, and hands focus back
 * to the trigger so keyboard users never lose their place.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';

interface MenuItem {
  index: string;
  title: string;
  to: string;
  description: string;
}

/**
 * Target sections are owned by the page components; this overlay only routes.
 */
const ITEMS: readonly MenuItem[] = [
  {
    index: '01',
    title: 'ABOUT',
    to: '/#about',
    description: 'A student technology community at Amrita Vishwa Vidyapeetham, Bengaluru.',
  },
  {
    index: '02',
    title: 'EVENTS',
    to: '/registrations',
    description: 'Talks, workshops and data sessions — dates, status and registration.',
  },
  {
    index: '03',
    title: 'PROJECTS',
    to: '/projects',
    description: 'What members have built — tools, experiments and shipped work.',
  },
  {
    index: '04',
    title: 'MEDIA',
    to: '/media',
    description: 'Photographs and write-ups from previous sessions.',
  },
  {
    index: '05',
    title: 'PEOPLE',
    to: '/#people',
    description: 'The members and executives running NSDC.',
  },
  {
    index: '06',
    title: 'ARCHIVE',
    to: '/registrations#archive',
    description: 'Every event we have run, kept on the record.',
  },
];

/** Matches `--dur-ui`; the exit timer keeps the panel mounted for the fade-out. */
const UI_MS = 420;
const STAGGER_MS = 50;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FullscreenMenuProps {
  open: boolean;
  onClose: () => void;
  /** Receives focus again once the panel closes — the MENU button. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function FullscreenMenu({ open, onClose, returnFocusRef }: FullscreenMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  // `mounted` outlives `open` so the panel can fade out; `entered` drives the
  // directional transition one frame after mount.
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), UI_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Focus the panel itself so screen readers announce the dialog and Tab walks
  // the index from the top.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Hand focus back to the trigger — only on a real open → close transition, so
  // a first render never steals focus from the page.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    returnFocusRef?.current?.focus();
  }, [open, returnFocusRef]);

  // Body scroll lock, restored to whatever it was (another overlay may own it).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap at both ends so the page behind the overlay stays unreachable.
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!mounted) return null;

  return (
    <div
      ref={panelRef}
      id="nsdc-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      tabIndex={-1}
      // The panel itself is a scroll/landmarks container, never a focus stop:
      // suppress the global focus ring on it.
      className={`fixed inset-0 z-50 overflow-y-auto bg-ink outline-none transition-[opacity,transform] duration-[var(--dur-ui)] ease-expo focus-visible:ring-0 focus-visible:ring-offset-0 ${
        entered ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'
      }`}
    >
      <div className="shell flex min-h-full flex-col pb-16">
        <div className="flex h-16 shrink-0 items-center justify-between">
          <span className="label">Index</span>
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-1.5 font-mono text-[11px] uppercase tracking-wide">
            Close <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <nav aria-label="Menu" className="flex-1">
          <ol className="border-b border-line">
            {ITEMS.map((item, position) => (
              <li
                key={item.index}
                style={{ transitionDelay: entered ? `${position * STAGGER_MS}ms` : '0ms' }}
                className={`border-t border-line transition-[opacity,transform] duration-[var(--dur-ui)] ease-expo ${
                  entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
              >
                <Link
                  to={item.to}
                  onClick={onClose}
                  className="group flex items-baseline gap-4 py-4 md:gap-8 md:py-5"
                >
                  <span className="label w-8 shrink-0 pt-[0.6em] font-mono">{item.index}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[clamp(2.5rem,9vw,5rem)] uppercase leading-[0.9] tracking-tight text-paper transition-[color,transform] duration-[var(--dur-micro)] ease-expo group-hover:translate-x-2 group-hover:text-signal group-focus-visible:translate-x-2 group-focus-visible:text-signal">
                      {item.title}
                    </span>
                    <span className="mt-2 block max-w-xl text-sm text-muted opacity-100 transition-opacity duration-[var(--dur-ui)] ease-expo md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <p className="label mt-10">12.9716&deg; N, 77.5946&deg; E</p>
      </div>
    </div>
  );
}