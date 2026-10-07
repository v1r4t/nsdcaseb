import { useEffect, useMemo, useState } from 'react';
import { loadSiteState } from '../lib/site';
import type { Announcement } from '../lib/site';

/**
 * FNV-1a over the announcement text. The dismissal is keyed by the *content*,
 * so an edited or replaced announcement re-appears for everyone who dismissed
 * an older one, and the same announcement never comes back.
 */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function dismissalKey(text: string): string {
  return `nsdc:announcement-dismissed:${fingerprint(text)}`;
}

function wasDismissed(text: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(dismissalKey(text)) !== null;
  } catch {
    // Private mode / blocked storage: dismissing just lasts this page view.
    return false;
  }
}

function rememberDismissal(text: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(dismissalKey(text), '1');
  } catch {
    // Storage unavailable — the in-memory state still hides it for this view.
  }
}

interface AnnouncementBannerProps {
  /**
   * Already-fetched notice. Omit (`undefined`) and the banner fetches it
   * itself, non-blocking. Pass `null` explicitly to render nothing without
   * fetching.
   */
  announcement?: Announcement | null;
  /** Extra classes on the strip, e.g. to re-skin it inside a shell. */
  className?: string;
}

/**
 * ANNOUNCEMENT — a slim site-wide strip under the header. Renders nothing at
 * all when there is no announcement, so the normal state costs zero pixels.
 * The accent is reserved for the leading marker; the strip itself is ink,
 * hairline-ruled and mono.
 */
export default function AnnouncementBanner({ announcement, className }: AnnouncementBannerProps) {
  const [fetched, setFetched] = useState<Announcement | null>(announcement ?? null);
  const [dismissed, setDismissed] = useState(false);

  // Self-fetch only when the caller did not hand us the notice.
  useEffect(() => {
    if (announcement !== undefined) return;
    let live = true;
    void loadSiteState().then((state) => {
      if (live) setFetched(state.announcement);
    });
    return () => {
      live = false;
    };
  }, [announcement]);

  // Checked once per distinct notice, before paint, so a dismissed banner never
  // flashes back in.
  const key = fetched?.text ?? '';
  const seenDismissed = useMemo(() => (key.length > 0 && wasDismissed(key)), [key]);
  useEffect(() => setDismissed(seenDismissed), [seenDismissed]);

  if (announcement === null) return null;
  if (!fetched || !fetched.text) return null;
  if (dismissed) return null;

  const { text, href } = fetched;
  const marker = (
    <span aria-hidden="true" className="shrink-0 text-signal">
      →
    </span>
  );

  const body = (
    <>
      {marker}
      <span className="truncate">{text}</span>
    </>
  );

  return (
    <aside
      aria-label="Site announcement"
      className={`border-b border-line bg-ink ${className ?? ''}`.trim()}
    >
      <div className="shell flex items-center gap-3 py-2">
        {href ? (
          <a
            href={href}
            className="flex min-w-0 flex-1 items-center gap-3 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors duration-200 hover:text-paper"
          >
            {body}
          </a>
        ) : (
          <p className="flex min-w-0 flex-1 items-center gap-3 font-mono text-[11px] uppercase tracking-wide text-muted">
            {body}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            rememberDismissal(text);
          }}
          aria-label={`Dismiss announcement: ${text}`}
          className="shrink-0 px-1 font-mono text-xs leading-none text-muted transition-colors duration-200 hover:text-paper"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </aside>
  );
}