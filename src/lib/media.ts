import type { ImageLoaderProps } from 'next/image';

import { DEFAULT_PUBLIC_MEDIA_URLS } from '@/modules/media/publicConfig';

const CLOUDFRONT_RESIZER_URL =
  process.env.NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL?.trim() ||
  DEFAULT_PUBLIC_MEDIA_URLS.transformed;
const CLOUDFRONT_S3_URL =
  process.env.NEXT_PUBLIC_CLOUDFRONT_S3_URL?.trim() ||
  DEFAULT_PUBLIC_MEDIA_URLS.originals;
const MEDIA_FETCH_TIMEOUT_MS = 20_000;

// Guard both environment overrides and the committed contract defaults: a
// silent empty host yields relative URLs that render as broken images.
function requireMediaHost(value: string, envName: string) {
  if (!value) {
    throw new Error(
      `Missing ${envName}: media URLs cannot be built without it.`,
    );
  }

  return value;
}

export const MEDIA_VARIANT_WIDTHS = {
  blur: 16,
  card: 480,
  noteCover: 1200,
  modal: 2048,
} as const;

// Keep in sync with the responsive candidates from images.imageSizes and
// images.deviceSizes in next.config.js. The browser may select any of these
// widths from next/image's generated srcset.
export const MEDIA_PREWARM_WIDTHS = [
  128, 256, 480, 640, 828, 1080, 1200, 1920, 2048,
] as const;
export const MEDIA_BROWSER_IMAGE_ACCEPT =
  'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
export const MEDIA_PREWARM_RETRY_DELAYS_MS = [5_000, 15_000] as const;

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

export function normalizeMediaKey(key: string) {
  return trimSlashes(key);
}

export function getMediaOriginalURL(key: string) {
  const host = requireMediaHost(
    CLOUDFRONT_S3_URL,
    'NEXT_PUBLIC_CLOUDFRONT_S3_URL',
  );

  return `${host}/${normalizeMediaKey(key)}`;
}

export function getMediaImageURL({
  key,
  width,
  quality = 75,
  format = 'webp',
}: {
  key: string;
  width: number;
  quality?: number;
  format?: 'auto' | 'jpeg' | 'webp' | 'avif' | 'png';
}) {
  const host = requireMediaHost(
    CLOUDFRONT_RESIZER_URL,
    'NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL',
  );
  const params = new URLSearchParams({
    format,
    quality: String(quality),
    width: String(width),
  });

  return `${host}/${normalizeMediaKey(key)}?${params}`;
}

export async function fetchMediaURL(
  url: string,
  init: RequestInit = {},
  timeoutMs = MEDIA_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out fetching media URL after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function prewarmMediaVariants({
  format = 'webp',
  key,
  retryDelaysMs = MEDIA_PREWARM_RETRY_DELAYS_MS,
  timeoutMs = MEDIA_FETCH_TIMEOUT_MS,
  widths,
  quality = 75,
}: {
  format?: 'auto' | 'jpeg' | 'webp' | 'avif' | 'png';
  key: string;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
  widths: number[];
  quality?: number;
}) {
  const accept = format === 'jpeg' ? '*/*' : MEDIA_BROWSER_IMAGE_ACCEPT;

  await Promise.all(
    [...new Set(widths)].map(async (width) => {
      const url = getMediaImageURL({ format, key, width, quality });
      let lastError: unknown;

      for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
        try {
          const response = await fetchMediaURL(
            url,
            {
              cache: 'no-store',
              headers: {
                Accept: accept,
              },
            },
            timeoutMs,
          );

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await response.arrayBuffer();
          return;
        } catch (error) {
          lastError = error;
          const retryDelayMs = retryDelaysMs[attempt];
          if (retryDelayMs === undefined) break;
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      throw new Error(
        `Failed to prewarm media variant ${normalizeMediaKey(key)} width=${width}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }),
  );
}

export function mediaImageLoader({ src, width, quality }: ImageLoaderProps) {
  return getMediaImageURL({
    key: src,
    width,
    quality,
  });
}

export function getMediaExtensionFromMimeType(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('avif')) return 'avif';

  return 'jpg';
}
