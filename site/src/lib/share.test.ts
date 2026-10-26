import { describe, expect, it } from 'vitest';
import { eventSharePayload, eventShareUrl } from './share';

describe('eventShareUrl', () => {
  it('builds the public event page URL from the current origin', () => {
    expect(eventShareUrl('evt-2026', 'https://nsdcaseb.xyz')).toBe(
      'https://nsdcaseb.xyz/registrations/evt-2026',
    );
  });

  it('does not leave a double slash and encodes the id', () => {
    expect(eventShareUrl('a b/c', 'https://preview.nsdcaseb.xyz/')).toBe(
      'https://preview.nsdcaseb.xyz/registrations/a%20b%2Fc',
    );
  });
});

describe('eventSharePayload', () => {
  it('shares a titled invite that points at the event', () => {
    const url = 'https://nsdcaseb.xyz/registrations/evt-2026';
    expect(eventSharePayload('Build Night', url)).toEqual({
      title: 'Build Night — NSDC',
      text: 'Join me at Build Night.',
      url,
    });
  });
});
