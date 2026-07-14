import { expect, test } from '@playwright/test';

const permanentRedirects = [
  ['/thoughts', '/field-notes'],
  ['/thoughts/e2e-note-01', '/field-notes/e2e-note-01'],
  ['/gallery', '/darkroom'],
  ['/gallery/landscape-full-exif', '/darkroom/landscape-full-exif'],
  ['/projects', '/the-lab'],
  ['/projects/slurmdeck', '/the-lab/slurmdeck'],
  ['/projects/slurmdeck-tui.svg', '/assets/slurmdeck-tui.svg'],
] as const;

test('retired public routes use direct permanent redirects', async ({
  request,
}) => {
  for (const [source, destination] of permanentRedirects) {
    const response = await request.get(source, { maxRedirects: 0 });

    expect(response.status(), source).toBe(308);
    expect(
      new URL(response.headers().location, 'http://localhost').pathname,
    ).toBe(destination);
  }
});

test('redirect targets are live and the sitemap contains only canonical venues', async ({
  request,
}) => {
  for (const target of [
    '/field-notes/e2e-note-01',
    '/darkroom/landscape-full-exif',
    '/the-lab/slurmdeck',
    '/assets/slurmdeck-tui.svg',
  ]) {
    expect((await request.get(target)).ok(), target).toBe(true);
  }

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).not.toContain('/thoughts');
  expect(sitemap).not.toContain('/gallery');
  expect(sitemap).not.toContain('/projects');
  expect(sitemap).toContain('/field-notes');
  expect(sitemap).toContain('/darkroom');
  expect(sitemap).toContain('/the-lab');
});
