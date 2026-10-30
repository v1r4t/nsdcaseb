/**
 * Module-level pointer store.
 *
 * Deliberately not React state: the cursor and its ink trail read this on every
 * animation frame, and a `setState` per `pointermove` would put the whole tree
 * through reconciliation 120 times a second.
 *
 * One passive `pointermove` listener is shared by every subscriber. It is only
 * bound while there is at least one subscriber, and every subscription is
 * cleaned up independently.
 */

export interface PointerState {
  x: number;
  y: number;
  velocity: number;
  label: string | null;
  pressed: boolean;
}

type PointerSubscriber = (state: PointerState) => void;

const state: PointerState = {
  x: 0,
  y: 0,
  velocity: 0,
  label: null,
  pressed: false,
};

const subscribers = new Set<PointerSubscriber>();

let attached = false;
let hasPosition = false;
let lastX = 0;
let lastY = 0;
let lastTime = 0;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function emit(): void {
  const snapshot: PointerState = {
    x: state.x,
    y: state.y,
    velocity: state.velocity,
    label: state.label,
    pressed: state.pressed,
  };
  for (const fn of Array.from(subscribers)) fn(snapshot);
}

function onPointerMove(event: Event): void {
  const pointer = event as PointerEvent;
  const time = now();

  if (hasPosition) {
    const dt = Math.max(time - lastTime, 1);
    const distance = Math.hypot(pointer.clientX - lastX, pointer.clientY - lastY);
    // px per ms, capped so a teleporting cursor does not blow up the tail.
    const instant = Math.min(distance / dt, 8);
    // Exponential smoothing: calm enough to read, quick enough to feel attached.
    state.velocity = state.velocity * 0.82 + instant * 0.18;
  } else {
    state.velocity = 0;
    hasPosition = true;
  }

  state.x = pointer.clientX;
  state.y = pointer.clientY;
  lastX = pointer.clientX;
  lastY = pointer.clientY;
  lastTime = time;

  emit();
}

function onPointerDown(): void {
  if (state.pressed) return;
  state.pressed = true;
  emit();
}

function onPointerUp(): void {
  if (!state.pressed) return;
  state.pressed = false;
  emit();
}

function bind(): void {
  if (attached || typeof window === "undefined") return;
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });
  window.addEventListener("blur", onPointerUp);
  attached = true;
}

function unbind(): void {
  if (!attached || typeof window === "undefined") return;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  window.removeEventListener("blur", onPointerUp);
  attached = false;
  hasPosition = false;
}

/** A copy, so callers can never mutate the store. */
export function getPointer(): PointerState {
  return {
    x: state.x,
    y: state.y,
    velocity: state.velocity,
    label: state.label,
    pressed: state.pressed,
  };
}

export function subscribePointer(fn: PointerSubscriber): () => void {
  subscribers.add(fn);
  bind();

  let live = true;
  return () => {
    if (!live) return;
    live = false;
    subscribers.delete(fn);
    if (subscribers.size === 0) unbind();
  };
}

/**
 * Imperative hover label for components that cannot render a `data-cursor`
 * attribute. The Cursor component prefers attributes via event delegation.
 */
export function setPointerLabel(label: string | null): void {
  if (state.label === label) return;
  state.label = label;
  emit();
}
