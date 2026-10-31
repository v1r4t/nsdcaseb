import { useEffect } from 'react';

interface DocumentMeta {
  title: string;
  description: string;
  /** Value for `meta[name="robots"]`. Omit to leave the route indexable. */
  robots?: string;
}

/**
 * useDocumentMeta — per-route document title + meta description.
 *
 * Updates `document.title` and the `meta[name="description"]` tag on mount
 * and whenever either value changes. Deliberately minimal: the default tags
 * live in `site/index.html` (Phase 2A), so routes that never call this hook
 * still get sane metadata.
 *
 * `robots` is optional. When supplied (e.g. "noindex"), the tag is created if
 * missing and restored on unmount; when omitted, any tag set by a previous
 * route is removed so the page is indexable again.
 */
export function useDocumentMeta({ title, description, robots }: DocumentMeta): void {
  useEffect(() => {
    document.title = title;
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (tag) tag.setAttribute('content', description);
  }, [title, description]);

  useEffect(() => {
    // Leave a server-rendered robots tag alone when this route does not set one.
    if (robots === undefined) return;

    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = existing?.getAttribute('content') ?? null;

    if (existing) {
      existing.setAttribute('content', robots);
    } else {
      const created = document.createElement('meta');
      created.setAttribute('name', 'robots');
      created.setAttribute('content', robots);
      document.head.appendChild(created);
    }

    return () => {
      const current = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
      if (previous === null) {
        current?.remove();
      } else if (current) {
        current.setAttribute('content', previous);
      } else {
        const restored = document.createElement('meta');
        restored.setAttribute('name', 'robots');
        restored.setAttribute('content', previous);
        document.head.appendChild(restored);
      }
    };
  }, [robots]);
}
