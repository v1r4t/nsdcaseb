/**
 * Unit tests for broadcast-image validation and sizing. The decode/encode path
 * needs a real canvas, so it is covered by e2e instead.
 */
import { describe, expect, it } from 'vitest';
import {
  EMAIL_IMAGE_MAX_BYTES,
  EMAIL_IMAGE_MAX_WIDTH,
  EmailImageError,
  assertEmailImageSource,
  compressEmailImage,
  emailImageSize,
} from './email-image';

function fileOfSize(size: number, type: string): File {
  return new File([new Uint8Array(size)], 'image.jpg', { type });
}

describe('assertEmailImageSource', () => {
  it('rejects a non-image file before decoding', () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    expect(() => assertEmailImageSource(file)).toThrow(EmailImageError);
    try {
      assertEmailImageSource(file);
    } catch (err) {
      expect((err as EmailImageError).code).toBe('not_an_image');
      expect((err as EmailImageError).message).toContain('not an image');
    }
  });

  it('rejects a file with no MIME type', () => {
    const file = new File(['x'], 'photo', { type: '' });
    expect(() => assertEmailImageSource(file)).toThrow(/not an image/);
  });

  it('rejects images over 10 MB', () => {
    const file = fileOfSize(EMAIL_IMAGE_MAX_BYTES + 1, 'image/jpeg');
    try {
      assertEmailImageSource(file);
      throw new Error('expected a rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(EmailImageError);
      expect((err as EmailImageError).code).toBe('too_large');
      expect((err as EmailImageError).message).toContain('10 MB');
    }
  });

  it('accepts a JPEG at the limit', () => {
    expect(() => assertEmailImageSource(fileOfSize(EMAIL_IMAGE_MAX_BYTES, 'image/jpeg'))).not.toThrow();
    expect(() => assertEmailImageSource(fileOfSize(1024, 'image/png'))).not.toThrow();
  });
});

describe('compressEmailImage validation', () => {
  it('rejects a non-image without needing a canvas', async () => {
    await expect(compressEmailImage(new File(['x'], 'a.txt', { type: 'text/plain' }))).rejects.toBeInstanceOf(
      EmailImageError,
    );
  });

  it('rejects an oversized image without needing a canvas', async () => {
    await expect(
      compressEmailImage(fileOfSize(EMAIL_IMAGE_MAX_BYTES + 1, 'image/png')),
    ).rejects.toMatchObject({ code: 'too_large' });
  });
});

describe('emailImageSize', () => {
  it('caps wide images at 1200px and keeps the aspect ratio', () => {
    expect(emailImageSize(2400, 1200)).toEqual({ width: EMAIL_IMAGE_MAX_WIDTH, height: 600 });
    expect(emailImageSize(3000, 1000)).toEqual({ width: 1200, height: 400 });
  });

  it('never upscales a small image', () => {
    expect(emailImageSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(emailImageSize(1200, 1200)).toEqual({ width: 1200, height: 1200 });
  });

  it('never returns a zero dimension', () => {
    expect(emailImageSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(emailImageSize(2400, 1)).toEqual({ width: 1200, height: 1 });
  });
});
