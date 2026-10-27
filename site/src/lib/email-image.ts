/**
 * Client-side compression for optional broadcast images.
 *
 * Mail images are re-encoded once, in the admin's browser, so an 8 MB worker
 * limit is never hit by a 12 MP phone photo. Output is always JPEG (the worker
 * accepts JPEG/PNG), capped at 1200px wide and never upscaled.
 */

export const EMAIL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const EMAIL_IMAGE_MAX_WIDTH = 1200;
export const EMAIL_IMAGE_QUALITY = 0.82;

export class EmailImageError extends Error {
  readonly code: 'not_an_image' | 'too_large' | 'decode_failed' | 'canvas_unavailable' | 'encode_failed';

  constructor(code: EmailImageError['code'], message: string) {
    super(message);
    this.name = 'EmailImageError';
    this.code = code;
  }
}

/** Validate type/size before touching the decoder. Exported for tests. */
export function assertEmailImageSource(file: Blob): void {
  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/')) {
    throw new EmailImageError('not_an_image', 'That file is not an image.');
  }
  if (file.size > EMAIL_IMAGE_MAX_BYTES) {
    throw new EmailImageError('too_large', 'That image is over 10 MB. Choose a smaller file.');
  }
}

/** Target canvas size: capped width, aspect preserved, never upscaled. */
export function emailImageSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  if (safeWidth <= EMAIL_IMAGE_MAX_WIDTH) return { width: safeWidth, height: safeHeight };
  const scale = EMAIL_IMAGE_MAX_WIDTH / safeWidth;
  return { width: EMAIL_IMAGE_MAX_WIDTH, height: Math.max(1, Math.round(safeHeight * scale)) };
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> decoder (older Safari, odd MIME types).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new EmailImageError('decode_failed', 'Could not read that image.'));
      el.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    if (err instanceof EmailImageError) throw err;
    throw new EmailImageError('decode_failed', 'Could not read that image.');
  }
}

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || (blob.type && blob.type !== 'image/jpeg')) {
          reject(new EmailImageError('encode_failed', 'Could not encode that image as JPEG.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      EMAIL_IMAGE_QUALITY,
    );
  });
}

/**
 * Decode, resize and re-encode a user-picked image as JPEG. Rejects with an
 * `EmailImageError` whose message is safe to show next to the picker.
 */
export async function compressEmailImage(file: File): Promise<Blob> {
  assertEmailImageSource(file);

  let image: DecodedImage;
  try {
    image = await decodeImage(file);
  } catch (err) {
    throw err instanceof EmailImageError
      ? err
      : new EmailImageError('decode_failed', 'Could not read that image.');
  }

  try {
    if (image.width < 1 || image.height < 1) {
      throw new EmailImageError('decode_failed', 'That image has no readable dimensions.');
    }
    const size = emailImageSize(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new EmailImageError('canvas_unavailable', 'Image compression is unavailable here.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // JPEG has no alpha; match the mail card instead of falling back to black.
    ctx.fillStyle = '#151517';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(image.source, 0, 0, size.width, size.height);
    return await encodeJpeg(canvas);
  } finally {
    image.close();
  }
}
