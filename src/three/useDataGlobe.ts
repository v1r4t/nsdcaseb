import { useEffect, useRef } from 'react';
import { DataGlobe } from './DataGlobe';

interface UseDataGlobeOptions {
  progress?: number;
  revealed?: boolean;
}

/** Optional React wrapper: owns a DataGlobe for a canvas ref. */
export function useDataGlobe(
  ref: React.RefObject<HTMLCanvasElement | null>,
  opts: UseDataGlobeOptions = {},
): React.RefObject<DataGlobe | null> {
  const { progress = 0, revealed = false } = opts;
  const globeRef = useRef<DataGlobe | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let globe: DataGlobe | null = null;
    try {
      globe = new DataGlobe(canvas);
    } catch {
      globeRef.current = null;
      return;
    }
    globeRef.current = globe;
    globe.setProgress(progress);
    globe.setRevealed(revealed);
    return () => {
      globe?.dispose();
      globeRef.current = null;
    };
    // create once per canvas mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  useEffect(() => {
    globeRef.current?.setProgress(progress);
  }, [progress]);

  useEffect(() => {
    globeRef.current?.setRevealed(revealed);
  }, [revealed]);

  return globeRef;
}

export default useDataGlobe;
