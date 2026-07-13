import assert from 'node:assert/strict';
import test from 'node:test';

test('uses WebP for responsive Next images', async () => {
  process.env.NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL =
    'https://resizer.example.com';
  const { mediaImageLoader } = await import('../../src/lib/media');

  assert.equal(
    mediaImageLoader({
      quality: 75,
      src: 'media/photos/photo-1/asset-1/original.jpg',
      width: 1920,
    }),
    'https://resizer.example.com/media/photos/photo-1/asset-1/original.jpg?format=webp&quality=75&width=1920',
  );
});

test('prewarm widths cover responsive media candidates', async () => {
  const { MEDIA_PREWARM_WIDTHS } = await import('../../src/lib/media');

  assert.deepEqual(
    MEDIA_PREWARM_WIDTHS,
    [128, 256, 480, 640, 828, 1080, 1200, 1920, 2048],
  );
});

test('prewarms the browser image cache variant', async () => {
  process.env.NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL =
    'https://resizer.example.com';
  const originalFetch = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(init ?? {});
    return new Response(new Uint8Array([1]), {
      headers: { 'content-type': 'image/webp' },
      status: 200,
    });
  };

  try {
    const { prewarmMediaVariants } = await import('../../src/lib/media');
    await prewarmMediaVariants({
      key: 'media/photos/photo-1/asset-1/original.jpg',
      widths: [480],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.equal(
    new Headers(requests[0].headers).get('accept'),
    'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  );
});

test('prewarms explicit JPEGs for non-browser consumers', async () => {
  process.env.NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL =
    'https://resizer.example.com';
  const originalFetch = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(init ?? {});
    return new Response(new Uint8Array([1]), { status: 200 });
  };

  try {
    const { prewarmMediaVariants } = await import('../../src/lib/media');
    await prewarmMediaVariants({
      format: 'jpeg',
      key: 'media/photos/photo-1/asset-1/original.jpg',
      widths: [1200],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(new Headers(requests[0].headers).get('accept'), '*/*');
});

test('prewarms each responsive width only once', async () => {
  process.env.NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL =
    'https://resizer.example.com';
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(new Uint8Array([1]), { status: 200 });
  };

  try {
    const { prewarmMediaVariants } = await import('../../src/lib/media');
    await prewarmMediaVariants({
      key: 'media/photos/photo-1/asset-1/original.jpg',
      widths: [480, 480],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests, 1);
});

test('retries a timed-out browser image transform', async () => {
  process.env.NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL =
    'https://resizer.example.com';
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(new Uint8Array([1]), {
      status: attempts === 1 ? 504 : 200,
    });
  };

  try {
    const { prewarmMediaVariants } = await import('../../src/lib/media');
    await prewarmMediaVariants({
      key: 'media/photos/photo-1/asset-1/original.jpg',
      retryDelaysMs: [0],
      widths: [1920],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(attempts, 2);
});
