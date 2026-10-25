/**
 * Unit tests for the pure delivery-result mapping in site/src/lib/admin.ts.
 * No network: these cover only how the Email tab explains a worker envelope.
 */
import { describe, expect, it } from 'vitest';
import { describeEmailTest } from './admin';

describe('describeEmailTest', () => {
  it('reports the Resend message id on delivery', () => {
    const copy = describeEmailTest({ ok: true, delivered: true, detail: 'abc-123' });
    expect(copy.tone).toBe('delivered');
    expect(copy.text).toBe('Sent (id abc-123). Check the inbox.');
  });

  it('falls back to a plain sent message when the provider returned no id', () => {
    const copy = describeEmailTest({ ok: true, delivered: true, detail: 'sent' });
    expect(copy.tone).toBe('delivered');
    expect(copy.text).toBe('Sent. Check the inbox.');
  });

  it('explains a missing RESEND_API_KEY without calling it a provider error', () => {
    const copy = describeEmailTest({ ok: true, delivered: false, detail: 'not-configured' });
    expect(copy.tone).toBe('not-configured');
    expect(copy.text).toContain('Not configured');
    expect(copy.text).toContain('RESEND_API_KEY');
  });

  it('surfaces a provider 4xx with the likely domain/sender cause', () => {
    const copy = describeEmailTest({ ok: true, delivered: false, detail: 'resend:403' });
    expect(copy.tone).toBe('error');
    expect(copy.text).toContain('HTTP 403');
    expect(copy.text).toContain('MAIL_FROM');
  });

  it('separates a transport failure from a provider rejection', () => {
    const copy = describeEmailTest({ ok: true, delivered: false, detail: 'send-failed' });
    expect(copy.tone).toBe('error');
    expect(copy.text).toContain('Could not reach');
  });

  it('keeps an unknown detail visible instead of hiding it', () => {
    const copy = describeEmailTest({ ok: true, delivered: false, detail: 'weird' });
    expect(copy.tone).toBe('error');
    expect(copy.text).toBe('Not delivered (weird).');
  });
});
