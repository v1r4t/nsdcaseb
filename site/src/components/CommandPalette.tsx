/**
 * ⌘K command palette — keyboard-first search overlay for the NSDC site.
 *
 * Opens on Cmd+K (macOS) / Ctrl+K, on the `nsdc:open-palette` DOM event, and
 * closes on Escape, backdrop click, or the `nsdc:close-palette` DOM event.
 * Self-contained: the orchestrator only mounts `<CommandPalette />`.
 *
 * Overlay, focus-return, scroll-lock and Tab-trap conventions mirror
 * FullscreenMenu; motion is a 200ms fade + 6px y-translate on `ease-expo`
 * (the global reduced-motion rule collapses it to instant).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CLOSE_PALETTE_EVENT,
  OPEN_PALETTE_EVENT,
  buildStaticIndex,
  ensureRemoteIndex,
  searchPalette,
} from '../lib/search';
import type { MatchRange, SearchItem } from '../lib/search';
import type { Role } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Keep the exit timer in sync with the `duration-200` transition below. */
const EXIT_MS = 200;
const LISTBOX_ID = 'nsdc-palette-listbox';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Auth may be absent in isolation; a missing provider means "no session". */
function useRoleSafe(): Role | null {
  try {
    return useAuth().user?.role ?? null;
  } catch {
    return null;
  }
}

function optionId(index: number): string {
  return `nsdc-palette-option-${index}`;
}

function HighlightedLabel({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    const start = Math.max(0, Math.min(range.start, text.length));
    const end = Math.max(start, Math.min(range.end, text.length));
    if (start > cursor) parts.push(<span key={`plain-${i}`}>{text.slice(cursor, start)}</span>);
    if (end > start) {
      parts.push(
        <span key={`hit-${i}`} className="text-signal">
          {text.slice(start, end)}
        </span>,
      );
    }
    cursor = end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const role = useRoleSafe();

  const [open, setOpen] = useState(false);
  // `mounted` outlives `open` so the panel can fade out; `entered` drives the
  // directional transition one frame after mount (same pattern as FullscreenMenu).
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<SearchItem[]>([]);
  const [active, setActive] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const closePalette = useCallback(() => setOpen(false), []);

  const statics = useMemo(() => buildStaticIndex(role), [role]);
  const groups = useMemo(() => searchPalette(query, statics, remote), [query, statics, remote]);
  const flat = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const total = flat.length;

  // Global open triggers: ⌘K / Ctrl+K toggle plus the orchestrator's DOM events.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);
    const onCloseEvent = () => setOpen(false);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    window.addEventListener(CLOSE_PALETTE_EVENT, onCloseEvent);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
      window.removeEventListener(CLOSE_PALETTE_EVENT, onCloseEvent);
    };
  }, []);

  // Mount/exit transition.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open ]);

  // Per open: remember the trigger, reset state, lazily fetch remote sources
  // (cached in module state; failures resolve to nothing), focus the input.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActive(0);
    let cancelled = false;
    ensureRemoteIndex().then((items) => {
      if (!cancelled) setRemote(items);
    });
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open ]);

  // Return focus to the trigger — only on a real open → close transition.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const prev = prevFocusRef.current;
    if (prev && prev.isConnected) prev.focus();
  }, [open ]);

  // Body scroll lock, restored to whatever it was.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open ]);

  // Escape closes; Tab wraps inside the panel so the page behind stays
  // unreachable (mirrors FullscreenMenu).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open ]);

  // Keep the active index valid as results change; keep it visible on move.
  useEffect(() => {
    setActive((prev) => Math.min(prev, Math.max(0, total - 1)));
  }, [total ]);

  useEffect(() => {
    if (!open || total === 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active, open, total ]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate],
  );

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((prev) => (total === 0 ? 0 : (prev + 1) % total));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((prev) => (total === 0 ? 0 : (prev - 1 + total) % total));
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      setActive((prev) => Math.min(Math.max(0, total - 1), prev + 5));
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      setActive((prev) => Math.max(0, prev - 5));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = flat[active];
      if (result) go(result.item.href);
    }
  };

  if (!mounted) return null;

  let runningIndex = -1;
  const activeId = total > 0 ? optionId(active) : undefined;
  const countLabel = `${total} ${total === 1 ? 'result' : 'results'}`;

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
      className={`fixed inset-0 z-[60] bg-ink/80 backdrop-blur transition-opacity duration-200 ease-expo ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={`mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-2xl rounded-sm border border-line bg-ink transition-[opacity,transform] duration-200 ease-expo ${
          entered ? 'translate-y-0 opacity-100' : 'translate-y-[6px] opacity-0'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span aria-hidden="true" className="shrink-0 font-mono text-sm text-signal">
            &gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search site"
            aria-expanded={total > 0}
            aria-controls={LISTBOX_ID}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Type to search pages, events, people, media…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            className="w-full border-0 bg-transparent py-4 font-display text-base text-paper outline-none placeholder:text-muted/70 focus-visible:ring-0"
          />
          <kbd className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            ESC
          </kbd>
        </div>

        {total > 0 ? (
          <ul
            role="listbox"
            id={LISTBOX_ID}
            aria-label="Search results"
            className="max-h-[50vh] overflow-y-auto px-2 py-2"
          >
            {groups.map((group) => (
              <li key={group.domain} role="presentation">
                <p aria-hidden="true" className="label px-3 pb-1 pt-3">
                  {group.heading}
                </p>
                <ul role="group" aria-label={group.heading}>
                  {group.results.map((result) => {
                    runningIndex += 1;
                    const index = runningIndex;
                    const isActive = index === active;
                    return (
                      <li
                        key={result.item.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(result.item.href)}
                        className={`relative flex cursor-pointer items-baseline justify-between gap-4 rounded-sm px-3 py-2 transition-colors duration-200 ${
                          isActive ? 'bg-paper/5' : 'bg-transparent'
                        }`}
                      >
                        {isActive && (
                          <span aria-hidden="true" className="absolute inset-y-1 left-0 w-[2px] bg-signal" />
                        )}
                        <span className="min-w-0 truncate font-display text-[15px] text-paper">
                          <HighlightedLabel text={result.item.label} ranges={result.labelRanges} />
                        </span>
                        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted">
                          {result.item.sublabel}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 font-mono text-sm text-muted">
            {query.trim().length === 0 ? 'Loading index…' : `No results for "${query}"`}
          </p>
        )}

        <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 font-mono text-[11px] text-muted">
          <span>
            <span aria-hidden="true">↑↓</span> navigate
          </span>
          <span>
            <span aria-hidden="true">↵</span> open
          </span>
          <span>
            <span aria-hidden="true">esc</span> close
          </span>
        </div>

        <p aria-live="polite" className="sr-only">
          {query.trim().length === 0 ? 'Type to search.' : countLabel}
        </p>
      </div>
    </div>
  );
}
