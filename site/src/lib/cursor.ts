/**
 * Context-cursor opt-in (declarative attribute reader).
 *
 * CHOSEN MECHANISM: `data-cursor` attribute — no imports needed at call sites.
 *
 *   // Show the chip while the pointer is over this subtree:
 *   <Link to={...} data-cursor="VIEW EVENT →">…</Link>
 *   <button data-cursor="OPEN PHOTO →" …>…</button>
 *
 *   // Suppress the chip inside a subtree (palette, menu, lightbox…):
 *   <div data-cursor-off>…</div>
 *
 * The overlay (`components/ContextCursor.tsx`) listens for pointer movement
 * once, walks `event.target` up via `resolveCursorLabel`, and shows the label
 * found on the nearest `[data-cursor]` ancestor — unless a nearer
 * `[data-cursor-off]` ancestor (or an editable element) wins. Empty or
 * whitespace-only values are treated as "no label". This file owns the
 * attribute names and the walk so renderer and call sites cannot drift.
 *
 * A11Y: the chip is supplementary (`aria-hidden`); opt-in elements must stay
 * fully usable without it — never gate meaning or action on the label.
 */

/** Attribute carrying the chip text. */
export const CURSOR_LABEL_ATTR = 'data-cursor';

/** Attribute marking a subtree where the chip must never appear. */
export const CURSOR_OFF_ATTR = 'data-cursor-off';

/** Selector for elements where the native text caret must win. */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

/**
 * Resolve the cursor label for a pointer-event target.
 * Returns the label text, or `null` when the chip must stay hidden
 * (outside any opt-in, inside `[data-cursor-off]`, or over editable text).
 */
export function resolveCursorLabel(target: EventTarget | null): string | null {
  if (!target || !(target instanceof Element)) return null;
  const el = target as Element;
  if (typeof el.closest !== 'function') return null;
  // Opt-out wins over any opt-in further up the tree.
  if (el.closest(`[${CURSOR_OFF_ATTR}]`)) return null;
  if (el.closest(EDITABLE_SELECTOR)) return null;
  const host = el.closest(`[${CURSOR_LABEL_ATTR}]`);
  if (!host) return null;
  const raw = host.getAttribute(CURSOR_LABEL_ATTR);
  if (!raw) return null;
  const text = raw.trim();
  return text.length > 0 ? text : null;
}
