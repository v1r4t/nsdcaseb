import { useEffect, useState } from 'react';
import { eventSharePayload, eventShareUrl } from '../lib/share';

interface ShareEventProps {
  eventId: string;
  eventTitle: string;
}

/**
 * Post-registration invite. Shares the canonical public event page through the
 * native sheet when available and always offers copy-to-clipboard.
 */
export default function ShareEvent({ eventId, eventTitle }: ShareEventProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = eventShareUrl(eventId, window.location.origin);
  const canNativeShare = typeof navigator.share === 'function';

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLink(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch {
      setError('Could not copy — use your browser’s address bar.');
    }
  }

  async function share(): Promise<void> {
    try {
      await navigator.share(eventSharePayload(eventTitle, url));
    } catch (err) {
      // Dismissing the native sheet is a normal choice, not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Could not open the share sheet — copy the link instead.');
    }
  }

  return (
    <section aria-label="Share this event" className="mt-10 border-t border-line pt-6">
      <p className="label">Know someone who&rsquo;d love this?</p>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-paper/70">
        Send them the event page — they can register in a minute.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canNativeShare && (
          <button type="button" onClick={() => void share()} className="btn-primary">
            Share event
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyLink()}
          className={canNativeShare ? 'btn-ghost' : 'btn-primary'}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-3 min-h-5 font-mono text-[11px] uppercase tracking-wide text-signal"
      >
        {copied ? 'Link copied.' : (error ?? '')}
      </p>
    </section>
  );
}
