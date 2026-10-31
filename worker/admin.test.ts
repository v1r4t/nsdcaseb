// @vitest-environment node
/**
 * Table tests for the worker's bearer `photo_url` validator. This is the
 * server-side gate for `POST/PATCH /api/content/bearers`; the client-side twin
 * (`parsePhotoUrl` in AdminContent) mirrors the same rules, so drift here is a
 * security/UX bug rather than a cosmetic one.
 */
import { describe, expect, it } from 'vitest';
import { validPhotoUrl } from './admin';

type Result = { ok: true; value: string | null } | { ok: false };

interface Case {
  name: string;
  input: unknown;
  expected: Result;
}

const MAX = 2048;
const BASE = 'https://example.com/';

/** A URL of exactly `length` characters, all of it a valid https path. */
function urlOfLength(length: number): string {
  expect(length).toBeGreaterThanOrEqual(BASE.length);
  return BASE + 'a'.repeat(length - BASE.length);
}

const CASES: Case[] = [
  // Clearing the field: absent, empty and whitespace-only all mean "no photo".
  { name: 'undefined clears the field', input: undefined, expected: { ok: true, value: null } },
  { name: 'null clears the field', input: null, expected: { ok: true, value: null } },
  { name: 'empty string clears the field', input: '', expected: { ok: true, value: null } },
  { name: 'whitespace-only clears the field', input: '   \n\t ', expected: { ok: true, value: null } },

  // Wrong types and unsupported schemes are rejected outright.
  { name: 'number is rejected', input: 42, expected: { ok: false } },
  { name: 'object is rejected', input: { url: BASE }, expected: { ok: false } },
  { name: 'javascript: is rejected', input: 'javascript:alert(1)', expected: { ok: false } },
  { name: 'JaVaScRiPt: is rejected', input: 'JaVaScRiPt:alert(1)', expected: { ok: false } },
  { name: 'data: is rejected', input: 'data:image/png;base64,AAAA', expected: { ok: false } },
  { name: 'ftp: is rejected', input: 'ftp://example.com/portrait.jpg', expected: { ok: false } },
  { name: 'file: is rejected', input: 'file:///C:/portrait.jpg', expected: { ok: false } },
  { name: 'protocol-relative URL is rejected', input: '//example.com/portrait.jpg', expected: { ok: false } },
  { name: 'bare host is rejected', input: 'example.com/portrait.jpg', expected: { ok: false } },
  { name: 'relative path is rejected', input: '/media/portrait.jpg', expected: { ok: false } },

  // Length cap is inclusive at 2048 and exclusive above it.
  { name: '2049 characters is rejected', input: urlOfLength(MAX + 1), expected: { ok: false } },
  { name: '2048 characters is accepted', input: urlOfLength(MAX), expected: { ok: true, value: urlOfLength(MAX) } },
  {
    name: 'long-but-clearable whitespace still clears (length checked after trim)',
    input: `  ${urlOfLength(MAX)}  `,
    expected: { ok: true, value: urlOfLength(MAX) },
  },

  // Accepted URLs are normalised through the URL parser and returned trimmed.
  {
    name: 'https URL is accepted and normalised',
    input: 'https://example.com/portrait.jpg',
    expected: { ok: true, value: 'https://example.com/portrait.jpg' },
  },
  {
    name: 'http URL is accepted',
    input: 'http://example.com/portrait.jpg',
    expected: { ok: true, value: 'http://example.com/portrait.jpg' },
  },
  {
    name: 'surrounding whitespace is trimmed',
    input: '  https://example.com/portrait.jpg  ',
    expected: { ok: true, value: 'https://example.com/portrait.jpg' },
  },
  {
    name: 'scheme and host are lower-cased, path case is preserved',
    input: 'HTTPS://Example.COM/Portrait.JPG',
    expected: { ok: true, value: 'https://example.com/Portrait.JPG' },
  },
  {
    name: 'a bare origin gains its trailing slash',
    input: 'https://example.com',
    expected: { ok: true, value: 'https://example.com/' },
  },
  {
    name: 'spaces in the path are percent-encoded',
    input: 'https://example.com/team portrait.jpg',
    expected: { ok: true, value: 'https://example.com/team%20portrait.jpg' },
  },
  {
    name: 'credentials in the URL are preserved by the parser',
    input: 'https://user:pass@example.com/portrait.jpg',
    expected: { ok: true, value: 'https://user:pass@example.com/portrait.jpg' },
  },
];

describe('validPhotoUrl', () => {
  it.each(CASES)('$name', ({ input, expected }) => {
    expect(validPhotoUrl(input)).toEqual(expected);
  });
});
