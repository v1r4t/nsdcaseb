import { useEffect, useState } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";
const COARSE = "(pointer: coarse)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED).matches;
}

export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(COARSE).matches;
}

/**
 * Whether this device should get a WebGL layer at all.
 * A mid-range Android on campus WiFi is the default reader, and a shader
 * background is the first thing that eats their battery.
 */
export function canRunWebGL(): boolean {
  if (typeof window === "undefined") return false;
  if (prefersReducedMotion()) return false;
  if (isCoarsePointer()) return false;

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number" && memory < 4) return false;

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export interface DeviceTier {
  reduced: boolean;
  touch: boolean;
  webgl: boolean;
}

export function useDeviceTier(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>(() => ({
    reduced: prefersReducedMotion(),
    touch: isCoarsePointer(),
    webgl: false,
  }));

  useEffect(() => {
    setTier({ reduced: prefersReducedMotion(), touch: isCoarsePointer(), webgl: canRunWebGL() });

    if (!window.matchMedia) return;
    const reducedQuery = window.matchMedia(REDUCED);
    const coarseQuery = window.matchMedia(COARSE);
    const update = () =>
      setTier({ reduced: reducedQuery.matches, touch: coarseQuery.matches, webgl: canRunWebGL() });

    reducedQuery.addEventListener?.("change", update);
    coarseQuery.addEventListener?.("change", update);
    return () => {
      reducedQuery.removeEventListener?.("change", update);
      coarseQuery.removeEventListener?.("change", update);
    };
  }, []);

  return tier;
}
