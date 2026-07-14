import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

type SitemapEntry = {
  images: string[];
  url: string;
};

test('sitemap publishes canonical content images as valid image XML', async ({
  page,
  request,
}) => {
  const response = await request.get('/sitemap.xml');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/xml');

  const xml = await response.text();
  expect(xml).toContain(
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
  );
  expect(xml).toContain(
    'format=webp&amp;quality=75&amp;width=2048</image:loc>',
  );
  expect(xml).not.toMatch(/<image:loc>[^<]*&(?!amp;|#\d+;|#x[\da-f]+;)/i);

  const parsed = await page.evaluate((source): SitemapEntry[] => {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    if (document.querySelector('parsererror')) {
      throw new Error('Sitemap is not valid XML.');
    }

    return Array.from(
      document.getElementsByTagNameNS(
        'http://www.sitemaps.org/schemas/sitemap/0.9',
        'url',
      ),
    ).map((entry) => ({
      images: Array.from(
        entry.getElementsByTagNameNS(
          'http://www.google.com/schemas/sitemap-image/1.1',
          'loc',
        ),
      ).map((image) => image.textContent ?? ''),
      url:
        Array.from(entry.children).find(
          (child) =>
            child.localName === 'loc' &&
            child.namespaceURI ===
              'http://www.sitemaps.org/schemas/sitemap/0.9',
        )?.textContent ?? '',
    }));
  }, xml);

  const photoEntries = parsed.filter(({ url }) =>
    new URL(url).pathname.startsWith('/darkroom/'),
  );
  expect(photoEntries).toHaveLength(40);
  for (const entry of photoEntries) {
    expect(entry.images).toHaveLength(1);
    const image = new URL(entry.images[0]);
    expect(image.searchParams.get('format')).toBe('webp');
    expect(image.searchParams.get('quality')).toBe('75');
    expect(image.searchParams.get('width')).toBe('2048');
  }

  const noteEntries = parsed.filter(({ url }) =>
    new URL(url).pathname.startsWith('/field-notes/'),
  );
  expect(noteEntries).toHaveLength(14);
  for (const entry of noteEntries) {
    expect(entry.images).toHaveLength(1);
    const image = new URL(entry.images[0]);
    expect(image.searchParams.get('format')).toBe('webp');
    expect(image.searchParams.get('quality')).toBe('75');
    expect(image.searchParams.get('width')).toBe('1200');
  }

  const project = parsed.find(
    ({ url }) => new URL(url).pathname === '/the-lab/slurmdeck',
  );
  expect(project?.images).toEqual([
    'https://dejayvu.com/assets/slurmdeck-tui.svg',
  ]);

  for (const path of ['/', '/field-notes', '/darkroom', '/the-lab']) {
    expect(
      parsed.find(({ url }) => new URL(url).pathname === path)?.images,
    ).toEqual([]);
  }

  const representativePhoto = photoEntries[0];
  await installMediaRoute(page);
  await page.goto(new URL(representativePhoto.url).pathname);
  const jsonLd = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  )
    .map((value) => JSON.parse(value))
    .find(({ '@type': type }) => type === 'ImageObject');
  const detailImageUrl = await page
    .locator('article figure img')
    .evaluate((node) => (node as HTMLImageElement).src);

  expect(jsonLd?.contentUrl).toBe(representativePhoto.images[0]);
  expect(detailImageUrl).toBe(representativePhoto.images[0]);
});
