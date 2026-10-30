import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../lib/motion";
import {
  ROOM,
  cameraAtProgress,
  corridorSegments,
  fadeAt,
  horizonAt,
  place,
  project,
  type Segment,
} from "./room";
import { ROOM_OBJECTS } from "./roomObjects";

const PAPER = "#f2eee3";
const INK = "17, 17, 16";
const SEAL = "179, 60, 27";
const FPS_CAP = 30;

/**
 * One light room, drawn once, with the camera dollying down it as you scroll.
 *
 * The page has no section transitions: this is the transition. Corridor rails
 * run to the vanishing point, ribs are generated from the camera position so
 * they sweep past, and objects stand at fixed depths. Everything is hairline
 * ink on paper — the inverse of the black voids this genre usually uses.
 *
 * Canvas 2D, not WebGL: at ~200 segments a frame this is cheaper, and it runs
 * on the phones the old shader was disabled for.
 */
export function RoomScene({
  className,
  scrollElement,
}: {
  className?: string;
  /** A nested scroll container. Defaults to the window. */
  scrollElement?: HTMLElement | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const context = ctx;
    const reduced = prefersReducedMotion();

    let width = 1;
    let height = 1;
    let raf = 0;
    let running = false;
    let last = 0;

    let targetZ = 0;
    let cameraZ = 0;
    let vignette: CanvasGradient | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Built once per size, not once per frame.
      vignette = context.createRadialGradient(
        width / 2,
        horizonAt(height),
        0,
        width / 2,
        horizonAt(height),
        Math.max(width, height) * 0.78,
      );
      vignette.addColorStop(0, `rgba(${INK}, 0)`);
      vignette.addColorStop(1, `rgba(${INK}, 0.07)`);
    };

    const scroller = scrollElement ?? null;
    const readScroll = () => {
      const max = scroller
        ? Math.max(1, scroller.scrollHeight - scroller.clientHeight)
        : Math.max(1, document.documentElement.scrollHeight - height);
      const top = scroller ? scroller.scrollTop : window.scrollY;
      targetZ = cameraAtProgress(top / max);
    };

    const stroke = (
      segments: readonly Segment[],
      colour: string,
      alpha: number,
      lineWidth: number,
    ) => {
      context.beginPath();
      let drew = false;
      for (const segment of segments) {
        const a = project(
          { x: segment[0], y: segment[1], z: segment[2] },
          width,
          height,
          cameraZ,
        );
        const b = project(
          { x: segment[3], y: segment[4], z: segment[5] },
          width,
          height,
          cameraZ,
        );
        if (!a || !b) continue;
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        drew = true;
      }
      if (!drew) return;
      context.strokeStyle = `rgba(${colour}, ${alpha})`;
      context.lineWidth = lineWidth;
      context.stroke();
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      // The ground is painted here, not by the page: one surface, no seams.
      context.fillStyle = PAPER;
      context.fillRect(0, 0, width, height);

      const horizon = horizonAt(height);
      if (vignette) {
        context.fillStyle = vignette;
        context.fillRect(0, 0, width, height);
      }

      context.lineCap = "round";
      context.lineJoin = "round";

      // The far door: without it the corridor never terminates and reads as an
      // endless stack of frames.
      const door = [
        { x: -ROOM.halfWidth, y: ROOM.ceiling, z: cameraZ + ROOM.far },
        { x: ROOM.halfWidth, y: ROOM.ceiling, z: cameraZ + ROOM.far },
        { x: ROOM.halfWidth, y: ROOM.floor, z: cameraZ + ROOM.far },
        { x: -ROOM.halfWidth, y: ROOM.floor, z: cameraZ + ROOM.far },
      ]
        .map((point) => project(point, width, height, cameraZ))
        .filter((point): point is { x: number; y: number } => point !== null);

      if (door.length === 4) {
        context.beginPath();
        door.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.strokeStyle = `rgba(${INK}, 0.14)`;
        context.lineWidth = 1;
        context.stroke();

        context.beginPath();
        context.moveTo(0, horizon);
        context.lineTo(width, horizon);
        context.strokeStyle = `rgba(${INK}, 0.1)`;
        context.stroke();
      }

      // Corridor: rails hold a steady weight, ribs fade with depth.
      const { rails, ribs } = corridorSegments(cameraZ);
      stroke(rails, INK, 0.17, 1);

      for (const rib of ribs) {
        const depth = rib[2] - cameraZ;
        stroke([rib], INK, fadeAt(depth) * 0.34, 1);
      }

      // Objects, far to near, so near ones overlap correctly.
      const visible = ROOM_OBJECTS.map((object) => ({
        object,
        depth: object.at - cameraZ,
      }))
        .filter(({ depth }) => depth > ROOM.near && depth < ROOM.far)
        .sort((a, b) => b.depth - a.depth);

      for (const { object, depth } of visible) {
        const placed = object.segments.map((segment) =>
          place(segment, object.x, 0, object.at, object.scale),
        );
        const alpha = fadeAt(depth) * (object.seal ? 0.7 : 0.55);
        stroke(placed, object.seal ? SEAL : INK, alpha, 1.1 + fadeAt(depth) * 0.9);
      }
    };

    const step = (now: number) => {
      raf = 0;
      if (!running) return;

      // The first frame must draw: a gate that only updates `last` after the
      // check would reschedule forever and never paint.
      if (last === 0) last = now;
      const delta = now - last;
      if (delta < 1000 / FPS_CAP - 2) {
        raf = window.requestAnimationFrame(step);
        return;
      }
      last = now;

      readScroll();
      cameraZ += (targetZ - cameraZ) * 0.18;

      // Park the loop once the camera has arrived: a permanently running rAF is
      // the difference between a page that idles and one that drains a phone.
      const settled = Math.abs(targetZ - cameraZ) < 0.002;
      if (settled) cameraZ = targetZ;

      draw();

      if (settled) {
        running = false;
        return;
      }
      raf = window.requestAnimationFrame(step);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(step);
    };

    const stop = () => {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = () => (document.hidden ? stop() : start());
    // The loop parks itself when the camera settles, so a scroll has to wake it.
    const onScrollWake = () => start();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        readScroll();
        cameraZ = targetZ;
        if (reduced) draw();
      }, 140);
    };

    resize();
    readScroll();
    cameraZ = targetZ;

    const wakeTarget: HTMLElement | Window = scroller ?? window;

    if (reduced) {
      draw();
    } else {
      window.addEventListener("resize", onResize);
      wakeTarget.addEventListener("scroll", onScrollWake, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      start();
    }

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      wakeTarget.removeEventListener("scroll", onScrollWake);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scrollElement]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="room-scene"
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -10,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
