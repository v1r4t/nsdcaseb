import { Suspense, lazy } from 'react';
import { useDeviceTier } from '../../../design/lib/motion';

/**
 * Route-only and device-only furniture, split out of the entry chunk.
 *
 * The paper ground itself is painted by `body` (and by `PageScene` on
 * non-landing routes), so the null Suspense fallback never leaves a blank
 * page: these chunks only add the canvas, the margin readout and the custom
 * cursor on top of it.
 */
const RoomScene = lazy(() =>
  import('../../../design/room/RoomScene').then((module) => ({ default: module.RoomScene })),
);
const RoomInstrument = lazy(() =>
  import('../../../design/room/RoomInstrument').then((module) => ({
    default: module.RoomInstrument,
  })),
);
const Cursor = lazy(() =>
  import('../../../design/motion/Cursor').then((module) => ({ default: module.Cursor })),
);

/**
 * The landing page's room dolly and its margin readout. Both are only ever
 * mounted on `/`, so they stay out of every other route's first paint.
 */
export function RoomLayer() {
  return (
    <Suspense fallback={null}>
      <RoomScene />
      <RoomInstrument />
    </Suspense>
  );
}

/**
 * The award-site cursor. It cannot exist on a coarse pointer or under reduced
 * motion, so those devices never download it at all — `useDeviceTier` reads
 * `matchMedia` in its initial state, before the first render decides.
 */
export function CursorLayer() {
  const { reduced, touch } = useDeviceTier();
  if (reduced || touch) return null;

  return (
    <Suspense fallback={null}>
      <Cursor />
    </Suspense>
  );
}
