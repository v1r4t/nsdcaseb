/**
 * Client-side event-poster variants.
 *
 * Posters are resized once, in the admin's browser, at upload time. The worker
 * stores the resulting WebP blobs next to the original and the public pages
 * serve them with plain `srcset` — no Supabase image transforms and no
 * Cloudflare Images.
 *
 * Conventions (must match worker/supabase-storage.ts):
 *   events/{id}/poster.webp        original, exactly as the admin uploaded it
 *   events/{id}/poster-thumb.webp  640w  WebP, never upscaled
 *   events/{id}/poster-full.webp   1600w WebP, never upscaled
 */

export const POSTER_THUMB_WIDTH = 640;
export const POSTER_FULL_WIDTH = 1600;
export const POSTER_VARIANT_QUALITY = 0.82;

/** Blobs produced by `generatePosterVariants`, ready to append to FormData. */
export interface PosterVariantBlobs {
  thumb: Blob;
  full: Blob;
  /** Width of the encoded thumb (<= POSTER_THUMB_WIDTH; never upscaled). */
  thumbWidth: number;
  /** Width of the encoded full variant (<= POSTER_FULL_WIDTH). */
  fullWidth: number;
}

/** URL pair as returned by the events API (`poster_variants`). */
export interface PosterVariantUrls {
  thumb: string;
  full: string;
}

export class PosterVariantError extends Error {
  readonly code: 'not_an_image' | 'decode_failed' | 'canvas_unavailable' | 'encode_failed';

  constructor(code: PosterVariantError['code'], message: string) {
    super(message);
    this.name = 'PosterVariantError';
    this.code = code;
  }
}

/**
 * Fit `width` down to `targetWidth`, preserving aspect. A source already at or
 * below the target is returned unchanged (no upscaling).
 */
export function scaledSize(
  width: number,
  height: number,
  targetWidth: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  if (safeWidth <= targetWidth) return { width: safeWidth, height: safeHeight };
  const scale = targetWidth / safeWidth;
  return { width: targetWidth, height: Math.max(1, Math.round(safeHeight * scale)) };
}

/** `srcset` for the stored variants; undefined when there are no variants. */
export function posterVariantSrcSet(
  variants: PosterVariantUrls | null | undefined,
): string | undefined {
  if (!variants?.thumb || !variants?.full) return undefined;
  return `${variants.thumb} ${POSTER_THUMB_WIDTH}w, ${variants.full} ${POSTER_FULL_WIDTH}w`;
}

export interface PosterImageSources {
  src: string;
  srcSet: string | undefined;
}

/**
 * Sources for an event poster.
 *
 * `src` stays the original so browsers without `srcset` (and the no-JS
 * fallback) keep working. When variants exist the browser prefers them; if
 * they are missing — e.g. a poster uploaded before the variant pipeline — the
 * page can drop `srcSet` on the image's error event and the original loads.
 */
export function posterSources(
  posterUrl: string | null | undefined,
  variants: PosterVariantUrls | null | undefined,
): PosterImageSources | null {
  if (!posterUrl) return null;
  const srcSet = posterVariantSrcSet(variants);
  return srcSet ? { src: posterUrl, srcSet } : { src: posterUrl, srcSet: undefined };
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
      el.onerror = () => reject(new PosterVariantError('decode_failed', 'Could not read that image.'));
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
    if (err instanceof PosterVariantError) throw err;
    throw new PosterVariantError('decode_failed', 'Could not read that image.');
  }
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PosterVariantError('canvas_unavailable', 'Image resizing is unavailable here.');
  return ctx;
}

function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new PosterVariantError('encode_failed', 'Could not encode the image as WebP.'));
          return;
        }
        // Browsers without WebP encoding quietly fall back to PNG; do not
        // upload PNG bytes under a `.webp` key.
        if (blob.type && blob.type !== 'image/webp') {
          reject(new PosterVariantError('encode_failed', 'This browser cannot encode WebP.'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      POSTER_VARIANT_QUALITY,
    );
  });
}

async function renderVariant(
  image: DecodedImage,
  targetWidth: number,
): Promise<{ blob: Blob; width: number }> {
  const size = scaledSize(image.width, image.height, targetWidth);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvasContext(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, size.width, size.height);
  return { blob: await encodeWebp(canvas), width: size.width };
}

/**
 * Generate the 640w thumb and capped-1600w full WebP blobs for a poster.
 *
 * Source images smaller than a breakpoint are encoded at their native width —
 * the pipeline never upscales a poster.
 */
export async function generatePosterVariants(file: Blob): Promise<PosterVariantBlobs> {
  const type = (file.type || '').toLowerCase();
  if (type && !type.startsWith('image/')) {
    throw new PosterVariantError('not_an_image', 'That file is not an image.');
  }

  const image = await decodeImage(file);
  try {
    if (image.width < 1 || image.height < 1) {
      throw new PosterVariantError('decode_failed', 'That image has no readable dimensions.');
    }
    const thumb = await renderVariant(image, POSTER_THUMB_WIDTH);
    // A small source can land on the same native width for both buckets;
    // reuse the encoded blob instead of encoding it twice.
    const full = thumb.width === scaledSize(image.width, image.height, POSTER_FULL_WIDTH).width
      ? thumb
      : await renderVariant(image, POSTER_FULL_WIDTH);

    return {
      thumb: thumb.blob,
      full: full.blob,
      thumbWidth: thumb.width,
      fullWidth: full.width,
    };
  } finally {
    image.close();
  }
}
