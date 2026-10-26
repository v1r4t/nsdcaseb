/** Canonical public URL for an event registration page. */
export function eventShareUrl(id: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/registrations/${encodeURIComponent(id)}`;
}

/** Web Share payload for inviting someone to an event. */
export function eventSharePayload(
  title: string,
  url: string,
): { title: string; text: string; url: string } {
  return {
    title: `${title} — NSDC`,
    text: `Join me at ${title}.`,
    url,
  };
}
