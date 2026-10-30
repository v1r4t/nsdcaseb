import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * A single 1px stroke dragged across the top edge whenever `trigger` changes.
 * Pass the current pathname, route key, or any value that changes on navigation.
 */
export function RouteWipe({ trigger }: { trigger?: unknown }) {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);

  useEffect(() => {
    setRun((value) => value + 1);
  }, [trigger]);

  if (reduced) return null;
  return <div key={run} aria-hidden="true" className="route-wipe" />;
}
