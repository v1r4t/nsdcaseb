/**
 * FolioRail — the page's spine. A fixed margin rail that reports which
 * section you are reading, magazine-folio style (`03 / 09`).
 *
 * It reads `[data-folio]` elements from the document rather than taking a
 * section list as props, so any page can opt in by adding the attribute and
 * the rail needs no page-specific wiring. Hidden below `lg` — there is no
 * margin to spare on small screens.
 */

import { useEffect, useState } from 'react';

interface Folio {
  label: string;
  element: Element;
}

export default function FolioRail() {
  const [folios, setFolios] = useState<Folio[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Collect the marked sections once they are in the DOM.
  useEffect(() => {
    const collect = () => {
      const nodes = Array.from(document.querySelectorAll('[data-folio]'));
      setFolios(
        nodes.map((element) => ({
          label: element.getAttribute('data-folio') ?? '',
          element,
        })),
      );
    };
    collect();
    // Late-mounting sections (async content) get picked up here.
    const timer = window.setTimeout(collect, 600);
    return () => window.clearTimeout(timer);
  }, []);

  // Track whichever section owns the middle of the viewport.
  useEffect(() => {
    if (folios.length === 0) return;
    if (typeof IntersectionObserver !== 'function') return;

    const visible = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target, entry.intersectionRatio);
          else visible.delete(entry.target);
        }
        let bestIndex = -1;
        let bestRatio = -1;
        folios.forEach((folio, i) => {
          const ratio = visible.get(folio.element) ?? -1;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = i;
          }
        });
        if (bestIndex >= 0) setActiveIndex(bestIndex);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-20% 0px -20% 0px' },
    );

    for (const folio of folios) observer.observe(folio.element);
    return () => observer.disconnect();
  }, [folios]);

  if (folios.length === 0) return null;

  const active = folios[Math.min(activeIndex, folios.length - 1)];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 lg:block"
    >
      <p className="edge-meta font-mono text-[11px] uppercase tracking-wide text-muted">
        <span className="text-paper/70">{active.label}</span>
        <span className="mx-3 text-line">|</span>
        <span>
          {String(folios.length).padStart(2, '0')} sections
        </span>
      </p>
    </div>
  );
}
