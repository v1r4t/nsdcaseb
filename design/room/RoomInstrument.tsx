import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ROOM, cameraAtProgress } from "./room";

/** One snapshot of the room's three readings. */
interface Readings {
  room: number;
  depth: number;
  ribs: number;
}

/** Read the scroll position and turn it into raw numbers. */
function read(scrollElement?: HTMLElement | null): Readings {
  if (typeof window === "undefined") {
    return { room: 1, depth: 0, ribs: 0 };
  }
  const max = scrollElement
    ? Math.max(1, scrollElement.scrollHeight - scrollElement.clientHeight)
    : Math.max(1, document.documentElement.scrollHeight - (window.innerHeight || 1));
  const top = scrollElement ? scrollElement.scrollTop : window.scrollY;
  const depth = cameraAtProgress(top / max);
  return {
    room: Math.floor(depth / (ROOM.spacing * 4)) + 1,
    depth,
    ribs: Math.floor(depth / ROOM.spacing),
  };
}

/** Format the raw readings the way the margin readout prints them. */
function format(readings: Readings): { room: string; depth: string; ribs: string } {
  return {
    room: `ROOM ${String(readings.room).padStart(2, "0")}`,
    depth: `Z ${readings.depth.toFixed(1)} M`,
    ribs: `${readings.ribs} ${readings.ribs === 1 ? "RIB" : "RIBS"}`,
  };
}

/**
 * The room, measured. A fixed, quiet readout in the page margin that turns the
 * scroll position into a depth, a room number and a rib count, so the corridor
 * reads as a surveyed space rather than a backdrop.
 *
 * Pass the same `scrollElement` as `RoomScene` when the page scrolls inside a
 * nested container. Motion is deliberately not animated: values update on
 * scroll (throttled), and collapse to the initial position under reduced motion.
 */
export function RoomInstrument({
  className,
  scrollElement,
}: {
  className?: string;
  /** A nested scroll container. Defaults to the window. */
  scrollElement?: HTMLElement | null;
}) {
  const reduced = useReducedMotion();
  const [readings, setReadings] = useState<Readings>(() => read(scrollElement));

  useEffect(() => {
    // Re-sync on mount in case the document was already scrolled (e.g. a
    // restored scroll position) before this component rendered.
    setReadings(read(scrollElement));
    if (reduced) return;

    let frame = 0;
    let last = 0;
    const update = () => {
      frame = 0;
      const now = performance.now();
      // Cap updates so a fast scroll never floods React with state writes.
      if (now - last < 80) return;
      last = now;
      setReadings(read(scrollElement));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    const target: HTMLElement | Window = scrollElement ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced, scrollElement]);

  const labels = format(readings);

  return (
    <div
      data-testid="room-instrument"
      aria-hidden="true"
      className={[
        "pointer-events-none fixed bottom-6 left-6 z-0 hidden flex-col gap-0.5 border-l hairline pl-3 md:flex mono text-faint",
        className ?? "",
      ].join(" ")}
    >
      <span>{labels.room}</span>
      <span>{labels.depth}</span>
      <span>{labels.ribs}</span>
    </div>
  );
}

export default RoomInstrument;
