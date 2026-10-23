/**
 * Signal Trail easter eggs (plan_v2) — central logic, kept out of page
 * components so the whole trail stays removable from one place.
 *
 * - `secretLineFor(query)` — exact-match palette signal lines (Egg 2).
 * - Ship-sequence detector (Egg 3): `build` → `learn` → `ship` typed outside
 *   form fields, ~8s budget, once per session via `nsdc:shipped`.
 * - `SHIP_EVENT` (`nsdc:ship`) — the single payoff trigger; the keyboard
 *   detector and the tappable palette line both dispatch it, and the
 *   headless `EasterEggs` controller performs the payoff.
 * - Konami detector (Egg 4): ArrowUp ArrowUp ArrowDown ArrowDown
 *   ArrowLeft ArrowRight ArrowLeft ArrowRight b a, ~10s budget, once per
 *   session via `nsdc:konami`, payoff trigger `KONAMI_EVENT` (`nsdc:konami`).
 */

export interface SecretLine {
  /** Normalised query that triggers this line. */
  key: string;
  /** Exact mono line to render. */
  text: string;
  /** Only the `nsdc` line is tappable (fires the ship payoff). */
  tappable: boolean;
}

const SECRET_LINES: Record<string, { text: string; tappable: boolean }> = {
  nsdc: {
    text: 'SIGNAL FOUND — BUILD → LEARN → SHIP. Type it, or tap here.',
    tappable: true,
  },
  '42': { text: 'Not the answer. Good question though.', tappable: false },
  hello: { text: 'Hello, builder.', tappable: false },
  jadal: { text: '3rd place, IEEE-CIS Hackathon. See Projects.', tappable: false },
  ship: { text: 'Almost. The trail is BUILD → LEARN → SHIP.', tappable: false },
};

/**
 * Exact-match secret line for a palette query (trimmed, case-insensitive).
 * Partial queries and `admin` never match — the disguise stays intact.
 */
export function secretLineFor(query: string): SecretLine | null {
  const key = query.trim().toLowerCase();
  if (key.length === 0 || key === 'admin') return null;
  const line = SECRET_LINES[key];
  return line ? { key, text: line.text, tappable: line.tappable } : null;
}

/** Rolling-buffer target: `build` + `learn` + `ship`, lowercased. */
export const SHIP_SEQUENCE = 'buildlearnship';

/** DOM event the detector and the palette line dispatch; EasterEggs pays off. */
export const SHIP_EVENT = 'nsdc:ship';

/** Session flag so the payoff fires once per session. */
export const SHIPPED_KEY = 'nsdc:shipped';

/** Full-sequence budget: slower trails reset. */
export const SHIP_TIMEOUT_MS = 8000;

export function hasShipped(): boolean {
  try {
    return window.sessionStorage.getItem(SHIPPED_KEY) !== null;
  } catch {
    return false;
  }
}

export function markShipped(): void {
  try {
    window.sessionStorage.setItem(SHIPPED_KEY, '1');
  } catch {
    // Private mode / blocked storage: the egg just re-fires per payoff.
  }
}

export function dispatchShip(): void {
  window.dispatchEvent(new CustomEvent(SHIP_EVENT));
}

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

/**
 * Framework-free key-sequence detector. Install once, call the returned
 * cleanup on unmount. Ignores keys typed in form fields / contenteditable
 * regions and any keypress held with a modifier.
 */
export function installShipDetector(onShip: () => void): () => void {
  let buffer = '';
  let firstAt = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (typeof event.key !== 'string' || event.key.length !== 1) return;
    const target = event.target;
    if (target instanceof Element && target.closest(EDITABLE_SELECTOR)) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;

    const now = Date.now();
    if (buffer.length === 0 || now - firstAt > SHIP_TIMEOUT_MS) {
      buffer = '';
      firstAt = now;
    }
    buffer += event.key.toLowerCase();
    if (buffer.length > SHIP_SEQUENCE.length) {
      buffer = buffer.slice(-SHIP_SEQUENCE.length);
    }
    if (buffer.endsWith(SHIP_SEQUENCE)) {
      buffer = '';
      firstAt = 0;
      onShip();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}

/** Konami sequence (Egg 4): ↑↑↓↓←→←→ B A, ~10s budget. */
export const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const;

/** DOM event the Konami detector dispatches; EasterEggs pays off. */
export const KONAMI_EVENT = 'nsdc:konami';

/** Session flag so the Konami payoff fires once per session. */
export const KONAMI_KEY = 'nsdc:konami';

/** Full-sequence budget: slower trails reset. */
export const KONAMI_TIMEOUT_MS = 10000;

export function hasKonami(): boolean {
  try {
    return window.sessionStorage.getItem(KONAMI_KEY) !== null;
  } catch {
    return false;
  }
}

export function markKonami(): void {
  try {
    window.sessionStorage.setItem(KONAMI_KEY, '1');
  } catch {
    // Private mode / blocked storage: the egg just re-fires per payoff.
  }
}

export function dispatchKonami(): void {
  window.dispatchEvent(new CustomEvent(KONAMI_EVENT));
}

/**
 * Framework-free Konami detector. Install once, call the returned cleanup
 * on unmount. Matches the ship detector's contract: ignores keys typed in
 * form fields / contenteditable regions and any keypress held with a
 * modifier. Letter keys match case-insensitively (`b` / `a`).
 */
export function installKonamiDetector(onKonami: () => void): () => void {
  let progress = 0;
  let firstAt = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (typeof event.key !== 'string') return;
    const target = event.target;
    if (target instanceof Element && target.closest(EDITABLE_SELECTOR)) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;

    const now = Date.now();
    if (progress === 0 || now - firstAt > KONAMI_TIMEOUT_MS) {
      progress = 0;
      firstAt = now;
    }
    const expected = KONAMI_SEQUENCE[progress];
    const hit =
      expected.length > 1 ? event.key === expected : event.key.toLowerCase() === expected;
    if (hit) {
      progress += 1;
      if (progress >= KONAMI_SEQUENCE.length) {
        progress = 0;
        firstAt = 0;
        onKonami();
      }
      return;
    }
    // Overlap restart: a lone ArrowUp restarts the trail instead of clearing.
    const restart = KONAMI_SEQUENCE[0].length > 1 ? event.key === KONAMI_SEQUENCE[0] : event.key.toLowerCase() === KONAMI_SEQUENCE[0];
    progress = 0;
    firstAt = now;
    if (restart) progress = 1;
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
