import { useEffect } from 'react';

/**
 * useDocumentMeta — per-route document title + meta description.
 *
 * Updates `document.title` and the `meta[name="description"]` tag on mount
 * and whenever either value changes. Deliberately minimal: the default tags
 * live in `site/index.html` (Phase 2A), so routes that never call this hook
 * still get sane metadata.
 */
export function useDocumentMeta({ title, description }: { title: string; description: string }): void {
  useEffect(() => {
    document.title = title;
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (tag) tag.setAttribute('content', description);
  }, [title, description]);
}
